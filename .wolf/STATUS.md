---
description: session handoff, regenerate with /handoff when a quest finishes
budget_tokens: 1000
---
# STATUS — amzscraper

> Single source of truth for resuming work. Read this FIRST when starting a session.
> Update this file at the end of every work phase so the next `/clear` resumes in 1 read.
> Last updated: 2026-11-02

---

## ✅ Done

- **Data Import/Export (per-user backup & restore)** — branch `feat/data-import-export`. Plan: `docs/superpowers/plans/2026-11-02-data-import-export.md`. Spec: `docs/superpowers/specs/2026-11-02-data-import-export-design.md` (Implemented).
  - Backend module `backend/src/services/backup/`: `format.ts`, `validate.ts`, `context.ts`, `export.ts`, `restore.ts`, `connection.ts`.
  - Routes on `/api/config/backup`: `GET /export` (JSON), `GET /export-csv?locale=` (price history), `POST /validate`, `POST /restore` (`merge` | `replace`, one transaction on a dedicated connection). 25mb JSON body limit applies only to this path.
  - `GET /api/config/export-database` is now admin-only.
  - Frontend: `frontend/src/components/config/DataImportExportSection.tsx`.
  - Verification: backend `npm test` and frontend `npm run build` (see Task 6 report).

---

## 🚀 Next phase

**Goal:** Manually verify Data Import/Export in both languages, then merge `feat/data-import-export` into `master`.

### Acceptance criteria
1. Export JSON and CSV download from the Config page in pt and en.
2. Validate and restore (merge and replace) work from the UI, with clear errors for invalid files.
3. Admin-only DB export button is visible to admins only.

### Files to create / edit
None; verification only. Fix any defects found in the files listed under Done.

### Closed decisions
- Restore runs in a single transaction (`BEGIN IMMEDIATE`) on a dedicated connection, so a failed restore leaves data unchanged.
- SQLite FKs are off, so deletes clear dependents explicitly.

### Open decisions
None.

---

## 📁 Active architecture

- **Stack:** Express + TypeScript + SQLite (backend); React 18 + Vite + i18next (frontend); Playwright Firefox scraper.
- **Key tables / modules:** `services/database.ts` (all SQL), `services/backup/*`, `routes/config.ts`, `services/scraper.ts`, `services/scheduler.ts`.
- **Patterns:** Every query is user-scoped by `user_id`; migrations run on startup; SSE for long operations.

---

## ⚠️ External blockers (don't block coding)

- None known. Scraping needs Playwright Firefox (`npm install` in `backend/` installs it).

---

## 🔧 Useful commands

```bash
cd backend && npm run dev      # API on :3000
cd frontend && npm run dev     # Vite on :5174
cd backend && npm test         # node:test suites
cd frontend && npm run build   # type-check + bundle
```

---

## 📚 References (read IF needed)

- `.wolf/cerebrum.md` — User Preferences + Do-Not-Repeat + Decision Log
- `.wolf/anatomy.md` — token-efficient file index
- `.wolf/buglog.json` — known bugs + fixes
