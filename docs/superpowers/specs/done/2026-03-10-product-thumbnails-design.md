# Product Thumbnails Design

**Date:** 2026-03-10

## Summary

Add 80×80px product thumbnail images to the left side of each `.product-list-item` in the tracked products list. Images are derived at display time from the product ASIN using Amazon's CDN URL pattern — no backend changes required.

## Decisions

- **Source:** `https://images-na.ssl-images-amazon.com/images/P/{ASIN}.01._SCLZZZZZZZ_.jpg`
- **Fallback:** On load error, hide the wrapper (`display: none`) — item renders text-only
- **Size:** 80×80px, `object-fit: contain`
- **No state:** `onError` mutates the DOM directly via `e.currentTarget.parentElement`

## Files Changed

- `frontend/src/components/ProductList.tsx` — add `.product-thumbnail-wrapper` + `<img>` before `.product-info`
- `frontend/src/App.css` — add `.product-thumbnail-wrapper` and `.product-thumbnail` styles

## Out of Scope

- Scraping/storing image URLs in the database
- Backend changes
- Placeholders or loading spinners
- Images in Dashboard, ProductDetail, or Search views
