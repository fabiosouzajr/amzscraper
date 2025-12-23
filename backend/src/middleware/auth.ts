import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { dbService } from '../services/database';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

export interface AuthRequest extends Request {
  userId?: number;
  user?: { id: number; username: string };
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
      const decoded = jwt.verify(token, JWT_SECRET) as { userId: number; username: string };
      const user = await dbService.getUserById(decoded.userId);
      
      if (!user) {
        res.status(401).json({ error: 'Invalid token' });
        return;
      }

      req.userId = user.id;
      req.user = { id: user.id, username: user.username };
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

export const generateToken = (userId: number, username: string): string => {
  return jwt.sign({ userId, username }, JWT_SECRET, { expiresIn: '7d' });
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
      const decoded = jwt.verify(token, JWT_SECRET) as { userId: number; username: string };
      const user = await dbService.getUserById(decoded.userId);
      
      if (user) {
        req.userId = user.id;
        req.user = { id: user.id, username: user.username };
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

