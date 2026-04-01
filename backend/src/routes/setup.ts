import { Router, Request, Response } from 'express';
import { dbService } from '../services/database';
import { generateToken } from '../middleware/auth';
import rateLimit from 'express-rate-limit';

const router = Router();

// Rate limit setup endpoints: 5 requests per minute per IP
const setupLimiter = rateLimit({
  windowMs: 60_000,
  max: 5,
  message: { error: 'Too many setup attempts. Please wait.' },
});

// GET /api/setup/status - Check if initial setup is needed
router.get('/status', async (req: Request, res: Response) => {
  try {
    const stats = await dbService.getSystemStats();
    const totalAdmins = stats.total_admins ?? 0;

    // Also check registration policy for the auth UI
    // getConfig returns string | null
    const registrationConfigValue = await dbService.getConfig('registration_enabled');
    const registrationEnabled = registrationConfigValue !== 'false';

    res.json({
      needsSetup: totalAdmins === 0,
      registrationEnabled,
    });
  } catch (error) {
    console.error('Error checking setup status:', error);
    res.status(500).json({ error: 'Failed to check setup status' });
  }
});

// POST /api/setup/admin - Create the initial admin user (only works when no admin exists)
router.post('/admin', setupLimiter, async (req: Request, res: Response) => {
  try {
    // Gate: only allowed when no admin exists
    const stats = await dbService.getSystemStats();
    if ((stats.total_admins ?? 0) > 0) {
      return res.status(403).json({ error: 'Setup already complete. An admin user already exists.' });
    }

    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    if (typeof username !== 'string' || username.length < 3 || username.length > 30) {
      return res.status(400).json({ error: 'Username must be between 3 and 30 characters' });
    }

    if (typeof password !== 'string' || password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    // Check if username is taken (edge case: a USER with this name already exists)
    const existing = await dbService.getUserByUsername(username);
    if (existing) {
      // Promote existing user to admin
      await dbService.setUserRole(existing.id, 'ADMIN');
      const promotedUser = { ...existing, role: 'ADMIN' as const };
      const token = generateToken(promotedUser);
      await dbService.logAudit(existing.id, 'SETUP_ADMIN', 'user', existing.id,
        'Existing user promoted to admin via setup wizard');
      return res.status(200).json({
        user: { id: existing.id, username: existing.username, role: 'ADMIN' },
        token,
      });
    }

    // Create new admin user
    const user = await dbService.createAdminUser(username, password);
    const token = generateToken(user);

    await dbService.logAudit(user.id, 'SETUP_ADMIN', 'user', user.id,
      'Initial admin created via setup wizard');

    res.status(201).json({
      user: { id: user.id, username: user.username, role: user.role },
      token,
    });
  } catch (error) {
    console.error('Error during admin setup:', error);
    res.status(500).json({ error: 'Failed to create admin user' });
  }
});

export default router;
