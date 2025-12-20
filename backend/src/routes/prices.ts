import { Router, Request, Response } from 'express';
import { dbService } from '../services/database';
import { scraperService } from '../services/scraper';
import { schedulerService } from '../services/scheduler';

const router = Router();

// POST /api/prices/update - Manual price update trigger
router.post('/update', async (req: Request, res: Response) => {
  try {
    console.log('Manual price update triggered');
    
    // Run update in background
    schedulerService.updateAllPrices().catch(error => {
      console.error('Error in background price update:', error);
    });

    res.json({ message: 'Price update started' });
  } catch (error) {
    console.error('Error triggering price update:', error);
    res.status(500).json({ error: 'Failed to trigger price update' });
  }
});

export default router;

