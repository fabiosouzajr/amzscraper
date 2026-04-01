import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { dbService } from '../services/database';
import { User } from '../models/types';

// Import config lazily to avoid type issues
let configCache: any = null;

function getConfig() {
  if (!configCache) {
    // eslint-disable-next-line global-require
    configCache = require('../config').config;
  }
  return configCache;
}

export interface AuthRequest extends Request {
  userId?: number;
  user?: User;
}

export const authenticate = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const config = getConfig();
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const token = authHeader.substring(7);

    try {
      const decoded = jwt.verify(token, config.jwtSecret) as { userId: number; username: string; role?: string };
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
  const config = getConfig();
  return jwt.sign(
    { userId: user.id, username: user.username, role: user.role },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn }
  );
};

// Optional authentication - doesn't fail if no token, but sets user if token is valid
export const optionalAuthenticate = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const config = getConfig();
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      // No token provided, continue without authentication
      next();
      return;
    }

    const token = authHeader.substring(7);

    try {
      const decoded = jwt.verify(token, config.jwtSecret) as { userId: number; username: string; role?: string };
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

