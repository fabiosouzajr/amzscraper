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

  notificationChannels: `
    CREATE TABLE IF NOT EXISTS notification_channels (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('email', 'telegram', 'discord')),
      name TEXT NOT NULL,
      config TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`,

  notificationRules: `
    CREATE TABLE IF NOT EXISTS notification_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      product_id INTEGER,
      channel_id INTEGER NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('lowest_in_days', 'below_threshold', 'percentage_drop')),
      params TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
      FOREIGN KEY (channel_id) REFERENCES notification_channels(id) ON DELETE CASCADE
    )`,

  notificationLog: `
    CREATE TABLE IF NOT EXISTS notification_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      rule_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      channel_id INTEGER NOT NULL,
      trigger_type TEXT NOT NULL,
      message TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('sent', 'failed')),
      error_message TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (rule_id) REFERENCES notification_rules(id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
      FOREIGN KEY (channel_id) REFERENCES notification_channels(id) ON DELETE CASCADE
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
    DDL.notificationChannels,
    DDL.notificationRules,
    DDL.notificationLog,
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
        image_url TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE(user_id, asin)
      )
    `);
    return;
  }

  const columns = await dbAll<{ name: string }>(db, 'PRAGMA table_info(products)');
  const hasUserId = columns.some((c) => c.name === 'user_id');
  const hasImageUrl = columns.some((c) => c.name === 'image_url');

  if (hasUserId) {
    if (!hasImageUrl) {
      await dbRun(db, 'ALTER TABLE products ADD COLUMN image_url TEXT');
    }
    return;
  }

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
      image_url TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(user_id, asin)
    )
  `);
  const oldCols = columns.map((c) => c.name);
  const copyImageUrl = oldCols.includes('image_url') ? 'image_url' : 'NULL';
  await dbRun(
    db,
    `INSERT INTO products_new (id, asin, description, image_url, created_at)
     SELECT id, asin, description, ${copyImageUrl}, created_at FROM products`
  );
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
    'CREATE INDEX IF NOT EXISTS idx_notification_channels_user ON notification_channels(user_id)',
    'CREATE INDEX IF NOT EXISTS idx_notification_rules_user ON notification_rules(user_id)',
    'CREATE INDEX IF NOT EXISTS idx_notification_rules_product ON notification_rules(product_id)',
    'CREATE INDEX IF NOT EXISTS idx_notification_log_user ON notification_log(user_id)',
    'CREATE INDEX IF NOT EXISTS idx_notification_log_rule_product ON notification_log(rule_id, product_id)',
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
    { key: 'quota_max_notification_channels', value: '5', description: 'Max notification channels per user' },
    { key: 'quota_max_notification_rules', value: '20', description: 'Max notification rules per user' },
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
