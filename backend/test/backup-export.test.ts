import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTempDb } from './helpers/temp-db';
import {
  buildBackup, formatPriceHistoryCsv, backupFilename, priceHistoryCsvFilename, attachmentDisposition,
} from '../src/services/backup/export';
import { validateBackup, ValidationContext } from '../src/services/backup/validate';
import { BackupProduct } from '../src/services/backup/format';

const NOW = new Date('2026-11-02T10:00:00Z');

function scanKeys(v: unknown, found: string[] = []): string[] {
  if (Array.isArray(v)) v.forEach((x) => scanKeys(x, found));
  else if (v && typeof v === 'object') {
    for (const [k, x] of Object.entries(v)) { found.push(k); scanKeys(x, found); }
  }
  return found;
}

test('buildBackup exports only the user\'s data', async () => {
  const t = await createTempDb();
  try {
    const alice = await t.addUser('alice');
    const bob = await t.addUser('bob');
    await t.addProduct(alice, 'B0ABCDEF12', { description: 'A', prices: [{ date: '2026-01-01 10:00:00', price: 10 }] });
    await t.addProduct(bob, 'B0ZZZZZZZ9', { description: 'B', lists: ['Bobs'], prices: [{ date: '2026-01-01 10:00:00', price: 5 }] });
    const b = await buildBackup(t.db, alice, { username: 'alice', appVersion: '1.0.0', now: NOW });
    assert.equal(b.format, 'amzscraper-backup');
    assert.equal(b.formatVersion, 1);
    assert.equal(b.products.length, 1);
    assert.equal(b.products[0].asin, 'B0ABCDEF12');
    assert.deepEqual(b.counts, { products: 1, priceHistory: 1, lists: 0 });
    assert.equal(b.exportedAt, '2026-11-02T10:00:00Z');
  } finally { await t.cleanup(); }
});

test('buildBackup orders and shapes data', async () => {
  const t = await createTempDb();
  try {
    const u = await t.addUser('alice');
    await t.addProduct(u, 'B0ZZZZZZZ9', { description: 'Z', lists: ['Zeta', 'Alpha'], categories: ['Top', 'Mid', 'Leaf'],
      prices: [
        { date: '2026-02-01 08:00:00', price: null, available: false, reason: 'Out of stock' },
        { date: '2026-01-01 08:00:00', price: 19.9 },
      ] });
    await t.addProduct(u, 'B0AAAAAAA1', { description: 'A' });
    const b = await buildBackup(t.db, u, { username: 'alice', appVersion: '1.0.0', now: NOW });
    assert.deepEqual(b.products.map((p) => p.asin), ['B0AAAAAAA1', 'B0ZZZZZZZ9']);
    assert.deepEqual(b.lists.map((l) => l.name), ['Alpha', 'Zeta']);
    const z = b.products[1];
    assert.deepEqual(z.lists, ['Alpha', 'Zeta']);
    assert.deepEqual(z.categories, ['Top', 'Mid', 'Leaf']);
    assert.deepEqual(z.priceHistory.map((p) => p.date), ['2026-01-01T08:00:00Z', '2026-02-01T08:00:00Z']);
    assert.deepEqual(z.priceHistory[1], { date: '2026-02-01T08:00:00Z', price: null, available: false, unavailableReason: 'Out of stock' });
    assert.equal(z.priceHistory[0].available, true);
    assert.equal(z.priceHistory[0].unavailableReason, null);
    assert.match(z.createdAt, /Z$/);
    assert.match(b.lists[0].createdAt, /Z$/);
    const keys = scanKeys(b);
    for (const bad of ['id', 'user_id', 'product_id']) assert.ok(!keys.includes(bad), bad);
  } finally { await t.cleanup(); }
});

test('buildBackup output passes validateBackup against an empty context', async () => {
  const t = await createTempDb();
  try {
    const u = await t.addUser('alice');
    await t.addProduct(u, 'B0ABCDEF12', { description: 'A', lists: ['W'], categories: ['X', 'Y'],
      prices: [{ date: '2026-01-01 08:00:00', price: 1.5 }, { date: '2026-01-02 08:00:00', price: null, available: false, reason: 'n/a' }] });
    const b = await buildBackup(t.db, u, { username: 'alice', appVersion: '1.0.0', now: NOW });
    const ctx: ValidationContext = {
      existingAsins: new Set(), existingListNames: new Set(), existingPriceKeys: new Set(),
      existingMemberships: new Set(), existingCounts: { products: 0, pricePoints: 0, lists: 0 },
      productNotificationRuleCount: 0, quotas: { maxProducts: 100, maxLists: 20 },
      currentUsername: 'alice', updateInProgress: false, schemaIssues: [],
    };
    const { report } = validateBackup(JSON.parse(JSON.stringify(b)), ctx, NOW);
    assert.equal(report.compatible, true);
    assert.equal(report.issueTotals.warnings, 0);
  } finally { await t.cleanup(); }
});

const csvProducts = (): BackupProduct[] => [{
  asin: 'B0ABCDEF12', description: 'Cable, "USB" 2m', imageUrl: null, createdAt: '2026-01-01T00:00:00Z',
  categories: ['Eletrônicos', 'Cabos'], lists: ['One', 'Two'],
  priceHistory: [{ date: '2026-01-02T00:00:00Z', price: 199.9, available: true, unavailableReason: null }],
}];

test('csv en', () => {
  const csv = formatPriceHistoryCsv(csvProducts(), 'en');
  assert.ok(csv.startsWith('﻿'));
  const lines = csv.slice(1).split('\r\n');
  assert.equal(lines[0], 'asin,description,date,price,available,unavailable_reason,lists,categories');
  assert.equal(lines[1], 'B0ABCDEF12,"Cable, ""USB"" 2m",2026-01-02 00:00:00,199.9,true,,One; Two,Eletrônicos > Cabos');
});

test('csv pt-BR', () => {
  const csv = formatPriceHistoryCsv(csvProducts(), 'pt-BR');
  const lines = csv.slice(1).split('\r\n');
  assert.equal(lines[0], 'asin;description;date;price;available;unavailable_reason;lists;categories');
  assert.equal(lines[1], 'B0ABCDEF12;"Cable, ""USB"" 2m";2026-01-02 00:00:00;199,9;true;;One | Two;Eletrônicos > Cabos');
});

test('csv product without history emits one row with empty date and price', () => {
  const p = csvProducts();
  p[0].priceHistory = [];
  const lines = formatPriceHistoryCsv(p, 'en').slice(1).split('\r\n');
  assert.equal(lines[1], 'B0ABCDEF12,"Cable, ""USB"" 2m",,,,,One; Two,Eletrônicos > Cabos');
});

test('filenames', () => {
  assert.equal(backupFilename('alice', NOW), 'amzscraper-backup-alice-2026-11-02.json');
  assert.equal(priceHistoryCsvFilename(NOW), 'amzscraper-price-history-2026-11-02.csv');
});

test('csv neutralizes formula-like text cells but not numeric columns', () => {
  const p = csvProducts();
  p[0].description = '=HYPERLINK("http://evil")';
  p[0].lists = ['@list'];
  p[0].categories = ['+cat'];
  p[0].priceHistory[0].unavailableReason = '\tx';
  p.push({ ...csvProducts()[0], description: '-50% off', lists: [], categories: [],
    priceHistory: [{ date: '2026-01-03T00:00:00Z', price: 0, available: true, unavailableReason: null }] });
  const lines = formatPriceHistoryCsv(p, 'en').slice(1).split('\r\n');
  assert.equal(lines[1], `B0ABCDEF12,"'=HYPERLINK(""http://evil"")",2026-01-02 00:00:00,199.9,true,'\tx,'@list,'+cat`);
  assert.equal(lines[2], "B0ABCDEF12,'-50% off,2026-01-03 00:00:00,0,true,,,");
});

test('attachmentDisposition is header-safe and round-trips the real name', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { validateHeaderValue } = require('node:http');
  for (const name of ['João', '名前', 'a"b']) {
    const filename = backupFilename(name, NOW);
    const h = attachmentDisposition(filename);
    assert.ok(/^[\x20-\x7e]*$/.test(h), h);
    validateHeaderValue('Content-Disposition', h);
    const m = /^attachment; filename="([A-Za-z0-9._-]+)"; filename\*=UTF-8''([^\s;"]+)$/.exec(h);
    assert.ok(m, h);
    assert.equal(decodeURIComponent(m![2]), filename);
  }
  assert.equal(attachmentDisposition(backupFilename('João', NOW)).split(';')[1],
    ' filename="amzscraper-backup-Jo_o-2026-11-02.json"');
});
