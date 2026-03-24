# Implementation Plan: Frontend Issues A2–A7

## Context

The frontend ships as a single ~740 KB bundle with zero code splitting, no data caching, no memoization, an unbounced admin search, redundant client-side sorting, and an unused `react-router-dom` dependency. These issues degrade first-load performance, waste network requests, and bloat the bundle. This plan addresses each issue with minimal, targeted changes to the existing codebase — no redesign, no new design system, just surgical fixes.

---

## A7: Remove unused `react-router-dom` dependency

**Why**: ~15 KB of dead weight in the bundle. Zero imports exist anywhere in `src/`.

### Steps

1. **Verify** no imports exist:
   ```bash
   cd frontend && grep -r "react-router-dom" src/
   ```
   Expected: no results.

2. **Uninstall**:
   ```bash
   npm uninstall react-router-dom
   ```

3. **Verify build**:
   ```bash
   npm run build
   ```

**Files modified**: `package.json`, `package-lock.json`

---

## A2: Add code splitting with `React.lazy` and Vite manual chunks

**Why**: The entire app (admin panel, config, Recharts charts) loads on first paint even for non-admin users viewing the dashboard. The bundle is 740 KB (204 KB gzipped) and Vite warns about it.

### Step 1: Lazy-load non-critical views in App.tsx

**File**: `frontend/src/App.tsx`

Replace eager imports of infrequently-used components with `React.lazy`:

```tsx
// Before (eager)
import { Config } from './components/config';
import { AdminPanel } from './components/AdminPanel';
import { ProductSearch } from './components/ProductSearch';
import { ProductDetail } from './components/ProductDetail';

// After (lazy)
import { lazy, Suspense } from 'react';
const Config = lazy(() => import('./components/config').then(m => ({ default: m.Config })));
const AdminPanel = lazy(() => import('./components/AdminPanel').then(m => ({ default: m.AdminPanel })));
const ProductSearch = lazy(() => import('./components/ProductSearch').then(m => ({ default: m.ProductSearch })));
const ProductDetail = lazy(() => import('./components/ProductDetail').then(m => ({ default: m.ProductDetail })));
```

Keep `Dashboard` and `ProductList` eager (most-visited views).

Wrap the view rendering area in `<Suspense>`:

```tsx
<Suspense fallback={<div className="loading-spinner">Loading...</div>}>
  {currentView === 'config' && <Config />}
  {currentView === 'admin' && <AdminPanel />}
  {/* etc. */}
</Suspense>
```

### Step 2: Lazy-load Recharts in ProductDetail.tsx

**File**: `frontend/src/components/ProductDetail.tsx`

Recharts is one of the largest dependencies and only needed when viewing a product's price chart.

```tsx
// Before
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

// After
import { lazy, Suspense } from 'react';
const PriceChart = lazy(() => import('./PriceChart'));
```

Create a new file `frontend/src/components/PriceChart.tsx` that encapsulates the Recharts chart JSX currently inline in ProductDetail. This isolates the Recharts import into its own chunk.

```tsx
// PriceChart.tsx
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface PriceChartProps {
  data: Array<{ date: string; price: number | null }>;
  // ... other props currently used inline
}

export default function PriceChart({ data, ...props }: PriceChartProps) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={data}>
        {/* move existing chart JSX here */}
      </LineChart>
    </ResponsiveContainer>
  );
}
```

Wrap in `<Suspense fallback={<div>Loading chart...</div>}>` in ProductDetail.

### Step 3: Configure Vite manual chunks

**File**: `frontend/vite.config.ts`

Add `rollupOptions` to split vendor code into separate cacheable chunks:

```ts
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom'],
          'vendor-recharts': ['recharts'],
          'vendor-i18n': ['i18next', 'react-i18next', 'i18next-browser-languagedetector'],
        }
      }
    }
  },
  server: { /* ... existing ... */ }
});
```

### Step 4: Verify

```bash
cd frontend && npm run build
```

Confirm:
- Multiple JS chunks in `dist/assets/` instead of one
- No single chunk exceeds 500 KB
- App still works: dashboard loads without admin/config chunks

**Files modified**: `App.tsx`, `ProductDetail.tsx`, `vite.config.ts`
**Files created**: `PriceChart.tsx`

---

## A3: Eliminate duplicate API calls with a shared data cache

**Why**: `CategoryTreeFilter` fetches `getCategoryTree()` independently every time it mounts — and it mounts in both `ProductList` and `ProductSearch`. Switching views re-fetches everything. No data is shared or cached.

### Approach: Simple in-memory cache in `api.ts`

TanStack Query is the ideal long-term solution (see Phase 2 of the frontend refactor plan), but for a minimal fix now, we add a lightweight cache layer to the API service for the most-duplicated calls.

### Step 1: Add a simple cache utility

**File**: `frontend/src/services/api.ts` — add at the top:

```ts
const cache = new Map<string, { data: unknown; timestamp: number }>();

function cachedFetch<T>(key: string, fetcher: () => Promise<T>, ttlMs: number = 60000): Promise<T> {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.timestamp < ttlMs) {
    return Promise.resolve(entry.data as T);
  }
  return fetcher().then(data => {
    cache.set(key, { data, timestamp: Date.now() });
    return data;
  });
}

// Call this after mutations that should invalidate cache
function invalidateCache(keyPrefix?: string) {
  if (!keyPrefix) {
    cache.clear();
    return;
  }
  for (const key of cache.keys()) {
    if (key.startsWith(keyPrefix)) cache.delete(key);
  }
}
```

### Step 2: Wrap the most-duplicated API calls

Apply `cachedFetch` to:

- **`getCategoryTree()`** — called by every `CategoryTreeFilter` mount. TTL: 5 minutes (categories rarely change).
  ```ts
  getCategoryTree: () => cachedFetch('categoryTree', () => /* existing fetch logic */, 300000),
  ```

- **`notifications.getChannels()`** — called in Notifications, admin/Notifications, and ProductNotifications. TTL: 1 minute.

### Step 3: Invalidate cache on mutations

After any mutation that changes cached data (e.g., adding a product, creating a channel), call `invalidateCache('relevantPrefix')`. Specifically:
- After `addProduct` / `deleteProduct` → `invalidateCache('products')`
- After channel create/update/delete → `invalidateCache('channels')`
- After category changes → `invalidateCache('categoryTree')`

### Step 4: Verify

- Load the app, open Network tab
- Switch between Products and Search views — `getCategoryTree` should only fire once (or serve from cache on second mount)
- Create a notification channel — verify next fetch gets fresh data

**Files modified**: `api.ts`

---

## A4: Add targeted memoization

**Why**: Zero `useMemo`, `useCallback`, or `React.memo` usage across the entire frontend. Callbacks recreated every render cause unnecessary child re-renders.

### Approach

Only add memoization where it provides measurable benefit — not everywhere. Focus on:
1. Expensive computations
2. Callback props passed to child components that have many instances (e.g., product rows)
3. Components that render many children (lists)

### Step 1: Memoize the product sort in ProductList.tsx

**File**: `frontend/src/components/ProductList.tsx`

This also partially addresses **A5** (see below). If the sort remains client-side:

```tsx
// Before (line 51-53, runs on every loadProducts call and re-renders)
const sorted = [...response.products].sort((a, b) =>
  a.description.localeCompare(b.description, undefined, { sensitivity: 'base' })
);
setProducts(sorted);

// After: store raw products, memoize the sort
const [rawProducts, setRawProducts] = useState<Product[]>([]);

const products = useMemo(
  () => [...rawProducts].sort((a, b) =>
    a.description.localeCompare(b.description, undefined, { sensitivity: 'base' })
  ),
  [rawProducts]
);
```

### Step 2: Memoize callback handlers in ProductList.tsx

Wrap handlers that are passed as props to child elements or used in `.map()` renders:

```tsx
const handleDeleteProduct = useCallback(async (id: number) => {
  // ... existing delete logic
}, [/* stable deps */]);

const handleAddToList = useCallback(async (productId: number, listId: number) => {
  // ... existing logic
}, [/* stable deps */]);
```

### Step 3: Memoize CategoryTreeFilter tree nodes

**File**: `frontend/src/components/CategoryTreeFilter.tsx`

Wrap the `TreeNode` sub-component with `React.memo` to prevent re-rendering all nodes when one expands/collapses:

```tsx
const TreeNode = React.memo(function TreeNode({ node, ... }: TreeNodeProps) {
  // ... existing render logic
});
```

### Step 4: Memoize Dashboard price change cards

**File**: `frontend/src/components/Dashboard.tsx`

If there's a card rendering function in `.map()`, wrap the card component with `React.memo`.

### Step 5: Verify

- Open React DevTools Profiler
- Interact with the product list (pagination, category filter)
- Confirm fewer re-renders of child components compared to before

**Files modified**: `ProductList.tsx`, `CategoryTreeFilter.tsx`, `Dashboard.tsx`

---

## A5: Remove redundant client-side sort

**Why**: `ProductList.tsx` line 51-53 sorts products by `description` via `localeCompare` after every fetch, but the server already returns results sorted by `created_at DESC` (see `backend/src/services/db/product-repo.ts:425`). This is a conflicting sort — the server says newest-first, but the client overrides to alphabetical — and wastes CPU.

### Decision point

Two options:

**Option A — Remove client-side sort, use server order** (recommended):

If `created_at DESC` is the desired default (newest products first), just remove lines 51-53:

```tsx
// Before
const sorted = [...response.products].sort((a, b) =>
  a.description.localeCompare(b.description, undefined, { sensitivity: 'base' })
);
setProducts(sorted);

// After
setProducts(response.products);
```

**Option B — Move sort to server** (if alphabetical is desired):

Add an `ORDER BY` parameter to the backend endpoint. In `backend/src/services/db/product-repo.ts` line 425:

```sql
-- Before
ORDER BY p.created_at DESC

-- After (with sort parameter)
ORDER BY p.description COLLATE NOCASE ASC
```

And add a `sort` query parameter to the products route.

### Recommended: Option A

The server already sorts. The client re-sort is a leftover that contradicts server ordering. Remove it. If alphabetical ordering is later desired, add it as a server-side `sort` parameter as part of the larger refactor.

**Files modified**: `ProductList.tsx` (3 lines removed)

---

## A6: Debounce admin search in UserManagement.tsx

**Why**: The `useEffect` on line 17-19 fires `loadUsers()` on every keystroke of `searchQuery`, causing an API call per character typed.

### Step 1: Create a `useDebouncedValue` hook

**File**: `frontend/src/hooks/useDebouncedValue.ts` (new file)

```ts
import { useState, useEffect } from 'react';

export function useDebouncedValue<T>(value: T, delay: number = 300): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}
```

### Step 2: Apply to UserManagement.tsx

**File**: `frontend/src/components/admin/UserManagement.tsx`

```tsx
import { useDebouncedValue } from '../../hooks/useDebouncedValue';

export function UserManagement() {
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearch = useDebouncedValue(searchQuery, 300);

  useEffect(() => {
    loadUsers();
  }, [debouncedSearch]);  // <-- was [searchQuery]

  const loadUsers = async () => {
    try {
      setLoading(true);
      const data = await adminApi.getUsers(50, 0, debouncedSearch || undefined);  // <-- use debounced
      // ...
  };
```

The input's `onChange` continues to update `searchQuery` immediately (so the input feels responsive), but the API call only fires 300ms after the user stops typing.

### Step 3: Verify

- Open Network tab, navigate to Admin > Users
- Type a username quickly — only 1 API call should fire (after 300ms pause), not one per keystroke
- Clearing the search field should also debounce

**Files created**: `frontend/src/hooks/useDebouncedValue.ts`
**Files modified**: `UserManagement.tsx`

---

## Implementation Order

| # | Issue | Effort | Risk | Dependencies |
|---|-------|--------|------|--------------|
| 1 | **A7** — Remove react-router-dom | 1 min | None | None |
| 2 | **A6** — Debounce admin search | 15 min | None | None |
| 3 | **A5** — Remove client-side sort | 5 min | Low (verify expected order) | None |
| 4 | **A4** — Add memoization | 30 min | Low | None |
| 5 | **A3** — API cache layer | 30 min | Medium (cache invalidation) | None |
| 6 | **A2** — Code splitting | 45 min | Medium (test all lazy views) | A7 done first |

Start with A7 (trivial), then A6 and A5 (quick wins), then A4 and A3 (moderate), then A2 (largest change). Each step is independently deployable.

---

## Verification Plan

After all changes:

1. **Build check**: `cd frontend && npm run build` — no errors, no single chunk > 500 KB
2. **Functional smoke test**: Load dashboard, switch to Products, Search, Config, Admin — all render correctly
3. **Network tab audit**:
   - Switch between Products and Search — `getCategoryTree` cached (no duplicate)
   - Type in admin search — only 1 request after pause
4. **Bundle analysis**: Compare before/after chunk sizes from build output
5. **React DevTools Profiler**: Verify reduced re-renders in ProductList
