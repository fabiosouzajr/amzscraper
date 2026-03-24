# Frontend Refactor Plan — Amazon Price Tracker

> **Design direction**: *Warm Functional Minimalism* — inspired by Sunsama's calm warmth, Slack's structural maturity, and Akiflow's modern polish. A dashboard that feels like a well-organized workspace rather than a dense spreadsheet.

---

## 1. Issues & Weaknesses Found

### 1.1 Architecture & Performance

| # | Issue | Impact | Evidence |
|---|-------|--------|----------|
| A1 | **Monolithic CSS** — single `App.css` at 3,733 lines (~58 KB) with duplicate rules, specificity conflicts, and no scoping | Every user downloads all styles including admin-only styles; impossible to tree-shake; duplicate `.admin-panel` definitions (lines 2580 and 2977) override each other silently | `App.css` |
| A2 | **No code splitting** — entire app including Recharts, admin panel, and react-router-dom (unused) ships as a single bundle | First-load bundle unnecessarily large; admin-heavy components loaded for all users | `vite.config.ts` has no `rollupOptions` |
| A3 | **No shared data cache** — every component mount triggers fresh API calls; `CategoryTreeFilter` fetches independently in `ProductList` and `ProductSearch` simultaneously | Duplicate network requests on every view switch; all component state resets when navigating away | `ProductList.tsx`, `ProductSearch.tsx`, `CategoryTreeFilter.tsx` |
| A4 | **No memoization** — zero `useMemo`, `useCallback`, or `React.memo` usage | Callback props create new references on every render; sub-trees re-render unnecessarily | All component files |
| A5 | **Client-side sort redundancy** — `ProductList` sorts products by `localeCompare` after every fetch despite server already supporting sorted endpoints | Wasted CPU cycles on every product page load | `ProductList.tsx:51` |
| A6 | **Unbounced admin search** — `UserManagement` fires API call on every keystroke | Excessive network requests while typing | `UserManagement.tsx` `useEffect([searchQuery])` |
| A7 | **Unused dependency** — `react-router-dom` installed but never imported; navigation is state-based | ~15 KB wasted bundle size | `package.json` vs. actual imports |

### 1.2 Navigation & Information Architecture

| # | Issue | Impact |
|---|-------|--------|
| N1 | **No URL routing / browser history** — refresh always returns to dashboard; no shareable product URLs | Users lose their place on refresh; cannot bookmark or share specific views |
| N2 | **View switch destroys state** — changing `currentView` unmounts the previous component, losing all scroll position, filters, pagination | High friction when switching between Products and Search; users must re-apply filters |
| N3 | **Flat navigation** — all 6 views (Dashboard, Products, Search, Config, Admin, Detail) at the same level in the navbar | No hierarchy; the navbar becomes crowded; "Config" and "Admin" compete for attention with primary actions |
| N4 | **Disconnected search and products** — separate views for browsing (Products) and searching (Search) with different UIs for the same data | Cognitive overhead; users must decide which view to use; category filters duplicated in both |
| N5 | **Detail view is context-dependent** — `ProductDetail` renders as a side panel in Search but as a full page when accessed via prev/next navigation | Inconsistent mental model; users don't know what to expect |

### 1.3 UI & Visual Design

| # | Issue | Impact |
|---|-------|--------|
| V1 | **No design system** — colors, spacing, radii, and typography are inconsistent across components; colors hardcoded throughout CSS | Every new component introduces visual drift; Amazon's navy/orange palette clashes with the auth page's purple gradient |
| V2 | **Two incompatible modal patterns** — `UserManagement` uses `.modal` as overlay directly; `Notifications` uses `.modal-overlay` + `.modal` wrapper | Inconsistent dismiss behavior; different animations; different z-index stacking |
| V3 | **Dense product rows** — product list shows all columns simultaneously including ASIN, categories, price, history chart, and action buttons | Overwhelming on smaller screens; most information is not needed for scanning |
| V4 | **Category filter is a custom tree dropdown** — built from scratch with recursive rendering, no keyboard navigation, and a document-level click listener | Not accessible (no ARIA); difficult to use on mobile; no type-ahead search for large category trees |
| V5 | **Badge proliferation** — 7+ badge variants (category, list, role, status, action, channel-type, rule-type) with inconsistent sizing and spacing | Visual noise; badges compete for attention instead of conveying hierarchy |
| V6 | **Import progress is a global banner** — the `ImportProgressBanner` occupies a dark strip below the navbar for the entire duration of import | Distracting; pushes content down; no way to minimize or dismiss |
| V7 | **Notifications UI is dense** — 685-line component with three tabs, inline modals, and type-specific forms | Cognitive overload; the channel creation form shows all fields for all channel types simultaneously |
| V8 | **No empty states** — when a view has no data (no products, no notifications), the UI shows either nothing or a bare "No items found" text | Missed opportunity to guide users; new users see a blank dashboard |
| V9 | **Hardcoded English strings** in Notifications (delete confirmations) break i18n | Portuguese users see English confirmation dialogs |
| V10 | **Color used decoratively, not semantically** — green/red for price cards is correct, but navy/orange is used inconsistently for headers, buttons, active states, and borders with no clear hierarchy | Users cannot scan by color to understand state |

### 1.4 Responsiveness & Accessibility

| # | Issue | Impact |
|---|-------|--------|
| R1 | **Overflow-x suppression applied to 8+ elements** — `html`, `body`, `.app`, `.dashboard`, `.product-list`, `.product-list-item`, `.product-detail`, `.config-page` all disable horizontal scroll | Symptom of layout issues being hidden rather than fixed; likely causes content clipping |
| R2 | **Tables not adapted for mobile** — admin tables and price history tables overflow or become unreadable below 480px | Mobile users cannot read tabular data without horizontal scrolling |
| R3 | **No touch gesture support** — swipe to navigate, pull to refresh, or long-press for context menus are absent | Mobile experience feels like a shrunken desktop app |
| R4 | **Fixed 20-item page size** — pagination uses a hardcoded page size with no option to adjust | On mobile, 20 items with sparkline charts means excessive scrolling; on desktop, density could be higher |
| R5 | **No skip-to-content or ARIA landmarks** — navbar and main content lack `role` attributes; modals don't trap focus | Screen reader users cannot navigate efficiently; keyboard users can tab behind open modals |
| R6 | **Sidebar (ListsSidebar) doesn't collapse on mobile** — rendered inline, pushing content below | On small screens, the sidebar consumes the entire viewport width before the product list is visible |

---

## 2. Recommended Redesign

### 2.1 Design Tokens & System Foundation

**Philosophy**: Establish a single source of truth for every visual decision via CSS custom properties. No magic numbers in component styles.

```
Design Token Categories:
  --color-*        Semantic palette (surface, text, accent, state)
  --space-*        Spacing scale (4, 8, 12, 16, 24, 32, 48, 64)
  --radius-*       Border radius (sm: 6px, md: 10px, lg: 16px, pill: 9999px)
  --shadow-*       Elevation levels (sm, md, lg)
  --font-*         Typography tokens
  --duration-*     Animation timing
  --z-*            Z-index scale
```

### 2.2 Color Palette

A restrained, functional palette where color communicates meaning. Inspired by Sunsama's warmth with Slack's structural clarity.

```
SURFACES
  --color-bg-primary:       #FAFAF8      Warm off-white (Sunsama-inspired cream)
  --color-bg-secondary:     #F3F2EE      Warm light gray (card backgrounds)
  --color-bg-elevated:      #FFFFFF      Pure white (modals, floating elements)
  --color-bg-inset:         #EDECEA      Subtle inset (input fields, code blocks)

TEXT
  --color-text-primary:     #1A1A18      Warm near-black (headings, body)
  --color-text-secondary:   #6B6966      Warm medium gray (descriptions, labels)
  --color-text-tertiary:    #9C9891      Warm light gray (placeholders, timestamps)
  --color-text-inverse:     #FAFAF8      Light text on dark backgrounds

INTERACTIVE
  --color-accent-primary:   #D4622B      Warm amber-orange (primary CTA, links)
  --color-accent-hover:     #B8521F      Darker amber (hover state)
  --color-accent-subtle:    #FDF0E8      Pale amber (accent backgrounds, selection)

SEMANTIC (functional — these carry meaning)
  --color-success:          #2D8A4E      Price drop / positive change
  --color-success-subtle:   #EDF7F0      Success background
  --color-danger:           #C4361C      Price increase / error / destructive
  --color-danger-subtle:    #FEF1EE      Danger background
  --color-info:             #2B6CB0      Informational / links
  --color-info-subtle:      #EBF4FF      Info background
  --color-warning:          #C27803      Caution / pending
  --color-warning-subtle:   #FFF8E1      Warning background

BORDERS & DIVIDERS
  --color-border-primary:   #E5E3DF      Default border
  --color-border-secondary: #D1CFC9      Stronger separation
  --color-border-focus:     #D4622B      Focus rings (matches accent)
```

**Rules**:
- Color is only used for **state** (success/danger/warning/info), **interaction** (accent for CTAs and links), and **hierarchy** (surface layering). Never for decoration.
- Badges inherit their color from their semantic category (channel type → info, price drop → success, etc.).
- Dark mode is achievable by swapping the CSS variable values without touching component styles.

### 2.3 Typography

Two fonts that balance personality with readability:

```
DISPLAY / HEADINGS
  Font:    "DM Sans", system-ui, sans-serif
  Reason:  Geometric, friendly, distinctive without being showy.
           Available on Google Fonts. Sunsama uses it for body — we elevate it to headings.

BODY / UI
  Font:    "IBM Plex Sans", system-ui, sans-serif
  Reason:  Excellent x-height, clear at small sizes, open-source.
           Distinctive from the Inter/Roboto default without being flashy.
           Humanist proportions complement DM Sans's geometry.

MONOSPACE (ASINs, prices, data)
  Font:    "IBM Plex Mono", monospace
  Reason:  Pairs naturally with IBM Plex Sans. ASINs and prices benefit from
           fixed-width clarity.

TYPE SCALE (fluid, Slack-inspired clamp approach)
  --font-size-xs:    clamp(0.6875rem, 0.65rem + 0.1vw, 0.75rem)     /* 11-12px */
  --font-size-sm:    clamp(0.75rem, 0.7rem + 0.15vw, 0.875rem)      /* 12-14px */
  --font-size-base:  clamp(0.875rem, 0.825rem + 0.15vw, 1rem)       /* 14-16px */
  --font-size-md:    clamp(1rem, 0.925rem + 0.2vw, 1.125rem)        /* 16-18px */
  --font-size-lg:    clamp(1.125rem, 1rem + 0.35vw, 1.375rem)       /* 18-22px */
  --font-size-xl:    clamp(1.375rem, 1.15rem + 0.6vw, 1.75rem)      /* 22-28px */
  --font-size-2xl:   clamp(1.75rem, 1.4rem + 0.95vw, 2.375rem)      /* 28-38px */

WEIGHTS
  --font-weight-normal:   400
  --font-weight-medium:   500
  --font-weight-semibold: 600

LINE HEIGHTS
  --line-height-tight:    1.2    (headings)
  --line-height-normal:   1.5    (body)
  --line-height-relaxed:  1.7    (long-form text)
```

### 2.4 Iconography

**Library**: Lucide React (tree-shakeable, 1000+ icons, consistent 24px grid, MIT licensed). Already compatible with the React stack; smaller than alternatives like Heroicons or Feather.

**Rules**:
- Icons are always `currentColor` — they inherit text color from their parent.
- Icon size follows 3 tiers: `16px` (inline/badges), `20px` (buttons/nav), `24px` (section headers/empty states).
- Every icon has an `aria-label` or is `aria-hidden="true"` if decorative.
- No icon-only buttons without a tooltip or `aria-label`.

### 2.5 Layout & Information Architecture

**New navigation model**: Collapse the flat 6-item navbar into a clear hierarchy.

```
MOBILE (< 768px): Bottom tab bar + top contextual header
  ┌─────────────────────────────┐
  │ [← Back]  Page Title  [⋮]  │  ← Contextual top bar
  │                             │
  │                             │
  │     Main Content Area       │
  │                             │
  │                             │
  ├─────────────────────────────┤
  │ 🏠  📦  🔍  ⚙️             │  ← Bottom tab bar (4 tabs)
  └─────────────────────────────┘

  Tabs: Dashboard | Products | Search | Settings
  Settings opens a view containing: Config + Notifications + Admin (if admin)
  Product detail is a full-screen slide-in from right (swipe-back to dismiss)

TABLET (768px - 1024px): Collapsible sidebar + content
  ┌──┬────────────────────────────┐
  │  │ [Search bar]  [User] [⋮]  │
  │N │                            │
  │A │                            │
  │V │     Main Content Area      │
  │  │                            │
  │  │                            │
  └──┴────────────────────────────┘

  Sidebar: Icon-only rail (48px wide), expands to 240px on hover/click
  Nav items: Dashboard, Products (unified browse+search), Settings, Admin

DESKTOP (> 1024px): Persistent sidebar + content + optional detail panel
  ┌─────────┬───────────────────────────┬──────────────┐
  │         │ [Global search]    [User] │              │
  │  NAV    │                           │   DETAIL     │
  │ (240px) │     Main Content          │   PANEL      │
  │         │     (flexible)            │  (400px)     │
  │         │                           │  optional    │
  └─────────┴───────────────────────────┴──────────────┘

  Detail panel slides in when selecting a product (no view switch needed)
  Closing the panel returns focus to the list
```

**View consolidation**:
- **Merge Products + Search** into a single "Products" view with an integrated search bar, category filter, and list filter. The current separation is artificial — they show the same data with slightly different controls.
- **Merge Config + Notifications** into a single "Settings" view with sections.
- **Product Detail** becomes a side panel on desktop, a full-screen overlay on mobile — never a separate "view" in the state machine.
- **Admin** becomes a section within Settings (visible only to admins), not a top-level nav item.

**New view count**: 3 primary views (Dashboard, Products, Settings) instead of 6.

### 2.6 Component Architecture

**New component structure**:

```
src/
  design-system/              ← Reusable primitives (no business logic)
    tokens.css                  CSS custom properties
    Button.tsx                  Primary, secondary, ghost, danger variants
    Input.tsx                   Text, search, number with label + error states
    Select.tsx                  Native select with custom styling
    Badge.tsx                   Semantic variants (success, danger, info, neutral)
    Card.tsx                    Surface with elevation options
    Modal.tsx                   Focus-trapped, backdrop-dismiss, animation
    Dropdown.tsx                Accessible dropdown with keyboard nav
    Table.tsx                   Responsive table (cards on mobile)
    EmptyState.tsx              Icon + message + optional CTA
    Skeleton.tsx                Loading placeholder
    Toast.tsx                   Non-blocking notifications
    ProgressBar.tsx             Determinate + indeterminate
    Tabs.tsx                    Accessible tabbed interface
    Tooltip.tsx                 Hover/focus tooltip
    IconButton.tsx              Icon-only with tooltip
    Sheet.tsx                   Slide-in panel (used for detail view)
    OverflowMenu.tsx            Three-dot menu for secondary actions

  features/                   ← Business logic grouped by domain
    auth/
      AuthPage.tsx              Login/register (full-page)
      useAuth.ts                Auth hook (replaces AuthContext consumer)

    dashboard/
      DashboardPage.tsx         Price drops + increases
      PriceChangeCard.tsx       Individual card (extracted from Dashboard)
      UpdateProgress.tsx        Inline progress for price updates

    products/
      ProductsPage.tsx          Unified browse + search + filters
      ProductRow.tsx             Individual product (list mode)
      ProductCard.tsx            Individual product (grid mode)
      ProductDetail.tsx          Detail panel content
      ProductSheet.tsx           Sheet wrapper for detail (responsive)
      AddProductForm.tsx         ASIN input + CSV import
      CategoryFilter.tsx         Accessible tree select
      ListFilter.tsx             List selector (replaces ListsSidebar)
      ProductNotifications.tsx   Per-product rules

    notifications/
      NotificationsSection.tsx   Channels + rules + history
      ChannelForm.tsx            Extracted modal form
      RuleForm.tsx               Extracted modal form

    settings/
      SettingsPage.tsx           Shell with sidebar navigation
      AccountSection.tsx
      DatabaseSection.tsx
      DataExportSection.tsx
      NotificationsSection.tsx   (re-exports from notifications/)

    admin/
      AdminSection.tsx           Conditionally rendered in Settings
      UserManagement.tsx
      SystemStats.tsx
      SystemConfig.tsx
      AuditLog.tsx

  hooks/                      ← Shared hooks
    useProducts.ts              SWR/TanStack Query wrapper for products
    useCategories.ts            Cached category tree
    useNotifications.ts         Channels + rules
    useDebouncedValue.ts        Generic debounce
    useMediaQuery.ts            Responsive breakpoint detection
    useSwipeGesture.ts          Touch swipe detection

  services/
    api.ts                      (existing, minimal changes)

  i18n/                        (existing, fix missing translations)

  contexts/
    AuthContext.tsx              (existing, minimal changes)
    ImportContext.tsx            (existing, minimal changes)
```

### 2.7 Key Component Redesigns

**Unified Products Page** — replaces both `ProductList` and `ProductSearch`:
- Single search bar at the top (always visible, with instant results).
- Filter bar below: category dropdown + list dropdown + sort dropdown. Collapsible on mobile (tap "Filters" chip to expand).
- View toggle: list mode (dense rows) vs. grid mode (cards with sparkline).
- Pagination with adjustable page size (10/20/50) and "load more" option on mobile.
- Selecting a product opens the `Sheet` panel on the right (desktop) or pushes a full-screen view (mobile).
- "Add Product" is a floating action button on mobile, an inline form on desktop.

**Dashboard** — focused on the single task of monitoring price changes:
- Two sections: "Drops" and "Increases" with horizontal scroll cards on mobile (swipeable).
- Each card shows: product thumbnail, name (2 lines max), current price, change percentage, sparkline.
- "Update Prices" becomes a subtle button in the page header, not a large inline action.
- Progress is shown as a thin animated bar at the very top of the page (not a banner that pushes content).
- Empty state: illustration + "No price changes detected yet. Add products to start tracking."

**Settings Page** — information architecture:
- Left sidebar (desktop) / top tabs (mobile) with sections: Account, Notifications, Database, Export, Admin (if admin).
- Each section is its own route segment, preserving state when switching.
- Notification channel creation is a focused modal with a wizard: Step 1 (choose type) → Step 2 (configure) → Step 3 (test).

**Responsive Table → Card pattern**:
- On desktop (>768px): traditional table with sortable columns.
- On tablet (768px): reduced columns, secondary data in expandable rows.
- On mobile (<768px): each row becomes a card with key info visible and details in an expandable section.

### 2.8 Spacing System

Based on a 4px grid:

```
--space-1:   4px     (tight inline gaps)
--space-2:   8px     (icon-to-text, badge padding)
--space-3:   12px    (input padding, small card padding)
--space-4:   16px    (standard gap, card padding)
--space-6:   24px    (section padding, card gaps)
--space-8:   32px    (section margins)
--space-12:  48px    (page section separation)
--space-16:  64px    (major section breaks)
```

### 2.9 Elevation & Surfaces

Inspired by Sunsama's light touch — depth through background layering, not heavy shadows:

```
--shadow-sm:   0 1px 2px rgba(0,0,0,0.04), 0 1px 3px rgba(0,0,0,0.03)
--shadow-md:   0 2px 4px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.04)
--shadow-lg:   0 4px 8px rgba(0,0,0,0.04), 0 8px 24px rgba(0,0,0,0.06)

ELEVATION HIERARCHY (background + shadow):
  Level 0: --color-bg-primary   (page background)        no shadow
  Level 1: --color-bg-secondary (cards, sections)         --shadow-sm
  Level 2: --color-bg-elevated  (modals, sheets, dropdowns) --shadow-lg
  Level 3: --color-bg-elevated  (tooltips, toasts)        --shadow-lg + border
```

**Border treatment**: Use `1px solid var(--color-border-primary)` sparingly — prefer background color contrast for separation. Borders only where elements are adjacent on the same background level. All border-radius uses `--radius-md` (10px) by default; `--radius-sm` (6px) for inputs/badges; `--radius-lg` (16px) for cards and modals.

### 2.10 Motion & Animation

```
TIMING
  --duration-fast:    100ms    (hover, focus, color changes)
  --duration-normal:  200ms    (expand/collapse, fade in/out)
  --duration-slow:    350ms    (sheet slide, modal entrance)

EASING
  --ease-default:     cubic-bezier(0.4, 0, 0.2, 1)        (general transitions)
  --ease-enter:       cubic-bezier(0, 0, 0.2, 1)           (elements entering)
  --ease-exit:        cubic-bezier(0.4, 0, 1, 1)           (elements leaving)
  --ease-spring:      cubic-bezier(0.34, 1.56, 0.64, 1)    (playful bounce)

PATTERNS
  Sheet slide-in:     translateX(100%) → translateX(0), --duration-slow, --ease-enter
  Modal entrance:     opacity 0 + scale(0.97) → opacity 1 + scale(1), --duration-normal
  Card hover:         translateY(0) → translateY(-2px), --duration-fast
  Skeleton pulse:     opacity 0.4 → 1 → 0.4, 1.5s infinite
  Progress bar:       width transition, --duration-normal
  Tab switch:         Underline slides via transform, --duration-normal
  Toast enter:        translateY(16px) + opacity 0 → translateY(0) + opacity 1
```

Use `prefers-reduced-motion: reduce` to disable all animations except opacity fades.

### 2.11 Mobile-First Patterns

**Bottom Tab Bar** (mobile only, < 768px):
- 4 tabs: Dashboard, Products, Search, Settings.
- Active tab uses accent color fill on icon + label.
- Fixed to bottom, 56px height, safe-area-inset padding for notched devices.
- Hides on scroll down, reveals on scroll up (saves screen real estate).

**Gesture support**:
- **Swipe right** on product detail → dismiss (go back to list).
- **Swipe left on product row** → reveal quick actions (delete, add to list).
- **Pull down** on product list → refresh data.
- **Horizontal swipe** on dashboard cards → scroll through price changes.
- All gestures have visual affordances (slight peek of action buttons, scroll indicators).

**Collapsible sections**:
- Filter bar collapses into a "Filters (2)" chip showing active filter count.
- Product detail sections (Price History chart, History table, Notifications) are accordion panels — only one open at a time on mobile.
- Settings sidebar collapses into a horizontal scrollable tab strip.
- Admin tables collapse into card stacks with expandable rows.

**Touch targets**: All interactive elements minimum 44x44px (WCAG 2.5.8). Spacing between adjacent targets minimum 8px.

### 2.12 Data Layer Improvements

**Introduce TanStack Query (React Query)** for:
- Automatic request deduplication (fixes the duplicate `CategoryTreeFilter` fetches).
- Background refetching (stale-while-revalidate — views don't show loading spinners on revisit).
- Cache persistence across view switches (fixes state loss on navigation).
- Optimistic updates for mutations (add/delete product feels instant).
- Retry logic with exponential backoff (replaces manual error handling per component).

This replaces the current pattern of `useState` + `useEffect` + manual `fetch` in every component.

### 2.13 Routing

**Introduce file-based-like routing with React Router** (already installed, just unused):

```
/                       → Dashboard
/products               → Products (unified browse + search)
/products/:id           → Products with detail panel open
/settings               → Settings (account section)
/settings/notifications → Settings (notifications section)
/settings/database      → Settings (database section)
/settings/admin         → Settings (admin section, if admin)
/settings/admin/users   → Settings (user management)
```

Benefits: browser back/forward works, URLs are shareable, refresh preserves state, deep linking to specific products.

---

## 3. Step-by-Step Implementation Plan

This plan is ordered to deliver value incrementally. Each phase produces a working application. Phases can be executed independently after Phase 1.

---

### Phase 1: Foundation — Design System & Tokens
**Goal**: Establish the visual foundation without changing any existing functionality.

**Step 1.1: Create the design token file**
- Create `src/design-system/tokens.css` with all CSS custom properties defined in section 2.2–2.10.
- Import it in `main.tsx` before any other styles.
- Include color palette, typography scale, spacing scale, radius, shadows, z-index, and animation tokens.

**Step 1.2: Add fonts**
- Add Google Fonts link for DM Sans (400, 500, 600) and IBM Plex Sans (400, 500, 600) and IBM Plex Mono (400, 500) to `index.html`.
- Alternatively, self-host via `@fontsource/dm-sans`, `@fontsource/ibm-plex-sans`, `@fontsource/ibm-plex-mono`.
- Set `--font-display`, `--font-body`, `--font-mono` tokens.

**Step 1.3: Install dependencies**
- `npm install lucide-react` for icons.
- `npm install @tanstack/react-query` for data fetching.
- Remove `react-router-dom` from package.json if not adopting routing yet, or keep it for Phase 4.

**Step 1.4: Create primitive design-system components**
- Build each component in `src/design-system/` with its own CSS module (`Button.module.css`, etc.):
  - `Button` — variants: primary (accent fill), secondary (outlined), ghost (no border), danger (red). Sizes: sm, md, lg. Loading state with spinner.
  - `Input` — label, helper text, error state, left/right icon slots. Variants: text, search, number.
  - `Badge` — variants: success, danger, info, warning, neutral. Sizes: sm, md.
  - `Card` — elevation prop (0, 1, 2), optional header/footer slots, padding options.
  - `Modal` — focus trap, Escape to close, backdrop click to close, entrance/exit animation. Portal-rendered.
  - `Sheet` — slide-in panel from right. Width prop. Close button + swipe-to-dismiss on mobile.
  - `Skeleton` — rectangular and circular variants for loading states.
  - `EmptyState` — icon + title + description + optional action button.
  - `Toast` — success/error/info variants. Auto-dismiss timer. Stack management.
  - `Tabs` — accessible tab interface with keyboard navigation (arrow keys).
  - `OverflowMenu` — three-dot trigger, dropdown menu items, keyboard navigable.
  - `ProgressBar` — determinate (with percentage) and indeterminate (animated) modes.
  - `Tooltip` — hover/focus triggered, positioned with collision detection.
- Each component: use CSS Modules for scoped styles, consume design tokens, include `aria-*` attributes.
- Write a Storybook-like demo page (optional) or a simple `/dev` route to preview all components.

**Step 1.5: Create shared hooks**
- `useMediaQuery(query)` — returns boolean for responsive breakpoints.
- `useDebouncedValue(value, delay)` — generic debounce.
- `useSwipeGesture(ref, { onSwipeLeft, onSwipeRight, threshold })` — touch gesture detection.

**Deliverable**: New design system exists alongside old code. No existing functionality is changed.

---

### Phase 2: Data Layer — TanStack Query Migration
**Goal**: Eliminate duplicate fetches, preserve state across views, improve perceived performance.

**Step 2.1: Set up QueryClient**
- Create `src/queryClient.ts` with `QueryClient` configured: `staleTime: 60_000`, `retry: 2`.
- Wrap `App` in `<QueryClientProvider>`.

**Step 2.2: Create query hooks**
- `useProducts(filters)` — wraps `api.getProducts` with query key `['products', filters]`.
- `useProduct(id)` — wraps `api.getProduct` with query key `['product', id]`.
- `useCategories()` — wraps `api.getCategoryTree` with query key `['categories']`, `staleTime: 300_000` (5 min).
- `usePriceDrops()` / `usePriceIncreases()` — wraps dashboard API calls.
- `useLists()` — wraps `api.getLists`.
- `useNotificationChannels()` / `useNotificationRules(productId?)` / `useNotificationHistory()`.
- `useAdminUsers(search)` — wraps admin search with debounced query key.

**Step 2.3: Create mutation hooks**
- `useAddProduct()` — calls `api.addProduct`, invalidates `['products']` on success.
- `useDeleteProduct()` — calls `api.deleteProduct`, optimistic removal from cache.
- `useUpdatePrices()` — wraps SSE stream, updates query cache as prices arrive.
- `useCreateChannel()`, `useUpdateChannel()`, `useDeleteChannel()` — with cache invalidation.
- `useCreateRule()`, `useUpdateRule()`, `useDeleteRule()`.

**Step 2.4: Migrate existing components incrementally**
- Replace `useState` + `useEffect` fetch patterns with query hooks one component at a time.
- Start with `CategoryTreeFilter` (immediate deduplication win) → `Dashboard` → `ProductList` → `ProductSearch` → `Notifications` → Admin components.
- Remove client-side sort in `ProductList` (rely on server sort or sort in the query hook).

**Deliverable**: All data fetching goes through TanStack Query. Views preserve data on remount. Duplicate requests eliminated.

---

### Phase 3: Layout Restructure — Navigation & Views
**Goal**: Implement the new navigation model and view consolidation.

**Step 3.1: Implement responsive layout shell**
- Create `src/layout/AppShell.tsx` — the root layout component.
- Desktop: sidebar (240px) + main content area + optional right panel.
- Tablet: collapsed sidebar rail (48px) + content.
- Mobile: full-width content + bottom tab bar.
- Use `useMediaQuery` to switch between layouts.

**Step 3.2: Build sidebar navigation**
- Desktop: persistent sidebar with icon + label for each nav item.
- Nav items: Dashboard, Products, Settings. Admin badge on Settings if user is admin.
- Active state: accent-colored left border + subtle background tint.
- User avatar + name at the bottom, with overflow menu (logout, language switch).

**Step 3.3: Build bottom tab bar** (mobile)
- Fixed bottom bar, 4 tabs: Dashboard, Products, Search (magnifying glass), Settings.
- Active tab: filled icon + accent color label. Inactive: outlined icon + muted label.
- `safe-area-inset-bottom` padding for notched devices.
- Auto-hide on scroll down with smooth slide animation.

**Step 3.4: Merge Products + Search into a unified view**
- Create `src/features/products/ProductsPage.tsx`.
- Top section: search bar (always visible) + filter chips (category, list, sort).
- Filter chips expand into a dropdown/panel on tap (mobile) or show inline dropdowns (desktop).
- Results area: product list with configurable view (list/grid toggle).
- When a product is selected:
  - Desktop: `Sheet` opens on the right (400px) with `ProductDetail`.
  - Mobile: full-screen slide-in with swipe-back gesture.

**Step 3.5: Merge Config + Admin into Settings**
- Create `src/features/settings/SettingsPage.tsx`.
- Desktop: left nav sidebar with sections. Mobile: horizontal scrollable tab bar.
- Sections: Account, Notifications, Database, Data Export, Admin (conditional).
- Admin sub-sections: Users, Stats, Config, Audit Log.

**Step 3.6: Implement React Router**
- Define routes matching the URL structure in section 2.13.
- Use `React.lazy()` for code splitting:
  - `DashboardPage` — eagerly loaded.
  - `ProductsPage` — eagerly loaded.
  - `SettingsPage` — lazy loaded.
  - Admin sub-components — lazy loaded within Settings.
- Replace `currentView` state with `useNavigate()` / `useLocation()`.
- Handle `selectedProduct` via URL params (`/products/:id`).

**Deliverable**: New navigation with 3 primary views, URL routing, code splitting, responsive layout shell.

---

### Phase 4: Component Migration — New Design System
**Goal**: Replace old components with design system components, one feature at a time.

**Step 4.1: Migrate Dashboard**
- Replace hardcoded card styles with `<Card>` component.
- Extract `PriceChangeCard` as a reusable component with `<Badge>` for percentage.
- Replace progress bar with `<ProgressBar>` component.
- Add `<EmptyState>` for when no price changes exist.
- Add horizontal scroll with snap points for cards on mobile.
- Replace the "Update Prices" button with a `<Button variant="secondary">` in the page header.

**Step 4.2: Migrate Products**
- Replace ASIN input with `<Input>` + `<Button>` using design system components.
- Replace product table rows with `<ProductRow>` component using design system primitives.
- Implement responsive table → card switch using `useMediaQuery`.
- Replace `CategoryTreeFilter` with an accessible `<Dropdown>` tree component.
- Replace `ListsSidebar` with a `<Select>` or filter chip in the filter bar.
- Replace `add-to-list-dropdown` (JS-positioned) with `<OverflowMenu>`.
- Add swipe-left on product rows for quick actions (mobile).

**Step 4.3: Migrate Product Detail**
- Wrap in `<Sheet>` component (desktop side panel) or full-screen with back gesture (mobile).
- Organize content into collapsible accordion sections:
  1. Overview (always open): thumbnail, title, ASIN, category, current price, Amazon link.
  2. Price History Chart (default open on desktop, collapsed on mobile).
  3. Price History Table (collapsed by default).
  4. Notifications (collapsed by default).
- Replace prev/next buttons with swipe gesture on mobile + keyboard arrows on desktop.

**Step 4.4: Migrate Notifications**
- Replace three-tab layout with `<Tabs>` component.
- Replace inline modal forms with `<Modal>` component.
- Implement channel creation as a 3-step wizard modal.
- Replace notification tables with responsive `<Table>` (cards on mobile).
- Fix hardcoded English strings (use i18n `t()` calls).

**Step 4.5: Migrate Settings & Admin**
- Replace config cards with `<Card>` component.
- Replace admin tables with responsive `<Table>` component.
- Add debounce to user search (using `useDebouncedValue` hook).
- Implement `SystemStats` charts with lazy-loaded Recharts (code-split).
- Remove duplicate CSS rule definitions.

**Step 4.6: Auth page refresh**
- Redesign login/register as a centered card on the warm background.
- Remove the purple gradient (inconsistent with the warm palette).
- Use design system `<Input>`, `<Button>`, `<Card>` components.

**Deliverable**: All components migrated to design system. Consistent visual language throughout.

---

### Phase 5: CSS Cleanup & Performance
**Goal**: Remove the monolithic CSS, optimize bundle, polish animations.

**Step 5.1: Remove App.css**
- As components are migrated in Phase 4, their styles move to CSS Modules.
- After all components are migrated, `App.css` should be empty or near-empty.
- Delete `App.css` and any remaining orphaned styles in `index.css`.
- Verify no visual regressions by testing every view.

**Step 5.2: Optimize bundle**
- Remove `react-router-dom` if not used (Phase 3 resolves this).
- Verify code splitting is working: admin and settings chunks should not load on dashboard.
- Lazy-load Recharts: `const LineChart = React.lazy(() => import('recharts').then(m => ({ default: m.LineChart })))`.
- Add `<Suspense fallback={<Skeleton />}>` around lazy-loaded chart components.

**Step 5.3: Add loading skeletons**
- Dashboard: skeleton cards matching the `PriceChangeCard` layout.
- Products: skeleton rows matching the product list layout.
- Product Detail: skeleton for chart area + text lines.
- Settings: skeleton for section content.

**Step 5.4: Add accessibility audit**
- Run `axe-core` or similar on every view.
- Ensure all modals trap focus and return focus on close.
- Add `aria-live="polite"` regions for toast notifications and progress updates.
- Add skip-to-content link.
- Verify color contrast meets WCAG AA (4.5:1 for normal text, 3:1 for large text).
- Test keyboard navigation through all interactive elements.

**Step 5.5: Polish animations**
- Sheet slide-in/out with spring easing.
- Tab indicator slide animation.
- Card hover elevation transition.
- Skeleton pulse animation.
- Toast stack enter/exit animations.
- Page transition fade (optional, subtle).
- Respect `prefers-reduced-motion`.

**Deliverable**: Clean CSS architecture, optimized bundle, polished micro-interactions, accessible interface.

---

### Phase 6: Advanced Mobile & Gesture Support
**Goal**: Make the mobile experience feel native.

**Step 6.1: Pull-to-refresh**
- On Products page: pull down triggers `queryClient.invalidateQueries(['products'])`.
- On Dashboard: pull down triggers price data refresh.
- Visual: accent-colored spinner that appears above the content as you pull.

**Step 6.2: Swipe gestures**
- Product rows: swipe left reveals "Delete" and "Add to List" action buttons.
- Product detail sheet: swipe right to dismiss.
- Dashboard cards: horizontal swipe to scroll through price changes.
- Implement using `useSwipeGesture` hook with configurable threshold (50px default).

**Step 6.3: Haptic feedback** (optional)
- Use `navigator.vibrate(10)` on destructive actions (delete confirmation).
- Light vibration on successful product add.
- Only on devices that support it (`'vibrate' in navigator`).

**Step 6.4: Offline awareness**
- Detect offline status (`navigator.onLine` + `online`/`offline` events).
- Show a subtle "You're offline" banner.
- TanStack Query's `networkMode: 'offlineFirst'` serves cached data when offline.

**Step 6.5: Install as PWA** (optional, future)
- Add `manifest.json` with app name, icons, theme color.
- Register a service worker for basic asset caching.
- Users can "Add to Home Screen" on mobile for an app-like experience.

**Deliverable**: Native-feeling mobile experience with gesture support and offline resilience.

---

### Implementation Priority Matrix

| Phase | Effort | Impact | Dependencies | Recommendation |
|-------|--------|--------|-------------|----------------|
| Phase 1: Design System | Medium | Foundation | None | **Start here** — everything depends on this |
| Phase 2: Data Layer | Medium | High (perf + UX) | Phase 1 (minimal) | **Do second** — immediate wins, low risk |
| Phase 3: Layout | High | High (navigation) | Phase 1 | **Do third** — biggest visible change |
| Phase 4: Component Migration | High | High (consistency) | Phase 1, 3 | **Do fourth** — systematic, can be incremental |
| Phase 5: Cleanup | Medium | Medium (polish) | Phase 4 | **Do fifth** — cleanup pass |
| Phase 6: Mobile Gestures | Low-Medium | Medium (mobile UX) | Phase 3 | **Do last** — enhancement layer |

### Estimated File Changes

```
NEW FILES (~30):
  src/design-system/tokens.css
  src/design-system/Button.tsx + Button.module.css
  src/design-system/Input.tsx + Input.module.css
  src/design-system/Badge.tsx + Badge.module.css
  src/design-system/Card.tsx + Card.module.css
  src/design-system/Modal.tsx + Modal.module.css
  src/design-system/Sheet.tsx + Sheet.module.css
  src/design-system/Skeleton.tsx + Skeleton.module.css
  src/design-system/EmptyState.tsx + EmptyState.module.css
  src/design-system/Toast.tsx + Toast.module.css
  src/design-system/Tabs.tsx + Tabs.module.css
  src/design-system/OverflowMenu.tsx + OverflowMenu.module.css
  src/design-system/ProgressBar.tsx + ProgressBar.module.css
  src/design-system/Table.tsx + Table.module.css
  src/design-system/Tooltip.tsx + Tooltip.module.css
  src/design-system/Dropdown.tsx + Dropdown.module.css
  src/layout/AppShell.tsx + AppShell.module.css
  src/layout/Sidebar.tsx + Sidebar.module.css
  src/layout/BottomTabBar.tsx + BottomTabBar.module.css
  src/features/products/ProductsPage.tsx
  src/features/products/ProductRow.tsx
  src/features/products/ProductCard.tsx
  src/features/settings/SettingsPage.tsx
  src/features/dashboard/PriceChangeCard.tsx
  src/features/dashboard/UpdateProgress.tsx
  src/hooks/useProducts.ts
  src/hooks/useCategories.ts
  src/hooks/useMediaQuery.ts
  src/hooks/useDebouncedValue.ts
  src/hooks/useSwipeGesture.ts
  src/queryClient.ts

MODIFIED FILES (~15):
  src/main.tsx                         (add providers)
  src/App.tsx                          (replace with router + shell)
  src/services/api.ts                  (minor: export query keys)
  src/components/Dashboard.tsx         (refactor to use design system)
  src/components/ProductDetail.tsx     (refactor)
  src/components/Notifications.tsx     (refactor + fix i18n)
  src/components/ProductNotifications.tsx (refactor)
  src/components/Auth.tsx              (refactor)
  src/components/admin/*.tsx           (refactor each)
  src/components/config/*.tsx          (refactor each)
  src/i18n/locales/en.json             (add missing keys)
  src/i18n/locales/pt-BR.json          (add missing keys)
  index.html                           (add fonts)
  package.json                         (add dependencies)

DELETED FILES (~3):
  src/App.css                          (replaced by CSS Modules)
  src/components/ProductList.tsx       (replaced by ProductsPage)
  src/components/ProductSearch.tsx     (merged into ProductsPage)
```
