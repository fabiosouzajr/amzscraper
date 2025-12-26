import { firefox, Browser, BrowserContext, Page } from 'playwright';
import { ScrapedProductData } from '../models/types';

export class ScraperService {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;

  async initialize(): Promise<void> {
    if (!this.browser) {
      this.browser = await firefox.launch({
        headless: true
      });
      
      // Create a context with user agent and viewport settings
      this.context = await this.browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        viewport: { width: 1920, height: 1080 }
      });
    }
  }

  async close(): Promise<void> {
    if (this.context) {
      await this.context.close();
      this.context = null;
    }
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  async scrapeProduct(asin: string, retries: number = 2): Promise<ScrapedProductData> {
    if (!this.browser || !this.context) {
      await this.initialize();
    }

    const page = await this.context!.newPage();
    
    try {
      
      const url = `https://www.amazon.com.br/dp/${asin}`;
      console.log(`Scraping ${url}...`);
      
      // Use 'domcontentloaded' for faster initial load, then wait for content
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
      
      // Wait longer for dynamic content to load (Amazon pages can be slow)
      await page.waitForTimeout(4000);
      
      // Check if we're on the right page (not a captcha or error page)
      const pageTitle = await page.title();
      console.log(`Page title: ${pageTitle}`);
      
      // Try multiple selectors for product title in priority order
      let description: string | null = null;
      let selectorUsed: string = '';
      
      // Priority 1: Primary selector #productTitle (most common)
      try {
        console.log('Trying primary selector: #productTitle');
        await page.waitForSelector('#productTitle', { timeout: 25000, state: 'visible' });
        description = await page.textContent('#productTitle');
        selectorUsed = '#productTitle';
        console.log('✓ Successfully found product title using #productTitle');
      } catch (error) {
        console.log('✗ Primary selector #productTitle failed, trying span#productTitle...');
        
        // Priority 2: span#productTitle (when it's a span element)
        try {
          await page.waitForSelector('span#productTitle', { timeout: 15000, state: 'visible' });
          description = await page.textContent('span#productTitle');
          selectorUsed = 'span#productTitle';
          console.log('✓ Successfully found product title using span#productTitle');
        } catch (error2) {
          console.log('✗ span#productTitle failed, trying h1 alternatives...');
          
          // Priority 3: h1.a-size-large (alternative format)
          try {
            await page.waitForSelector('h1.a-size-large', { timeout: 12000, state: 'visible' });
            description = await page.textContent('h1.a-size-large');
            selectorUsed = 'h1.a-size-large';
            console.log('✓ Successfully found product title using h1.a-size-large');
          } catch (error3) {
            console.log('✗ h1.a-size-large failed, trying h1[data-automation-id="title"]...');
            
            // Priority 4: h1[data-automation-id="title"] (last resort)
            try {
              await page.waitForSelector('h1[data-automation-id="title"]', { timeout: 10000, state: 'visible' });
              description = await page.textContent('h1[data-automation-id="title"]');
              selectorUsed = 'h1[data-automation-id="title"]';
              console.log('✓ Successfully found product title using h1[data-automation-id="title"]');
            } catch (error4) {
              // Last resort: check if page has any product-related content
              console.log('✗ All selectors failed, checking for captcha/blocking...');
              const bodyText = await page.textContent('body');
              if (bodyText && (bodyText.toLowerCase().includes('captcha') || bodyText.toLowerCase().includes('robot') || bodyText.toLowerCase().includes('verify'))) {
                throw new Error('Amazon is showing a captcha or blocking the request');
              }
              throw new Error('Product title not found on page - all selectors failed');
            }
          }
        }
      }
      
      if (!description || description.trim() === '') {
        throw new Error('Product title is empty');
      }
      
      description = description.trim();
      console.log(`Found product using selector "${selectorUsed}": ${description.substring(0, 60)}...`);

      // Extract price - wait for price elements
      // Try multiple selectors as Amazon can have different price formats
      let price: number;
      let priceMethod: string = '';
      try {
        console.log('Extracting price...');
        
        // Wait for visible price elements - try main price container first
        let priceFound = false;
        let wholePart: string | null = null;
        let fractionPart: string | null = null;
        
        // Method 1: Prioritize .a-price.priceToPay (main product price) - most specific
        try {
          // Wait for the specific priceToPay element first
          await page.waitForSelector('.a-price.priceToPay', { timeout: 10000, state: 'visible' }).catch(() => null);
          
          // Find price within .a-price.priceToPay container (this is the main product price)
          // When logged in, Amazon may show Pix discount prices, so we need to find the actual displayed price
          const priceToPayData = await page.evaluate(() => {
            // @ts-ignore - browser context
            const priceToPay = document.querySelector('.a-price.priceToPay');
            if (!priceToPay) return null;
            
            // Strategy: Look for all price elements in the priceToPay container and find the most prominent one
            // When there's a Pix discount, Amazon often shows multiple prices, and we want the displayed one
            
            // First, collect all price elements within priceToPay
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
                  // Check if this is the visible/active price (not a crossed-out old price)
                  // @ts-ignore
                  const parent = el.parentElement;
                  // @ts-ignore
                  const isStrikethrough = parent?.classList.contains('a-text-price') || 
                                          // @ts-ignore
                                          parent?.querySelector('.a-text-strike') !== null;
                  // @ts-ignore
                  const isVisible = parent?.offsetParent !== null;
                  
                  if (isVisible && !isStrikethrough) {
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
              
              if (wholeText && isVisible && !isStrikethrough) {
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
            
            // If we found multiple prices, prioritize the one with larger font size (most prominent)
            if (allPriceElements.length > 0) {
              // Sort by font size (larger = more prominent)
              allPriceElements.sort((a, b) => {
                const sizeA = parseFloat(a.fontSize) || 0;
                const sizeB = parseFloat(b.fontSize) || 0;
                return sizeB - sizeA; // Descending order
              });
              
              // Return the most prominent price
              return allPriceElements[0];
            }
            
            return null;
          });
          
          if (priceToPayData) {
            if (priceToPayData.source === 'offscreen') {
              // Parse from offscreen text like "377,88"
              const priceStr = priceToPayData.text.replace(/\./g, '').replace(',', '.');
              price = parseFloat(priceStr);
              if (!isNaN(price)) {
                priceMethod = '.a-price.priceToPay .a-offscreen';
                console.log(`✓ Found price using method: ${priceMethod} (R$ ${price.toFixed(2)})`);
                priceFound = true;
              }
            } else {
              wholePart = priceToPayData.whole;
              fractionPart = priceToPayData.fraction;
              priceMethod = '.a-price.priceToPay visible';
              console.log(`✓ Found price using method: ${priceMethod}`);
              console.log(`  Raw wholePart: "${wholePart}", raw fractionPart: "${fractionPart}"`);
              priceFound = true;
            }
          }
        } catch (error) {
          console.log('✗ .a-price.priceToPay not found, trying alternative methods...');
        }
        
        // Method 2: Try main price containers if priceToPay not found
        if (!priceFound) {
          try {
            // Wait for main price container
            await page.waitForSelector('#corePriceDisplay_desktop_feature_div, #corePrice_feature_div', { timeout: 10000, state: 'visible' });
            
            // Find visible price whole and fraction parts within the price container
            const visiblePriceData = await page.evaluate(() => {
              // @ts-ignore - browser context
              // Try corePriceDisplay_desktop_feature_div first (most common)
              let priceContainer = document.querySelector('#corePriceDisplay_desktop_feature_div');
              if (!priceContainer) {
                // @ts-ignore
                priceContainer = document.querySelector('#corePrice_feature_div');
              }
              if (!priceContainer) return null;
              
              // First try offscreen price within the container
              // @ts-ignore
              const offscreen = priceContainer.querySelector('.a-price .a-offscreen');
              if (offscreen) {
                // @ts-ignore
                const offscreenText = offscreen.textContent?.trim();
                if (offscreenText && offscreenText.includes('R$')) {
                  // @ts-ignore
                  const match = offscreenText.match(/R\$\s*([\d.,]+)/);
                  if (match) {
                    return { source: 'offscreen', text: match[1] };
                  }
                }
              }
              
              // Fallback to visible whole/fraction parts
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
                    return { source: 'visible', whole: wholeText, fraction: fractionText || '' };
                  }
                }
              }
              return null;
            });
            
            if (visiblePriceData) {
              if (visiblePriceData.source === 'offscreen') {
                // Parse from offscreen text
                const priceStr = visiblePriceData.text.replace(/\./g, '').replace(',', '.');
                price = parseFloat(priceStr);
                if (!isNaN(price)) {
                  priceMethod = 'corePrice container .a-offscreen';
                  console.log(`✓ Found price using method: ${priceMethod} (R$ ${price.toFixed(2)})`);
                  priceFound = true;
                }
              } else {
                wholePart = visiblePriceData.whole;
                fractionPart = visiblePriceData.fraction;
                priceMethod = 'corePrice container visible';
                console.log(`✓ Found price using method: ${priceMethod}`);
                console.log(`  Raw wholePart: "${wholePart}", raw fractionPart: "${fractionPart}"`);
                priceFound = true;
              }
            }
          } catch (error) {
            console.log('✗ Main price container not found, trying alternative methods...');
          }
        }
        
        // Method 3: Find any visible price whole/fraction elements if previous methods failed
        if (!priceFound) {
          try {
            await page.waitForSelector('span.a-price-whole', { timeout: 10000, state: 'visible' });
            
            // Find the first visible price whole and fraction elements
            const visiblePriceData = await page.evaluate(() => {
              // @ts-ignore - browser context
              const wholeEls = document.querySelectorAll('span.a-price-whole');
              // @ts-ignore
              const fractionEls = document.querySelectorAll('span.a-price-fraction');
              
              // Find first visible whole element
              for (let i = 0; i < wholeEls.length; i++) {
                // @ts-ignore
                if (wholeEls[i].offsetParent !== null) {
                  // @ts-ignore
                  const wholeText = wholeEls[i].textContent?.trim();
                  // @ts-ignore
                  const fractionText = fractionEls[i]?.textContent?.trim();
                  if (wholeText) {
                    return { whole: wholeText, fraction: fractionText || '' };
                  }
                }
              }
              return null;
            });
            
            if (visiblePriceData) {
              wholePart = visiblePriceData.whole;
              fractionPart = visiblePriceData.fraction;
              priceMethod = 'visible span.a-price-whole + span.a-price-fraction';
              console.log(`✓ Found price using method: ${priceMethod}`);
              console.log(`  Raw wholePart: "${wholePart}", raw fractionPart: "${fractionPart}"`);
              priceFound = true;
            }
          } catch (error) {
            console.log('✗ Visible price elements not found, trying .a-offscreen...');
          }
        }
        
        // Method 4: Fallback to .a-offscreen if visible elements not found
        if (!priceFound) {
          const priceText = await page.textContent('.a-price .a-offscreen').catch(() => null);
          if (priceText && priceText.trim()) {
            // Extract price from text like "R$ 342,40" or "R$ 1.234,56"
            const match = priceText.match(/[\d.,]+/);
            if (match) {
              const priceStr = match[0].replace(/\./g, '').replace(',', '.');
              price = parseFloat(priceStr);
              if (!isNaN(price)) {
                priceMethod = '.a-price .a-offscreen';
                console.log(`✓ Found price using method: ${priceMethod} (R$ ${price.toFixed(2)})`);
                return {
                  asin,
                  description,
                  price
                };
              }
            }
          }
          
          throw new Error('Price not found - no visible price elements detected');
        }
        
        // If price was already extracted from offscreen, skip the wholePart/fractionPart parsing
        if (priceFound && price !== undefined && !isNaN(price)) {
          // Price already extracted from offscreen, continue
          console.log(`✓ Price already extracted: R$ ${price.toFixed(2)}`);
        } else {
          // Need to parse from wholePart/fractionPart
          if (!wholePart) {
            throw new Error('Price whole part not found');
          }

          // Clean the whole part
          // Brazilian prices use: dots (.) as thousands separators, comma (,) as decimal separator
          // Example: "1.234,56" means 1234.56
          // wholePart might be "1.498," (with trailing comma) or "1.498" (without)
          // fractionPart is "33" or "90" etc.
          let cleanedWhole = wholePart.replace(/[^\d,.]/g, ''); // Remove non-digit/comma/dot chars
          
          // Remove trailing comma if present (it's just a visual separator, not part of the number)
          cleanedWhole = cleanedWhole.replace(/,$/, '');
          
          // Remove all dots (they are thousands separators in Brazilian format)
          // Example: "1.498" -> "1498"
          cleanedWhole = cleanedWhole.replace(/\./g, '');
          
          const cleanedFraction = fractionPart ? fractionPart.replace(/[^\d]/g, '') : '00';
          
          // Combine whole and fraction parts with a single dot as decimal separator
          // Example: "1498" + "33" -> "1498.33"
          const priceString = `${cleanedWhole}.${cleanedFraction}`;
          price = parseFloat(priceString);
          
          if (isNaN(price)) {
            throw new Error(`Invalid price format: ${priceString} (from wholePart: "${wholePart}", fractionPart: "${fractionPart}")`);
          }
          
          console.log(`  Cleaned wholePart: "${cleanedWhole}", cleanedFraction: "${cleanedFraction}"`);
          console.log(`  Final price string: "${priceString}"`);
          console.log(`✓ Extracted price using method "${priceMethod}": R$ ${price.toFixed(2)}`);
        }
      } catch (error) {
        console.error(`✗ Error extracting price for ASIN ${asin}:`, error);
        throw new Error('Price not found or invalid format');
      }

      // Extract categories from breadcrumbs
      let categories: string[] = [];
      try {
        console.log('Extracting categories...');
        const categoryData = await page.evaluate(() => {
          // @ts-ignore - browser context
          // Try breadcrumb selectors first (most common)
          let breadcrumbLinks: NodeListOf<Element> | null = null;
          
          // Priority 1: wayfinding-breadcrumbs
          // @ts-ignore
          const breadcrumbContainer = document.querySelector('#wayfinding-breadcrumbs_feature_div, .a-breadcrumb, nav[aria-label="Breadcrumb"]');
          if (breadcrumbContainer) {
            // @ts-ignore
            breadcrumbLinks = breadcrumbContainer.querySelectorAll('a');
          }
          
          // Priority 2: If no breadcrumbs, try product details table
          if (!breadcrumbLinks || breadcrumbLinks.length === 0) {
            // @ts-ignore
            const detailRows = document.querySelectorAll('#productDetails_feature_div tr, #productDetails_db_sections tr');
            for (let i = 0; i < detailRows.length; i++) {
              // @ts-ignore
              const rowText = detailRows[i].textContent?.toLowerCase() || '';
              if (rowText.includes('categoria') || rowText.includes('departamento') || 
                  rowText.includes('category') || rowText.includes('department')) {
                // @ts-ignore
                const td = detailRows[i].querySelector('td:last-child');
                if (td) {
                  // @ts-ignore
                  const categoryText = td.textContent?.trim();
                  if (categoryText) {
                    // Split by common delimiters if it's a path
                    return categoryText.split(/[>|•]/).map((c: string) => c.trim()).filter((c: string) => c.length > 0);
                  }
                }
              }
            }
          }
          
          // Build breadcrumb array (skip first link which is usually "Início" or "Home")
          if (breadcrumbLinks && breadcrumbLinks.length > 0) {
            const categories: string[] = [];
            // Skip first link (usually "Início" or "Home")
            for (let i = 1; i < breadcrumbLinks.length; i++) {
              // @ts-ignore
              const text = breadcrumbLinks[i].textContent?.trim();
              if (text && text.length > 0) {
                categories.push(text);
              }
            }
            if (categories.length > 0) {
              return categories;
            }
          }
          
          // Try meta tags as last resort
          // @ts-ignore
          const metaCategory = document.querySelector('meta[property="product:category"]');
          if (metaCategory) {
            // @ts-ignore
            const content = metaCategory.getAttribute('content');
            if (content) {
              // Split by common delimiters
              // @ts-ignore - browser context, types are inferred
              return content.split(/[>|•]/).map((c: string) => c.trim()).filter((c: string) => c.length > 0);
            }
          }
          
          return [];
        });
        
        if (categoryData && Array.isArray(categoryData) && categoryData.length > 0) {
          categories = categoryData;
          console.log(`✓ Extracted ${categories.length} categories: ${categories.join(' > ')}`);
        } else {
          console.log('⚠ Categories not found (this is optional)');
        }
      } catch (error) {
        console.log('⚠ Error extracting categories (continuing anyway):', error);
        // Category extraction failure should not block product scraping
      }

      const result = {
        asin,
        description,
        price,
        categories: categories.length > 0 ? categories : undefined
      };
      await page.close();
      return result;
    } catch (error) {
      await page.close();
      console.error(`Error scraping product ${asin}:`, error);
      
      // Retry logic
      if (retries > 0 && error instanceof Error) {
        console.log(`Retrying scrape for ${asin}... (${retries} retries left)`);
        await new Promise(resolve => setTimeout(resolve, 3000)); // Wait before retry
        return this.scrapeProduct(asin, retries - 1);
      }
      
      throw error;
    }
  }

  async scrapeMultipleProducts(asins: string[]): Promise<ScrapedProductData[]> {
    const results: ScrapedProductData[] = [];
    
    for (const asin of asins) {
      try {
        const data = await this.scrapeProduct(asin);
        results.push(data);
        // Add a small delay between requests to avoid being blocked
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (error) {
        console.error(`Failed to scrape ASIN ${asin}:`, error);
        // Continue with next product even if one fails
      }
    }
    
    return results;
  }
}

// Singleton instance
export const scraperService = new ScraperService();

