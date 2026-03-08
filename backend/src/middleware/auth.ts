import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { dbService } from '../services/database';
import { User } from '../models/types';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

export interface AuthRequest extends Request {
  userId?: number;
  user?: User;
}

export const authenticate = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const token = authHeader.substring(7);
    
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as { userId: number; username: string; role?: string };
      const user = await dbService.getUserById(decoded.userId);

      if (!user) {
        res.status(401).json({ error: 'Invalid token' });
        return;
      }

      if (user.is_disabled) {
        res.status(403).json({ error: 'Account is disabled' });
        return;
      }

      req.userId = user.id;
      req.user = user;
      next();
    } catch (error) {
      res.status(401).json({ error: 'Invalid token' });
      return;
    }
  } catch (error) {
    res.status(500).json({ error: 'Authentication error' });
    return;
  }
};

export const generateToken = (user: User): string => {
  return jwt.sign(
    { userId: user.id, username: user.username, role: user.role },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
};

// Optional authentication - doesn't fail if no token, but sets user if token is valid
export const optionalAuthenticate = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      // No token provided, continue without authentication
      next();
      return;
    }

    const token = authHeader.substring(7);
    
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as { userId: number; username: string; role?: string };
      const user = await dbService.getUserById(decoded.userId);

      // Only set user if they exist and are not disabled
      if (user && !user.is_disabled) {
        req.userId = user.id;
        req.user = user;
      }
    } catch (error) {
      // Invalid token, continue without authentication
    }
    
    next();
  } catch (error) {
    // Error during authentication, continue without authentication
    next();
  }
};

