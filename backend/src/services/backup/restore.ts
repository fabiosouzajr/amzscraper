import sqlite3 from 'sqlite3';
import { isDeepStrictEqual } from 'node:util';
import { dbAll, dbRun } from '../db/helpers';
import { MergePreview, ReplacePreview, RestoreMode, RestoreResult, ValidationReport } from './format';
import { NormalizedBackup, ValidationContext, validateBackup } from './validate';
import { loadValidationContext } from './context';

export type RestoreErrorCode =
  | 'CONFIRM_REQUIRED' | 'UPDATE_IN_PROGRESS' | 'INCOMPATIBLE' | 'QUOTA_EXCEEDED' | 'DATA_CHANGED';

export class RestoreError extends Error {
  constructor(
    public status: 400 | 409 | 422,
    public code: RestoreErrorCode,
    public report?: ValidationReport
  ) {
    super(code);
    this.name = 'RestoreError';
  }
}

export interface RestoreDeps {
  openConnection(): Promise<sqlite3.Database>;
  getConfig(key: string): Promise<string | null>;
  isUpdateInProgress(): boolean;
  beforeCommit?(db: sqlite3.Database): Promise<void>;
}

export interface RestoreOptions {
  mode: RestoreMode;
  confirmReplace?: boolean;
  expected: MergePreview | ReplacePreview;
}

type RunResult = { changes: number; lastID: number };

function exec(db: sqlite3.Database, sql: string, params: unknown[] = []): Promise<RunResult> {
  return new Promise((resolve, reject) =>
    db.run(sql, params, function (this: sqlite3.RunResult, err) {
      if (err) reject(err);
      else resolve({ changes: this.changes, lastID: this.lastID });
    })
  );
}

function prepare(db: sqlite3.Database, sql: string): Promise<sqlite3.Statement> {
  return new Promise((resolve, reject) => {
    const stmt = db.prepare(sql, (err) => (err ? reject(err) : resolve(stmt)));
  });
}

function runStmt(stmt: sqlite3.Statement, params: unknown[]): Promise<RunResult> {
  return new Promise((resolve, reject) =>
    stmt.run(params, function (this: sqlite3.RunResult, err) {
      if (err) reject(err);
      else resolve({ changes: this.changes, lastID: this.lastID });
    })
  );
}

function getStmt<T>(stmt: sqlite3.Statement, params: unknown[]): Promise<T | undefined> {
  return new Promise((resolve, reject) =>
    stmt.get(params, (err, row) => (err ? reject(err) : resolve(row as T | undefined)))
  );
}

function finalize(stmt: sqlite3.Statement): Promise<void> {
  return new Promise((resolve) => stmt.finalize(() => resolve()));
}

function close(db: sqlite3.Database): Promise<void> {
  return new Promise((resolve) => db.close(() => resolve()));
}

const USER_PRODUCTS = 'SELECT id FROM products WHERE user_id = ?';

/** Deletes the user's products, prices, lists and product-specific notification rules (spec §2 order). */
async function deleteUserData(db: sqlite3.Database, userId: number) {
  await exec(db,
    `DELETE FROM notification_log
      WHERE product_id IN (${USER_PRODUCTS})
         OR rule_id IN (SELECT id FROM notification_rules WHERE product_id IN (${USER_PRODUCTS}))`,
    [userId, userId]);
  const rules = await exec(db, `DELETE FROM notification_rules WHERE product_id IN (${USER_PRODUCTS})`, [userId]);
  await exec(db,
    `DELETE FROM product_lists
      WHERE product_id IN (${USER_PRODUCTS})
         OR list_id IN (SELECT id FROM user_lists WHERE user_id = ?)`,
    [userId, userId]);
  await exec(db, `DELETE FROM product_categories WHERE product_id IN (${USER_PRODUCTS})`, [userId]);
  const prices = await exec(db, `DELETE FROM price_history WHERE product_id IN (${USER_PRODUCTS})`, [userId]);
  const products = await exec(db, 'DELETE FROM products WHERE user_id = ?', [userId]);
  const lists = await exec(db, 'DELETE FROM user_lists WHERE user_id = ?', [userId]);
  return {
    productsDeleted: products.changes,
    pricePointsDeleted: prices.changes,
    listsDeleted: lists.changes,
    notificationRulesDeleted: rules.changes,
  };
}

/**
 * Inserts the normalized backup. `ctx` describes what already exists (use an empty
 * context after a replace delete): existing products are left untouched, only their
 * missing price points and memberships are added.
 */
async function insertBackup(db: sqlite3.Database, userId: number, data: NormalizedBackup, ctx: ValidationContext) {
  const counts = { productsAdded: 0, pricePointsAdded: 0, listsAdded: 0, membershipsAdded: 0 };

  // trimmed name -> oldest list id (by created_at, then id)
  const listIds = new Map<string, number>();
  const productIds = new Map<string, number>();
  if (ctx.existingCounts.lists > 0) {
    const rows = await dbAll<{ id: number; name: string }>(
      db, 'SELECT id, name FROM user_lists WHERE user_id = ? ORDER BY created_at, id', [userId]);
    for (const r of rows) {
      const name = r.name.trim();
      if (!listIds.has(name)) listIds.set(name, r.id);
    }
  }
  if (ctx.existingCounts.products > 0) {
    const rows = await dbAll<{ id: number; asin: string }>(
      db, 'SELECT id, asin FROM products WHERE user_id = ?', [userId]);
    for (const r of rows) productIds.set(r.asin, r.id);
  }

  const stmts: sqlite3.Statement[] = [];
  const stmt = async (sql: string) => {
    const s = await prepare(db, sql);
    stmts.push(s);
    return s;
  };
  try {
    const insList = await stmt('INSERT INTO user_lists (user_id, name, created_at) VALUES (?, ?, ?)');
    const insProduct = await stmt(
      'INSERT INTO products (user_id, asin, description, image_url, created_at) VALUES (?, ?, ?, ?, ?)');
    const insCategory = await stmt('INSERT OR IGNORE INTO categories (name) VALUES (?)');
    const selCategory = await stmt('SELECT id FROM categories WHERE name = ?');
    const insProductCategory = await stmt(
      'INSERT OR IGNORE INTO product_categories (product_id, category_id, level) VALUES (?, ?, ?)');
    const insPrice = await stmt(
      `INSERT INTO price_history (product_id, price, available, unavailable_reason, date, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`);
    const insMembership = await stmt('INSERT OR IGNORE INTO product_lists (product_id, list_id) VALUES (?, ?)');

    for (const l of data.lists) {
      if (listIds.has(l.name)) continue;
      const r = await runStmt(insList, [userId, l.name, l.createdAt]);
      listIds.set(l.name, r.lastID);
      counts.listsAdded++;
    }

    const categoryIds = new Map<string, number>();
    const categoryId = async (name: string) => {
      let id = categoryIds.get(name);
      if (id === undefined) {
        await runStmt(insCategory, [name]);
        id = (await getStmt<{ id: number }>(selCategory, [name]))!.id;
        categoryIds.set(name, id);
      }
      return id;
    };

    for (const p of data.products) {
      let pid = productIds.get(p.asin);
      const existing = pid !== undefined;
      if (pid === undefined) {
        pid = (await runStmt(insProduct, [userId, p.asin, p.description, p.imageUrl, p.createdAt])).lastID;
        productIds.set(p.asin, pid);
        counts.productsAdded++;
        for (const [level, name] of p.categories.entries()) {
          await runStmt(insProductCategory, [pid, await categoryId(name), level]);
        }
      }
      for (const pt of p.priceHistory) {
        if (existing && ctx.existingPriceKeys.has(`${p.asin}|${pt.date}`)) continue;
        await runStmt(insPrice, [pid, pt.price, pt.available ? 1 : 0, pt.unavailableReason, pt.date, pt.date]);
        counts.pricePointsAdded++;
      }
      for (const name of p.lists) {
        if (ctx.existingMemberships.has(`${p.asin}|${name}`)) continue;
        const r = await runStmt(insMembership, [pid, listIds.get(name)]);
        counts.membershipsAdded += r.changes;
      }
    }
  } finally {
    await Promise.all(stmts.map(finalize));
  }
  return counts;
}

const emptyContext = (base: ValidationContext): ValidationContext => ({
  ...base,
  existingAsins: new Set(),
  existingListNames: new Set(),
  existingPriceKeys: new Set(),
  existingMemberships: new Set(),
  existingCounts: { products: 0, pricePoints: 0, lists: 0 },
});

/** Validates and writes a backup for one user on a dedicated connection, in one IMMEDIATE transaction. */
export async function restoreBackup(
  userId: number,
  input: unknown,
  opts: RestoreOptions,
  deps: RestoreDeps
): Promise<RestoreResult> {
  const started = Date.now();
  const { mode } = opts;
  if (mode === 'replace' && opts.confirmReplace !== true) throw new RestoreError(400, 'CONFIRM_REQUIRED');
  if (deps.isUpdateInProgress()) throw new RestoreError(409, 'UPDATE_IN_PROGRESS');

  const db = await deps.openConnection();
  try {
    await dbRun(db, 'BEGIN IMMEDIATE');
    try {
      const ctx = await loadValidationContext(db, userId, deps);
      const { report, data } = validateBackup(input, ctx);
      if (!report.compatible || !data) throw new RestoreError(422, 'INCOMPATIBLE', report);
      if (!report.quotaOk[mode]) throw new RestoreError(422, 'QUOTA_EXCEEDED', report);
      if (!isDeepStrictEqual(report.preview[mode], opts.expected)) {
        throw new RestoreError(409, 'DATA_CHANGED', report);
      }

      let result: RestoreResult;
      if (mode === 'replace') {
        const deleted = await deleteUserData(db, userId);
        const added = await insertBackup(db, userId, data, emptyContext(ctx));
        result = { mode, ...added, ...deleted, durationMs: 0 };
      } else {
        const added = await insertBackup(db, userId, data, ctx);
        result = { mode, ...added, durationMs: 0 };
      }

      if (deps.beforeCommit) await deps.beforeCommit(db);
      await dbRun(db, 'COMMIT');
      result.durationMs = Date.now() - started;
      return result;
    } catch (e) {
      await dbRun(db, 'ROLLBACK').catch(() => undefined);
      throw e;
    }
  } finally {
    await close(db);
  }
}
