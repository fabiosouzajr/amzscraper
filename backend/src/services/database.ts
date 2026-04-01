import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';

import { config } from '../config';
import { createMigrations } from './db/migrations';
import { createProductRepo, ProductRepo } from './db/product-repo';
import { createUserRepo, UserRepo } from './db/user-repo';
import { createListRepo, ListRepo } from './db/list-repo';
import { createAdminRepo, AdminRepo } from './db/admin-repo';
import { createNotificationRepo, NotificationRepo } from './db/notification-repo';

const DB_PATH = config.dbPath;
const DB_DIR = path.dirname(DB_PATH);

type AllRepos = ProductRepo & UserRepo & ListRepo & AdminRepo & NotificationRepo;

export class DatabaseService {
  readonly ready: Promise<void>;
  private resolveReady!: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;

  getDatabasePath(): string {
    return DB_PATH;
  }

  constructor() {
    this.ready = new Promise<void>((resolve) => {
      this.resolveReady = resolve;
    });

    if (!fs.existsSync(DB_DIR)) {
      fs.mkdirSync(DB_DIR, { recursive: true });
      console.log(`Created database directory: ${DB_DIR}`);
    }

    const db = new sqlite3.Database(DB_PATH, async (err) => {
      if (err) {
        console.error('Error opening database:', err);
        return;
      }
      console.log('Connected to SQLite database');
      try {
        await createMigrations(db).run();

        const adminRepo = createAdminRepo(db);
        const getConfig = adminRepo.getConfig.bind(adminRepo);

        Object.assign(this, createProductRepo(db, getConfig));
        Object.assign(this, createUserRepo(db));
        Object.assign(this, createListRepo(db, getConfig));
        Object.assign(this, adminRepo);
        Object.assign(this, createNotificationRepo(db, getConfig));

        this.resolveReady();
      } catch (migrationErr) {
        console.error('Database migration failed:', migrationErr);
      }
    });
  }
}

export const dbService = new DatabaseService() as DatabaseService & AllRepos;
