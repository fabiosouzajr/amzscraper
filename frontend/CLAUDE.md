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
  main.tsx                    # Entry point (BrowserRouter wrapper + QueryClient)
  App.tsx                     # Route definitions (<Routes>/<Route>), auth guard
  index.css                   # Global styles + shared component classes (~550 lines)
  types.ts                    # TypeScript interfaces (Product, User, UserSchedule, AuditLog, etc.)
  layout/
    AppShell.tsx              # Persistent sidebar nav (includes ListsSidebar), bottom tab bar
    BottomTabBar.tsx          # Mobile bottom nav
    OfflineBanner.tsx         # Offline status banner
  design-system/              # Shared UI primitives: Button, Card, Badge, Table, Modal, Toast, etc.
  hooks/                      # React Query wrappers: useProducts, useLists, useDashboard, etc.
  components/
    Auth.tsx                  # Login/registration form
    ASINInput.tsx             # ASIN input with validation
    Dashboard.tsx             # Price drops/increases cards
    ProductsPage.tsx          # Products route: search bar + ProductList + detail Sheet
    ProductList.tsx           # Paginated product listing (no sidebar — list filter via URL param)
    ProductDetail.tsx         # Single product view with price chart
    ListsSidebar.tsx          # User lists CRUD — rendered inside AppShell nav, not ProductList
    MiniPriceChart.tsx        # Sparkline chart (last 20 points)
    LanguageSwitcher.tsx      # Language dropdown
    AdminPanel.tsx            # Admin panel with tab navigation
    admin/
      UserManagement.tsx      # User CRUD table, search, actions
      SystemStats.tsx         # System stats with charts
      SystemConfig.tsx        # System config editor
      AuditLog.tsx            # Audit log viewer with filters
  contexts/
    AuthContext.tsx            # Auth state, token in localStorage
  services/
    api.ts                    # All API calls (~425 lines, fetch-based)
  i18n/
    config.ts                 # i18next setup
    locales/en.json           # English translations (includes admin strings)
    locales/pt-BR.json        # Portuguese translations (includes admin strings)
  utils/
    dateFormat.ts             # Locale-aware date formatting
    numberFormat.ts           # Locale-aware price formatting (R$)
```

## Key Patterns

- **View management**: React Router v6 with `<Routes>/<Route>` in `App.tsx`, `BrowserRouter` in `main.tsx`. Routes: `/` dashboard, `/products`, `/products/:id`, `/settings/*`. `AppShell` provides the persistent sidebar.
- **Auth**: Context API with localStorage token. Auth component renders if `!user`. Token validated on mount via `/api/auth/me`. User role stored in JWT token.
- **API client**: Raw fetch with manual `getAuthHeaders()` in `src/services/api.ts`. Data fetching uses **React Query** (`@tanstack/react-query`) via hooks in `src/hooks/`. Query keys are exported constants (e.g. `LISTS_KEY` from `useLists.ts`). Separate `adminApi` object for admin endpoints.
- **SSE for price updates**: Manual `ReadableStream` reader/decoder in `api.ts` for `/api/prices/update`.
- **i18n**: English + Portuguese (pt-BR). Auto-detects browser language. Custom formatters in `utils/` check `i18n.language` for locale-specific number/date formatting.
- **Styling**: `index.css` for global/shared classes; component-specific styles in `*.module.css` files. Amazon color palette (`#232f3e` dark blue, `#ff9900` orange).
- **ListsSidebar location**: Rendered inside `AppShell` nav (not inside `ProductList`). List selection navigates to `/products?list=<id>`; `ProductsPage` reads that param and passes `initialListFilter` to `ProductList`.
- **CSS Modules**: Use `:global(.className)` inside a module file to override a global class in a scoped context (e.g. `.container :global(.delete-button) { width: 100% }`).

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
- `index.css` (~550 lines) holds global/shared styles (`.delete-button`, `.product-actions`, etc.). Component-specific styles use `*.module.css`. Both coexist — a component can apply both a module class and a global class.
- Global CSS classes can silently override CSS Module declarations when both are applied to the same element (e.g. `.product-actions { flex-direction: column }` overrides a module's row layout). Always declare conflicting properties explicitly in the module.
- `will-change: transform` on a repeated row element creates a stacking context per row, scoping child `z-index` values. Dropdowns inside will be hidden by subsequent rows. Only apply on mobile where the animation is needed.
- Absolutely-positioned dropdowns are clipped by *any* ancestor with `overflow: hidden` — not just their containing block. Audit the full ancestor chain before concluding a z-index fix is sufficient.
- `ListsSidebar` manages its own local list state separately from React Query. After any mutation (create/rename/delete), call `qc.invalidateQueries({ queryKey: LISTS_KEY })` to sync the cache used by `useLists()` in other components.
- No error boundaries — errors caught in try/catch and displayed as messages.
- ProductDetail works in two contexts: standalone full view (`/products/:id`) or inside a Sheet panel on desktop.
- Pagination: ProductList uses 20/page.
