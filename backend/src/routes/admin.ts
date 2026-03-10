import { Router, Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { requireAdmin } from '../middleware/admin';
import { dbService } from '../services/database';
import bcrypt from 'bcrypt';
import { validateUsername, validatePassword, validateIntegerId } from '../utils/validation';
import rateLimit from 'express-rate-limit';

// Rate limiting for admin endpoints
const adminRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each admin to 100 requests per 15 minutes
  message: { error: 'Too many requests from this admin account, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

const router = Router();

// Apply rate limiting to all admin routes
router.use(adminRateLimit);

// All routes require admin authentication
router.use(requireAdmin);

// Helper function to ensure req.user is set after requireAdmin middleware
const ensureAuthenticated = (req: AuthRequest, res: Response): number => {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    throw new Error('Authentication required');
  }
  return req.user.id;
};

// GET /api/admin/users - List all users
router.get('/users', async (req: AuthRequest, res: Response): Promise<void | Response> => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;
    const search = req.query.search as string;

    let users = await dbService.getAllUsers();

    // Filter by search term if provided
    if (search) {
      const searchLower = search.toLowerCase();
      users = users.filter(u => u.username.toLowerCase().includes(searchLower));
    }

    // Apply pagination
    const paginatedUsers = users.slice(offset, offset + limit);

    res.json({
      users: paginatedUsers,
      total: users.length,
      limit,
      offset
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// GET /api/admin/users/:id - Get user details with stats
router.get('/users/:id', async (req: AuthRequest, res: Response): Promise<void | Response> => {
  try {
    const userId = parseInt(req.params.id);
    const user = await dbService.getUserById(userId);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get user stats
    const stats = await dbService.getUserStats(userId);

    res.json({
      ...user,
      ...stats
    });
  } catch (error) {
    console.error('Error fetching user details:', error);
    res.status(500).json({ error: 'Failed to fetch user details' });
  }
});

// POST /api/admin/users - Create new user
router.post('/users', async (req: AuthRequest, res: Response): Promise<void | Response> => {
  try {
    const { username, password, role } = req.body;

    // Validate input using validation utilities
    if (!validateUsername(username)) {
      return res.status(400).json({ error: 'Username must be 3-30 characters and contain only alphanumeric, underscore, or dash' });
    }

    if (!validatePassword(password)) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    if (role && !['USER', 'ADMIN'].includes(role.toUpperCase())) {
      return res.status(400).json({ error: 'Role must be either USER or ADMIN' });
    }

    // Check if user already exists
    const existing = await dbService.getUserByUsername(username);
    if (existing) {
      return res.status(409).json({ error: 'Username already exists' });
    }

    // Create user with specified role (default to USER)
    const user = await dbService.createUserWithRole(username, password, role?.toUpperCase() || 'USER');

    // Log audit
    const adminUserId = ensureAuthenticated(req, res);
    await dbService.logAudit(
      adminUserId,
      'CREATE_USER',
      'USER',
      user.id,
      `Created user ${username} with role ${role?.toUpperCase() || 'USER'}`
    );

    res.status(201).json(user);
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// PATCH /api/admin/users/:id/disable - Disable user
router.patch('/users/:id/disable', async (req: AuthRequest, res: Response): Promise<void | Response> => {
  try {
    const userId = parseInt(req.params.id);

    const adminUserId = ensureAuthenticated(req, res);

    if (userId === adminUserId) {
      return res.status(400).json({ error: 'Cannot disable your own account' });
    }

    const success = await dbService.disableUser(userId);

    if (!success) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = await dbService.getUserById(userId);

    // Log audit
    await dbService.logAudit(
      adminUserId,
      'DISABLE_USER',
      'USER',
      userId,
      `Disabled user ${user?.username}`
    );

    res.json({ message: 'User disabled successfully' });
  } catch (error) {
    console.error('Error disabling user:', error);
    res.status(500).json({ error: 'Failed to disable user' });
  }
});

// PATCH /api/admin/users/:id/enable - Enable user
router.patch('/users/:id/enable', async (req: AuthRequest, res: Response): Promise<void | Response> => {
  try {
    const userId = parseInt(req.params.id);
    const success = await dbService.enableUser(userId);

    if (!success) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = await dbService.getUserById(userId);

    // Log audit
    const adminUserId = ensureAuthenticated(req, res);
    await dbService.logAudit(
      adminUserId,
      'ENABLE_USER',
      'USER',
      userId,
      `Enabled user ${user?.username}`
    );

    res.json({ message: 'User enabled successfully' });
  } catch (error) {
    console.error('Error enabling user:', error);
    res.status(500).json({ error: 'Failed to enable user' });
  }
});

// POST /api/admin/users/:id/reset-password - Reset user password
router.post('/users/:id/reset-password', async (req: AuthRequest, res: Response): Promise<void | Response> => {
  try {
    const userId = parseInt(req.params.id);
    const { newPassword } = req.body;

    if (!newPassword) {
      return res.status(400).json({ error: 'New password is required' });
    }

    if (!validateIntegerId(userId)) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }

    if (!validatePassword(newPassword)) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const success = await dbService.updateUserPassword(userId, newPassword);

    if (!success) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = await dbService.getUserById(userId);

    // Log audit
    const adminUserId = ensureAuthenticated(req, res);
    await dbService.logAudit(
      adminUserId,
      'RESET_PASSWORD',
      'USER',
      userId,
      `Reset password for user ${user?.username}`
    );

    res.json({ message: 'Password reset successfully' });
  } catch (error) {
    console.error('Error resetting password:', error);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

// GET /api/admin/stats - System-wide statistics
router.get('/stats', async (req: AuthRequest, res: Response): Promise<void | Response> => {
  try {
    const stats = await dbService.getSystemStats();
    res.json(stats);
  } catch (error) {
    console.error('Error fetching system stats:', error);
    res.status(500).json({ error: 'Failed to fetch system stats' });
  }
});

// GET /api/admin/config - System configuration
router.get('/config', async (req: AuthRequest, res: Response): Promise<void | Response> => {
  try {
    const config = await dbService.getAllConfig();
    res.json(config);
  } catch (error) {
    console.error('Error fetching config:', error);
    res.status(500).json({ error: 'Failed to fetch config' });
  }
});

// PUT /api/admin/config/:key - Update system configuration
router.put('/config/:key', async (req: AuthRequest, res: Response): Promise<void | Response> => {
  try {
    const key = req.params.key;
    const { value } = req.body;

    if (!value) {
      return res.status(400).json({ error: 'Value is required' });
    }

    const adminUserId = ensureAuthenticated(req, res);
    const success = await dbService.setConfig(key, value, adminUserId);

    if (!success) {
      return res.status(404).json({ error: 'Config key not found' });
    }

    // Log audit
    await dbService.logAudit(
      adminUserId,
      'UPDATE_CONFIG',
      'CONFIG',
      0,
      `Updated config ${key} to ${value}`
    );

    res.json({ message: 'Config updated successfully' });
  } catch (error) {
    console.error('Error updating config:', error);
    res.status(500).json({ error: 'Failed to update config' });
  }
});

// GET /api/admin/audit - Audit logs
router.get('/audit', async (req: AuthRequest, res: Response): Promise<void | Response> => {
  try {
    const limit = parseInt(req.query.limit as string) || 100;
    const offset = parseInt(req.query.offset as string) || 0;
    const targetType = req.query.target_type as string;
    const adminUserId = req.query.admin_user_id ? parseInt(req.query.admin_user_id as string) : undefined;

    const logs = await dbService.getAuditLogs(limit, offset, targetType, adminUserId);
    res.json(logs);
  } catch (error) {
    console.error('Error fetching audit logs:', error);
    res.status(500).json({ error: 'Failed to fetch audit logs' });
  }
});

export default router;
