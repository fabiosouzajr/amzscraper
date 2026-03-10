# Backend - Amazon Price Tracker

## Commands

```bash
npm run dev        # Dev server with hot reload (ts-node-dev, port 3000)
npm run build      # Compile TypeScript to ./dist/
npm start          # Production: run compiled JS from ./dist/server.js
npm run watch      # TypeScript watch mode
npm install        # Install dependencies + Playwright browsers (Firefox + Chromium) via postinstall
```

**Note**: The `postinstall` script automatically installs Playwright browsers after `npm install`. This ensures the scraper has the required browsers for web scraping.

No test runner configured. Files in `test/` are debug/analysis utilities, not test suites.

## Architecture

Express.js + TypeScript API with SQLite database and Playwright-based Amazon scraper.

```
src/
  server.ts              # Entry point, route registration, scheduler init
  middleware/
    auth.ts            # JWT auth middleware + token generation
    admin.ts           # Admin-only middleware (requireAdmin)
  routes/
    auth.ts              # Register, login, logout, /me, change-password
    products.ts          # Product CRUD, search, categories, price history
    prices.ts            # Manual price update trigger (SSE streaming)
    dashboard.ts         # Price drops/increases statistics
    lists.ts             # Custom user lists management
    config.ts            # ASIN import/export, DB export, user schedule
    admin.ts             # User management, stats, config, audit log (admin-only)
  services/
    database.ts          # All SQL queries, schema, migrations (~1600 lines)
    scraper.ts           # Playwright browser automation (Firefox headless)
    scheduler.ts         # node-cron daily price updates + per-user scheduling
  models/types.ts        # TypeScript interfaces
  utils/
    logger.ts            # Overrides console.log with timestamps
    validation.ts        # ASIN, username, password, cron validation
```

## Database

- **SQLite3** with direct SQL queries (no ORM)
- DB file: `database/products.db` (auto-created with directory)
- Schema migrations run automatically on startup in `database.ts`
- Tables: `users`, `products`, `categories`, `product_categories`, `price_history`, `user_lists`, `product_lists`, `audit_log`, `system_config`, `user_schedule`
- All data is user-scoped (`user_id` foreign keys, unique constraint on `user_id + asin`)

## Multi-User Admin Features

### Authentication & Authorization
- **Role-based access control**: USER vs ADMIN roles stored in JWT token payload
- **Admin middleware**: `requireAdmin()` protects admin-only routes
- **Disabled user check**: `authenticate()` middleware rejects disabled users (403 Forbidden)

### User Management
- **User CRUD**: Admin can create, list, view stats, enable/disable users
- **Password reset**: Admin can reset user passwords
- **User stats**: Track product count, list count, price history count per user

### System Configuration
- **Config table**: Store system-wide settings (quota limits, scheduler settings)
- **Quotas**:
  - `quota.max_products`: Max products per user (default: 100)
  - `quota.max_lists`: Max lists per user (default: 20)
  - Quota enforced on product/list creation (returns 429 if exceeded)
- **Scheduler**:
  - System-wide scheduler (configurable cron, disabled by default)
  - Per-user scheduling: Users can set their own cron expressions
  - Each user's schedule stored in `user_schedule` table

### Audit Logging
- **Audit log table**: Track all admin actions
- **Logged actions**: CREATE_USER, DISABLE_USER, ENABLE_USER, RESET_PASSWORD, UPDATE_CONFIG
- **Fields**: admin_user_id, action, target_type, target_id, details, timestamp
- **Retrievable**: Admin can query audit logs with pagination and filters

### Security Features
- **Rate limiting**: Admin endpoints limited to 100 requests per 15 minutes per admin
- **Input validation**: Username (3-30 chars), password (min 6 chars), cron format validation
- **Audit trail**: All admin actions logged with admin user and timestamp

## Environment Variables

```
PORT=3000                    # Primary server port (default: 3000)
PORT_FALLBACK=3001           # Fallback port if PORT is in use (default: 3001)
JWT_SECRET=<secret>          # JWT signing key (MUST change from default in production)
INITIAL_ADMIN_USERNAME=admin   # Optional: Create/promote user to admin on startup
INITIAL_ADMIN_PASSWORD=change-this-password-immediately  # Optional: Set initial admin password
```

## Key Patterns

- **Auth**: JWT Bearer tokens, 7-day expiry, bcrypt password hashing. All routes except `/api/auth/*` require `authenticate` middleware.
- **SSE streaming**: `/api/prices/update` and `/api/config/import-asins` use Server-Sent Events for real-time progress.
- **Scraper**: Playwright Firefox with Chrome user-agent. 4s page load delay, 2s between requests. Cascading CSS selector fallbacks. Portuguese + English availability pattern matching.
- **Scheduler**: Singleton with `isUpdating` flag to prevent concurrent runs. Default: daily at midnight.
- **Server binds to `0.0.0.0`** (Tailscale-compatible).

## Gotchas

- `database.ts` path resolution uses `__dirname` which differs between compiled (`dist/`) and source (`src/`).
- Price field is nullable - products can be unavailable with `unavailable_reason` tracked.
- ASIN validation: exactly 10 alphanumeric chars, stored uppercase.
- `logger.ts` overrides global `console.log/warn/error` with timestamped versions - imported in `server.ts`.
- CORS is open (no origin restrictions) - relies on Tailscale for access control.
- No explicit DB transaction support - uses `sqlite3.serialize()` for ordered execution.
