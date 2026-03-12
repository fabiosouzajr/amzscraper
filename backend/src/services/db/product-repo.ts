import sqlite3 from 'sqlite3';
import {
  Product, Category, PriceHistory, ProductWithPrice, PriceDrop,
} from '../../models/types';
import { dbRun, dbAll, dbGet } from './helpers';

export function createProductRepo(
  db: sqlite3.Database,
  getConfig: (key: string) => Promise<string | null>
) {
  // ── Internal helper (not exposed on repo surface) ────────────────────────
  async function getOrCreateCategory(name: string): Promise<Category> {
    const existing = await dbGet<any>(db, 'SELECT * FROM categories WHERE name = ?', [name]);
    if (existing) return { ...existing, level: 0 };
    return new Promise((resolve, reject) => {
      db.run('INSERT INTO categories (name) VALUES (?)', [name], function (err) {
        if (err) { reject(err); return; }
        resolve({ id: this.lastID, name, level: 0 });
      });
    });
  }

  // ── Build and return the repo object ────────────────────────────────────
  const repo = {
    getOrCreateCategory,

    async setProductCategories(productId: number, categoryNames: string[]): Promise<void> {
      await dbRun(db, 'DELETE FROM product_categories WHERE product_id = ?', [productId]);
      if (categoryNames.length === 0) return;
      for (let level = 0; level < categoryNames.length; level++) {
        const category = await getOrCreateCategory(categoryNames[level]);
        await dbRun(
          db,
          'INSERT OR IGNORE INTO product_categories (product_id, category_id, level) VALUES (?, ?, ?)',
          [productId, category.id, level]
        );
      }
    },

    async getProductCategories(productId: number): Promise<Category[]> {
      const rows = await dbAll<{ id: number; name: string; level: number }>(
        db,
        `SELECT c.id, c.name, pc.level
         FROM categories c
         JOIN product_categories pc ON c.id = pc.category_id
         WHERE pc.product_id = ?
         ORDER BY pc.level ASC`,
        [productId]
      );
      return rows.map((r) => ({ id: r.id, name: r.name, level: r.level }));
    },

    async getAllCategories(): Promise<Category[]> {
      const rows = await dbAll<any>(db, 'SELECT * FROM categories ORDER BY name ASC');
      return rows.map((r) => ({ ...r, level: 0 }));
    },

    async getCategoryTree(): Promise<{ id: number; name: string; children: { id: number; name: string }[] }[]> {
      // Get all parent→child relationships from co-occurrence in product breadcrumbs
      const edges = await dbAll<{ parent_id: number; parent_name: string; child_id: number; child_name: string }>(
        db,
        `SELECT DISTINCT
           pc1.category_id AS parent_id, c1.name AS parent_name,
           pc2.category_id AS child_id,  c2.name AS child_name
         FROM product_categories pc1
         JOIN categories c1 ON c1.id = pc1.category_id
         JOIN product_categories pc2 ON pc2.product_id = pc1.product_id
                                     AND pc2.level = pc1.level + 1
         JOIN categories c2 ON c2.id = pc2.category_id
         ORDER BY c1.name, c2.name`,
        []
      );

      // Find all IDs that appear as a child (they are not root nodes)
      const childIds = new Set(edges.map(e => e.child_id));

      // Build map: parent_id -> { id, name, children[] }
      const nodeMap = new Map<number, { id: number; name: string; children: { id: number; name: string }[] }>();
      for (const edge of edges) {
        if (!nodeMap.has(edge.parent_id)) {
          nodeMap.set(edge.parent_id, { id: edge.parent_id, name: edge.parent_name, children: [] });
        }
        const parent = nodeMap.get(edge.parent_id)!;
        if (!parent.children.some(c => c.id === edge.child_id)) {
          parent.children.push({ id: edge.child_id, name: edge.child_name });
        }
      }

      // Root nodes = nodes that appear as parent but never as a child
      const roots = Array.from(nodeMap.values()).filter(n => !childIds.has(n.id));

      // Also include orphan categories (no relationships at all) as roots
      const allCats = await dbAll<{ id: number; name: string }>(db, 'SELECT id, name FROM categories ORDER BY name ASC', []);
      const seenIds = new Set([...nodeMap.keys(), ...childIds]);
      for (const cat of allCats) {
        if (!seenIds.has(cat.id)) {
          roots.push({ id: cat.id, name: cat.name, children: [] });
        }
      }

      roots.sort((a, b) => a.name.localeCompare(b.name));
      return roots;
    },

    async addProduct(
      userId: number, asin: string, description: string, categories?: string[]
    ): Promise<Product> {
      const quotaStr = await getConfig('quota_max_products');
      const quotaLimit = parseInt(quotaStr ?? '100', 10);
      const countRow = await dbGet<{ count: number }>(
        db, 'SELECT COUNT(*) as count FROM products WHERE user_id = ?', [userId]
      );
      if ((countRow?.count ?? 0) >= quotaLimit) {
        throw Object.assign(
          new Error(`Product quota exceeded (max ${quotaLimit})`),
          { code: 'QUOTA_EXCEEDED' }
        );
      }
      const productId: number = await new Promise((resolve, reject) => {
        db.run(
          'INSERT INTO products (user_id, asin, description) VALUES (?, ?, ?)',
          [userId, asin, description],
          function (err) { err ? reject(err) : resolve(this.lastID); }
        );
      });
      if (categories && categories.length > 0) {
        await repo.setProductCategories(productId, categories);
      }
      const product = await repo.getProductById(productId, userId);
      if (!product) throw new Error('Product not found after insert');
      return product;
    },

    async getProductById(id: number, userId: number): Promise<Product | null> {
      const row = await dbGet<any>(
        db, 'SELECT * FROM products WHERE id = ? AND user_id = ?', [id, userId]
      );
      if (!row) return null;
      const cats = await repo.getProductCategories(id);
      return { ...row, categories: cats };
    },

    async getProductByASIN(userId: number, asin: string): Promise<Product | null> {
      const row = await dbGet<any>(
        db, 'SELECT * FROM products WHERE user_id = ? AND asin = ?', [userId, asin]
      );
      if (!row) return null;
      const cats = await repo.getProductCategories(row.id);
      return { ...row, categories: cats };
    },

    async getAllProducts(userId: number, categoryFilter?: string): Promise<Product[]> {
      let rows: any[];
      if (categoryFilter) {
        rows = await dbAll<any>(
          db,
          `SELECT DISTINCT p.* FROM products p
           JOIN product_categories pc ON p.id = pc.product_id
           JOIN categories c ON pc.category_id = c.id
           WHERE p.user_id = ? AND c.name = ?
           ORDER BY p.created_at DESC`,
          [userId, categoryFilter]
        );
      } else {
        rows = await dbAll<any>(
          db, 'SELECT * FROM products WHERE user_id = ? ORDER BY created_at DESC', [userId]
        );
      }
      return Promise.all(rows.map(async (r) => ({
        ...r,
        categories: await repo.getProductCategories(r.id),
      })));
    },

    async searchProducts(userId: number, query: string, categoryFilter?: string): Promise<Product[]> {
      const pattern = `%${query}%`;
      let rows: any[];
      if (categoryFilter) {
        rows = await dbAll<any>(
          db,
          `SELECT DISTINCT p.* FROM products p
           JOIN product_categories pc ON p.id = pc.product_id
           JOIN categories c ON pc.category_id = c.id
           WHERE p.user_id = ?
             AND (p.asin LIKE ? OR p.description LIKE ?)
             AND c.name = ?
           ORDER BY p.created_at DESC`,
          [userId, pattern, pattern, categoryFilter]
        );
      } else {
        rows = await dbAll<any>(
          db,
          'SELECT * FROM products WHERE user_id = ? AND (asin LIKE ? OR description LIKE ?) ORDER BY created_at DESC',
          [userId, pattern, pattern]
        );
      }
      return Promise.all(rows.map(async (r) => ({
        ...r,
        categories: await repo.getProductCategories(r.id),
      })));
    },

    async deleteProduct(id: number, userId: number): Promise<boolean> {
      await dbRun(db, 'DELETE FROM price_history WHERE product_id = ?', [id]);
      return new Promise((resolve, reject) => {
        db.run(
          'DELETE FROM products WHERE id = ? AND user_id = ?',
          [id, userId],
          function (err) { err ? reject(err) : resolve(this.changes > 0); }
        );
      });
    },

    async getLastPrice(productId: number): Promise<number | null> {
      const row = await dbGet<{ price: number | null; available: number }>(
        db,
        'SELECT price, available FROM price_history WHERE product_id = ? ORDER BY date DESC LIMIT 1',
        [productId]
      );
      if (!row || row.available === 0) return null;
      return row.price ?? null;
    },

    async addPriceHistory(
      productId: number,
      price: number | null,
      available = true,
      unavailableReason?: string
    ): Promise<PriceHistory> {
      return new Promise((resolve, reject) => {
        db.run(
          'INSERT INTO price_history (product_id, price, available, unavailable_reason) VALUES (?, ?, ?, ?)',
          [productId, price, available ? 1 : 0, unavailableReason ?? null],
          function (err) {
            if (err) { reject(err); return; }
            resolve({
              id: this.lastID,
              product_id: productId,
              price,
              available,
              unavailable_reason: unavailableReason,
              date: new Date().toISOString(),
              created_at: new Date().toISOString(),
            });
          }
        );
      });
    },

    async getPriceHistory(productId: number): Promise<PriceHistory[]> {
      return dbAll<PriceHistory>(
        db,
        'SELECT * FROM price_history WHERE product_id = ? ORDER BY date DESC',
        [productId]
      );
    },

    async getProductWithPriceHistory(
      productId: number, userId: number
    ): Promise<ProductWithPrice | null> {
      const product = await repo.getProductById(productId, userId);
      if (!product) return null;
      const history = await repo.getPriceHistory(productId);
      const currentPrice = history.length > 0 ? history[history.length - 1].price ?? undefined : undefined;
      const previousPrice = history.length > 1 ? history[history.length - 2].price ?? undefined : undefined;
      const priceDrop = currentPrice && previousPrice ? previousPrice - currentPrice : undefined;
      const priceDropPercentage = currentPrice && previousPrice && previousPrice > 0
        ? ((previousPrice - currentPrice) / previousPrice) * 100
        : undefined;
      return {
        ...product,
        current_price: currentPrice,
        previous_price: previousPrice,
        price_drop: priceDrop,
        price_drop_percentage: priceDropPercentage,
        last_updated: history.length > 0 ? history[history.length - 1].date : undefined,
      };
    },

    async getBiggestPriceDrops(userId: number, limit = 10): Promise<PriceDrop[]> {
      const sql = `
        SELECT
          p.id,
          p.asin,
          p.description,
          p.created_at,
          current.price as current_price,
          previous.price as previous_price,
          (previous.price - current.price) as price_drop,
          ((previous.price - current.price) / previous.price * 100) as price_drop_percentage,
          current.date as last_updated
        FROM products p
        INNER JOIN price_history current ON p.id = current.product_id
        INNER JOIN price_history previous ON p.id = previous.product_id
        WHERE p.user_id = ?
        AND current.id = (
          SELECT id FROM price_history
          WHERE product_id = p.id
          ORDER BY date DESC LIMIT 1
        )
        AND previous.id = (
          SELECT id FROM price_history
          WHERE product_id = p.id
          AND id != current.id
          ORDER BY date DESC LIMIT 1
        )
        AND previous.price > current.price
        ORDER BY price_drop_percentage DESC
        LIMIT ?
      `;
      const rows = await dbAll<any>(db, sql, [userId, limit]);
      const drops: (PriceDrop | null)[] = await Promise.all(
        rows.map(async (row) => {
          const priceHistory = await repo.getPriceHistory(row.id);
          const categories = await repo.getProductCategories(row.id);
          const product = await repo.getProductById(row.id, userId);
          if (!product) return null;
          return {
            product: {
              id: row.id,
              asin: row.asin,
              description: row.description,
              categories: categories.length > 0 ? categories : undefined,
              created_at: row.created_at,
            },
            current_price: row.current_price,
            previous_price: row.previous_price,
            price_drop: row.price_drop,
            price_drop_percentage: row.price_drop_percentage,
            last_updated: row.last_updated,
            price_history: priceHistory,
          };
        })
      );
      return drops.filter((d): d is PriceDrop => d !== null);
    },

    async getBiggestPriceIncreases(userId: number, limit = 10): Promise<PriceDrop[]> {
      const sql = `
        SELECT
          p.id,
          p.asin,
          p.description,
          p.created_at,
          current.price as current_price,
          previous.price as previous_price,
          (current.price - previous.price) as price_drop,
          ((current.price - previous.price) / previous.price * 100) as price_drop_percentage,
          current.date as last_updated
        FROM products p
        INNER JOIN price_history current ON p.id = current.product_id
        INNER JOIN price_history previous ON p.id = previous.product_id
        WHERE p.user_id = ?
        AND current.id = (
          SELECT id FROM price_history
          WHERE product_id = p.id
          ORDER BY date DESC LIMIT 1
        )
        AND previous.id = (
          SELECT id FROM price_history
          WHERE product_id = p.id
          AND id != current.id
          ORDER BY date DESC LIMIT 1
        )
        AND previous.price < current.price
        ORDER BY price_drop_percentage DESC
        LIMIT ?
      `;
      const rows = await dbAll<any>(db, sql, [userId, limit]);
      const increases: (PriceDrop | null)[] = await Promise.all(
        rows.map(async (row) => {
          const priceHistory = await repo.getPriceHistory(row.id);
          const categories = await repo.getProductCategories(row.id);
          const product = await repo.getProductById(row.id, userId);
          if (!product) return null;
          return {
            product: {
              id: row.id,
              asin: row.asin,
              description: row.description,
              categories: categories.length > 0 ? categories : undefined,
              created_at: row.created_at,
            },
            current_price: row.current_price,
            previous_price: row.previous_price,
            price_drop: row.price_drop,
            price_drop_percentage: row.price_drop_percentage,
            last_updated: row.last_updated,
            price_history: priceHistory,
          };
        })
      );
      return increases.filter((i): i is PriceDrop => i !== null);
    },

    async getProductCount(userId: number): Promise<number> {
      const row = await dbGet<{ count: number }>(
        db, 'SELECT COUNT(*) as count FROM products WHERE user_id = ?', [userId]
      );
      return row?.count ?? 0;
    },

    // Used by admin-repo stats — queries directly to avoid a cross-repo import
    async getListCount(userId: number): Promise<number> {
      const row = await dbGet<{ count: number }>(
        db, 'SELECT COUNT(*) as count FROM user_lists WHERE user_id = ?', [userId]
      );
      return row?.count ?? 0;
    },

    async getProductsWithLists(
      userId: number, categoryFilter?: string, limit?: number, offset?: number
    ): Promise<Product[]> {
      let sql = 'SELECT p.* FROM products p WHERE p.user_id = ?';
      const params: unknown[] = [userId];
      if (categoryFilter) {
        sql += `
          AND p.id IN (
            SELECT pc.product_id FROM product_categories pc
            JOIN categories c ON pc.category_id = c.id
            WHERE c.name = ?
          )`;
        params.push(categoryFilter);
      }
      sql += ' ORDER BY p.created_at DESC';
      if (limit !== undefined) {
        sql += ' LIMIT ?';
        params.push(limit);
        if (offset !== undefined) {
          sql += ' OFFSET ?';
          params.push(offset);
        }
      }
      const rows = await dbAll<any>(db, sql, params);
      return Promise.all(
        rows.map(async (r) => ({
          ...r,
          categories: await repo.getProductCategories(r.id),
          lists: await dbAll<any>(
            db,
            `SELECT ul.* FROM user_lists ul
             JOIN product_lists pl ON ul.id = pl.list_id
             WHERE pl.product_id = ?`,
            [r.id]
          ),
        }))
      );
    },

    async getProductsCount(userId: number, categoryFilter?: string): Promise<number> {
      let sql = 'SELECT COUNT(*) as count FROM products WHERE user_id = ?';
      const params: unknown[] = [userId];
      if (categoryFilter) {
        sql = `
          SELECT COUNT(DISTINCT p.id) as count FROM products p
          JOIN product_categories pc ON p.id = pc.product_id
          JOIN categories c ON pc.category_id = c.id
          WHERE p.user_id = ? AND c.name = ?`;
        params.push(categoryFilter);
      }
      const row = await dbGet<{ count: number }>(db, sql, params);
      return row?.count ?? 0;
    },

    async getAllProductIdsSorted(userId: number): Promise<number[]> {
      const rows = await dbAll<{ id: number }>(
        db,
        'SELECT id FROM products WHERE user_id = ? ORDER BY created_at ASC',
        [userId]
      );
      return rows.map((r) => r.id);
    },

    async getListProducts(listId: number): Promise<Product[]> {
      const rows = await dbAll<any>(
        db,
        `SELECT p.* FROM products p
         JOIN product_lists pl ON p.id = pl.product_id
         WHERE pl.list_id = ?
         ORDER BY p.created_at DESC`,
        [listId]
      );
      return Promise.all(rows.map(async (r) => ({
        ...r,
        categories: await repo.getProductCategories(r.id),
      })));
    },
  };

  return repo;
}

export type ProductRepo = ReturnType<typeof createProductRepo>;
