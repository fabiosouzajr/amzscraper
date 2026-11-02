import fs from 'fs';
import os from 'os';
import path from 'path';
import sqlite3 from 'sqlite3';
import { openConnection } from '../../src/services/backup/connection';
import { createMigrations } from '../../src/services/db/migrations';
import { dbRun, dbGet } from '../../src/services/db/helpers';

export interface TempPrice {
  date: string; // storage form: YYYY-MM-DD HH:MM:SS
  price: number | null;
  available?: boolean;
  reason?: string;
}

export interface TempDb {
  path: string;
  db: sqlite3.Database;
  cleanup(): Promise<void>;
  addUser(username: string): Promise<number>;
  addProduct(
    userId: number,
    asin: string,
    opts?: { description?: string; categories?: string[]; lists?: string[]; prices?: TempPrice[] }
  ): Promise<number>;
}

/** A migrated, throwaway SQLite file in os.tmpdir(), seeded via raw SQL (never touches the real DB). */
export async function createTempDb(): Promise<TempDb> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'amz-backup-'));
  const file = path.join(dir, 'test.db');
  const db = await openConnection(file);
  await createMigrations(db).run();

  const lastId = async (sql: string, params: unknown[]): Promise<number> => {
    const row = await dbGet<{ id: number }>(db, sql, params);
    return row!.id;
  };

  return {
    path: file,
    db,
    async cleanup() {
      await new Promise<void>((res) => db.close(() => res()));
      fs.rmSync(dir, { recursive: true, force: true });
    },
    async addUser(username) {
      await dbRun(db, 'INSERT INTO users (username, password_hash) VALUES (?, ?)', [username, 'x']);
      return lastId('SELECT id FROM users WHERE username = ?', [username]);
    },
    async addProduct(userId, asin, opts = {}) {
      await dbRun(
        db,
        'INSERT INTO products (user_id, asin, description, created_at) VALUES (?, ?, ?, ?)',
        [userId, asin, opts.description ?? asin, '2026-01-01 00:00:00']
      );
      const pid = await lastId('SELECT id FROM products WHERE user_id = ? AND asin = ?', [userId, asin]);

      for (const [level, name] of (opts.categories ?? []).entries()) {
        await dbRun(db, 'INSERT OR IGNORE INTO categories (name) VALUES (?)', [name]);
        const cid = await lastId('SELECT id FROM categories WHERE name = ?', [name]);
        await dbRun(db, 'INSERT INTO product_categories (product_id, category_id, level) VALUES (?, ?, ?)', [pid, cid, level]);
      }
      for (const name of opts.lists ?? []) {
        let row = await dbGet<{ id: number }>(db, 'SELECT id FROM user_lists WHERE user_id = ? AND name = ?', [userId, name]);
        if (!row) {
          await dbRun(db, 'INSERT INTO user_lists (user_id, name, created_at) VALUES (?, ?, ?)', [userId, name, '2026-01-01 00:00:00']);
          row = await dbGet<{ id: number }>(db, 'SELECT id FROM user_lists WHERE user_id = ? AND name = ?', [userId, name]);
        }
        await dbRun(db, 'INSERT INTO product_lists (product_id, list_id) VALUES (?, ?)', [pid, row!.id]);
      }
      for (const p of opts.prices ?? []) {
        await dbRun(
          db,
          'INSERT INTO price_history (product_id, price, available, unavailable_reason, date) VALUES (?, ?, ?, ?, ?)',
          [pid, p.price, p.available === false ? 0 : 1, p.reason ?? null, p.date]
        );
      }
      return pid;
    },
  };
}
