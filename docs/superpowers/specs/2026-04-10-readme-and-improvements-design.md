# Design Spec: README Rewrite & Improvements Audit

**Date:** 2026-04-10
**Deliverables:** 2 files — `README.md` (rewrite) + `improvements.md` (new)

---

## Deliverable 1: README.md — Full Rewrite

### Audience
Both end-users/self-hosters and developers/contributors equally.

### Target Length
~350-400 lines (down from 551). Denser but more complete.

### Structure

```
# Amazon Price Tracker

One-paragraph description: Multi-tenant Amazon.com.br price tracker with 
Playwright scraping, React dashboard, SQLite storage. Covers: automated 
daily scraping, price history charts, multi-user admin, notifications, 
product lists, CSV import/export.

## Features
  Core:
    - Price tracking with change-only recording
    - Interactive price history charts (Recharts)
    - Dashboard with biggest drops & increases
    - Product search with pagination
    - Automatic daily price updates (configurable cron)
    - Manual price update trigger with real-time SSE progress
  
  Multi-User & Admin:
    - Role-based access (USER / ADMIN)
    - Setup wizard for first-run admin creation
    - User management (create, disable, reset password)
    - Configurable quotas (max products, max lists per user)
    - Registration toggle (admin-controlled)
    - Audit logging for all admin actions
    - System stats dashboard
  
  Notifications:
    - Multi-channel: Email, Telegram, Discord
    - Rule types: lowest in N days, below threshold, percentage drop
    - Per-product or global rules
    - Notification history with send/fail tracking
    - Test message support
  
  Organization:
    - Custom product lists (e.g., Wishlist, To Buy)
    - Automatic category extraction from Amazon breadcrumbs
    - Category filtering on dashboard and products page
    - CSV import/export of ASINs
    - Full database backup export
  
  Scheduling:
    - System-wide cron schedule (admin-configurable)
    - Per-user custom cron schedules
    - Scheduler enable/disable toggle
  
  Internationalization:
    - English and Portuguese (Brazil)
    - Browser language auto-detection
    - Locale-aware date and currency formatting (R$)
  
  Other:
    - Responsive design with mobile bottom tab bar
    - Offline connectivity banner
    - Tailscale-first networking

## Tech Stack
  Table format:
  | Layer     | Technology                                          |
  |-----------|-----------------------------------------------------|
  | Backend   | Node.js, Express 4.18, TypeScript 5.3               |
  | Frontend  | React 18, Vite 7.3, React Query 5, Recharts 2.10    |
  | Database  | SQLite3 (single file, auto-created with migrations)  |
  | Scraper   | Playwright (Firefox headless, Chrome UA)              |
  | Auth      | JWT + bcrypt                                          |
  | i18n      | i18next (en, pt-BR)                                   |
  | Scheduler | node-cron                                             |

## Quick Start
  Option 1: install.sh + run.sh (5-6 lines with brief explanation)
  Option 2: Manual (backend npm install + dev, frontend npm install + dev)
  Note about first-run setup wizard for admin account creation

## Configuration
  ### Environment Variables
  Table with ALL vars:
  | Variable              | Default              | Description                      |
  |-----------------------|----------------------|----------------------------------|
  | PORT                  | 3000                 | Backend primary port             |
  | PORT_FALLBACK         | 3001                 | Fallback if PORT is in use       |
  | JWT_SECRET            | (must change)        | JWT signing key                  |
  | JWT_EXPIRES_IN        | 7d                   | Token expiry                     |
  | NODE_ENV              | development          | Environment mode                 |
  | BCRYPT_ROUNDS         | 10                   | Password hash rounds (4-31)      |
  | DB_PATH               | ./database/products.db| SQLite file location            |
  | BIND_ADDRESS          | 0.0.0.0              | Server bind address              |
  | VITE_DEV_PORT         | 5174                 | Frontend dev server port         |
  | VITE_API_TARGET       | http://localhost:3000 | API proxy target                 |

  ### Admin-Managed Settings (via UI)
  Brief list: quota.max_products, quota.max_lists, scheduler_enabled, 
  scheduler_cron, registration_enabled

## Usage Guide
  Brief subsections (2-4 lines each):
  - First Run (setup wizard)
  - Adding Products (single + bulk CSV)
  - Dashboard (drops, increases, category filter)
  - Product Lists (create, add/remove products, filter)
  - Notifications (channels, rules, testing)
  - Scheduling (system + per-user)
  - Admin Panel (users, stats, config, audit)
  - Import/Export (CSV, database backup)

## Architecture
  ### Project Structure
  Updated tree reflecting current state:
  - backend/src/ with routes/, services/db/, middleware/, utils/, config.ts
  - frontend/src/ with components/, contexts/, hooks/, services/, 
    design-system/, i18n/, utils/
  - database/, docs/, logs/

  ### Database
  Summary table of all 13 tables with primary purpose (1 line each):
  users, products, price_history, categories, product_categories,
  user_lists, product_lists, audit_log, system_config, user_schedule,
  notification_channels, notification_rules, notification_log

  ### API
  Brief overview paragraph describing REST + SSE approach.
  Link to docs/backend/BACKEND_API_DOCUMENTATION.md for full reference.
  Mention key route groups: /api/auth, /api/products, /api/prices, 
  /api/dashboard, /api/lists, /api/config, /api/admin, 
  /api/notifications, /api/setup

  ### Key Patterns
  - No ORM (direct SQL with parameterized queries)
  - SSE streaming for price updates and ASIN imports
  - React Query for data fetching with custom hooks
  - CSS Modules for component-scoped styles
  - Design system components (Button, Card, Modal, Table, etc.)

## Deployment
  Production checklist:
  - Set JWT_SECRET to strong random value
  - Set NODE_ENV=production
  - Build commands (backend: npm run build, frontend: npm run build)
  - Reverse proxy (nginx/Caddy for SSL)
  - Process manager (PM2/systemd)
  - Ensure database directory is writable
  - Playwright browsers installed

## Troubleshooting
  Condensed — keep only 5-6 most common issues:
  - Node.js version
  - Playwright browsers
  - Port conflicts
  - Database permissions
  - Scraper failures
  - Stopping processes

## License
  ISC
```

### Key Differences from Current README
1. **Removed:** Verbose install.sh/run.sh documentation (~80 lines saved)
2. **Added:** Admin panel, notifications, setup wizard, scheduling, quotas, system config
3. **Updated:** Database schema (7 -> 13 tables), project structure tree, feature list
4. **Condensed:** Troubleshooting, configuration sections
5. **Added:** Deployment/production section
6. **Changed:** API section from full endpoint list to overview + link to full docs
7. **Updated:** Tech stack versions and dependencies

---

## Deliverable 2: improvements.md — Codebase Audit

### Format
Each item follows this structure:
1. **Severity tag + title** (`[Critical]`, `[High]`, `[Medium]`, `[Low]`)
2. **Current behavior** — what the code does now, with file:line references
3. **Impact** — real-world scenario showing why this matters
4. **Example** — code snippet or scenario demonstrating the problem
5. **Suggested fix** — specific technical approach

Each section ends with a **Recommended Next Steps** block listing concrete actions.

### Severity Scale
- **Critical** — Security vulnerability or data loss risk requiring immediate attention
- **High** — Significant limitation affecting reliability, scalability, or security
- **Medium** — Improvement that would meaningfully benefit the application
- **Low** — Nice-to-have optimization or best practice alignment

### Sections and Items

Verified against actual codebase — items corrected based on code review:

#### 1. Security (6 items)
1. `[High]` CORS allows all origins (`server.ts:25`, `origin: true`)
2. `[High]` JWT stored in localStorage (`AuthContext.tsx:43` — XSS-exfiltrable)
3. `[Medium]` No rate limiting on login/register (`auth.ts` — brute-force possible)
4. `[Medium]` No CSRF protection on state-changing requests
5. `[Medium]` JWT secret has a working default in dev mode (`config.ts`)
6. `[Low]` No security headers — no Helmet, CSP, HSTS, X-Frame-Options (`server.ts`)

Note: Removed "no request body size limits" — Express default 100kb is reasonable.

#### 2. Database & Storage (6 items)
1. `[High]` Price history grows unbounded — no retention, compaction, or archival
2. `[Medium]` SQLite not in WAL mode — concurrent reads blocked during writes (`migrations.ts` — no PRAGMA)
3. `[Medium]` No VACUUM strategy — DB file never shrinks after bulk deletes
4. `[Medium]` `getPriceHistory()` fetches ALL rows — no LIMIT or date range (`product-repo.ts:265`)
5. `[Low]` Image URLs stored but never refreshed — stale Amazon CDN links over time
6. `[Low]` No composite index on `price_history(product_id, date)` for range queries (`migrations.ts:314` — only `product_id`)

Note: Removed "category deduplication" — UNIQUE constraint on name handles this.

#### 3. Backend & API (5 items)
1. `[Medium]` No request validation middleware — manual field checks in each route handler
2. `[Medium]` Graceful shutdown stops scheduler but doesn't drain HTTP connections (`server.ts:119-129`)
3. `[Low]` No API versioning — breaking changes affect all clients
4. `[Low]` Health endpoint checks DB readiness flag but not live connectivity (`server.ts:54-56`)
5. `[Low]` No request ID / correlation for tracing across log entries

Note: Removed "inconsistent error format" — verified all routes use `{ error: "message" }` consistently. Removed "nonsensical cron" — node-cron validates expressions.

#### 4. Scraper (7 items)
1. `[High]` Single browser instance shared across all users — bottleneck and SPOF (`scraper.ts:4-6`)
2. `[Medium]` Fixed 2-second delay — not adaptive to Amazon response times or 429s
3. `[Medium]` No proxy support — single IP gets blocked with scale
4. `[Medium]` CAPTCHA detected but no recovery — scraping stops, no retry or admin alert
5. `[Medium]` Firefox browser with Chrome UA — fingerprintable mismatch
6. `[Low]` Hardcoded for Amazon.com.br — not region-configurable
7. `[Low]` Selector fallback chain logged to console only — broken selectors not surfaced to admin

#### 5. Multi-User Concurrency (5 items)
1. `[High]` Global `isUpdating` flag rejects all concurrent update requests while any single update runs (`scheduler.ts:9,81-86`)
2. `[High]` No job queue — price updates run synchronously inline with HTTP request
3. `[Medium]` Scheduler processes all users sequentially — O(users * products) wall time
4. `[Medium]` SSE connections not cleaned up on client disconnect (`prices.ts` — no `req.on('close')`)
5. `[Low]` No admin visibility into running/queued scrape jobs

Note: Removed "per-user schedule isolation" — verified schedules are evaluated independently.

#### 6. System Resources (4 items)
1. `[Medium]` Playwright browser stays resident in manual update scenarios (~200MB idle)
2. `[Medium]` No memory or CPU monitoring — OOM kills go undetected in background mode
3. `[Medium]` Single-threaded Node.js — cannot utilize multiple CPU cores
4. `[Low]` Log files from run.sh grow unbounded — no rotation or size limits

Note: Removed "no connection pooling" — single SQLite connection is correct for SQLite. Removed "postinstall browser download" — this is intentional and documented.

#### 7. Frontend Performance (4 items)
1. `[Medium]` Dashboard, Auth, AppShell eagerly loaded — could be deferred (`App.tsx:4-6,11`)
2. `[Low]` Global CSS (~550 lines) loaded on every page — no route-based CSS splitting
3. `[Low]` No service worker or PWA caching — offline banner shows status but can't serve cached content
4. `[Low]` Product images not lazy-loaded — all thumbnails fetch eagerly (`ProductList.tsx:407-412`)

Note: Removed "React Query refetch on focus" — verified `refetchOnWindowFocus: false` is set. Removed "Recharts tree-shaking" — named imports are used correctly.

#### 8. DevOps & Reliability (6 items)
1. `[High]` No test suite — zero automated testing, only debug utilities in `backend/test/`
2. `[Medium]` No CI/CD pipeline — no automated build, lint, or type checks on push
3. `[Medium]` No database backup automation — manual export via admin panel only
4. `[Medium]` No Docker support — deployment requires manual Node.js + Playwright setup
5. `[Low]` No structured logging (JSON) — console.log with timestamps only
6. `[Low]` tsconfig includes test files outside rootDir — pre-existing tsc errors

### Total: 43 verified items across 8 sections

Each item includes file references, code snippets, impact scenarios, and concrete fix suggestions as shown in the agreed-upon format.

---

## Implementation Notes

- **README:** Complete rewrite of `README.md` in project root
- **improvements.md:** New file in project root at `improvements.md`
- Both files use GitHub-flavored markdown
- No code changes — documentation only
- Commit both files together
