# Frontend Refactor Plan — Navigation, UI & Responsiveness

## Context

This plan addresses issues in three areas of the frontend refactor plan:

1. **Navigation & Information Architecture** (Section 1.2) — No URL routing, state loss on navigation, flat navigation structure, disconnected views, inconsistent detail view behavior
2. **UI & Visual Design** (Section 1.3) — No design system usage, inconsistent modals, dense layouts, hard-to-use filters, badge proliferation, intrusive progress banner, complex notifications UI, missing empty states, hardcoded strings, semantic color misuse
3. **Responsiveness & Accessibility** (Section 1.4) — Overflow hiding as band-aid, non-mobile-friendly tables, no touch gestures, fixed pagination, missing ARIA, non-collapsible sidebar

The design system components (`Button`, `Card`, `Input`, `Modal`, `Badge`, `EmptyState`, `Skeleton`, `Toast`, `ProgressBar`, `Tabs`, `Sheet`, `Table`) and CSS tokens already exist but are not being used by the existing components.

---

## Phase 1: Navigation & Routing (Issues N1-N5)

### Step 1.1: Install and Configure React Router

**File**: `frontend/package.json`

```bash
npm install react-router-dom
```

**File**: `frontend/src/main.tsx`

Wrap `App` with `BrowserRouter`:
```typescript
import { BrowserRouter } from 'react-router-dom';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>
);
```

### Step 1.2: Define Route Structure

**File**: `frontend/src/App.tsx`

Replace `currentView` state-based navigation with URL-based routing:

```typescript
// Remove: type View = 'dashboard' | 'products' | ...
// Add: define routes
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';

// Route structure:
// /               → Dashboard
// /products       → Products (unified browse + search)
// /products/:id   → Products with detail panel open
// /settings       → Settings (account section)
// /settings/notifications → Settings (notifications section)
// /settings/database → Settings (database section)
// /settings/admin  → Settings (admin section, if admin)
// /settings/admin/users → Settings (user management)
```

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

### Step 1.5: Migrate Existing Components to Use Router

**Files**: `frontend/src/App.tsx`

```typescript
// Update navigation:
- setCurrentView('products')
+ navigate('/products')

// Update URL params for product detail:
- selectedProduct && setCurrentView('detail')
+ navigate(`/products/${productId}`)

// Update back navigation:
- onBack={() => setCurrentView('products')}
+ onBack={() => navigate('/products')}
```

**Files**: `Dashboard.tsx`, `ProductList.tsx`, `ProductSearch.tsx`, `Config.tsx`, `AdminPanel.tsx`

Replace `onClick` handlers with `Link` components or `useNavigate` hook.

### Step 1.6: Update ProductDetail for Sheet Pattern

**File**: `frontend/src/components/ProductDetail.tsx`

- Remove dual rendering (side panel vs full page)
- Always render as content (context determines container)
- On mobile: full-screen slide-in with swipe-back gesture
- On desktop: render inside `Sheet` component from design system

### Step 1.7: Preserve State on Navigation

**Files**: `frontend/src/App.tsx`

Use `useLocation` and `useNavigate` with state preservation:
- Store filters in URL query params (`?category=...&list=...&sort=...`)
- Pagination state in URL (`?page=2`)
- This allows browser back/forward and shareable URLs

---

## Phase 2: UI Design System Migration (Issues V1-V10)

### Step 2.1: Consolidate Modal Patterns

**File**: `frontend/src/components/admin/UserManagement.tsx`

Replace inline modal with design system `Modal` component:

```typescript
// Before:
{showCreateModal && (
  <div className="modal" onClick={() => setShowCreateModal(false)}>
    <div className="modal-content" onClick={(e) => e.stopPropagation()}>
      {/* content */}
    </div>
  </div>
)}

// After:
import { Modal } from '../design-system';
<Modal isOpen={showCreateModal} onClose={() => setShowCreateModal(false)}>
  {/* content */}
</Modal>
```

**File**: `frontend/src/components/Notifications.tsx`

Replace `modal-overlay` pattern with `Modal` component:
- Channel creation form becomes modal with wizard steps
- Rule form becomes modal
- Delete confirmation becomes modal

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

### Step 2.5: Redesign Import Progress Banner

**File**: `frontend/src/App.tsx`

Change from full-width banner to subtle progress indicator:

```typescript
// Before: Full-width dark banner
// After: Thin progress bar at top of main content
<div className="import-progress-bar">
  <ProgressBar value={percent} variant="accent" size="sm" />
  <button onClick={() => setShowProgress(false)} aria-label="Dismiss">
    <X size={16} />
  </button>
</div>
```

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

### Step 2.7: Add Empty States

**Files**: `Dashboard.tsx`, `ProductsPage.tsx`, `Notifications.tsx`

Add design system `EmptyState` components:

```typescript
import { EmptyState } from '../design-system';

{products.length === 0 && (
  <EmptyState
    icon={<Package />}
    title={t('products.noProductsTitle')}
    description={t('products.noProductsDescription')}
    action={
      <Button onClick={handleAddProduct}>
        {t('products.addFirstProduct')}
      </Button>
    }
  />
)}
```

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

### Step 3.3: Add Swipe Gesture Support

**New File**: `frontend/src/hooks/useSwipeGesture.ts`

```typescript
import { useRef, useEffect } from 'react';

interface SwipeHandlers {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  threshold?: number;
}

export function useSwipeGesture(handlers: SwipeHandlers) {
  const touchStart = useRef(0);
  const { onSwipeLeft, onSwipeRight, threshold = 50 } = handlers;

  useEffect(() => {
    const handleTouchStart = (e: TouchEvent) => {
      touchStart.current = e.touches[0].clientX;
    };

    const handleTouchEnd = (e: TouchEvent) => {
      const diff = touchStart.current - e.changedTouches[0].clientX;
      if (Math.abs(diff) > threshold) {
        if (diff > 0) onSwipeLeft?.();
        else onSwipeRight?.();
      }
    };

    // Attach to element
  }, [onSwipeLeft, onSwipeRight, threshold]);
}
```

**Apply to**:
- Product detail sheet: swipe right to dismiss
- Product rows: swipe left to reveal quick actions
- Dashboard cards: horizontal swipe

### Step 3.4: Implement Configurable Pagination

**Files**: `ProductsPage.tsx`, `ProductSearch.tsx` (until merged)

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

### Step 3.5: Add ARIA Landmarks

**File**: `frontend/src/App.tsx`

```typescript
<nav className="navbar" aria-label="Main navigation">
  <main className="main-content" id="main-content">
  <aside className="lists-sidebar" aria-label="Product lists">
```

Add skip-to-content link:
```typescript
<a href="#main-content" className="skip-to-content">
  Skip to content
</a>
```

**File**: `frontend/src/components/Modal.tsx` (design system)

Ensure:
- `role="dialog"` on modal
- `aria-modal="true"`
- `aria-labelledby` referencing title
- Focus trap implementation
- Return focus to trigger on close

### Step 3.6: Implement Collapsible Sidebar on Mobile

**File**: `frontend/src/components/ListsSidebar.tsx` (or merge into filter bar)

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

### Step 5.1: Lazy Load Secondary Views

**File**: `frontend/src/App.tsx`

```typescript
import { lazy, Suspense } from 'react';

const ProductsPage = lazy(() => import('./components/ProductsPage'));
const SettingsPage = lazy(() => import('./components/SettingsPage'));
const AdminSection = lazy(() => import('./components/admin/AdminSection'));

// Wrap in Suspense with Skeleton
<Suspense fallback={<Skeleton />}>
  <Routes>
    {/* ... */}
  </Routes>
</Suspense>
```

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
- `frontend/src/hooks/useSwipeGesture.ts` — Touch gesture detection
- `frontend/src/hooks/useMediaQuery.ts` — Breakpoint detection

### Modified Files (~12):
- `frontend/src/App.tsx` — Router integration, navigation changes
- `frontend/src/main.tsx` — BrowserRouter wrapper
- `frontend/src/components/Dashboard.tsx` — Empty states, design system
- `frontend/src/components/ProductDetail.tsx` — Sheet pattern, swipe gestures
- `frontend/src/components/Notifications.tsx` — Modal pattern, tabs, i18n fix
- `frontend/src/components/admin/UserManagement.tsx` — Modal pattern
- `frontend/src/components/ListsSidebar.tsx` — Mobile collapsible
- `frontend/src/App.css` — Gradual style cleanup
- `frontend/package.json` — Add react-router-dom
- `frontend/src/i18n/locales/en.json` — Add missing keys
- `frontend/src/i18n/locales/pt-BR.json` — Add missing keys

### Deleted Files (~2):
- `frontend/src/components/ProductList.tsx` — Merged into ProductsPage
- `frontend/src/components/ProductSearch.tsx` — Merged into ProductsPage

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

- `react-router-dom` — URL routing
- Existing design system components are already in place

---

## Implementation Order

1. **Phase 1** — Navigation & routing (foundational)
2. **Phase 4** — Layout shell (enables responsive changes)
3. **Phase 2** — UI design system migration (independent, parallelizable)
4. **Phase 3** — Responsiveness & accessibility (depends on layout)
5. **Phase 5** — Code splitting (optimization pass)

Each phase produces a working application. Can stop after any phase.
