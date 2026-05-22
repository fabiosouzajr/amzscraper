# Design: database.ts Refactor

**Date:** 2026-03-10
**Status:** Approved

## Problem

`backend/src/services/database.ts` is 1,861 lines containing unrelated concerns — schema
migrations, product CRUD, user management, lists, admin ops, audit logging, system config,
and user scheduling — all in one class. It is hard to navigate, hard to review, and
increasingly hard to extend safely.

## Goals

- Split into focused files, each with one clear domain responsibility
- Promisify the callback-pyramid migration code
- Fix the `new Promise(async (resolve, reject))` anti-pattern throughout
- **Zero changes to any route file** — routes keep calling `dbService.methodName()`

## Non-Goals

- Changing any business logic
- Adding a query builder or ORM
- Changing the SQLite driver or connection strategy

---

## Architecture

### File Structure

```
backend/src/services/
  database.ts              # Facade: owns DB connection, ready promise, re-exports all methods
  db/
    migrations.ts          # Schema DDL + all checkAndMigrate* + initializeSystemConfig
    product-repo.ts        # Products, categories, price history, dashboard drops/increases
    user-repo.ts           # Users, user stats, user schedule
    list-repo.ts           # User lists, product-list join operations
    admin-repo.ts          # Audit log, system config, admin-specific user ops
```

Approximate line counts after split:

| File | ~Lines | Responsibility |
|---|---|---|
| `migrations.ts` | 420 | Schema creation, table recreation migrations |
| `product-repo.ts` | 550 | Products, categories, price history, dashboard |
| `user-repo.ts` | 280 | Users, user stats, user schedule |
| `list-repo.ts` | 320 | Lists, product-list associations |
| `admin-repo.ts` | 230 | Audit log, system config, admin user ops |
| `database.ts` | ~60 | Facade, wiring, re-export |

---

## Repo Pattern

Each repo file exports a factory function that receives the `sqlite3.Database` instance and
returns a plain object of async methods:

```ts
// db/product-repo.ts
export function createProductRepo(db: sqlite3.Database) {
  return {
    async addProduct(...) { ... },
    async getProductById(...) { ... },
    // ...
  };
}
export type ProductRepo = ReturnType<typeof createProductRepo>;
```

No classes, no inheritance — just functions returning objects.

---

## Facade Wiring

`database.ts` owns the single `sqlite3.Database` connection and the `ready` promise.
After migrations complete it constructs each repo and spreads its methods onto `this`:

```ts
export class DatabaseService {
  readonly ready: Promise<void>;
  private resolveReady!: () => void;

  constructor() {
    this.ready = new Promise(resolve => { this.resolveReady = resolve; });
    this.db = new sqlite3.Database(DB_PATH, (err) => {
      if (err) { console.error('Error opening database:', err); return; }
      console.log('Connected to SQLite database');
      const migrations = createMigrations(this.db);
      migrations.run().then(() => {
        Object.assign(this, createProductRepo(this.db));
        Object.assign(this, createUserRepo(this.db));
        Object.assign(this, createListRepo(this.db));
        Object.assign(this, createAdminRepo(this.db));
        this.resolveReady();
      });
    });
  }
}

export const dbService = new DatabaseService();
```

Routes continue to call `dbService.addProduct(...)` with no changes.

---

## Migration Modernization

### Helper utilities (top of migrations.ts)

```ts
function dbRun(db: sqlite3.Database, sql: string, params: any[] = []): Promise<void> {
  return new Promise((resolve, reject) =>
    db.run(sql, params, (err) => err ? reject(err) : resolve())
  );
}

function dbAll<T>(db: sqlite3.Database, sql: string, params: any[] = []): Promise<T[]> {
  return new Promise((resolve, reject) =>
    db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows as T[]))
  );
}

function dbGet<T>(db: sqlite3.Database, sql: string, params: any[] = []): Promise<T | undefined> {
  return new Promise((resolve, reject) =>
    db.get(sql, params, (err, row) => err ? reject(err) : resolve(row as T))
  );
}
```

### Before vs After (migrations)

**Before** — deeply nested callbacks:
```ts
this.db.all("PRAGMA table_info(price_history)", (err, cols) => {
  if (!cols || cols.length === 0) {
    this.db.run('CREATE TABLE ...', (err) => {
      this.db.run('INSERT INTO ... SELECT ...', (err) => {
        this.db.run('DROP TABLE ...', (err) => {
          callback();
        });
      });
    });
  }
});
```

**After** — flat async/await:
```ts
const cols = await dbAll(db, "PRAGMA table_info(price_history)");
if (!cols || cols.length === 0) {
  await dbRun(db, 'CREATE TABLE ...');
  await dbRun(db, 'INSERT INTO ... SELECT ...');
  await dbRun(db, 'DROP TABLE ...');
}
```

### `run()` entry point

`migrations.ts` exports a single async function that orchestrates all migration steps in order:

```ts
export function createMigrations(db: sqlite3.Database) {
  return {
    async run(): Promise<void> {
      await createTables(db);
      await migrateUsersTable(db);
      await migratePriceHistoryTable(db);
      await migrateProductsTable(db);
      await createIndexes(db);
      await initializeSystemConfig(db);
    }
  };
}
```

---

## Anti-Pattern Fix in Repos

The current code uses `new Promise(async (resolve, reject))` throughout, which swallows
errors thrown before the first `await`. This gets replaced with standard async functions:

```ts
// Before
async addProduct(...): Promise<Product> {
  return new Promise(async (resolve, reject) => {
    try { ... resolve(result); }
    catch (err) { reject(err); }
  });
}

// After
async addProduct(...): Promise<Product> {
  // direct async/await, no wrapping Promise constructor
  const quota = await this.getConfig('quota_max_products');
  ...
  return product;
}
```

---

## Data Flow

```
routes/*.ts
    │
    ▼
dbService  (database.ts facade)
    │
    ├── createProductRepo(db) ──► product-repo.ts
    ├── createUserRepo(db)    ──► user-repo.ts
    ├── createListRepo(db)    ──► list-repo.ts
    └── createAdminRepo(db)   ──► admin-repo.ts
                                        │
                          all use shared sqlite3.Database instance
```

---

## Error Handling

- Migration errors bubble up through the `ready` promise rejection (currently they are silently logged and swallowed — this gets fixed as part of the migration rewrite)
- Repo methods throw on DB errors, same as today — callers (routes) already handle these

---

## Out of Scope

- No changes to `scheduler.ts`, `scraper.ts`, or any route file
- No changes to the SQLite driver, connection pool, or WAL mode
- No test framework added
