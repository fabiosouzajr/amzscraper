// Test that middleware exports work correctly
import { requireAdmin, authenticate, generateToken } from '../src/middleware';
import { AuthRequest } from '../src/middleware/auth';

// This file is just to verify imports work - it won't be executed
// If this compiles without errors, the exports are correct

console.log('Middleware imports verified successfully');

// Type checks - these should compile without errors
const middlewareTypeCheck: {
  requireAdmin: typeof requireAdmin;
  authenticate: typeof authenticate;
  generateToken: typeof generateToken;
} = {
  requireAdmin,
  authenticate,
  generateToken
};

// AuthRequest type check
const requestTypeCheck: AuthRequest = {
  userId: 1,
  user: {
    id: 1,
    username: 'admin',
    role: 'ADMIN',
    is_disabled: false,
    created_at: new Date().toISOString()
  }
};

console.log('Type checks passed');
