import { firefox, Browser, BrowserContext, Page } from 'playwright';

async function debugPrice(asin: string) {
  const browser = await firefox.launch({
    headless: true
  });
  
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080 }
  });
  
  const page = await context.newPage();
  
  try {
    const url = `https://www.amazon.com.br/dp/${asin}`;
    console.log(`\n🔍 Debugging price extraction for: ${url}\n`);
    
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(6000); // Wait longer for dynamic content
    
    const pageTitle = await page.title();
    console.log(`Page title: ${pageTitle}\n`);
    
    // Check for price containers
    console.log('Checking price containers...\n');
    const priceContainers = await page.evaluate(() => {
      // @ts-ignore
      const containers = [
        document.querySelector('#corePriceDisplay_desktop_feature_div'),
        document.querySelector('#corePrice_feature_div'),
        document.querySelector('.a-price.priceToPay'),
        document.querySelector('#priceblock_ourprice'),
        document.querySelector('#priceblock_dealprice'),
        document.querySelector('#priceblock_saleprice'),
      ].filter(Boolean);
      
      return containers.map((el: any) => ({
        id: el.id,
        className: el.className,
        innerHTML: el.innerHTML.substring(0, 500),
        textContent: el.textContent?.trim()
      }));
    });
    
    console.log(`Found ${priceContainers.length} price container(s):\n`);
    priceContainers.forEach((container, idx) => {
      console.log(`[${idx + 1}]`);
      console.log(`   ID: ${container.id || 'none'}`);
      console.log(`   Class: ${container.className || 'none'}`);
      console.log(`   Text: "${container.textContent}"`);
      console.log(`   HTML (first 500 chars): ${container.innerHTML.substring(0, 500)}`);
      console.log('');
    });
    
    // Check for price whole and fraction parts
    console.log('Checking for price whole/fraction parts...\n');
    const priceParts = await page.evaluate(() => {
      // @ts-ignore
      const wholeEls = Array.from(document.querySelectorAll('span.a-price-whole'));
      // @ts-ignore
      const fractionEls = Array.from(document.querySelectorAll('span.a-price-fraction'));
      
      const results: any[] = [];
      
      // Check all whole parts
      wholeEls.forEach((el: any, idx: number) => {
        const isVisible = el.offsetParent !== null;
        const text = el.textContent?.trim();
        const parent = el.parentElement;
        results.push({
          type: 'whole',
          index: idx,
          text: text,
          visible: isVisible,
          parentClass: parent?.className || 'none',
          parentId: parent?.id || 'none'
        });
      });
      
      // Check all fraction parts
      fractionEls.forEach((el: any, idx: number) => {
        const isVisible = el.offsetParent !== null;
        const text = el.textContent?.trim();
        const parent = el.parentElement;
        results.push({
          type: 'fraction',
          index: idx,
          text: text,
          visible: isVisible,
          parentClass: parent?.className || 'none',
          parentId: parent?.id || 'none'
        });
      });
      
      return results;
    });
    
    console.log(`Found ${priceParts.length} price part(s):\n`);
    priceParts.forEach((part, idx) => {
      console.log(`[${idx + 1}] ${part.type.toUpperCase()}`);
      console.log(`   Text: "${part.text}"`);
      console.log(`   Visible: ${part.visible}`);
      console.log(`   Parent Class: ${part.parentClass}`);
      console.log(`   Parent ID: ${part.parentId}`);
      console.log('');
    });
    
    // Check for offscreen prices
    console.log('Checking for .a-offscreen prices...\n');
    const offscreenPrices = await page.evaluate(() => {
      // @ts-ignore
      const els = Array.from(document.querySelectorAll('.a-offscreen'));
      return els.map((el: any) => ({
        text: el.textContent?.trim(),
        parentClass: el.parentElement?.className || 'none',
        parentId: el.parentElement?.id || 'none'
      })).filter((p: any) => p.text && p.text.includes('R$'));
    });
    
    console.log(`Found ${offscreenPrices.length} offscreen price(s):\n`);
    offscreenPrices.forEach((price, idx) => {
      console.log(`[${idx + 1}] "${price.text}"`);
      console.log(`   Parent Class: ${price.parentClass}`);
      console.log(`   Parent ID: ${price.parentId}`);
      console.log('');
    });
    
    // Search for the specific price the user mentioned (337,15)
    console.log('Searching for price 337,15 in page content...\n');
    const searchForPrice = await page.evaluate(() => {
      // @ts-ignore
      const bodyText = document.body.textContent || '';
      const matches = bodyText.match(/337[.,]\s*15|R\$\s*337[.,]\s*15/gi);
      return matches || [];
    });
    if (searchForPrice.length > 0) {
      console.log(`Found ${searchForPrice.length} occurrence(s) of 337,15:`, searchForPrice);
    } else {
      console.log('Price 337,15 not found in page content');
    }
    
    // Try to extract price using the NEW scraper logic (prioritizing .a-price.priceToPay)
    console.log('\nAttempting price extraction using NEW scraper logic...\n');
    const extractedPrice = await page.evaluate(() => {
      // @ts-ignore - browser context
      // Method 1: Try .a-price.priceToPay first (most specific)
      const priceToPay = document.querySelector('.a-price.priceToPay');
      if (priceToPay) {
        // Try offscreen first
        // @ts-ignore
        const offscreen = priceToPay.querySelector('.a-offscreen');
        if (offscreen) {
          // @ts-ignore
          const offscreenText = offscreen.textContent?.trim();
          if (offscreenText && offscreenText.includes('R$')) {
            // @ts-ignore
            const match = offscreenText.match(/R\$\s*([\d.,]+)/);
            if (match) {
              return { source: 'priceToPay-offscreen', text: match[1] };
            }
          }
        }
        // Fallback to visible
        // @ts-ignore
        const wholeEl = priceToPay.querySelector('span.a-price-whole');
        // @ts-ignore
        const fractionEl = priceToPay.querySelector('span.a-price-fraction');
        if (wholeEl) {
          // @ts-ignore
          return { source: 'priceToPay-visible', whole: wholeEl.textContent?.trim(), fraction: fractionEl ? fractionEl.textContent?.trim() : '' };
        }
      }
      
      // Method 2: Fallback to corePrice containers
      // @ts-ignore
      const priceContainer = document.querySelector('#corePriceDisplay_desktop_feature_div, #corePrice_feature_div');
      if (!priceContainer) return { error: 'No price container found' };
      
      // Try offscreen first
      // @ts-ignore
      const offscreen = priceContainer.querySelector('.a-price .a-offscreen');
      if (offscreen) {
        // @ts-ignore
        const offscreenText = offscreen.textContent?.trim();
        if (offscreenText && offscreenText.includes('R$')) {
          // @ts-ignore
          const match = offscreenText.match(/R\$\s*([\d.,]+)/);
          if (match) {
            return { source: 'corePrice-offscreen', text: match[1] };
          }
        }
      }
      
      // Fallback to visible
      // @ts-ignore
      const wholeEls = priceContainer.querySelectorAll('span.a-price-whole');
      // @ts-ignore
      const fractionEls = priceContainer.querySelectorAll('span.a-price-fraction');
      
      // Find first visible elements
      for (let i = 0; i < wholeEls.length; i++) {
        // @ts-ignore
        if (wholeEls[i].offsetParent !== null) {
          // @ts-ignore
          const wholeText = wholeEls[i].textContent?.trim();
          // @ts-ignore
          const fractionText = fractionEls[i]?.textContent?.trim();
          if (wholeText) {
            return { source: 'corePrice-visible', whole: wholeText, fraction: fractionText || '' };
          }
        }
      }
      return { error: 'No visible price elements found' };
    });
    
    console.log('Extracted price data:', JSON.stringify(extractedPrice, null, 2));
    
    if (extractedPrice.error) {
      console.log(`\n❌ Error: ${extractedPrice.error}`);
    } else if (extractedPrice.text) {
      // Price from offscreen
      const priceStr = extractedPrice.text.replace(/\./g, '').replace(',', '.');
      const price = parseFloat(priceStr);
      console.log('\n📊 Price parsing breakdown (from offscreen):');
      console.log(`   Source: ${extractedPrice.source}`);
      console.log(`   Raw text: "${extractedPrice.text}"`);
      console.log(`   Parsed price: ${price}`);
      console.log(`   Expected: 337.15`);
      console.log(`   Difference: ${Math.abs(price - 337.15)}`);
    } else if (extractedPrice.whole) {
      // Price from visible whole/fraction
      let cleanedWhole = extractedPrice.whole.replace(/[^\d,.]/g, '');
      cleanedWhole = cleanedWhole.replace(/,$/, '');
      cleanedWhole = cleanedWhole.replace(/\./g, '');
      const cleanedFraction = extractedPrice.fraction ? extractedPrice.fraction.replace(/[^\d]/g, '') : '00';
      const priceString = `${cleanedWhole}.${cleanedFraction}`;
      const price = parseFloat(priceString);
      
      console.log('\n📊 Price parsing breakdown (from visible):');
      console.log(`   Source: ${extractedPrice.source}`);
      console.log(`   Raw whole: "${extractedPrice.whole}"`);
      console.log(`   Raw fraction: "${extractedPrice.fraction}"`);
      console.log(`   Cleaned whole: "${cleanedWhole}"`);
      console.log(`   Cleaned fraction: "${cleanedFraction}"`);
      console.log(`   Final price string: "${priceString}"`);
      console.log(`   Parsed price: ${price}`);
      console.log(`   Expected: 337.15`);
      console.log(`   Difference: ${Math.abs(price - 337.15)}`);
    }
    
    // Screenshot
    await page.screenshot({ path: `/tmp/amazon-debug-${asin}.png`, fullPage: false });
    console.log(`\n📸 Screenshot saved to /tmp/amazon-debug-${asin}.png`);
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await page.close();
    await browser.close();
  }
}

const asin = process.argv[2] || 'B0F7ZSFMQ6';
debugPrice(asin).catch(console.error);

