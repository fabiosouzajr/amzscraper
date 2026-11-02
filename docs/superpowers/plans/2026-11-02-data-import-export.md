# Data Import/Export (Backup & Restore) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn Settings → "Data Export" into "Data Import/Export". It gets a per-user JSON backup, an export-only price-history CSV, a validated restore with merge and replace modes, and an admin-only full-DB export.

**Architecture:** A new backend module `backend/src/services/backup/` holds pure format/validation code plus DB-bound export, context loading, and restore functions. Every function takes a `sqlite3.Database`, so tests run against a temp DB file and never touch the `dbService` singleton. Routes in `config.ts` open a dedicated connection per request. Restore runs `BEGIN IMMEDIATE … COMMIT` on that connection. The frontend section validates on file pick, shows the report and preview, then restores.

**Tech Stack:** Express + TypeScript, sqlite3 (callback API wrapped by `db/helpers.ts`), `node:test` via `npm test`, React 18 + i18next, `lucide-react` icons.

**Spec:** `docs/superpowers/specs/2026-11-02-data-import-export-design.md` (read it; this plan doesn't repeat its rationale).

## Global Constraints

- Backup file: `format: "amzscraper-backup"`, `formatVersion: 1`, `SUPPORTED_FORMAT_VERSIONS = [1]`, `JSON.stringify(obj, null, 2)`, no DB IDs anywhere.
- Export filenames: `amzscraper-backup-<username>-<YYYY-MM-DD>.json`, `amzscraper-price-history-<YYYY-MM-DD>.csv`.
- Dates: ISO 8601 UTC with `Z` in the JSON file. Storage form `YYYY-MM-DD HH:MM:SS` (UTC). Inputs with an offset are converted to UTC. Storage strings without a zone are UTC.
- List names: trimmed, 1–100 chars on import. Don't change `routes/lists.ts`.
- Body limit `25mb` on `/api/config/backup` only. The global `express.json()` stays at the default.
- `PRAGMA busy_timeout = 5000` on the restore connection and the main connection.
- Quotas from `system_config`: `quota_max_products` (default `100`), `quota_max_lists` (default `20`).
- Issues are capped at `500` in the response, and `issueTotals` holds the full counts.
- CSV: UTF-8 with BOM. `en` → `,` delimiter / `.` decimal / lists joined `; `. `pt-BR` → `;` delimiter / `,` decimal / lists joined ` | `. Categories joined ` > `. English header row in both locales.
- Section id stays `data-export`. The "Export ASINs" button and `GET /export-asins` stay unchanged.
- Notification channels, rules, and the schedule are never exported.
- All user-facing strings go in both `en.json` and `pt-BR.json`.
- Don't import `dbService` from anything under `services/backup/` (it opens the real DB on import).

## Review Focus

1. **The user restores the same backup twice in merge mode.** The second run must add nothing: price dedupe uses the normalized storage date, so `…T09:05:00Z` and `…09:05:00.000+00:00` are the same point. → Task 3 `merge is idempotent`, Task 1 `toStorageDate normalizes equivalent instants`.
2. **A different user's data during replace.** User B's products, lists, and history must survive user A's replace. → Task 3 `replace leaves other users untouched`.
3. **A product listed in a list that isn't in `lists[]`, or a list name differing only in surrounding spaces.** Expected: the list is created once and the warning is shown. → Task 1 `undeclared list is a warning and counted once`, Task 3 round trip.
4. **A hand-edited file with `price: "199,90"` (string, comma decimal) or `available: "true"`.** Expected: a clear `INVALID_PRICE` / `INVALID_AVAILABLE` error at the right path, not a crash or coercion. → Task 1 `rejects stringly-typed price and available`.
5. **A large file (≈110k price points).** Restore must finish within a single request and not run one transaction per row. → Task 3 `restores 20k price points under 10s` (uses prepared statements inside one transaction).

---

## File Structure

| Type | Path | Responsibility |
|---|---|---|
| new | `backend/src/services/backup/format.ts` | Types, constants, date helpers |
| new | `backend/src/services/backup/validate.ts` | Pure `validateBackup` → report + normalized data |
| new | `backend/src/services/backup/context.ts` | `checkLiveSchema`, `loadValidationContext` |
| new | `backend/src/services/backup/export.ts` | `buildBackup`, `formatPriceHistoryCsv`, filenames |
| new | `backend/src/services/backup/restore.ts` | `restoreBackup`, `RestoreError` |
| new | `backend/src/services/backup/connection.ts` | `openConnection(path)` with busy_timeout |
| new | `backend/test/helpers/temp-db.ts` | Temp migrated DB + seed helpers (not matched by `test/*.test.ts`) |
| new | `backend/test/backup-validate.test.ts`, `backup-export.test.ts`, `backup-restore.test.ts` | Tests |
| mod | `backend/src/routes/config.ts` | 4 backup routes; `requireAdmin` on `/export-database` |
| mod | `backend/src/server.ts:33` | Route-specific 25 MB JSON parser before the global one |
| mod | `backend/src/services/database.ts` | busy_timeout on main connection |
| mod | `backend/src/services/scheduler.ts` | Public `isUpdateInProgress()` |
| new | `frontend/src/components/config/DataImportExportSection.tsx` | Replaces `DataExportSection.tsx` (deleted) |
| mod | `frontend/src/components/config/Config.module.css` | Report/preview/modal classes (shared config stylesheet, existing convention) |
| mod | `frontend/src/services/api.ts` | `backup.*` methods |
| mod | `frontend/src/types.ts` (or wherever API types live) | Report/result types mirrored from backend |
| mod | `frontend/src/components/SettingsPage.tsx`, `config/index.tsx` | Import rename, icon |
| mod | `frontend/src/components/config/DatabaseSection.tsx` | Admin-only export button |
| mod | `frontend/src/i18n/locales/en.json`, `pt-BR.json` | Strings |

---

### Task 1: Backup format and pure validator

**Files:**
- Create: `backend/src/services/backup/format.ts`, `backend/src/services/backup/validate.ts`
- Test: `backend/test/backup-validate.test.ts`

**Interfaces:**
- Produces (`format.ts`):
  - consts `BACKUP_FORMAT`, `CURRENT_FORMAT_VERSION = 1`, `SUPPORTED_FORMAT_VERSIONS`, `MAX_LIST_NAME_LENGTH = 100`, `MAX_REPORTED_ISSUES = 500`
  - `BackupPricePoint { date: string; price: number | null; available: boolean; unavailableReason: string | null }`
  - `BackupProduct { asin; description; imageUrl: string | null; createdAt: string; categories: string[]; lists: string[]; priceHistory: BackupPricePoint[] }`
  - `BackupList { name: string; createdAt: string }`
  - `BackupFileV1 { format; formatVersion: 1; exportedAt; appVersion; username; counts: { products; priceHistory; lists }; lists: BackupList[]; products: BackupProduct[] }`
  - `RestoreMode = 'merge' | 'replace'`
  - `Issue`, `MergePreview`, `ReplacePreview`, `ValidationReport`, `RestoreResult`, exactly as in spec §2. `ValidationReport.preview = { merge: MergePreview; replace: ReplacePreview }`.
  - `toStorageDate(input: string): string | null`: accepts `YYYY-MM-DD[T ]HH:MM[:SS[.fff]][Z|±HH[:]MM]` and returns UTC `YYYY-MM-DD HH:MM:SS`. Returns null otherwise. No zone means UTC.
  - `toIsoDate(storage: string): string`: storage → `YYYY-MM-DDTHH:MM:SSZ`
- Produces (`validate.ts`):
  - `ValidationContext { existingAsins: Set<string>; existingListNames: Set<string>; existingPriceKeys: Set<string> /* `${asin}|${storageDate}` */; existingMemberships: Set<string> /* `${asin}|${listName}` */; existingCounts: { products: number; pricePoints: number; lists: number }; productNotificationRuleCount: number; quotas: { maxProducts: number; maxLists: number }; currentUsername: string; updateInProgress: boolean; schemaIssues: Issue[] }`
  - `NormalizedBackup { lists: { name: string; createdAt: string /*storage*/ }[] /* declared + undeclared, unique */; products: { asin; description; imageUrl: string | null; createdAt: string; categories: string[]; lists: string[]; priceHistory: { date: string; price: number | null; available: boolean; unavailableReason: string | null }[] }[] }`
  - `validateBackup(input: unknown, ctx: ValidationContext, now?: Date): { report: ValidationReport; data: NormalizedBackup | null }`. `data` is null when `report.compatible` is false.
  - `report.compatible` = no `error` issues **other than** `QUOTA_EXCEEDED`. Quota errors block only their mode via `report.quotaOk`. `QUOTA_EXCEEDED.params` includes `mode`.

- [ ] **Step 1: Write the failing tests.** Use a `baseCtx()` factory (empty sets, quotas 100/20, username `alice`, no schema issues) and a `validFile()` factory (2 products, 3 price points, 1 list). Tests:
  - `valid file is compatible with zero errors`: `compatible === true`, `issueTotals.errors === 0`, `data.products.length === 2`.
  - `toStorageDate normalizes equivalent instants`: `'2026-01-10T09:05:00Z'`, `'2026-01-10T06:05:00-03:00'`, `'2026-01-10 09:05:00'` all → `'2026-01-10 09:05:00'`. `'2026-13-01'` and `'yesterday'` → null.
  - One test per file-level error: `NOT_JSON`-equivalent input (a string) → `WRONG_TYPE` at `$`. `format: 'x'` → `WRONG_FORMAT`. `formatVersion: 2` → `UNSUPPORTED_VERSION` with `params.newer === 1`. Missing `products` → `MISSING_FIELD` at `products`. Each sets `compatible === false` and produces no record-level issues.
  - One test per record error, asserting `code` and exact `path`: `INVALID_ASIN` (`products[0].asin`), `DUPLICATE_ASIN` (`products[1].asin`), `MISSING_DESCRIPTION`, `INVALID_DATE` (`products[0].priceHistory[1].date`), `INVALID_PRICE` (`-1`), `INVALID_LIST_NAME` (101 chars, and `'   '`), `DUPLICATE_LIST_NAME`.
  - `rejects stringly-typed price and available`: `price: "199,90"` → `INVALID_PRICE`; `available: "true"` → `INVALID_AVAILABLE`.
  - One test per warning, asserting `compatible === true`: `UNKNOWN_FIELD`, `COUNTS_MISMATCH`, `UNDECLARED_LIST`, `DUPLICATE_PRICE_POINT` (data keeps only the first), `FUTURE_DATE`, `PRICE_NULL_BUT_AVAILABLE`, `INVALID_IMAGE_URL` (data `imageUrl === null`), `DIFFERENT_USERNAME`.
  - `undeclared list is a warning and counted once`: two products reference `' Gifts '`, which isn't in `lists`. `data.lists` has exactly one `Gifts`, and `preview.merge.listsAdded === 2` (declared + Gifts).
  - `merge preview against existing data`: ctx has product 0's ASIN and one of its price keys. Expect `productsAdded 1, productsSkippedExisting 1, pricePointsSkippedDuplicate 1`, and `pricePointsAdded` = the rest.
  - `replace preview uses existing counts`: ctx `existingCounts {5, 50, 2}`, `productNotificationRuleCount 3` → `preview.replace` deleted fields `5/50/2/3`, added fields = file counts.
  - `quota: merge blocked only when creating products`: maxProducts 1 with an existing count of 1 and a file with 1 new ASIN → `quotaOk.merge false`, `QUOTA_EXCEEDED` with `params.mode 'merge'`, `compatible true`. The same ctx with a file of only existing ASINs → `quotaOk.merge true`.
  - `quota: replace checks file counts`: maxLists 0 with a file of 1 list → `quotaOk.replace false`.
  - `update in progress is an error`: `ctx.updateInProgress = true` → `UPDATE_IN_PROGRESS`, `compatible false`.
  - `schema issues are passed through`: `ctx.schemaIssues = [{severity:'error', code:'SERVER_SCHEMA_MISMATCH', path:'$', params:{table:'products', column:'image_url'}}]` → included, `compatible false`.
  - `issues capped at 500`: 600 invalid ASINs → `issues.length === 500`, `issueTotals.errors === 600`.

- [ ] **Step 2: Run to verify they fail.** Run: `cd backend && node -r ts-node/register/transpile-only --test test/backup-validate.test.ts`. Expected: FAIL (cannot find module `../src/services/backup/validate`).

- [ ] **Step 3: Implement `format.ts` and `validate.ts`.** Reuse `validateASIN` and `normalizeASIN` from `src/utils/validation`. File-level checks run first; if any fail, return without record checks. Normalize list names with `trim()` before every comparison. ASINs normalize before duplicate and existence checks. Known keys per object level are the fields of the interfaces above. Anything else → `UNKNOWN_FIELD`.

- [ ] **Step 4: Run to verify they pass.** Same command. Expected: all PASS.

- [ ] **Step 5: Commit.** `git add backend/src/services/backup/format.ts backend/src/services/backup/validate.ts backend/test/backup-validate.test.ts && git commit -m "feat(backup): backup v1 format and pure validator"`

---

### Task 2: Test DB helper, export JSON, and price-history CSV

**Files:**
- Create: `backend/test/helpers/temp-db.ts`, `backend/src/services/backup/export.ts`, `backend/src/services/backup/connection.ts`
- Test: `backend/test/backup-export.test.ts`

**Interfaces:**
- Consumes: Task 1 types, `toIsoDate`.
- Produces:
  - `connection.ts`: `openConnection(dbPath: string): Promise<sqlite3.Database>`. Opens the file and runs `PRAGMA busy_timeout = 5000`.
  - `temp-db.ts`: `createTempDb(): Promise<{ path: string; db: sqlite3.Database; cleanup(): Promise<void>; addUser(username: string): Promise<number>; addProduct(userId, asin, opts?: { description?; categories?: string[]; lists?: string[]; prices?: { date: string; price: number | null; available?: boolean; reason?: string }[] }): Promise<number> }>`. Creates a file in `os.tmpdir()`, runs `createMigrations(db).run()`, and seeds via raw SQL.
  - `export.ts`:
    - `buildBackup(db: sqlite3.Database, userId: number, meta: { username: string; appVersion: string; now?: Date }): Promise<BackupFileV1>`
    - `formatPriceHistoryCsv(products: BackupProduct[], locale: 'en' | 'pt-BR'): string`
    - `backupFilename(username: string, now: Date): string`, `priceHistoryCsvFilename(now: Date): string`

- [ ] **Step 1: Write the failing tests:**
  - `buildBackup exports only the user's data`: 2 users, each with a product. Alice's backup has 1 product, `counts` match, and `format`/`formatVersion` are correct.
  - `buildBackup orders and shapes data`: products sorted by ASIN, lists by name, history ascending, categories in level order. Dates end in `Z`. No `id`, `user_id`, or `product_id` keys anywhere (recursive key scan).
  - `buildBackup output passes validateBackup against an empty context`: `compatible === true` and `issueTotals.warnings === 0`.
  - `csv en`: starts with `﻿`; header `asin,description,date,price,available,unavailable_reason,lists,categories`; price `199.9`; a description containing `,` and `"` is quoted and the inner quote doubled.
  - `csv pt-BR`: `;` delimiter, price `199,9`, lists joined ` | `.
  - `csv product without history emits one row with empty date and price`.
  - `filenames`: `backupFilename('alice', new Date('2026-11-02T10:00:00Z')) === 'amzscraper-backup-alice-2026-11-02.json'`.

- [ ] **Step 2: Run to verify they fail.** `node -r ts-node/register/transpile-only --test test/backup-export.test.ts` → FAIL (module missing).

- [ ] **Step 3: Implement.** `buildBackup` uses at most 4 queries (products, categories joined by product, price_history joined by user's products, lists + memberships), not one per product. `formatPriceHistoryCsv` writes rows with `\r\n`.

- [ ] **Step 4: Run to verify they pass.** Same command; also `npm test` → all existing tests still PASS.

- [ ] **Step 5: Commit.** `git add backend/src/services/backup/export.ts backend/src/services/backup/connection.ts backend/test/helpers/temp-db.ts backend/test/backup-export.test.ts && git commit -m "feat(backup): JSON backup and price-history CSV export"`

---

### Task 3: Schema preflight, context loader, and transactional restore

**Files:**
- Create: `backend/src/services/backup/context.ts`, `backend/src/services/backup/restore.ts`
- Test: `backend/test/backup-restore.test.ts`

**Interfaces:**
- Consumes: Task 1 `validateBackup`, `ValidationContext`, `NormalizedBackup`. Task 2 `openConnection`, `buildBackup`, `createTempDb`.
- Produces:
  - `REQUIRED_SCHEMA: Record<string, string[]>`, with these columns:
    - products: `id, user_id, asin, description, image_url, created_at`
    - price_history: `id, product_id, price, available, unavailable_reason, date, created_at`
    - user_lists: `id, user_id, name, created_at`
    - product_lists: `product_id, list_id`
    - categories: `id, name`
    - product_categories: `product_id, category_id, level`
    - notification_rules: `id, product_id`
    - notification_log: `rule_id, product_id`
  - `checkLiveSchema(db): Promise<Issue[]>`: one `SERVER_SCHEMA_MISMATCH` error per missing table/column (`params: { table, column? }`).
  - `loadValidationContext(db, userId, deps: { getConfig(key: string): Promise<string | null>; isUpdateInProgress(): boolean }): Promise<ValidationContext>`. Calls `checkLiveSchema`. `productNotificationRuleCount` counts `notification_rules` with `product_id` in the user's products.
  - `class RestoreError extends Error { status: 400 | 409 | 422; code: 'CONFIRM_REQUIRED' | 'UPDATE_IN_PROGRESS' | 'INCOMPATIBLE' | 'QUOTA_EXCEEDED' | 'DATA_CHANGED'; report?: ValidationReport }`
  - `restoreBackup(userId: number, input: unknown, opts: { mode: RestoreMode; confirmReplace?: boolean; expected: MergePreview | ReplacePreview }, deps: { openConnection(): Promise<sqlite3.Database>; getConfig(key: string): Promise<string | null>; isUpdateInProgress(): boolean; beforeCommit?(db: sqlite3.Database): Promise<void> }): Promise<RestoreResult>`

- [ ] **Step 1: Write the failing tests** (each uses `createTempDb`; `deps.openConnection = () => openConnection(tmp.path)`; `getConfig` returns null → defaults). Helper `restoreWithPreview(mode, file)`: runs `loadValidationContext` + `validateBackup` to get `expected`, then `restoreBackup`.
  - `checkLiveSchema reports a missing column`: drop `image_url` by recreating `products` without it in a temp DB → issue with `params.table === 'products'` and `params.column === 'image_url'`.
  - `round trip into empty user is identical`: build alice's backup, restore into a new user bob, then `buildBackup(bob)`. Equal to alice's after stripping `exportedAt` and `username`.
  - `merge is idempotent`: restore merge twice; the second `RestoreResult` has every added count `0`.
  - `merge never changes existing rows`: bob has ASIN X with description `"mine"`. The file has X with `"theirs"` and a new price point. Afterwards the description is still `"mine"`, the categories are unchanged, and the price count is +1.
  - `merge adds missing memberships and reuses oldest duplicate-named list`: bob has two lists named `Wishlist`. The product joins the older one.
  - `replace leaves other users untouched`: alice and bob both have data. Replace bob. Alice's product, list, and price counts are unchanged.
  - `replace deletes product-specific notification rules only`: seed a channel and two rules for bob (one with `product_id`, one with `NULL`). After replace, only the NULL rule remains, and `result.notificationRulesDeleted === 1`.
  - `replace requires confirmation`: `confirmReplace` omitted → `RestoreError` with `status 400` and `code CONFIRM_REQUIRED`. The DB is unchanged.
  - `refuses while update in progress`: `isUpdateInProgress: () => true` → `409 UPDATE_IN_PROGRESS`.
  - `incompatible file is rejected with report`: invalid ASIN → `422 INCOMPATIBLE`, with `err.report.issues[0].code === 'INVALID_ASIN'`.
  - `quota blocks mode`: `getConfig('quota_max_products')` returns `'1'`, bob has 1 product, the file has 1 new → merge throws `422 QUOTA_EXCEEDED`.
  - `stale preview aborts`: get `expected`, then insert a product for bob directly, then replace → `409 DATA_CHANGED` with a fresh `report`. Bob's data is unchanged (the inserted product still exists).
  - `failure before commit rolls back`: `beforeCommit` throws → the error propagates, and bob's counts equal the pre-restore counts (for replace: nothing deleted).
  - `restores 20k price points under 10s`: 50 products × 400 points into an empty user. Assert `durationMs < 10000` and the count matches.

- [ ] **Step 2: Run to verify they fail.** `node -r ts-node/register/transpile-only --test test/backup-restore.test.ts` → FAIL (module missing).

- [ ] **Step 3: Implement `context.ts` and `restore.ts`.** Order inside `restoreBackup`:
  1. `replace && !confirmReplace` → 400.
  2. `isUpdateInProgress()` → 409.
  3. `openConnection`, then `BEGIN IMMEDIATE`.
  4. `loadValidationContext` on that connection, then `validateBackup`.
  5. `!compatible` → 422 `INCOMPATIBLE`; `!quotaOk[mode]` → 422 `QUOTA_EXCEEDED`.
  6. Compare `report.preview[mode]` to `opts.expected` with `node:util` `isDeepStrictEqual`; on mismatch → 409 `DATA_CHANGED`.
  7. Replace: delete in the spec's order (§2 "Restore semantics"), scoped by `product_id IN (SELECT id FROM products WHERE user_id = ?)`.
  8. Insert with `db.prepare` statements reused across rows: categories via `INSERT OR IGNORE INTO categories(name)` then select id; memberships via `INSERT OR IGNORE`.
  9. `beforeCommit?.(db)`, then `COMMIT`.

  Any throw after `BEGIN` → `ROLLBACK`, then rethrow. Always `close()` in `finally`. Fill `RestoreResult.durationMs` with `Date.now()` deltas.

- [ ] **Step 4: Run to verify they pass.** Same command, then `npm test` → all PASS.

- [ ] **Step 5: Commit.** `git add backend/src/services/backup/context.ts backend/src/services/backup/restore.ts backend/test/backup-restore.test.ts && git commit -m "feat(backup): schema preflight and transactional merge/replace restore"`

---

### Task 4: HTTP routes, body limit, scheduler flag, busy timeout, admin-only DB export

**Files:**
- Modify: `backend/src/routes/config.ts` (add routes; `/export-database` at ~line 241)
- Modify: `backend/src/server.ts:33`, `backend/src/services/database.ts:38-44`, `backend/src/services/scheduler.ts:317`

**Interfaces:**
- Consumes: Tasks 1–3.
- Produces (the HTTP contract the frontend relies on):
  - `GET /api/config/backup/export`: JSON attachment, `Content-Disposition: attachment; filename="<backupFilename>"`
  - `GET /api/config/backup/export-csv?locale=en|pt-BR`: `text/csv; charset=utf-8` attachment (an invalid or missing locale → `en`)
  - `POST /api/config/backup/validate` body `{ backup: unknown }` → `200 ValidationReport`
  - `POST /api/config/backup/restore` body `{ backup, mode, confirmReplace?, expected }` → `200 RestoreResult`. On `RestoreError` → `status` with `{ error: code, report? }`.
  - `schedulerService.isUpdateInProgress(): boolean` (returns the private `isUpdating`)

- [ ] **Step 1: Implement:**
  - In `server.ts`, mount `app.use('/api/config/backup', express.json({ limit: '25mb' }))` before line 33.
  - In `database.ts`, call `db.configure('busyTimeout', 5000)` right after a successful open.
  - Add `isUpdateInProgress()` to the scheduler (both `updateAllPrices` and `updateUserPrices` already set `isUpdating`).
  - Add the 4 routes in `config.ts`:
    - username from `authReq.user!.username`
    - `appVersion` from `require('../../package.json').version`
    - `deps.openConnection = () => openConnection(dbService.getDatabasePath())`
    - `getConfig = dbService.getConfig`
    - `/validate` and `/export*` open a connection and close it in `finally`.
  - Add `requireAdmin` (from `../middleware/admin`) as route middleware on `GET /export-database`.
  - An Express error handler returns 413 `{ error: 'PAYLOAD_TOO_LARGE' }` for `type === 'entity.too.large'` on the backup path. Check that the existing error handling doesn't already swallow it.

- [ ] **Step 2: Typecheck.** Run: `cd backend && npx tsc --noEmit -p . 2>&1 | grep -v '^test/'`. Expected: no errors in `src/` (test-file errors are pre-existing per CLAUDE.md).

- [ ] **Step 3: Manual HTTP verification.** `npm run dev`, log in as a non-admin and an admin to get tokens `$U` and `$A`, then:
  - `curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $U" localhost:3000/api/config/export-database` → `403`. With `$A` → `200`.
  - `curl -s -H "Authorization: Bearer $U" localhost:3000/api/config/backup/export -o b.json`, then `jq '{format,formatVersion,counts}' b.json` shows the counts.
  - `jq '{backup: .}' b.json | curl -s -H "Authorization: Bearer $U" -H 'Content-Type: application/json' -d @- localhost:3000/api/config/backup/validate | jq '.compatible,.preview.merge'` → `true` and all-zero adds.
  - Restore merge with that `expected` → 200 with zero adds.
  - A body > 25 MB → `413`.

- [ ] **Step 4: Run `npm test`.** Expected: all PASS.

- [ ] **Step 5: Commit.** `git add backend/src && git commit -m "feat(backup): backup routes, 25mb body limit, busy timeout; restrict DB export to admins"`

---

### Task 5: Frontend Data Import/Export section and admin-only DB export button

**Files:**
- Create: `frontend/src/components/config/DataImportExportSection.tsx`. Delete: `frontend/src/components/config/DataExportSection.tsx`
- Modify: `frontend/src/services/api.ts`, frontend types file, `SettingsPage.tsx:7,10,34,137`, `config/index.tsx:7,104` (import rename only), `DatabaseSection.tsx:66-76`, `Config.module.css`, `en.json`, `pt-BR.json`

**Interfaces:**
- Consumes: the Task 4 HTTP contract. Mirror `ValidationReport`, `Issue`, `MergePreview`, `ReplacePreview`, `RestoreResult`, `RestoreMode` as frontend types (copy the field names exactly).
- Produces: `api.backup = { exportJson(): Promise<{ blob: Blob; filename: string }>; exportCsv(locale: string): Promise<{ blob: Blob; filename: string }>; validate(backup: unknown): Promise<ValidationReport>; restore(body: { backup: unknown; mode: RestoreMode; confirmReplace?: boolean; expected: MergePreview | ReplacePreview }): Promise<RestoreResult> }`. Non-OK responses throw an `Error` whose `code` property is the backend `error` string and whose `report` property holds the report when present. `exportASINs` moves into `api` as well (same pattern, same filename behaviour).
- Component: `export function DataImportExportSection()`

- [ ] **Step 1: Strings.** Add to both locales:
  - `config.dataExport` = `"Data Import/Export"` / `"Importação/Exportação de Dados"`
  - updated `config.exportDescription`
  - `config.backup.*`: export/restore button labels and descriptions, the mode labels and descriptions (copy meanings from the spec layout), preview labels for every `MergePreview` / `ReplacePreview` field, the confirm modal title, body, and `"Replace everything"` button, busy states, the result summary, `fileTooLarge` (max 25 MB), `notJson`, `dataChanged`, `updateInProgress`
  - `config.backup.issues.<CODE>` for every issue code in Task 1, interpolating `params` and `path`
  - `config.exportDatabaseDescription` gets "contains all users' data"

- [ ] **Step 2: Implement `api.backup` and the component** following the spec §3 layout:
  - Export block with 3 buttons. CSV passes `i18n.language`.
  - Restore block: `<input type="file" accept=".json,application/json">` → `FileReader` text → `JSON.parse`. A parse failure shows `notJson` and doesn't call the API. Otherwise call `validate`.
  - Report panel:
    - file info
    - errors grouped by `code` with the path
    - "+N more" when `issueTotals.errors > issues errors shown`
    - collapsible warnings
  - Mode radio defaults to merge, and its preview values come from `report.preview[mode]`.
  - Restore is disabled when `!report.compatible || !report.quotaOk[mode] || busy`.
  - Replace opens a confirmation modal listing `preview.replace` deleted counts (including `notificationRulesDeleted`) before calling restore with `confirmReplace: true`.
  - On `DATA_CHANGED`, replace the shown report with `err.report` and show `dataChanged`.
  - On success, show the `RestoreResult` summary and clear the file input.
  - A new file pick resets everything.
  - Reuse an existing confirm-modal component if one exists (search `components/` for `Modal`/`confirm`); otherwise a minimal inline modal styled in `Config.module.css`.
- [ ] **Step 3: Wiring.**
  - In `SettingsPage.tsx`, import `DataImportExportSection` and change the icon `Download` → `ArrowDownUp` (lucide).
  - In `config/index.tsx`, change only the import name and the JSX tag.
  - In `DatabaseSection.tsx`, wrap the export button and its description in `user?.role === 'ADMIN'` using `useAuth()`.

- [ ] **Step 4: Build.** Run: `cd frontend && npm run build`. Expected: exits 0 (strict `noUnusedLocals` passes; no reference to `DataExportSection` remains: `grep -rn DataExportSection src` → empty).

- [ ] **Step 5: Manual verification** (backend + frontend dev servers), in both languages:
  1. The nav and dashboard tile read "Data Import/Export".
  2. Download the backup; it opens readable in an editor.
  3. Download the CSV; in pt-BR, the columns split on `;` when opened in a spreadsheet.
  4. Pick the downloaded backup → compatible, merge preview all zeros.
  5. Edit one ASIN to `bad` → the error is shown with its path, and Restore is disabled.
  6. Pick a `.txt` → `notJson`.
  7. Replace on a test user → the modal shows counts, then the result is correct and the products page matches.
  8. As a non-admin, the Database section shows no Export Database button.

- [ ] **Step 6: Commit.** `git add frontend/src && git commit -m "feat(frontend): Data Import/Export section with validated restore; admin-only DB export button"`

---

### Task 6: Handoff docs

**Files:**
- Modify: `.wolf/STATUS.md`, `backend/CLAUDE.md` (one line under architecture: `services/backup/` and its routes), `docs/superpowers/specs/2026-11-02-data-import-export-design.md` (Status → Implemented)

- [ ] **Step 1: Update the files.** Move "Data Import/Export" to Done in STATUS.md with a link to the plan. Record in `.wolf/cerebrum.md`: "SQLite FKs are off (`PRAGMA foreign_keys` never set), so deletes must clear dependents explicitly".
- [ ] **Step 2: Run the full check.** `cd backend && npm test` (PASS), then `cd ../frontend && npm run build` (exit 0).
- [ ] **Step 3: Commit.** `git add .wolf/STATUS.md .wolf/cerebrum.md backend/CLAUDE.md docs/superpowers && git commit -m "docs: record data import/export completion"`
