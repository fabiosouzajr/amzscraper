# Amazon Price Tracker (amzscraper)

Multi-tenant Amazon price tracker with automated daily scraping, price history, and a dashboard for drops/increases.

## Project Structure

Monorepo with two independent packages (no shared workspace config):

```
backend/     # Express + TypeScript API, SQLite, Playwright scraper
frontend/    # React 18 + Vite SPA, plain CSS, i18next
database/    # SQLite DB file (auto-created, gitignored)
```

Each package has its own `CLAUDE.md` with detailed architecture notes.

## Quick Start

```bash
# Backend (terminal 1)
cd backend && npm install && npm run dev    # Express on port 3000 (installs Playwright browsers automatically)

# Frontend (terminal 2)
cd frontend && npm install && npm run dev   # Vite on port 5174, proxies /api to :3000
```

**Note**: The backend `npm install` automatically installs Playwright browsers (Firefox + Chromium) via a postinstall script.

## Environment Variables

```
PORT=3000              # Backend primary port (default: 3000)
PORT_FALLBACK=3001     # Backend fallback port if PORT is in use (default: 3001)
JWT_SECRET=<secret>    # Backend JWT key (MUST change from default)
```

No frontend env vars — Vite proxies `/api` to the backend.

## Key Technical Decisions

- **No ORM** — direct SQL queries in `backend/src/services/database.ts` (~1300 lines)
- **No test framework** — `backend/test/` contains debug utilities, not test suites
- **SQLite** — single file DB at `database/products.db`, auto-created with migrations on startup
- **Playwright Firefox** — scrapes Amazon.com.br with Chrome user-agent, Portuguese pattern matching
- **SSE streaming** — price updates and ASIN imports stream progress via Server-Sent Events
- **View state, not URL routing** — frontend uses `currentView` state in App.tsx, not React Router
- **Tailscale-first networking** — both servers bind `0.0.0.0`, Vite allows `*.ts.net` hosts

## Code Style

- TypeScript strict mode (frontend enforces `noUnusedLocals`/`noUnusedParameters`)
- No linter or formatter configured
- Callbacks for SQLite operations, async/await for service layer
- Portuguese + English in scraper pattern matching and i18n

## Gotchas

- Backend `tsconfig.json` includes `test/**/*` but `rootDir` is `src/` — `tsc` errors on test files (pre-existing)
- Database migrations run on every startup; they handle schema evolution via table recreation
- Price field is nullable (unavailable products have `price: null` + `unavailable_reason`)
- Frontend `App.css` is a single ~56KB monolithic stylesheet
