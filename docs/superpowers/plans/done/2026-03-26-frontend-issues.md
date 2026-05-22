# Frontend Issues Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve all remaining open issues from Section 1 of the frontend refactor plan (A1, A3, A4, V3, V8, V10, R3, R5).

**Architecture:** Issues are grouped by dependency — TanStack Query first (A3) because other improvements build on stable data fetching; UI polish next (V3, V8, V10, R3, R5); CSS cleanup last (A1, A4) because it requires components to be fully migrated first.

**Tech Stack:** React 18, TypeScript, Vite, @tanstack/react-query, CSS Modules, lucide-react, existing design system at `frontend/src/design-system/`

**No test framework** — verification is via `npm run build` (TypeScript compile) + manual visual check.

---

> **Pre-read items** — skim these before starting:
> - `frontend/src/components/ProductList.tsx` — primary target for A3, V3, V8
> - `frontend/src/design-system/index.ts` — available components
> - `frontend/src/hooks/index.ts` — available hooks
> - `frontend/src/services/api.ts` — all API methods
> - `docs/plans/frontend/frontend-refactor-plan.md` — full context

---

## Status: Already Done (no action needed)

- **R1 (overflow-x)** — the one remaining `overflow-x: hidden` in App.css is on `.add-to-list-dropdown`. This is a dropdown menu clipping its own contents, not a layout suppression. Leave it.
- **R4 (fixed page size)** — `ProductList` already has a 10/20/50 page-size `<select>` with `aria-label`. Done.
- **R5 (Modal focus trap)** — `design-system/Modal.tsx` already implements a focus trap.
- **R5 (Toast aria-live)** — `design-system/Toast.tsx` already emits `aria-live="polite"/"assertive"`.
- **R5 (skip-to-content)** — `App.tsx` already renders a skip link pointing to `#main-content`.
- **R5 (nav ARIA)** — `AppShell` already has `aria-label="Main navigation"` and `aria-current="page"`.

---

## Task 1 — TanStack Query: Setup (A3)

**Files:**
- Create: `frontend/src/queryClient.ts`
- Modify: `frontend/src/main.tsx`

- [ ] **Step 1.1: Install the package**

```bash
cd frontend && npm install @tanstack/react-query
```

Expected output: resolves without errors, `package.json` updated.

- [ ] **Step 1.2: Create the QueryClient**

Create `frontend/src/queryClient.ts`:

```ts
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,       // 1 min before re-fetch
      retry: 2,
      refetchOnWindowFocus: false,
    },
  },
});
```

- [ ] **Step 1.3: Wrap App in QueryClientProvider**

Edit `frontend/src/main.tsx`. Current content:

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './design-system/tokens.css';
import './index.css';
import App from './App.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
```

Replace with:

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './queryClient';
import './design-system/tokens.css';
import './index.css';
import App from './App.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </BrowserRouter>
  </StrictMode>,
);
```

- [ ] **Step 1.4: Verify build passes**

```bash
cd frontend && npm run build
```

Expected: no TypeScript errors.

- [ ] **Step 1.5: Commit**

```bash
git add frontend/src/queryClient.ts frontend/src/main.tsx frontend/package.json frontend/package-lock.json
git commit -m "feat: add TanStack Query QueryClient and provider"
```

---

## Task 2 — TanStack Query: Product & Category Hooks (A3)

**Files:**
- Create: `frontend/src/hooks/useProducts.ts`
- Create: `frontend/src/hooks/useProduct.ts`
- Create: `frontend/src/hooks/useCategories.ts`
- Modify: `frontend/src/hooks/index.ts`

- [ ] **Step 2.1: Create `useProducts` hook**

Create `frontend/src/hooks/useProducts.ts`:

```ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';

export const PRODUCTS_KEY = (categoryFilter?: string, page?: number, pageSize?: number) =>
  ['products', categoryFilter ?? '', page ?? 1, pageSize ?? 20] as const;

export function useProducts(categoryFilter?: string, page = 1, pageSize = 20) {
  return useQuery({
    queryKey: PRODUCTS_KEY(categoryFilter, page, pageSize),
    queryFn: () => api.getProducts(categoryFilter || undefined, page, pageSize),
  });
}

export function useAddProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (asin: string) => api.addProduct(asin),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] });
    },
  });
}

export function useDeleteProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.deleteProduct(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] });
    },
  });
}
```

- [ ] **Step 2.2: Create `useProduct` hook**

Create `frontend/src/hooks/useProduct.ts`:

```ts
import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';

export const PRODUCT_KEY = (id: number) => ['product', id] as const;

export function useProduct(id: number | null) {
  return useQuery({
    queryKey: PRODUCT_KEY(id ?? 0),
    queryFn: () => api.getProduct(id!),
    enabled: id !== null,
  });
}
```

- [ ] **Step 2.3: Create `useCategories` hook**

Create `frontend/src/hooks/useCategories.ts`:

```ts
import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';

export const CATEGORIES_KEY = ['categories'] as const;

export function useCategories() {
  return useQuery({
    queryKey: CATEGORIES_KEY,
    queryFn: () => api.getCategoryTree(),
    staleTime: 5 * 60_000, // 5 min — category tree rarely changes
  });
}
```

- [ ] **Step 2.4: Export from hooks index**

Edit `frontend/src/hooks/index.ts`. Append:

```ts
export * from './useProducts';
export * from './useProduct';
export * from './useCategories';
```

- [ ] **Step 2.5: Build check**

```bash
cd frontend && npm run build
```

Expected: no errors.

- [ ] **Step 2.6: Commit**

```bash
git add frontend/src/hooks/
git commit -m "feat: add useProducts, useProduct, useCategories TanStack Query hooks"
```

---

## Task 3 — TanStack Query: Dashboard & Notification Hooks (A3)

**Files:**
- Create: `frontend/src/hooks/useDashboard.ts`
- Create: `frontend/src/hooks/useNotifications.ts`
- Create: `frontend/src/hooks/useLists.ts`
- Modify: `frontend/src/hooks/index.ts`

- [ ] **Step 3.1: Create `useDashboard` hook**

Create `frontend/src/hooks/useDashboard.ts`:

```ts
import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';

export function usePriceDrops(limit = 10) {
  return useQuery({
    queryKey: ['priceDrops', limit],
    queryFn: () => api.getPriceDrops(limit),
    staleTime: 30_000,
  });
}

export function usePriceIncreases(limit = 10) {
  return useQuery({
    queryKey: ['priceIncreases', limit],
    queryFn: () => api.getPriceIncreases(limit),
    staleTime: 30_000,
  });
}
```

- [ ] **Step 3.2: Create `useNotifications` hook**

Create `frontend/src/hooks/useNotifications.ts`:

```ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import type { NotificationChannelType, NotificationRuleType, EmailConfig, TelegramConfig, DiscordConfig, LowestInDaysParams, BelowThresholdParams, PercentageDropParams } from '../types';

export const CHANNELS_KEY = ['notification-channels'] as const;
export const RULES_KEY = (productId?: number) => ['notification-rules', productId ?? null] as const;
export const HISTORY_KEY = (limit?: number) => ['notification-history', limit ?? 50] as const;

export function useNotificationChannels() {
  return useQuery({
    queryKey: CHANNELS_KEY,
    queryFn: () => api.notifications.getChannels(),
  });
}

export function useNotificationRules(productId?: number) {
  return useQuery({
    queryKey: RULES_KEY(productId),
    queryFn: () => api.notifications.getRules(productId),
  });
}

export function useNotificationHistory(limit = 50) {
  return useQuery({
    queryKey: HISTORY_KEY(limit),
    queryFn: () => api.notifications.getHistory(limit),
  });
}

export function useCreateChannel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { type: NotificationChannelType; name: string; config: EmailConfig | TelegramConfig | DiscordConfig }) =>
      api.notifications.createChannel(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CHANNELS_KEY });
    },
  });
}

export function useDeleteChannel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.notifications.deleteChannel(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CHANNELS_KEY });
    },
  });
}

export function useCreateRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { product_id?: number | null; channel_id: number; type: NotificationRuleType; params: LowestInDaysParams | BelowThresholdParams | PercentageDropParams }) =>
      api.notifications.createRule(data),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: RULES_KEY(vars.product_id ?? undefined) });
      qc.invalidateQueries({ queryKey: RULES_KEY() });
    },
  });
}

export function useDeleteRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, productId }: { id: number; productId?: number }) =>
      api.notifications.deleteRule(id),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: RULES_KEY(vars.productId) });
      qc.invalidateQueries({ queryKey: RULES_KEY() });
    },
  });
}
```

- [ ] **Step 3.3: Create `useLists` hook**

Create `frontend/src/hooks/useLists.ts`:

```ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';

export const LISTS_KEY = ['lists'] as const;

export function useLists() {
  return useQuery({
    queryKey: LISTS_KEY,
    queryFn: () => api.getLists(),
  });
}

export function useAddProductToList() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ listId, productId }: { listId: number; productId: number }) =>
      api.addProductToList(listId, productId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] });
    },
  });
}

export function useRemoveProductFromList() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ listId, productId }: { listId: number; productId: number }) =>
      api.removeProductFromList(listId, productId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] });
    },
  });
}
```

- [ ] **Step 3.4: Export from index**

Append to `frontend/src/hooks/index.ts`:

```ts
export * from './useDashboard';
export * from './useNotifications';
export * from './useLists';
```

- [ ] **Step 3.5: Build check**

```bash
cd frontend && npm run build
```

Expected: no errors. Note: hooks are not yet consumed by components — this is fine.

- [ ] **Step 3.6: Commit**

```bash
git add frontend/src/hooks/
git commit -m "feat: add useDashboard, useNotifications, useLists TanStack Query hooks"
```

---

## Task 4 — Migrate Dashboard to TanStack Query (A3)

**Files:**
- Modify: `frontend/src/components/Dashboard.tsx`

The Dashboard currently has two `useEffect` blocks fetching price drops and increases via `useState`. Replace with the new hooks.

- [ ] **Step 4.1: Replace data fetching in Dashboard.tsx**

Open `frontend/src/components/Dashboard.tsx`. Remove the `useState` + `useEffect` fetch pattern for drops and increases. Replace with:

```tsx
import { usePriceDrops, usePriceIncreases } from '../hooks';
```

Remove these state declarations:
```tsx
const [drops, setDrops] = useState<PriceDrop[]>([]);
const [increases, setIncreases] = useState<PriceDrop[]>([]);
const [loading, setLoading] = useState(true);
const [updatingPrices, setUpdatingPrices] = useState(false);
// and the useEffect blocks that call api.getPriceDrops / api.getPriceIncreases
```

Replace with:
```tsx
const { data: drops = [], isLoading: dropsLoading, refetch: refetchDrops } = usePriceDrops();
const { data: increases = [], isLoading: increasesLoading, refetch: refetchIncreases } = usePriceIncreases();
const loading = dropsLoading || increasesLoading;
```

After a successful price update, invalidate the queries instead of calling `setDrops`/`setIncreases`:

```tsx
import { useQueryClient } from '@tanstack/react-query';
// inside the component:
const qc = useQueryClient();
// after updatePrices SSE completes:
qc.invalidateQueries({ queryKey: ['priceDrops'] });
qc.invalidateQueries({ queryKey: ['priceIncreases'] });
```

- [ ] **Step 4.2: Build check**

```bash
cd frontend && npm run build
```

Fix any TypeScript errors before continuing.

- [ ] **Step 4.3: Manual verify**

Start the dev server (`npm run dev` in both `backend/` and `frontend/`). Open `http://localhost:5174/`. Confirm:
- Dashboard loads price drops and increases.
- "Update Prices" button still works.
- Switching to Products and back to Dashboard does **not** trigger a loading spinner (data comes from cache).

- [ ] **Step 4.4: Commit**

```bash
git add frontend/src/components/Dashboard.tsx
git commit -m "refactor: migrate Dashboard to TanStack Query hooks"
```

---

## Task 5 — Migrate ProductList to TanStack Query (A3)

**Files:**
- Modify: `frontend/src/components/ProductList.tsx`

This is the most complex migration. `ProductList` currently has `loadProducts` as an imperative function called from multiple `useEffect` blocks. Replace with `useProducts`.

- [ ] **Step 5.1: Add query hook and remove imperative fetch**

In `frontend/src/components/ProductList.tsx`:

Remove:
- `const [products, setProducts] = useState<Product[]>([]);`
- `const [loading, setLoading] = useState(true);`
- `const [error, setError] = useState<string | null>(null);`
- `const [totalPages, setTotalPages] = useState(1);`
- `const [totalCount, setTotalCount] = useState(0);`
- `const [currentPage, setCurrentPage] = useState(1);`
- `const [pageSize, setPageSize] = useState(20);`
- The `loadProducts` function
- The three `useEffect` blocks that call `loadProducts`

Add:
```tsx
import { useProducts, useDeleteProduct } from '../hooks';

// Inside the component:
const [currentPage, setCurrentPage] = useState(1);
const [pageSize, setPageSize] = useState(20);

const { data, isLoading: loading, error: queryError, refetch } = useProducts(
  selectedCategory || undefined,
  currentPage,
  pageSize,
);
const products = data?.products ?? [];
const totalPages = data?.pagination.totalPages ?? 1;
const totalCount = data?.pagination.totalCount ?? 0;
const error = queryError ? t('products.failedToLoad') : null;
```

- [ ] **Step 5.2: Replace delete mutation**

Remove the inline delete handler:
```tsx
// Remove:
const handleDeleteProduct = useCallback(async (id: number) => { ... }, []);
```

Add:
```tsx
const deleteMutation = useDeleteProduct();

const handleDeleteProduct = useCallback(async (id: number) => {
  await deleteMutation.mutateAsync(id);
}, [deleteMutation]);
```

- [ ] **Step 5.3: Fix the import complete callback**

The `ImportContext` calls `setOnImportComplete` with a function to re-fetch. Replace:
```tsx
setOnImportComplete(() => {
  setCurrentPage(1);
  loadProducts(1);
});
```

With:
```tsx
import { useQueryClient } from '@tanstack/react-query';
// inside component:
const qc = useQueryClient();

setOnImportComplete(() => {
  setCurrentPage(1);
  qc.invalidateQueries({ queryKey: ['products'] });
});
```

- [ ] **Step 5.4: Replace add-product success handler**

The `ASINInput` component and CSV import use an `onSuccess` / `onAddProduct` callback. After successful add, instead of calling `loadProducts`, invalidate:
```tsx
qc.invalidateQueries({ queryKey: ['products'] });
```

- [ ] **Step 5.5: Build check**

```bash
cd frontend && npm run build
```

Fix TypeScript errors. Common ones: `loadProducts` still referenced somewhere, `setProducts` still used.

- [ ] **Step 5.6: Manual verify**

- Products page loads.
- Adding a product refreshes the list.
- Deleting a product refreshes the list.
- Page size selector still works (10/20/50).
- Pagination still works.
- Category filter still works.
- Switching to Dashboard and back does NOT reload products (cache hit).

- [ ] **Step 5.7: Commit**

```bash
git add frontend/src/components/ProductList.tsx
git commit -m "refactor: migrate ProductList to TanStack Query useProducts hook"
```

---

## Task 6 — Migrate CategoryFilter to TanStack Query (A3)

**Files:**
- Modify: `frontend/src/components/CategoryFilter.tsx`

Category tree is currently fetched independently each time the filter renders. Replace with `useCategories()` which shares a single cache across all renders.

- [ ] **Step 6.1: Replace fetch in CategoryFilter.tsx**

Open `frontend/src/components/CategoryFilter.tsx`. Find the `useEffect` that calls `api.getCategoryTree()`. Remove the `useState([])` + `useEffect` pattern and replace with:

```tsx
import { useCategories } from '../hooks';

// Inside the component (remove the old state/effect):
const { data: tree = [], isLoading } = useCategories();
```

- [ ] **Step 6.2: Build check and verify**

```bash
cd frontend && npm run build
```

Verify in the browser: open Network tab in DevTools. Navigate to Products page. Confirm only ONE `GET /api/categories/tree` request is made even if both `ProductList` and `CategoryFilter` mount at the same time.

- [ ] **Step 6.3: Commit**

```bash
git add frontend/src/components/CategoryFilter.tsx
git commit -m "refactor: migrate CategoryFilter to shared useCategories TanStack Query hook"
```

---

## Task 7 — V8: EmptyState in ProductList

**Files:**
- Modify: `frontend/src/components/ProductList.tsx`

Currently the empty state is a bare `<p className="empty-state">`. Replace with the design system `EmptyState` component.

- [ ] **Step 7.1: Replace the empty state markup**

In `frontend/src/components/ProductList.tsx`, find:

```tsx
<p className="empty-state">
  {selectedListId ? t('products.noProductsInList') : t('products.noProducts')}
</p>
```

Replace with:

```tsx
import { EmptyState } from '../design-system';
import { Package } from 'lucide-react';

// ...
<EmptyState
  icon={Package}
  title={selectedListId ? t('products.noProductsInList') : t('products.noProducts')}
  description={!selectedListId ? t('products.addFirstProduct') : undefined}
/>
```

- [ ] **Step 7.2: Add missing translation keys**

Check `frontend/src/i18n/locales/en.json`. If `products.addFirstProduct` doesn't exist, add it:

```json
"addFirstProduct": "Add your first product using the ASIN input above."
```

In `frontend/src/i18n/locales/pt-BR.json`:

```json
"addFirstProduct": "Adicione seu primeiro produto usando o campo ASIN acima."
```

- [ ] **Step 7.3: Build check**

```bash
cd frontend && npm run build
```

- [ ] **Step 7.4: Manual verify**

With no products in the current filter/list, confirm the empty state shows icon + message, not a bare paragraph.

- [ ] **Step 7.5: Commit**

```bash
git add frontend/src/components/ProductList.tsx frontend/src/i18n/
git commit -m "feat: use design system EmptyState in ProductList"
```

---

## Task 8 — V3: Progressive Disclosure Product Rows

**Files:**
- Modify: `frontend/src/components/ProductList.tsx`

Currently each row shows: thumbnail, ASIN, description (link), categories, price, sparkline chart, action buttons — all simultaneously. The goal is to show the minimum needed for scanning, with details available on expand.

**Visible (always):** thumbnail · description (1 line truncated) · current price · price-change badge · View/Delete buttons

**Hidden by default (revealed with "▾ details" toggle):** ASIN · categories · sparkline

- [ ] **Step 8.1: Add expand state per row**

In `frontend/src/components/ProductList.tsx`, add state for expanded rows:

```tsx
const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());

const toggleExpanded = useCallback((id: number) => {
  setExpandedRows(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
}, []);
```

- [ ] **Step 8.2: Restructure the product row JSX**

Find the product row render (inside the `products.map(...)` block). Restructure it so the main row always renders and the details section is conditional:

```tsx
<div key={product.id} className="product-list-item">
  {/* Always visible */}
  <div className="product-row-main">
    <div className="product-thumbnail-wrapper">
      <img
        src={getPreferredProductImageUrl(product)}
        alt={product.description}
        className="product-thumbnail"
        onError={(e) => handleProductImageError(e, product.asin)}
      />
    </div>

    <div className="product-row-summary">
      <a
        href={`https://www.amazon.com.br/dp/${product.asin}`}
        target="_blank"
        rel="noopener noreferrer"
        className="product-description-link"
        title={product.description}
      >
        {product.description}
      </a>
      <div className="product-row-price">
        {product.price != null ? (
          <span className="price-current">{formatPrice(product.price)}</span>
        ) : (
          <span className="price-unavailable">{t('products.unavailable')}</span>
        )}
        {product.price_drop_percentage != null && product.price_drop_percentage !== 0 && (
          <Badge
            variant={product.price_drop_percentage < 0 ? 'success' : 'danger'}
            size="sm"
          >
            {product.price_drop_percentage < 0 ? '' : '+'}{product.price_drop_percentage.toFixed(1)}%
          </Badge>
        )}
      </div>
    </div>

    <div className="product-row-actions">
      <button
        className="btn-icon"
        onClick={() => toggleExpanded(product.id)}
        aria-expanded={expandedRows.has(product.id)}
        aria-label={expandedRows.has(product.id) ? t('common.collapse') : t('common.expand')}
      >
        {expandedRows.has(product.id) ? '▴' : '▾'}
      </button>
      {onProductSelect && (
        <button
          className="btn-view"
          onClick={() => onProductSelect(product.id)}
        >
          {t('common.view')}
        </button>
      )}
      {user?.role === 'ADMIN' && (
        <button
          className="btn-delete"
          onClick={() => handleDeleteProduct(product.id)}
        >
          {t('common.delete')}
        </button>
      )}
    </div>
  </div>

  {/* Expanded details */}
  {expandedRows.has(product.id) && (
    <div className="product-row-details">
      <span className="product-asin">{product.asin}</span>
      {product.categories && product.categories.length > 0 && (
        <div className="product-categories">
          {product.categories.map((cat) => (
            <button
              key={cat.id}
              type="button"
              className="category-badge-btn"
              onClick={() => handleCategoryClick(cat.name)}
            >
              {cat.name}
            </button>
          ))}
        </div>
      )}
      <Suspense fallback={null}>
        <MiniPriceChart productId={product.id} />
      </Suspense>
    </div>
  )}
</div>
```

- [ ] **Step 8.3: Add missing translation keys**

Add to `en.json` under `"common"`:

```json
"expand": "Show details",
"collapse": "Hide details"
```

Add to `pt-BR.json` under `"common"`:

```json
"expand": "Mostrar detalhes",
"collapse": "Ocultar detalhes"
```

- [ ] **Step 8.4: Add CSS for the new row layout**

In `frontend/src/App.css`, add at the end (existing `.product-list-item` styles remain; add new modifier classes):

```css
.product-row-main {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
}

.product-row-summary {
  flex: 1;
  min-width: 0;
}

.product-description-link {
  display: block;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: var(--font-size-sm);
  color: var(--color-text-primary);
  text-decoration: none;
}

.product-description-link:hover {
  text-decoration: underline;
  color: var(--color-accent-primary);
}

.product-row-price {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-top: var(--space-1);
}

.price-current {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
}

.price-unavailable {
  font-size: var(--font-size-sm);
  color: var(--color-text-tertiary);
}

.product-row-actions {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-shrink: 0;
}

.btn-icon {
  background: none;
  border: none;
  cursor: pointer;
  padding: var(--space-1);
  color: var(--color-text-secondary);
  font-size: 10px;
  line-height: 1;
}

.product-row-details {
  padding: var(--space-2) var(--space-4) var(--space-3);
  padding-left: calc(40px + var(--space-3) + var(--space-4)); /* align with summary */
  border-top: 1px solid var(--color-border-primary);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  background: var(--color-bg-secondary);
}
```

- [ ] **Step 8.5: Build check**

```bash
cd frontend && npm run build
```

- [ ] **Step 8.6: Manual verify**

- Rows default to compact view: thumbnail, truncated description, price, badge, buttons.
- Clicking `▾` expands to show ASIN, categories, sparkline.
- Clicking `▴` collapses again.
- Screen reader announces `aria-expanded` state change.

- [ ] **Step 8.7: Commit**

```bash
git add frontend/src/components/ProductList.tsx frontend/src/App.css frontend/src/i18n/
git commit -m "feat: progressive disclosure product rows — expand/collapse for details"
```

---

## Task 9 — R3: Swipe-Left on Product Rows

**Files:**
- Modify: `frontend/src/components/ProductList.tsx`

Add a mobile-only swipe-left gesture on each product row that reveals a "Delete" action button. The `useSwipeGesture` hook is already built at `frontend/src/hooks/useSwipeGesture.ts`.

- [ ] **Step 9.1: Understand useSwipeGesture API**

The hook signature (from `frontend/src/hooks/useSwipeGesture.ts`):

```ts
// Takes a single handlers object, returns { ref } to attach to the element
useSwipeGesture(handlers: SwipeHandlers): { ref: RefObject<HTMLElement> }

// handlers shape:
interface SwipeHandlers {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  onSwipeUp?: () => void;
  onSwipeDown?: () => void;
  threshold?: number;
}
```

Usage pattern: `const { ref } = useSwipeGesture({ onSwipeLeft: () => ... });` then `<div ref={ref}>`.

- [ ] **Step 9.2: Create a swipeable row wrapper**

In `frontend/src/components/ProductList.tsx`, add a new inner component above `ProductList`:

```tsx
interface SwipeableRowProps {
  productId: number;
  onDelete: (id: number) => void;
  children: React.ReactNode;
  isMobile: boolean;
}

function SwipeableRow({ productId, onDelete, children, isMobile }: SwipeableRowProps) {
  const { t } = useTranslation();
  const [swiped, setSwiped] = useState(false);

  const { ref: rowRef } = useSwipeGesture({
    onSwipeLeft: isMobile ? () => setSwiped(true) : undefined,
    onSwipeRight: isMobile ? () => setSwiped(false) : undefined,
    threshold: 60,
  });

  return (
    <div className={`swipeable-row-container ${swiped ? 'swipeable-row--swiped' : ''}`}>
      <div ref={rowRef as React.RefObject<HTMLDivElement>} className="swipeable-row-content">
        {children}
      </div>
      {isMobile && (
        <div className="swipeable-row-actions" aria-hidden={!swiped}>
          <button
            className="swipe-delete-btn"
            onClick={() => { onDelete(productId); setSwiped(false); }}
            tabIndex={swiped ? 0 : -1}
          >
            {t('common.delete')}
          </button>
        </div>
      )}
    </div>
  );
}
```

Note: `t` must be passed or the component must call `useTranslation` itself. Add it to the component:

```tsx
function SwipeableRow({ productId, onDelete, children, isMobile }: SwipeableRowProps) {
  const { t } = useTranslation();
  // ...
```

Import `useSwipeGesture` from `'../hooks'`.

- [ ] **Step 9.3: Wrap each product row in SwipeableRow**

In the `products.map(...)` render, wrap the `<div key={product.id} className="product-list-item">` in:

```tsx
<SwipeableRow
  key={product.id}
  productId={product.id}
  onDelete={handleDeleteProduct}
  isMobile={isMobile}
>
  <div className="product-list-item">
    {/* existing row content */}
  </div>
</SwipeableRow>
```

Remove the `key` from `product-list-item` and keep it on `SwipeableRow`.

Add `isMobile` to `ProductList` using the hook:

```tsx
import { useMediaQuery } from '../hooks';
// inside component:
const isMobile = useMediaQuery('(max-width: 767px)');
```

- [ ] **Step 9.4: Add swipe CSS**

In `frontend/src/App.css`:

```css
.swipeable-row-container {
  position: relative;
  overflow: hidden;
}

.swipeable-row-content {
  transition: transform 150ms ease;
  will-change: transform;
}

.swipeable-row--swiped .swipeable-row-content {
  transform: translateX(-80px);
}

.swipeable-row-actions {
  position: absolute;
  right: 0;
  top: 0;
  bottom: 0;
  width: 80px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-danger);
}

.swipe-delete-btn {
  background: none;
  border: none;
  color: #ffffff;
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  cursor: pointer;
  width: 100%;
  height: 100%;
  padding: 0;
}
```

- [ ] **Step 9.5: Build check**

```bash
cd frontend && npm run build
```

- [ ] **Step 9.6: Manual verify on mobile viewport**

Open DevTools, set viewport to 390px wide. On the Products page:
- Swipe left on a row → row slides left 80px, red "Delete" button appears.
- Tap "Delete" → product is deleted.
- Swipe right → row snaps back.
- On desktop (>768px): no swipe behavior; delete is via button in the row.

- [ ] **Step 9.7: Commit**

```bash
git add frontend/src/components/ProductList.tsx frontend/src/App.css
git commit -m "feat: swipe-left gesture on product rows to reveal delete action (mobile)"
```

---

## Task 10 — R5: aria-live for Import Progress and Price Updates

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/Dashboard.tsx`

The two remaining ARIA gaps are:
1. `ImportProgressBanner` in App.tsx — its text changes dynamically but has no live region.
2. Dashboard price update progress — no live region for screen readers.

- [ ] **Step 10.1: Add aria-live to ImportProgressBanner**

In `frontend/src/App.tsx`, find the `<div className="import-progress-content">`. Add `aria-live="polite"` and `aria-atomic="false"`:

```tsx
<div
  className="import-progress-content"
  aria-live="polite"
  aria-atomic="false"
  aria-label={t('products.importProgress')}
>
  {/* existing content */}
</div>
```

Add missing translation key to `en.json`:
```json
"importProgress": "Import progress"
```

Add to `pt-BR.json`:
```json
"importProgress": "Progresso da importação"
```

- [ ] **Step 10.2: Add aria-live to Dashboard price update progress**

In `frontend/src/components/Dashboard.tsx`, find the `<ProgressBar>` used during price updates. Wrap it in a `<div>` with a live region:

```tsx
{updating && (
  <div
    aria-live="polite"
    aria-atomic="true"
    aria-label={t('dashboard.updatingPrices')}
  >
    <ProgressBar value={updatePercent} variant="primary" size="sm" />
  </div>
)}
```

- [ ] **Step 10.3: Build check**

```bash
cd frontend && npm run build
```

- [ ] **Step 10.4: Commit**

```bash
git add frontend/src/App.tsx frontend/src/components/Dashboard.tsx frontend/src/i18n/
git commit -m "a11y: add aria-live regions to import progress and price update progress"
```

---

## Task 11 — V10: Replace Hardcoded Colors in App.css with Tokens

**Files:**
- Modify: `frontend/src/App.css`

App.css has ~195 hardcoded hex/rgb colors. The `tokens.css` defines the full semantic palette. This task replaces the most impactful hardcoded colors with CSS custom properties.

**Strategy:** Go section by section replacing colors in the order: text colors → backgrounds → borders → accent/interactive → semantic (success/danger).

- [ ] **Step 11.1: Replace text colors**

In `frontend/src/App.css`, do a find-replace for the most common hardcoded text colors:

| Find | Replace |
|------|---------|
| `color: #333` or `color: #333333` | `color: var(--color-text-primary)` |
| `color: #1A1A18` | `color: var(--color-text-primary)` |
| `color: #666` or `color: #666666` | `color: var(--color-text-secondary)` |
| `color: #6B6966` | `color: var(--color-text-secondary)` |
| `color: #999` or `color: #9a9a9a` | `color: var(--color-text-tertiary)` |
| `color: #9C9891` | `color: var(--color-text-tertiary)` |
| `color: #fff` or `color: #ffffff` or `color: white` | `color: var(--color-text-inverse)` (only when on dark backgrounds — check context) |

After replacing, build and check visually that text colors look the same.

- [ ] **Step 11.2: Replace background colors**

| Find | Replace |
|------|---------|
| `background-color: #fff` / `background: #fff` / `background: white` | `background: var(--color-bg-elevated)` (for modals/cards) or `var(--color-bg-primary)` (for page) |
| `background-color: #f5f5f5` / `#f8f8f8` / `#fafafa` | `background: var(--color-bg-secondary)` |
| `background-color: #FAFAF8` | `background: var(--color-bg-primary)` |
| `background-color: #F3F2EE` | `background: var(--color-bg-secondary)` |

- [ ] **Step 11.3: Replace border colors**

| Find | Replace |
|------|---------|
| `border.*#ddd` / `border.*#e0e0e0` / `border.*#eee` | `var(--color-border-primary)` |
| `border.*#E5E3DF` | `var(--color-border-primary)` |
| `border.*#D1CFC9` | `var(--color-border-secondary)` |

- [ ] **Step 11.4: Replace accent/interactive colors**

| Find | Replace |
|------|---------|
| `#D4622B` or `#d4622b` | `var(--color-accent-primary)` |
| `#B8521F` or `#b8521f` | `var(--color-accent-hover)` |
| `#FDF0E8` | `var(--color-accent-subtle)` |
| Amazon orange `#FF9900` / `#ff9900` | `var(--color-accent-primary)` |
| Amazon navy `#232F3E` / `#232f3e` | `var(--color-text-primary)` (for text) or leave for brand elements |

- [ ] **Step 11.5: Replace semantic colors**

| Find | Replace |
|------|---------|
| `color: green` / `#22c55e` / `#2D8A4E` | `var(--color-success)` |
| `background.*green` / `#EDF7F0` | `var(--color-success-subtle)` |
| `color: red` / `#ef4444` / `#C4361C` | `var(--color-danger)` |
| `background.*red` / `#FEF1EE` | `var(--color-danger-subtle)` |

- [ ] **Step 11.6: Build and visual check**

```bash
cd frontend && npm run build && npm run dev
```

Walk through every view (Dashboard, Products, Settings, Auth) and verify colors look correct. Fix any regressions by checking what the original color was and finding the right token.

- [ ] **Step 11.7: Commit**

```bash
git add frontend/src/App.css
git commit -m "refactor: replace hardcoded hex colors with CSS token variables in App.css"
```

---

## Task 12 — A4: Memoization Audit

**Files:**
- Modify: `frontend/src/components/ProductList.tsx`
- Modify: `frontend/src/components/Dashboard.tsx`

Most memoization gains come from preventing ProductList row re-renders and stabilizing Dashboard card renders.

- [ ] **Step 12.1: Memoize the SwipeableRow component**

In `frontend/src/components/ProductList.tsx`, wrap `SwipeableRow` in `React.memo`:

```tsx
const SwipeableRow = React.memo(function SwipeableRow({ productId, onDelete, children, isMobile }: SwipeableRowProps) {
  // ...
});
```

- [ ] **Step 12.2: Ensure all ProductList callbacks are stable**

Verify these are already wrapped in `useCallback` (they should be from earlier tasks):
- `handleDeleteProduct`
- `handleCategoryClick`
- `handleToggleDropdown`
- `handleAddToList`
- `toggleExpanded`

If any are not yet wrapped:
```tsx
const callbackName = useCallback((param: Type) => {
  // implementation
}, [/* stable deps only */]);
```

- [ ] **Step 12.3: Memoize expensive derived values in ProductList**

```tsx
const sortedProducts = useMemo(
  () => [...products].sort((a, b) => a.description.localeCompare(b.description)),
  [products]
);
// Use sortedProducts in render instead of products directly
```

Note: only add this if the products are not already server-sorted. If the API returns sorted results, skip this.

- [ ] **Step 12.4: Verify Dashboard PriceChangeCard is memoized**

Open `frontend/src/components/Dashboard.tsx`. Confirm `PriceChangeCard` is already wrapped:

```tsx
const PriceChangeCard = React.memo(function PriceChangeCard(...) { ... });
```

If not, add `React.memo`.

- [ ] **Step 12.5: Build check**

```bash
cd frontend && npm run build
```

- [ ] **Step 12.6: Commit**

```bash
git add frontend/src/components/ProductList.tsx frontend/src/components/Dashboard.tsx
git commit -m "perf: memoize ProductList row component and stabilize callbacks"
```

---

## Task 13 — A1: App.css Cleanup Pass

**Files:**
- Modify: `frontend/src/App.css`

After the color token migration (Task 11) and component migrations (Tasks 4–9), remove orphaned CSS rules — selectors that no longer match any elements in the JSX.

- [ ] **Step 13.1: Identify orphaned selectors**

Run the dev server and open DevTools. In the Console, run:

```js
// Find rules in all stylesheets with no matching elements
const orphaned = [];
for (const sheet of document.styleSheets) {
  try {
    for (const rule of sheet.cssRules) {
      if (rule.selectorText) {
        const els = document.querySelectorAll(rule.selectorText.split(',')[0].trim());
        if (els.length === 0) orphaned.push(rule.selectorText);
      }
    }
  } catch {}
}
console.log(orphaned.join('\n'));
```

Note: this only catches rules that don't match on the currently-rendered view. Navigate to all views (Dashboard, Products, Settings, Admin) and repeat to build a full list.

- [ ] **Step 13.2: Remove definitively orphaned rules**

In `App.css`, delete rules for selectors confirmed gone in all views. Candidates from the refactor (check each before deleting):
- `.product-search-*` rules (ProductSearch.tsx was deleted)
- `.admin-panel` (replaced by SettingsPage)
- `.config-page` (replaced by SettingsPage)
- `.modal-overlay` (replaced by design system Modal CSS)
- `.import-progress-banner` (replaced by `.import-progress-bar`)
- Duplicate `.admin-panel` definitions (original issue A1 — two definitions at lines 2580 and 2977)

- [ ] **Step 13.3: Delete redundant duplicate rules**

Search `App.css` for selector names that appear more than once. For each duplicate, keep the last definition (it wins in the cascade) and delete the earlier one.

```bash
# Find duplicate selectors
grep -n "^\." frontend/src/App.css | awk -F: '{print $2}' | sort | uniq -d
```

- [ ] **Step 13.4: Build and full visual check**

```bash
cd frontend && npm run build && npm run dev
```

Walk through every view. Verify nothing looks broken.

- [ ] **Step 13.5: Commit**

```bash
git add frontend/src/App.css
git commit -m "refactor: remove orphaned CSS rules from App.css cleanup pass"
```

---

## Final Verification

After all tasks are complete:

- [ ] `cd frontend && npm run build` — zero errors
- [ ] Open all views: Dashboard, Products (list + search mode), ProductDetail (desktop sheet + mobile full-screen), Settings (all sections), Admin (if admin user)
- [ ] Test on mobile viewport (390px): bottom tab bar visible, swipe-left on product rows works, product detail swipe-back works
- [ ] Test category filter: keyboard navigation (arrow keys), ARIA tree roles present in DevTools
- [ ] Test screen reader behavior: import progress announced, price update progress announced, empty states announced
- [ ] Test pagination: 10/20/50 page size selector still works
- [ ] Verify Network tab: categories only fetched once even when multiple components render simultaneously (TanStack Query dedup)

---

## Notes

- Tasks 1–6 (TanStack Query) can be done in any order after Task 1.
- Tasks 7–10 are independent of Tasks 1–6 and can be done in parallel.
- Tasks 11–13 should be done last.
- If a build breaks mid-task, do NOT commit. Fix the TypeScript error before committing.
