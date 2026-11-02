import sqlite3 from 'sqlite3';
import { dbRun } from '../db/helpers';

/** Opens a SQLite file with a busy timeout so writers wait instead of failing immediately. */
export function openConnection(dbPath: string): Promise<sqlite3.Database> {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(dbPath, (err) => {
      if (err) return reject(err);
      dbRun(db, 'PRAGMA busy_timeout = 5000').then(() => resolve(db), reject);
    });
  });
}
