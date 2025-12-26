import { Router, Request, Response } from 'express';
import { dbService } from '../services/database';
import { schedulerService } from '../services/scheduler';
import { AuthRequest, authenticate } from '../middleware/auth';

const router = Router();

// All price routes require authentication
router.use(authenticate);

// POST /api/prices/update - Manual price update trigger (for authenticated user only)
// Uses Server-Sent Events for real-time progress updates
router.post('/update', async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const user = await dbService.getUserById(req.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    console.log(`Manual price update triggered by user: ${user.username} (ID: ${req.userId})`);
    
    // Set up Server-Sent Events for progress updates
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

    // Send progress updates
    const sendProgress = (progress: {
      status: string;
      progress?: number;
      current?: number;
      total?: number;
      currentProduct?: string;
      updated?: number;
      skipped?: number;
      errors?: number;
    }) => {
      res.write(`data: ${JSON.stringify(progress)}\n\n`);
    };

    // Run update with progress callbacks
    schedulerService.updateUserPrices(req.userId, sendProgress)
      .then(() => {
        sendProgress({ status: 'complete' });
        res.end();
      })
      .catch((error) => {
        console.error('Error in price update:', error);
        sendProgress({ 
          status: 'error', 
          error: error instanceof Error ? error.message : 'Unknown error' 
        });
        res.end();
      });
  } catch (error) {
    console.error('Error triggering price update:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to trigger price update' });
    } else {
      res.write(`data: ${JSON.stringify({ status: 'error', error: 'Failed to trigger price update' })}\n\n`);
      res.end();
    }
  }
});

export default router;

