# Frontend - Amazon Price Tracker

## Commands

```bash
npm run dev        # Vite dev server (port 5174, proxies /api to localhost:3000)
npm run build      # TypeScript check + Vite production build
npm run preview    # Preview production build
```

No test runner configured.

## Architecture

React 18 + TypeScript SPA with Vite. Plain CSS styling, i18next for i18n, Recharts for charts.

```
src/
  main.tsx                    # Entry point
  App.tsx                     # Main app: view routing, navbar, layout
  App.css                     # All component styles (~58KB monolithic)
  index.css                   # Global styles and resets
  types.ts                    # TypeScript interfaces (Product, User, UserSchedule, AuditLog, etc.)
  components/
    Auth.tsx                  # Login/registration form
    ASINInput.tsx             # ASIN input with validation
    Dashboard.tsx             # Price drops/increases cards
    ProductList.tsx           # Paginated product listing
    ProductDetail.tsx         # Single product view with price chart
    ProductSearch.tsx         # Search with 300ms debounce
    ListsSidebar.tsx          # User lists CRUD sidebar
    MiniPriceChart.tsx        # Sparkline chart (last 20 points)
    LanguageSwitcher.tsx      # Language dropdown
    AdminPanel.tsx            # Admin panel with tab navigation
    admin/
      UserManagement.tsx      # User CRUD table, search, actions
      SystemStats.tsx        # System stats with charts
      SystemConfig.tsx      # System config editor
      AuditLog.tsx          # Audit log viewer with filters
  contexts/
    AuthContext.tsx            # Auth state, token in localStorage
  services/
    api.ts                    # All API calls (~425 lines, fetch-based)
    adminApi                  # Admin API endpoints wrapper
  i18n/
    config.ts                 # i18next setup
    locales/en.json           # English translations (includes admin strings)
    locales/pt-BR.json        # Portuguese translations (includes admin strings)
  utils/
    dateFormat.ts             # Locale-aware date formatting
    numberFormat.ts           # Locale-aware price formatting (R$)
```

## Key Patterns

- **View management**: `App.tsx` uses local state (`currentView`) instead of URL routing. Views: `dashboard`, `products`, `search`, `detail`, `config`. Admin view (`admin`) only shown to ADMIN role users.
- **Auth**: Context API with localStorage token. Auth component renders if `!user`. Token validated on mount via `/api/auth/me`. User role stored in JWT token.
- **API client**: Raw fetch with manual `getAuthHeaders()`. No Axios or React Query. Separate `adminApi` object for admin endpoints.
- **SSE for price updates**: Manual `ReadableStream` reader/decoder in `api.ts` for `/api/prices/update`.
- **i18n**: English + Portuguese (pt-BR). Auto-detects browser language. Custom formatters in `utils/` check `i18n.language` for locale-specific number/date formatting.
- **Styling**: Single `App.css` file with kebab-case class names. Amazon color palette (`#232f3e` dark blue, `#ff9900` orange). Admin panel uses Amazon colors for consistency.

## Admin Panel

- **Access control**: Only visible to users with `role: 'ADMIN'`
- **Tab navigation**: Users, Stats, Config, Audit Log
- **User Management**: Table listing, search by username, create user, disable/enable, reset password, view stats
- **System Stats**: Dashboard with overview cards, bar chart for metrics, pie chart for user distribution
- **System Config**: Edit quota settings (max products, max lists), scheduler settings (cron expression, enabled)
- **Audit Log**: Table with filtering by action type, admin user; shows timestamp, action, target, details
- **User Schedule**: GET/PUT `/api/config/schedule` for managing personal price update schedules
- **Modals**: User stats modal, create user modal with form validation

## Vite Configuration

- Dev server: `0.0.0.0:5174` (Tailscale-compatible)
- API proxy: `/api` -> `http://localhost:3000`
- Allowed hosts: `localhost`, `*.ts.net` (Tailscale)

## TypeScript

Strict mode enabled with `noUnusedLocals` and `noUnusedParameters`.

## Gotchas

- View switching resets component state (e.g., pagination resets to page 1).
- No React Router despite being a dependency - navigation is state-based in `App.tsx`.
- `App.css` is monolithic (~56KB) - all component styles live here, not in component files.
- No error boundaries - errors caught in try/catch and displayed as messages.
- No code splitting or lazy loading.
- ProductDetail works in two contexts: standalone full view or side-by-side in search view.
- Pagination: ProductList uses 20/page, ProductSearch uses 10/page.
