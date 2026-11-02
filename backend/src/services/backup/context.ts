import sqlite3 from 'sqlite3';
import { dbAll, dbGet } from '../db/helpers';
import { Issue, toStorageDate } from './format';
import { ValidationContext } from './validate';

/** Tables and columns the restore reads or writes. Missing ones make every file incompatible. */
export const REQUIRED_SCHEMA: Record<string, string[]> = {
  products: ['id', 'user_id', 'asin', 'description', 'image_url', 'created_at'],
  price_history: ['id', 'product_id', 'price', 'available', 'unavailable_reason', 'date', 'created_at'],
  user_lists: ['id', 'user_id', 'name', 'created_at'],
  product_lists: ['product_id', 'list_id'],
  categories: ['id', 'name'],
  product_categories: ['product_id', 'category_id', 'level'],
  notification_rules: ['id', 'product_id'],
  notification_log: ['rule_id', 'product_id'],
};

export interface ContextDeps {
  getConfig(key: string): Promise<string | null>;
  isUpdateInProgress(): boolean;
}

/** One SERVER_SCHEMA_MISMATCH error per missing table (no column) or missing column. */
export async function checkLiveSchema(db: sqlite3.Database): Promise<Issue[]> {
  const issues: Issue[] = [];
  for (const [table, columns] of Object.entries(REQUIRED_SCHEMA)) {
    // Table names come from the constant above, never from input.
    const info = await dbAll<{ name: string }>(db, `PRAGMA table_info(${table})`);
    if (info.length === 0) {
      issues.push({ severity: 'error', code: 'SERVER_SCHEMA_MISMATCH', path: '$', params: { table } });
      continue;
    }
    const present = new Set(info.map((c) => c.name));
    for (const column of columns) {
      if (!present.has(column)) {
        issues.push({ severity: 'error', code: 'SERVER_SCHEMA_MISMATCH', path: '$', params: { table, column } });
      }
    }
  }
  return issues;
}

async function quota(deps: ContextDeps, key: string, fallback: number): Promise<number> {
  const raw = await deps.getConfig(key);
  const n = raw === null ? NaN : parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

/** Everything validateBackup needs to know about the user's current data. */
export async function loadValidationContext(
  db: sqlite3.Database,
  userId: number,
  deps: ContextDeps
): Promise<ValidationContext> {
  const user = await dbGet<{ username: string }>(db, 'SELECT username FROM users WHERE id = ?', [userId]);
  const ctx: ValidationContext = {
    existingAsins: new Set(),
    existingListNames: new Set(),
    existingPriceKeys: new Set(),
    existingMemberships: new Set(),
    existingCounts: { products: 0, pricePoints: 0, lists: 0 },
    productNotificationRuleCount: 0,
    quotas: {
      maxProducts: await quota(deps, 'quota_max_products', 100),
      maxLists: await quota(deps, 'quota_max_lists', 20),
    },
    currentUsername: user?.username ?? '',
    updateInProgress: deps.isUpdateInProgress(),
    schemaIssues: await checkLiveSchema(db),
  };
  // The queries below would fail on a broken schema; the issues already make the file incompatible.
  if (ctx.schemaIssues.length > 0) return ctx;

  const products = await dbAll<{ asin: string }>(db, 'SELECT asin FROM products WHERE user_id = ?', [userId]);
  for (const p of products) ctx.existingAsins.add(p.asin);

  const lists = await dbAll<{ name: string }>(db, 'SELECT name FROM user_lists WHERE user_id = ?', [userId]);
  for (const l of lists) ctx.existingListNames.add(l.name.trim());

  const prices = await dbAll<{ asin: string; date: string }>(
    db,
    `SELECT p.asin, ph.date FROM price_history ph
       JOIN products p ON p.id = ph.product_id
      WHERE p.user_id = ?`,
    [userId]
  );
  for (const r of prices) ctx.existingPriceKeys.add(`${r.asin}|${toStorageDate(String(r.date)) ?? r.date}`);

  const memberships = await dbAll<{ asin: string; name: string }>(
    db,
    `SELECT p.asin, ul.name FROM product_lists pl
       JOIN products p ON p.id = pl.product_id
       JOIN user_lists ul ON ul.id = pl.list_id
      WHERE p.user_id = ? AND ul.user_id = ?`,
    [userId, userId]
  );
  for (const m of memberships) ctx.existingMemberships.add(`${m.asin}|${m.name.trim()}`);

  const rules = await dbGet<{ n: number }>(
    db,
    'SELECT COUNT(*) AS n FROM notification_rules WHERE product_id IN (SELECT id FROM products WHERE user_id = ?)',
    [userId]
  );

  ctx.existingCounts = { products: products.length, pricePoints: prices.length, lists: lists.length };
  ctx.productNotificationRuleCount = rules?.n ?? 0;
  return ctx;
}
