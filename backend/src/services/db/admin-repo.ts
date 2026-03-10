import sqlite3 from 'sqlite3';
import { AuditLog, SystemConfig } from '../../models/types';
import { dbRun, dbAll, dbGet } from './helpers';

export function createAdminRepo(db: sqlite3.Database) {
  const repo = {
    async logAudit(
      adminUserId: number,
      action: string,
      targetType?: string,
      targetId?: number,
      details?: string
    ): Promise<AuditLog> {
      return new Promise((resolve, reject) => {
        db.run(
          'INSERT INTO audit_log (admin_user_id, action, target_type, target_id, details) VALUES (?, ?, ?, ?, ?)',
          [adminUserId, action, targetType ?? null, targetId ?? null, details ?? null],
          function (err) {
            if (err) { reject(err); return; }
            resolve({
              id: this.lastID,
              admin_user_id: adminUserId,
              admin_username: '', // placeholder, populated by JOIN in queries
              action,
              target_type: targetType,
              target_id: targetId,
              details: details,
              created_at: new Date().toISOString(),
            });
          }
        );
      });
    },

    async getAuditLogs(
      options: {
        limit?: number;
        offset?: number;
        adminUserId?: number;
        action?: string;
        targetType?: string;
      } = {}
    ): Promise<AuditLog[]> {
      const { limit = 50, offset = 0, adminUserId, action, targetType } = options;
      let sql = 'SELECT * FROM audit_log WHERE 1=1';
      const params: unknown[] = [];
      if (adminUserId !== undefined) { sql += ' AND admin_user_id = ?'; params.push(adminUserId); }
      if (action)     { sql += ' AND action = ?';      params.push(action); }
      if (targetType) { sql += ' AND target_type = ?'; params.push(targetType); }
      sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
      params.push(limit, offset);
      return dbAll<AuditLog>(db, sql, params);
    },

    async getConfig(key: string): Promise<string | null> {
      const row = await dbGet<{ value: string }>(
        db, 'SELECT value FROM system_config WHERE key = ?', [key]
      );
      return row?.value ?? null;
    },

    async setConfig(
      key: string, value: string, updatedBy?: number
    ): Promise<SystemConfig> {
      await dbRun(db, `
        INSERT INTO system_config (key, value, updated_by, updated_at)
        VALUES (?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(key) DO UPDATE SET
          value = excluded.value,
          updated_by = excluded.updated_by,
          updated_at = CURRENT_TIMESTAMP
      `, [key, value, updatedBy ?? null]);
      const row = await dbGet<SystemConfig>(db, 'SELECT * FROM system_config WHERE key = ?', [key]);
      if (!row) throw new Error(`Config key not found after upsert: ${key}`);
      return row;
    },

    async getAllConfig(): Promise<SystemConfig[]> {
      return dbAll<SystemConfig>(db, 'SELECT * FROM system_config ORDER BY key ASC');
    },
  };

  return repo;
}

export type AdminRepo = ReturnType<typeof createAdminRepo>;
