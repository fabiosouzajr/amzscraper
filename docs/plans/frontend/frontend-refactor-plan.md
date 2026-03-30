# Frontend Refactor Plan — Amazon Price Tracker

> **Design direction**: *Warm Functional Minimalism* — inspired by Sunsama's calm warmth, Slack's structural maturity, and Akiflow's modern polish. A dashboard that feels like a well-organized workspace rather than a dense spreadsheet.

> **Last updated**: 2026-03-28 — reflects work done across 20+ commits since plan was written.

---

## 1. Issues & Weaknesses Found

### 1.1 Architecture & Performance

| # | Issue | Status | Notes |
|---|-------|--------|-------|
| A1 | **Monolithic CSS** — single `App.css` (~58 KB, 3,733 lines originally) | ⚠️ Partial | Design system CSS Modules created; `App.css` actually grew to ~4,108 lines as new styles were added alongside old ones. Cleanup deferred to Phase 5. |
| A2 | **No code splitting** | ✅ Done | `vite.config.ts` splits recharts, react-dom, i18n into separate chunks. `App.tsx` lazy-loads `ProductsPage`, `ProductDetail`, `SettingsPage`. |
| A3 | **No shared data cache** — duplicate API calls per component mount | ❌ Not done | TanStack Query planned but not implemented. Still using `useState` + `useEffect` + `fetch`. |
| A4 | **No memoization** | ⚠️ Partial | Some hooks added; systematic `useMemo`/`useCallback`/`React.memo` audit not done. |
| A5 | **Client-side sort redundancy** in `ProductList` | ✅ Done | Removed. |
| A6 | **Unbounced admin search** | ✅ Done | `useDebouncedValue` hook created and applied to `UserManagement`. |
| A7 | **Unused `react-router-dom`** | ✅ Done | Now actively used for URL routing throughout the app. |

### 1.2 Navigation & Information Architecture

| # | Issue | Status | Notes |
|---|-------|--------|-------|
| N1 | **No URL routing / browser history** | ✅ Done | React Router v7 installed. Full route tree defined. Back/forward works. |
| N2 | **View switch destroys state** | ✅ Done | URL-based navigation; filters passed via URL query params. |
| N3 | **Flat navigation** — 6 views at same level | ✅ Done | Reduced to 3 primary views: Dashboard, Products, Settings. |
| N4 | **Disconnected Products and Search** | ✅ Done | Merged into unified `ProductsPage.tsx`. `ProductSearch.tsx` deleted. |
| N5 | **Inconsistent detail view** | ✅ Done | `ProductDetail` always renders as content; `Sheet` wrapper used on desktop, full-screen on mobile with swipe-back gesture. |

### 1.3 UI & Visual Design

| # | Issue | Status | Notes |
|---|-------|--------|-------|
| V1 | **No design system** — colors/spacing hardcoded inconsistently | ✅ Done | `tokens.css` + all design system components built. Old components not fully migrated yet. |
| V2 | **Two incompatible modal patterns** | ✅ Done | `Notifications` and `UserManagement` both use design system `Modal`. |
| V3 | **Dense product rows** | ❌ Not done | `ProductsPage` exists but no progressive disclosure row design implemented. |
| V4 | **Category filter not accessible** | ✅ Done | New `CategoryFilter.tsx` with full ARIA tree role, keyboard navigation, and i18n. |
| V5 | **Badge proliferation** | ✅ Done | Standardized via design system `Badge` component across admin tables and `ProductDetail`. |
| V6 | **Intrusive import progress banner** | ✅ Done | Now a thin `ProgressBar` at top of content with dismiss button. |
| V7 | **Dense Notifications UI** | ✅ Done | `ChannelForm.tsx` and `RuleForm.tsx` extracted. `Tabs` design system component used. |
| V8 | **No empty states** | ⚠️ Partial | `EmptyState` component exists and used in Dashboard. Not added to Products or Settings views. |
| V9 | **Hardcoded English strings** in Notifications | ✅ Done | Wrapped with `t()`, translation keys added to `en.json` and `pt-BR.json`. |
| V10 | **Color used decoratively, not semantically** | ⚠️ Partial | `tokens.css` defines semantic palette. Old `App.css` rules not fully replaced. |

### 1.4 Responsiveness & Accessibility

| # | Issue | Status | Notes |
|---|-------|--------|-------|
| R1 | **Overflow-x suppression** applied to 8+ elements | ⚠️ Partial | Reduced to 1 occurrence in `App.css`. Remaining likely from layout quirks not yet resolved. |
| R2 | **Tables not adapted for mobile** | ✅ Done | Admin tables (`UserManagement`, `AuditLog`) use design system `Table` with card-on-mobile pattern. |
| R3 | **No touch gesture support** | ⚠️ Partial | `useSwipeGesture` hook built; swipe-back on `ProductDetail` implemented. Swipe on product rows not done. |
| R4 | **Fixed 20-item page size** | ❌ Not done | Still hardcoded. No adjustable page size or "load more" on mobile. |
| R5 | **No ARIA landmarks** | ⚠️ Partial | `AppShell` has `aria-label="Main navigation"` and `role="main"`. `CategoryFilter` has full ARIA tree. Full audit not done. |
| R6 | **Sidebar doesn't collapse on mobile** | ✅ Done | `ListsSidebar` uses `useMediaQuery` to collapse to chip on mobile. |

---

## 2. Design System (Reference)

### 2.1 Color Palette (`tokens.css`)

```
SURFACES
  --color-bg-primary:       #FAFAF8      Warm off-white
  --color-bg-secondary:     #F3F2EE      Warm light gray (cards)
  --color-bg-elevated:      #FFFFFF      Pure white (modals, sheets)
  --color-bg-inset:         #EDECEA      Input fields, code blocks

TEXT
  --color-text-primary:     #1A1A18      Warm near-black
  --color-text-secondary:   #6B6966      Descriptions, labels
  --color-text-tertiary:    #9C9891      Placeholders, timestamps
  --color-text-inverse:     #FAFAF8      Light text on dark backgrounds

INTERACTIVE
  --color-accent-primary:   #D4622B      Primary CTA (warm amber-orange)
  --color-accent-hover:     #B8521F      Hover state
  --color-accent-subtle:    #FDF0E8      Selection, accent backgrounds

SEMANTIC
  --color-success:          #2D8A4E      Price drop / positive
  --color-success-subtle:   #EDF7F0
  --color-danger:           #C4361C      Price increase / error
  --color-danger-subtle:    #FEF1EE
  --color-info:             #2B6CB0      Informational / links
  --color-info-subtle:      #EBF4FF
  --color-warning:          #C27803      Caution / pending
  --color-warning-subtle:   #FFF8E1

BORDERS
  --color-border-primary:   #E5E3DF
  --color-border-secondary: #D1CFC9
  --color-border-focus:     #D4622B
```

### 2.2 Typography

```
DISPLAY: "DM Sans" (planned — not yet added to index.html)
BODY:    "IBM Plex Sans" (planned — not yet added)
MONO:    "IBM Plex Mono" (planned — for ASINs, prices)

TYPE SCALE (fluid, clamp-based):
  --font-size-xs:    clamp(0.6875rem, 0.65rem + 0.1vw, 0.75rem)
  --font-size-sm:    clamp(0.75rem, 0.7rem + 0.15vw, 0.875rem)
  --font-size-base:  clamp(0.875rem, 0.825rem + 0.15vw, 1rem)
  --font-size-md:    clamp(1rem, 0.925rem + 0.2vw, 1.125rem)
  --font-size-lg:    clamp(1.125rem, 1rem + 0.35vw, 1.375rem)
  --font-size-xl:    clamp(1.375rem, 1.15rem + 0.6vw, 1.75rem)
  --font-size-2xl:   clamp(1.75rem, 1.4rem + 0.95vw, 2.375rem)
```

### 2.3 Design System Components (all built in `src/design-system/`)

| Component | File | Status |
|-----------|------|--------|
| Badge | `Badge.tsx` | ✅ Built |
| Button | `Button.tsx` | ✅ Built |
| Card | `Card.tsx` | ✅ Built |
| EmptyState | `EmptyState.tsx` | ✅ Built |
| Input | `Input.tsx` | ✅ Built |
| Modal | `Modal.tsx` | ✅ Built |
| ProgressBar | `ProgressBar.tsx` | ✅ Built |
| Sheet | `Sheet.tsx` | ✅ Built |
| Skeleton | `Skeleton.tsx` | ✅ Built |
| Table | `Table.tsx` | ✅ Built |
| Tabs | `Tabs.tsx` | ✅ Built |
| Toast | `Toast.tsx` | ✅ Built |
| tokens.css | `tokens.css` | ✅ Built |
| OverflowMenu | — | ❌ Not built |
| Tooltip | — | ❌ Not built |
| Dropdown | — | ❌ Not built |
| IconButton | — | ❌ Not built |

### 2.4 Shared Hooks (all built in `src/hooks/`)

| Hook | Status |
|------|--------|
| `useMediaQuery` | ✅ Built |
| `useSwipeGesture` | ✅ Built |
| `useDebouncedValue` | ✅ Built |
| `useProducts` | ❌ Not built (TanStack Query) |
| `useCategories` | ❌ Not built |
| `useNotifications` | ❌ Not built |

### 2.5 Layout (built in `src/layout/`)

| Component | Status |
|-----------|--------|
| `AppShell.tsx` | ✅ Built — responsive shell with sidebar (desktop) / top bar (mobile) |
| `BottomTabBar.tsx` | ✅ Built — mobile-only tab bar, safe-area-inset padding |

### 2.6 Navigation Structure (implemented)

```
Routes:
  /                       → Dashboard
  /products               → ProductsPage (unified browse + search + filters)
  /products/:id           → ProductsPage with Sheet open
  /settings/*             → SettingsPage (Account, Notifications, DB, Export, Admin)
  /admin                  → redirects to /settings/admin

Views: 3 primary (Dashboard, Products, Settings)

Layout by breakpoint:
  > 1024px: persistent sidebar (240px) + content + optional Sheet panel
  768–1024px: collapsed nav + content
  < 768px: content + bottom tab bar (4 tabs)
```

---

## 3. Implementation Status

### ✅ Phase 1: Design System & Tokens — DONE

- `src/design-system/tokens.css` with full CSS custom property set
- All 12 design system components built with CSS Modules
- `lucide-react` installed
- `src/hooks/`: `useMediaQuery`, `useSwipeGesture`, `useDebouncedValue`

### ❌ Phase 2: Data Layer (TanStack Query) — NOT STARTED

**Goal**: Eliminate duplicate fetches, preserve data across view switches, improve perceived performance.

**Step 2.1**: Install `@tanstack/react-query`:
```bash
cd frontend && npm install @tanstack/react-query
```

**Step 2.2**: Create `src/queryClient.ts`:
```ts
import { QueryClient } from '@tanstack/react-query';
export const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 60_000, retry: 2 } }
});
```
Wrap `App` in `<QueryClientProvider client={queryClient}>` in `main.tsx`.

**Step 2.3**: Create query hooks in `src/hooks/`:
- `useProducts(filters)` — key: `['products', filters]`
- `useProduct(id)` — key: `['product', id]`
- `useCategories()` — key: `['categories']`, staleTime: 300_000
- `usePriceDrops()` / `usePriceIncreases()` — dashboard data
- `useLists()` — list data
- `useNotificationChannels()`, `useNotificationRules(productId?)`, `useNotificationHistory()`
- `useAdminUsers(search)` — uses debounced key (already have `useDebouncedValue`)

**Step 2.4**: Create mutation hooks:
- `useAddProduct()` — invalidates `['products']` on success
- `useDeleteProduct()` — optimistic removal from cache
- `useUpdatePrices()` — wraps SSE stream, updates cache as prices arrive
- `useCreateChannel/UpdateChannel/DeleteChannel()` with cache invalidation
- `useCreateRule/UpdateRule/DeleteRule()`

**Step 2.5**: Migrate components one at a time:
1. `CategoryFilter` — immediate deduplication win (fetches categories independently)
2. `Dashboard`
3. `ProductList` / `ProductsPage`
4. `Notifications`
5. Admin components

**Deliverable**: Views preserve data on remount. No duplicate requests. Consistent loading/error states.

---

### ✅ Phase 3: Layout Restructure — DONE

- `AppShell.tsx`: responsive shell (sidebar desktop, bottom tab bar mobile)
- `BottomTabBar.tsx`: mobile nav with safe-area-inset
- `ProductsPage.tsx`: unified browse + search + Sheet detail
- `SettingsPage.tsx`: consolidated Config + Admin with sidebar nav
- React Router v7 with full route tree
- `ListsSidebar` collapsible on mobile

---

### ✅ Phase 4: Component Migration — DONE

**Done:**
- Dashboard: `EmptyState` added, uses design system `ProgressBar` for update progress
- ProductDetail: always rendered as content, `Sheet` wrapper from design system, swipe-back gesture
- Notifications: `Tabs` component, `ChannelForm`/`RuleForm` extracted, `Modal` from design system, i18n fixed
- Admin tables: design system `Table` with card-on-mobile
- `UserManagement`: design system `Modal`, `useDebouncedValue` for search, EmptyState for empty/no-match search
- Import progress: design system `ProgressBar` + dismiss button
- `CategoryFilter`: new accessible component with ARIA tree
- Badges: standardized with design system `Badge`
- **Step 4.1**: Fonts added to `index.html` — DM Sans, IBM Plex Sans, IBM Plex Mono via Google Fonts
- **Step 4.2**: Progressive disclosure product rows — ASIN badge in main row (monospace), categories on hover (desktop), price slot future-proofed
- **Step 4.3**: EmptyState added to `ProductList` (empty category/list/system) and `UserManagement` (no users / no search matches)
- **Step 4.4**: Auth page redesigned — uses design system `Card`, `Input`, `Button`; warm `--color-bg-primary` background; `Auth.module.css` with design tokens only
- **Step 4.5**: ARIA polish — Modal focus trap selector fixed (disabled elements excluded), Toast nested live region fixed, skip-to-content already present, import progress aria-live present

---

### ✅ Phase 5: CSS Cleanup & Performance — DONE

**Done:**
- Code splitting via `vite.config.ts` (recharts, react-dom, i18n as separate chunks)
- Lazy loading in `App.tsx` for `ProductsPage`, `ProductDetail`, `SettingsPage`
- **Step 5.1**: `App.css` fully deleted (2026-03-28). Was ~4,244 lines. All styles migrated to
  component CSS Modules and `index.css` global utilities across 7 commits on `new-frontend`.
- **Step 5.2**: Loading skeletons — `AppLoadingSkeleton` and `PageSkeleton` replace plain `<div className="loading">` in `App.tsx`
- **Step 5.3**: Recharts lazy-loads correctly — confirmed it only loads when chart is visible
- **Step 5.4**: Adjustable page size — `ProductList` has 10/20/50 page size selector
- **Step 5.5**: Overflow-x cleanup done as part of App.css removal

---

### ⚠️ Phase 6: Advanced Mobile — PARTIALLY DONE

**Done:**
- Swipe-left on product rows reveals delete action (via `SwipeableRow` + `useSwipeGesture`)

**Not started:**

**Step 6.1: Pull-to-refresh** ❌
- Products: pull down triggers product list refresh
- Dashboard: pull down triggers price data refresh
- Implement via `useSwipeGesture` with downward direction detection

**Step 6.2: Swipe on product rows** ✅ Done — delete action revealed on swipe-left

**Step 6.3: Offline awareness** ❌
- Detect `navigator.onLine` + `online`/`offline` events
- Show subtle "You're offline" banner when disconnected
- TanStack Query (Phase 2) can serve cached data offline with `networkMode: 'offlineFirst'`

**Step 6.4: Haptic feedback** ❌ (optional)
- `navigator.vibrate(10)` on destructive actions (delete confirmation)
- Guard with `'vibrate' in navigator`

---

## 4. Remaining Work Summary

| Priority | Task | Effort | Depends On |
|----------|------|--------|------------|
| **High** | Phase 5.1: App.css cleanup | High | Component migration |
| **Medium** | Phase 5.3: Verify Recharts lazy-load | Low | Nothing |
| **Medium** | Phase 5.5: Fix remaining overflow-x | Low | Nothing |
| **Low** | Phase 6.1: Pull-to-refresh | Medium | Nothing |
| **Low** | Phase 6.3: Offline awareness banner | Low | Nothing |

---

## 5. File Map

### Implemented

```
frontend/src/
  design-system/
    tokens.css ✅
    Badge.tsx + Badge.module.css ✅
    Button.tsx + Button.module.css ✅
    Card.tsx + Card.module.css ✅
    EmptyState.tsx + EmptyState.module.css ✅
    Input.tsx + Input.module.css ✅
    Modal.tsx + Modal.module.css ✅
    ProgressBar.tsx + ProgressBar.module.css ✅
    Sheet.tsx + Sheet.module.css ✅
    Skeleton.tsx + Skeleton.module.css ✅
    Table.tsx + Table.module.css ✅
    Tabs.tsx + Tabs.module.css ✅
    Toast.tsx + Toast.module.css ✅
    index.ts ✅

  layout/
    AppShell.tsx + AppShell.module.css ✅
    BottomTabBar.tsx + BottomTabBar.module.css ✅

  hooks/
    useMediaQuery.ts ✅
    useSwipeGesture.ts ✅
    useDebouncedValue.ts ✅
    useProducts.ts ✅   (TanStack Query — Phase 2)
    useProduct.ts ✅    (TanStack Query — Phase 2)
    useCategories.ts ✅ (TanStack Query — Phase 2)
    useDashboard.ts ✅  (TanStack Query — Phase 2)
    useNotifications.ts ✅ (TanStack Query — Phase 2)
    useLists.ts ✅      (TanStack Query — Phase 2)

  components/
    ProductsPage.tsx ✅    (unified products + search)
    SettingsPage.tsx ✅    (Config + Admin consolidated)
    CategoryFilter.tsx ✅  (accessible ARIA tree)
    ChannelForm.tsx ✅     (extracted from Notifications)
    RuleForm.tsx ✅        (extracted from Notifications)
    ProductDetail.tsx ✅   (Sheet pattern + swipe-back)
    Dashboard.tsx ✅       (EmptyState added)
    ListsSidebar.tsx ✅    (mobile collapsible)
    Notifications.tsx ✅   (Tabs + design system Modal)
    admin/UserManagement.tsx ✅ (design system Modal + debounce)
    admin/AuditLog.tsx ✅  (design system Table)
```

### Planned / Not Yet Built

```
  design-system/
    OverflowMenu.tsx          ← Phase 4 (if needed)
    Tooltip.tsx               ← Phase 4 (if needed)
```

### Phase 2 Done

```
  (queryClient configured in main.tsx)
  hooks/useProducts.ts ✅
  hooks/useProduct.ts ✅
  hooks/useCategories.ts ✅
  hooks/useDashboard.ts ✅
  hooks/useNotifications.ts ✅
  hooks/useLists.ts ✅
```

### Still Needs Migration

```
  App.css        — ~4,200 lines; delete after components migrated to CSS Modules
  components/
    ProductList.tsx — uses App.css for styles (not yet CSS Modules)
    config/*.tsx  — AccountSection, DatabaseSection, DataExportSection (inside SettingsPage but styles from App.css)
```

### Newly Migrated (this session)

```
  components/Auth.tsx ✅            (redesigned — uses design system Card/Input/Button)
  components/Auth.module.css ✅     (new — design tokens only)
```
