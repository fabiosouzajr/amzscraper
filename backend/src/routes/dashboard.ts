import { Router, Request, Response } from 'express';
import { dbService } from '../services/database';
import { AuthRequest, authenticate } from '../middleware/auth';

const router = Router();

// All dashboard routes require authentication
router.use(authenticate);

// GET /api/dashboard/drops - Get biggest price drops
router.get('/drops', async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    if (!authReq.userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const limit = parseInt(req.query.limit as string) || 10;
    const drops = await dbService.getBiggestPriceDrops(authReq.userId, limit);
    res.json(drops);
  } catch (error) {
    console.error('Error fetching price drops:', error);
    res.status(500).json({ error: 'Failed to fetch price drops' });
  }
});

// GET /api/dashboard/increases - Get biggest price increases
router.get('/increases', async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    if (!authReq.userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const limit = parseInt(req.query.limit as string) || 10;
    const increases = await dbService.getBiggestPriceIncreases(authReq.userId, limit);
    res.json(increases);
  } catch (error) {
    console.error('Error fetching price increases:', error);
    res.status(500).json({ error: 'Failed to fetch price increases' });
  }
});

export default router;

