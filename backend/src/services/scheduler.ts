import * as cron from 'node-cron';
import { dbService } from './database';
import { scraperService } from './scraper';

export class SchedulerService {
  private cronJob: cron.ScheduledTask | null = null;
  private isUpdating: boolean = false;

  start(schedule: string = '0 0 * * *'): void {
    // Default: run daily at midnight
    if (this.cronJob) {
      this.stop();
    }

    console.log(`Starting scheduler with schedule: ${schedule}`);
    this.cronJob = cron.schedule(schedule, async () => {
      await this.updateAllPrices();
    });

    console.log('Scheduler started successfully');
  }

  stop(): void {
    if (this.cronJob) {
      this.cronJob.stop();
      this.cronJob = null;
      console.log('Scheduler stopped');
    }
  }

  async updateAllPrices(): Promise<void> {
    if (this.isUpdating) {
      console.log('Price update already in progress, skipping...');
      return;
    }

    this.isUpdating = true;
    console.log('Starting scheduled price update...');

    try {
      await scraperService.initialize();
      const products = await dbService.getAllProducts();
      
      console.log(`Updating prices for ${products.length} products...`);
      
      let updated = 0;
      let skipped = 0;
      let errors = 0;

      for (const product of products) {
        try {
          console.log(`Processing ${product.asin} (${product.description})...`);
          
          const scrapedData = await scraperService.scrapeProduct(product.asin);
          const lastPrice = await dbService.getLastPrice(product.id);
          
          // Update categories if they have changed or were missing
          if (scrapedData.categories && scrapedData.categories.length > 0) {
            const currentCategories = product.categories || [];
            const currentCategoryNames = currentCategories.map(c => c.name).join(' > ');
            const newCategoryNames = scrapedData.categories.join(' > ');
            
            if (currentCategoryNames !== newCategoryNames) {
              await dbService.setProductCategories(product.id, scrapedData.categories);
              console.log(`  ✓ Categories updated: "${newCategoryNames}"`);
            }
          }
          
          if (lastPrice === null || scrapedData.price < lastPrice) {
            await dbService.addPriceHistory(product.id, scrapedData.price);
            console.log(`  ✓ Price updated: ${scrapedData.price} (previous: ${lastPrice || 'N/A'})`);
            updated++;
          } else {
            console.log(`  - Price unchanged or increased: ${scrapedData.price} (previous: ${lastPrice})`);
            skipped++;
          }
          
          // Small delay between products
          await new Promise(resolve => setTimeout(resolve, 2000));
        } catch (error) {
          console.error(`  ✗ Error updating ${product.asin}:`, error);
          errors++;
        }
      }

      console.log(`Price update completed: ${updated} updated, ${skipped} skipped, ${errors} errors`);
    } catch (error) {
      console.error('Error during scheduled price update:', error);
    } finally {
      this.isUpdating = false;
      await scraperService.close();
    }
  }

  isRunning(): boolean {
    return this.cronJob !== null;
  }
}

// Singleton instance
export const schedulerService = new SchedulerService();

