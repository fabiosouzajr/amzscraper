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

  async updateUserPrices(
    userId: number, 
    onProgress?: (progress: {
      status: string;
      progress?: number;
      current?: number;
      total?: number;
      currentProduct?: string;
      updated?: number;
      skipped?: number;
      errors?: number;
    }) => void
  ): Promise<void> {
    if (this.isUpdating) {
      const message = 'Price update already in progress, skipping...';
      console.log(message);
      onProgress?.({ status: 'skipped', error: message });
      return;
    }

    this.isUpdating = true;
    
    try {
      const user = await dbService.getUserById(userId);
      if (!user) {
        const error = `User with ID ${userId} not found`;
        console.error(error);
        onProgress?.({ status: 'error', error });
        return;
      }

      const message = `Starting price update for user: ${user.username} (ID: ${userId})`;
      console.log(message);
      onProgress?.({ status: 'starting', progress: 0 });
      
      await scraperService.initialize();
      onProgress?.({ status: 'initialized', progress: 5 });
      
      const products = await dbService.getAllProducts(userId);
      const totalProducts = products.length;
      console.log(`Found ${totalProducts} product(s) for user ${user.username}`);
      onProgress?.({ 
        status: 'processing', 
        progress: 10, 
        total: totalProducts,
        current: 0 
      });
      
      let updated = 0;
      let skipped = 0;
      let errors = 0;

      for (let i = 0; i < products.length; i++) {
        const product = products[i];
        const current = i + 1;
        const progress = Math.min(10 + Math.floor((current / totalProducts) * 85), 95);
        
        try {
          const logMessage = `Processing ${product.asin} (${product.description})...`;
          console.log(logMessage);
          onProgress?.({ 
            status: 'processing', 
            progress,
            current,
            total: totalProducts,
            currentProduct: product.description,
            updated,
            skipped,
            errors
          });
          
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

          // Check if product is unavailable
          if (!scrapedData.available) {
            await dbService.addPriceHistory(product.id, null, false, scrapedData.unavailableReason);
            console.log(`  ⚠ Product unavailable: ${scrapedData.unavailableReason}`);
            updated++;
          } else if (lastPrice === null || scrapedData.price !== lastPrice) {
            await dbService.addPriceHistory(product.id, scrapedData.price, true);
            if (lastPrice === null) {
              console.log(`  ✓ Price recorded: R$ ${scrapedData.price?.toFixed(2)} (first price)`);
            } else if (scrapedData.price && lastPrice && scrapedData.price < lastPrice) {
              console.log(`  ✓ Price dropped: R$ ${scrapedData.price.toFixed(2)} (previous: R$ ${lastPrice.toFixed(2)})`);
            } else if (scrapedData.price && lastPrice) {
              console.log(`  ✓ Price increased: R$ ${scrapedData.price.toFixed(2)} (previous: R$ ${lastPrice.toFixed(2)})`);
            }
            updated++;
          } else {
            console.log(`  - Price unchanged: R$ ${scrapedData.price?.toFixed(2)}`);
            skipped++;
          }
          
          // Small delay between products
          await new Promise(resolve => setTimeout(resolve, 2000));
        } catch (error) {
          console.error(`  ✗ Error updating ${product.asin}:`, error);
          errors++;
        }
      }

      const completionMessage = `Price update completed for user ${user.username}: ${updated} updated, ${skipped} skipped, ${errors} errors`;
      console.log(completionMessage);
      onProgress?.({ 
        status: 'completed', 
        progress: 100,
        total: totalProducts,
        current: totalProducts,
        updated,
        skipped,
        errors
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('Error during price update:', error);
      onProgress?.({ status: 'error', error: errorMessage });
    } finally {
      this.isUpdating = false;
      await scraperService.close();
    }
  }

  async updateAllPrices(): Promise<void> {
    if (this.isUpdating) {
      console.log('Price update already in progress, skipping...');
      return;
    }

    this.isUpdating = true;
    console.log('Starting scheduled price update for all users...');

    try {
      await scraperService.initialize();
      
      // Get all users and update prices for each user's products
      const users = await dbService.getAllUsers();
      console.log(`Found ${users.length} user(s) to update prices for`);
      
      let totalUpdated = 0;
      let totalSkipped = 0;
      let totalErrors = 0;

      for (const user of users) {
        console.log(`Processing products for user: ${user.username} (ID: ${user.id})`);
        const products = await dbService.getAllProducts(user.id);
        console.log(`  Found ${products.length} product(s) for user ${user.username}`);
        
        let updated = 0;
        let skipped = 0;
        let errors = 0;

        for (const product of products) {
          try {
            console.log(`  Processing ${product.asin} (${product.description})...`);
            
            const scrapedData = await scraperService.scrapeProduct(product.asin);
            const lastPrice = await dbService.getLastPrice(product.id);

            // Update categories if they have changed or were missing
            if (scrapedData.categories && scrapedData.categories.length > 0) {
              const currentCategories = product.categories || [];
              const currentCategoryNames = currentCategories.map(c => c.name).join(' > ');
              const newCategoryNames = scrapedData.categories.join(' > ');

              if (currentCategoryNames !== newCategoryNames) {
                await dbService.setProductCategories(product.id, scrapedData.categories);
                console.log(`    ✓ Categories updated: "${newCategoryNames}"`);
              }
            }

            // Check if product is unavailable
            if (!scrapedData.available) {
              await dbService.addPriceHistory(product.id, null, false, scrapedData.unavailableReason);
              console.log(`    ⚠ Product unavailable: ${scrapedData.unavailableReason}`);
              updated++;
            } else if (lastPrice === null || scrapedData.price !== lastPrice) {
              await dbService.addPriceHistory(product.id, scrapedData.price, true);
              if (lastPrice === null) {
                console.log(`    ✓ Price recorded: R$ ${scrapedData.price?.toFixed(2)} (first price)`);
              } else if (scrapedData.price && lastPrice && scrapedData.price < lastPrice) {
                console.log(`    ✓ Price dropped: R$ ${scrapedData.price.toFixed(2)} (previous: R$ ${lastPrice.toFixed(2)})`);
              } else if (scrapedData.price && lastPrice) {
                console.log(`    ✓ Price increased: R$ ${scrapedData.price.toFixed(2)} (previous: R$ ${lastPrice.toFixed(2)})`);
              }
              updated++;
            } else {
              console.log(`    - Price unchanged: R$ ${scrapedData.price?.toFixed(2)}`);
              skipped++;
            }
            
            // Small delay between products
            await new Promise(resolve => setTimeout(resolve, 2000));
          } catch (error) {
            console.error(`    ✗ Error updating ${product.asin}:`, error);
            errors++;
          }
        }

        console.log(`  User ${user.username}: ${updated} updated, ${skipped} skipped, ${errors} errors`);
        totalUpdated += updated;
        totalSkipped += skipped;
        totalErrors += errors;
      }

      console.log(`Price update completed: ${totalUpdated} updated, ${totalSkipped} skipped, ${totalErrors} errors`);
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

