import { Router, Request, Response } from 'express';
import { dbService } from '../services/database';

const router = Router();

// GET /api/dashboard/drops - Get biggest price drops
router.get('/drops', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 10;
    const drops = await dbService.getBiggestPriceDrops(limit);
    res.json(drops);
  } catch (error) {
    console.error('Error fetching price drops:', error);
    res.status(500).json({ error: 'Failed to fetch price drops' });
  }
});

export default router;

