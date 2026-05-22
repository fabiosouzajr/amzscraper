# Product Thumbnails Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 80×80px Amazon product thumbnails to the left side of each item in the tracked products list, derived at display time from the ASIN, hiding gracefully on load failure.

**Architecture:** Frontend-only change. Construct the Amazon CDN image URL from the ASIN and render an `<img>` with an `onError` handler that hides its wrapper div. No state, no backend changes.

**Tech Stack:** React 18, TypeScript, plain CSS (monolithic App.css)

---

## Chunk 1: CSS + Component

### Task 1: Add thumbnail CSS to App.css

**Files:**
- Modify: `frontend/src/App.css:674` (after `.product-list-item:hover` rule, line 674)

- [ ] **Step 1: Add thumbnail styles after `.product-list-item:hover`**

Insert the following block immediately after the closing `}` of `.product-list-item:hover` (line 674):

```css
.product-thumbnail-wrapper {
  flex-shrink: 0;
  width: 80px;
  height: 80px;
}

.product-thumbnail {
  width: 80px;
  height: 80px;
  object-fit: contain;
}
```

- [ ] **Step 2: Verify build passes**

```bash
cd frontend && npm run build
```

Expected: no TypeScript or Vite errors.

---

### Task 2: Add thumbnail element to ProductList

**Files:**
- Modify: `frontend/src/components/ProductList.tsx:541` (inside `.product-list-item` loop)

- [ ] **Step 1: Add thumbnail wrapper before `.product-info`**

Inside the `filteredProducts.map(...)` block, the `.product-list-item` div currently starts at line 541 with its first child being `<div className="product-info">`. Insert the thumbnail wrapper *before* that div:

```tsx
<div key={product.id} className="product-list-item">
  <div className="product-thumbnail-wrapper">
    <img
      src={`https://images-na.ssl-images-amazon.com/images/P/${product.asin}.01._SCLZZZZZZZ_.jpg`}
      alt={product.description}
      className="product-thumbnail"
      onError={(e) => {
        (e.currentTarget.parentElement as HTMLElement).style.display = 'none';
      }}
    />
  </div>
  <div className="product-info">
    ...rest unchanged...
```

- [ ] **Step 2: Verify TypeScript build passes**

```bash
cd frontend && npm run build
```

Expected: clean build, zero TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/App.css frontend/src/components/ProductList.tsx
git commit -m "feat: add product thumbnails from Amazon CDN in product list"
```
