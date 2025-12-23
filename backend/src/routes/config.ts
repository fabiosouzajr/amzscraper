import { Router, Request, Response } from 'express';
import { dbService } from '../services/database';
import { scraperService } from '../services/scraper';
import { validateASIN, normalizeASIN } from '../utils/validation';
import { AuthRequest, authenticate } from '../middleware/auth';
import * as fs from 'fs';

const router = Router();

// All config routes require authentication
router.use(authenticate);

// GET /api/config/export-asins - Export all ASINs as CSV
router.get('/export-asins', async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    if (!authReq.userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const products = await dbService.getAllProducts(authReq.userId);
    
    // Create CSV content with only ASINs (no header)
    const csvContent = products.map(product => product.asin || '').join('\n');
    
    // Set headers for CSV download
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="amazon-tracked-asins-${new Date().toISOString().split('T')[0]}.csv"`);
    res.send(csvContent);
  } catch (error) {
    console.error('Error exporting ASINs:', error);
    res.status(500).json({ error: 'Failed to export ASINs' });
  }
});

// POST /api/config/import-asins - Import ASINs from CSV file
router.post('/import-asins', async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    if (!authReq.userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const { csvContent } = req.body;
    
    if (!csvContent || typeof csvContent !== 'string') {
      return res.status(400).json({ error: 'CSV content is required' });
    }

    // Parse CSV - split by newlines and filter empty lines
    const lines = csvContent.split(/\r?\n/).map(line => line.trim()).filter(line => line.length > 0);
    
    if (lines.length === 0) {
      return res.status(400).json({ error: 'CSV file is empty or contains no valid ASINs' });
    }

    // Remove header if it exists (check if first line is "ASIN" or similar)
    const firstLine = lines[0].toUpperCase();
    const asins = firstLine === 'ASIN' ? lines.slice(1) : lines;

    if (asins.length === 0) {
      return res.status(400).json({ error: 'No ASINs found in CSV file' });
    }

    // Set up Server-Sent Events for progress updates
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

    // Send initial progress
    const sendProgress = (progress: {
      current: number;
      total: number;
      currentASIN?: string;
      status: string;
      success: number;
      failed: number;
      skipped: number;
    }) => {
      res.write(`data: ${JSON.stringify(progress)}\n\n`);
    };

    // Initialize scraper once
    await scraperService.initialize();

    const results = {
      total: asins.length,
      success: 0,
      failed: 0,
      skipped: 0,
      errors: [] as Array<{ asin: string; error: string }>
    };

    // Send initial status
    sendProgress({
      current: 0,
      total: asins.length,
      status: 'starting',
      success: 0,
      failed: 0,
      skipped: 0
    });

    // Process each ASIN
    for (let i = 0; i < asins.length; i++) {
      const asinLine = asins[i];
      // Extract ASIN from line (in case CSV has multiple columns, take first one)
      const asinParts = asinLine.split(',');
      const rawAsin = asinParts[0].trim();
      
      // Send progress update
      sendProgress({
        current: i + 1,
        total: asins.length,
        currentASIN: rawAsin,
        status: 'processing',
        success: results.success,
        failed: results.failed,
        skipped: results.skipped
      });
      
      if (!rawAsin) {
        results.failed++;
        results.errors.push({ asin: rawAsin, error: 'Empty ASIN' });
        continue;
      }

      try {
        const normalizedASIN = normalizeASIN(rawAsin);
        
        if (!validateASIN(normalizedASIN)) {
          results.failed++;
          results.errors.push({ asin: rawAsin, error: 'Invalid ASIN format' });
          continue;
        }

        // Check if product already exists for this user
        const existing = await dbService.getProductByASIN(authReq.userId, normalizedASIN);
        if (existing) {
          results.skipped++;
          continue;
        }

        // Scrape product data
        const scrapedData = await scraperService.scrapeProduct(normalizedASIN);

        // Save product with categories for this user
        const product = await dbService.addProduct(authReq.userId, normalizedASIN, scrapedData.description, scrapedData.categories);
        
        // Save initial price
        await dbService.addPriceHistory(product.id, scrapedData.price);

        results.success++;

        // Small delay between products to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (error) {
        results.failed++;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`Error processing ASIN ${rawAsin}:`, error);
        results.errors.push({ 
          asin: rawAsin, 
          error: errorMessage
        });
        // Continue with next ASIN even if one fails
      }
    }

    // Send final results
    sendProgress({
      current: asins.length,
      total: asins.length,
      status: 'completed',
      success: results.success,
      failed: results.failed,
      skipped: results.skipped
    });

    res.end();
  } catch (error) {
    console.error('Error importing ASINs:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    // Send error via SSE if connection is still open
    if (!res.headersSent) {
      res.status(500).json({ error: `Failed to import ASINs: ${errorMessage}` });
    } else {
      res.write(`data: ${JSON.stringify({ status: 'error', error: errorMessage })}\n\n`);
      res.end();
    }
  }
});

// GET /api/config/database-info - Get database information
router.get('/database-info', async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    if (!authReq.userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const productCount = await dbService.getProductCount(authReq.userId);
    const dbPath = dbService.getDatabasePath();
    
    // Get database file size
    let dbSize = 0;
    try {
      const stats = fs.statSync(dbPath);
      dbSize = stats.size;
    } catch (error) {
      console.error('Error getting database file size:', error);
    }

    // Format file size
    const formatBytes = (bytes: number): string => {
      if (bytes === 0) return '0 Bytes';
      const k = 1024;
      const sizes = ['Bytes', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
    };

    res.json({
      productCount,
      databaseSize: dbSize,
      databaseSizeFormatted: formatBytes(dbSize)
    });
  } catch (error) {
    console.error('Error fetching database info:', error);
    res.status(500).json({ error: 'Failed to fetch database information' });
  }
});

// GET /api/config/export-database - Export the entire database
router.get('/export-database', async (req: Request, res: Response) => {
  try {
    const dbPath = dbService.getDatabasePath();
    
    // Check if database file exists
    if (!fs.existsSync(dbPath)) {
      return res.status(404).json({ error: 'Database file not found' });
    }

    // Read database file
    const dbBuffer = fs.readFileSync(dbPath);
    const filename = `products-database-${new Date().toISOString().split('T')[0]}.db`;

    // Set headers for file download
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', dbBuffer.length.toString());
    
    res.send(dbBuffer);
  } catch (error) {
    console.error('Error exporting database:', error);
    res.status(500).json({ error: 'Failed to export database' });
  }
});

export default router;
