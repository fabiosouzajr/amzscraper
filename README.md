# Amazon Price Tracker

Multi-tenant Amazon price tracker built with TypeScript. Scrapes Amazon.com.br using Playwright, stores price history in SQLite, and provides a React dashboard for tracking drops, increases, and trends. Features multi-user admin, notifications (Email/Telegram/Discord), product lists, CSV import/export, and configurable per-user scheduling.

## Features

### Core
- **Price Tracking** — records price changes, skips unchanged prices to save storage
- **Dashboard** — view biggest price drops and increases with category filtering
- **Price History Charts** — interactive Recharts visualizations per product
- **Product Search** — search by name or ASIN with pagination
- **Automatic Updates** — configurable cron schedule for daily price scraping
- **Manual Updates** — trigger price updates on demand with real-time SSE progress

### Multi-User & Admin
- **Role-Based Access** — USER and ADMIN roles with JWT authentication
- **Setup Wizard** — first-run flow to create the initial admin account
- **User Management** — create, disable, reset passwords for users
- **Quotas** — configurable limits on products and lists per user
- **Registration Toggle** — admin can enable/disable new user signups
- **Audit Log** — tracks all admin actions with timestamps
- **System Stats** — user counts, product counts, database size overview

### Notifications
- **Multi-Channel** — Email, Telegram, and Discord support
- **Custom Rules** — trigger on: lowest price in N days, below threshold, percentage drop
- **Per-Product or Global** — rules can target specific products or apply to all
- **History & Tracking** — logs sent/failed notifications with error details
- **Test Messages** — verify channel configuration before going live

### Organization
- **Product Lists** — create custom collections (e.g., Wishlist, To Buy)
- **Categories** — auto-extracted from Amazon breadcrumbs, filterable on dashboard
- **CSV Import/Export** — bulk import ASINs from CSV or export all tracked ASINs
- **Database Backup** — download the full SQLite database from the admin panel

### Scheduling
- **System-Wide Cron** — admin-configurable schedule (default: daily at midnight)
- **Per-User Schedules** — each user can set a custom cron expression
- **Enable/Disable** — scheduler can be toggled on/off from admin panel

### Internationalization
- **Languages** — English and Portuguese (Brazil)
- **Auto-Detection** — browser language detected on first visit
- **Locale Formatting** — dates and currency (R$) formatted per locale

### Other
- Responsive design with mobile bottom tab bar
- Offline connectivity banner
- Tailscale-first networking (binds `0.0.0.0`)

## Tech Stack

| Layer     | Technology                                        |
|-----------|---------------------------------------------------|
| Backend   | Node.js, Express 4.18, TypeScript 5.3             |
| Frontend  | React 18, Vite 7.3, React Query 5, Recharts 2.10  |
| Database  | SQLite3 (single file, auto-created with migrations)|
| Scraper   | Playwright (Firefox headless, Chrome user-agent)   |
| Auth      | JWT (jsonwebtoken) + bcrypt                        |
| i18n      | i18next (en, pt-BR)                                |
| Scheduler | node-cron                                          |

## Quick Start

### Option 1: Scripts (Recommended)

```bash
git clone <repository-url> && cd amzscraper
chmod +x install.sh run.sh
./install.sh   # checks Node.js 18+, installs deps, Playwright browsers
./run.sh       # prompts for ports, starts backend + frontend in background
```

### Option 2: Manual

```bash
# Terminal 1 — Backend (Express on port 3000)
cd backend && npm install && npm run dev

# Terminal 2 — Frontend (Vite on port 5174, proxies /api to backend)
cd frontend && npm install && npm run dev
```

Open `http://localhost:5174`. On first run, a **setup wizard** guides you through creating the admin account.

**Note:** `npm install` in the backend automatically installs Playwright browsers (Firefox + Chromium) via a postinstall script.

## Configuration

### Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | Backend primary port |
| `PORT_FALLBACK` | `3001` | Fallback if primary port is in use |
| `JWT_SECRET` | *(must change)* | JWT signing key — **required** in production |
| `JWT_EXPIRES_IN` | `7d` | Token expiry duration |
| `NODE_ENV` | `development` | Set to `production` for production deploys |
| `BCRYPT_ROUNDS` | `10` | Password hash rounds (4-31) |
| `DB_PATH` | `./database/products.db` | SQLite database file path |
| `BIND_ADDRESS` | `0.0.0.0` | Server bind address |
| `VITE_DEV_PORT` | `5174` | Frontend dev server port |
| `VITE_API_TARGET` | `http://localhost:3000` | API proxy target for Vite |

### Admin-Managed Settings

These are configured through the Admin Panel UI (Settings > System Config):

- `quota.max_products` — maximum products per user (default: 100)
- `quota.max_lists` — maximum lists per user (default: 20)
- `scheduler_enabled` — enable/disable the system scheduler (default: false)
- `scheduler_cron` — system cron expression (default: `0 0 * * *` — midnight)
- `registration_enabled` — allow new user registration (default: true)

## Usage Guide

### First Run
Open the app and complete the setup wizard to create your admin account. After setup, you can log in and start tracking products.

### Adding Products
Navigate to **Products**, enter an Amazon ASIN (10-character code found in the product URL), and click Add. For bulk additions, use **Import ASINs** with a CSV file — progress streams in real-time.

### Dashboard
The **Dashboard** shows products with the biggest price drops and increases. Filter by category using the category badges. Click any product to see its full price history.

### Product Lists
Create custom lists from the sidebar on the Products page (e.g., "Wishlist", "Electronics"). Add products to lists, then filter the products view by list.

### Notifications
Go to **Settings > Notifications** to configure channels (Email, Telegram, or Discord). Create rules to get notified when prices drop below a threshold, hit the lowest in N days, or drop by a percentage. Use the test button to verify your channel works.

### Scheduling
The system scheduler runs price updates on a cron schedule (configured by admin). Individual users can also set their own schedule under **Settings > Schedule**.

### Admin Panel
Admins access **Settings > Admin** to manage users, view system stats, configure quotas and scheduler, and review the audit log.

### Import / Export
- **Import ASINs**: CSV upload with real-time progress (Products page)
- **Export ASINs**: download all tracked ASINs as CSV (Settings > Data)
- **Database Backup**: download the full SQLite file (Settings > Data)

## Architecture

### Project Structure

```
amzscraper/
├── backend/
│   ├── src/
│   │   ├── server.ts                # Express setup, route registration, scheduler
│   │   ├── config.ts                # Centralized config validation
│   │   ├── routes/                  # API route handlers
│   │   │   ├── auth.ts              # Register, login, logout, change-password
│   │   │   ├── products.ts          # Product CRUD, search, categories
│   │   │   ├── prices.ts            # Price update trigger (SSE)
│   │   │   ├── dashboard.ts         # Price drops & increases
│   │   │   ├── lists.ts             # List CRUD, product-list management
│   │   │   ├── config.ts            # Import/export, scheduling, DB info
│   │   │   ├── admin.ts             # User management, stats, audit log
│   │   │   ├── notifications.ts     # Channels, rules, history
│   │   │   └── setup.ts             # First-run admin creation
│   │   ├── services/
│   │   │   ├── scraper.ts           # Playwright Amazon scraping
│   │   │   ├── scheduler.ts         # Cron scheduling, price update orchestration
│   │   │   └── db/                  # Database layer (no ORM)
│   │   │       ├── database.ts      # SQLite connection & service wrapper
│   │   │       ├── migrations.ts    # Schema creation & evolution
│   │   │       ├── product-repo.ts  # Product & price history queries
│   │   │       ├── user-repo.ts     # User CRUD & authentication
│   │   │       ├── list-repo.ts     # List management queries
│   │   │       ├── notification-repo.ts  # Notification CRUD & logging
│   │   │       └── admin-repo.ts    # System config, stats, audit log
│   │   ├── middleware/
│   │   │   ├── auth.ts              # JWT verification & token generation
│   │   │   └── admin.ts             # Admin-only route protection
│   │   └── utils/                   # Validation, logging, port management
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── App.tsx                  # Route definitions, auth guard
│   │   ├── components/              # Page & feature components
│   │   │   ├── Dashboard.tsx        # Price drops/increases overview
│   │   │   ├── ProductsPage.tsx     # Product listing with list sidebar
│   │   │   ├── ProductDetail.tsx    # Single product + price chart
│   │   │   ├── Auth.tsx             # Login/register form
│   │   │   ├── SetupWizard.tsx      # First-run admin setup
│   │   │   ├── AdminPanel.tsx       # Admin UI (tabs)
│   │   │   ├── Notifications.tsx    # Notification management
│   │   │   ├── SettingsPage.tsx     # Settings router
│   │   │   └── ...                  # Config, lists, charts, forms
│   │   ├── design-system/           # Reusable UI (Button, Card, Modal, Table, etc.)
│   │   ├── layout/                  # AppShell, BottomTabBar, OfflineBanner
│   │   ├── contexts/                # AuthContext, ImportContext
│   │   ├── hooks/                   # React Query wrappers (useProducts, useLists, etc.)
│   │   ├── services/api.ts          # Fetch-based API client
│   │   ├── i18n/                    # i18next config + en.json, pt-BR.json
│   │   └── utils/                   # Date, number, image formatting
│   └── package.json
├── database/                        # SQLite DB file (auto-created, gitignored)
├── docs/                            # API docs, plans, specs
├── logs/                            # Runtime logs (created by run.sh)
├── install.sh                       # Installation automation
├── run.sh                           # Process management
└── README.md
```

### Database

| Table | Purpose |
|---|---|
| `users` | User accounts with roles (USER/ADMIN) and disable status |
| `products` | Tracked products with ASIN, user ownership |
| `price_history` | Price records per product (nullable price for unavailable items) |
| `categories` | Category names extracted from Amazon |
| `product_categories` | Product-category relationships with hierarchy level |
| `user_lists` | User-created product collections |
| `product_lists` | Many-to-many product-list memberships |
| `audit_log` | Admin action history |
| `system_config` | Key-value system settings (quotas, scheduler, registration) |
| `user_schedule` | Per-user cron schedule configuration |
| `notification_channels` | Email/Telegram/Discord channel configs per user |
| `notification_rules` | Notification trigger rules per user/product |
| `notification_log` | Sent/failed notification history |

### API

REST API with SSE streaming for long-running operations (price updates, ASIN imports). All endpoints except `/api/auth/*` and `/api/setup/*` require JWT authentication. Admin endpoints require the ADMIN role.

Route groups: `/api/auth`, `/api/products`, `/api/prices`, `/api/dashboard`, `/api/lists`, `/api/config`, `/api/admin`, `/api/notifications`, `/api/setup`, `/health`

For the complete API reference, see [Backend API Documentation](docs/backend/BACKEND_API_DOCUMENTATION.md).

### Key Patterns
- **No ORM** — direct SQL with parameterized queries in the `services/db/` layer
- **SSE Streaming** — price updates and ASIN imports stream progress to the frontend
- **React Query** — data fetching via custom hooks (`useProducts`, `useLists`, etc.)
- **CSS Modules** — component-scoped styles alongside each component
- **Design System** — reusable UI components (Button, Card, Modal, Table, Tabs, etc.)

## Deployment

### Production Checklist

1. Set `JWT_SECRET` to a strong random value (app exits if default is used in production)
2. Set `NODE_ENV=production`
3. Build both packages:
   ```bash
   cd backend && npm run build
   cd frontend && npm run build
   ```
4. Set up a reverse proxy (nginx, Caddy) for SSL termination
5. Use a process manager (PM2, systemd) to keep the backend running
6. Ensure the `database/` directory exists and is writable
7. Verify Playwright browsers are installed (`npx playwright install firefox chromium`)

### Running in Production

```bash
cd backend && node dist/server.js
```

Serve the frontend build (`frontend/dist/`) via your reverse proxy, proxying `/api` requests to the backend.

## Troubleshooting

**Node.js version:** Requires v18+. Use [nvm](https://github.com/nvm-sh/nvm) to install: `nvm install 18 && nvm use 18`

**Playwright browsers not found:** Re-run `cd backend && npm install` (postinstall script handles it) or manually: `npx playwright install firefox chromium`

**Port already in use:** Backend auto-falls back to `PORT_FALLBACK` (default 3001). Or set custom ports via environment variables.

**Database errors:** Ensure `database/` directory exists and is writable: `mkdir -p database && chmod 755 database`

**Scraper failures:** Check internet connectivity. Amazon may have changed page structure — review backend logs for selector warnings.

**Stopping processes started with run.sh:**
```bash
kill $(cat logs/*.pid)
```

## License

ISC
