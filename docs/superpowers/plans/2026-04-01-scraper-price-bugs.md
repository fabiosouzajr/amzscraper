# Scraper Price Bugs Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix two scraper bugs — marketplace-only items return wrong prices because shipping is ignored and the page type is undetected; Pix discount prices are picked up instead of the main product price.

**Architecture:** All changes are in `backend/src/services/scraper.ts`. Task 1 adds a Pix-price filter to Method 1's candidate collection. Task 2 extends the availability check to detect marketplace-only pages. Task 3 adds a dedicated marketplace price extraction branch (product page buybox + offer-listing fallback).

**Tech Stack:** TypeScript, Playwright (Firefox), Amazon.com.br DOM scraping, Node.js

---

## File map

- **Modify:** `backend/src/services/scraper.ts`
  - Task 1: lines 271–305 (Method 1 offscreen loop) and 313–338 (Method 1 wholeEl block) — add `isPixPrice` helper + filter
  - Task 2: line 199 — extend `availabilityCheck` to return `marketplaceOnly: true`
  - Task 3: lines 240–245 — add marketplace branch before standard price extraction; add `extractMarketplacePrice` private method to class
- **Create:** `backend/test/verify-price-fixes.ts` — manual verification script (Task 4)

---

## Task 1: Filter Pix discount prices from Method 1 candidates

**Files:**
- Modify: `backend/src/services/scraper.ts:261-354`

### Context

Method 1 collects all price elements inside `.a-price.priceToPay` and sorts by font size. The Pix discount price sometimes has equal or larger font size, causing it to be selected (R$56.58 instead of R$116.63). The fix: add `isPixPrice()` inside the evaluate block and exclude any candidate whose ancestor signals it is a Pix price.

- [ ] **Step 1: Add `isPixPrice` helper and filter in the offscreen loop**

In `backend/src/services/scraper.ts`, replace the `page.evaluate` block starting at line 261 with the version below. The only changes are: (a) a new `isPixPrice` function added at the top of the evaluate, (b) `&& !isPixPrice(el)` added to the offscreen condition on line 293, (c) `&& !isPixPrice(wholeEl)` added to the visible-whole condition on line 327.

```typescript
          const priceToPayData = await page.evaluate(() => {
            // @ts-ignore - browser context
            const priceToPay = document.querySelector('.a-price.priceToPay');
            if (!priceToPay) return null;

            // Returns true if the element is inside a Pix-discount price container.
            // Amazon wraps Pix prices in ancestors with class /pix/i or /pns/i, or
            // sibling/parent text nodes containing the word "Pix".
            function isPixPrice(el: any): boolean {
              let node: any = el;
              let depth = 0;
              while (node && depth < 10) {
                const cls: string = node.className || '';
                if (/pix/i.test(cls) || /pns/i.test(cls)) return true;
                // Check immediate previous sibling label (e.g. "No Pix")
                const sibText: string = node.previousElementSibling?.textContent ?? '';
                if (/pix/i.test(sibText)) return true;
                // Check parent's own text nodes (label inside same container)
                const parentOwn: string = Array.from((node.parentElement?.childNodes as any) ?? [])
                  .filter((n: any) => n.nodeType === 3)
                  .map((n: any) => n.textContent ?? '')
                  .join('');
                if (/pix/i.test(parentOwn)) return true;
                node = node.parentElement;
                depth++;
              }
              return false;
            }

            // @ts-ignore
            const allPriceElements: any[] = [];

            // Get all .a-offscreen prices within priceToPay
            // @ts-ignore
            const offscreenPrices = priceToPay.querySelectorAll('.a-offscreen');
            offscreenPrices.forEach((el: any) => {
              // @ts-ignore
              const text = el.textContent?.trim();
              if (text && text.includes('R$')) {
                // @ts-ignore
                const match = text.match(/R\$\s*([\d.,]+)/);
                if (match) {
                  // @ts-ignore
                  const parent = el.parentElement;
                  // @ts-ignore
                  const isStrikethrough = parent?.classList.contains('a-text-price') ||
                                          // @ts-ignore
                                          parent?.querySelector('.a-text-strike') !== null;
                  // @ts-ignore
                  const isVisible = parent?.offsetParent !== null;

                  if (isVisible && !isStrikethrough && !isPixPrice(el)) {
                    allPriceElements.push({
                      text: match[1],
                      source: 'offscreen',
                      // @ts-ignore
                      fontSize: window.getComputedStyle(parent || el).fontSize,
                      // @ts-ignore
                      fontWeight: window.getComputedStyle(parent || el).fontWeight
                    });
                  }
                }
              }
            });

            // Also get visible whole/fraction prices
            // @ts-ignore
            const wholeEl = priceToPay.querySelector('span.a-price-whole');
            // @ts-ignore
            const fractionEl = priceToPay.querySelector('span.a-price-fraction');

            if (wholeEl) {
              // @ts-ignore
              const wholeText = wholeEl.textContent?.trim();
              // @ts-ignore
              const fractionText = fractionEl ? fractionEl.textContent?.trim() : '';
              // @ts-ignore
              const isVisible = wholeEl.offsetParent !== null;
              // @ts-ignore
              const parent = wholeEl.closest('.a-price');
              // @ts-ignore
              const isStrikethrough = parent?.classList.contains('a-text-price') ||
                                       // @ts-ignore
                                       parent?.querySelector('.a-text-strike') !== null;

              if (wholeText && isVisible && !isStrikethrough && !isPixPrice(wholeEl)) {
                allPriceElements.push({
                  whole: wholeText,
                  fraction: fractionText || '',
                  source: 'visible',
                  // @ts-ignore
                  fontSize: window.getComputedStyle(wholeEl).fontSize,
                  // @ts-ignore
                  fontWeight: window.getComputedStyle(wholeEl).fontWeight
                });
              }
            }

            if (allPriceElements.length > 0) {
              allPriceElements.sort((a, b) => {
                const sizeA = parseFloat(a.fontSize) || 0;
                const sizeB = parseFloat(b.fontSize) || 0;
                return sizeB - sizeA;
              });
              return allPriceElements[0];
            }

            return null;
          });
```

- [ ] **Step 2: Build to verify no TypeScript errors**

```bash
cd /home/fj/git/amzscraper/backend && npm run build 2>&1 | grep -E 'error|Error' | grep -v 'test/'
```

Expected: no errors printed (pre-existing test/ errors are fine to ignore per project CLAUDE.md).

- [ ] **Step 3: Commit**

```bash
cd /home/fj/git/amzscraper && git add backend/src/services/scraper.ts && git commit -m "fix: exclude Pix discount prices from Method 1 candidate selection"
```

---

## Task 2: Detect marketplace-only page type in availability check

**Files:**
- Modify: `backend/src/services/scraper.ts:187-199`

### Context

When `#availability` text says "Este produto está disponível apenas por vendedores terceiros", the current code returns `{ available: true }` because none of the unavailability patterns match. We need to return `{ available: true, marketplaceOnly: true }` so Task 3 can branch on it.

- [ ] **Step 1: Add marketplace-only detection inside the `#availability` block**

In `backend/src/services/scraper.ts`, replace the single line at 199:

```typescript
          // #availability element found and no unavailable pattern matched → available
          return { available: true };
```

with:

```typescript
          // Check for marketplace-only (sold exclusively by third-party sellers)
          if (/apenas (por|de) vendedores terceiros/i.test(availText)) {
            return { available: true, marketplaceOnly: true };
          }
          // #availability element found and no unavailable pattern matched → available
          return { available: true };
```

- [ ] **Step 2: Build to verify no TypeScript errors**

```bash
cd /home/fj/git/amzscraper/backend && npm run build 2>&1 | grep -E 'error|Error' | grep -v 'test/'
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd /home/fj/git/amzscraper && git add backend/src/services/scraper.ts && git commit -m "fix: detect marketplace-only page type in availability check"
```

---

## Task 3: Add marketplace price extraction

**Files:**
- Modify: `backend/src/services/scraper.ts:240-245` (add branch before price extraction)
- Modify: `backend/src/services/scraper.ts` (add `extractMarketplacePrice` private method before `scrapeMultipleProducts`)

### Context

When `availabilityCheck.marketplaceOnly` is true, skip the standard price extraction (Methods 1-4) and instead find the cheapest offer + shipping. Try the product page buybox first; fall back to `/gp/offer-listing/{asin}` if no offers are found there.

- [ ] **Step 1: Add marketplace branch after the unavailable early-return block**

In `backend/src/services/scraper.ts`, find the block starting at line 240:

```typescript
      console.log('✓ Product is available');

      // Extract price - wait for price elements
      // Try multiple selectors as Amazon can have different price formats
      let price: number | null = null;
      let priceMethod: string = '';
      try {
```

Replace it with:

```typescript
      console.log('✓ Product is available');

      // Extract price - wait for price elements
      // Try multiple selectors as Amazon can have different price formats
      let price: number | null = null;
      let priceMethod: string = '';

      // Marketplace-only branch: extract cheapest offer + shipping instead of direct price
      if ((availabilityCheck as any).marketplaceOnly) {
        console.log('📦 Marketplace-only product — extracting cheapest offer (item + frete)...');
        price = await this.extractMarketplacePrice(page, asin);
        if (price === null) {
          console.log('⚠ No marketplace offers found, marking as unavailable');
          await page.close();
          return {
            asin,
            description,
            price: null,
            available: false,
            unavailableReason: 'Apenas vendedores terceiros - sem ofertas disponíveis',
            imageUrl,
            categories: []
          };
        }
        console.log(`✓ Marketplace price (item + frete): R$ ${price.toFixed(2)}`);
        priceMethod = 'marketplace-offer-listing';
      }

      if (!priceMethod) try {
```

Note: the `try {` at the end replaces the original `try {` on line 246 — the entire standard price extraction block is now guarded by `if (!priceMethod)`. The matching `} catch` at the end of the price extraction block (line 566-568) must also be updated to close the `if (!priceMethod)` block. Find:

```typescript
      } catch (error) {
        console.error(`✗ Error extracting price for ASIN ${asin}:`, error);
        throw new Error('Price not found or invalid format');
      }
```

And replace with:

```typescript
      } catch (error) {
        console.error(`✗ Error extracting price for ASIN ${asin}:`, error);
        throw new Error('Price not found or invalid format');
      }
      } // end if (!priceMethod)
```

Wait — that creates a syntax error. The cleaner approach is to wrap only the try/catch. Find the line right before the try:

```typescript
      if (!priceMethod) try {
```

And ensure the closing `}` for `if (!priceMethod)` is placed after the catch. The resulting structure should be:

```typescript
      if (!priceMethod) {
        try {
          // ... existing Methods 1-4 ...
        } catch (error) {
          console.error(`✗ Error extracting price for ASIN ${asin}:`, error);
          throw new Error('Price not found or invalid format');
        }
      }
```

To do this cleanly: replace the original `try {` at line 246 with `if (!priceMethod) { try {`, and replace the closing catch block:

Find:
```typescript
      } catch (error) {
        console.error(`✗ Error extracting price for ASIN ${asin}:`, error);
        throw new Error('Price not found or invalid format');
      }

      // Extract categories from breadcrumbs
```

Replace with:
```typescript
      } catch (error) {
        console.error(`✗ Error extracting price for ASIN ${asin}:`, error);
        throw new Error('Price not found or invalid format');
      }
      } // end if (!priceMethod)

      // Extract categories from breadcrumbs
```

- [ ] **Step 2: Add the `extractMarketplacePrice` private method**

Add this method to the `ScraperService` class, just before the `scrapeMultipleProducts` method (around line 695):

```typescript
  private async extractMarketplacePrice(page: Page, asin: string): Promise<number | null> {
    // Helper: parse "R$ 1.234,56" → 1234.56
    const parseBRPrice = (text: string): number | null => {
      const match = text.match(/R\$\s*([\d.,]+)/);
      if (!match) return null;
      const str = match[1].replace(/\./g, '').replace(',', '.');
      const val = parseFloat(str);
      return isNaN(val) ? null : val;
    };

    // Try extracting offers from the current product page (buybox area)
    const productPageMin = await page.evaluate(() => {
      const parseBRPrice = (text: string): number | null => {
        const match = text.match(/R\$\s*([\d.,]+)/);
        if (!match) return null;
        const str = match[1].replace(/\./g, '').replace(',', '.');
        const val = parseFloat(str);
        return isNaN(val) ? null : val;
      };

      const extractShipping = (container: Element): number => {
        const text = container.textContent || '';
        if (/frete\s+gr[aá]tis/i.test(text)) return 0;
        const m = text.match(/frete[:\s+]*R\$\s*([\d.,]+)/i) ||
                  text.match(/\+\s*R\$\s*([\d.,]+)[^R]*frete/i);
        if (m) {
          const str = m[1].replace(/\./g, '').replace(',', '.');
          return parseFloat(str) || 0;
        }
        return 0; // absent shipping text → treat as free
      };

      const totals: number[] = [];
      // @ts-ignore
      const containers = [
        // @ts-ignore
        document.querySelector('#moreBuyingChoices_feature_div'),
        // @ts-ignore
        document.querySelector('#buyBoxAccordion'),
        // @ts-ignore
        document.querySelector('#buybox-see-all-buying-choices'),
      ].filter(Boolean) as Element[];

      for (const container of containers) {
        // @ts-ignore
        container.querySelectorAll('.a-price .a-offscreen').forEach((el: Element) => {
          const itemPrice = parseBRPrice(el.textContent || '');
          if (itemPrice === null) return;
          const offerRow = el.closest('.a-box, .a-row, [class*="offer"], [class*="buying"]') || container;
          totals.push(itemPrice + extractShipping(offerRow));
        });
      }

      return totals.length > 0 ? Math.min(...totals) : null;
    });

    if (productPageMin !== null) {
      console.log(`✓ Found marketplace price on product page: R$ ${productPageMin.toFixed(2)}`);
      return productPageMin;
    }

    // Fallback: navigate to offer listing page
    console.log(`No offers on product page, checking /gp/offer-listing/${asin}...`);
    try {
      await page.goto(`https://www.amazon.com.br/gp/offer-listing/${asin}?f=new`, {
        waitUntil: 'domcontentloaded',
        timeout: 30000
      });
      await page.waitForTimeout(2000);

      const offerListingMin = await page.evaluate(() => {
        const parseBRPrice = (text: string): number | null => {
          const match = text.match(/R\$\s*([\d.,]+)/);
          if (!match) return null;
          const str = match[1].replace(/\./g, '').replace(',', '.');
          const val = parseFloat(str);
          return isNaN(val) ? null : val;
        };

        const totals: number[] = [];
        // @ts-ignore
        const offers = document.querySelectorAll('.olpOffer, [class*="offer-listing__offer"]');
        offers.forEach((offer: Element) => {
          // @ts-ignore
          const priceEl = offer.querySelector('.a-price .a-offscreen, .olpOfferPrice');
          const itemPrice = parseBRPrice(priceEl?.textContent || '');
          if (itemPrice === null) return;

          // @ts-ignore
          const shippingText = (offer.querySelector('.olpShippingPrice, .a-color-secondary')?.textContent || offer.textContent || '');
          let shipping = 0;
          if (!/frete\s+gr[aá]tis/i.test(shippingText)) {
            const m = shippingText.match(/R\$\s*([\d.,]+)/);
            if (m) {
              const str = m[1].replace(/\./g, '').replace(',', '.');
              shipping = parseFloat(str) || 0;
            }
          }
          totals.push(itemPrice + shipping);
        });

        return totals.length > 0 ? Math.min(...totals) : null;
      });

      if (offerListingMin !== null) {
        console.log(`✓ Found marketplace price on offer listing: R$ ${offerListingMin.toFixed(2)}`);
      }
      return offerListingMin;
    } catch (e) {
      console.log(`⚠ Error accessing offer listing for ${asin}: ${e}`);
      return null;
    }
  }
```

- [ ] **Step 3: Build to verify no TypeScript errors**

```bash
cd /home/fj/git/amzscraper/backend && npm run build 2>&1 | grep -E 'error|Error' | grep -v 'test/'
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd /home/fj/git/amzscraper && git add backend/src/services/scraper.ts && git commit -m "fix: add marketplace-only price extraction with shipping-aware total"
```

---

## Task 4: Verify against known bad ASINs

**Files:**
- Create: `backend/test/verify-price-fixes.ts`

### Context

No test framework exists. This script runs the scraper against the three known-broken ASINs and prints the result. Expected outcomes:
- B00FMPKAD0 → available: true, price ≈ 662.73 + shipping (a number, not null)
- B0001P15CG → available: true, price ≈ 249.44 + shipping (a number, not null)
- B08T6MCKMK → available: true, price ≈ 116.63 (not ~56.58)

- [ ] **Step 1: Create the verification script**

```typescript
// backend/test/verify-price-fixes.ts
// Run with: npx ts-node test/verify-price-fixes.ts
import { ScraperService } from '../src/services/scraper';

const CASES = [
  { asin: 'B00FMPKAD0', note: 'marketplace-only, ~R$662 + frete' },
  { asin: 'B0001P15CG', note: 'marketplace-only, ~R$249 + frete' },
  { asin: 'B08T6MCKMK', note: 'direct sale, should be ~R$116.63 (not R$56.58)' },
];

async function main() {
  const scraper = new ScraperService();
  await scraper.initialize();

  for (const { asin, note } of CASES) {
    console.log(`\n=== ${asin} (${note}) ===`);
    try {
      const result = await scraper.scrapeProduct(asin, 0);
      console.log(`  available: ${result.available}`);
      console.log(`  price:     ${result.price !== null ? `R$ ${result.price.toFixed(2)}` : 'null'}`);
      if (result.unavailableReason) console.log(`  reason:    ${result.unavailableReason}`);
    } catch (e) {
      console.log(`  ERROR: ${e}`);
    }
  }

  await scraper.close();
}

main().catch(console.error);
```

- [ ] **Step 2: Run the script and verify output**

```bash
cd /home/fj/git/amzscraper/backend && npx ts-node test/verify-price-fixes.ts 2>&1
```

Expected output (prices may vary slightly with live data):
```
=== B00FMPKAD0 (marketplace-only, ~R$662 + frete) ===
  available: true
  price:     R$ <some number above 600>

=== B0001P15CG (marketplace-only, ~R$249 + frete) ===
  available: true
  price:     R$ <some number above 200>

=== B08T6MCKMK (direct sale, should be ~R$116.63 (not R$56.58)) ===
  available: true
  price:     R$ <number around 116, NOT around 56>
```

If any result is wrong, examine the console logs from the scraper (they're verbose) to see which method fired and what DOM data was found.

- [ ] **Step 3: Commit**

```bash
cd /home/fj/git/amzscraper && git add backend/test/verify-price-fixes.ts && git commit -m "test: add manual verification script for price bug fixes"
```

---

## Self-review notes

- **Spec coverage**: Fix 1 (Pix filter) → Task 1. Fix 2 (marketplace detection) → Task 2. Fix 3 (marketplace extraction + shipping) → Task 3. Verification → Task 4. All covered.
- **No placeholders**: All steps have exact code.
- **Type consistency**: `parseBRPrice` is redefined inside each `page.evaluate` (required — evaluate runs in browser context, no shared closures). `extractMarketplacePrice` takes `Page` and `string`, returns `Promise<number | null>` — consistent with how it's called in Task 3.
- **`if (!priceMethod)` guard**: The entire standard price extraction try/catch block is wrapped, so marketplace products skip Methods 1-4 entirely. The `price` variable is already declared before the block so it remains in scope for category extraction and the final return.
