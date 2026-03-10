# Database Refactor Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the 1,861-line `database.ts` monolith into focused repo files without changing any route code.

**Architecture:** A thin `DatabaseService` facade owns the SQLite connection and `ready` promise; it delegates to four factory-function repos (`product-repo`, `user-repo`, `list-repo`, `admin-repo`) that each receive the `db` instance and return plain method objects. A `migrations.ts` module runs all schema setup as flat `async/await`. Routes continue calling `dbService.method()` unchanged.

**Tech Stack:** Node.js, TypeScript strict mode, sqlite3 (callback-based driver), bcrypt, Express (routes untouched)

**Spec:** `docs/superpowers/specs/2026-03-10-database-refactor-design.md`

---

## Chunk 1: Foundation + Migrations + Product Repo

### Task 1: Create `db/helpers.ts` — promisify the sqlite3 driver

**Files:**
- Create: `backend/src/services/db/helpers.ts`

- [ ] **Step 1: Create `backend/src/services/db/helpers.ts` with the three driver wrappers**

```ts
import sqlite3 from 'sqlite3';

/** Run a DML/DDL statement, resolve when done. */
export function dbRun(
  db: sqlite3.Database,
  sql: string,
  params: unknown[] = []
): Promise<void> {
  return new Promise((resolve, reject) =>
    db.run(sql, params, (err) => (err ? reject(err) : resolve()))
  );
}

/** Fetch multiple rows. */
export function dbAll<T = unknown>(
  db: sqlite3.Database,
  sql: string,
  params: unknown[] = []
): Promise<T[]> {
  return new Promise((resolve, reject) =>
    db.all(sql, params, (err, rows) =>
      err ? reject(err) : resolve((rows ?? []) as T[])
    )
  );
}

/** Fetch a single row (undefined if not found). */
export function dbGet<T = unknown>(
  db: sqlite3.Database,
  sql: string,
  params: unknown[] = []
): Promise<T | undefined> {
  return new Promise((resolve, reject) =>
    db.get(sql, params, (err, row) =>
      err ? reject(err) : resolve(row as T | undefined)
    )
  );
}
```

- [ ] **Step 2: Verify TypeScript compilation**

```bash
cd backend && npm run build 2>&1 | head -30
```

Expected: no errors in `db/helpers.ts`.

- [ ] **Step 3: Commit**

```bash
git add backend/src/services/db/helpers.ts
git commit -m "refactor: add db helper utilities (dbRun, dbAll, dbGet)"
```

---

### Task 2: Create `db/migrations.ts` — flat async/await schema + migrations

**Files:**
- Create: `backend/src/services/db/migrations.ts`

Takes over everything from `initializeTables()`, all `checkAndMigrate*` methods, and `initializeSystemConfig()` in the current `database.ts`. Uses `for...of await dbRun` instead of `db.serialize()` callbacks or a loop-with-counter (which risks double-settling a Promise).

- [ ] **Step 1: Create `backend/src/services/db/migrations.ts`**

```ts
import sqlite3 from 'sqlite3';
import { dbRun, dbAll, dbGet } from './helpers';

// ---------------------------------------------------------------------------
// DDL — table definitions
// ---------------------------------------------------------------------------

const DDL = {
  users: `
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'USER',
      is_disabled INTEGER DEFAULT 0,
      disabled_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,

  categories: `
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL
    )`,

  productCategories: `
    CREATE TABLE IF NOT EXISTS product_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      category_id INTEGER NOT NULL,
      level INTEGER NOT NULL,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
      FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE,
      UNIQUE(product_id, category_id, level)
    )`,

  userLists: `
    CREATE TABLE IF NOT EXISTS user_lists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`,

  productLists: `
    CREATE TABLE IF NOT EXISTS product_lists (
      product_id INTEGER NOT NULL,
      list_id INTEGER NOT NULL,
      PRIMARY KEY (product_id, list_id),
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
      FOREIGN KEY (list_id) REFERENCES user_lists(id) ON DELETE CASCADE
    )`,

  auditLog: `
    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      admin_user_id INTEGER NOT NULL,
      action TEXT NOT NULL,
      target_type TEXT,
      target_id INTEGER,
      details TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (admin_user_id) REFERENCES users(id) ON DELETE CASCADE
    )`,

  systemConfig: `
    CREATE TABLE IF NOT EXISTS system_config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      description TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_by INTEGER,
      FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
    )`,

  userSchedule: `
    CREATE TABLE IF NOT EXISTS user_schedule (
      user_id INTEGER PRIMARY KEY,
      cron_expression TEXT,
      enabled INTEGER DEFAULT 0,
      last_run_at DATETIME,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`,
};

// ---------------------------------------------------------------------------
// Step 1 — create base tables (users must exist before FK-dependents)
// ---------------------------------------------------------------------------

async function createBaseTables(db: sqlite3.Database): Promise<void> {
  for (const sql of [
    DDL.users,
    DDL.auditLog,
    DDL.categories,
    DDL.productCategories,
    DDL.userLists,
    DDL.productLists,
    DDL.systemConfig,
    DDL.userSchedule,
  ]) {
    await dbRun(db, sql);
  }
}

// ---------------------------------------------------------------------------
// Step 2 — migrate users table (add role / is_disabled / disabled_at cols)
// ---------------------------------------------------------------------------

async function migrateUsersTable(db: sqlite3.Database): Promise<void> {
  const columns = await dbAll<{ name: string }>(db, 'PRAGMA table_info(users)');
  const names = new Set(columns.map((c) => c.name));

  if (!names.has('role')) {
    await dbRun(db, "ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'USER'");
    await dbRun(db, "UPDATE users SET role = 'USER' WHERE role IS NULL OR role = ''");
  }
  if (!names.has('is_disabled')) {
    await dbRun(db, 'ALTER TABLE users ADD COLUMN is_disabled INTEGER DEFAULT 0');
  }
  if (!names.has('disabled_at')) {
    await dbRun(db, 'ALTER TABLE users ADD COLUMN disabled_at DATETIME');
  }
}

// ---------------------------------------------------------------------------
// Step 3 — migrate price_history table
// ---------------------------------------------------------------------------

async function migratePriceHistoryTable(db: sqlite3.Database): Promise<void> {
  const columns = await dbAll<{ name: string; notnull: number }>(
    db,
    'PRAGMA table_info(price_history)'
  );

  // Table doesn't exist yet — create with final schema
  if (columns.length === 0) {
    await dbRun(db, `
      CREATE TABLE IF NOT EXISTS price_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        product_id INTEGER NOT NULL,
        price REAL,
        available BOOLEAN DEFAULT 1,
        unavailable_reason TEXT,
        date DATETIME DEFAULT CURRENT_TIMESTAMP,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (product_id) REFERENCES products(id)
      )
    `);
    return;
  }

  const hasAvailable = columns.some((c) => c.name === 'available');
  const hasUnavailableReason = columns.some((c) => c.name === 'unavailable_reason');
  const priceCol = columns.find((c) => c.name === 'price');
  const hasPriceNullable = priceCol?.notnull === 0;

  if (hasAvailable && hasUnavailableReason && hasPriceNullable) return; // already up to date

  // Need to recreate the table
  await dbRun(db, 'DROP TABLE IF EXISTS price_history_new');

  await dbRun(db, `
    CREATE TABLE price_history_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      price REAL,
      available BOOLEAN DEFAULT 1,
      unavailable_reason TEXT,
      date DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (product_id) REFERENCES products(id)
    )
  `);

  const oldCols = columns.map((c) => c.name);
  const copyAvailable = oldCols.includes('available') ? 'available' : '1';
  const copyUnavailableReason = oldCols.includes('unavailable_reason')
    ? 'unavailable_reason'
    : 'NULL';
  await dbRun(db, `
    INSERT INTO price_history_new (id, product_id, price, available, unavailable_reason, date, created_at)
    SELECT id, product_id, price, ${copyAvailable}, ${copyUnavailableReason},
           COALESCE(date, created_at, CURRENT_TIMESTAMP),
           COALESCE(created_at, CURRENT_TIMESTAMP)
    FROM price_history
  `);

  await dbRun(db, 'DROP TABLE price_history');
  await dbRun(db, 'ALTER TABLE price_history_new RENAME TO price_history');
}

// ---------------------------------------------------------------------------
// Step 4 — migrate products table (add user_id column if missing)
// ---------------------------------------------------------------------------

async function migrateProductsTable(db: sqlite3.Database): Promise<void> {
  const exists = await dbGet<{ name: string }>(
    db,
    "SELECT name FROM sqlite_master WHERE type='table' AND name='products'"
  );

  if (!exists) {
    await dbRun(db, `
      CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        asin TEXT NOT NULL,
        description TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE(user_id, asin)
      )
    `);
    return;
  }

  const columns = await dbAll<{ name: string }>(db, 'PRAGMA table_info(products)');
  const hasUserId = columns.some((c) => c.name === 'user_id');

  if (hasUserId) return;

  const row = await dbGet<{ count: number }>(db, 'SELECT COUNT(*) as count FROM products');
  if (row && row.count > 0) {
    console.log('Warning: migrating products table — existing products will be assigned to user id 1');
  }

  await dbRun(db, `
    CREATE TABLE IF NOT EXISTS products_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL DEFAULT 1,
      asin TEXT NOT NULL,
      description TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(user_id, asin)
    )
  `);
  await dbRun(db, 'INSERT INTO products_new (id, asin, description, created_at) SELECT id, asin, description, created_at FROM products');
  await dbRun(db, 'DROP TABLE IF EXISTS products');
  await dbRun(db, 'ALTER TABLE products_new RENAME TO products');
}

// ---------------------------------------------------------------------------
// Step 5 — create indexes
// ---------------------------------------------------------------------------

async function createIndexes(db: sqlite3.Database): Promise<void> {
  for (const sql of [
    'CREATE INDEX IF NOT EXISTS idx_product_id ON price_history(product_id)',
    'CREATE INDEX IF NOT EXISTS idx_asin ON products(asin)',
    'CREATE INDEX IF NOT EXISTS idx_products_user ON products(user_id)',
    'CREATE INDEX IF NOT EXISTS idx_category_name ON categories(name)',
    'CREATE INDEX IF NOT EXISTS idx_product_category_product ON product_categories(product_id)',
    'CREATE INDEX IF NOT EXISTS idx_product_category_category ON product_categories(category_id)',
    'CREATE INDEX IF NOT EXISTS idx_product_category_level ON product_categories(level)',
    'CREATE INDEX IF NOT EXISTS idx_user_lists_user ON user_lists(user_id)',
    'CREATE INDEX IF NOT EXISTS idx_product_lists_product ON product_lists(product_id)',
    'CREATE INDEX IF NOT EXISTS idx_product_lists_list ON product_lists(list_id)',
    'CREATE INDEX IF NOT EXISTS idx_audit_log_admin ON audit_log(admin_user_id)',
    'CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at)',
    'CREATE INDEX IF NOT EXISTS idx_audit_log_target ON audit_log(target_type, target_id)',
  ]) {
    await dbRun(db, sql);
  }
}

// ---------------------------------------------------------------------------
// Step 6 — seed system_config defaults
// ---------------------------------------------------------------------------

async function initializeSystemConfig(db: sqlite3.Database): Promise<void> {
  const defaults = [
    { key: 'quota_max_products', value: '100', description: 'Max products per user' },
    { key: 'quota_max_lists', value: '20', description: 'Max lists per user' },
    { key: 'scheduler_enabled', value: 'true', description: 'Enable automatic price updates' },
    { key: 'scheduler_cron', value: '0 0 * * *', description: 'Cron schedule for price updates' },
  ];
  for (const { key, value, description } of defaults) {
    await dbRun(
      db,
      'INSERT OR IGNORE INTO system_config (key, value, description) VALUES (?, ?, ?)',
      [key, value, description]
    );
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function createMigrations(db: sqlite3.Database) {
  return {
    async run(): Promise<void> {
      await createBaseTables(db);
      await migrateUsersTable(db);
      await migratePriceHistoryTable(db);
      await migrateProductsTable(db);
      await createIndexes(db);
      await initializeSystemConfig(db);
    },
  };
}
```

- [ ] **Step 2: Verify TypeScript compilation**

```bash
cd backend && npm run build 2>&1 | head -30
```

Expected: no errors in `db/migrations.ts` or `db/helpers.ts`.

- [ ] **Step 3: Commit**

```bash
git add backend/src/services/db/
git commit -m "refactor: add migrations module with flat async/await"
```

---

### Task 3: Create `db/product-repo.ts`

**Files:**
- Create: `backend/src/services/db/product-repo.ts`

Moves these methods out of `database.ts` (current line ranges for reference):
- `getOrCreateCategory` (L421), `setProductCategories` (L452), `getProductCategories` (L492), `getAllCategories` (L723)
- `addProduct` (L517), `getProductById` (L562), `getProductByASIN` (L592), `getAllProducts` (L622), `searchProducts` (L672), `deleteProduct` (L736)
- `getLastPrice` (L757), `addPriceHistory` (L771), `getPriceHistory` (L792), `getProductWithPriceHistory` (L805)
- `getBiggestPriceDrops` (L829), `getBiggestPriceIncreases` (L901)
- `getProductCount` (L973), `getListCount` (L986)
- `getProductsWithLists` (L1318), `getProductsCount` (L1379), `getAllProductIdsSorted` (L1412), `getListProducts` (L1435)

**Pattern note:** Cross-method calls use `repo.method()` via a named `const repo` variable assigned before `return repo`. This avoids `this`-binding pitfalls in plain object literals (destructuring a method would lose `this`, causing silent runtime failures in strict mode).

- [ ] **Step 1: Create `backend/src/services/db/product-repo.ts`**

```ts
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
    const existing = await dbGet<Category>(db, 'SELECT * FROM categories WHERE name = ?', [name]);
    if (existing) return existing;
    return new Promise((resolve, reject) => {
      db.run('INSERT INTO categories (name) VALUES (?)', [name], function (err) {
        if (err) { reject(err); return; }
        resolve({ id: this.lastID, name });
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
      const rows = await dbAll<{ id: number; name: string }>(
        db,
        `SELECT c.id, c.name FROM categories c
         JOIN product_categories pc ON c.id = pc.category_id
         WHERE pc.product_id = ?
         ORDER BY pc.level ASC`,
        [productId]
      );
      return rows.map((r) => ({ id: r.id, name: r.name }));
    },

    async getAllCategories(): Promise<Category[]> {
      return dbAll<Category>(db, 'SELECT * FROM categories ORDER BY name ASC');
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
              unavailable_reason: unavailableReason ?? null,
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
      const latest = history.find((h) => h.available !== false);
      return {
        ...product,
        price_history: history,
        current_price: latest?.price ?? null,
        available: history[0]?.available ?? true,
        unavailable_reason: history[0]?.unavailable_reason ?? null,
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
      const drops: PriceDrop[] = await Promise.all(
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
      const increases: PriceDrop[] = await Promise.all(
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
```

- [ ] **Step 2: Verify TypeScript compilation**

```bash
cd backend && npm run build 2>&1 | head -40
```

Expected: no errors in `db/product-repo.ts`.

- [ ] **Step 3: Commit**

```bash
git add backend/src/services/db/product-repo.ts
git commit -m "refactor: add product-repo (products, categories, price history)"
```

---

## Chunk 2: User Repo + List Repo + Admin Repo + Facade Rewrite

### Task 4: Create `db/user-repo.ts`

**Files:**
- Create: `backend/src/services/db/user-repo.ts`

Moves these methods from `database.ts`:
- `createUser` (L1014), `createAdminUser` (L1038), `createUserWithRole` (L1774)
- `setUserRole` (L1062), `getUserByUsername` (L1075), `updateUserPassword` (L1100)
- `getUserById` (L1118), `getAllUsers` (L1142)
- `disableUser` (L1804), `enableUser` (L1817)
- `getUserStats` (L1746), `getSystemStats` (L1830)
- `getUserSchedule` (L1681), `setUserSchedule` (L1698), `updateUserScheduleLastRun` (L1717), `getUsersWithEnabledSchedules` (L1730)

- [ ] **Step 1: Create `backend/src/services/db/user-repo.ts`**

```ts
import sqlite3 from 'sqlite3';
import bcrypt from 'bcrypt';
import { User, UserWithPasswordHash, UserRole, UserStats, SystemStats } from '../../models/types';
import { dbRun, dbAll, dbGet } from './helpers';

export function createUserRepo(db: sqlite3.Database) {
  const repo = {
    async createUser(username: string, password: string): Promise<User> {
      const hash = await bcrypt.hash(password, 10);
      return new Promise((resolve, reject) => {
        db.run(
          "INSERT INTO users (username, password_hash, role) VALUES (?, ?, 'USER')",
          [username, hash],
          function (err) {
            if (err) { reject(err); return; }
            resolve({ id: this.lastID, username, role: 'USER' as UserRole, is_disabled: false });
          }
        );
      });
    },

    async createAdminUser(username: string, password: string): Promise<User> {
      const hash = await bcrypt.hash(password, 10);
      return new Promise((resolve, reject) => {
        db.run(
          "INSERT INTO users (username, password_hash, role) VALUES (?, ?, 'ADMIN')",
          [username, hash],
          function (err) {
            if (err) { reject(err); return; }
            resolve({ id: this.lastID, username, role: 'ADMIN' as UserRole, is_disabled: false });
          }
        );
      });
    },

    async createUserWithRole(username: string, password: string, role: string): Promise<User> {
      const validRoles: UserRole[] = ['USER', 'ADMIN'];
      if (!validRoles.includes(role as UserRole)) {
        throw new Error(`Invalid role: ${role}. Must be one of: ${validRoles.join(', ')}`);
      }
      const hash = await bcrypt.hash(password, 10);
      return new Promise((resolve, reject) => {
        db.run(
          'INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)',
          [username, hash, role],
          function (err) {
            if (err) { reject(err); return; }
            resolve({ id: this.lastID, username, role: role as UserRole, is_disabled: false });
          }
        );
      });
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
      const hash = await bcrypt.hash(newPassword, 10);
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
      const rows = await dbAll<any>(db, 'SELECT * FROM users ORDER BY created_at ASC');
      return rows.map((r) => ({
        id: r.id,
        username: r.username,
        role: r.role as UserRole,
        is_disabled: Boolean(r.is_disabled),
        created_at: r.created_at,
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
```

- [ ] **Step 2: Verify TypeScript compilation**

```bash
cd backend && npm run build 2>&1 | head -40
```

Expected: no errors in `db/user-repo.ts`.

- [ ] **Step 3: Commit**

```bash
git add backend/src/services/db/user-repo.ts
git commit -m "refactor: add user-repo (users, schedules, stats)"
```

---

### Task 5: Create `db/list-repo.ts`

**Files:**
- Create: `backend/src/services/db/list-repo.ts`

Moves these methods from `database.ts`:
- `createList` (L1163), `getUserLists` (L1197), `getListById` (L1210)
- `updateList` (L1232), `deleteList` (L1251)
- `addProductToList` (L1265), `removeProductFromList` (L1278), `getProductLists` (L1291)

- [ ] **Step 1: Create `backend/src/services/db/list-repo.ts`**

```ts
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
```

- [ ] **Step 2: Verify TypeScript compilation**

```bash
cd backend && npm run build 2>&1 | head -40
```

Expected: no errors in `db/list-repo.ts`.

- [ ] **Step 3: Commit**

```bash
git add backend/src/services/db/list-repo.ts
git commit -m "refactor: add list-repo (lists, product-list associations)"
```

---

### Task 6: Create `db/admin-repo.ts`

**Files:**
- Create: `backend/src/services/db/admin-repo.ts`

Moves these methods from `database.ts`:
- `logAudit` (L1529), `getAuditLogs` (L1555)
- `getConfig` (L1618), `setConfig` (L1638), `getAllConfig` (L1660)

- [ ] **Step 1: Create `backend/src/services/db/admin-repo.ts`**

```ts
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
              action,
              target_type: targetType ?? null,
              target_id: targetId ?? null,
              details: details ?? null,
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
```

- [ ] **Step 2: Verify TypeScript compilation**

```bash
cd backend && npm run build 2>&1 | head -40
```

Expected: no errors in `db/admin-repo.ts`.

- [ ] **Step 3: Commit**

```bash
git add backend/src/services/db/admin-repo.ts
git commit -m "refactor: add admin-repo (audit log, system config)"
```

---

### Task 7: Rewrite `database.ts` as thin facade

**Files:**
- Modify: `backend/src/services/database.ts` (replace entire file)

This is the capstone task. The new `database.ts` replaces the 1,861-line class with a ~70-line coordinator. All public methods come from the repos via `Object.assign`.

- [ ] **Step 1: Replace `backend/src/services/database.ts` entirely**

```ts
import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';

import { createMigrations } from './db/migrations';
import { createProductRepo, ProductRepo } from './db/product-repo';
import { createUserRepo, UserRepo } from './db/user-repo';
import { createListRepo, ListRepo } from './db/list-repo';
import { createAdminRepo, AdminRepo } from './db/admin-repo';

// DB file lives at <project-root>/database/products.db
// __dirname is backend/src/services (source) or backend/dist/services (compiled)
const DB_PATH = path.resolve(__dirname, '../../../database/products.db');
const DB_DIR = path.dirname(DB_PATH);

// The public interface of dbService is the union of all four repos.
type AllRepos = ProductRepo & UserRepo & ListRepo & AdminRepo;

export class DatabaseService {
  readonly ready: Promise<void>;
  private resolveReady!: () => void;
  // Index signature allows Object.assign to spread repo methods onto this instance
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;

  constructor() {
    this.ready = new Promise<void>((resolve) => {
      this.resolveReady = resolve;
    });

    if (!fs.existsSync(DB_DIR)) {
      fs.mkdirSync(DB_DIR, { recursive: true });
      console.log(`Created database directory: ${DB_DIR}`);
    }

    new sqlite3.Database(DB_PATH, async (err) => {
      if (err) {
        console.error('Error opening database:', err);
        return;
      }
      console.log('Connected to SQLite database');
      try {
        const db = arguments[0] as sqlite3.Database; // captured in callback
        await createMigrations(db).run();

        // admin-repo owns getConfig; pass it to repos that need quota checks
        const adminRepo = createAdminRepo(db);
        const getConfig = adminRepo.getConfig.bind(adminRepo);

        Object.assign(this, createProductRepo(db, getConfig));
        Object.assign(this, createUserRepo(db));
        Object.assign(this, createListRepo(db, getConfig));
        Object.assign(this, adminRepo);

        this.resolveReady();
      } catch (migrationErr) {
        console.error('Database migration failed:', migrationErr);
        // Do NOT resolve — server will hang at `await dbService.ready` and surface the error
      }
    });
  }
}

// Re-typed singleton: callers see the full method surface without `any`
export const dbService = new DatabaseService() as DatabaseService & AllRepos;
```

> **Implementation note:** The `arguments[0]` trick inside an async callback does NOT work — `arguments` is not available in arrow functions or async functions. Use the pattern below instead. Replace the `new sqlite3.Database(...)` block with:

```ts
    const db = new sqlite3.Database(DB_PATH, async (err) => {
      if (err) {
        console.error('Error opening database:', err);
        return;
      }
      console.log('Connected to SQLite database');
      try {
        await createMigrations(db).run();

        const adminRepo = createAdminRepo(db);
        const getConfig = adminRepo.getConfig.bind(adminRepo);

        Object.assign(this, createProductRepo(db, getConfig));
        Object.assign(this, createUserRepo(db));
        Object.assign(this, createListRepo(db, getConfig));
        Object.assign(this, adminRepo);

        this.resolveReady();
      } catch (migrationErr) {
        console.error('Database migration failed:', migrationErr);
      }
    });
```

The full corrected file content is:

```ts
import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';

import { createMigrations } from './db/migrations';
import { createProductRepo, ProductRepo } from './db/product-repo';
import { createUserRepo, UserRepo } from './db/user-repo';
import { createListRepo, ListRepo } from './db/list-repo';
import { createAdminRepo, AdminRepo } from './db/admin-repo';

const DB_PATH = path.resolve(__dirname, '../../../database/products.db');
const DB_DIR = path.dirname(DB_PATH);

type AllRepos = ProductRepo & UserRepo & ListRepo & AdminRepo;

export class DatabaseService {
  readonly ready: Promise<void>;
  private resolveReady!: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;

  constructor() {
    this.ready = new Promise<void>((resolve) => {
      this.resolveReady = resolve;
    });

    if (!fs.existsSync(DB_DIR)) {
      fs.mkdirSync(DB_DIR, { recursive: true });
      console.log(`Created database directory: ${DB_DIR}`);
    }

    const db = new sqlite3.Database(DB_PATH, async (err) => {
      if (err) {
        console.error('Error opening database:', err);
        return;
      }
      console.log('Connected to SQLite database');
      try {
        await createMigrations(db).run();

        const adminRepo = createAdminRepo(db);
        const getConfig = adminRepo.getConfig.bind(adminRepo);

        Object.assign(this, createProductRepo(db, getConfig));
        Object.assign(this, createUserRepo(db));
        Object.assign(this, createListRepo(db, getConfig));
        Object.assign(this, adminRepo);

        this.resolveReady();
      } catch (migrationErr) {
        console.error('Database migration failed:', migrationErr);
      }
    });
  }
}

export const dbService = new DatabaseService() as DatabaseService & AllRepos;
```

- [ ] **Step 2: Verify TypeScript compilation**

```bash
cd backend && npm run build 2>&1
```

Expected: clean build. If TypeScript complains about the `[key: string]: any` index signature conflicting with the typed properties (`ready`, `resolveReady`), add `readonly ready: Promise<void>` explicitly and ensure `resolveReady` is typed as `() => void`.

- [ ] **Step 3: Smoke test — start the dev server and confirm no startup errors**

```bash
cd backend && npm run dev 2>&1 | head -20
```

Expected output (all four lines, in order):
```
Server running on port 3000
Server accessible on all interfaces (including Tailscale)
Connected to SQLite database
System scheduler started successfully
```

No `SQLITE_ERROR: no such table` errors. No `Error setting up user schedulers` errors.

- [ ] **Step 4: Confirm the old 1,861-line class body is gone** — the file should now contain only the ~50-line facade shown in Step 1. Verify with `wc -l backend/src/services/database.ts` (expect ≤ 60 lines).

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/database.ts
git commit -m "refactor: rewrite database.ts as thin facade over repo modules"
```

---

### Task 8: Final verification

- [ ] **Step 1: Full TypeScript build**

```bash
cd backend && npm run build 2>&1
```

Expected: no errors in any `src/services/db/*.ts` or `src/services/database.ts` file.

- [ ] **Step 2: Verify line count improvement**

```bash
wc -l backend/src/services/database.ts backend/src/services/db/*.ts
```

Expected: `database.ts` ≈ 50 lines; no individual repo file exceeds 600 lines.

- [ ] **Step 3: End-to-end smoke test** — with the dev server running from Task 7 Step 3, confirm a route responds:

```bash
curl -s http://localhost:3000/health
```

Expected: `{"status":"ok"}`

- [ ] **Step 4: Final commit**

```bash
git add backend/src/services/
git commit -m "refactor: complete database.ts split into focused repo modules

- migrations.ts: flat async/await schema migrations
- product-repo.ts: products, categories, price history, dashboard
- user-repo.ts: users, user schedule, stats
- list-repo.ts: lists and product-list associations
- admin-repo.ts: audit log and system config
- database.ts: thin facade (~50 lines), routes unchanged"
```
