import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateBackup, ValidationContext } from '../src/services/backup/validate';
import { toStorageDate, toIsoDate } from '../src/services/backup/format';

const NOW = new Date('2026-06-01T00:00:00Z');

function baseCtx(): ValidationContext {
  return {
    existingAsins: new Set(), existingListNames: new Set(), existingPriceKeys: new Set(),
    existingMemberships: new Set(), existingCounts: { products: 0, pricePoints: 0, lists: 0 },
    productNotificationRuleCount: 0, quotas: { maxProducts: 100, maxLists: 20 },
    currentUsername: 'alice', updateInProgress: false, schemaIssues: [],
  };
}

function validFile(): any {
  return {
    format: 'amzscraper-backup', formatVersion: 1, exportedAt: '2026-05-01T00:00:00Z',
    appVersion: '1.0.0', username: 'alice', counts: { products: 2, priceHistory: 3, lists: 1 },
    lists: [{ name: 'Wishlist', createdAt: '2026-01-10T09:00:00Z' }],
    products: [
      {
        asin: 'B0ABCDEF12', description: 'One', imageUrl: 'https://m.media-amazon.com/a.jpg',
        createdAt: '2026-01-10T09:05:00Z', categories: ['A', 'B'], lists: ['Wishlist'],
        priceHistory: [
          { date: '2026-01-10T09:05:00Z', price: 199.9, available: true, unavailableReason: null },
          { date: '2026-01-11T09:00:00Z', price: null, available: false, unavailableReason: 'Out of stock' },
        ],
      },
      {
        asin: 'B0ABCDEF13', description: 'Two', imageUrl: null, createdAt: '2026-01-12T09:00:00Z',
        categories: [], lists: [],
        priceHistory: [{ date: '2026-01-12T09:00:00Z', price: 10, available: true, unavailableReason: null }],
      },
    ],
  };
}

const run = (f: any, ctx = baseCtx()) => validateBackup(f, ctx, NOW);
const find = (r: ReturnType<typeof run>, code: string) => r.report.issues.filter(i => i.code === code);

test('valid file is compatible with zero errors', () => {
  const r = run(validFile());
  assert.equal(r.report.compatible, true);
  assert.equal(r.report.issueTotals.errors, 0);
  assert.equal(r.data!.products.length, 2);
});

test('toStorageDate normalizes equivalent instants', () => {
  for (const s of ['2026-01-10T09:05:00Z', '2026-01-10T06:05:00-03:00', '2026-01-10 09:05:00']) {
    assert.equal(toStorageDate(s), '2026-01-10 09:05:00');
  }
  assert.equal(toStorageDate('2026-13-01'), null);
  assert.equal(toStorageDate('yesterday'), null);
  assert.equal(toIsoDate('2026-01-10 09:05:00'), '2026-01-10T09:05:00Z');
});

test('file-level: non-object input is WRONG_TYPE at $', () => {
  const r = run('not an object');
  assert.equal(r.report.compatible, false);
  assert.equal(r.data, null);
  assert.deepEqual(r.report.issues.map(i => [i.code, i.path]), [['WRONG_TYPE', '$']]);
});

test('file-level: WRONG_FORMAT', () => {
  const f = validFile(); f.format = 'x'; f.products[0].asin = 'bad';
  const r = run(f);
  assert.equal(r.report.compatible, false);
  assert.equal(find(r, 'WRONG_FORMAT').length, 1);
  assert.equal(find(r, 'INVALID_ASIN').length, 0);
});

test('file-level: UNSUPPORTED_VERSION with newer param', () => {
  const f = validFile(); f.formatVersion = 2;
  const r = run(f);
  assert.equal(r.report.compatible, false);
  assert.equal(find(r, 'UNSUPPORTED_VERSION')[0].params!.newer, 1);
});

test('file-level: MISSING_FIELD products', () => {
  const f = validFile(); delete f.products;
  const r = run(f);
  assert.equal(r.report.compatible, false);
  assert.equal(find(r, 'MISSING_FIELD')[0].path, 'products');
  assert.equal(r.report.issues.length, 1);
});

test('INVALID_ASIN', () => {
  const f = validFile(); f.products[0].asin = 'nope';
  assert.equal(find(run(f), 'INVALID_ASIN')[0].path, 'products[0].asin');
});

test('DUPLICATE_ASIN (after normalization)', () => {
  const f = validFile(); f.products[1].asin = ' b0abcdef12 ';
  const r = run(f);
  assert.equal(find(r, 'DUPLICATE_ASIN')[0].path, 'products[1].asin');
  assert.equal(r.report.compatible, false);
});

test('MISSING_DESCRIPTION', () => {
  const f = validFile(); f.products[0].description = '';
  assert.equal(find(run(f), 'MISSING_DESCRIPTION')[0].path, 'products[0].description');
});

test('INVALID_DATE', () => {
  const f = validFile(); f.products[0].priceHistory[1].date = 'yesterday';
  assert.equal(find(run(f), 'INVALID_DATE')[0].path, 'products[0].priceHistory[1].date');
});

test('INVALID_PRICE negative', () => {
  const f = validFile(); f.products[0].priceHistory[0].price = -1;
  assert.equal(find(run(f), 'INVALID_PRICE')[0].path, 'products[0].priceHistory[0].price');
});

test('INVALID_LIST_NAME too long and blank', () => {
  const f = validFile(); f.lists[0].name = 'x'.repeat(1001);
  assert.equal(find(run(f), 'INVALID_LIST_NAME')[0].path, 'lists[0].name');
  const g = validFile(); g.lists[0].name = '   ';
  assert.equal(find(run(g), 'INVALID_LIST_NAME')[0].path, 'lists[0].name');
});

test('DUPLICATE_LIST_NAME', () => {
  const f = validFile(); f.lists.push({ name: ' Wishlist ', createdAt: '2026-01-10T09:00:00Z' });
  assert.equal(find(run(f), 'DUPLICATE_LIST_NAME')[0].path, 'lists[1].name');
});

test('rejects stringly-typed price and available', () => {
  const f = validFile();
  f.products[0].priceHistory[0].price = '199,90';
  f.products[0].priceHistory[0].available = 'true';
  const r = run(f);
  assert.equal(find(r, 'INVALID_PRICE').length, 1);
  assert.equal(find(r, 'INVALID_AVAILABLE').length, 1);
});

test('warning UNKNOWN_FIELD', () => {
  const f = validFile(); f.extra = 1;
  const r = run(f);
  assert.equal(r.report.compatible, true);
  assert.equal(find(r, 'UNKNOWN_FIELD')[0].path, 'extra');
});

test('warning COUNTS_MISMATCH', () => {
  const f = validFile(); f.counts.products = 5;
  const r = run(f);
  assert.equal(r.report.compatible, true);
  assert.equal(find(r, 'COUNTS_MISMATCH')[0].path, 'counts.products');
});

test('warning UNDECLARED_LIST', () => {
  const f = validFile(); f.products[1].lists = ['Gifts'];
  const r = run(f);
  assert.equal(r.report.compatible, true);
  assert.equal(find(r, 'UNDECLARED_LIST').length, 1);
});

test('warning DUPLICATE_PRICE_POINT keeps first', () => {
  const f = validFile();
  f.products[0].priceHistory.push({ date: '2026-01-10 09:05:00', price: 5, available: true, unavailableReason: null });
  const r = run(f);
  assert.equal(r.report.compatible, true);
  assert.equal(find(r, 'DUPLICATE_PRICE_POINT').length, 1);
  assert.equal(r.data!.products[0].priceHistory.length, 2);
  assert.equal(r.data!.products[0].priceHistory[0].price, 199.9);
});

test('warning FUTURE_DATE', () => {
  const f = validFile(); f.products[0].priceHistory[0].date = '2030-01-01T00:00:00Z';
  const r = run(f);
  assert.equal(r.report.compatible, true);
  assert.equal(find(r, 'FUTURE_DATE').length, 1);
});

test('warning PRICE_NULL_BUT_AVAILABLE', () => {
  const f = validFile(); f.products[0].priceHistory[1].available = true;
  const r = run(f);
  assert.equal(r.report.compatible, true);
  assert.equal(find(r, 'PRICE_NULL_BUT_AVAILABLE').length, 1);
});

test('warning INVALID_IMAGE_URL imports null', () => {
  const f = validFile(); f.products[0].imageUrl = 'javascript:alert(1)';
  const r = run(f);
  assert.equal(r.report.compatible, true);
  assert.equal(find(r, 'INVALID_IMAGE_URL').length, 1);
  assert.equal(r.data!.products[0].imageUrl, null);
});

test('warning DIFFERENT_USERNAME', () => {
  const f = validFile(); f.username = 'bob';
  const r = run(f);
  assert.equal(r.report.compatible, true);
  assert.equal(find(r, 'DIFFERENT_USERNAME').length, 1);
});

test('undeclared list is a warning and counted once', () => {
  const f = validFile();
  f.products[0].lists = ['Wishlist', ' Gifts '];
  f.products[1].lists = ['Gifts'];
  const r = run(f);
  assert.equal(find(r, 'UNDECLARED_LIST').length, 1);
  assert.deepEqual(r.data!.lists.map(l => l.name).sort(), ['Gifts', 'Wishlist']);
  assert.equal(r.report.preview.merge.listsAdded, 2);
});

test('merge preview against existing data', () => {
  const f = validFile();
  const ctx = baseCtx();
  ctx.existingAsins.add('B0ABCDEF12');
  ctx.existingPriceKeys.add('B0ABCDEF12|2026-01-10 09:05:00');
  const m = run(f, ctx).report.preview.merge;
  assert.equal(m.productsAdded, 1);
  assert.equal(m.productsSkippedExisting, 1);
  assert.equal(m.pricePointsSkippedDuplicate, 1);
  assert.equal(m.pricePointsAdded, 2);
});

test('replace preview uses existing counts', () => {
  const ctx = baseCtx();
  ctx.existingCounts = { products: 5, pricePoints: 50, lists: 2 };
  ctx.productNotificationRuleCount = 3;
  const p = run(validFile(), ctx).report.preview.replace;
  assert.deepEqual(p, {
    productsDeleted: 5, pricePointsDeleted: 50, listsDeleted: 2, notificationRulesDeleted: 3,
    productsAdded: 2, pricePointsAdded: 3, listsAdded: 1,
  });
});

test('quota: merge blocked only when creating products', () => {
  const ctx = baseCtx();
  ctx.quotas.maxProducts = 1;
  ctx.existingCounts.products = 1;
  ctx.existingAsins.add('B0ABCDEF12');
  const f = validFile(); f.products.pop();
  const ok = run(f, ctx);
  assert.equal(ok.report.quotaOk.merge, true);

  const f2 = validFile(); f2.products.shift();
  ctx.existingAsins.clear(); ctx.existingAsins.add('ZZZZZZZZZZ');
  const r = run(f2, ctx);
  assert.equal(r.report.quotaOk.merge, false);
  assert.equal(r.report.compatible, true);
  assert.equal(find(r, 'QUOTA_EXCEEDED')[0].params!.mode, 'merge');
});

test('quota: replace checks file counts', () => {
  const ctx = baseCtx();
  ctx.quotas.maxLists = 0;
  const r = run(validFile(), ctx);
  assert.equal(r.report.quotaOk.replace, false);
});

test('update in progress is an error', () => {
  const ctx = baseCtx(); ctx.updateInProgress = true;
  const r = run(validFile(), ctx);
  assert.equal(find(r, 'UPDATE_IN_PROGRESS')[0].path, '$');
  assert.equal(r.report.compatible, false);
  assert.equal(r.data, null);
});

test('schema issues are passed through', () => {
  const ctx = baseCtx();
  ctx.schemaIssues = [{ severity: 'error', code: 'SERVER_SCHEMA_MISMATCH', path: '$', params: { table: 'products', column: 'image_url' } }];
  const r = run(validFile(), ctx);
  assert.equal(find(r, 'SERVER_SCHEMA_MISMATCH').length, 1);
  assert.equal(r.report.compatible, false);
});

test('issues capped at 500', () => {
  const f = validFile();
  f.products = Array.from({ length: 600 }, (_, i) => ({ ...f.products[0], asin: 'bad' + i }));
  const r = run(f);
  assert.equal(r.report.issues.length, 500);
  assert.equal(r.report.issueTotals.errors, 600);
});

test('errors are reported before warnings under the issue cap', () => {
  const f = validFile();
  for (let i = 0; i < 600; i++) f[`extra${i}`] = i;
  f.products[1].asin = 'bad';
  const r = run(f);
  assert.equal(r.report.issueTotals.warnings, 600);
  assert.equal(r.report.issueTotals.errors, 1);
  assert.equal(r.report.issues.length, 500);
  assert.equal(r.report.issues[0].code, 'INVALID_ASIN');
  assert.equal(find(r, 'INVALID_ASIN').length, 1);
});
