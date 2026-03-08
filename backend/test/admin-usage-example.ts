// Example of how to use requireAdmin middleware in routes
// This file demonstrates the proper usage pattern

import { Router } from 'express';
import { requireAdmin, authenticate } from '../src/middleware';
import { AuthRequest } from '../src/middleware/auth';

const router = Router();

// Example 1: Admin route that requires authentication AND admin role
// IMPORTANT: Since requireAdmin now includes authentication via await authenticate(),
// you can use requireAdmin ALONE on admin routes
router.get('/admin/users', requireAdmin, async (req: AuthRequest, res) => {
  // This endpoint can only be accessed by authenticated admin users
  // req.user is guaranteed to exist and have role === 'ADMIN'
  const adminUser = req.user!; // Safe to use ! because requireAdmin ensures user exists
  res.json({
    message: 'Admin dashboard accessed',
    admin: adminUser.username
  });
});

// Example 2: Applying requireAdmin to specific routes only
router.get('/public-route', async (req: AuthRequest, res) => {
  // This route is accessible to all authenticated users
  // Note: You would apply authenticate middleware at router level or before
  res.json({ message: 'Authenticated user access' });
});

router.get('/admin-route', requireAdmin, async (req: AuthRequest, res) => {
  // This route is admin-only
  // requireAdmin handles BOTH authentication and authorization
  const adminUser = req.user!;
  res.json({
    message: 'Admin-only route accessed',
    admin: adminUser.username
  });
});

// Example 3: Using requireAdmin on multiple routes
const adminRouter = Router();
adminRouter.get('/dashboard', requireAdmin, async (req: AuthRequest, res) => {
  const adminUser = req.user!;
  res.json({
    message: 'Admin dashboard',
    admin: adminUser.username
  });
});

adminRouter.get('/users', requireAdmin, async (req: AuthRequest, res) => {
  const adminUser = req.user!;
  res.json({
    message: 'Admin users management',
    admin: adminUser.username
  });
});

// Example 4: Applying authenticate at router level and requireAdmin on specific routes
const mixedRouter = Router();
mixedRouter.use(authenticate); // All routes require authentication

mixedRouter.get('/profile', async (req: AuthRequest, res) => {
  // All authenticated users can access
  res.json({ message: 'User profile' });
});

mixedRouter.get('/admin/settings', requireAdmin, async (req: AuthRequest, res) => {
  // Only admin users can access
  // Note: authenticate is already applied at router level,
  // and requireAdmin will call authenticate again internally
  const adminUser = req.user!;
  res.json({
    message: 'Admin settings',
    admin: adminUser.username
  });
});

export default router;

/*
SPEC-COMPLIANT USAGE NOTES:
1. requireAdmin now includes authentication via: await authenticate(req, res, async () => { })
2. You can use requireAdmin ALONE on admin routes - it handles both auth and authz
3. Or apply authenticate at router level and requireAdmin on specific admin routes
4. requireAdmin internally calls authenticate, so authentication happens first
5. If authentication fails (401), it's handled by the authenticate call within requireAdmin
6. If user is authenticated but not admin (403), requireAdmin returns "Admin access required"
7. If user is admin, the route handler executes with req.user.role === 'ADMIN'

RECOMMENDED PATTERNS:
Pattern A: Simple admin routes
  router.get('/admin/users', requireAdmin, handler);

Pattern B: Mixed router (auth + admin routes)
  router.use(authenticate);
  router.get('/profile', userHandler);
  router.get('/admin/settings', requireAdmin, adminHandler);

Pattern C: Separate admin router
  const adminRouter = Router();
  adminRouter.get('/dashboard', requireAdmin, adminHandler);
*/