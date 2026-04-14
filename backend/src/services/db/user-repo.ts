import sqlite3 from 'sqlite3';
import bcrypt from 'bcrypt';
import { User, UserWithPasswordHash, UserRole, UserStats, SystemStats } from '../../models/types';
import { config } from '../../config';
import { dbRun, dbAll, dbGet } from './helpers';

export function createUserRepo(db: sqlite3.Database) {
  const repo = {
    async createUser(username: string, password: string): Promise<User> {
      const hash = await bcrypt.hash(password, config.bcryptRounds);
      const id: number = await new Promise((resolve, reject) => {
        db.run(
          "INSERT INTO users (username, password_hash, role) VALUES (?, ?, 'USER')",
          [username, hash],
          function (err) {
            if (err) { reject(err); return; }
            resolve(this.lastID);
          }
        );
      });
      const user = await repo.getUserById(id);
      if (!user) throw new Error('User not found after insert');
      return user;
    },

    async createAdminUser(username: string, password: string): Promise<User> {
      const hash = await bcrypt.hash(password, config.bcryptRounds);
      const id: number = await new Promise((resolve, reject) => {
        db.run(
          "INSERT INTO users (username, password_hash, role) VALUES (?, ?, 'ADMIN')",
          [username, hash],
          function (err) {
            if (err) { reject(err); return; }
            resolve(this.lastID);
          }
        );
      });
      const user = await repo.getUserById(id);
      if (!user) throw new Error('User not found after insert');
      return user;
    },

    async createUserWithRole(username: string, password: string, role: string): Promise<User> {
      const validRoles: UserRole[] = ['USER', 'ADMIN'];
      if (!validRoles.includes(role as UserRole)) {
        throw new Error(`Invalid role: ${role}. Must be one of: ${validRoles.join(', ')}`);
      }
      const hash = await bcrypt.hash(password, config.bcryptRounds);
      const id: number = await new Promise((resolve, reject) => {
        db.run(
          'INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)',
          [username, hash, role],
          function (err) {
            if (err) { reject(err); return; }
            resolve(this.lastID);
          }
        );
      });
      const user = await repo.getUserById(id);
      if (!user) throw new Error('User not found after insert');
      return user;
    },

    async setUserRole(userId: number, role: UserRole): Promise<boolean> {
      return new Promise((resolve, reject) => {
        db.run(
          'UPDATE users SET role = ? WHERE id = ?',
          [role, userId],
          function (err) { err ? reject(err) : resolve(this.changes > 0); }
        );
      });
    },

    async getUserByUsername(username: string): Promise<UserWithPasswordHash | null> {
      const row = await dbGet<any>(db, 'SELECT * FROM users WHERE username = ?', [username]);
      if (!row) return null;
      return {
        id: row.id,
        username: row.username,
        password_hash: row.password_hash,
        role: row.role as UserRole,
        is_disabled: Boolean(row.is_disabled),
        created_at: row.created_at,
      };
    },

    async updateUserPassword(userId: number, newPassword: string): Promise<boolean> {
      const hash = await bcrypt.hash(newPassword, config.bcryptRounds);
      return new Promise((resolve, reject) => {
        db.run(
          'UPDATE users SET password_hash = ? WHERE id = ?',
          [hash, userId],
          function (err) { err ? reject(err) : resolve(this.changes > 0); }
        );
      });
    },

    async getUserById(id: number): Promise<User | null> {
      const row = await dbGet<any>(db, 'SELECT * FROM users WHERE id = ?', [id]);
      if (!row) return null;
      return {
        id: row.id,
        username: row.username,
        role: row.role as UserRole,
        is_disabled: Boolean(row.is_disabled),
        created_at: row.created_at,
      };
    },

    async getAllUsers(): Promise<User[]> {
      const rows = await dbAll<any>(db, `
        SELECT
          u.id, u.username, u.role, u.is_disabled, u.created_at,
          (SELECT COUNT(*) FROM products WHERE user_id = u.id) as product_count,
          (SELECT COUNT(*) FROM user_lists WHERE user_id = u.id) as list_count,
          (SELECT COUNT(*) FROM price_history ph
           JOIN products p ON ph.product_id = p.id
           WHERE p.user_id = u.id) as price_history_count
        FROM users u
        ORDER BY u.created_at ASC
      `);
      return rows.map((r) => ({
        id: r.id,
        username: r.username,
        role: r.role as UserRole,
        is_disabled: Boolean(r.is_disabled),
        created_at: r.created_at,
        product_count: r.product_count ?? 0,
        list_count: r.list_count ?? 0,
        price_history_count: r.price_history_count ?? 0,
      }));
    },

    async disableUser(userId: number): Promise<boolean> {
      return new Promise((resolve, reject) => {
        db.run(
          'UPDATE users SET is_disabled = 1, disabled_at = CURRENT_TIMESTAMP WHERE id = ?',
          [userId],
          function (err) { err ? reject(err) : resolve(this.changes > 0); }
        );
      });
    },

    async enableUser(userId: number): Promise<boolean> {
      return new Promise((resolve, reject) => {
        db.run(
          'UPDATE users SET is_disabled = 0, disabled_at = NULL WHERE id = ?',
          [userId],
          function (err) { err ? reject(err) : resolve(this.changes > 0); }
        );
      });
    },

    async getUserStats(userId: number): Promise<UserStats> {
      const row = await dbGet<any>(db, `
        SELECT
          (SELECT COUNT(*) FROM products WHERE user_id = ?) as product_count,
          (SELECT COUNT(*) FROM user_lists WHERE user_id = ?) as list_count,
          (SELECT COUNT(*) FROM price_history ph
           JOIN products p ON ph.product_id = p.id
           WHERE p.user_id = ?) as price_history_count
      `, [userId, userId, userId]);
      return {
        product_count: row?.product_count ?? 0,
        list_count: row?.list_count ?? 0,
        price_history_count: row?.price_history_count ?? 0,
      };
    },

    async getSystemStats(): Promise<SystemStats> {
      const row = await dbGet<any>(db, `
        SELECT
          (SELECT COUNT(*) FROM users) as total_users,
          (SELECT COUNT(*) FROM users WHERE role = 'ADMIN') as total_admins,
          (SELECT COUNT(*) FROM users WHERE is_disabled = 1) as disabled_users,
          (SELECT COUNT(*) FROM products) as total_products,
          (SELECT COUNT(DISTINCT user_id) FROM products) as active_users,
          (SELECT COUNT(*) FROM price_history) as total_price_history
      `);
      return {
        total_users: row?.total_users ?? 0,
        total_admins: row?.total_admins ?? 0,
        disabled_users: row?.disabled_users ?? 0,
        total_products: row?.total_products ?? 0,
        active_users: row?.active_users ?? 0,
        total_price_history: row?.total_price_history ?? 0,
      };
    },

    async getUserSchedule(
      userId: number
    ): Promise<{ cron_expression: string | null; enabled: boolean; last_run_at: string | null } | null> {
      const row = await dbGet<any>(
        db,
        'SELECT cron_expression, enabled, last_run_at FROM user_schedule WHERE user_id = ?',
        [userId]
      );
      if (!row) return null;
      return {
        cron_expression: row.cron_expression,
        enabled: Boolean(row.enabled),
        last_run_at: row.last_run_at,
      };
    },

    async setUserSchedule(userId: number, cronExpression: string, enabled: boolean): Promise<void> {
      await dbRun(db, `
        INSERT INTO user_schedule (user_id, cron_expression, enabled)
        VALUES (?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET
          cron_expression = excluded.cron_expression,
          enabled = excluded.enabled
      `, [userId, cronExpression, enabled ? 1 : 0]);
    },

    async updateUserScheduleLastRun(userId: number): Promise<void> {
      await dbRun(
        db,
        'UPDATE user_schedule SET last_run_at = CURRENT_TIMESTAMP WHERE user_id = ?',
        [userId]
      );
    },

    async getUsersWithEnabledSchedules(): Promise<Array<{ user_id: number; cron_expression: string }>> {
      return dbAll<{ user_id: number; cron_expression: string }>(
        db,
        'SELECT user_id, cron_expression FROM user_schedule WHERE enabled = 1 AND cron_expression IS NOT NULL'
      );
    },
  };

  return repo;
}

export type UserRepo = ReturnType<typeof createUserRepo>;
