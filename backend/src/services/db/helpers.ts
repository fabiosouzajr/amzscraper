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
