---
title: Scraper Price Bugs Fix Design
date: 2026-04-01
status: approved
---

# Scraper Price Bugs Fix

## Problem

Three ASINs exhibit wrong price data:

| ASIN | Expected | Actual | Root cause |
|------|----------|--------|------------|
| B00FMPKAD0 | marketplace-only (R$662,73 + shipping) | wrong price, no shipping | marketplace page not detected |
| B0001P15CG | marketplace-only (R$249,44 + shipping) | wrong price, no shipping | marketplace page not detected |
| B08T6MCKMK | R$116,63 | R$56,58 | Pix discount price picked instead of main price |

## Scope

All changes are confined to `backend/src/services/scraper.ts`. No DB schema changes, no API changes, no frontend changes.

---

## Fix 1: Marketplace-only page detection

### Problem

When a product is sold only by third-party sellers, Amazon shows `#availability` with text like "Este produto está disponível apenas por vendedores terceiros". This text doesn't match any of the existing unavailability patterns, so `availabilityCheck` returns `{ available: true }` and the scraper picks up whatever third-party price is visible — without shipping.

### Fix

Extend the `availabilityCheck` evaluate block to return a third state:

```ts
return { available: true, marketplaceOnly: true }
```

Trigger condition: `#availability` text matches `/apenas (por|de) vendedores terceiros/i`.

The existing return type `{ available: boolean; reason?: string }` becomes:
```ts
{ available: boolean; marketplaceOnly?: boolean; reason?: string }
```

### Marketplace price extraction branch

When `availabilityCheck.marketplaceOnly === true`, skip the standard price extraction entirely and enter a dedicated branch:

1. **Look in the buybox** for visible offer elements:
   - Selectors: `#moreBuyingChoices_feature_div`, `#buyBoxAccordion`, `#buybox-see-all-buying-choices`
   - For each offer found, extract:
     - Item price: `.a-price .a-offscreen` or `span.a-price-whole` + `span.a-price-fraction` within the offer
     - Shipping: text matching `/frete:?\s*R\$\s*([\d.,]+)/i` or `/\+\s*R\$\s*([\d.,]+).*frete/i` near the offer; if absent or "Frete grátis" → R$0
   - Sum item + shipping, collect all totals, take minimum

2. **Fallback**: If no offers found on the product page, navigate to `/gp/offer-listing/{asin}` and apply the same extraction logic on that page.

3. **If still no price**: mark as unavailable with reason `"Apenas vendedores terceiros - sem ofertas disponíveis"`.

The result is returned with `available: true` and the computed total price (item + shipping), same shape as a normal scrape result.

---

## Fix 2: Pix discount price excluded from selection

### Problem

Method 1 (`.a-price.priceToPay`) collects all `.a-offscreen` price candidates and sorts by font size to pick the "most prominent." Amazon visually emphasizes the Pix discount price, so it often has an equal or larger font size and gets selected instead of the real price (roughly half the correct value).

### Fix

During candidate collection in Method 1's `page.evaluate` block, after finding each price element, walk up the DOM and check if any ancestor:
- Has a class matching `/pix/i` or `/pns/i`
- Or contains the literal text "Pix" as a label

If either condition is true, **exclude that candidate** from `allPriceElements`.

If all candidates are excluded (edge case: product genuinely only shows a Pix price), fall through to Method 2 (`#corePriceDisplay_desktop_feature_div` / `#corePrice_feature_div`) rather than returning null.

### Ancestor check implementation (browser context)

```ts
function isPixPrice(el: Element): boolean {
  let node: Element | null = el;
  let depth = 0;
  while (node && depth < 10) {
    if (/pix/i.test(node.className) || /pns/i.test(node.className)) return true;
    // Check sibling label text (e.g. "No Pix" label next to price)
    const siblingText = node.previousElementSibling?.textContent ?? '';
    if (/pix/i.test(siblingText)) return true;
    // Check parent's own text nodes (label inside same container)
    const parentOwnText = Array.from(node.parentElement?.childNodes ?? [])
      .filter(n => n.nodeType === Node.TEXT_NODE)
      .map(n => n.textContent ?? '')
      .join('');
    if (/pix/i.test(parentOwnText)) return true;
    node = node.parentElement;
    depth++;
  }
  return false;
}
```

Apply this check inside the `offscreenPrices.forEach` loop and the visible `wholeEl` block before pushing to `allPriceElements`.

---

## Data flow (unchanged)

No changes to how scraped data is stored. The returned `ScrapedProductData` shape is unchanged:

```ts
{
  asin: string
  description: string
  price: number | null       // total (item + shipping) for marketplace
  available: boolean
  unavailableReason?: string
  imageUrl?: string
  categories?: string[]
}
```

---

## Open questions / risks

- **Amazon DOM variability**: The offer listing selectors (`#moreBuyingChoices_feature_div`, `#buyBoxAccordion`) may vary by product. The `/gp/offer-listing/` fallback mitigates this.
- **Shipping text patterns**: Brazilian Portuguese shipping text is targeted (`/frete/i`). English fallback (`/shipping/i`) not needed for amazon.com.br but can be added if false negatives appear.
- **Pix ancestor walk**: Walking the full ancestor chain is O(depth) but negligible in the browser context. Cap at 10 levels to be safe.
