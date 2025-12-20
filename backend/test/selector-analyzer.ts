import { chromium, Browser, BrowserContext, Page } from 'playwright';

interface SelectorTestResult {
  selector: string;
  found: boolean;
  value: string | null;
  count: number;
  error?: string;
}

interface SelectorAnalysis {
  selector: string;
  results: SelectorTestResult[];
  bestMatch: SelectorTestResult | null;
}

export class SelectorAnalyzer {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;

  async initialize(): Promise<void> {
    if (!this.browser) {
      this.browser = await chromium.launch({
        headless: false, // Set to false to see the browser for debugging
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
      
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

  /**
   * Test a single selector and return the result
   */
  private async testSelector(
    page: Page,
    selector: string,
    attribute?: string
  ): Promise<SelectorTestResult> {
    try {
      // Wait a bit for the selector to potentially appear
      const elements = await page.$$(selector);
      
      if (elements.length === 0) {
        return {
          selector,
          found: false,
          value: null,
          count: 0,
          error: 'Selector not found'
        };
      }

      // Get text content or attribute value
      let values: string[] = [];
      for (const element of elements) {
        let value: string | null;
        if (attribute) {
          value = await element.getAttribute(attribute);
        } else {
          value = await element.textContent();
        }
        if (value && value.trim()) {
          values.push(value.trim());
        }
      }

      // Return the first non-empty value, or all unique values if multiple found
      const uniqueValues = [...new Set(values)];
      const resultValue = uniqueValues.length > 0 
        ? (uniqueValues.length === 1 ? uniqueValues[0] : uniqueValues.join(' | '))
        : null;

      return {
        selector: attribute ? `${selector}[${attribute}]` : selector,
        found: uniqueValues.length > 0,
        value: resultValue,
        count: uniqueValues.length
      };
    } catch (error) {
      return {
        selector,
        found: false,
        value: null,
        count: 0,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Analyze a product page to find the best selector for product category
   */
  async analyzeProductCategory(asin: string): Promise<SelectorAnalysis> {
    if (!this.browser || !this.context) {
      await this.initialize();
    }

    const page = await this.context!.newPage();
    
    try {
      const url = `https://www.amazon.com.br/dp/${asin}`;
      console.log(`\n🔍 Analyzing product page: ${url}\n`);
      
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForTimeout(4000);

      // Check if page loaded correctly
      const pageTitle = await page.title();
      console.log(`Page title: ${pageTitle}\n`);

      // Common selectors for product category on Amazon
      const categorySelectors = [
        // Breadcrumb selectors (most common)
        '#wayfinding-breadcrumbs_feature_div a',
        '#wayfinding-breadcrumbs_feature_div li a',
        '.a-breadcrumb a',
        '.a-breadcrumb li a',
        '[data-testid="breadcrumb"] a',
        'nav[aria-label="Breadcrumb"] a',
        
        // Direct category links
        '#wayfinding-breadcrumbs_feature_div',
        '.a-breadcrumb',
        
        // Category in product details
        '#productDetails_feature_div .a-section table tr:has-text("Categoria") td',
        '#productDetails_feature_div .a-section table tr:has-text("Departamento") td',
        '#productDetails_feature_div .a-section table tr:has-text("Category") td',
        '#productDetails_feature_div .a-section table tr:has-text("Department") td',
        
        // Alternative product details selectors
        '#productDetails_db_sections tr:has-text("Categoria") td',
        '#productDetails_db_sections tr:has-text("Departamento") td',
        '#productDetails_db_sections tr:has-text("Category") td',
        '#productDetails_db_sections tr:has-text("Department") td',
        
        // Generic table row selectors
        'table tr:has-text("Categoria") td:last-child',
        'table tr:has-text("Departamento") td:last-child',
        'table tr:has-text("Category") td:last-child',
        'table tr:has-text("Department") td:last-child',
        
        // Data attributes
        '[data-category]',
        '[data-department]',
        '[data-product-category]',
        
        // Meta tags (check in head)
        'meta[property="product:category"]',
        'meta[name="category"]',
      ];

      console.log(`Testing ${categorySelectors.length} selectors for product category...\n`);
      
      const results: SelectorTestResult[] = [];
      
      for (const selector of categorySelectors) {
        const result = await this.testSelector(page, selector);
        results.push(result);
        
        if (result.found) {
          console.log(`✅ ${result.selector}`);
          console.log(`   Found: ${result.count} element(s)`);
          console.log(`   Value: ${result.value}\n`);
        } else {
          console.log(`❌ ${result.selector} - ${result.error || 'Not found'}\n`);
        }
      }

      // Also check meta tags in the page head
      console.log('Checking meta tags...\n');
      const metaSelectors = [
        'meta[property="product:category"]',
        'meta[name="category"]',
        'meta[property="og:type"]',
      ];
      
      for (const selector of metaSelectors) {
        const result = await this.testSelector(page, selector, 'content');
        results.push(result);
        
        if (result.found) {
          console.log(`✅ ${result.selector}`);
          console.log(`   Found: ${result.count} element(s)`);
          console.log(`   Value: ${result.value}\n`);
        } else {
          console.log(`❌ ${result.selector} - ${result.error || 'Not found'}\n`);
        }
      }

      // Find the best match (first successful result with a meaningful value)
      const bestMatch = results.find(r => r.found && r.value && r.value.length > 0) || null;

      // Generate summary
      console.log('\n' + '='.repeat(80));
      console.log('SUMMARY');
      console.log('='.repeat(80));
      console.log(`Total selectors tested: ${results.length}`);
      console.log(`Successful selectors: ${results.filter(r => r.found).length}`);
      
      if (bestMatch) {
        console.log(`\n🎯 Best match found:`);
        console.log(`   Selector: ${bestMatch.selector}`);
        console.log(`   Value: ${bestMatch.value}`);
        console.log(`   Count: ${bestMatch.count}`);
      } else {
        console.log(`\n⚠️  No valid category selector found.`);
        console.log(`\n💡 Suggestions:`);
        console.log(`   1. Check if the page loaded correctly (not blocked/captcha)`);
        console.log(`   2. Inspect the page manually to find category elements`);
        console.log(`   3. The category might be in a different format or location`);
      }

      // Show all successful selectors
      const successfulSelectors = results.filter(r => r.found && r.value);
      if (successfulSelectors.length > 0) {
        console.log(`\n📋 All successful selectors:`);
        successfulSelectors.forEach((result, index) => {
          console.log(`   ${index + 1}. ${result.selector} → "${result.value}"`);
        });
      }

      await page.close();

      return {
        selector: 'category',
        results,
        bestMatch
      };
    } catch (error) {
      await page.close();
      console.error(`Error analyzing product category:`, error);
      throw error;
    }
  }

  /**
   * Generic method to test any selector on a product page
   * Useful for finding selectors for other product information
   */
  async testSelectors(
    asin: string,
    selectors: string[],
    attribute?: string
  ): Promise<SelectorTestResult[]> {
    if (!this.browser || !this.context) {
      await this.initialize();
    }

    const page = await this.context!.newPage();
    
    try {
      const url = `https://www.amazon.com.br/dp/${asin}`;
      console.log(`\n🔍 Testing selectors on: ${url}\n`);
      
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForTimeout(4000);

      const results: SelectorTestResult[] = [];
      
      for (const selector of selectors) {
        const result = await this.testSelector(page, selector, attribute);
        results.push(result);
        
        if (result.found) {
          console.log(`✅ ${result.selector}`);
          console.log(`   Found: ${result.count} element(s)`);
          console.log(`   Value: ${result.value}\n`);
        } else {
          console.log(`❌ ${result.selector} - ${result.error || 'Not found'}\n`);
        }
      }

      await page.close();
      return results;
    } catch (error) {
      await page.close();
      console.error(`Error testing selectors:`, error);
      throw error;
    }
  }

  /**
   * Take a screenshot of the page for manual inspection
   */
  async takeScreenshot(asin: string, filename?: string): Promise<void> {
    if (!this.browser || !this.context) {
      await this.initialize();
    }

    const page = await this.context!.newPage();
    
    try {
      const url = `https://www.amazon.com.br/dp/${asin}`;
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForTimeout(4000);

      const screenshotPath = filename || `screenshot-${asin}-${Date.now()}.png`;
      await page.screenshot({ path: screenshotPath, fullPage: true });
      console.log(`Screenshot saved to: ${screenshotPath}`);
      
      await page.close();
    } catch (error) {
      await page.close();
      console.error(`Error taking screenshot:`, error);
      throw error;
    }
  }
}

// CLI usage
async function main() {
  const analyzer = new SelectorAnalyzer();
  
  try {
    // Get ASIN from command line arguments or use a default test ASIN
    const asin = process.argv[2] || 'B08N5WRWNW'; // Default test ASIN
    
    console.log('='.repeat(80));
    console.log('Amazon Product Page Selector Analyzer');
    console.log('='.repeat(80));
    console.log(`\nUsage: ts-node selector-analyzer.ts <ASIN>`);
    console.log(`Analyzing ASIN: ${asin}\n`);

    // Analyze product category
    await analyzer.analyzeProductCategory(asin);
    
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  } finally {
    await analyzer.close();
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}
