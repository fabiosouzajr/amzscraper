import { validateASIN, normalizeASIN } from '../../utils/validation';
import {
  BACKUP_FORMAT, SUPPORTED_FORMAT_VERSIONS, CURRENT_FORMAT_VERSION, MAX_LIST_NAME_LENGTH,
  MAX_REPORTED_ISSUES, toStorageDate, Issue, MergePreview, ReplacePreview, ValidationReport,
} from './format';

export interface ValidationContext {
  existingAsins: Set<string>;
  existingListNames: Set<string>;
  existingPriceKeys: Set<string>; // `${asin}|${storageDate}`
  existingMemberships: Set<string>; // `${asin}|${listName}`
  existingCounts: { products: number; pricePoints: number; lists: number };
  productNotificationRuleCount: number;
  quotas: { maxProducts: number; maxLists: number };
  currentUsername: string;
  updateInProgress: boolean;
  schemaIssues: Issue[];
}

export interface NormalizedBackup {
  lists: { name: string; createdAt: string }[];
  products: {
    asin: string;
    description: string;
    imageUrl: string | null;
    createdAt: string;
    categories: string[];
    lists: string[];
    priceHistory: { date: string; price: number | null; available: boolean; unavailableReason: string | null }[];
  }[];
}

const TOP_KEYS = ['format', 'formatVersion', 'exportedAt', 'appVersion', 'username', 'counts', 'lists', 'products'];
const COUNT_KEYS = ['products', 'priceHistory', 'lists'];
const LIST_KEYS = ['name', 'createdAt'];
const PRODUCT_KEYS = ['asin', 'description', 'imageUrl', 'createdAt', 'categories', 'lists', 'priceHistory'];
const POINT_KEYS = ['date', 'price', 'available', 'unavailableReason'];

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

function emptyReport(): ValidationReport {
  return {
    compatible: false,
    fileInfo: { counts: { products: 0, priceHistory: 0, lists: 0 } },
    issues: [],
    issueTotals: { errors: 0, warnings: 0 },
    preview: {
      merge: {
        productsAdded: 0, productsSkippedExisting: 0, pricePointsAdded: 0,
        pricePointsSkippedDuplicate: 0, listsAdded: 0, listsMatched: 0, membershipsAdded: 0,
      },
      replace: {
        productsDeleted: 0, pricePointsDeleted: 0, listsDeleted: 0, notificationRulesDeleted: 0,
        productsAdded: 0, pricePointsAdded: 0, listsAdded: 0,
      },
    },
    quotaOk: { merge: true, replace: true },
  };
}

export function validateBackup(
  input: unknown,
  ctx: ValidationContext,
  now: Date = new Date()
): { report: ValidationReport; data: NormalizedBackup | null } {
  const report = emptyReport();
  const nowStorage = now.toISOString().slice(0, 19).replace('T', ' ');
  let quotaErrors = 0;

  const add = (severity: 'error' | 'warning', code: string, path: string, params?: Issue['params']) => {
    if (severity === 'error') report.issueTotals.errors++;
    else report.issueTotals.warnings++;
    if (report.issues.length < MAX_REPORTED_ISSUES) {
      report.issues.push(params ? { severity, code, path, params } : { severity, code, path });
    }
  };
  const err = (code: string, path: string, params?: Issue['params']) => add('error', code, path, params);
  const warn = (code: string, path: string, params?: Issue['params']) => add('warning', code, path, params);
  const unknownKeys = (obj: Record<string, unknown>, known: string[], base: string) => {
    for (const k of Object.keys(obj)) {
      if (!known.includes(k)) warn('UNKNOWN_FIELD', base ? `${base}.${k}` : k, { field: k });
    }
  };

  if (ctx.updateInProgress) err('UPDATE_IN_PROGRESS', '$');
  for (const i of ctx.schemaIssues) add(i.severity, i.code, i.path, i.params);

  const finish = (data: NormalizedBackup | null) => {
    report.compatible = report.issueTotals.errors - quotaErrors === 0;
    return { report, data: report.compatible ? data : null };
  };

  // ---- file-level ----
  if (!isObj(input)) {
    err('WRONG_TYPE', '$');
    return finish(null);
  }
  const f = input;
  if (typeof f.formatVersion === 'number') report.fileInfo.formatVersion = f.formatVersion;
  if (typeof f.appVersion === 'string') report.fileInfo.appVersion = f.appVersion;
  if (typeof f.exportedAt === 'string') report.fileInfo.exportedAt = f.exportedAt;
  if (typeof f.username === 'string') report.fileInfo.username = f.username;

  let fileLevelFailed = false;
  const fileErr = (code: string, path: string, params?: Issue['params']) => {
    fileLevelFailed = true;
    err(code, path, params);
  };
  if (f.format !== BACKUP_FORMAT) fileErr('WRONG_FORMAT', 'format');
  if (typeof f.formatVersion !== 'number' || !SUPPORTED_FORMAT_VERSIONS.includes(f.formatVersion)) {
    const params: Issue['params'] = { current: CURRENT_FORMAT_VERSION };
    if (typeof f.formatVersion === 'number') {
      params.version = f.formatVersion;
      params.newer = f.formatVersion > CURRENT_FORMAT_VERSION ? CURRENT_FORMAT_VERSION : 0;
    }
    fileErr('UNSUPPORTED_VERSION', 'formatVersion', params);
  }
  for (const key of ['lists', 'products']) {
    if (f[key] === undefined) fileErr('MISSING_FIELD', key, { field: key });
    else if (!Array.isArray(f[key])) fileErr('WRONG_TYPE', key);
  }
  if (fileLevelFailed) return finish(null);

  const rawLists = f.lists as unknown[];
  const rawProducts = f.products as unknown[];
  unknownKeys(f, TOP_KEYS, '');

  // ---- lists ----
  const outLists: NormalizedBackup['lists'] = [];
  const listNames = new Set<string>();
  rawLists.forEach((l, i) => {
    const p = `lists[${i}]`;
    if (!isObj(l)) return err('WRONG_TYPE', p);
    unknownKeys(l, LIST_KEYS, p);
    const name = typeof l.name === 'string' ? l.name.trim() : '';
    let ok = true;
    if (!name || name.length > MAX_LIST_NAME_LENGTH) {
      err('INVALID_LIST_NAME', `${p}.name`, { max: MAX_LIST_NAME_LENGTH });
      ok = false;
    } else if (listNames.has(name)) {
      err('DUPLICATE_LIST_NAME', `${p}.name`, { name });
      ok = false;
    }
    const createdAt = typeof l.createdAt === 'string' ? toStorageDate(l.createdAt) : null;
    if (!createdAt) {
      err('INVALID_DATE', `${p}.createdAt`);
      ok = false;
    } else if (createdAt > nowStorage) warn('FUTURE_DATE', `${p}.createdAt`);
    if (ok) {
      listNames.add(name);
      outLists.push({ name, createdAt: createdAt as string });
    }
  });

  // ---- products ----
  const outProducts: NormalizedBackup['products'] = [];
  const seenAsins = new Set<string>();
  const undeclared = new Set<string>();
  let rawPointCount = 0;
  let keptPointCount = 0;

  rawProducts.forEach((prod, i) => {
    const p = `products[${i}]`;
    if (!isObj(prod)) return err('WRONG_TYPE', p);
    unknownKeys(prod, PRODUCT_KEYS, p);

    let asin = '';
    if (typeof prod.asin !== 'string' || !validateASIN(normalizeASIN(prod.asin))) {
      err('INVALID_ASIN', `${p}.asin`);
    } else {
      asin = normalizeASIN(prod.asin);
      if (seenAsins.has(asin)) {
        err('DUPLICATE_ASIN', `${p}.asin`, { asin });
        asin = '';
      }
      seenAsins.add(asin || normalizeASIN(prod.asin));
    }

    const description = typeof prod.description === 'string' ? prod.description.trim() : '';
    if (!description) err('MISSING_DESCRIPTION', `${p}.description`);

    let imageUrl: string | null = null;
    if (prod.imageUrl !== undefined && prod.imageUrl !== null) {
      let valid = false;
      if (typeof prod.imageUrl === 'string') {
        try {
          const u = new URL(prod.imageUrl);
          valid = u.protocol === 'http:' || u.protocol === 'https:';
        } catch { /* invalid */ }
      }
      if (valid) imageUrl = prod.imageUrl as string;
      else warn('INVALID_IMAGE_URL', `${p}.imageUrl`);
    }

    const createdAt = typeof prod.createdAt === 'string' ? toStorageDate(prod.createdAt) : null;
    if (!createdAt) err('INVALID_DATE', `${p}.createdAt`);
    else if (createdAt > nowStorage) warn('FUTURE_DATE', `${p}.createdAt`);

    const categories: string[] = [];
    if (prod.categories !== undefined) {
      if (!Array.isArray(prod.categories)) err('WRONG_TYPE', `${p}.categories`);
      else prod.categories.forEach((c, j) => {
        if (typeof c !== 'string') err('WRONG_TYPE', `${p}.categories[${j}]`);
        else if (c.trim()) categories.push(c.trim());
      });
    }

    const memberOf: string[] = [];
    if (prod.lists !== undefined) {
      if (!Array.isArray(prod.lists)) err('WRONG_TYPE', `${p}.lists`);
      else prod.lists.forEach((n, j) => {
        const lp = `${p}.lists[${j}]`;
        const name = typeof n === 'string' ? n.trim() : '';
        if (!name || name.length > MAX_LIST_NAME_LENGTH) {
          err('INVALID_LIST_NAME', lp, { max: MAX_LIST_NAME_LENGTH });
          return;
        }
        if (memberOf.includes(name)) return;
        memberOf.push(name);
        if (!listNames.has(name) && !undeclared.has(name)) {
          undeclared.add(name);
          warn('UNDECLARED_LIST', lp, { name });
        }
      });
    }

    const points: NormalizedBackup['products'][number]['priceHistory'] = [];
    const seenDates = new Set<string>();
    if (prod.priceHistory !== undefined) {
      if (!Array.isArray(prod.priceHistory)) err('WRONG_TYPE', `${p}.priceHistory`);
      else prod.priceHistory.forEach((pt, j) => {
        const pp = `${p}.priceHistory[${j}]`;
        rawPointCount++;
        if (!isObj(pt)) return err('WRONG_TYPE', pp);
        unknownKeys(pt, POINT_KEYS, pp);
        let ok = true;
        const date = typeof pt.date === 'string' ? toStorageDate(pt.date) : null;
        if (!date) { err('INVALID_DATE', `${pp}.date`); ok = false; }
        else if (date > nowStorage) warn('FUTURE_DATE', `${pp}.date`);
        const price = pt.price;
        if (price !== null && !(typeof price === 'number' && Number.isFinite(price) && price >= 0)) {
          err('INVALID_PRICE', `${pp}.price`); ok = false;
        }
        if (typeof pt.available !== 'boolean') { err('INVALID_AVAILABLE', `${pp}.available`); ok = false; }
        if (!ok) return;
        if (price === null && pt.available === true) warn('PRICE_NULL_BUT_AVAILABLE', pp);
        if (seenDates.has(date as string)) {
          warn('DUPLICATE_PRICE_POINT', pp, { date: date as string });
          return;
        }
        seenDates.add(date as string);
        points.push({
          date: date as string,
          price: price as number | null,
          available: pt.available as boolean,
          unavailableReason: typeof pt.unavailableReason === 'string' ? pt.unavailableReason : null,
        });
      });
    }

    if (asin && description && createdAt) {
      outProducts.push({ asin, description, imageUrl, createdAt, categories, lists: memberOf, priceHistory: points });
      keptPointCount += points.length;
    }
  });

  // all lists: declared + undeclared (created at the export-less epoch: now)
  for (const name of undeclared) outLists.push({ name, createdAt: nowStorage });

  // ---- informational ----
  report.fileInfo.counts = { products: rawProducts.length, priceHistory: rawPointCount, lists: rawLists.length };
  if (isObj(f.counts)) {
    unknownKeys(f.counts, COUNT_KEYS, 'counts');
    const c = f.counts;
    const actual = report.fileInfo.counts;
    for (const k of COUNT_KEYS as (keyof typeof actual)[]) {
      if (c[k] !== undefined && c[k] !== actual[k]) {
        warn('COUNTS_MISMATCH', `counts.${k}`, { declared: String(c[k]), actual: actual[k] });
      }
    }
  }
  if (typeof f.username === 'string' && f.username !== ctx.currentUsername) {
    warn('DIFFERENT_USERNAME', 'username', { fileUsername: f.username, currentUsername: ctx.currentUsername });
  }

  // ---- previews ----
  const m: MergePreview = report.preview.merge;
  for (const prod of outProducts) {
    const existing = ctx.existingAsins.has(prod.asin);
    if (existing) m.productsSkippedExisting++;
    else m.productsAdded++;
    for (const pt of prod.priceHistory) {
      if (existing && ctx.existingPriceKeys.has(`${prod.asin}|${pt.date}`)) m.pricePointsSkippedDuplicate++;
      else m.pricePointsAdded++;
    }
    for (const name of prod.lists) {
      if (!ctx.existingMemberships.has(`${prod.asin}|${name}`)) m.membershipsAdded++;
    }
  }
  for (const l of outLists) {
    if (ctx.existingListNames.has(l.name)) m.listsMatched++;
    else m.listsAdded++;
  }
  const r: ReplacePreview = report.preview.replace;
  r.productsDeleted = ctx.existingCounts.products;
  r.pricePointsDeleted = ctx.existingCounts.pricePoints;
  r.listsDeleted = ctx.existingCounts.lists;
  r.notificationRulesDeleted = ctx.productNotificationRuleCount;
  r.productsAdded = outProducts.length;
  r.pricePointsAdded = keptPointCount;
  r.listsAdded = outLists.length;

  // ---- quotas ----
  const quota = (mode: 'merge' | 'replace', kind: 'products' | 'lists', limit: number, resulting: number) => {
    report.quotaOk[mode] = false;
    quotaErrors++;
    err('QUOTA_EXCEEDED', '$', { mode, kind, limit, resulting });
  };
  const { maxProducts, maxLists } = ctx.quotas;
  if (m.productsAdded > 0 && ctx.existingCounts.products + m.productsAdded > maxProducts) {
    quota('merge', 'products', maxProducts, ctx.existingCounts.products + m.productsAdded);
  }
  if (m.listsAdded > 0 && ctx.existingCounts.lists + m.listsAdded > maxLists) {
    quota('merge', 'lists', maxLists, ctx.existingCounts.lists + m.listsAdded);
  }
  if (r.productsAdded > maxProducts) quota('replace', 'products', maxProducts, r.productsAdded);
  if (r.listsAdded > maxLists) quota('replace', 'lists', maxLists, r.listsAdded);

  return finish({ lists: outLists, products: outProducts });
}
