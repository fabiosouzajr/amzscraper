import { chromium, Browser, BrowserContext, Page } from 'playwright';

async function analyzePriceSelectors(asin: string) {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080 }
  });
  
  const page = await context.newPage();
  
  try {
    const url = `https://www.amazon.com.br/dp/${asin}`;
    console.log(`\n🔍 Analyzing price selectors on: ${url}\n`);
    
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(5000);
    
    const pageTitle = await page.title();
    console.log(`Page title: ${pageTitle}\n`);
    
    // Test various price selectors
    const priceSelectors = [
      'span.a-price-whole',
      'span.a-price-fraction',
      '.a-price .a-offscreen',
      '.a-price.a-text-price',
      '.a-price .a-price-symbol',
      '.a-price',
      '[data-a-color="price"]',
      '#priceblock_ourprice',
      '#priceblock_dealprice',
      '#priceblock_saleprice',
      '.a-price-whole',
      '.a-price-fraction',
      '.a-price-symbol + .a-price-whole',
      '#corePriceDisplay_desktop_feature_div',
      '#corePrice_feature_div',
      '#price',
      '.price',
      '[aria-label*="price"]',
      '[data-a-color="price"] span',
    ];
    
    console.log('Testing price selectors...\n');
    
    for (const selector of priceSelectors) {
      try {
        const elements = await page.$$(selector);
        console.log(`\n📌 ${selector}:`);
        console.log(`   Found ${elements.length} element(s)`);
        
        if (elements.length > 0) {
          for (let i = 0; i < Math.min(elements.length, 5); i++) {
            const text = await elements[i].textContent();
            const innerHTML = await elements[i].innerHTML();
            const isVisible = await elements[i].isVisible().catch(() => false);
            console.log(`   [${i + 1}] Visible: ${isVisible}`);
            console.log(`       Text: "${text}"`);
            if (innerHTML && innerHTML.length < 100) {
              console.log(`       HTML: ${innerHTML}`);
            }
          }
        }
      } catch (error) {
        console.log(`   ❌ Error: ${error instanceof Error ? error.message : 'Unknown'}`);
      }
    }
    
    // Try to find price-related elements by evaluating JavaScript
    console.log('\n\n🔍 Checking for price patterns in the DOM...\n');
    const priceInfo = await page.evaluate(() => {
      // @ts-ignore - This code runs in browser context
      const results: any[] = [];
      
      // Check for common price classes
      // @ts-ignore
      const allPriceElements = document.querySelectorAll('[class*="price"], [id*="price"], [data-a-color="price"]');
      // @ts-ignore
      allPriceElements.forEach((el: any, idx: number) => {
        if (idx < 10) {
          const text = el.textContent?.trim();
          if (text && text.length > 0 && text.length < 50) {
            results.push({
              tag: el.tagName,
              className: el.className,
              id: el.id,
              text: text,
              visible: el.offsetParent !== null
            });
          }
        }
      });
      
      return results;
    });
    
    console.log('Found price-related elements:');
    priceInfo.forEach((info, idx) => {
      console.log(`\n[${idx + 1}]`);
      console.log(`   Tag: ${info.tag}`);
      console.log(`   Class: ${info.className}`);
      console.log(`   ID: ${info.id}`);
      console.log(`   Text: "${info.text}"`);
      console.log(`   Visible: ${info.visible}`);
    });
    
    // Check if product might be unavailable or have different price display
    const availability = await page.textContent('#availability').catch(() => null);
    const availabilitySpan = await page.textContent('span.a-size-medium.a-color-state').catch(() => null);
    
    console.log('\n\n📦 Product Availability:');
    if (availability) {
      console.log(`   #availability: "${availability.trim()}"`);
    }
    if (availabilitySpan) {
      console.log(`   span.a-size-medium.a-color-state: "${availabilitySpan.trim()}"`);
    }
    
    // Screenshot for manual inspection
    await page.screenshot({ path: `/tmp/amazon-price-${asin}.png`, fullPage: false });
    console.log(`\n📸 Screenshot saved to /tmp/amazon-price-${asin}.png`);
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await page.close();
    await browser.close();
  }
}

// Get ASIN from command line
const asin = process.argv[2] || 'B097QBVNRL';
analyzePriceSelectors(asin).catch(console.error);
