# Design: Data Import/Export (Backup & Restore)

**Date:** 2026-11-02
**Status:** Approved

---

## Summary

Rename the Settings section **"Data Export"** to **"Data Import/Export"** and turn it into a per-user backup and restore tool:

- **Download backup (JSON)**: one readable, pretty-printed file with the user's products (ASINs + metadata), full price history, and product lists. This is the only restorable format.
- **Export price history (CSV)**: export-only, spreadsheet-friendly, one row per price point.
- **Restore from backup**: upload a backup JSON. The server **validates first** (file format, version, every record, quotas, live DB schema) and shows a report of incompatibilities plus a preview. Then the user restores in **Merge** (default) or **Replace everything** mode. Replace sits behind a confirmation.

## Intent

A user backs up their own tracked data and can later restore it, possibly onto the same server after a mistake or onto a fresh install. The file belongs to the user, so it should be readable in a text editor. Restoring must never destroy data silently, and it must never half-apply.

## Goals

1. Rename the section to "Data Import/Export" (en + pt-BR).
2. Export the user's products, price history, and lists as one JSON file the user downloads.
3. Export the user's price history as CSV for spreadsheets.
4. Import a backup JSON with server-side validation **before** any write, plus a user-readable report of every incompatibility found.
5. Merge mode adds what's missing and never deletes or overwrites.
6. Replace mode wipes the user's products, history, and lists, then loads the backup. It runs only after an explicit confirmation showing what will be deleted.
7. All restore writes happen in one transaction: all or nothing.
8. Restrict the full-database file export to admins.

## Non-goals

- Restoring notification channels, rules, or logs. Channels hold secrets (bot tokens, SMTP credentials), and rules reference channels by ID.
- Restoring the scrape schedule or any account settings.
- Sharing data between users, or admin export/import of other users' data.
- Restoring from CSV, or from the existing ASIN-only CSV. (The Products page's existing "Import ASINs" re-scrape flow stays as is.)
- Re-scraping Amazon during restore. The file's data is the record.

## Anti-goals (failure even if it "works")

- A restore that partially applies after an error.
- Merge mode modifying or deleting any existing row.
- Replace mode running without the user seeing counts of what is deleted.
- One user's restore reading or touching another user's rows.
- A backup containing secrets (password hashes, channel configs).

---

## Current state (relevant facts)

| Thing | Where | Notes |
|---|---|---|
| Section component | `frontend/src/components/config/DataExportSection.tsx` | One "Export ASINs" button calling `fetch('/api/config/export-asins')` directly |
| Section registration | `frontend/src/components/SettingsPage.tsx:34` | `{ id: 'data-export', labelKey: 'config.dataExport', icon: Download }` |
| Dashboard tile | `frontend/src/components/config/DashboardSection.tsx:54-60` | Uses `config.dataExport` / `config.exportDescription` |
| Legacy settings | `frontend/src/components/config/index.tsx` | Imports and renders `DataExportSection`; nothing imports this file, but `tsc` compiles all of `src`. Update its import when the component is renamed. Don't delete or refactor it. |
| i18n | `frontend/src/i18n/locales/{en,pt-BR}.json` `config.*` | `dataExport` = "Data Export" / "Exportação de Dados" |
| ASIN export/import routes | `backend/src/routes/config.ts:14,37` | Import re-scrapes via Playwright, SSE progress |
| Schema / migrations | `backend/src/services/db/migrations.ts` | No schema version stored; migrations inspect `PRAGMA table_info` |
| Product/list repos | `backend/src/services/db/product-repo.ts`, `list-repo.ts` | Callback sqlite3 wrapped in `dbRun/dbAll/dbGet` (`db/helpers.ts`) |
| Body parser | `backend/src/server.ts:33` | `express.json()`: default **100 KB** limit |

**Constraints discovered:**

- **Foreign keys are not enforced.** `PRAGMA foreign_keys` is never turned on, so `ON DELETE CASCADE` never fires. `deleteProduct` deletes `price_history` by hand. Replace mode must delete every dependent table explicitly.
- **No transaction helper exists.** One shared `sqlite3.Database` connection serves all requests. A `BEGIN` on it would capture other requests' statements in the same transaction.
- **Quotas:** `quota_max_products` (default 100) is enforced in `addProduct`, and `quota_max_lists` (default 20) in `createList` (both via `system_config`). Restore must respect them.
- **Categories are global** (`categories.name UNIQUE`). They're linked via `product_categories(product_id, category_id, level)`. Use the existing `getOrCreateCategory` semantics.
- **Price rows:** `price REAL NULL`, `available BOOLEAN`, `unavailable_reason TEXT`, `date DATETIME`. They're stored as SQLite `CURRENT_TIMESTAMP` text (`YYYY-MM-DD HH:MM:SS`, UTC).
- `products UNIQUE(user_id, asin)`. `user_lists` has no unique name constraint. The lists route's 409 "name exists" handling is dead code, so duplicate list names can exist.

---

## Approaches considered

| | Approach | Trade-off |
|---|---|---|
| **A (chosen)** | Two stateless endpoints. `POST /backup/validate` returns a report and preview and writes nothing. `POST /backup/restore` re-runs the same validation, then applies everything in one transaction. | The file is uploaded twice (fine for a backup). One validation implementation, easy to unit test. No server state. |
| B | Validate in the browser, single restore endpoint | Faster feedback, but the server must re-validate anyway, so the logic gets duplicated and drifts. |
| C | Upload once, server stages the file under a token, then confirm | Saves a second upload, but adds temp storage, expiry, and cleanup. |

**Chosen: A.** One source of truth for validation, nothing to clean up, and the preview can't diverge from what the restore does.

File format alternatives considered: single JSON, zip of CSVs, XLSX, flat CSV, per-user SQLite file, gzipped JSON. **Chosen:** single pretty-printed JSON for restore (most reliable round trip, readable, versionable, no new dependencies) **plus** a separate export-only CSV for spreadsheet use.

---

## Design

### 1. Backup file format (v1)

Filename: `amzscraper-backup-<username>-<YYYY-MM-DD>.json`. UTF-8, `JSON.stringify(obj, null, 2)`.

```json
{
  "format": "amzscraper-backup",
  "formatVersion": 1,
  "exportedAt": "2026-11-02T14:03:11Z",
  "appVersion": "1.0.0",
  "username": "fabio",
  "counts": { "products": 2, "priceHistory": 3, "lists": 1 },
  "lists": [
    { "name": "Wishlist", "createdAt": "2026-01-10T09:00:00Z" }
  ],
  "products": [
    {
      "asin": "B0ABCDEF12",
      "description": "Product title",
      "imageUrl": "https://m.media-amazon.com/...jpg",
      "createdAt": "2026-01-10T09:05:00Z",
      "categories": ["Eletrônicos", "Fones de Ouvido"],
      "lists": ["Wishlist"],
      "priceHistory": [
        { "date": "2026-01-10T09:05:00Z", "price": 199.9, "available": true,  "unavailableReason": null },
        { "date": "2026-01-11T09:00:00Z", "price": null,  "available": false, "unavailableReason": "Out of stock" }
      ]
    }
  ]
}
```

Rules:
- **No database IDs** anywhere. Products are keyed by `asin`, and lists by `name`. Product to list links use list names.
- `categories` is ordered by `level` ascending (index = level).
- Dates are ISO 8601 UTC with `Z` on export. On import, any ISO 8601 string with an offset is accepted and normalized to UTC `YYYY-MM-DD HH:MM:SS` for storage.
- `priceHistory` is sorted by `date` ascending. Products are sorted by `asin`, and lists by `name`, so diffs between backups are stable.
- `appVersion` comes from `backend/package.json` and is informational. `formatVersion` drives compatibility.
- `username` and `counts` are informational and shown in the preview. A count mismatch with the actual arrays produces a **warning**.

### 2. Backend

New module `backend/src/services/backup/` (or a single `backup.ts` if small; builder's call), split into:

- **`backup-format.ts`**: TypeScript types for the v1 file, `CURRENT_FORMAT_VERSION = 1`, and `SUPPORTED_FORMAT_VERSIONS = [1]`.
- **`backup-validate.ts`**: `validateBackup(input: unknown, ctx) → ValidationReport`. A **pure function** over the parsed JSON plus a context `{ existingAsins, existingListNames, existingPriceKeys, quotas, existingNotificationRuleCountForProducts }`. It has no DB access, so it unit-tests easily.
- **`backup-service.ts`**: `buildBackup(userId)`, `buildPriceHistoryCsv(userId, locale)`, `loadValidationContext(userId)`, `checkLiveSchema()`, `restore(userId, backup, mode)`.

#### Routes (in `backend/src/routes/config.ts`, under the existing `authenticate`)

| Method | Path | Behavior |
|---|---|---|
| GET | `/api/config/backup/export` | Returns JSON with `Content-Disposition: attachment` |
| GET | `/api/config/backup/export-csv?locale=en\|pt-BR` | Returns CSV attachment |
| POST | `/api/config/backup/validate` | Body: `{ backup: <object> }`. Returns `ValidationReport` (200 even when incompatible; 4xx only for transport errors) |
| POST | `/api/config/backup/restore` | Body: `{ backup, mode: 'merge' \| 'replace', confirmReplace?: true, expected: <preview for mode> }`. Re-validates. Errors → 422 with the report. `replace` without `confirmReplace: true` → 400. Price update running → 409 `UPDATE_IN_PROGRESS`. Preview drift → 409 `DATA_CHANGED` + fresh report. Success → `RestoreResult` |

Keep the existing `GET /export-asins` route unchanged.

**Body size:** mount `app.use('/api/config/backup', express.json({ limit: '25mb' }))` in `server.ts` **before** the global `express.json()`. The global parser skips bodies that are already parsed. The rest of the API keeps 100 KB. (Sizing: 100 products × 3 years of daily points ≈ 110k rows ≈ 12–15 MB pretty-printed.) A 413 maps to a clear "file too large (max 25 MB)" message in the UI.

#### Validation report

```ts
type Issue = {
  severity: 'error' | 'warning';
  code: string;            // stable, used for i18n: e.g. 'INVALID_ASIN'
  path: string;            // JSON path, e.g. 'products[3].priceHistory[12].price'
  params?: Record<string, string | number>;  // for message interpolation
};

type ValidationReport = {
  compatible: boolean;     // false if any error
  fileInfo: { formatVersion?: number; appVersion?: string; exportedAt?: string; username?: string;
              counts: { products: number; priceHistory: number; lists: number } };
  issues: Issue[];         // capped at 500 returned; issueTotals gives full counts
  issueTotals: { errors: number; warnings: number };
  preview: {
    merge:   { productsAdded: number; productsSkippedExisting: number;
               pricePointsAdded: number; pricePointsSkippedDuplicate: number;
               listsAdded: number; listsMatched: number; membershipsAdded: number };
    replace: { productsDeleted: number; pricePointsDeleted: number; listsDeleted: number;
               notificationRulesDeleted: number;
               productsAdded: number; pricePointsAdded: number; listsAdded: number };
  };
  quotaOk: { merge: boolean; replace: boolean };
};
```

The UI renders `code` + `params` via i18n (`config.backup.issues.<CODE>`), so messages exist in both en and pt-BR.

#### Checks (all run before any write, in this order)

**Server schema preflight (`checkLiveSchema`)**: covers "verify database structure". Use `PRAGMA table_info` to confirm that `products`, `price_history`, `user_lists`, `product_lists`, `categories`, and `product_categories` exist with the columns the restore writes. Failure → error `SERVER_SCHEMA_MISMATCH` (params: table, missing column). This blocks validation and restore, and is logged server-side.

**File-level (errors; stop deeper checks if any fail):**
- `NOT_JSON`: body/file isn't valid JSON (the client also detects this before upload).
- `WRONG_FORMAT`: `format !== 'amzscraper-backup'`.
- `UNSUPPORTED_VERSION`: `formatVersion` missing or not in `SUPPORTED_FORMAT_VERSIONS`. If it's higher than current, the message says "created by a newer version of the app".
- `MISSING_FIELD` / `WRONG_TYPE`: missing or wrongly typed top-level `lists` or `products` arrays.

**Record-level errors:**
- `INVALID_ASIN`: fails `validateASIN(normalizeASIN(x))` (reuse `backend/src/utils/validation`).
- `DUPLICATE_ASIN`: same ASIN twice in the file.
- `MISSING_DESCRIPTION`: empty or non-string description.
- `INVALID_DATE`: unparsable `date` / `createdAt`.
- `INVALID_PRICE`: not a finite number ≥ 0 and not null.
- `INVALID_AVAILABLE`: `available` not a boolean.
- `INVALID_LIST_NAME`: empty after trim, or longer than **100 characters**. The lists route has no length limit today (it only checks for non-empty); this limit applies to import only. Don't change the lists route.
- `DUPLICATE_LIST_NAME`: same name twice in `lists`.
- `QUOTA_EXCEEDED`: per mode, with params `{ kind: 'products'|'lists', limit, resulting }`. Merge: fails only if it **creates** new products/lists **and** existing + created > quota. A user already over quota (an admin lowered it) can still merge price points and memberships into what they have. Replace: file count > quota. This only blocks the mode that exceeds the quota; `quotaOk` tells the UI which modes are allowed.

**Warnings (don't block):**
- `UNKNOWN_FIELD`: unrecognized keys are ignored.
- `COUNTS_MISMATCH`: `counts` disagrees with the arrays.
- `UNDECLARED_LIST`: a product references a list name not present in `lists`. The list will be created.
- `DUPLICATE_PRICE_POINT`: the same product + date appears twice in the file. Only the first is kept.
- `FUTURE_DATE`: date is after now.
- `PRICE_NULL_BUT_AVAILABLE`: `price: null` with `available: true`. Imported as is.
- `INVALID_IMAGE_URL`: not an http(s) URL. Imported as null.
- `DIFFERENT_USERNAME`: the file's `username` ≠ the current user. A user restoring their own data on a new server may have a different username, so this is a warning, not an error.

**Policy: any error makes the file incompatible.** No partial restore of "the good records". The report lists every problem so the user can fix the file or re-export. *(Builder-check decision; see "Calls made".)*

#### Restore semantics

Normalization: ASIN via `normalizeASIN`, list names trimmed, dates to UTC storage format.

**Merge (default):**
- Product with an ASIN not owned by the user → insert the product (description, image_url, created_at from file), categories (level = index), and all of its price points.
- Product already owned → **leave the product row and its categories untouched**. Insert only price points whose normalized `date` doesn't already exist for that product (exact timestamp match).
- List by exact trimmed name: create it if missing (`created_at` from file); otherwise reuse the existing one. If the user has several lists with the same name, use the oldest.
- Memberships: add any `(product, list)` pair that is missing (`INSERT OR IGNORE`). Never remove one.

**Replace:**
1. Delete, scoped to `user_id`, in dependency order:
   - `notification_log` and `notification_rules` rows whose `product_id` is one of the user's products. Global rules (`product_id IS NULL`) and channels are kept.
   - `product_lists`, `product_categories`, `price_history` for the user's products.
   - `products`.
   - `user_lists`.
2. Insert everything from the file as in merge-into-empty.

The confirmation shows `preview.replace`, including `notificationRulesDeleted`. The server requires `confirmReplace: true`.

**Transaction & concurrency:**
- Run the restore on a **dedicated `sqlite3.Database` connection** to the same file (`dbService.getDatabasePath()`), so other requests on the shared connection don't get mixed into the transaction. Use `BEGIN IMMEDIATE` … `COMMIT`, `ROLLBACK` on any error, and close the connection after.
- Set `PRAGMA busy_timeout = 5000` on the dedicated connection **and** the main connection (`database.ts`), so concurrent scheduler writes wait instead of failing with `SQLITE_BUSY`.
- Re-load the validation context **inside** the transaction and re-validate, so the preview counts and quota checks reflect the state being written.
- Insert price rows directly with explicit `date` / `created_at`. `addPriceHistory` can't set dates, so don't use it. Batch with prepared statements.
- Don't call `addProduct` / `createList`, since they enforce quotas themselves and use the shared connection. Check quotas once in validation instead.
- **Refuse restore (both modes) while a price update is running.** `scheduler.ts` doesn't check that a product still exists before `addPriceHistory`, and foreign keys are off, so a mid-run delete leaves stray `price_history` rows. Expose the existing private `isUpdating` flag (e.g. `schedulerService.isUpdateInProgress()`). `/restore` returns 409 `UPDATE_IN_PROGRESS`, and `/validate` adds it as an error, so the UI says "a price update is running, try again when it finishes". Builder: confirm that manual updates (`routes/prices.ts`) also set `isUpdating`; if not, cover them too. The flag is global, not per user, which is acceptable here.
- **Stale-preview guard:** the restore request carries `expected`, i.e. the `preview` block for the chosen mode that the user saw. If the re-validation inside the transaction produces different counts, roll back and return 409 `DATA_CHANGED` with the fresh report. The UI shows the new preview and asks again. This guarantees Replace never deletes more than the user confirmed.

`RestoreResult`: `{ mode, productsAdded, pricePointsAdded, listsAdded, membershipsAdded, productsDeleted?, pricePointsDeleted?, listsDeleted?, notificationRulesDeleted?, durationMs }`.

#### CSV export

- Columns: `asin, description, date, price, available, unavailable_reason, lists, categories`.
- One row per price point. Products with no history get one row with empty date/price.
- `lists` joined with `; ` (in pt-BR, `| ` to avoid clashing with the delimiter; builder's call). `categories` joined with ` > `.
- **Locale-aware so it opens correctly in Excel:** `en` → `,` delimiter, `.` decimal. `pt-BR` → `;` delimiter, `,` decimal. The frontend passes the current i18n language.
- UTF-8 **with BOM**. RFC 4180 quoting (quote fields containing the delimiter, quotes, or newlines).
- `date` as `YYYY-MM-DD HH:MM:SS` UTC (Excel parses it as a date). The header row stays in English in both locales, since column names are identifiers.
- Filename `amzscraper-price-history-<YYYY-MM-DD>.csv`.

### 3. Frontend

**Rename:** `config.dataExport` → "Data Import/Export" / "Importação/Exportação de Dados". Update `config.exportDescription` (Dashboard tile) to mention backup and restore. Keep section id `data-export` so existing links keep working. Change the nav icon from `Download` to an import/export icon from the same icon set.

**Rename the component** to `DataImportExportSection.tsx` with a co-located `*.module.css` (project convention). Move the fetch calls into `frontend/src/services/api.ts` (`exportBackup`, `exportPriceHistoryCsv`, `validateBackup`, `restoreBackup`), following the `exportDatabase` pattern.

**Layout:**

```
Data Import/Export
├─ Export
│   [Download backup (JSON)]       — full restorable backup: products, price history, lists
│   [Export price history (CSV)]   — for Excel/Sheets; can't be restored
│   [Export ASINs (CSV)]           — existing button, unchanged
└─ Restore from backup
    [Choose backup file…]  (accept=".json,application/json")
    → reads the file client-side, JSON.parse (NOT_JSON shown immediately), then POST /validate
    → Report panel:
        File info: exported <date> by <username>, app <ver>, N products / M prices / K lists
        Errors (red, grouped by code, each with path + message; "+N more" if capped)
        Warnings (amber, collapsible)
        Mode:  (•) Merge — adds what's missing, changes nothing existing
               ( ) Replace everything — deletes your current products, history, and lists first
        Preview counts for the selected mode
        [Restore]   disabled when !compatible or quota not ok for the selected mode
    → Replace: confirmation modal listing preview.replace deletions (incl. notification rules),
      red "Replace everything" button + Cancel
    → Result: summary of RestoreResult; the product list/dashboard refetch on next view
```

- Show a "Validating…" / "Restoring…" busy state. Disable inputs while busy.
- If the file changes after validation, re-validate. Restore always sends the same parsed object that was validated.
- Errors from 413 / 422 / network map to i18n messages.
- All new strings go in `en.json` and `pt-BR.json` under `config.backup.*`, including one message per issue code.

### 4. Tests (`backend/test/*.test.ts`, `node:test`)

- `backup-validate.test.ts`: covers each error and warning code, quota per mode, version handling (missing, older, newer), and preview counts for merge vs replace against a synthetic context.
- `backup-restore.test.ts`: against a temp SQLite file with migrations applied:
  - export → restore round trip into an empty user is identical
  - merge is idempotent (restoring twice adds nothing the second time)
  - merge never changes existing rows
  - replace deletes only the current user's rows (a second user's data is untouched) plus product-specific notification rules
  - an injected failure mid-restore rolls back completely
  - `DATA_CHANGED` when the data changes between validate and restore; `UPDATE_IN_PROGRESS` while the scheduler flag is set
- CSV: quoting, BOM, both locale variants.
- Frontend: manual verification of the flow in both languages (no frontend test setup exists).

### 5. Security fix: admin-only full database export (in scope)

`GET /api/config/export-database` (`backend/src/routes/config.ts:241`) currently lets **any authenticated user** download the entire SQLite file, including every user's password hash and notification channel secrets.

- **Backend:** add the existing `requireAdmin` middleware (`backend/src/middleware/admin.ts`, already used by `routes/admin.ts`) to this route. Non-admins get 403.
- **Frontend:** in `DatabaseSection.tsx`, render the "Export Database" button and its description only when `user.role === 'ADMIN'`. Non-admins still see their product count and DB size. Update the description to say it contains *all users'* data.
- **Test:** a non-admin request returns 403, and an admin request returns the file.
- Users get their own data through the new per-user backup instead.

---

## Calls made (not discussed with the user)

1. Notification channels, rules, and the schedule are excluded from the backup.
2. Any record-level error blocks the whole restore. There is no "skip bad rows".
3. Merge treats existing products as authoritative (no description/image/category overwrite) and dedupes price points by exact timestamp.
4. Lists match by exact trimmed name. With duplicate names, the oldest list is used.
5. `DIFFERENT_USERNAME` is a warning, not an error.
6. Replace deletes product-specific notification rules (and their logs) for deleted products, shown in the confirmation. Global rules and channels are kept.
7. 25 MB body limit, applied only to backup routes.
8. CSV delimiter and decimal separator follow the UI language. Headers stay English.
9. Dedicated DB connection + `BEGIN IMMEDIATE` + `busy_timeout` for the restore transaction.
10. The section id stays `data-export`. The existing "Export ASINs" button stays.
11. Merge quota counts only newly created products/lists, so over-quota users can still merge history.
12. Restore is refused while any price update is running (global `isUpdating` flag).
13. Restore carries the confirmed preview. If the data changed since then, it aborts with `DATA_CHANGED` instead of proceeding.
14. 100-character list-name limit, enforced on import only.

## Left to the builder

- Module split under `services/backup/` vs a single file.
- Exact prepared-statement batching strategy.
- Icon choice, exact CSS, and modal component reuse (check for an existing confirm modal first).
- Exact i18n wording (keep the meanings above).
