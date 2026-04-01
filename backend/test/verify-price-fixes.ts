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
