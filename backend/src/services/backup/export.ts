import sqlite3 from 'sqlite3';
import { dbAll } from '../db/helpers';
import {
  BACKUP_FORMAT, CURRENT_FORMAT_VERSION, BackupFileV1, BackupProduct, toIsoDate,
} from './format';

type ProductRow = { id: number; asin: string; description: string; image_url: string | null; created_at: string };
type CategoryRow = { product_id: number; name: string };
type PriceRow = {
  product_id: number; date: string; price: number | null;
  available: number | null; unavailable_reason: string | null;
};
type ListRow = { id: number; name: string; created_at: string };
type MembershipRow = { product_id: number; list_id: number };

const byString = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

function push<K, V>(map: Map<K, V[]>, key: K, value: V) {
  const arr = map.get(key);
  if (arr) arr.push(value);
  else map.set(key, [value]);
}

/** Builds the v1 backup for one user using four queries, regardless of product count. */
export async function buildBackup(
  db: sqlite3.Database,
  userId: number,
  meta: { username: string; appVersion: string; now?: Date }
): Promise<BackupFileV1> {
  const now = meta.now ?? new Date();

  const products = await dbAll<ProductRow>(
    db,
    'SELECT id, asin, description, image_url, created_at FROM products WHERE user_id = ? ORDER BY asin',
    [userId]
  );
  const categories = await dbAll<CategoryRow>(
    db,
    `SELECT pc.product_id, c.name
       FROM product_categories pc
       JOIN categories c ON c.id = pc.category_id
       JOIN products p ON p.id = pc.product_id
      WHERE p.user_id = ?
      ORDER BY pc.product_id, pc.level`,
    [userId]
  );
  const prices = await dbAll<PriceRow>(
    db,
    `SELECT ph.product_id, ph.date, ph.price, ph.available, ph.unavailable_reason
       FROM price_history ph
       JOIN products p ON p.id = ph.product_id
      WHERE p.user_id = ?
      ORDER BY ph.product_id, ph.date, ph.id`,
    [userId]
  );
  const lists = await dbAll<ListRow>(
    db,
    'SELECT id, name, created_at FROM user_lists WHERE user_id = ? ORDER BY name, id',
    [userId]
  );
  const memberships = await dbAll<MembershipRow>(
    db,
    `SELECT pl.product_id, pl.list_id
       FROM product_lists pl
       JOIN products p ON p.id = pl.product_id
      WHERE p.user_id = ?`,
    [userId]
  );

  const listNameById = new Map(lists.map((l) => [l.id, l.name]));
  const categoriesByProduct = new Map<number, string[]>();
  for (const c of categories) push(categoriesByProduct, c.product_id, c.name);
  const pricesByProduct = new Map<number, BackupProduct['priceHistory']>();
  for (const p of prices) {
    push(pricesByProduct, p.product_id, {
      date: toIsoDate(p.date),
      price: p.price ?? null,
      available: p.available === null || p.available === undefined ? true : !!p.available,
      unavailableReason: p.unavailable_reason ?? null,
    });
  }
  const listsByProduct = new Map<number, string[]>();
  for (const m of memberships) {
    const name = listNameById.get(m.list_id);
    if (name !== undefined) push(listsByProduct, m.product_id, name);
  }

  const outProducts: BackupProduct[] = products.map((p) => ({
    asin: p.asin,
    description: p.description,
    imageUrl: p.image_url ?? null,
    createdAt: toIsoDate(p.created_at),
    categories: categoriesByProduct.get(p.id) ?? [],
    lists: (listsByProduct.get(p.id) ?? []).sort(byString),
    priceHistory: pricesByProduct.get(p.id) ?? [],
  }));

  return {
    format: BACKUP_FORMAT,
    formatVersion: CURRENT_FORMAT_VERSION,
    exportedAt: now.toISOString().slice(0, 19) + 'Z',
    appVersion: meta.appVersion,
    username: meta.username,
    counts: {
      products: outProducts.length,
      priceHistory: outProducts.reduce((n, p) => n + p.priceHistory.length, 0),
      lists: lists.length,
    },
    lists: lists.map((l) => ({ name: l.name, createdAt: toIsoDate(l.created_at) })),
    products: outProducts,
  };
}

const CSV_HEADER = ['asin', 'description', 'date', 'price', 'available', 'unavailable_reason', 'lists', 'categories'];

/** One row per price point (or one row for a product with no history). UTF-8 BOM, CRLF line ends. */
export function formatPriceHistoryCsv(products: BackupProduct[], locale: 'en' | 'pt-BR'): string {
  const pt = locale === 'pt-BR';
  const delim = pt ? ';' : ',';
  const listSep = pt ? ' | ' : '; ';

  const cell = (value: string): string =>
    /["\r\n]/.test(value) || value.includes(delim) ? `"${value.replace(/"/g, '""')}"` : value;
  const row = (cells: string[]) => cells.map(cell).join(delim);

  const lines = [row(CSV_HEADER)];
  for (const p of products) {
    const lists = p.lists.join(listSep);
    const categories = p.categories.join(' > ');
    const points = p.priceHistory.length > 0 ? p.priceHistory : [null];
    for (const pt_ of points) {
      const price = pt_ && pt_.price !== null ? (pt ? String(pt_.price).replace('.', ',') : String(pt_.price)) : '';
      lines.push(row([
        p.asin,
        p.description,
        pt_ ? pt_.date : '',
        price,
        pt_ ? String(pt_.available) : '',
        pt_?.unavailableReason ?? '',
        lists,
        categories,
      ]));
    }
  }
  return '﻿' + lines.join('\r\n') + '\r\n';
}

const ymd = (d: Date) => d.toISOString().slice(0, 10);

export function backupFilename(username: string, now: Date): string {
  return `amzscraper-backup-${username}-${ymd(now)}.json`;
}

export function priceHistoryCsvFilename(now: Date): string {
  return `amzscraper-price-history-${ymd(now)}.csv`;
}
