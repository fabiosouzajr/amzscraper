import { Router, Response } from 'express';
import { AuthRequest, authenticate } from '../middleware/auth';
import { dbService } from '../services/database';
import { notificationChannelService } from '../services/notification-channel';

const router = Router();

// All routes require authentication
router.use(authenticate);

// ---------------------------------------------------------------------------
// Helper function to ensure req.user is set
// ---------------------------------------------------------------------------

const ensureAuthenticated = (req: AuthRequest, res: Response): number => {
  if (!req.user || !req.userId) {
    res.status(401).json({ error: 'Authentication required' });
    throw new Error('Authentication required');
  }
  return req.userId;
};

// ---------------------------------------------------------------------------
// Notification Channels CRUD
// ---------------------------------------------------------------------------

// GET /api/notifications/channels - List user's channels
router.get('/channels', async (req: AuthRequest, res: Response): Promise<void | Response> => {
  try {
    const userId = ensureAuthenticated(req, res);
    const channels = await dbService.getNotificationChannels(userId);
    res.json(channels);
  } catch (error) {
    console.error('Error fetching notification channels:', error);
    res.status(500).json({ error: 'Failed to fetch notification channels' });
  }
});

// POST /api/notifications/channels - Create new channel
router.post('/channels', async (req: AuthRequest, res: Response): Promise<void | Response> => {
  try {
    const userId = ensureAuthenticated(req, res);
    const { type, name, config } = req.body;

    if (!type || !name || !config) {
      return res.status(400).json({ error: 'Type, name, and config are required' });
    }

    if (
!['email', 'telegram', 'discord'].includes(type)
) {
      return res.status(400).json({ error: 'Type must be email, telegram, or discord' });
    }

    // Check quota
    const quota = await dbService.checkChannelQuota(userId);
    if (!quota.allowed) {
      return res.status(429).json({
        error: `Channel quota exceeded. You have ${quota.current}/${quota.max} channels.`,
      });
    }

    const channel = await dbService.createNotificationChannel(userId, {
      type,
      name,
      config: typeof config === 'string' ? config : JSON.stringify(config),
    });

    res.status(201).json(channel);
  } catch (error) {
    console.error('Error creating notification channel:', error);
    res.status(500).json({ error: 'Failed to create notification channel' });
  }
});

// PUT /api/notifications/channels/:id - Update channel
router.put('/channels/:id', async (req: AuthRequest, res: Response): Promise<void | Response> => {
  try {
    const userId = ensureAuthenticated(req, res);
    const channelId = parseInt(req.params.id);
    const { name, config, enabled } = req.body;

    const updates: { name?: string; config?: string; enabled?: boolean } = {};
    if (name !== undefined) updates.name = name;
    if (config !== undefined) updates.config = typeof config === 'string' ? config : JSON.stringify(config);
    if (enabled !== undefined) updates.enabled = enabled;

    const channel = await dbService.updateNotificationChannel(userId, channelId, updates);
    res.json(channel);
  } catch (error) {
    console.error('Error updating notification channel:', error);
    res.status(500).json({ error: 'Failed to update notification channel' });
  }
});

// DELETE /api/notifications/channels/:id - Delete channel
router.delete('/channels/:id', async (req: AuthRequest, res: Response): Promise<void | Response> => {
  try {
    const userId = ensureAuthenticated(req, res);
    const channelId = parseInt(req.params.id);
    await dbService.deleteNotificationChannel(userId, channelId);
    res.json({ message: 'Channel deleted successfully' });
  } catch (error) {
    console.error('Error deleting notification channel:', error);
    res.status(500).json({ error: 'Failed to delete notification channel' });
  }
});

// POST /api/notifications/channels/:id/test - Test channel
router.post('/channels/:id/test', async (req: AuthRequest, res: Response): Promise<void | Response> => {
  try {
    const userId = ensureAuthenticated(req, res);
    const channelId = parseInt(req.params.id);

    const channel = await dbService.getNotificationChannel(userId, channelId);
    if (!channel) {
      return res.status(404).json({ error: 'Channel not found' });
    }

    const result = await notificationChannelService.testChannel(channel);
    res.json(result);
  } catch (error) {
    console.error('Error testing notification channel:', error);
    res.status(500).json({ error: 'Failed to test notification channel' });
  }
});

// ---------------------------------------------------------------------------
// Notification Rules CRUD
// ---------------------------------------------------------------------------

// GET /api/notifications/rules - List notification rules
router.get('/rules', async (req: AuthRequest, res: Response): Promise<void | Response> => {
  try {
    const userId = ensureAuthenticated(req, res);
    const productId = req.query.productId ? parseInt(req.query.productId as string) : undefined;
    const rules = await dbService.getNotificationRules(userId, productId);
    res.json(rules);
  } catch (error) {
    console.error('Error fetching notification rules:', error);
    res.status(500).json({ error: 'Failed to fetch notification rules' });
  }
});

// POST /api/notifications/rules - Create new rule
router.post('/rules', async (req: AuthRequest, res: Response): Promise<void | Response> => {
  try {
    const userId = ensureAuthenticated(req, res);
    const { product_id, channel_id, type, params } = req.body;

    if (!channel_id || !type || !params) {
      return res.status(400).json({ error: 'Channel, type, and params are required' });
    }

    if (
!['lowest_in_days', 'below_threshold', 'percentage_drop'].includes(type)
) {
      return res.status(400).json({ error: 'Type must be lowest_in_days, below_threshold, or percentage_drop' });
    }

    // Check quota
    const quota = await dbService.checkRuleQuota(userId);
    if (!quota.allowed) {
      return res.status(429).json({
        error: `Rule quota exceeded. You have ${quota.current}/${quota.max} rules.`,
      });
    }

    const rule = await dbService.createNotificationRule(userId, {
      product_id: product_id ?? null,
      channel_id,
      type,
      params: typeof params === 'string' ? params : JSON.stringify(params),
    });

    res.status(201).json(rule);
  } catch (error) {
    console.error('Error creating notification rule:', error);
    res.status(500).json({ error: 'Failed to create notification rule' });
  }
});

// PUT /api/notifications/rules/:id - Update rule
router.put('/rules/:id', async (req: AuthRequest, res: Response): Promise<void | Response> => {
  try {
    const userId = ensureAuthenticated(req, res);
    const ruleId = parseInt(req.params.id);
    const { channel_id, type, params, enabled } = req.body;

    const updates: { channel_id?: number; type?: string; params?: string; enabled?: boolean } = {};
    if (channel_id !== undefined) updates.channel_id = channel_id;
    if (type !== undefined) updates.type = type;
    if (params !== undefined) updates.params = typeof params === 'string' ? params : JSON.stringify(params);
    if (enabled !== undefined) updates.enabled = enabled;

    const rule = await dbService.updateNotificationRule(userId, ruleId, updates);
    res.json(rule);
  } catch (error) {
    console.error('Error updating notification rule:', error);
    res.status(500).json({ error: 'Failed to update notification rule' });
  }
});

// DELETE /api/notifications/rules/:id - Delete rule
router.delete('/rules/:id', async (req: AuthRequest, res: Response): Promise<void | Response> => {
  try {
    const userId = ensureAuthenticated(req, res);
    const ruleId = parseInt(req.params.id);
    await dbService.deleteNotificationRule(userId, ruleId);
    res.json({ message: 'Rule deleted successfully' });
  } catch (error) {
    console.error('Error deleting notification rule:', error);
    res.status(500).json({ error: 'Failed to delete notification rule' });
  }
});

// ---------------------------------------------------------------------------
// Notification History
// ---------------------------------------------------------------------------

// GET /api/notifications/history - Get notification history
router.get('/history', async (req: AuthRequest, res: Response): Promise<void | Response> => {
  try {
    const userId = ensureAuthenticated(req, res);
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;
    const history = await dbService.getNotificationHistory(userId, limit, offset);
    res.json(history);
  } catch (error) {
    console.error('Error fetching notification history:', error);
    res.status(500).json({ error: 'Failed to fetch notification history' });
  }
});

export default router;
