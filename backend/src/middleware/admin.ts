import { Response, NextFunction } from 'express';
import { AuthRequest, authenticate } from './auth';

export const requireAdmin = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  // First authenticate
  await authenticate(req, res, async () => {
    // Check if user has admin role
    if (!req.user || req.user.role !== 'ADMIN') {
      res.status(403).json({ error: 'Admin access required' });
      return;
    }
    next();
  });
};
