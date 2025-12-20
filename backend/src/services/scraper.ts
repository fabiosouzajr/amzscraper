import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { ScrapedProductData } from '../models/types';

export class ScraperService {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;

  async initialize(): Promise<void> {
    if (!this.browser) {
      this.browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
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
        
        // Wait for price elements with longer timeout
        await page.waitForSelector('span.a-price-whole, span.a-price-fraction, .a-price .a-offscreen', { timeout: 15000 });
        
        // Try to find price using multiple methods
        let wholePart: string | null = null;
        let fractionPart: string | null = null;
        
        // Method 1: Standard price format (span.a-price-whole + span.a-price-fraction)
        wholePart = await page.textContent('span.a-price-whole');
        fractionPart = await page.textContent('span.a-price-fraction');
        
        if (wholePart) {
          priceMethod = 'span.a-price-whole + span.a-price-fraction';
          console.log(`✓ Found price using method: ${priceMethod}`);
          console.log(`  Raw wholePart: "${wholePart}", raw fractionPart: "${fractionPart}"`);
        } else {
          // Method 2: Alternative price format (.a-price .a-offscreen)
          console.log('✗ Standard price format not found, trying .a-price .a-offscreen...');
          const priceText = await page.textContent('.a-price .a-offscreen');
          if (priceText) {
            // Extract price from text like "R$ 1.234,56"
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
      } catch (error) {
        console.error(`✗ Error extracting price for ASIN ${asin}:`, error);
        throw new Error('Price not found or invalid format');
      }

      const result = {
        asin,
        description,
        price
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

