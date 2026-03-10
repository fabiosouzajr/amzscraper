import sqlite3 from 'sqlite3';
import { UserList } from '../../models/types';
import { dbRun, dbAll, dbGet } from './helpers';

export function createListRepo(
  db: sqlite3.Database,
  getConfig: (key: string) => Promise<string | null>
) {
  const repo = {
    async createList(userId: number, name: string): Promise<UserList> {
      const quotaStr = await getConfig('quota_max_lists');
      const quotaLimit = parseInt(quotaStr ?? '20', 10);
      const countRow = await dbGet<{ count: number }>(
        db, 'SELECT COUNT(*) as count FROM user_lists WHERE user_id = ?', [userId]
      );
      if ((countRow?.count ?? 0) >= quotaLimit) {
        throw Object.assign(
          new Error(`List quota exceeded (max ${quotaLimit})`),
          { code: 'QUOTA_EXCEEDED' }
        );
      }
      return new Promise((resolve, reject) => {
        db.run(
          'INSERT INTO user_lists (user_id, name) VALUES (?, ?)',
          [userId, name],
          function (err) {
            if (err) { reject(err); return; }
            resolve({ id: this.lastID, user_id: userId, name, created_at: new Date().toISOString() });
          }
        );
      });
    },

    async getUserLists(userId: number): Promise<UserList[]> {
      return dbAll<UserList>(
        db,
        'SELECT * FROM user_lists WHERE user_id = ? ORDER BY created_at DESC',
        [userId]
      );
    },

    async getListById(listId: number): Promise<UserList | null> {
      return (await dbGet<UserList>(db, 'SELECT * FROM user_lists WHERE id = ?', [listId])) ?? null;
    },

    async updateList(listId: number, name: string): Promise<UserList | null> {
      await dbRun(db, 'UPDATE user_lists SET name = ? WHERE id = ?', [name, listId]);
      return (await dbGet<UserList>(db, 'SELECT * FROM user_lists WHERE id = ?', [listId])) ?? null;
    },

    async deleteList(listId: number): Promise<boolean> {
      return new Promise((resolve, reject) => {
        db.run(
          'DELETE FROM user_lists WHERE id = ?',
          [listId],
          function (err) { err ? reject(err) : resolve(this.changes > 0); }
        );
      });
    },

    async addProductToList(productId: number, listId: number): Promise<void> {
      await dbRun(
        db,
        'INSERT OR IGNORE INTO product_lists (product_id, list_id) VALUES (?, ?)',
        [productId, listId]
      );
    },

    async removeProductFromList(productId: number, listId: number): Promise<void> {
      await dbRun(
        db,
        'DELETE FROM product_lists WHERE product_id = ? AND list_id = ?',
        [productId, listId]
      );
    },

    async getProductLists(productId: number, userId?: number): Promise<UserList[]> {
      if (userId !== undefined) {
        return dbAll<UserList>(
          db,
          `SELECT ul.* FROM user_lists ul
           JOIN product_lists pl ON ul.id = pl.list_id
           WHERE pl.product_id = ? AND ul.user_id = ?`,
          [productId, userId]
        );
      }
      return dbAll<UserList>(
        db,
        `SELECT ul.* FROM user_lists ul
         JOIN product_lists pl ON ul.id = pl.list_id
         WHERE pl.product_id = ?`,
        [productId]
      );
    },
  };

  return repo;
}

export type ListRepo = ReturnType<typeof createListRepo>;
