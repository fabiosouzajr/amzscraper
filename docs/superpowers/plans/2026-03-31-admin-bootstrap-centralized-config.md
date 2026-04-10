# Admin Bootstrap & Centralized Configuration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Centralize all configuration into typed modules with schema validation, replace the env-var-only admin bootstrap with a secure first-run setup flow, and gate open registration behind an admin toggle.

**Architecture:** A single `backend/src/config.ts` module becomes the sole reader of `process.env`, validated at startup with fail-fast on unsafe values. The frontend gains a `GET /api/setup/status` endpoint to detect first-run and render a setup wizard. Registration is gated behind a `registration_enabled` system_config key. DB-backed admin settings remain in `system_config` but are cleanly separated from immutable deployment config.

**Tech Stack:** TypeScript, Express, SQLite, React 18, Vite, CSS Modules

---

> **Pre-read items** -- skim these before starting:
> - `backend/src/server.ts` -- entry point, current admin bootstrap
> - `backend/src/middleware/auth.ts` -- JWT_SECRET location, token generation
> - `backend/src/utils/portManager.ts` -- PORT/PORT_FALLBACK handling
> - `backend/src/services/database.ts` -- DB path, DatabaseService constructor
> - `backend/src/services/db/migrations.ts` -- system_config seeds
> - `backend/src/services/scheduler.ts` -- hardcoded cron default
> - `backend/src/routes/auth.ts` -- open registration endpoint
> - `frontend/vite.config.ts` -- hardcoded port/proxy
> - `run.sh` -- operational script with port prompts

---

## 1. Codebase Findings Summary

### What exists today

**Admin bootstrap:** `server.ts:66-82` checks for `INITIAL_ADMIN_USERNAME` + `INITIAL_ADMIN_PASSWORD` env vars after DB ready. If both are set, creates or promotes the user to ADMIN. If neither is set, **there is no way to create an admin** except by directly manipulating the database. This is the only admin creation mechanism outside the admin API itself (which requires an existing admin).

**Auth registration:** `POST /api/auth/register` (`routes/auth.ts:17`) is completely open -- any anonymous caller can self-register as `USER` role. There is no invite code, admin approval, feature flag, or registration toggle. This means on a fresh install, anyone who can reach the API can create accounts, but none of them can become admin without the env var bootstrap.

**Configuration spread:** Exactly 5 `process.env` reads exist across the backend, scattered across 3 files (`auth.ts`, `portManager.ts`, `server.ts`). Each reads its own env var independently with inline defaults. No validation, no typing, no fail-fast.

**DB-backed config:** `system_config` table stores 6 keys (4 quotas + `scheduler_enabled` + `scheduler_cron`). Read via `getConfig(key)` in `admin-repo.ts`, but notification-repo bypasses this and does direct SQL. The scheduler config keys are **inert** -- `scheduler.ts:11` hardcodes `'0 0 * * *'` and ignores the DB values.

### Risks and gaps

| Risk | Severity | Details |
|------|----------|---------|
| Insecure JWT default | **Critical** | `auth.ts:6` defaults to `'your-secret-key-change-in-production'`. Any deployment that forgets to set `JWT_SECRET` is trivially compromised. |
| No admin without env vars | **High** | Fresh installs with no env vars have no path to admin access. Users must hack the database. |
| Open registration | **Medium** | Anyone on the network can create unlimited accounts. No toggle to disable. |
| Hardcoded DB path | **Low** | `database.ts:12` resolves `../../../database/products.db` from `__dirname`. Not configurable for containerized deployments or testing. |
| Port mismatch risk | **Medium** | `run.sh` defaults to port `3030` for backend, but Vite proxy hardcodes `http://localhost:3000`. Users who accept the default get a broken setup. |
| Scheduler ignores DB config | **Low** | `scheduler_enabled` and `scheduler_cron` are seeded in `system_config` but never read at startup. Admin edits to these values have no effect. |
| Requests during migration | **Low** | Express starts listening before `dbService.ready` resolves. HTTP requests arriving during the ~100ms migration window would hit undefined repo methods. |

---

## 2. Parameter Inventory Table

### Backend / Runtime

| Parameter | Layer | Current Source | Default | Used By | Risk if Misconfigured | Centralize? |
|-----------|-------|---------------|---------|---------|----------------------|-------------|
| `JWT_SECRET` | Env var | `auth.ts:6` | `'your-secret-key-change-in-production'` | JWT sign/verify | **Critical** -- tokens forged | Yes, fail-fast |
| `PORT` | Env var | `portManager.ts:10` | `3000` | Express listen | Low -- wrong port | Yes |
| `PORT_FALLBACK` | Env var | `portManager.ts:11` | `3001` | Express fallback | Low -- wrong port | Yes |
| `INITIAL_ADMIN_USERNAME` | Env var | `server.ts:66` | none (optional) | Admin bootstrap | Medium -- no admin created | Replace with setup flow |
| `INITIAL_ADMIN_PASSWORD` | Env var | `server.ts:67` | none (optional) | Admin bootstrap | Medium -- no admin created | Replace with setup flow |
| DB file path | Hardcoded | `database.ts:12` | `../../../database/products.db` | All DB operations | Low -- wrong path | Yes |
| Bind address | Hardcoded | `server.ts:58`, `portManager.ts:66` | `'0.0.0.0'` | Server listen | Low -- not reachable | Yes |
| JWT expiry | Hardcoded | `auth.ts:54` | `'7d'` | Token generation | Low -- UX impact | Yes |
| Bcrypt rounds | Hardcoded | `user-repo.ts:9,46,87` | `10` | Password hashing | Low -- perf/security tradeoff | Yes |
| CORS origin | Hardcoded | `server.ts:26` | `true` (all origins) | Express CORS | Medium -- security in prod | Yes |
| Admin rate limit | Hardcoded | `admin.ts:10-16` | `100 req / 15 min` | Admin endpoints | Low | Optional |
| Max page size | Hardcoded | `products.ts:27` | `100` | Product listing | Low | Optional |

### Backend / Scraper

| Parameter | Layer | Current Source | Default | Used By | Risk if Misconfigured | Centralize? |
|-----------|-------|---------------|---------|---------|----------------------|-------------|
| Amazon base URL | Hardcoded | `scraper.ts:42` | `https://www.amazon.com.br` | Scraper | Medium -- wrong marketplace | Optional |
| User agent | Hardcoded | `scraper.ts:16` | Chrome 120 UA string | Browser context | Low -- blocked | Optional |
| Viewport | Hardcoded | `scraper.ts:18` | `1920x1080` | Browser context | Low | No |
| Page load timeout | Hardcoded | `scraper.ts:46` | `60000` ms | Page navigation | Low | Optional |
| Post-load delay | Hardcoded | `scraper.ts:49` | `4000` ms | Content wait | Low | Optional |
| Retry count | Hardcoded | `scraper.ts:33` | `2` | Scrape retry | Low | Optional |
| Inter-product delay | Hardcoded | `scraper.ts:185,296` | `2000` ms | Scrape loop | Low | Optional |

### Backend / DB-backed (system_config)

| Parameter | Layer | Current Source | Default | Used By | Risk if Misconfigured | Centralize? |
|-----------|-------|---------------|---------|---------|----------------------|-------------|
| `quota_max_products` | DB | `migrations.ts:343` | `'100'` | `product-repo.ts` | Low -- UX impact | Keep in DB |
| `quota_max_lists` | DB | `migrations.ts:344` | `'20'` | `list-repo.ts` | Low -- UX impact | Keep in DB |
| `quota_max_notification_channels` | DB | `migrations.ts:345` | `'5'` | `notification-repo.ts` (direct SQL) | Low | Keep in DB, fix access |
| `quota_max_notification_rules` | DB | `migrations.ts:346` | `'20'` | `notification-repo.ts` (direct SQL) | Low | Keep in DB, fix access |
| `scheduler_enabled` | DB | `migrations.ts:347` | `'true'` | **Nothing** (inert) | None currently | Keep in DB, wire up |
| `scheduler_cron` | DB | `migrations.ts:348` | `'0 0 * * *'` | **Nothing** (inert) | None currently | Keep in DB, wire up |

### Frontend / Build & Runtime

| Parameter | Layer | Current Source | Default | Used By | Risk if Misconfigured | Centralize? |
|-----------|-------|---------------|---------|---------|----------------------|-------------|
| Vite dev port | Build config | `vite.config.ts:31` | `5174` | Dev server | Low | Optional (env var) |
| Vite proxy target | Build config | `vite.config.ts:39` | `http://localhost:3000` | API proxy | **Medium** -- broken API | Yes (env var) |
| Allowed hosts | Build config | `vite.config.ts:32-36` | `localhost`, `*.ts.net` | Vite HMR | Low | Optional |
| API base URL | Hardcoded | `api.ts:3` | `'/api'` | All API calls | Low -- relative path | No change needed |
| Auth token key | Hardcoded | `AuthContext.tsx:23` | `'authToken'` | localStorage | Low | No |
| Cache TTL (default) | Hardcoded | `api.ts` | `60_000` ms | `cachedFetch` | Low | Optional |
| Cache TTL (categories) | Hardcoded | `api.ts` | `300_000` ms | Category tree | Low | Optional |
| React Query staleTime | Hardcoded | `queryClient.ts` | `60_000` ms | All queries | Low | No |
| Toast auto-dismiss | Hardcoded | `Toast.tsx:61` | `5000` ms | Toast component | Low | No |
| Mobile breakpoint | Hardcoded | multiple files | `'(max-width: 767px)'` | useMediaQuery | Low | No |

### Operational Scripts

| Parameter | Layer | Current Source | Default | Used By | Risk if Misconfigured | Centralize? |
|-----------|-------|---------------|---------|---------|----------------------|-------------|
| Backend port prompt | Script | `run.sh:10-11` | `3030` | nohup launch | **Medium** -- mismatch with Vite proxy `3000` | Fix default |
| Frontend port prompt | Script | `run.sh:14-15` | `5174` | nohup launch | Low | Keep |

---

## 3. Target Architecture

### 3.1 Backend Config Module

Create a single `backend/src/config.ts` that is the **sole** reader of `process.env`. All other modules import typed values from it.

```
backend/src/config.ts          # Reads process.env, validates, exports typed config
backend/src/config.schema.ts   # (optional, if using zod -- otherwise inline)
```

**Design:**

```typescript
// backend/src/config.ts
import 'dotenv/config';

interface AppConfig {
  // Server
  port: number;
  portFallback: number;
  bindAddress: string;

  // Security
  jwtSecret: string;
  jwtExpiresIn: string;
  bcryptRounds: number;
  corsOrigin: boolean | string;

  // Database
  dbPath: string;

  // Admin bootstrap (legacy, kept for backward compat)
  initialAdminUsername: string | null;
  initialAdminPassword: string | null;

  // Environment
  nodeEnv: 'development' | 'production' | 'test';
  isProduction: boolean;
}

function loadConfig(): AppConfig {
  const nodeEnv = (process.env.NODE_ENV || 'development') as AppConfig['nodeEnv'];
  const isProduction = nodeEnv === 'production';

  const jwtSecret = process.env.JWT_SECRET || '';
  if (!jwtSecret) {
    throw new Error('FATAL: JWT_SECRET environment variable is required. Server cannot start without it.');
  }
  if (jwtSecret === 'your-secret-key-change-in-production') {
    if (isProduction) {
      throw new Error('FATAL: JWT_SECRET is set to the insecure default. Set a real secret.');
    }
    console.warn('WARNING: Using default JWT_SECRET. Set JWT_SECRET env var for production.');
  }

  const port = parseInt(process.env.PORT || '3000', 10);
  const portFallback = parseInt(process.env.PORT_FALLBACK || '3001', 10);

  if (isNaN(port) || port < 1 || port > 65535) throw new Error(`Invalid PORT: ${process.env.PORT}`);
  if (isNaN(portFallback) || portFallback < 1 || portFallback > 65535) throw new Error(`Invalid PORT_FALLBACK`);

  const dbPath = process.env.DB_PATH || path.resolve(__dirname, '../../database/products.db');

  return {
    port,
    portFallback,
    bindAddress: process.env.BIND_ADDRESS || '0.0.0.0',
    jwtSecret,
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
    bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS || '10', 10),
    corsOrigin: process.env.CORS_ORIGIN || true,
    dbPath,
    initialAdminUsername: process.env.INITIAL_ADMIN_USERNAME || null,
    initialAdminPassword: process.env.INITIAL_ADMIN_PASSWORD || null,
    nodeEnv,
    isProduction,
  };
}

export const config = loadConfig();
```

**Fail-fast policy:**
- `JWT_SECRET` empty or default in production: process crashes immediately with clear message.
- `JWT_SECRET` default in development: warning log but allowed.
- Invalid port numbers: process crashes.
- All other values: sensible defaults, no crash.

**Migration approach:**
- Phase 1: Create `config.ts`, update all `process.env` consumers to import from it.
- `auth.ts`, `portManager.ts`, `server.ts` each lose their direct `process.env` reads.
- `database.ts` gets its path from `config.dbPath` instead of hardcoded resolution.
- Backward compatible: all existing env vars continue to work unchanged.

### 3.2 Frontend Config

The frontend has minimal configuration needs. The API base URL `/api` is a relative path that works in all environments (Vite proxy in dev, reverse proxy in prod). **No change needed for runtime config.**

For the Vite dev proxy target, add env var support:

```typescript
// vite.config.ts
server: {
  port: parseInt(process.env.VITE_DEV_PORT || '5174', 10),
  proxy: {
    '/api': {
      target: process.env.VITE_API_TARGET || 'http://localhost:3000',
      changeOrigin: true
    }
  }
}
```

These are **build-time / dev-server** config values, read by Vite's Node process (not bundled into the browser). No `import.meta.env` needed.

### 3.3 Separation of Concerns

| Category | Storage | Mutable at Runtime? | Who Controls? | Examples |
|----------|---------|---------------------|---------------|---------|
| **Deployment config** | Env vars -> `config.ts` | No (restart required) | Operator/deployer | PORT, JWT_SECRET, DB_PATH |
| **Admin settings** | `system_config` table | Yes (via admin API) | Admin user | Quotas, scheduler cron, registration toggle |
| **App constants** | Source code | No (redeploy required) | Developer | Bcrypt rounds, scraper timeouts, page sizes |

**Rule:** If a value changes between deployments (dev/staging/prod), it's deployment config. If an admin should change it without redeploying, it's an admin setting. Everything else is a source-code constant.

---

## 4. Admin Bootstrap Design

### 4.1 Startup / Admin Existence Check

On every server startup, after `dbService.ready`:

```
1. Query: SELECT COUNT(*) FROM users WHERE role = 'ADMIN'
2. Store result as `hasAdmin` boolean
3. Expose via GET /api/setup/status (public, no auth)
```

The `GET /api/setup/status` endpoint returns:

```json
{ "needsSetup": true }   // no admin exists
{ "needsSetup": false }  // at least one admin exists
```

This endpoint is always public. It reveals only one bit of information (whether setup is needed), which is acceptable since the setup page would be visible anyway.

### 4.2 First-Run Setup Flow

**API: `POST /api/setup/admin`**

- Only callable when `needsSetup === true` (no admin exists).
- Accepts `{ username, password }`.
- Creates the user with `role: 'ADMIN'`.
- Returns a JWT token (logs the admin in immediately).
- Once an admin exists, this endpoint returns `403 Forbidden` permanently.

```typescript
// backend/src/routes/setup.ts
router.post('/admin', async (req, res) => {
  // Check if setup is already complete
  const stats = await dbService.getSystemStats();
  if (stats.total_admins > 0) {
    return res.status(403).json({ error: 'Setup already complete. An admin user exists.' });
  }

  const { username, password } = req.body;
  // ... validate username/password (same rules as register) ...

  const user = await dbService.createAdminUser(username, password);
  const token = generateToken(user);

  // Log to audit
  await dbService.addAuditLog(user.id, 'SETUP_ADMIN', 'user', user.id, 'Initial admin created via setup wizard');

  res.status(201).json({ user: { id: user.id, username: user.username, role: user.role }, token });
});
```

**Frontend: Setup Wizard Component**

When `AuthContext` mounts and `user === null`:
1. Call `GET /api/setup/status`.
2. If `needsSetup === true`, render `<SetupWizard>` instead of `<Auth>`.
3. `<SetupWizard>` shows a "Welcome" screen with admin account creation form.
4. On submit, calls `POST /api/setup/admin`, stores token, redirects to dashboard.
5. If `needsSetup === false`, render normal `<Auth>` (login/register).

### 4.3 Security Controls

| Control | Implementation |
|---------|---------------|
| **One-time gate** | `POST /api/setup/admin` checks admin count before every call. Returns 403 if any admin exists. |
| **No setup token** | No secret token needed -- the endpoint is self-disabling. The window is only open when zero admins exist. |
| **Rate limiting** | Apply rate limiter (5 req/min per IP) to `/api/setup/*` to prevent brute force during the setup window. |
| **Audit log** | Log `SETUP_ADMIN` action in `audit_log` when the first admin is created. |
| **No plaintext persistence** | Password is bcrypt-hashed before DB insert (existing `createAdminUser` behavior). Env vars `INITIAL_ADMIN_USERNAME`/`INITIAL_ADMIN_PASSWORD` are kept for backward compat but documented as deprecated. |
| **Input validation** | Same rules as registration: username 3-30 chars, password min 6 chars. |

### 4.4 Edge Cases

| Edge Case | Handling |
|-----------|---------|
| **Concurrent setup requests** | SQLite serializes writes. The second `POST /api/setup/admin` will find `total_admins > 0` after the first insert commits, and return 403. |
| **Multi-instance startup** | Not applicable -- SQLite is single-file, single-writer. Only one server instance should run against a given DB file. |
| **Partial setup (crash mid-create)** | `createAdminUser` is a single INSERT. SQLite is atomic at the statement level. Either the user exists or it doesn't. |
| **Env var bootstrap + setup flow** | If `INITIAL_ADMIN_USERNAME`/`INITIAL_ADMIN_PASSWORD` are set, the env-var bootstrap runs first (on startup). The setup endpoint then sees an admin exists and self-disables. No conflict. |
| **Rollback** | If setup needs to be re-run: `DELETE FROM users WHERE role = 'ADMIN'` resets the gate. Document this as an emergency procedure. |

### 4.5 Registration Gating

Add a new `system_config` key: `registration_enabled` with default `'true'` (preserves current open behavior).

Modify `POST /api/auth/register`:
```typescript
// Before creating user:
const registrationEnabled = await dbService.getConfig('registration_enabled');
if (registrationEnabled?.value !== 'true') {
  return res.status(403).json({ error: 'Registration is currently disabled. Contact an administrator.' });
}
```

Frontend `<Auth>` component: call `GET /api/setup/status` (extend to include `registrationEnabled`), hide the "Register" tab/link when registration is disabled.

---

## 5. Step-by-Step Implementation Plan

### Phase 1: Backend Config Module

#### Task 1 -- Create `config.ts`

**Files:**
- Create: `backend/src/config.ts`

- [x] **Step 1.1: Create the config module**

Create `backend/src/config.ts`:

```typescript
import path from 'path';

export interface AppConfig {
  // Server
  port: number;
  portFallback: number;
  bindAddress: string;

  // Security
  jwtSecret: string;
  jwtExpiresIn: string;
  bcryptRounds: number;

  // Database
  dbPath: string;

  // Admin bootstrap (legacy -- deprecated, use setup flow)
  initialAdminUsername: string | null;
  initialAdminPassword: string | null;

  // Environment
  nodeEnv: 'development' | 'production' | 'test';
  isProduction: boolean;
}

function loadConfig(): AppConfig {
  const nodeEnv = (process.env.NODE_ENV || 'development') as AppConfig['nodeEnv'];
  const isProduction = nodeEnv === 'production';

  // JWT_SECRET: required in production, warned in development
  const jwtSecret = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
  if (isProduction && jwtSecret === 'your-secret-key-change-in-production') {
    console.error('FATAL: JWT_SECRET is set to the insecure default. Set a real JWT_SECRET for production.');
    process.exit(1);
  }
  if (jwtSecret === 'your-secret-key-change-in-production') {
    console.warn('WARNING: Using default JWT_SECRET. Set JWT_SECRET env var for production.');
  }

  // Port validation
  const port = parseInt(process.env.PORT || '3000', 10);
  const portFallback = parseInt(process.env.PORT_FALLBACK || '3001', 10);
  if (isNaN(port) || port < 1 || port > 65535) {
    console.error(`FATAL: Invalid PORT value: "${process.env.PORT}". Must be 1-65535.`);
    process.exit(1);
  }
  if (isNaN(portFallback) || portFallback < 1 || portFallback > 65535) {
    console.error(`FATAL: Invalid PORT_FALLBACK value: "${process.env.PORT_FALLBACK}". Must be 1-65535.`);
    process.exit(1);
  }

  // Database path: configurable via DB_PATH, default relative to project root
  const dbPath = process.env.DB_PATH || path.resolve(__dirname, '../../database/products.db');

  return {
    port,
    portFallback,
    bindAddress: process.env.BIND_ADDRESS || '0.0.0.0',
    jwtSecret,
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
    bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS || '10', 10),
    dbPath,
    initialAdminUsername: process.env.INITIAL_ADMIN_USERNAME || null,
    initialAdminPassword: process.env.INITIAL_ADMIN_PASSWORD || null,
    nodeEnv,
    isProduction,
  };
}

export const config = loadConfig();
```

- [x] **Step 1.2: Verify the file compiles**

```bash
cd backend && npx tsc --noEmit src/config.ts
```

Expected: no errors.

- [x] **Step 1.3: Commit**

```bash
git add backend/src/config.ts
git commit -m "feat: add centralized backend config module with validation"
```

---

#### Task 2 -- Migrate auth.ts to use config

**Files:**
- Modify: `backend/src/middleware/auth.ts`

- [x] **Step 2.1: Replace process.env.JWT_SECRET with config import**

In `backend/src/middleware/auth.ts`, replace line 6:

```typescript
// Remove:
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

// Add:
import { config } from '../config';
const JWT_SECRET = config.jwtSecret;
```

Also update `generateToken` to use config for expiry (line 54):

```typescript
// Replace hardcoded '7d':
{ expiresIn: config.jwtExpiresIn }
```

- [x] **Step 2.2: Build check**

```bash
cd backend && npx tsc --noEmit
```

- [x] **Step 2.3: Commit**

```bash
git add backend/src/middleware/auth.ts
git commit -m "refactor: migrate auth middleware to centralized config"
```

---

#### Task 3 -- Migrate portManager.ts to use config

**Files:**
- Modify: `backend/src/utils/portManager.ts`

- [x] **Step 3.1: Replace process.env reads with config import**

In `backend/src/utils/portManager.ts`, update the `getAvailablePort` function signature:

```typescript
import { config } from '../config';

export async function getAvailablePort(
  primaryPort: number = config.port,
  fallbackPort: number = config.portFallback
): Promise<number> {
  // Remove the port validation block (lines 14-19) -- config.ts already validates
  // Keep the rest of the function unchanged
```

Also update the bind address in `isPortAvailable` (line 66):

```typescript
server.listen(port, config.bindAddress);
```

- [x] **Step 3.2: Build check**

```bash
cd backend && npx tsc --noEmit
```

- [x] **Step 3.3: Commit**

```bash
git add backend/src/utils/portManager.ts
git commit -m "refactor: migrate portManager to centralized config"
```

---

#### Task 4 -- Migrate server.ts to use config

**Files:**
- Modify: `backend/src/server.ts`

- [x] **Step 4.1: Replace process.env reads and use config**

In `backend/src/server.ts`:

1. Remove `import 'dotenv/config';` (line 2) -- move it to `config.ts` or to the very top of `server.ts` before config import. Since `config.ts` calls `loadConfig()` at import time and reads `process.env`, dotenv must be loaded first. **Add `import 'dotenv/config';` as the first line of `config.ts`** instead.

2. Import config:
```typescript
import { config } from './config';
```

3. Replace admin bootstrap block (lines 66-82):
```typescript
// Replace:
const initialAdminUsername = process.env.INITIAL_ADMIN_USERNAME;
const initialAdminPassword = process.env.INITIAL_ADMIN_PASSWORD;

// With:
const { initialAdminUsername, initialAdminPassword } = config;
```

4. Replace bind address (line 58):
```typescript
const server = app.listen(PORT, config.bindAddress, async () => {
```

- [x] **Step 4.2: Move dotenv import to config.ts**

Add `import 'dotenv/config';` as the very first line of `backend/src/config.ts` (before the `path` import). Remove the same import from `server.ts` line 2.

- [x] **Step 4.3: Build check**

```bash
cd backend && npx tsc --noEmit
```

- [x] **Step 4.4: Start the server and verify it works**

```bash
cd backend && npm run dev
```

Expected: server starts, prints "WARNING: Using default JWT_SECRET" (in dev mode), listens on port 3000.

- [x] **Step 4.5: Commit**

```bash
git add backend/src/config.ts backend/src/server.ts
git commit -m "refactor: migrate server.ts to centralized config, move dotenv to config module"
```

---

#### Task 5 -- Migrate database.ts to use config.dbPath

**Files:**
- Modify: `backend/src/services/database.ts`

- [x] **Step 5.1: Replace hardcoded DB_PATH**

In `backend/src/services/database.ts`, replace lines 12-13:

```typescript
// Remove:
const DB_PATH = path.resolve(__dirname, '../../../database/products.db');
const DB_DIR = path.dirname(DB_PATH);

// Add:
import { config } from '../config';
const DB_PATH = config.dbPath;
const DB_DIR = path.dirname(DB_PATH);
```

Also update `getDatabasePath()` (around line 23) -- it already returns `DB_PATH`, so no change needed there.

- [x] **Step 5.2: Build check**

```bash
cd backend && npx tsc --noEmit
```

- [x] **Step 5.3: Start server and verify DB still works**

```bash
cd backend && npm run dev
```

Expected: server starts, database opens at the same path as before.

- [x] **Step 5.4: Commit**

```bash
git add backend/src/services/database.ts
git commit -m "refactor: migrate database path to centralized config (supports DB_PATH env var)"
```

---

#### Task 6 -- Migrate bcrypt rounds to config

**Files:**
- Modify: `backend/src/services/db/user-repo.ts`

- [x] **Step 6.1: Replace hardcoded bcrypt rounds**

In `backend/src/services/db/user-repo.ts`, find all instances of `bcrypt.hash(password, 10)` (lines ~9, ~46, ~87). Replace with:

```typescript
import { config } from '../../config';

// Replace each: bcrypt.hash(password, 10)
// With:         bcrypt.hash(password, config.bcryptRounds)
```

- [x] **Step 6.2: Build check**

```bash
cd backend && npx tsc --noEmit
```

- [x] **Step 6.3: Commit**

```bash
git add backend/src/services/db/user-repo.ts
git commit -m "refactor: migrate bcrypt rounds to centralized config"
```

---

#### Task 7 -- Create `.env.example`

**Files:**
- Create: `backend/.env.example`

- [x] **Step 7.1: Create the example env file**

Create `backend/.env.example`:

```bash
# === Required ===
JWT_SECRET=change-me-to-a-random-string-at-least-32-chars

# === Optional (defaults shown) ===
# PORT=3000
# PORT_FALLBACK=3001
# BIND_ADDRESS=0.0.0.0
# DB_PATH=../database/products.db
# JWT_EXPIRES_IN=7d
# BCRYPT_ROUNDS=10
# NODE_ENV=development

# === Admin Bootstrap (legacy -- prefer the setup wizard instead) ===
# INITIAL_ADMIN_USERNAME=admin
# INITIAL_ADMIN_PASSWORD=change-this-immediately
```

- [x] **Step 7.2: Add `.env` to `.gitignore` if not already present**

Check `backend/.gitignore` for `.env`. If missing, add it.

- [x] **Step 7.3: Commit**

```bash
git add backend/.env.example
git commit -m "docs: add .env.example with all backend config options"
```

---

### Phase 2: Setup Flow API

#### Task 8 -- Add `registration_enabled` to system_config seeds

**Files:**
- Modify: `backend/src/services/db/migrations.ts`

- [x] **Step 8.1: Add the new config key**

In `backend/src/services/db/migrations.ts`, find the `initializeSystemConfig` function (around line 341). Add a new INSERT OR IGNORE after the existing ones:

```typescript
db.run(`INSERT OR IGNORE INTO system_config (key, value, description) VALUES (?, ?, ?)`,
  ['registration_enabled', 'true', 'Allow new user self-registration']);
```

- [x] **Step 8.2: Build check**

```bash
cd backend && npx tsc --noEmit
```

- [x] **Step 8.3: Commit**

```bash
git add backend/src/services/db/migrations.ts
git commit -m "feat: add registration_enabled config key to system_config seeds"
```

---

#### Task 9 -- Create setup routes

**Files:**
- Create: `backend/src/routes/setup.ts`
- Modify: `backend/src/server.ts`

- [x] **Step 9.1: Create the setup router**

Create `backend/src/routes/setup.ts`:

```typescript
import { Router, Request, Response } from 'express';
import { dbService } from '../services/database';
import { generateToken } from '../middleware/auth';
import rateLimit from 'express-rate-limit';

const router = Router();

// Rate limit setup endpoints: 5 requests per minute per IP
const setupLimiter = rateLimit({
  windowMs: 60_000,
  max: 5,
  message: { error: 'Too many setup attempts. Please wait.' },
});

// GET /api/setup/status - Check if initial setup is needed
router.get('/status', async (req: Request, res: Response) => {
  try {
    const stats = await dbService.getSystemStats();
    const totalAdmins = stats.total_admins ?? 0;

    // Also check registration policy for the auth UI
    const registrationConfig = await dbService.getConfig('registration_enabled');
    const registrationEnabled = registrationConfig?.value !== 'false';

    res.json({
      needsSetup: totalAdmins === 0,
      registrationEnabled,
    });
  } catch (error) {
    console.error('Error checking setup status:', error);
    res.status(500).json({ error: 'Failed to check setup status' });
  }
});

// POST /api/setup/admin - Create the initial admin user (only works when no admin exists)
router.post('/admin', setupLimiter, async (req: Request, res: Response) => {
  try {
    // Gate: only allowed when no admin exists
    const stats = await dbService.getSystemStats();
    if ((stats.total_admins ?? 0) > 0) {
      return res.status(403).json({ error: 'Setup already complete. An admin user already exists.' });
    }

    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    if (typeof username !== 'string' || username.length < 3 || username.length > 30) {
      return res.status(400).json({ error: 'Username must be between 3 and 30 characters' });
    }

    if (typeof password !== 'string' || password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    // Check if username is taken (edge case: a USER with this name already exists)
    const existing = await dbService.getUserByUsername(username);
    if (existing) {
      // Promote existing user to admin
      await dbService.setUserRole(existing.id, 'ADMIN');
      const token = generateToken({ ...existing, role: 'ADMIN' });
      await dbService.addAuditLog(existing.id, 'SETUP_ADMIN', 'user', existing.id,
        'Existing user promoted to admin via setup wizard');
      return res.status(200).json({
        user: { id: existing.id, username: existing.username, role: 'ADMIN' },
        token,
      });
    }

    // Create new admin user
    const user = await dbService.createAdminUser(username, password);
    const token = generateToken(user);

    await dbService.addAuditLog(user.id, 'SETUP_ADMIN', 'user', user.id,
      'Initial admin created via setup wizard');

    res.status(201).json({
      user: { id: user.id, username: user.username, role: user.role },
      token,
    });
  } catch (error) {
    console.error('Error during admin setup:', error);
    res.status(500).json({ error: 'Failed to create admin user' });
  }
});

export default router;
```

- [x] **Step 9.2: Mount the setup router in server.ts**

In `backend/src/server.ts`, add the import and route mount:

```typescript
import setupRouter from './routes/setup';

// Add BEFORE the other routes (so it's available during setup):
app.use('/api/setup', setupRouter);
```

- [x] **Step 9.3: Build check**

```bash
cd backend && npx tsc --noEmit
```

- [x] **Step 9.4: Commit**

```bash
git add backend/src/routes/setup.ts backend/src/server.ts
git commit -m "feat: add setup API endpoints for first-run admin creation"
```

---

#### Task 10 -- Gate registration behind config toggle

**Files:**
- Modify: `backend/src/routes/auth.ts`

- [x] **Step 10.1: Add registration check**

In `backend/src/routes/auth.ts`, at the top of the `POST /register` handler (after the `try {`), add:

```typescript
// Check if registration is enabled
const registrationConfig = await dbService.getConfig('registration_enabled');
if (registrationConfig?.value === 'false') {
  return res.status(403).json({ error: 'Registration is currently disabled. Contact an administrator.' });
}
```

- [x] **Step 10.2: Build check**

```bash
cd backend && npx tsc --noEmit
```

- [x] **Step 10.3: Commit**

```bash
git add backend/src/routes/auth.ts
git commit -m "feat: gate user registration behind registration_enabled config toggle"
```

---

### Phase 3: Frontend Setup Flow

#### Task 11 -- Add setup API calls to frontend

**Files:**
- Modify: `frontend/src/services/api.ts`

- [x] **Step 11.1: Add setup API methods**

In `frontend/src/services/api.ts`, add to the `api` object:

```typescript
// Setup
getSetupStatus: async (): Promise<{ needsSetup: boolean; registrationEnabled: boolean }> => {
  const response = await fetch(`${API_BASE_URL}/setup/status`);
  if (!response.ok) throw new Error('Failed to check setup status');
  return response.json();
},

setupAdmin: async (username: string, password: string): Promise<{ user: any; token: string }> => {
  const response = await fetch(`${API_BASE_URL}/setup/admin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.error || 'Setup failed');
  }
  return response.json();
},
```

- [x] **Step 11.2: Build check**

```bash
cd frontend && npm run build
```

- [x] **Step 11.3: Commit**

```bash
git add frontend/src/services/api.ts
git commit -m "feat: add setup API methods to frontend api service"
```

---

#### Task 12 -- Create SetupWizard component

**Files:**
- Create: `frontend/src/components/SetupWizard.tsx`
- Create: `frontend/src/components/SetupWizard.module.css`

- [x] **Step 12.1: Create the SetupWizard component**

Create `frontend/src/components/SetupWizard.tsx`:

```tsx
import { useState, FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../services/api';
import styles from './SetupWizard.module.css';

interface SetupWizardProps {
  onSetupComplete: (token: string) => void;
}

export default function SetupWizard({ onSetupComplete }: SetupWizardProps) {
  const { t } = useTranslation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError(t('setup.passwordMismatch'));
      return;
    }

    setLoading(true);
    try {
      const result = await api.setupAdmin(username, password);
      onSetupComplete(result.token);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('setup.failed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <h1 className={styles.title}>{t('setup.title')}</h1>
        <p className={styles.subtitle}>{t('setup.subtitle')}</p>

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.field}>
            <label htmlFor="setup-username" className={styles.label}>
              {t('setup.username')}
            </label>
            <input
              id="setup-username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className={styles.input}
              minLength={3}
              maxLength={30}
              required
              autoFocus
              autoComplete="username"
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="setup-password" className={styles.label}>
              {t('setup.password')}
            </label>
            <input
              id="setup-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={styles.input}
              minLength={6}
              required
              autoComplete="new-password"
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="setup-confirm" className={styles.label}>
              {t('setup.confirmPassword')}
            </label>
            <input
              id="setup-confirm"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className={styles.input}
              minLength={6}
              required
              autoComplete="new-password"
            />
          </div>

          {error && <p className={styles.error} role="alert">{error}</p>}

          <button
            type="submit"
            className={styles.button}
            disabled={loading || !username || !password || !confirmPassword}
          >
            {loading ? t('setup.creating') : t('setup.createAdmin')}
          </button>
        </form>
      </div>
    </div>
  );
}
```

- [x] **Step 12.2: Create the CSS module**

Create `frontend/src/components/SetupWizard.module.css`:

```css
.container {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-4);
  background: var(--color-bg-primary);
}

.card {
  width: 100%;
  max-width: 420px;
  padding: var(--space-8);
  background: var(--color-bg-elevated);
  border-radius: var(--radius-lg);
  border: 1px solid var(--color-border-primary);
  box-shadow: var(--shadow-lg);
}

.title {
  font-size: var(--font-size-2xl);
  font-weight: var(--font-weight-bold);
  color: var(--color-text-primary);
  margin: 0 0 var(--space-2);
  text-align: center;
}

.subtitle {
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
  margin: 0 0 var(--space-6);
  text-align: center;
  line-height: 1.5;
}

.form {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.field {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.label {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--color-text-primary);
}

.input {
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--color-border-primary);
  border-radius: var(--radius-md);
  font-size: var(--font-size-base);
  background: var(--color-bg-primary);
  color: var(--color-text-primary);
  transition: border-color 150ms ease;
}

.input:focus {
  outline: none;
  border-color: var(--color-accent-primary);
  box-shadow: 0 0 0 3px var(--color-accent-subtle);
}

.error {
  font-size: var(--font-size-sm);
  color: var(--color-danger);
  margin: 0;
  padding: var(--space-2) var(--space-3);
  background: var(--color-danger-subtle);
  border-radius: var(--radius-md);
}

.button {
  padding: var(--space-3);
  background: var(--color-accent-primary);
  color: var(--color-text-inverse);
  border: none;
  border-radius: var(--radius-md);
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-semibold);
  cursor: pointer;
  transition: background 150ms ease;
  margin-top: var(--space-2);
}

.button:hover:not(:disabled) {
  background: var(--color-accent-hover);
}

.button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
```

- [x] **Step 12.3: Build check**

```bash
cd frontend && npm run build
```

- [x] **Step 12.4: Commit**

```bash
git add frontend/src/components/SetupWizard.tsx frontend/src/components/SetupWizard.module.css
git commit -m "feat: add SetupWizard component for first-run admin creation"
```

---

#### Task 13 -- Add i18n keys for setup

**Files:**
- Modify: `frontend/src/i18n/locales/en.json`
- Modify: `frontend/src/i18n/locales/pt-BR.json`

- [x] **Step 13.1: Add English translations**

In `frontend/src/i18n/locales/en.json`, add a `"setup"` section:

```json
"setup": {
  "title": "Welcome",
  "subtitle": "Create your administrator account to get started. This account will have full control over the system.",
  "username": "Admin username",
  "password": "Password",
  "confirmPassword": "Confirm password",
  "passwordMismatch": "Passwords do not match",
  "createAdmin": "Create Admin Account",
  "creating": "Creating account...",
  "failed": "Failed to create admin account"
}
```

- [x] **Step 13.2: Add Portuguese translations**

In `frontend/src/i18n/locales/pt-BR.json`, add a `"setup"` section:

```json
"setup": {
  "title": "Bem-vindo",
  "subtitle": "Crie sua conta de administrador para comecar. Esta conta tera controle total sobre o sistema.",
  "username": "Nome de usuario admin",
  "password": "Senha",
  "confirmPassword": "Confirmar senha",
  "passwordMismatch": "As senhas nao coincidem",
  "createAdmin": "Criar Conta Admin",
  "creating": "Criando conta...",
  "failed": "Falha ao criar conta admin"
}
```

- [x] **Step 13.3: Build check**

```bash
cd frontend && npm run build
```

- [x] **Step 13.4: Commit**

```bash
git add frontend/src/i18n/locales/en.json frontend/src/i18n/locales/pt-BR.json
git commit -m "feat: add i18n translations for setup wizard"
```

---

#### Task 14 -- Integrate SetupWizard into AuthContext and App

**Files:**
- Modify: `frontend/src/contexts/AuthContext.tsx`
- Modify: `frontend/src/App.tsx`

- [x] **Step 14.1: Add setup status to AuthContext**

In `frontend/src/contexts/AuthContext.tsx`:

1. Add to the context type:
```typescript
interface AuthContextType {
  user: User | null;
  loading: boolean;
  needsSetup: boolean;
  registrationEnabled: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string) => Promise<void>;
  logout: () => void;
  completeSetup: (token: string) => Promise<void>;
}
```

2. Add state variables:
```typescript
const [needsSetup, setNeedsSetup] = useState(false);
const [registrationEnabled, setRegistrationEnabled] = useState(true);
```

3. In the `useEffect` that runs on mount, before the token check, call setup status:
```typescript
useEffect(() => {
  const init = async () => {
    try {
      // Check if setup is needed
      const setupStatus = await api.getSetupStatus();
      setNeedsSetup(setupStatus.needsSetup);
      setRegistrationEnabled(setupStatus.registrationEnabled);

      // If setup is needed, skip token validation
      if (setupStatus.needsSetup) {
        setLoading(false);
        return;
      }

      // Existing token validation logic...
      const token = localStorage.getItem('authToken');
      if (token) { /* ... existing code ... */ }
    } catch (error) {
      console.error('Init error:', error);
    } finally {
      setLoading(false);
    }
  };
  init();
}, []);
```

4. Add `completeSetup` function:
```typescript
const completeSetup = async (token: string) => {
  localStorage.setItem('authToken', token);
  const response = await api.getMe(token);
  setUser(response);
  setNeedsSetup(false);
};
```

5. Expose new values in the provider:
```typescript
<AuthContext.Provider value={{
  user, loading, needsSetup, registrationEnabled,
  login, register, logout, completeSetup
}}>
```

- [x] **Step 14.2: Update App.tsx to render SetupWizard**

In `frontend/src/App.tsx`, find where `<Auth>` is rendered when `!user`. Add the setup check:

```tsx
import SetupWizard from './components/SetupWizard';

// In the render:
if (needsSetup) {
  return <SetupWizard onSetupComplete={completeSetup} />;
}
if (!user) {
  return <Auth registrationEnabled={registrationEnabled} />;
}
```

- [x] **Step 14.3: Update Auth component to respect registrationEnabled**

In the `<Auth>` component, accept a `registrationEnabled` prop. When `false`, hide the "Register" tab/toggle and only show the login form.

- [x] **Step 14.4: Build check**

```bash
cd frontend && npm run build
```

- [x] **Step 14.5: Manual verify**

Start both servers. With a fresh database (delete `database/products.db`):
1. Open the app -- should see the SetupWizard, not the login form.
2. Create an admin account -- should redirect to dashboard.
3. Log out -- should see the normal login form (not the setup wizard).
4. Register a new user -- should work (registration is enabled by default).

With the existing database (admin already exists):
1. Open the app -- should see the normal login form directly.

- [x] **Step 14.6: Commit**

```bash
git add frontend/src/contexts/AuthContext.tsx frontend/src/App.tsx frontend/src/components/Auth.tsx
git commit -m "feat: integrate setup wizard into auth flow for first-run admin creation"
```

---

### Phase 4: Frontend Build Config

#### Task 15 -- Make Vite proxy target configurable

**Files:**
- Modify: `frontend/vite.config.ts`

- [x] **Step 15.1: Add env var support for proxy target and dev port**

In `frontend/vite.config.ts`:

```typescript
export default defineConfig({
  // ... existing plugins, css, build ...
  server: {
    host: '0.0.0.0',
    port: parseInt(process.env.VITE_DEV_PORT || '5174', 10),
    allowedHosts: [
      'localhost',
      '.ts.net',
    ],
    proxy: {
      '/api': {
        target: process.env.VITE_API_TARGET || 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});
```

Remove the hardcoded `'gozap.kiko-karat.ts.net'` entry (it's covered by `'.ts.net'`).

- [x] **Step 15.2: Update run.sh to pass VITE_API_TARGET**

In `run.sh`, update the frontend launch command (line 52):

```bash
# Start frontend with custom port and backend proxy target
start_process "frontend" "frontend" "VITE_API_TARGET=http://localhost:$BACKEND_PORT npm run dev -- --port $FRONTEND_PORT"
```

Also update the `run.sh` default backend port from `3030` to `3000` to match the Vite config default:

```bash
read -p "Enter backend port (default: 3000): " BACKEND_PORT
BACKEND_PORT=${BACKEND_PORT:-3000}
```

Remove the warning block about port mismatch (lines 29-32) since `VITE_API_TARGET` now handles it.

- [x] **Step 15.3: Build check**

```bash
cd frontend && npm run build
```

- [x] **Step 15.4: Commit**

```bash
git add frontend/vite.config.ts run.sh
git commit -m "feat: make Vite proxy target configurable via VITE_API_TARGET env var"
```

---

### Phase 5: Wiring Fixes

#### Task 16 -- Wire scheduler to read system_config

**Files:**
- Modify: `backend/src/services/scheduler.ts`
- Modify: `backend/src/server.ts`

- [x] **Step 16.1: Read scheduler config from DB at startup**

In `backend/src/server.ts`, replace line 85:

```typescript
// Replace:
schedulerService.start();

// With:
const schedulerEnabledConfig = await dbService.getConfig('scheduler_enabled');
const schedulerCronConfig = await dbService.getConfig('scheduler_cron');
const schedulerEnabled = schedulerEnabledConfig?.value !== 'false';
const schedulerCron = schedulerCronConfig?.value || '0 0 * * *';

if (schedulerEnabled) {
  schedulerService.start(schedulerCron);
} else {
  console.log('System scheduler is disabled via system_config');
}
```

- [x] **Step 16.2: Build check**

```bash
cd backend && npx tsc --noEmit
```

- [x] **Step 16.3: Commit**

```bash
git add backend/src/server.ts
git commit -m "fix: wire scheduler startup to read scheduler_enabled and scheduler_cron from system_config"
```

---

#### Task 17 -- Fix notification-repo config access inconsistency

**Files:**
- Modify: `backend/src/services/db/notification-repo.ts`

- [x] **Step 17.1: Replace direct SQL with getConfig**

In `backend/src/services/db/notification-repo.ts`, find the two places where `system_config` is queried directly for quota checks (around lines 576-578 and 590-592).

Replace the direct `dbGet` calls with the injected `getConfig` function. The notification repo constructor needs to receive `getConfig` as a dependency, same as `product-repo` and `list-repo`.

The pattern is:
```typescript
// Before (direct SQL):
const configRow = await this.dbGet('SELECT value FROM system_config WHERE key = ?', ['quota_max_notification_channels']);
const limit = configRow ? parseInt(configRow.value, 10) : 5;

// After (using injected getConfig):
const configRow = await this.getConfig('quota_max_notification_channels');
const limit = configRow ? parseInt(configRow.value, 10) : 5;
```

Check `database.ts` to see how `getConfig` is injected into the other repos and follow the same pattern for notification-repo.

- [x] **Step 17.2: Build check**

```bash
cd backend && npx tsc --noEmit
```

- [x] **Step 17.3: Commit**

```bash
git add backend/src/services/db/notification-repo.ts backend/src/services/database.ts
git commit -m "refactor: fix notification-repo to use injected getConfig instead of direct SQL"
```

---

#### Task 18 -- Prevent requests during DB migration window

**Files:**
- Modify: `backend/src/server.ts`

- [x] **Step 18.1: Add a readiness gate middleware**

In `backend/src/server.ts`, add a middleware before the route mounts that blocks requests until DB is ready:

```typescript
// Add before route mounts:
let dbReady = false;
app.use((req, res, next) => {
  if (!dbReady && req.path !== '/health') {
    return res.status(503).json({ error: 'Server is starting up. Please retry shortly.' });
  }
  next();
});

// ... mount routes ...

// In the listen callback, after await dbService.ready:
dbReady = true;
```

Update the `/health` endpoint to reflect readiness:

```typescript
app.get('/health', (req, res) => {
  res.json({ status: dbReady ? 'ok' : 'starting' });
});
```

- [x] **Step 18.2: Build check**

```bash
cd backend && npx tsc --noEmit
```

- [x] **Step 18.3: Commit**

```bash
git add backend/src/server.ts
git commit -m "fix: add readiness gate to block requests during DB migration window"
```

---

### Phase 6: Admin Config UI for Registration Toggle

#### Task 19 -- Add registration toggle to SystemConfig admin UI

**Files:**
- Modify: `frontend/src/components/admin/SystemConfig.tsx`

- [x] **Step 19.1: Add the registration_enabled toggle**

In `frontend/src/components/admin/SystemConfig.tsx`, find where the config keys are displayed/editable. Add a toggle for `registration_enabled`:

The SystemConfig component already renders config keys from `GET /api/admin/config`. The new `registration_enabled` key will appear automatically if the admin panel fetches all config. Verify that the UI handles boolean-like string values (`'true'`/`'false'`) correctly.

If the component only renders known keys, add `registration_enabled` to the list with a label like "Allow New User Registration" and a toggle/checkbox input instead of a text field.

- [x] **Step 19.2: Add i18n keys**

Add to `en.json` under `admin` or `config`:
```json
"registrationEnabled": "Allow New User Registration",
"registrationEnabledDescription": "When disabled, only administrators can create new user accounts."
```

Add to `pt-BR.json`:
```json
"registrationEnabled": "Permitir Registro de Novos Usuarios",
"registrationEnabledDescription": "Quando desativado, apenas administradores podem criar novas contas."
```

- [x] **Step 19.3: Build check**

```bash
cd frontend && npm run build
```

- [x] **Step 19.4: Manual verify**

As admin: open Settings > System Config. Verify `registration_enabled` toggle appears. Toggle it to `false`. Log out. Verify that the Auth page no longer shows the registration option.

- [x] **Step 19.5: Commit**

```bash
git add frontend/src/components/admin/SystemConfig.tsx frontend/src/i18n/locales/en.json frontend/src/i18n/locales/pt-BR.json
git commit -m "feat: add registration toggle to admin system config UI"
```

---

## 6. Testing and Verification Strategy

**No test framework is configured** in this project. Verification is via TypeScript compilation (`npm run build`) and manual testing.

### Build verification (every task)
```bash
cd backend && npx tsc --noEmit
cd frontend && npm run build
```

### Manual test matrix

| Scenario | Steps | Expected |
|----------|-------|----------|
| **Fresh install, no env vars** | Delete DB, start servers, open app | SetupWizard shown. Create admin. Redirected to dashboard. |
| **Fresh install, with env vars** | Delete DB, set INITIAL_ADMIN_*, start servers | Env-var admin created at startup. App shows normal login. |
| **Existing DB, admin exists** | Start normally | Normal login shown. No setup wizard. |
| **POST /api/setup/admin after setup** | curl POST after admin exists | 403 Forbidden |
| **Registration disabled** | Admin toggles registration_enabled to false | Register tab hidden. POST /api/auth/register returns 403. |
| **Registration enabled** | Admin toggles back to true | Register tab visible. Registration works. |
| **Invalid JWT_SECRET in prod** | Set NODE_ENV=production, use default secret | Server crashes with clear error message. |
| **Missing JWT_SECRET in dev** | Unset JWT_SECRET, start in dev | Warning logged, server starts with default. |
| **Custom DB_PATH** | Set DB_PATH=/tmp/test.db, start server | DB created at /tmp/test.db. |
| **Custom PORT via config** | Set PORT=4000 | Server listens on 4000. |
| **VITE_API_TARGET** | Set VITE_API_TARGET=http://localhost:4000, start frontend | Proxy targets port 4000. |
| **run.sh with defaults** | Run run.sh, accept defaults | Backend on 3000, frontend on 5174, proxy works. |
| **Concurrent setup requests** | Send two POST /api/setup/admin simultaneously | First succeeds, second gets 403. |
| **Server readiness gate** | Send request immediately after server start | 503 during migration, then normal response. |
| **Scheduler respects DB config** | Set scheduler_enabled='false' in system_config | Scheduler does not start. Log says "disabled". |

### Failure-mode tests

| Failure | Expected Behavior |
|---------|------------------|
| Missing env var (PORT) | Uses default 3000. |
| Invalid PORT (abc) | Server crashes with "Invalid PORT" message. |
| DB directory not writable | SQLite error on startup (existing behavior). |
| Setup endpoint rate limited | 429 after 5 attempts/minute. |

---

## 7. Rollout + Observability Plan

### Staged rollout

1. **Phase 1 (config module)** can be deployed independently. Zero behavior change -- all existing env vars work identically. Adds new optional env vars (`DB_PATH`, `BIND_ADDRESS`, `JWT_EXPIRES_IN`, `BCRYPT_ROUNDS`, `NODE_ENV`).

2. **Phase 2 (setup flow)** adds new endpoints but doesn't break existing flows. Env-var bootstrap still works. Setup wizard only appears on truly fresh installs.

3. **Phase 3 (frontend setup UI)** is a frontend-only change. Safe to deploy.

4. **Phase 4 (Vite config)** is dev-only. No production impact.

5. **Phase 5 (wiring fixes)** changes scheduler behavior -- `scheduler_enabled=false` will now actually disable the scheduler. Verify the DB value is `'true'` before deploying.

6. **Phase 6 (registration toggle)** defaults to `'true'` (open). No behavior change until admin explicitly disables.

### Observability

- Config module logs all loaded values at startup (excluding secrets, which log `'[SET]'` or `'[DEFAULT]'`).
- Setup wizard usage logged via `SETUP_ADMIN` audit entry.
- Registration gate logged: when a registration is rejected due to disabled toggle, log the attempt.
- Scheduler start/skip logged with the cron expression source ("from system_config" vs "default").

### Rollback

- Phase 1: Revert `config.ts` imports, restore `process.env` reads. Simple find-replace.
- Phase 2-3: Remove setup routes and wizard. Auth flow falls back to login/register (existing behavior).
- Phase 5: Scheduler falls back to hardcoded cron (revert one block in server.ts).

---

## 8. Open Questions / Assumptions

| # | Question | Assumption (if proceeding without answer) |
|---|----------|------------------------------------------|
| 1 | **Should registration default to open or closed on fresh installs?** | Default to `'true'` (open) to preserve current behavior. Admin can disable after setup. |
| 2 | **Should we use a schema validation library (zod)?** | No. Hand-roll validation in `config.ts` to avoid adding a dependency for 5 env vars. If the config grows significantly, revisit. |
| 3 | **Should scraper constants (timeouts, user agent, etc.) be centralized?** | Not in this plan. They're stable, rarely changed, and would bloat the config module. Mark as optional future work. |
| 4 | **Should the frontend have a runtime config endpoint (GET /api/config/public)?** | Not needed now. The only runtime value the frontend needs (`needsSetup`, `registrationEnabled`) is already served by `/api/setup/status`. |
| 5 | **Should the setup wizard enforce a minimum password strength beyond length?** | No. Match existing registration rules (min 6 chars). Don't introduce new constraints that differ from the rest of the auth system. |
| 6 | **Should the env-var admin bootstrap (`INITIAL_ADMIN_*`) be removed?** | Keep it for backward compatibility and headless/container deployments where no browser is available. Log a deprecation warning. |
| 7 | **Should `NODE_ENV` be required?** | No. Default to `'development'`. The fail-fast on JWT_SECRET only triggers when `NODE_ENV=production`. |
| 8 | **Multi-instance safety for SQLite?** | Not addressed. SQLite is inherently single-writer. Document that only one server instance should run against a given DB file. |

---

## File Impact Summary

### Files to Create
- `backend/src/config.ts` -- centralized config module
- `backend/src/routes/setup.ts` -- setup API endpoints
- `backend/.env.example` -- documented env var reference
- `frontend/src/components/SetupWizard.tsx` -- setup wizard component
- `frontend/src/components/SetupWizard.module.css` -- setup wizard styles

### Files to Modify
- `backend/src/server.ts` -- use config, mount setup router, readiness gate, scheduler wiring
- `backend/src/middleware/auth.ts` -- use config for JWT
- `backend/src/utils/portManager.ts` -- use config for ports
- `backend/src/services/database.ts` -- use config for DB path
- `backend/src/services/db/user-repo.ts` -- use config for bcrypt rounds
- `backend/src/services/db/migrations.ts` -- add registration_enabled seed
- `backend/src/services/db/notification-repo.ts` -- fix getConfig injection
- `backend/src/routes/auth.ts` -- registration gate
- `frontend/src/services/api.ts` -- add setup API methods
- `frontend/src/contexts/AuthContext.tsx` -- add setup state and flow
- `frontend/src/App.tsx` -- render SetupWizard when needed
- `frontend/src/components/Auth.tsx` -- respect registrationEnabled prop
- `frontend/src/components/admin/SystemConfig.tsx` -- registration toggle UI
- `frontend/src/i18n/locales/en.json` -- setup translations
- `frontend/src/i18n/locales/pt-BR.json` -- setup translations
- `frontend/vite.config.ts` -- env var support for proxy target
- `run.sh` -- fix default port, pass VITE_API_TARGET

---

## 9. Implementation Review (2026-04-01)

**Status: COMPLETE — PR fabiosouzajr/amzscraper#1 (branch `new-frontend`)**

All 19 tasks implemented across 22 commits. Both builds pass clean (`tsc --noEmit`, `npm run build`).

### Deviations from plan

| Item | Plan | Actual | Reason |
|---|---|---|---|
| `corsOrigin` centralization | Centralize in config.ts | Not done | Intentional omission; app relies on Tailscale for access control |
| JWT_SECRET empty in dev | `process.exit(1)` | Warning only, uses default | Better DX; fail-fast kept for production |
| Existing-username in setup | Promote to admin | Return 409 Conflict | Promotion without password verification is a security hole |
| `addAuditLog` method | Called `addAuditLog` | Actually `logAudit` | Adapted to actual API |
| `getConfig` return type | `{value: string} \| undefined` | `string \| null` | Adapted to actual API |
| auth.ts `expiresIn` cast | `{ expiresIn: config.jwtExpiresIn }` | `{ expiresIn: config.jwtExpiresIn } as SignOptions` | jsonwebtoken's internal `StringValue` type isn't assignable from `string` |

### Issues found and fixed during review

1. **bcryptRounds validation missing** — added range check (4–31) with `process.exit(1)`
2. **Setup existing-user promotion** — removed; replaced with 409 Conflict (security fix)
3. **GET /setup/status unrated** — applied `setupLimiter` to both setup routes
4. **completeSetup unguarded** — wrapped in try/catch; clears partial auth state on failure
