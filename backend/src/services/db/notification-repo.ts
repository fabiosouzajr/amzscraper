import sqlite3 from 'sqlite3';
import {
  NotificationChannel,
  NotificationChannelWithUser,
  NotificationRule,
  NotificationRuleWithUser,
  NotificationLogEntry,
  NotificationLogEntryWithUser,
  UserRole,
} from '../../models/types';
import { dbRun, dbAll, dbGet } from './helpers';

interface CreateNotificationChannel {
  type: string;
  name: string;
  config: string;
}

interface CreateNotificationRule {
  product_id: number | null;
  channel_id: number;
  type: string;
  params: string;
}

export function createNotificationRepo(
  db: sqlite3.Database,
  getConfig: (key: string) => Promise<string | null>
) {
  const repo = {
    // ---------------------------------------------------------------------------
    // Notification Channels - User Scoped
    // ---------------------------------------------------------------------------

    async getNotificationChannels(userId: number): Promise<NotificationChannel[]> {
      const rows = await dbAll<{
        id: number;
        user_id: number;
        type: string;
        name: string;
        config: string;
        enabled: number;
        created_at: string;
        updated_at: string;
      }>(
        db,
        'SELECT * FROM notification_channels WHERE user_id = ? ORDER BY created_at DESC',
        [userId]
      );
      return rows.map(row => ({
        id: row.id,
        user_id: row.user_id,
        type: row.type as NotificationChannel['type'],
        name: row.name,
        config: JSON.parse(row.config),
        enabled: !!row.enabled,
        created_at: row.created_at,
        updated_at: row.updated_at,
      }));
    },

    async getNotificationChannel(userId: number, channelId: number): Promise<NotificationChannel | null> {
      const row = await dbGet<{
        id: number;
        user_id: number;
        type: string;
        name: string;
        config: string;
        enabled: number;
        created_at: string;
        updated_at: string;
      }>(
        db,
        'SELECT * FROM notification_channels WHERE id = ? AND user_id = ?',
        [channelId, userId]
      );
      if (!row) return null;
      return {
        id: row.id,
        user_id: row.user_id,
        type: row.type as NotificationChannel['type'],
        name: row.name,
        config: JSON.parse(row.config),
        enabled: !!row.enabled,
        created_at: row.created_at,
        updated_at: row.updated_at,
      };
    },

    async createNotificationChannel(userId: number, channel: CreateNotificationChannel): Promise<NotificationChannel> {
      return new Promise((resolve, reject) => {
        db.run(
          'INSERT INTO notification_channels (user_id, type, name, config) VALUES (?, ?, ?, ?)',
          [userId, channel.type, channel.name, channel.config],
          function (err) {
            if (err) {
              reject(err);
              return;
            }
            resolve({
              id: this.lastID,
              user_id: userId,
              type: channel.type as NotificationChannel['type'],
              name: channel.name,
              config: JSON.parse(channel.config),
              enabled: true,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            });
          }
        );
      });
    },

    async updateNotificationChannel(
      userId: number,
      channelId: number,
      updates: Partial<{ name: string; config: string; enabled: boolean }>
    ): Promise<NotificationChannel> {
      const setClause: string[] = [];
      const params: unknown[] = [];

      if (updates.name !== undefined) {
        setClause.push('name = ?');
        params.push(updates.name);
      }
      if (updates.config !== undefined) {
        setClause.push('config = ?');
        params.push(updates.config);
      }
      if (updates.enabled !== undefined) {
        setClause.push('enabled = ?');
        params.push(updates.enabled ? 1 : 0);
      }
      setClause.push('updated_at = CURRENT_TIMESTAMP');
      params.push(channelId, userId);

      await dbRun(
        db,
        `UPDATE notification_channels SET ${setClause.join(', ')} WHERE id = ? AND user_id = ?`,
        params
      );

      const channel = await this.getNotificationChannel(userId, channelId);
      if (!channel) throw new Error('Channel not found after update');
      return channel;
    },

    async deleteNotificationChannel(userId: number, channelId: number): Promise<void> {
      await dbRun(db, 'DELETE FROM notification_channels WHERE id = ? AND user_id = ?', [channelId, userId]);
    },

    // ---------------------------------------------------------------------------
    // Notification Rules - User Scoped
    // ---------------------------------------------------------------------------

    async getNotificationRules(userId: number, productId?: number): Promise<NotificationRule[]> {
      let sql = 'SELECT * FROM notification_rules WHERE user_id = ?';
      const params: unknown[] = [userId];

      if (productId !== undefined) {
        sql += ' AND (product_id = ? OR product_id IS NULL)';
        params.push(productId);
      }

      sql += ' ORDER BY created_at DESC';

      const rows = await dbAll<{
        id: number;
        user_id: number;
        product_id: number | null;
        channel_id: number;
        type: string;
        params: string;
        enabled: number;
        created_at: string;
        updated_at: string;
      }>(db, sql, params);

      return rows.map(row => ({
        id: row.id,
        user_id: row.user_id,
        product_id: row.product_id,
        channel_id: row.channel_id,
        type: row.type as NotificationRule['type'],
        params: JSON.parse(row.params),
        enabled: !!row.enabled,
        created_at: row.created_at,
        updated_at: row.updated_at,
      }));
    },

    async getNotificationRule(userId: number, ruleId: number): Promise<NotificationRule | null> {
      const row = await dbGet<{
        id: number;
        user_id: number;
        product_id: number | null;
        channel_id: number;
        type: string;
        params: string;
        enabled: number;
        created_at: string;
        updated_at: string;
      }>(
        db,
        'SELECT * FROM notification_rules WHERE id = ? AND user_id = ?',
        [ruleId, userId]
      );
      if (!row) return null;
      return {
        id: row.id,
        user_id: row.user_id,
        product_id: row.product_id,
        channel_id: row.channel_id,
        type: row.type as NotificationRule['type'],
        params: JSON.parse(row.params),
        enabled: !!row.enabled,
        created_at: row.created_at,
        updated_at: row.updated_at,
      };
    },

    async createNotificationRule(userId: number, rule: CreateNotificationRule): Promise<NotificationRule> {
      return new Promise((resolve, reject) => {
        db.run(
          'INSERT INTO notification_rules (user_id, product_id, channel_id, type, params) VALUES (?, ?, ?, ?, ?)',
          [userId, rule.product_id, rule.channel_id, rule.type, rule.params],
          function (err) {
            if (err) {
              reject(err);
              return;
            }
            resolve({
              id: this.lastID,
              user_id: userId,
              product_id: rule.product_id,
              channel_id: rule.channel_id,
              type: rule.type as NotificationRule['type'],
              params: JSON.parse(rule.params),
              enabled: true,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            });
          }
        );
      });
    },

    async updateNotificationRule(
      userId: number,
      ruleId: number,
      updates: Partial<{ channel_id: number; type: string; params: string; enabled: boolean }>
    ): Promise<NotificationRule> {
      const setClause: string[] = [];
      const params: unknown[] = [];

      if (updates.channel_id !== undefined) {
        setClause.push('channel_id = ?');
        params.push(updates.channel_id);
      }
      if (updates.type !== undefined) {
        setClause.push('type = ?');
        params.push(updates.type);
      }
      if (updates.params !== undefined) {
        setClause.push('params = ?');
        params.push(updates.params);
      }
      if (updates.enabled !== undefined) {
        setClause.push('enabled = ?');
        params.push(updates.enabled ? 1 : 0);
      }
      setClause.push('updated_at = CURRENT_TIMESTAMP');
      params.push(ruleId, userId);

      await dbRun(
        db,
        `UPDATE notification_rules SET ${setClause.join(', ')} WHERE id = ? AND user_id = ?`,
        params
      );

      const rule = await this.getNotificationRule(userId, ruleId);
      if (!rule) throw new Error('Rule not found after update');
      return rule;
    },

    async deleteNotificationRule(userId: number, ruleId: number): Promise<void> {
      await dbRun(db, 'DELETE FROM notification_rules WHERE id = ? AND user_id = ?', [ruleId, userId]);
    },

    // ---------------------------------------------------------------------------
    // Notification Log - User Scoped
    // ---------------------------------------------------------------------------

    async logNotification(entry: {
      user_id: number;
      rule_id: number;
      product_id: number;
      channel_id: number;
      trigger_type: string;
      message: string;
      status: 'sent' | 'failed';
      error_message?: string;
    }): Promise<void> {
      await dbRun(
        db,
        `INSERT INTO notification_log (user_id, rule_id, product_id, channel_id, trigger_type, message, status, error_message)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          entry.user_id,
          entry.rule_id,
          entry.product_id,
          entry.channel_id,
          entry.trigger_type,
          entry.message,
          entry.status,
          entry.error_message ?? null,
        ]
      );
    },

    async getNotificationHistory(
      userId: number,
      limit: number = 50,
      offset: number = 0
    ): Promise<NotificationLogEntry[]> {
      const rows = await dbAll<{
        id: number;
        user_id: number;
        rule_id: number;
        product_id: number;
        channel_id: number;
        trigger_type: string;
        message: string;
        status: string;
        error_message: string | null;
        created_at: string;
      }>(
        db,
        'SELECT * FROM notification_log WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?',
        [userId, limit, offset]
      );
      return rows.map(row => ({
        id: row.id,
        user_id: row.user_id,
        rule_id: row.rule_id,
        product_id: row.product_id,
        channel_id: row.channel_id,
        trigger_type: row.trigger_type,
        message: row.message,
        status: row.status as 'sent' | 'failed',
        error_message: row.error_message,
        created_at: row.created_at,
      }));
    },

    async getRecentNotification(
      ruleId: number,
      productId: number,
      withinHours: number = 24
    ): Promise<NotificationLogEntry | null> {
      const row = await dbGet<{
        id: number;
        user_id: number;
        rule_id: number;
        product_id: number;
        channel_id: number;
        trigger_type: string;
        message: string;
        status: string;
        error_message: string | null;
        created_at: string;
      }>(
        db,
        `SELECT * FROM notification_log
         WHERE rule_id = ? AND product_id = ? AND created_at > datetime('now', '-${withinHours} hours')
         ORDER BY created_at DESC LIMIT 1`,
        [ruleId, productId]
      );
      if (!row) return null;
      return {
        id: row.id,
        user_id: row.user_id,
        rule_id: row.rule_id,
        product_id: row.product_id,
        channel_id: row.channel_id,
        trigger_type: row.trigger_type,
        message: row.message,
        status: row.status as 'sent' | 'failed',
        error_message: row.error_message,
        created_at: row.created_at,
      };
    },

    // ---------------------------------------------------------------------------
    // Admin-Only Methods
    // ---------------------------------------------------------------------------

    async getAllNotificationChannels(
      limit: number = 50,
      offset: number = 0
    ): Promise<NotificationChannelWithUser[]> {
      const rows = await dbAll<{
        id: number;
        user_id: number;
        type: string;
        name: string;
        config: string;
        enabled: number;
        created_at: string;
        updated_at: string;
        username: string;
        role: string;
        is_disabled: number;
      }>(
        db,
        `SELECT nc.*, u.username, u.role, u.is_disabled
         FROM notification_channels nc
         JOIN users u ON nc.user_id = u.id
         ORDER BY nc.created_at DESC
         LIMIT ? OFFSET ?`,
        [limit, offset]
      );
      return rows.map(row => ({
        id: row.id,
        user_id: row.user_id,
        type: row.type as NotificationChannel['type'],
        name: row.name,
        config: JSON.parse(row.config),
        enabled: !!row.enabled,
        created_at: row.created_at,
        updated_at: row.updated_at,
        username: row.username,
        role: row.role as UserRole,
        is_disabled: !!row.is_disabled,
      }));
    },

    async getAllNotificationRules(
      limit: number = 50,
      offset: number = 0
    ): Promise<NotificationRuleWithUser[]> {
      const rows = await dbAll<{
        id: number;
        user_id: number;
        product_id: number | null;
        channel_id: number;
        type: string;
        params: string;
        enabled: number;
        created_at: string;
        updated_at: string;
        username: string;
        product_description: string | null;
        channel_name: string | null;
      }>(
        db,
        `SELECT nr.*, u.username, p.description as product_description, nc.name as channel_name
         FROM notification_rules nr
         JOIN users u ON nr.user_id = u.id
         LEFT JOIN products p ON nr.product_id = p.id
         LEFT JOIN notification_channels nc ON nr.channel_id = nc.id
         ORDER BY nr.created_at DESC
         LIMIT ? OFFSET ?`,
        [limit, offset]
      );
      return rows.map(row => ({
        id: row.id,
        user_id: row.user_id,
        product_id: row.product_id,
        channel_id: row.channel_id,
        type: row.type as NotificationRule['type'],
        params: JSON.parse(row.params),
        enabled: !!row.enabled,
        created_at: row.created_at,
        updated_at: row.updated_at,
        username: row.username,
        product_description: row.product_description ?? undefined,
        channel_name: row.channel_name ?? undefined,
      }));
    },

    async getAllNotificationHistory(
      limit: number = 100,
      offset: number = 0,
      userId?: number
    ): Promise<NotificationLogEntryWithUser[]> {
      let sql = `SELECT nl.*, u.username, p.description as product_description, nc.name as channel_name
         FROM notification_log nl
         JOIN users u ON nl.user_id = u.id
         LEFT JOIN products p ON nl.product_id = p.id
         LEFT JOIN notification_channels nc ON nl.channel_id = nc.id
         WHERE 1=1`;
      const params: unknown[] = [];

      if (userId !== undefined) {
        sql += ' AND nl.user_id = ?';
        params.push(userId);
      }

      sql += ' ORDER BY nl.created_at DESC LIMIT ? OFFSET ?';
      params.push(limit, offset);

      const rows = await dbAll<{
        id: number;
        user_id: number;
        rule_id: number;
        product_id: number;
        channel_id: number;
        trigger_type: string;
        message: string;
        status: string;
        error_message: string | null;
        created_at: string;
        username: string;
        product_description: string | null;
        channel_name: string | null;
      }>(db, sql, params);

      return rows.map(row => ({
        id: row.id,
        user_id: row.user_id,
        rule_id: row.rule_id,
        product_id: row.product_id,
        channel_id: row.channel_id,
        trigger_type: row.trigger_type,
        message: row.message,
        status: row.status as 'sent' | 'failed',
        error_message: row.error_message,
        created_at: row.created_at,
        username: row.username,
        product_description: row.product_description ?? undefined,
        channel_name: row.channel_name ?? undefined,
      }));
    },

    // ---------------------------------------------------------------------------
    // Price Query Helpers
    // ---------------------------------------------------------------------------

    async getLowestPriceInDays(productId: number, days: number): Promise<number | null> {
      const row = await dbGet<{ min_price: number | null }>(
        db,
        `SELECT MIN(ph.price) as min_price
         FROM price_history ph
         WHERE ph.product_id = ?
           AND ph.price IS NOT NULL
           AND ph.created_at > datetime('now', '-${days} days')`,
        [productId]
      );
      return row?.min_price ?? null;
    },

    async getHighestPriceInDays(productId: number, days: number): Promise<number | null> {
      const row = await dbGet<{ max_price: number | null }>(
        db,
        `SELECT MAX(ph.price) as max_price
         FROM price_history ph
         WHERE ph.product_id = ?
           AND ph.price IS NOT NULL
           AND ph.created_at > datetime('now', '-${days} days')`,
        [productId]
      );
      return row?.max_price ?? null;
    },

    // ---------------------------------------------------------------------------
    // Quota Checking
    // ---------------------------------------------------------------------------

    async checkChannelQuota(userId: number): Promise<{ allowed: boolean; current: number; max: number }> {
      const countRow = await dbGet<{ count: number }>(
        db,
        'SELECT COUNT(*) as count FROM notification_channels WHERE user_id = ?',
        [userId]
      );
      const current = countRow?.count ?? 0;
      const maxStr = await getConfig('quota_max_notification_channels');
      const max = maxStr ? parseInt(maxStr) : 5;
      return { allowed: current < max, current, max };
    },

    async checkRuleQuota(userId: number): Promise<{ allowed: boolean; current: number; max: number }> {
      const countRow = await dbGet<{ count: number }>(
        db,
        'SELECT COUNT(*) as count FROM notification_rules WHERE user_id = ?',
        [userId]
      );
      const current = countRow?.count ?? 0;
      const maxStr = await getConfig('quota_max_notification_rules');
      const max = maxStr ? parseInt(maxStr) : 20;
      return { allowed: current < max, current, max };
    },
  };

  return repo;
}

export type NotificationRepo = ReturnType<typeof createNotificationRepo>;
