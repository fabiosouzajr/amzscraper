import { test } from 'node:test';
import assert from 'node:assert/strict';
import sqlite3 from 'sqlite3';
import { createTempDb, TempDb } from './helpers/temp-db';
import { openConnection } from '../src/services/backup/connection';
import { buildBackup } from '../src/services/backup/export';
import { validateBackup } from '../src/services/backup/validate';
import { checkLiveSchema, loadValidationContext } from '../src/services/backup/context';
import { restoreBackup, RestoreError } from '../src/services/backup/restore';
import { BackupFileV1, RestoreMode } from '../src/services/backup/format';
import { dbRun, dbGet, dbAll } from '../src/services/db/helpers';

type Deps = {
  openConnection(): Promise<sqlite3.Database>;
  getConfig(key: string): Promise<string | null>;
  isUpdateInProgress(): boolean;
  beforeCommit?(db: sqlite3.Database): Promise<void>;
};

function depsFor(t: TempDb, over: Partial<Deps> = {}): Deps {
  return {
    openConnection: () => openConnection(t.path),
    getConfig: async () => null,
    isUpdateInProgress: () => false,
    ...over,
  };
}

async function previewFor(t: TempDb, userId: number, mode: RestoreMode, file: unknown, deps = depsFor(t)) {
  const ctx = await loadValidationContext(t.db, userId, deps);
  return validateBackup(file, ctx).report.preview[mode];
}

async function restoreWithPreview(
  t: TempDb, userId: number, mode: RestoreMode, file: unknown, over: Partial<Deps> = {}
) {
  const deps = depsFor(t, over);
  const expected = await previewFor(t, userId, mode, file, deps);
  return restoreBackup(userId, file, { mode, confirmReplace: mode === 'replace', expected }, deps);
}

async function counts(t: TempDb, userId: number) {
  const n = async (sql: string) => (await dbGet<{ n: number }>(t.db, sql, [userId]))!.n;
  return {
    products: await n('SELECT COUNT(*) n FROM products WHERE user_id = ?'),
    prices: await n('SELECT COUNT(*) n FROM price_history WHERE product_id IN (SELECT id FROM products WHERE user_id = ?)'),
    lists: await n('SELECT COUNT(*) n FROM user_lists WHERE user_id = ?'),
    memberships: await n('SELECT COUNT(*) n FROM product_lists WHERE product_id IN (SELECT id FROM products WHERE user_id = ?)'),
    categories: await n('SELECT COUNT(*) n FROM product_categories WHERE product_id IN (SELECT id FROM products WHERE user_id = ?)'),
  };
}

const strip = (b: BackupFileV1) => {
  const { exportedAt: _e, username: _u, ...rest } = b;
  return rest;
};

async function seedAlice(t: TempDb, alice: number) {
  await t.addProduct(alice, 'B0ABCDEF12', {
    description: 'Alpha', categories: ['Top', 'Mid'], lists: ['Wishlist', 'Gifts'],
    prices: [
      { date: '2026-01-01 10:00:00', price: 10.5 },
      { date: '2026-01-02 10:00:00', price: null, available: false, reason: 'Out of stock' },
    ],
  });
  await t.addProduct(alice, 'B0ZZZZZZZ9', {
    description: 'Zeta', lists: ['Wishlist'], prices: [{ date: '2026-01-03 10:00:00', price: 3 }],
  });
}

async function backupOf(t: TempDb, userId: number, username: string) {
  return JSON.parse(JSON.stringify(await buildBackup(t.db, userId, { username, appVersion: '1.0.0' })));
}

async function assertRestoreError(p: Promise<unknown>, status: number, code: string) {
  try {
    await p;
  } catch (e) {
    assert.ok(e instanceof RestoreError, `expected RestoreError, got ${e}`);
    assert.equal(e.status, status);
    assert.equal(e.code, code);
    return e;
  }
  assert.fail('expected RestoreError');
}

test('checkLiveSchema reports a missing column', async () => {
  const t = await createTempDb();
  try {
    await dbRun(t.db, `CREATE TABLE products_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, asin TEXT NOT NULL,
      description TEXT NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, UNIQUE(user_id, asin))`);
    await dbRun(t.db, 'DROP TABLE products');
    await dbRun(t.db, 'ALTER TABLE products_new RENAME TO products');
    const issues = await checkLiveSchema(t.db);
    assert.equal(issues.length, 1);
    assert.equal(issues[0].code, 'SERVER_SCHEMA_MISMATCH');
    assert.equal(issues[0].severity, 'error');
    assert.equal(issues[0].params?.table, 'products');
    assert.equal(issues[0].params?.column, 'image_url');
  } finally { await t.cleanup(); }
});

test('round trip into empty user is identical', async () => {
  const t = await createTempDb();
  try {
    const alice = await t.addUser('alice');
    const bob = await t.addUser('bob');
    await seedAlice(t, alice);
    const file = await backupOf(t, alice, 'alice');
    const result = await restoreWithPreview(t, bob, 'merge', file);
    assert.equal(result.productsAdded, 2);
    assert.equal(result.pricePointsAdded, 3);
    assert.equal(result.listsAdded, 2);
    assert.equal(result.membershipsAdded, 3);
    const again = await backupOf(t, bob, 'bob');
    assert.deepEqual(strip(again), strip(file));
  } finally { await t.cleanup(); }
});

test('merge is idempotent', async () => {
  const t = await createTempDb();
  try {
    const alice = await t.addUser('alice');
    const bob = await t.addUser('bob');
    await seedAlice(t, alice);
    const file = await backupOf(t, alice, 'alice');
    await restoreWithPreview(t, bob, 'merge', file);
    const before = await counts(t, bob);
    const second = await restoreWithPreview(t, bob, 'merge', file);
    assert.equal(second.mode, 'merge');
    assert.equal(second.productsAdded, 0);
    assert.equal(second.pricePointsAdded, 0);
    assert.equal(second.listsAdded, 0);
    assert.equal(second.membershipsAdded, 0);
    assert.deepEqual(await counts(t, bob), before);
  } finally { await t.cleanup(); }
});

test('merge never changes existing rows', async () => {
  const t = await createTempDb();
  try {
    const alice = await t.addUser('alice');
    const bob = await t.addUser('bob');
    await t.addProduct(bob, 'B0ABCDEF12', {
      description: 'mine', categories: ['Mine'], prices: [{ date: '2026-01-01 10:00:00', price: 1 }],
    });
    await t.addProduct(alice, 'B0ABCDEF12', {
      description: 'theirs', categories: ['Theirs', 'Deep'],
      prices: [{ date: '2026-01-01 10:00:00', price: 99 }, { date: '2026-01-05 10:00:00', price: 2 }],
    });
    const file = await backupOf(t, alice, 'alice');
    const before = await counts(t, bob);
    const result = await restoreWithPreview(t, bob, 'merge', file);
    assert.equal(result.productsAdded, 0);
    assert.equal(result.pricePointsAdded, 1);
    const after = await counts(t, bob);
    assert.equal(after.prices, before.prices + 1);
    assert.equal(after.categories, before.categories);
    const row = await dbGet<{ description: string }>(t.db, 'SELECT description FROM products WHERE user_id = ?', [bob]);
    assert.equal(row!.description, 'mine');
    const cats = await dbAll<{ name: string }>(t.db, `SELECT c.name FROM product_categories pc
      JOIN categories c ON c.id = pc.category_id JOIN products p ON p.id = pc.product_id WHERE p.user_id = ?`, [bob]);
    assert.deepEqual(cats.map((c) => c.name), ['Mine']);
    const old = await dbGet<{ price: number }>(t.db, `SELECT price FROM price_history WHERE date = '2026-01-01 10:00:00'
      AND product_id IN (SELECT id FROM products WHERE user_id = ?)`, [bob]);
    assert.equal(old!.price, 1);
  } finally { await t.cleanup(); }
});

test('merge adds missing memberships and reuses oldest duplicate-named list', async () => {
  const t = await createTempDb();
  try {
    const alice = await t.addUser('alice');
    const bob = await t.addUser('bob');
    await dbRun(t.db, 'INSERT INTO user_lists (user_id, name, created_at) VALUES (?, ?, ?)', [bob, 'Wishlist', '2026-03-01 00:00:00']);
    await dbRun(t.db, 'INSERT INTO user_lists (user_id, name, created_at) VALUES (?, ?, ?)', [bob, 'Wishlist', '2026-02-01 00:00:00']);
    const older = (await dbGet<{ id: number }>(t.db,
      "SELECT id FROM user_lists WHERE user_id = ? AND created_at = '2026-02-01 00:00:00'", [bob]))!.id;
    await t.addProduct(alice, 'B0ABCDEF12', { description: 'A', lists: ['Wishlist'] });
    const file = await backupOf(t, alice, 'alice');
    const result = await restoreWithPreview(t, bob, 'merge', file);
    assert.equal(result.listsAdded, 0);
    assert.equal(result.membershipsAdded, 1);
    const m = await dbAll<{ list_id: number }>(t.db, `SELECT list_id FROM product_lists
      WHERE product_id IN (SELECT id FROM products WHERE user_id = ?)`, [bob]);
    assert.deepEqual(m.map((r) => r.list_id), [older]);
    assert.equal((await counts(t, bob)).lists, 2);
  } finally { await t.cleanup(); }
});

test('replace leaves other users untouched', async () => {
  const t = await createTempDb();
  try {
    const alice = await t.addUser('alice');
    const bob = await t.addUser('bob');
    await seedAlice(t, alice);
    await t.addProduct(bob, 'B0BOBBOB01', {
      description: 'Bob', categories: ['Top'], lists: ['Bobs'], prices: [{ date: '2026-01-01 10:00:00', price: 7 }],
    });
    const aliceBefore = await counts(t, alice);
    const file = await backupOf(t, alice, 'alice');
    const result = await restoreWithPreview(t, bob, 'replace', file);
    assert.equal(result.mode, 'replace');
    assert.equal(result.productsDeleted, 1);
    assert.equal(result.pricePointsDeleted, 1);
    assert.equal(result.listsDeleted, 1);
    assert.deepEqual(await counts(t, alice), aliceBefore);
    assert.deepEqual(strip(await backupOf(t, bob, 'bob')), strip(file));
    assert.deepEqual(strip(await backupOf(t, alice, 'alice')), strip(file));
  } finally { await t.cleanup(); }
});

test('replace deletes product-specific notification rules only', async () => {
  const t = await createTempDb();
  try {
    const alice = await t.addUser('alice');
    const bob = await t.addUser('bob');
    const bobPid = await t.addProduct(bob, 'B0BOBBOB01', { description: 'Bob' });
    const alicePid = await t.addProduct(alice, 'B0ABCDEF12', { description: 'A' });
    const chan = async (u: number) => {
      await dbRun(t.db, "INSERT INTO notification_channels (user_id, type, name, config) VALUES (?, 'email', 'c', '{}')", [u]);
      return (await dbGet<{ id: number }>(t.db, 'SELECT MAX(id) id FROM notification_channels'))!.id;
    };
    const rule = async (u: number, pid: number | null, ch: number) => {
      await dbRun(t.db, "INSERT INTO notification_rules (user_id, product_id, channel_id, type, params) VALUES (?, ?, ?, 'below_threshold', '{}')", [u, pid, ch]);
      return (await dbGet<{ id: number }>(t.db, 'SELECT MAX(id) id FROM notification_rules'))!.id;
    };
    const bobCh = await chan(bob);
    const aliceCh = await chan(alice);
    const bobProductRule = await rule(bob, bobPid, bobCh);
    const bobGlobalRule = await rule(bob, null, bobCh);
    const aliceRule = await rule(alice, alicePid, aliceCh);
    const log = (u: number, r: number, pid: number, ch: number) => dbRun(t.db,
      "INSERT INTO notification_log (user_id, rule_id, product_id, channel_id, trigger_type, message, status) VALUES (?, ?, ?, ?, 'x', 'm', 'sent')",
      [u, r, pid, ch]);
    await log(bob, bobProductRule, bobPid, bobCh);
    await log(bob, bobGlobalRule, bobPid, bobCh);
    await log(alice, aliceRule, alicePid, aliceCh);

    const file = await backupOf(t, alice, 'alice');
    const result = await restoreWithPreview(t, bob, 'replace', file);
    assert.equal(result.notificationRulesDeleted, 1);
    const rules = await dbAll<{ id: number }>(t.db, 'SELECT id FROM notification_rules WHERE user_id = ?', [bob]);
    assert.deepEqual(rules.map((r) => r.id), [bobGlobalRule]);
    const bobLogs = await dbGet<{ n: number }>(t.db, 'SELECT COUNT(*) n FROM notification_log WHERE user_id = ?', [bob]);
    assert.equal(bobLogs!.n, 0);
    const aliceLogs = await dbGet<{ n: number }>(t.db, 'SELECT COUNT(*) n FROM notification_log WHERE user_id = ?', [alice]);
    assert.equal(aliceLogs!.n, 1);
    const aliceRules = await dbAll<{ id: number }>(t.db, 'SELECT id FROM notification_rules WHERE user_id = ?', [alice]);
    assert.deepEqual(aliceRules.map((r) => r.id), [aliceRule]);
    const channels = await dbGet<{ n: number }>(t.db, 'SELECT COUNT(*) n FROM notification_channels');
    assert.equal(channels!.n, 2);
  } finally { await t.cleanup(); }
});

test('replace requires confirmation', async () => {
  const t = await createTempDb();
  try {
    const alice = await t.addUser('alice');
    const bob = await t.addUser('bob');
    await seedAlice(t, alice);
    await t.addProduct(bob, 'B0BOBBOB01', { description: 'Bob' });
    const file = await backupOf(t, alice, 'alice');
    const deps = depsFor(t);
    const expected = await previewFor(t, bob, 'replace', file);
    const before = await counts(t, bob);
    await assertRestoreError(restoreBackup(bob, file, { mode: 'replace', expected }, deps), 400, 'CONFIRM_REQUIRED');
    assert.deepEqual(await counts(t, bob), before);
  } finally { await t.cleanup(); }
});

test('refuses while update in progress', async () => {
  const t = await createTempDb();
  try {
    const alice = await t.addUser('alice');
    const bob = await t.addUser('bob');
    await seedAlice(t, alice);
    const file = await backupOf(t, alice, 'alice');
    const expected = await previewFor(t, bob, 'merge', file);
    await assertRestoreError(
      restoreBackup(bob, file, { mode: 'merge', expected }, depsFor(t, { isUpdateInProgress: () => true })),
      409, 'UPDATE_IN_PROGRESS'
    );
    assert.equal((await counts(t, bob)).products, 0);
  } finally { await t.cleanup(); }
});

test('incompatible file is rejected with report', async () => {
  const t = await createTempDb();
  try {
    const alice = await t.addUser('alice');
    const bob = await t.addUser('bob');
    await seedAlice(t, alice);
    const file = await backupOf(t, alice, 'alice');
    file.products[0].asin = 'nope';
    const expected = await previewFor(t, bob, 'merge', file);
    const err = await assertRestoreError(
      restoreBackup(bob, file, { mode: 'merge', expected }, depsFor(t)), 422, 'INCOMPATIBLE'
    );
    assert.equal(err.report?.issues[0].code, 'INVALID_ASIN');
    assert.equal((await counts(t, bob)).products, 0);
  } finally { await t.cleanup(); }
});

test('quota blocks mode', async () => {
  const t = await createTempDb();
  try {
    const alice = await t.addUser('alice');
    const bob = await t.addUser('bob');
    await t.addProduct(alice, 'B0ABCDEF12', { description: 'A' });
    await t.addProduct(bob, 'B0BOBBOB01', { description: 'Bob' });
    const file = await backupOf(t, alice, 'alice');
    const deps = depsFor(t, { getConfig: async (k) => (k === 'quota_max_products' ? '1' : null) });
    const expected = await previewFor(t, bob, 'merge', file, deps);
    const err = await assertRestoreError(
      restoreBackup(bob, file, { mode: 'merge', expected }, deps), 422, 'QUOTA_EXCEEDED'
    );
    assert.equal(err.report?.quotaOk.merge, false);
    assert.equal((await counts(t, bob)).products, 1);
  } finally { await t.cleanup(); }
});

test('stale preview aborts', async () => {
  const t = await createTempDb();
  try {
    const alice = await t.addUser('alice');
    const bob = await t.addUser('bob');
    await seedAlice(t, alice);
    await t.addProduct(bob, 'B0BOBBOB01', { description: 'Bob' });
    const file = await backupOf(t, alice, 'alice');
    const expected = await previewFor(t, bob, 'replace', file);
    await t.addProduct(bob, 'B0BOBBOB02', { description: 'Late' });
    const before = await counts(t, bob);
    const err = await assertRestoreError(
      restoreBackup(bob, file, { mode: 'replace', confirmReplace: true, expected }, depsFor(t)), 409, 'DATA_CHANGED'
    );
    assert.equal(err.report?.preview.replace.productsDeleted, 2);
    assert.deepEqual(await counts(t, bob), before);
    const late = await dbGet(t.db, "SELECT id FROM products WHERE user_id = ? AND asin = 'B0BOBBOB02'", [bob]);
    assert.ok(late);
  } finally { await t.cleanup(); }
});

test('failure before commit rolls back', async () => {
  const t = await createTempDb();
  try {
    const alice = await t.addUser('alice');
    const bob = await t.addUser('bob');
    await seedAlice(t, alice);
    await t.addProduct(bob, 'B0BOBBOB01', {
      description: 'Bob', lists: ['Bobs'], prices: [{ date: '2026-01-01 10:00:00', price: 7 }],
    });
    const file = await backupOf(t, alice, 'alice');
    const before = await counts(t, bob);
    const boom = async () => { throw new Error('boom'); };
    for (const mode of ['merge', 'replace'] as RestoreMode[]) {
      await assert.rejects(restoreWithPreview(t, bob, mode, file, { beforeCommit: boom }), /boom/);
      assert.deepEqual(await counts(t, bob), before, mode);
    }
    // connection was released: a normal restore still works
    const ok = await restoreWithPreview(t, bob, 'merge', file);
    assert.equal(ok.productsAdded, 2);
  } finally { await t.cleanup(); }
});

test('restores 20k price points under 10s', async () => {
  const t = await createTempDb();
  try {
    const bob = await t.addUser('bob');
    const base = Date.UTC(2025, 0, 1);
    const products = Array.from({ length: 50 }, (_, i) => ({
      asin: `B0${String(i).padStart(8, '0')}`,
      description: `P${i}`,
      imageUrl: null,
      createdAt: '2025-01-01T00:00:00Z',
      categories: ['Cat', `Sub${i % 5}`],
      lists: ['Big'],
      priceHistory: Array.from({ length: 400 }, (_, j) => ({
        date: new Date(base + j * 3600_000).toISOString().slice(0, 19) + 'Z',
        price: 10 + j, available: true, unavailableReason: null,
      })),
    }));
    const file = {
      format: 'amzscraper-backup', formatVersion: 1, exportedAt: '2026-01-01T00:00:00Z', appVersion: '1.0.0',
      username: 'bob', counts: { products: 50, priceHistory: 20000, lists: 1 },
      lists: [{ name: 'Big', createdAt: '2025-01-01T00:00:00Z' }], products,
    };
    const result = await restoreWithPreview(t, bob, 'merge', file);
    assert.ok(result.durationMs < 10000, `took ${result.durationMs}ms`);
    assert.equal(result.pricePointsAdded, 20000);
    assert.equal((await counts(t, bob)).prices, 20000);
  } finally { await t.cleanup(); }
});
