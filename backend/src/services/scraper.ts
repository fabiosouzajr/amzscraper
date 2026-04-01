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

      // Extract canonical product image URL
      let imageUrl: string | undefined;
      try {
        imageUrl = await page.evaluate(() => {
          const normalizeUrl = (raw: string | null | undefined): string | null => {
            if (!raw) return null;
            const trimmed = raw.trim();
            if (!trimmed) return null;
            if (trimmed.startsWith('//')) return `https:${trimmed}`;
            if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
            return null;
          };

          const candidates: Array<string | null> = [];

          // Common high-confidence metadata
          // @ts-ignore - browser context
          const ogImage = document.querySelector('meta[property="og:image"]')?.getAttribute('content');
          // @ts-ignore - browser context
          const imageSrc = document.querySelector('link[rel="image_src"]')?.getAttribute('href');
          candidates.push(ogImage, imageSrc);

          // Main Amazon image elements
          // @ts-ignore - browser context
          const landingImage = document.querySelector('#landingImage');
          if (landingImage) {
            candidates.push(
              landingImage.getAttribute('data-old-hires'),
              landingImage.getAttribute('src'),
            );
          }

          // @ts-ignore - browser context
          const wrapperImage = document.querySelector('#imgTagWrapperId img');
          if (wrapperImage) {
            candidates.push(
              wrapperImage.getAttribute('data-old-hires'),
              wrapperImage.getAttribute('src'),
            );
          }

          for (const candidate of candidates) {
            const normalized = normalizeUrl(candidate);
            if (normalized) return normalized;
          }

          return null;
        }) ?? undefined;
      } catch (error) {
        console.log('⚠ Error extracting image URL (continuing anyway):', error);
      }

      // Check product availability before extracting price
      console.log('Checking product availability...');
      const availabilityCheck = await page.evaluate(() => {
        // Check for common unavailability messages in Portuguese and English
        const unavailablePatterns = [
          /não\s+disponível/i,
          /indisponível/i,
          /fora\s+de\s+estoque/i,
          /esgotado/i,
          /produto\s+não\s+encontrado/i,
          /temporariamente\s+fora\s+de\s+estoque/i,
          /sem\s+estoque/i,
          /currently\s+unavailable/i,
          /out\s+of\s+stock/i
        ];

        // Priority 1: Check the #availability element — this is Amazon's dedicated
        // availability indicator for the main product. Only check here to avoid
        // false positives from body text (related products, ads, etc. often
        // contain "out of stock" text for *other* products).
        // @ts-ignore - browser context
        const availabilityDiv = document.querySelector('#availability, .availability');
        if (availabilityDiv) {
          const availText = availabilityDiv.textContent || '';
          for (const pattern of unavailablePatterns) {
            if (pattern.test(availText)) {
              const match = availText.match(pattern);
              return {
                available: false,
                reason: match ? match[0] : 'Produto não disponível'
              };
            }
          }
          // Check for marketplace-only (sold exclusively by third-party sellers)
          if (/apenas (por|de) vendedores terceiros/i.test(availText)) {
            return { available: true, marketplaceOnly: true };
          }
          // #availability element found and no unavailable pattern matched → available
          return { available: true };
        }

        // Priority 2: No #availability element — fall back to checking a narrow
        // set of known unavailability containers (not the whole body).
        // @ts-ignore - browser context
        const narrowContainers = document.querySelectorAll(
          '#outOfStock, #availability-brief, .availabilityInsideBuyBox_feature_div, #buybox-see-all-buying-choices'
        );
        for (let i = 0; i < narrowContainers.length; i++) {
          // @ts-ignore
          const containerText = narrowContainers[i].textContent || '';
          for (const pattern of unavailablePatterns) {
            if (pattern.test(containerText)) {
              const match = containerText.match(pattern);
              return {
                available: false,
                reason: match ? match[0] : 'Produto não disponível'
              };
            }
          }
        }

        return { available: true };
      });

      if (!availabilityCheck.available) {
        console.log(`⚠ Product is unavailable: ${availabilityCheck.reason}`);
        const result = {
          asin,
          description,
          price: null,
          available: false,
          unavailableReason: availabilityCheck.reason,
          imageUrl,
          categories: []
        };
        await page.close();
        return result;
      }

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

      if (!priceMethod) {
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

            // Returns true if the element is inside a Pix-discount price container.
            // Amazon wraps Pix prices in ancestors with class /pix/i or /pns/i, or
            // sibling/parent text nodes containing the word "Pix".
            function isPixPrice(el: any): boolean {
              let node: any = el;
              let depth = 0;
              while (node && depth < 10) {
                const cls: string = node.className || '';
                // /pns/i matches Amazon's "reinventPricePnSWrapper" class — the Price-and-Savings
                // widget that wraps Pix discount prices. Safe to use here because isPixPrice()
                // is only ever called on elements inside .a-price.priceToPay.
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
                const result = {
                  asin,
                  description,
                  price,
                  available: true,
                  imageUrl,
                  categories: []
                };
                await page.close();
                return result;
              }
            }
          }
          
          throw new Error('Price not found - no visible price elements detected');
        }
        
        // If price was already extracted from offscreen, skip the wholePart/fractionPart parsing
        if (priceFound && price !== null && price !== undefined && !isNaN(price)) {
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
      } // end if (!priceMethod)

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

      // Final validation - if we still don't have a price at this point, mark as unavailable
      if (price === null) {
        console.log('⚠ Could not extract price - marking as unavailable');
        const result = {
          asin,
          description,
          price: null,
          available: false,
          unavailableReason: 'Preço não encontrado',
          imageUrl,
          categories: categories.length > 0 ? categories : undefined
        };
        await page.close();
        return result;
      }

      const result = {
        asin,
        description,
        price,
        available: true,
        imageUrl,
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

  private async extractMarketplacePrice(page: Page, asin: string): Promise<number | null> {
    // Try extracting offers from the current product page (buybox area)
    const productPageMin = await page.evaluate(() => {
      const parseBRPrice = (text: string): number | null => {
        const match = text.match(/R\$\s*([\d.,]+)/);
        if (!match) return null;
        const str = match[1].replace(/\./g, '').replace(',', '.');
        const val = parseFloat(str);
        return isNaN(val) ? null : val;
      };

      // @ts-ignore
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
      // @ts-ignore
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
        // @ts-ignore
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
