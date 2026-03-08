// Simple test to verify middleware exports
import { requireAdmin, authenticate, generateToken } from '../src/middleware';

// If this compiles, the exports are working correctly
const middlewareFunctions = {
  requireAdmin,
  authenticate,
  generateToken
};

console.log('Middleware exports:', Object.keys(middlewareFunctions));
