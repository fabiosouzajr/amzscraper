# Frontend Refactor Plan — Navigation, UI & Responsiveness

## Context

This plan addresses issues in three areas of the frontend refactor plan:

1. **Navigation & Information Architecture** (Section 1.2) — No URL routing, state loss on navigation, flat navigation structure, disconnected views, inconsistent detail view behavior
2. **UI & Visual Design** (Section 1.3) — No design system usage, inconsistent modals, dense layouts, hard-to-use filters, badge proliferation, intrusive progress banner, complex notifications UI, missing empty states, hardcoded strings, semantic color misuse
3. **Responsiveness & Accessibility** (Section 1.4) — Overflow hiding as band-aid, non-mobile-friendly tables, no touch gestures, fixed pagination, missing ARIA, non-collapsible sidebar

The design system components (`Button`, `Card`, `Input`, `Modal`, `Badge`, `EmptyState`, `Skeleton`, `Toast`, `ProgressBar`, `Tabs`, `Sheet`, `Table`) and CSS tokens already exist but are not being used by the existing components.

---

## Phase 1: Navigation & Routing (Issues N1-N5)

### ✅ Step 1.1: Install and Configure React Router

`react-router-dom@^7.13.2` installed. `main.tsx` wraps App with `BrowserRouter`.

### ✅ Step 1.2: Define Route Structure

`App.tsx` uses `Routes`/`Route`/`Navigate`/`useNavigate`/`useLocation`/`Link` from react-router-dom. Routes defined:
- `/` → Dashboard
- `/products` → ProductList (with category filter from URL)
- `/products/:id` → ProductDetail
- `/search` → ProductSearch with side-by-side detail
- `/settings/*` → Config (nested sections)
- `/admin` → redirects to `/settings/admin`

### Step 1.3: Implement Unified Products Page

**New File**: `frontend/src/components/ProductsPage.tsx`

Merge functionality from `ProductList.tsx` and `ProductSearch.tsx`:

- Top section: search bar (always visible, debounced)
- Filter bar: category dropdown + list dropdown + sort dropdown (collapsible on mobile)
- View toggle: list mode vs. grid mode
- Product list with pagination (adjustable 10/20/50)
- On product select: open `Sheet` panel (desktop) or full-screen (mobile)

### Step 1.4: Implement Settings Page

**New File**: `frontend/src/components/SettingsPage.tsx`

Consolidate `Config` and `AdminPanel` functionality:

- Desktop: left sidebar with sections (Account, Notifications, Database, Data Export, Admin)
- Mobile: horizontal scrollable tab bar
- Admin section only rendered for `role === 'ADMIN'`

### ✅ Step 1.5: Migrate Existing Components to Use Router

All navigation uses `useNavigate` and `Link`. No more `setCurrentView` state switching.

### Step 1.6: Update ProductDetail for Sheet Pattern

**File**: `frontend/src/components/ProductDetail.tsx`

- Remove dual rendering (side panel vs full page)
- Always render as content (context determines container)
- On mobile: full-screen slide-in with swipe-back gesture
- On desktop: render inside `Sheet` component from design system

### ✅ Step 1.7: Preserve State on Navigation

Filters passed via URL query params (`?category=...`). URL-based routing enables browser back/forward.

---

## Phase 2: UI Design System Migration (Issues V1-V10)

### ✅ Step 2.1: Consolidate Modal Patterns

`Notifications.tsx` and `UserManagement.tsx` both use the design system `Modal` component.

### Step 2.2: Redense Product Rows

**File**: `frontend/src/components/ProductsPage.tsx` (new)

Create `ProductRow` component with progressive disclosure:

Desktop list view:
- Visible: thumbnail, title, ASIN badge, current price, price change badge, actions
- Hidden: categories (hover to show), list name (hover to show)

Mobile card view:
- Visible: thumbnail, title, current price, sparkline
- Tap to expand: categories, ASIN, list, full price history

### Step 2.3: Replace Category Filter with Accessible Component

**File**: `frontend/src/components/CategoryFilter.tsx` (new)

Replace `CategoryTreeFilter.tsx` with accessible pattern:

```typescript
import { Select } from '../design-system';
// Or implement accessible tree with:
// - ARIA tree role
// - Keyboard navigation (arrow keys, Enter, Space)
// - Focus management
// - Type-ahead search
```

### Step 2.4: Standardize Badge Usage

**File**: `frontend/src/components/Notifications.tsx`, `ProductDetail.tsx`, etc.

Replace all custom badge implementations with design system `Badge`:

```typescript
import { Badge } from '../design-system';

// Instead of inline styles:
<Badge variant={product.priceChange > 0 ? 'danger' : 'success'}>
  {product.priceChange > 0 ? '+' : ''}{product.priceChange}%
</Badge>
```

### ✅ Step 2.5: Redesign Import Progress Banner

Import progress uses thin `ProgressBar` at top of content (not full-width dark banner). Dismissable with `X` button.

### Step 2.6: Simplify Notifications UI

**File**: `frontend/src/components/Notifications.tsx`

Refactor using `Tabs` component and focused modals:

- Use design system `Tabs` for channel/rules/history navigation
- Channel creation: 3-step wizard modal
  - Step 1: Choose channel type (email/telegram/discord)
  - Step 2: Configure channel settings
  - Step 3: Test and confirm
- Rule creation: Focused modal with validation
- Move forms to separate components (`ChannelForm.tsx`, `RuleForm.tsx`)

### ✅ Step 2.7: Add Empty States

`Dashboard.tsx` uses `EmptyState` for no price changes. Design system `EmptyState` component is exported.

### Step 2.8: Fix Hardcoded English Strings

**File**: `frontend/src/components/Notifications.tsx`

Lines 294, 545, 612 — wrap with `t()`:

```typescript
// Before: <button>Delete</button>
// After: <button>{t('common.delete')}</button>
```

**File**: `frontend/src/i18n/locales/en.json`, `pt-BR.json`

Add missing translation keys if needed.

### Step 2.9: Apply Semantic Color System

**Files**: `frontend/src/App.css` (phased removal), individual component files

Use design system colors from `tokens.css`:

```css
/* Instead of hardcoded Amazon colors */
.button-primary {
  background-color: var(--color-accent-primary);
  color: var(--color-text-inverse);
}

.price-drop {
  color: var(--color-success);
  background-color: var(--color-success-subtle);
}

.price-increase {
  color: var(--color-danger);
  background-color: var(--color-danger-subtle);
}
```

---

## Phase 3: Responsiveness & Accessibility (Issues R1-R6)

### Step 3.1: Remove Overflow-x Suppression

**File**: `frontend/src/App.css`

Remove or replace problematic overflow hiding:

```css
/* Remove these: */
html, body { overflow-x: hidden; }
.dashboard, .product-list { overflow-x: hidden; }

/* Replace with proper responsive layouts */
```

Fix underlying layout issues that caused overflow (flex/grid issues, fixed widths).

### Step 3.2: Implement Responsive Tables with Card Pattern

**Files**: `frontend/src/components/admin/UserManagement.tsx`, `AuditLog.tsx`, `Notifications.tsx`

Use design system `Table` component with mobile card fallback:

```typescript
import { Table } from '../design-system';

<Table
  columns={columns}
  data={users}
  mobileCard={(user) => (
    <div className="mobile-user-card">
      <h4>{user.username}</h4>
      <Badge variant={user.role === 'ADMIN' ? 'info' : 'neutral'}>
        {user.role}
      </Badge>
      {/* actions */}
    </div>
  )}
/>
```

The `Table` component should handle:
- Desktop: traditional table with sortable columns
- Tablet (< 1024px): reduced columns, expandable rows
- Mobile (< 768px): card view with key info visible

### ✅ Step 3.3: Add Swipe Gesture Support

`frontend/src/hooks/useSwipeGesture.ts` created with touch handling.

### Step 3.4: Implement Configurable Pagination

**Files**: `ProductList.tsx`, `ProductSearch.tsx`

Add page size selector:

```typescript
const [pageSize, setPageSize] = useState(20);

<Select
  value={pageSize}
  onChange={(v) => setPageSize(Number(v))}
  options={[
    { value: 10, label: '10 per page' },
    { value: 20, label: '20 per page' },
    { value: 50, label: '50 per page' },
  ]}
/>
```

Mobile: default to 10, show "Load more" button instead of pagination.

### ✅ Step 3.5: Add ARIA Landmarks

`App.tsx` has `aria-label="Main navigation"` on nav, `role="main"` on main, skip-to-content link.

### Step 3.6: Implement Collapsible Sidebar on Mobile

**File**: `frontend/src/components/ListsSidebar.tsx`

Mobile behavior:
- Default: collapsed, show "Filters (X)" chip
- Tap: expand as bottom sheet or overlay
- Use `useMediaQuery` to detect breakpoint

```typescript
import { useMediaQuery } from '../hooks/useMediaQuery';

const isMobile = useMediaQuery('(max-width: 768px)');

return isMobile ? <MobileFilters /> : <DesktopSidebar />;
```

---

## Phase 4: Layout Shell Implementation

### Step 4.1: Create AppShell Component

**New File**: `frontend/src/layout/AppShell.tsx`

Implement responsive layout:

Desktop (> 1024px):
```
┌─────────┬───────────────────────────┬──────────────┐
│         │ [Global search]    [User] │              │
│  NAV    │                           │   DETAIL     │
│ (240px) │     Main Content          │   PANEL      │
│         │     (flexible)            │  (400px)     │
│         │                           │  optional    │
└─────────┴───────────────────────────┴──────────────┘
```

Tablet (768px - 1024px):
```
┌──┬────────────────────────────┐
│  │ [Search bar]  [User] [⋮]  │
│N │                            │
│A │     Main Content Area      │
│V │                            │
└──┴────────────────────────────┘
```

Mobile (< 768px):
```
┌─────────────────────────────┐
│ [← Back]  Page Title  [⋮]  │
│                             │
│     Main Content Area       │
│                             │
├─────────────────────────────┤
│ 🏠  📦  🔍  ⚙️             │
└─────────────────────────────┘
```

### Step 4.2: Create Bottom Tab Bar

**New File**: `frontend/src/layout/BottomTabBar.tsx`

Mobile-only bottom navigation:
- 4 tabs: Dashboard, Products, Search (will be merged), Settings
- Active state: filled icon + accent color
- Hide on scroll down, show on scroll up
- Safe-area-inset padding

### Step 4.3: Update App.tsx to Use AppShell

**File**: `frontend/src/App.tsx`

```typescript
import { AppShell } from './layout/AppShell';

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ImportProvider>
          <AppShell>
            <Routes>
              {/* routes */}
            </Routes>
          </AppShell>
        </ImportProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
```

---

## Phase 5: Code Splitting & Performance

### ✅ Step 5.1: Lazy Load Secondary Views

`App.tsx` uses `lazy`/`Suspense` for `ProductSearch`, `ProductDetail`, and `Config`.

### Step 5.2: Lazy Load Recharts

**Files**: `Dashboard.tsx`, `SystemStats.tsx`, `ProductDetail.tsx`

```typescript
const PriceChart = lazy(() => import('recharts').then(m => ({ default: m.LineChart })));
```

---

## Critical Files to Modify

### New Files (~10):
- `frontend/src/components/ProductsPage.tsx` — Unified products view
- `frontend/src/components/SettingsPage.tsx` — Consolidated settings
- `frontend/src/components/CategoryFilter.tsx` — Accessible category filter
- `frontend/src/components/ProductRow.tsx` — Progressive disclosure row
- `frontend/src/layout/AppShell.tsx` — Responsive layout shell
- `frontend/src/layout/BottomTabBar.tsx` — Mobile navigation
- `frontend/src/hooks/useSwipeGesture.ts` — ✅ Done
- `frontend/src/hooks/useMediaQuery.ts` — ✅ Done

### Modified Files (~12):
- `frontend/src/App.tsx` — Router integration ✅, AppShell integration pending
- `frontend/src/main.tsx` — BrowserRouter wrapper ✅
- `frontend/src/components/Dashboard.tsx` — EmptyState ✅, design system
- `frontend/src/components/ProductDetail.tsx` — Sheet pattern pending
- `frontend/src/components/Notifications.tsx` — Modal pattern ✅, tabs/i18n pending
- `frontend/src/components/admin/UserManagement.tsx` — Modal pattern ✅
- `frontend/src/components/ListsSidebar.tsx` — Mobile collapsible pending
- `frontend/src/App.css` — overflow-x cleanup pending
- `frontend/package.json` — react-router-dom ✅
- `frontend/src/i18n/locales/en.json` — Add missing keys pending
- `frontend/src/i18n/locales/pt-BR.json` — Add missing keys pending

### Deleted Files (~2):
- `frontend/src/components/ProductList.tsx` — Merge into ProductsPage (pending)
- `frontend/src/components/ProductSearch.tsx` — Merge into ProductsPage (pending)

---

## Verification

### Navigation & Routing
1. Test browser back/forward preserves state (pagination, filters)
2. Test URLs are shareable (copy paste product URL)
3. Test page refresh maintains view state
4. Test deep linking to specific products works

### UI Design System
1. Verify all modals use consistent `Modal` component
2. Verify all badges use design system `Badge`
3. Verify empty states exist for all major views
4. Verify English strings are translated in Notifications
5. Verify colors follow semantic palette

### Responsiveness
1. Test at 1024px breakpoint (tablet layout)
2. Test at 768px breakpoint (mobile layout)
3. Test at 480px breakpoint (small mobile)
4. Test tables transform to cards on mobile
5. Test sidebar collapses to chip on mobile
6. Test swipe gestures work on touch devices

### Accessibility
1. Run keyboard navigation through entire app
2. Test screen reader announcements for modals and toasts
3. Verify focus management in modals
4. Test skip-to-content link works
5. Verify ARIA labels on interactive elements

---

## Dependencies

- `react-router-dom` — URL routing ✅
- Existing design system components are already in place ✅

---

## Implementation Order

1. **Phase 1** — Navigation & routing (foundational) ✅ mostly done
2. **Phase 4** — Layout shell (enables responsive changes) ← next
3. **Phase 2** — UI design system migration (independent, parallelizable)
4. **Phase 3** — Responsiveness & accessibility (depends on layout)
5. **Phase 5** — Code splitting ✅ mostly done

Each phase produces a working application. Can stop after any phase.
