# Multi-User Admin Interface Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform the amzscraper Amazon Price Tracker from a basic multi-user system into a proper multi-tenant SaaS application with role-based access control, a dedicated admin interface, user management, quotas, system monitoring, and audit logging.

**Architecture:** Single SQLite database with row-level security via user_id scoping, role-based JWT tokens, admin-only API endpoints under `/api/admin/*`, and a separate admin view in the frontend using existing view-state routing. Admin users get full visibility across all tenants.

**Tech Stack:** TypeScript, Express, SQLite3, React, Playwright, node-cron, bcrypt, jsonwebtoken, Recharts, react-i18next

---

## Architecture Analysis & Current Assumptions

### Current Auth Flow (Verified from code)
- **JWT payload**: `{ userId: number, username: string }` - 7-day expiry
- **AuthRequest interface**: `userId?: number; user?: { id: number; username: string }`
- **authenticate middleware**: Validates JWT, sets `req.userId` and `req.user`, returns 401 on invalid token
- **No roles**: JWT payload and DB schema currently lack role information
- **Frontend AuthContext**: Stores user/token in localStorage, no role awareness

### Current Users Table Schema
```sql
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
```
**Missing columns for admin features**:
- `role` (TEXT: 'USER' | 'ADMIN')
- `is_disabled` (BOOLEAN)
- `disabled_at` (DATETIME)
- `quota_max_products` (INTEGER)
- `quota_used_products` (INTEGER, derived via COUNT on products)

### Current Frontend User Type
```typescript
export interface User {
  id: number;
  username: string;
  created_at: string;
}
```
**Missing fields**: `role`, `is_disabled`

### Current Scheduler Implementation
- `updateUserPrices(userId)`: Updates all products for a specific user
- `updateAllPrices()`: Iterates through ALL users sequentially
- **Missing**: Per-user scheduling, quota enforcement, per-user error tracking

### Assumptions for Implementation
1. **Multi-tenant model**: Keep single SQLite DB with user_id scoping (tenant = user)
2. **Admin routes**: Use `/api/admin/*` prefix with separate `requireAdmin` middleware
3. **Admin UI**: Add new `currentView: 'admin'` in App.tsx, separate AdminPanel component
4. **Audit logging**: Create new `audit_log` table for admin actions
5. **First admin**: First registered user (or via env var) becomes admin, subsequent users default to USER
6. **Quotas**: Enforce at product creation time, display warnings at 80% utilization
7. **Rate limiting**: Simple in-memory rate limiter for admin operations
8. **Logging**: Existing `logger.ts` timestamps all output; add structured audit logs to DB

---

## Implementation Roadmap (Phases)

### Phase 1: Database Schema & Backend Auth Foundation
- Add role/disabled columns to users table
- Create audit_log table
- Create system_config table for quotas/feature flags
- Update JWT payload to include role
- Create requireAdmin middleware
- Migration script for existing users

### Phase 2: Admin API Endpoints
- User management: list, create, disable, reset password
- System stats: per-user product counts, DB size, scraping errors
- System config: CRUD for quotas and feature flags
- Audit log: retrieval with filtering

### Phase 3: Admin UI Components
- AdminPanel main component with tab navigation
- User management table with search
- System dashboard with charts (Recharts)
- System config form
- Audit log viewer

### Phase 4: Operational Enhancements
- Scheduler: per-user scheduling, quota enforcement
- Audit logging for all admin actions
- Error logging for scraping failures per user

### Phase 5: Security & Polish
- Rate limiting on admin endpoints
- Input validation and sanitization
- i18n for all admin strings
- Documentation updates

---

## Phase 1: Database Schema & Backend Auth Foundation

### Task 1: Update Users Table Schema

**Files:**
- Modify: `backend/src/services/database.ts:79-84` (users table creation)
- Modify: `backend/src/services/database.ts:958-978` (getUserByUsername return type)
- Modify: `backend/src/services/database.ts:998-1017` (getUserById return type)
- Test: No formal tests, manual verification via sqlite3

**Step 1: Add migration check method to database.ts**

At the end of DatabaseService class, add:

```typescript
private checkAndMigrateUsersTable(callback: () => void): void {
  this.db.all("PRAGMA table_info(users)", (err, columns: any[]) => {
    if (err) {
      console.error('Error checking users table info:', err);
      callback();
      return;
    }

    const columnNames = columns.map(col => col.name);
    const migrations: Array<{ name: string; sql: string }> = [];

    // Add role column if missing
    if (!columnNames.includes('role')) {
      migrations.push({
        name: 'role',
        sql: 'ALTER TABLE users ADD COLUMN role TEXT DEFAULT "USER"'
      });
    }

    // Add is_disabled column if missing
    if (!columnNames.includes('is_disabled')) {
      migrations.push({
        name: 'is_disabled',
        sql: 'ALTER TABLE users ADD COLUMN is_disabled INTEGER DEFAULT 0'
      });
    }

    // Add disabled_at column if missing
    if (!columnNames.includes('disabled_at')) {
      migrations.push({
        name: 'disabled_at',
        sql: 'ALTER TABLE users ADD COLUMN disabled_at DATETIME'
      });
    }

    if (migrations.length === 0) {
      callback();
      return;
    }

    console.log(`Migrating users table with ${migrations.length} column(s)`);
    this.db.serialize(() => {
      migrations.forEach(migration => {
        this.db.run(migration.sql, (err) => {
          if (err) {
            console.error(`Error adding column ${migration.name}:`, err);
          } else {
            console.log(`  ✓ Added column ${migration.name}`);
          }
        });
      });
      callback();
    });
  });
}
```

**Step 2: Call migration in initialize method**

Modify the migration chain in `initialize()` (around line 108), insert after `checkAndMigrateProductsTable`:

```typescript
// After checkAndMigrateProductsTable callback, add:
this.checkAndMigrateUsersTable(() => {
  // Create indexes after migration is complete
  this.db.run('CREATE INDEX IF NOT EXISTS idx_product_id ON price_history(product_id)');
  // ... rest of indexes
});
```

**Step 3: Update table creation statement**

Replace the users table CREATE statement (lines 79-85):

```typescript
const createUsersTable = `
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'USER',
    is_disabled INTEGER NOT NULL DEFAULT 0,
    disabled_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    CHECK (role IN ('USER', 'ADMIN'))
  )
`;
```

**Step 4: Update TypeScript interfaces**

Add to `backend/src/models/types.ts` (create if doesn't exist):

```typescript
export type UserRole = 'USER' | 'ADMIN';

export interface User {
  id: number;
  username: string;
  role: UserRole;
  is_disabled: boolean;
  disabled_at?: string;
  created_at: string;
}

export interface UserWithPasswordHash extends User {
  password_hash: string;
}
```

**Step 5: Update database service return types**

Modify `getUserByUsername` method signature and return (lines 958-978):

```typescript
async getUserByUsername(username: string): Promise<UserWithPasswordHash | null> {
  return new Promise((resolve, reject) => {
    const sql = 'SELECT * FROM users WHERE username = ?';
    this.db.get(sql, [username], (err, row: any) => {
      if (err) {
        reject(err);
        return;
      }
      if (!row) {
        resolve(null);
        return;
      }
      resolve({
        id: row.id,
        username: row.username,
        role: row.role,
        is_disabled: !!row.is_disabled,
        disabled_at: row.disabled_at,
        password_hash: row.password_hash,
        created_at: row.created_at
      });
    });
  });
}
```

Modify `getUserById` method signature and return (lines 998-1017):

```typescript
async getUserById(id: number): Promise<User | null> {
  return new Promise((resolve, reject) => {
    const sql = 'SELECT id, username, role, is_disabled, disabled_at, created_at FROM users WHERE id = ?';
    this.db.get(sql, [id], (err, row: any) => {
      if (err) {
        reject(err);
        return;
      }
      if (!row) {
        resolve(null);
        return;
      }
      resolve({
        id: row.id,
        username: row.username,
        role: row.role,
        is_disabled: !!row.is_disabled,
        disabled_at: row.disabled_at,
        created_at: row.created_at
      });
    });
  });
}
```

**Potential Pitfalls:**
- SQLite ALTER TABLE has limitations: can only ADD COLUMN, not DROP or RENAME
- Existing rows will get default values (role='USER', is_disabled=0)
- Test with existing database to ensure migration runs smoothly

---

### Task 2: Create Audit Log Table

**Files:**
- Modify: `backend/src/services/database.ts` (add table creation)
- Test: Manual verification

**Step 1: Add audit_log table creation**

Add after users table creation in `initialize()`:

```typescript
const createAuditLogTable = `
  CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    admin_user_id INTEGER NOT NULL,
    action TEXT NOT NULL,
    target_type TEXT,
    target_id INTEGER,
    details TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (admin_user_id) REFERENCES users(id) ON DELETE CASCADE
  )
`;
```

**Step 2: Add to serialization**

Add to the db.serialize() block:

```typescript
this.db.run(createAuditLogTable);
```

**Step 3: Add audit logging methods to DatabaseService**

```typescript
async logAudit(
  adminUserId: number,
  action: string,
  targetType?: string,
  targetId?: number,
  details?: string
): Promise<number> {
  return new Promise((resolve, reject) => {
    const sql = `
      INSERT INTO audit_log (admin_user_id, action, target_type, target_id, details)
      VALUES (?, ?, ?, ?, ?)
    `;
    this.db.run(
      sql,
      [adminUserId, action, targetType || null, targetId || null, details || null],
      function(err) {
        if (err) {
          reject(err);
          return;
        }
        resolve(this.lastID);
      }
    );
  });
}

async getAuditLogs(
  limit: number = 100,
  offset: number = 0,
  targetType?: string,
  adminUserId?: number
): Promise<AuditLog[]> {
  return new Promise((resolve, reject) => {
    let sql = `
      SELECT a.*, u.username as admin_username
      FROM audit_log a
      JOIN users u ON a.admin_user_id = u.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (targetType) {
      sql += ' AND a.target_type = ?';
      params.push(targetType);
    }

    if (adminUserId) {
      sql += ' AND a.admin_user_id = ?';
      params.push(adminUserId);
    }

    sql += ' ORDER BY a.created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    this.db.all(sql, params, (err, rows: any[]) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(rows.map(row => ({
        id: row.id,
        admin_user_id: row.admin_user_id,
        admin_username: row.admin_username,
        action: row.action,
        target_type: row.target_type,
        target_id: row.target_id,
        details: row.details,
        created_at: row.created_at
      })));
    });
  });
}
```

**Step 4: Add AuditLog interface**

Add to `backend/src/models/types.ts`:

```typescript
export interface AuditLog {
  id: number;
  admin_user_id: number;
  admin_username: string;
  action: string;
  target_type?: string;
  target_id?: number;
  details?: string;
  created_at: string;
}
```

---

### Task 3: Create System Config Table

**Files:**
- Modify: `backend/src/services/database.ts`
- Test: Manual verification

**Step 1: Add system_config table creation**

```typescript
const createSystemConfigTable = `
  CREATE TABLE IF NOT EXISTS system_config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    description TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_by INTEGER,
    FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
  )
`;
```

**Step 2: Add to serialization**

```typescript
this.db.run(createSystemConfigTable);
```

**Step 3: Insert default config values**

Add method to initialize default config:

```typescript
private initializeSystemConfig(): void {
  const defaults = [
    { key: 'quota_max_products', value: '100', description: 'Max products per user' },
    { key: 'quota_max_lists', value: '20', description: 'Max lists per user' },
    { key: 'scheduler_enabled', value: 'true', description: 'Enable automatic price updates' },
    { key: 'scheduler_cron', value: '0 0 * * *', description: 'Cron schedule for price updates' }
  ];

  defaults.forEach(config => {
    const sql = `
      INSERT OR IGNORE INTO system_config (key, value, description)
      VALUES (?, ?, ?)
    `;
    this.db.run(sql, [config.key, config.value, config.description]);
  });
}
```

Call this in `initialize()` after table creation:

```typescript
this.initializeSystemConfig();
```

**Step 4: Add config CRUD methods**

```typescript
async getConfig(key: string): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const sql = 'SELECT value FROM system_config WHERE key = ?';
    this.db.get(sql, [key], (err, row: any) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(row?.value || null);
    });
  });
}

async setConfig(
  key: string,
  value: string,
  updatedBy: number
): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const sql = `
      UPDATE system_config
      SET value = ?, updated_at = CURRENT_TIMESTAMP, updated_by = ?
      WHERE key = ?
    `;
    this.db.run(sql, [value, updatedBy, key], function(err) {
      if (err) {
        reject(err);
        return;
      }
      resolve(this.changes > 0);
    });
  });
}

async getAllConfig(): Promise<SystemConfig[]> {
  return new Promise((resolve, reject) => {
    const sql = 'SELECT * FROM system_config ORDER BY key';
    this.db.all(sql, [], (err, rows: any[]) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(rows.map(row => ({
        key: row.key,
        value: row.value,
        description: row.description,
        updated_at: row.updated_at,
        updated_by: row.updated_by
      })));
    });
  });
}
```

**Step 5: Add SystemConfig interface**

```typescript
export interface SystemConfig {
  key: string;
  value: string;
  description: string;
  updated_at: string;
  updated_by?: number;
}
```

---

### Task 4: Update JWT Token with Role

**Files:**
- Modify: `backend/src/middleware/auth.ts:45-47`
- Modify: `backend/src/routes/auth.ts:33,68`

**Step 1: Update JWT interface**

In `auth.ts`, modify the AuthRequest interface:

```typescript
export interface AuthRequest extends Request {
  userId?: number;
  user?: User;
}
```

Import User type from models/types.ts.

**Step 2: Update generateToken to include role**

```typescript
export const generateToken = (user: User): string => {
  return jwt.sign(
    { userId: user.id, username: user.username, role: user.role },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
};
```

**Step 3: Update authenticate middleware to verify disabled status**

```typescript
export const authenticate = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const token = authHeader.substring(7);

    try {
      const decoded = jwt.verify(token, JWT_SECRET) as { userId: number; username: string; role: UserRole };
      const user = await dbService.getUserById(decoded.userId);

      if (!user) {
        res.status(401).json({ error: 'Invalid token' });
        return;
      }

      if (user.is_disabled) {
        res.status(403).json({ error: 'Account is disabled' });
        return;
      }

      req.userId = user.id;
      req.user = user;
      next();
    } catch (error) {
      res.status(401).json({ error: 'Invalid token' });
      return;
    }
  } catch (error) {
    res.status(500).json({ error: 'Authentication error' });
    return;
  }
};
```

**Step 4: Update auth route calls to generateToken**

In `routes/auth.ts`:

Line 33 (register):
```typescript
const token = generateToken(user);
```

Line 68 (login):
```typescript
const token = generateToken(user);
```

**Potential Pitfalls:**
- Existing tokens without role will fail verification
- Need token refresh flow or allow old tokens for 7-day grace period
- For now: handle missing role in JWT by falling back to USER

**Step 5: Add backward compatibility to authenticate**

Modify the try block in authenticate middleware:

```typescript
try {
  const decoded = jwt.verify(token, JWT_SECRET) as { userId: number; username: string; role?: UserRole };
  const user = await dbService.getUserById(decoded.userId);

  if (!user) {
    res.status(401).json({ error: 'Invalid token' });
    return;
  }

  if (user.is_disabled) {
    res.status(403).json({ error: 'Account is disabled' });
    return;
  }

  req.userId = user.id;
  req.user = user;
  next();
}
```

---

### Task 5: Create requireAdmin Middleware

**Files:**
- Create: `backend/src/middleware/admin.ts`

**Step 1: Create admin.ts middleware**

```typescript
import { Response, NextFunction } from 'express';
import { AuthRequest, authenticate } from './auth';

export const requireAdmin = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  // First authenticate
  await authenticate(req, res, async () => {
    // Check if user has admin role
    if (!req.user || req.user.role !== 'ADMIN') {
      res.status(403).json({ error: 'Admin access required' });
      return;
    }
    next();
  });
};
```

**Potential Pitfalls:**
- Middleware chaining with express requires proper async handling
- Need to ensure authenticate runs first

**Step 2: Export from middleware/index.ts** (create if doesn't exist)

```typescript
export * from './auth';
export * from './admin';
```

---

### Task 6: Update Frontend User Type

**Files:**
- Modify: `frontend/src/types.ts:43-47`

**Step 1: Update User interface**

```typescript
export type UserRole = 'USER' | 'ADMIN';

export interface User {
  id: number;
  username: string;
  role: UserRole;
  is_disabled?: boolean;
  created_at: string;
}
```

**Step 2: Update AuthContext to handle role**

No changes needed - user object already passes through as-is

---

### Task 7: Environment Variable for Initial Admin

**Files:**
- Modify: `backend/.env.example` (create if doesn't exist)
- Modify: `backend/src/routes/auth.ts`

**Step 1: Add to .env.example**

```
INITIAL_ADMIN_USERNAME=admin
INITIAL_ADMIN_PASSWORD=change-this-password-immediately
```

**Step 2: Add admin user creation on startup**

In `backend/src/server.ts`, after database initialization:

```typescript
// Ensure initial admin exists
const initialAdminUsername = process.env.INITIAL_ADMIN_USERNAME;
const initialAdminPassword = process.env.INITIAL_ADMIN_PASSWORD;

if (initialAdminUsername && initialAdminPassword) {
  try {
    const existingAdmin = await dbService.getUserByUsername(initialAdminUsername);
    if (!existingAdmin) {
      await dbService.createAdminUser(initialAdminUsername, initialAdminPassword);
      console.log(`✓ Initial admin user created: ${initialAdminUsername}`);
    } else if (existingAdmin.role !== 'ADMIN') {
      await dbService.setUserRole(existingAdmin.id, 'ADMIN');
      console.log(`✓ Existing user promoted to admin: ${initialAdminUsername}`);
    }
  } catch (error) {
    console.error('Error ensuring initial admin exists:', error);
  }
}
```

**Step 3: Add createAdminUser and setUserRole to database service**

```typescript
async createAdminUser(username: string, password: string): Promise<User> {
  return new Promise(async (resolve, reject) => {
    try {
      const passwordHash = await bcrypt.hash(password, 10);
      const sql = 'INSERT INTO users (username, password_hash, role) VALUES (?, ?, "ADMIN")';
      this.db.run(sql, [username, passwordHash], function(err) {
        if (err) {
          reject(err);
          return;
        }
        resolve({
          id: this.lastID,
          username,
          role: 'ADMIN',
          is_disabled: false,
          created_at: new Date().toISOString()
        });
      });
    } catch (error) {
      reject(error);
    }
  });
}

async setUserRole(userId: number, role: UserRole): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const sql = 'UPDATE users SET role = ? WHERE id = ?';
    this.db.run(sql, [role, userId], function(err) {
      if (err) {
        reject(err);
        return;
      }
      resolve(this.changes > 0);
    });
  });
}
```

---

## Phase 2: Admin API Endpoints

### Task 8: Create Admin Routes Structure

**Files:**
- Create: `backend/src/routes/admin.ts`
- Modify: `backend/src/server.ts`

**Step 1: Create admin.ts**

```typescript
import { Router, Response } from 'express';
import { AuthRequest, requireAdmin } from '../middleware/admin';
import { dbService } from '../services/database';
import bcrypt from 'bcrypt';

const router = Router();

// All routes require admin authentication
router.use(requireAdmin);

// GET /api/admin/users - List all users
router.get('/users', async (req: AuthRequest, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;
    const search = req.query.search as string;

    let users = await dbService.getAllUsers(limit, offset);

    // Filter by search term if provided
    if (search) {
      const searchLower = search.toLowerCase();
      users = users.filter(u => u.username.toLowerCase().includes(searchLower));
    }

    res.json(users);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// GET /api/admin/users/:id - Get user details with stats
router.get('/users/:id', async (req: AuthRequest, res: Response) => {
  try {
    const userId = parseInt(req.params.id);
    const user = await dbService.getUserById(userId);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get user stats
    const stats = await dbService.getUserStats(userId);

    res.json({
      ...user,
      ...stats
    });
  } catch (error) {
    console.error('Error fetching user details:', error);
    res.status(500).json({ error: 'Failed to fetch user details' });
  }
});

// POST /api/admin/users - Create new user
router.post('/users', async (req: AuthRequest, res: Response) => {
  try {
    const { username, password, role } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    if (username.length < 3) {
      return res.status(400).json({ error: 'Username must be at least 3 characters' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    // Check if user already exists
    const existing = await dbService.getUserByUsername(username);
    if (existing) {
      return res.status(409).json({ error: 'Username already exists' });
    }

    // Create user with specified role (default to USER)
    const user = await dbService.createUserWithRole(username, password, role || 'USER');

    // Log audit
    await dbService.logAudit(
      req.user!.id,
      'CREATE_USER',
      'USER',
      user.id,
      `Created user ${username} with role ${role || 'USER'}`
    );

    res.status(201).json(user);
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// PATCH /api/admin/users/:id/disable - Disable user
router.patch('/users/:id/disable', async (req: AuthRequest, res: Response) => {
  try {
    const userId = parseInt(req.params.id);

    if (userId === req.user!.id) {
      return res.status(400).json({ error: 'Cannot disable your own account' });
    }

    const success = await dbService.disableUser(userId);

    if (!success) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = await dbService.getUserById(userId);

    // Log audit
    await dbService.logAudit(
      req.user!.id,
      'DISABLE_USER',
      'USER',
      userId,
      `Disabled user ${user?.username}`
    );

    res.json({ message: 'User disabled successfully' });
  } catch (error) {
    console.error('Error disabling user:', error);
    res.status(500).json({ error: 'Failed to disable user' });
  }
});

// PATCH /api/admin/users/:id/enable - Enable user
router.patch('/users/:id/enable', async (req: AuthRequest, res: Response) => {
  try {
    const userId = parseInt(req.params.id);
    const success = await dbService.enableUser(userId);

    if (!success) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = await dbService.getUserById(userId);

    // Log audit
    await dbService.logAudit(
      req.user!.id,
      'ENABLE_USER',
      'USER',
      userId,
      `Enabled user ${user?.username}`
    );

    res.json({ message: 'User enabled successfully' });
  } catch (error) {
    console.error('Error enabling user:', error);
    res.status(500).json({ error: 'Failed to enable user' });
  }
});

// POST /api/admin/users/:id/reset-password - Reset user password
router.post('/users/:id/reset-password', async (req: AuthRequest, res: Response) => {
  try {
    const userId = parseInt(req.params.id);
    const { newPassword } = req.body;

    if (!newPassword) {
      return res.status(400).json({ error: 'New password is required' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const success = await dbService.updateUserPassword(userId, newPassword);

    if (!success) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = await dbService.getUserById(userId);

    // Log audit
    await dbService.logAudit(
      req.user!.id,
      'RESET_PASSWORD',
      'USER',
      userId,
      `Reset password for user ${user?.username}`
    );

    res.json({ message: 'Password reset successfully' });
  } catch (error) {
    console.error('Error resetting password:', error);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

// GET /api/admin/stats - System-wide statistics
router.get('/stats', async (req: AuthRequest, res: Response) => {
  try {
    const stats = await dbService.getSystemStats();
    res.json(stats);
  } catch (error) {
    console.error('Error fetching system stats:', error);
    res.status(500).json({ error: 'Failed to fetch system stats' });
  }
});

// GET /api/admin/config - System configuration
router.get('/config', async (req: AuthRequest, res: Response) => {
  try {
    const config = await dbService.getAllConfig();
    res.json(config);
  } catch (error) {
    console.error('Error fetching config:', error);
    res.status(500).json({ error: 'Failed to fetch config' });
  }
});

// PUT /api/admin/config/:key - Update system configuration
router.put('/config/:key', async (req: AuthRequest, res: Response) => {
  try {
    const key = req.params.key;
    const { value } = req.body;

    if (!value) {
      return res.status(400).json({ error: 'Value is required' });
    }

    const success = await dbService.setConfig(key, value, req.user!.id);

    if (!success) {
      return res.status(404).json({ error: 'Config key not found' });
    }

    // Log audit
    await dbService.logAudit(
      req.user!.id,
      'UPDATE_CONFIG',
      'CONFIG',
      0,
      `Updated config ${key} to ${value}`
    );

    res.json({ message: 'Config updated successfully' });
  } catch (error) {
    console.error('Error updating config:', error);
    res.status(500).json({ error: 'Failed to update config' });
  }
});

// GET /api/admin/audit - Audit logs
router.get('/audit', async (req: AuthRequest, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 100;
    const offset = parseInt(req.query.offset as string) || 0;
    const targetType = req.query.target_type as string;
    const adminUserId = req.query.admin_user_id ? parseInt(req.query.admin_user_id as string) : undefined;

    const logs = await dbService.getAuditLogs(limit, offset, targetType, adminUserId);
    res.json(logs);
  } catch (error) {
    console.error('Error fetching audit logs:', error);
    res.status(500).json({ error: 'Failed to fetch audit logs' });
  }
});

export default router;
```

**Step 2: Register admin routes in server.ts**

```typescript
import adminRoutes from './routes/admin';

// After other route registrations
app.use('/api/admin', adminRoutes);
```

**Potential Pitfalls:**
- Need to import UserRole type
- Need to add createUserWithRole, disableUser, enableUser, getUserStats, getSystemStats to dbService

**Step 3: Add missing database service methods**

```typescript
async getAllUsers(limit: number = 50, offset: number = 0): Promise<User[]> {
  return new Promise((resolve, reject) => {
    const sql = 'SELECT id, username, role, is_disabled, disabled_at, created_at FROM users ORDER BY created_at DESC LIMIT ? OFFSET ?';
    this.db.all(sql, [limit, offset], (err, rows: any[]) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(rows.map(row => ({
        id: row.id,
        username: row.username,
        role: row.role,
        is_disabled: !!row.is_disabled,
        disabled_at: row.disabled_at,
        created_at: row.created_at
      })));
    });
  });
}

async createUserWithRole(username: string, password: string, role: UserRole): Promise<User> {
  return new Promise(async (resolve, reject) => {
    try {
      const passwordHash = await bcrypt.hash(password, 10);
      const sql = 'INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)';
      this.db.run(sql, [username, passwordHash, role], function(err) {
        if (err) {
          reject(err);
          return;
        }
        resolve({
          id: this.lastID,
          username,
          role,
          is_disabled: false,
          created_at: new Date().toISOString()
        });
      });
    } catch (error) {
      reject(error);
    }
  });
}

async disableUser(userId: number): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const sql = 'UPDATE users SET is_disabled = 1, disabled_at = CURRENT_TIMESTAMP WHERE id = ?';
    this.db.run(sql, [userId], function(err) {
      if (err) {
        reject(err);
        return;
      }
      resolve(this.changes > 0);
    });
  });
}

async enableUser(userId: number): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const sql = 'UPDATE users SET is_disabled = 0, disabled_at = NULL WHERE id = ?';
    this.db.run(sql, [userId], function(err) {
      if (err) {
        reject(err);
        return;
      }
      resolve(this.changes > 0);
    });
  });
}

async getUserStats(userId: number): Promise<UserStats> {
  return new Promise((resolve, reject) => {
    const sql = `
      SELECT
        COUNT(DISTINCT p.id) as product_count,
        COUNT(DISTINCT l.id) as list_count,
        COUNT(DISTINCT ph.id) as price_history_count
      FROM users u
      LEFT JOIN products p ON u.id = p.user_id
      LEFT JOIN user_lists l ON u.id = l.user_id
      LEFT JOIN price_history ph ON p.id = ph.product_id
      WHERE u.id = ?
      GROUP BY u.id
    `;
    this.db.get(sql, [userId], (err, row: any) => {
      if (err) {
        reject(err);
        return;
      }
      resolve({
        product_count: row?.product_count || 0,
        list_count: row?.list_count || 0,
        price_history_count: row?.price_history_count || 0
      });
    });
  });
}

async getSystemStats(): Promise<SystemStats> {
  return new Promise((resolve, reject) => {
    const sql = `
      SELECT
        (SELECT COUNT(*) FROM users) as total_users,
        (SELECT COUNT(*) FROM users WHERE role = 'ADMIN') as total_admins,
        (SELECT COUNT(*) FROM users WHERE is_disabled = 1) as disabled_users,
        (SELECT COUNT(*) FROM products) as total_products,
        (SELECT COUNT(DISTINCT user_id) FROM products) as active_users,
        (SELECT COUNT(*) FROM price_history) as total_price_history
    `;
    this.db.get(sql, [], (err, row: any) => {
      if (err) {
        reject(err);
        return;
      }
      resolve({
        total_users: row.total_users,
        total_admins: row.total_admins,
        disabled_users: row.disabled_users,
        total_products: row.total_products,
        active_users: row.active_users,
        total_price_history: row.total_price_history
      });
    });
  });
}
```

**Step 4: Add missing interfaces**

```typescript
export interface UserStats {
  product_count: number;
  list_count: number;
  price_history_count: number;
}

export interface SystemStats {
  total_users: number;
  total_admins: number;
  disabled_users: number;
  total_products: number;
  active_users: number;
  total_price_history: number;
}
```

---

## Phase 3: Admin UI Components

### Task 9: Create Admin Panel Layout

**Files:**
- Create: `frontend/src/components/AdminPanel.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/App.css`

**Step 1: Create AdminPanel.tsx**

```tsx
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';

type AdminTab = 'users' | 'stats' | 'config' | 'audit';

export function AdminPanel() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<AdminTab>('users');

  if (!user || user.role !== 'ADMIN') {
    return <div>Access denied</div>;
  }

  return (
    <div className="admin-panel">
      <header className="admin-header">
        <h1>{t('admin.title')}</h1>
        <nav className="admin-tabs">
          <button
            className={`admin-tab ${activeTab === 'users' ? 'active' : ''}`}
            onClick={() => setActiveTab('users')}
          >
            {t('admin.tabs.users')}
          </button>
          <button
            className={`admin-tab ${activeTab === 'stats' ? 'active' : ''}`}
            onClick={() => setActiveTab('stats')}
          >
            {t('admin.tabs.stats')}
          </button>
          <button
            className={`admin-tab ${activeTab === 'config' ? 'active' : ''}`}
            onClick={() => setActiveTab('config')}
          >
            {t('admin.tabs.config')}
          </button>
          <button
            className={`admin-tab ${activeTab === 'audit' ? 'active' : ''}`}
            onClick={() => setActiveTab('audit')}
          >
            {t('admin.tabs.audit')}
          </button>
        </nav>
      </header>

      <main className="admin-content">
        {activeTab === 'users' && <UserManagement />}
        {activeTab === 'stats' && <SystemStats />}
        {activeTab === 'config' && <SystemConfig />}
        {activeTab === 'audit' && <AuditLog />}
      </main>
    </div>
  );
}

// Placeholder components - implement in subsequent tasks
function UserManagement() {
  return <div>Users management coming soon...</div>;
}

function SystemStats() {
  return <div>System stats coming soon...</div>;
}

function SystemConfig() {
  return <div>System config coming soon...</div>;
}

function AuditLog() {
  return <div>Audit log coming soon...</div>;
}
```

**Step 2: Update App.tsx to include admin view**

Add to currentView state handling:

```tsx
// Add 'admin' to the view type
type View = 'dashboard' | 'products' | 'search' | 'detail' | 'config' | 'admin';

// Update navigation to show admin link only for admins
{user && user.role === 'ADMIN' && (
  <button onClick={() => setCurrentView('admin')}>Admin</button>
)}

// Add admin view rendering
{currentView === 'admin' && <AdminPanel />}
```

**Step 3: Add admin styles to App.css**

```css
/* Admin Panel Styles */
.admin-panel {
  padding: 2rem;
}

.admin-header {
  margin-bottom: 2rem;
}

.admin-header h1 {
  font-size: 2rem;
  margin-bottom: 1rem;
  color: #232f3e;
}

.admin-tabs {
  display: flex;
  gap: 0.5rem;
  border-bottom: 2px solid #e7e9ed;
}

.admin-tab {
  padding: 0.75rem 1.5rem;
  background: none;
  border: none;
  cursor: pointer;
  font-size: 1rem;
  color: #565959;
  border-bottom: 2px solid transparent;
  margin-bottom: -2px;
  transition: all 0.2s;
}

.admin-tab:hover {
  color: #232f3e;
  background-color: #f7f8fa;
}

.admin-tab.active {
  color: #ff9900;
  border-bottom-color: #ff9900;
  font-weight: 600;
}

.admin-content {
  padding-top: 1rem;
}
```

**Step 4: Add i18n strings to en.json and pt-BR.json**

```json
{
  "admin": {
    "title": "Admin Panel",
    "tabs": {
      "users": "Users",
      "stats": "Stats",
      "config": "Config",
      "audit": "Audit Log"
    }
  }
}
```

---

### Task 10: Implement User Management Component

**Files:**
- Modify: `frontend/src/components/AdminPanel.tsx`
- Create: `frontend/src/components/admin/UserManagement.tsx`
- Modify: `frontend/src/services/api.ts`

**Step 1: Add API methods**

```typescript
// Admin API methods
export const adminApi = {
  getUsers: async (limit = 50, offset = 0, search?: string): Promise<User[]> => {
    const params = new URLSearchParams({ limit: limit.toString(), offset: offset.toString() });
    if (search) params.append('search', search);
    const response = await fetch(`${API_BASE}/admin/users?${params}`, {
      headers: getAuthHeaders()
    });
    if (!response.ok) throw new Error('Failed to fetch users');
    return response.json();
  },

  getUserStats: async (userId: number): Promise<UserStats> => {
    const response = await fetch(`${API_BASE}/admin/users/${userId}`, {
      headers: getAuthHeaders()
    });
    if (!response.ok) throw new Error('Failed to fetch user stats');
    return response.json();
  },

  createUser: async (username: string, password: string, role: string): Promise<User> => {
    const response = await fetch(`${API_BASE}/admin/users`, {
      method: 'POST',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, role })
    });
    if (!response.ok) throw new Error('Failed to create user');
    return response.json();
  },

  disableUser: async (userId: number): Promise<void> => {
    const response = await fetch(`${API_BASE}/admin/users/${userId}/disable`, {
      method: 'PATCH',
      headers: getAuthHeaders()
    });
    if (!response.ok) throw new Error('Failed to disable user');
  },

  enableUser: async (userId: number): Promise<void> => {
    const response = await fetch(`${API_BASE}/admin/users/${userId}/enable`, {
      method: 'PATCH',
      headers: getAuthHeaders()
    });
    if (!response.ok) throw new Error('Failed to enable user');
  },

  resetPassword: async (userId: number, newPassword: string): Promise<void> => {
    const response = await fetch(`${API_BASE}/admin/users/${userId}/reset-password`, {
      method: 'POST',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ newPassword })
    });
    if (!response.ok) throw new Error('Failed to reset password');
  }
};
```

**Step 2: Create UserManagement.tsx**

```tsx
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { User, UserStats } from '../../types';
import { adminApi } from '../../services/api';

interface UserWithStats extends User {
  product_count?: number;
  list_count?: number;
  price_history_count?: number;
}

export function UserManagement() {
  const { t } = useTranslation();
  const [users, setUsers] = useState<UserWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserWithStats | null>(null);

  useEffect(() => {
    loadUsers();
  }, [search]);

  const loadUsers = async () => {
    try {
      setLoading(true);
      const data = await adminApi.getUsers(50, 0, search || undefined);
      setUsers(data);
    } catch (error) {
      console.error('Failed to load users:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateUser = async (username: string, password: string, role: string) => {
    try {
      await adminApi.createUser(username, password, role);
      setShowCreateModal(false);
      loadUsers();
    } catch (error: any) {
      alert(error.message || 'Failed to create user');
    }
  };

  const handleDisableUser = async (userId: number) => {
    if (!confirm(t('admin.users.confirmDisable'))) return;
    try {
      await adminApi.disableUser(userId);
      loadUsers();
    } catch (error) {
      console.error('Failed to disable user:', error);
    }
  };

  const handleEnableUser = async (userId: number) => {
    try {
      await adminApi.enableUser(userId);
      loadUsers();
    } catch (error) {
      console.error('Failed to enable user:', error);
    }
  };

  const handleShowStats = async (user: UserWithStats) => {
    try {
      const stats = await adminApi.getUserStats(user.id);
      setSelectedUser({ ...user, ...stats });
    } catch (error) {
      console.error('Failed to load user stats:', error);
    }
  };

  return (
    <div className="user-management">
      <div className="user-management-header">
        <h2>{t('admin.users.title')}</h2>
        <button
          className="btn btn-primary"
          onClick={() => setShowCreateModal(true)}
        >
          {t('admin.users.createUser')}
        </button>
      </div>

      <div className="search-box">
        <input
          type="text"
          placeholder={t('admin.users.searchPlaceholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="loading">{t('common.loading')}</div>
      ) : (
        <table className="admin-table">
          <thead>
            <tr>
              <th>{t('admin.users.username')}</th>
              <th>{t('admin.users.role')}</th>
              <th>{t('admin.users.status')}</th>
              <th>{t('admin.users.products')}</th>
              <th>{t('admin.users.createdAt')}</th>
              <th>{t('admin.users.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id}>
                <td>{user.username}</td>
                <td>
                  <span className={`role-badge role-${user.role.toLowerCase()}`}>
                    {user.role}
                  </span>
                </td>
                <td>
                  {user.is_disabled ? (
                    <span className="status-badge status-disabled">
                      {t('admin.users.disabled')}
                    </span>
                  ) : (
                    <span className="status-badge status-active">
                      {t('admin.users.active')}
                    </span>
                  )}
                </td>
                <td>
                  <button
                    className="btn btn-small"
                    onClick={() => handleShowStats(user)}
                  >
                    {t('admin.users.viewStats')}
                  </button>
                </td>
                <td>{new Date(user.created_at).toLocaleDateString()}</td>
                <td>
                  {user.is_disabled ? (
                    <button
                      className="btn btn-small btn-success"
                      onClick={() => handleEnableUser(user.id)}
                    >
                      {t('admin.users.enable')}
                    </button>
                  ) : (
                    <button
                      className="btn btn-small btn-danger"
                      onClick={() => handleDisableUser(user.id)}
                    >
                      {t('admin.users.disable')}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {showCreateModal && (
        <CreateUserModal
          onClose={() => setShowCreateModal(false)}
          onCreate={handleCreateUser}
        />
      )}

      {selectedUser && (
        <UserStatsModal
          user={selectedUser}
          onClose={() => setSelectedUser(null)}
          onResetPassword={(newPassword) =>
            adminApi.resetPassword(selectedUser.id, newPassword).then(() => {
              alert(t('admin.users.passwordReset'));
              setSelectedUser(null);
            })
          }
        />
      )}
    </div>
  );
}

function CreateUserModal({ onClose, onCreate }: any) {
  const { t } = useTranslation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'USER' | 'ADMIN'>('USER');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onCreate(username, password, role);
  };

  return (
    <div className="modal">
      <div className="modal-content">
        <h3>{t('admin.users.createUser')}</h3>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>{t('auth.username')}</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              minLength={3}
            />
          </div>
          <div className="form-group">
            <label>{t('auth.password')}</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
            />
          </div>
          <div className="form-group">
            <label>{t('admin.users.role')}</label>
            <select value={role} onChange={(e) => setRole(e.target.value as any)}>
              <option value="USER">USER</option>
              <option value="ADMIN">ADMIN</option>
            </select>
          </div>
          <div className="modal-actions">
            <button type="button" onClick={onClose}>
              {t('common.cancel')}
            </button>
            <button type="submit" className="btn btn-primary">
              {t('common.save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function UserStatsModal({ user, onClose, onResetPassword }: any) {
  const { t } = useTranslation();
  const [newPassword, setNewPassword] = useState('');
  const [showPasswordForm, setShowPasswordForm] = useState(false);

  const handleResetPassword = (e: React.FormEvent) => {
    e.preventDefault();
    onResetPassword(newPassword);
  };

  return (
    <div className="modal">
      <div className="modal-content">
        <h3>{t('admin.users.userStats', { username: user.username })}</h3>
        <div className="user-stats-grid">
          <div className="stat-card">
            <h4>{t('admin.users.products')}</h4>
            <p className="stat-value">{user.product_count}</p>
          </div>
          <div className="stat-card">
            <h4>{t('admin.users.lists')}</h4>
            <p className="stat-value">{user.list_count}</p>
          </div>
          <div className="stat-card">
            <h4>{t('admin.users.priceHistory')}</h4>
            <p className="stat-value">{user.price_history_count}</p>
          </div>
        </div>

        <div className="user-actions">
          {!showPasswordForm ? (
            <button className="btn" onClick={() => setShowPasswordForm(true)}>
              {t('admin.users.resetPassword')}
            </button>
          ) : (
            <form onSubmit={handleResetPassword}>
              <div className="form-group">
                <label>{t('admin.users.newPassword')}</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  minLength={6}
                />
              </div>
              <div className="modal-actions">
                <button type="button" onClick={() => setShowPasswordForm(false)}>
                  {t('common.cancel')}
                </button>
                <button type="submit" className="btn btn-primary">
                  {t('common.save')}
                </button>
              </div>
            </form>
          )}
        </div>

        <button className="btn" onClick={onClose}>
          {t('common.close')}
        </button>
      </div>
    </div>
  );
}
```

**Step 3: Add admin table styles**

```css
/* Admin Table Styles */
.admin-table {
  width: 100%;
  border-collapse: collapse;
  margin-top: 1rem;
}

.admin-table th,
.admin-table td {
  padding: 0.75rem 1rem;
  text-align: left;
  border-bottom: 1px solid #e7e9ed;
}

.admin-table th {
  background-color: #f7f8fa;
  font-weight: 600;
  color: #232f3e;
}

.admin-table tr:hover {
  background-color: #f7f8fa;
}

.role-badge {
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  font-size: 0.875rem;
  font-weight: 600;
}

.role-admin {
  background-color: #ffe4cc;
  color: #c45300;
}

.role-user {
  background-color: #e7f3ff;
  color: #0066cc;
}

.status-badge {
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  font-size: 0.875rem;
  font-weight: 600;
}

.status-active {
  background-color: #e6ffec;
  color: #006633;
}

.status-disabled {
  background-color: #ffe4e6;
  color: #cc0033;
}

.user-management-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}

.search-box input {
  width: 100%;
  max-width: 300px;
  padding: 0.5rem 1rem;
  border: 1px solid #d5d9d9;
  border-radius: 4px;
  font-size: 1rem;
}

/* Modal Styles */
.modal {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-content {
  background-color: white;
  padding: 2rem;
  border-radius: 8px;
  max-width: 500px;
  width: 90%;
  max-height: 90vh;
  overflow-y: auto;
}

.modal-content h3 {
  margin-top: 0;
  margin-bottom: 1.5rem;
  color: #232f3e;
}

.form-group {
  margin-bottom: 1rem;
}

.form-group label {
  display: block;
  margin-bottom: 0.5rem;
  font-weight: 500;
  color: #565959;
}

.form-group input,
.form-group select {
  width: 100%;
  padding: 0.5rem;
  border: 1px solid #d5d9d9;
  border-radius: 4px;
  font-size: 1rem;
}

.modal-actions {
  display: flex;
  gap: 0.5rem;
  justify-content: flex-end;
  margin-top: 1.5rem;
}

/* Stats Grid */
.user-stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 1rem;
  margin: 1.5rem 0;
}

.stat-card {
  background-color: #f7f8fa;
  padding: 1rem;
  border-radius: 8px;
  text-align: center;
}

.stat-card h4 {
  margin: 0 0 0.5rem 0;
  color: #565959;
  font-size: 0.875rem;
}

.stat-value {
  margin: 0;
  font-size: 2rem;
  font-weight: 600;
  color: #232f3e;
}

.btn-small {
  padding: 0.25rem 0.5rem;
  font-size: 0.875rem;
}

.btn-success {
  background-color: #067d62;
  color: white;
}

.btn-danger {
  background-color: #c40000;
  color: white;
}
```

**Step 4: Add i18n strings**

```json
{
  "admin": {
    "users": {
      "title": "User Management",
      "createUser": "Create User",
      "searchPlaceholder": "Search users by username...",
      "username": "Username",
      "role": "Role",
      "status": "Status",
      "products": "Products",
      "createdAt": "Created",
      "actions": "Actions",
      "disabled": "Disabled",
      "active": "Active",
      "viewStats": "View Stats",
      "enable": "Enable",
      "disable": "Disable",
      "confirmDisable": "Are you sure you want to disable this user?",
      "userStats": "{{username}} - Stats",
      "lists": "Lists",
      "priceHistory": "Price History",
      "resetPassword": "Reset Password",
      "newPassword": "New Password",
      "passwordReset": "Password reset successfully"
    }
  },
  "common": {
    "close": "Close"
  }
}
```

---

### Task 11: Implement System Stats Component

**Files:**
- Create: `frontend/src/components/admin/SystemStats.tsx`
- Modify: `frontend/src/services/api.ts`
- Modify: `frontend/src/components/AdminPanel.tsx`

**Step 1: Add API method**

```typescript
// Add to adminApi in api.ts
getSystemStats: async (): Promise<SystemStats> => {
  const response = await fetch(`${API_BASE}/admin/stats`, {
    headers: getAuthHeaders()
  });
  if (!response.ok) throw new Error('Failed to fetch system stats');
  return response.json();
},
```

**Step 2: Add SystemStats interface to types.ts**

```typescript
export interface SystemStats {
  total_users: number;
  total_admins: number;
  disabled_users: number;
  total_products: number;
  active_users: number;
  total_price_history: number;
}
```

**Step 3: Create SystemStats.tsx**

```tsx
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { SystemStats } from '../../types';
import { adminApi } from '../../services/api';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';

export function SystemStats() {
  const { t } = useTranslation();
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      setLoading(true);
      const data = await adminApi.getSystemStats();
      setStats(data);
    } catch (error) {
      console.error('Failed to load system stats:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="loading">{t('common.loading')}</div>;
  }

  if (!stats) {
    return <div>{t('admin.stats.failedToLoad')}</div>;
  }

  const chartData = [
    { name: t('admin.stats.users'), value: stats.total_users },
    { name: t('admin.stats.admins'), value: stats.total_admins },
    { name: t('admin.stats.activeUsers'), value: stats.active_users },
    { name: t('admin.stats.disabledUsers'), value: stats.disabled_users }
  ];

  return (
    <div className="system-stats">
      <h2>{t('admin.stats.title')}</h2>

      <div className="stats-grid">
        <div className="stat-card">
          <h3>{t('admin.stats.totalUsers')}</h3>
          <p className="stat-value">{stats.total_users}</p>
        </div>
        <div className="stat-card">
          <h3>{t('admin.stats.totalProducts')}</h3>
          <p className="stat-value">{stats.total_products}</p>
        </div>
        <div className="stat-card">
          <h3>{t('admin.stats.activeUsers')}</h3>
          <p className="stat-value">{stats.active_users}</p>
        </div>
        <div className="stat-card">
          <h3>{t('admin.stats.totalAdmins')}</h3>
          <p className="stat-value">{stats.total_admins}</p>
        </div>
        <div className="stat-card">
          <h3>{t('admin.stats.disabledUsers')}</h3>
          <p className="stat-value">{stats.disabled_users}</p>
        </div>
        <div className="stat-card">
          <h3>{t('admin.stats.priceHistoryRecords')}</h3>
          <p className="stat-value">{stats.total_price_history}</p>
        </div>
      </div>

      <div className="stats-charts">
        <div className="chart-container">
          <h3>{t('admin.stats.userDistribution')}</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="value" fill="#ff9900" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
```

**Step 4: Update AdminPanel to import and use SystemStats**

```tsx
import { SystemStats } from './admin/SystemStats';

// Replace placeholder with import
function SystemStats() {
  return <div>System stats coming soon...</div>;
}
```

**Step 5: Add i18n strings**

```json
{
  "admin": {
    "stats": {
      "title": "System Statistics",
      "totalUsers": "Total Users",
      "totalProducts": "Total Products",
      "activeUsers": "Active Users",
      "totalAdmins": "Total Admins",
      "disabledUsers": "Disabled Users",
      "priceHistoryRecords": "Price History Records",
      "userDistribution": "User Distribution",
      "users": "Users",
      "admins": "Admins",
      "activeUsers": "Active Users",
      "disabledUsers": "Disabled Users",
      "failedToLoad": "Failed to load system stats"
    }
  }
}
```

---

### Task 12: Implement System Config Component

**Files:**
- Create: `frontend/src/components/admin/SystemConfig.tsx`
- Modify: `frontend/src/services/api.ts`
- Modify: `frontend/src/components/AdminPanel.tsx`

**Step 1: Add API methods**

```typescript
// Add to adminApi
getConfig: async (): Promise<SystemConfig[]> => {
  const response = await fetch(`${API_BASE}/admin/config`, {
    headers: getAuthHeaders()
  });
  if (!response.ok) throw new Error('Failed to fetch config');
  return response.json();
},

updateConfig: async (key: string, value: string): Promise<void> => {
  const response = await fetch(`${API_BASE}/admin/config/${key}`, {
    method: 'PUT',
    headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ value })
  });
  if (!response.ok) throw new Error('Failed to update config');
},
```

**Step 2: Add SystemConfig interface**

```typescript
export interface SystemConfig {
  key: string;
  value: string;
  description: string;
  updated_at: string;
  updated_by?: number;
}
```

**Step 3: Create SystemConfig.tsx**

```tsx
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { SystemConfig } from '../../types';
import { adminApi } from '../../services/api';

export function SystemConfig() {
  const { t } = useTranslation();
  const [config, setConfig] = useState<SystemConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      setLoading(true);
      const data = await adminApi.getConfig();
      setConfig(data);
    } catch (error) {
      console.error('Failed to load config:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async (key: string, value: string) => {
    try {
      await adminApi.updateConfig(key, value);
      setEditingKey(null);
      loadConfig();
    } catch (error: any) {
      alert(error.message || t('admin.config.failedToUpdate'));
    }
  };

  const handleEdit = (item: SystemConfig) => {
    setEditingKey(item.key);
    setEditValue(item.value);
  };

  const handleCancel = () => {
    setEditingKey(null);
    setEditValue('');
  };

  if (loading) {
    return <div className="loading">{t('common.loading')}</div>;
  }

  return (
    <div className="system-config">
      <h2>{t('admin.config.title')}</h2>

      <table className="admin-table">
        <thead>
          <tr>
            <th>{t('admin.config.key')}</th>
            <th>{t('admin.config.description')}</th>
            <th>{t('admin.config.value')}</th>
            <th>{t('admin.config.updatedAt')}</th>
            <th>{t('admin.config.actions')}</th>
          </tr>
        </thead>
        <tbody>
          {config.map((item) => (
            <tr key={item.key}>
              <td><code>{item.key}</code></td>
              <td>{item.description}</td>
              <td>
                {editingKey === item.key ? (
                  <div className="edit-input">
                    <input
                      type="text"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                    />
                    <button
                      className="btn btn-small btn-primary"
                      onClick={() => handleUpdate(item.key, editValue)}
                    >
                      {t('common.save')}
                    </button>
                    <button
                      className="btn btn-small"
                      onClick={handleCancel}
                    >
                      {t('common.cancel')}
                    </button>
                  </div>
                ) : (
                  <code>{item.value}</code>
                )}
              </td>
              <td>{new Date(item.updated_at).toLocaleString()}</td>
              <td>
                {editingKey !== item.key && (
                  <button
                    className="btn btn-small"
                    onClick={() => handleEdit(item)}
                  >
                    {t('admin.config.edit')}
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

**Step 4: Add styles**

```css
.edit-input {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}

.edit-input input {
  flex: 1;
  padding: 0.25rem 0.5rem;
  border: 1px solid #d5d9d9;
  border-radius: 4px;
  font-family: monospace;
}

code {
  background-color: #f7f8fa;
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  font-family: 'Courier New', monospace;
  font-size: 0.875rem;
}
```

**Step 5: Add i18n strings**

```json
{
  "admin": {
    "config": {
      "title": "System Configuration",
      "key": "Key",
      "description": "Description",
      "value": "Value",
      "updatedAt": "Updated",
      "actions": "Actions",
      "edit": "Edit",
      "failedToUpdate": "Failed to update configuration"
    }
  }
}
```

---

### Task 13: Implement Audit Log Component

**Files:**
- Create: `frontend/src/components/admin/AuditLog.tsx`
- Modify: `frontend/src/services/api.ts`
- Modify: `frontend/src/components/AdminPanel.tsx`

**Step 1: Add API method**

```typescript
// Add to adminApi
getAuditLogs: async (limit = 100, offset = 0, targetType?: string, adminUserId?: number): Promise<AuditLog[]> => {
  const params = new URLSearchParams({ limit: limit.toString(), offset: offset.toString() });
  if (targetType) params.append('target_type', targetType);
  if (adminUserId) params.append('admin_user_id', adminUserId.toString());
  const response = await fetch(`${API_BASE}/admin/audit?${params}`, {
    headers: getAuthHeaders()
  });
  if (!response.ok) throw new Error('Failed to fetch audit logs');
  return response.json();
},
```

**Step 2: Add AuditLog interface**

```typescript
export interface AuditLog {
  id: number;
  admin_user_id: number;
  admin_username: string;
  action: string;
  target_type?: string;
  target_id?: number;
  details?: string;
  created_at: string;
}
```

**Step 3: Create AuditLog.tsx**

```tsx
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { AuditLog } from '../../types';
import { adminApi } from '../../services/api';

export function AuditLog() {
  const { t } = useTranslation();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState('');

  useEffect(() => {
    loadLogs();
  }, [filterType]);

  const loadLogs = async () => {
    try {
      setLoading(true);
      const data = await adminApi.getAuditLogs(100, 0, filterType || undefined);
      setLogs(data);
    } catch (error) {
      console.error('Failed to load audit logs:', error);
    } finally {
      setLoading(false);
    }
  };

  const getActionBadgeClass = (action: string) => {
    const actionLower = action.toLowerCase();
    if (actionLower.includes('create') || actionLower.includes('enable')) {
      return 'action-badge action-create';
    } else if (actionLower.includes('delete') || actionLower.includes('disable')) {
      return 'action-badge action-delete';
    } else {
      return 'action-badge action-update';
    }
  };

  if (loading) {
    return <div className="loading">{t('common.loading')}</div>;
  }

  return (
    <div className="audit-log">
      <div className="audit-header">
        <h2>{t('admin.audit.title')}</h2>
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="filter-select"
        >
          <option value="">{t('admin.audit.allTypes')}</option>
          <option value="USER">{t('admin.audit.typeUser')}</option>
          <option value="CONFIG">{t('admin.audit.typeConfig')}</option>
        </select>
      </div>

      <table className="admin-table">
        <thead>
          <tr>
            <th>{t('admin.audit.timestamp')}</th>
            <th>{t('admin.audit.admin')}</th>
            <th>{t('admin.audit.action')}</th>
            <th>{t('admin.audit.target')}</th>
            <th>{t('admin.audit.details')}</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((log) => (
            <tr key={log.id}>
              <td>{new Date(log.created_at).toLocaleString()}</td>
              <td>{log.admin_username}</td>
              <td>
                <span className={getActionBadgeClass(log.action)}>
                  {log.action}
                </span>
              </td>
              <td>
                {log.target_type && log.target_id ? (
                  <span>
                    {log.target_type}:{log.target_id}
                  </span>
                ) : (
                  '-'
                )}
              </td>
              <td>{log.details || '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

**Step 4: Add styles**

```css
.audit-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}

.filter-select {
  padding: 0.5rem 1rem;
  border: 1px solid #d5d9d9;
  border-radius: 4px;
  font-size: 1rem;
  background-color: white;
}

.action-badge {
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  font-size: 0.875rem;
  font-weight: 600;
}

.action-create {
  background-color: #e6ffec;
  color: #006633;
}

.action-delete {
  background-color: #ffe4e6;
  color: #cc0033;
}

.action-update {
  background-color: #e7f3ff;
  color: #0066cc;
}
```

**Step 5: Add i18n strings**

```json
{
  "admin": {
    "audit": {
      "title": "Audit Log",
      "timestamp": "Timestamp",
      "admin": "Admin",
      "action": "Action",
      "target": "Target",
      "details": "Details",
      "allTypes": "All Types",
      "typeUser": "Users",
      "typeConfig": "Configuration"
    }
  }
}
```

---

## Phase 4: Operational Enhancements

### Task 14: Scheduler Quota Enforcement

**Files:**
- Modify: `backend/src/services/scheduler.ts`
- Modify: `backend/src/services/database.ts`
- Modify: `backend/src/routes/products.ts`

**Step 1: Add quota check to database service**

```typescript
async checkProductQuota(userId: number): Promise<{ allowed: boolean; current: number; max: number }> {
  return new Promise((resolve, reject) => {
    const sql = 'SELECT COUNT(*) as count FROM products WHERE user_id = ?';
    this.db.get(sql, [userId], async (err, row: any) => {
      if (err) {
        reject(err);
        return;
      }

      const current = row.count;
      const maxConfig = await this.getConfig('quota_max_products');
      const max = maxConfig ? parseInt(maxConfig) : 100;

      resolve({
        allowed: current < max,
        current,
        max
      });
    });
  });
}
```

**Step 2: Update products route to check quota**

In `routes/products.ts`, add check before product creation:

```typescript
// Check quota before creating product
const quota = await dbService.checkProductQuota(req.userId!);
if (!quota.allowed) {
  return res.status(429).json({
    error: `Quota exceeded. You have ${quota.current}/${quota.max} products.`
  });
}
```

**Step 3: Add per-user error tracking in scheduler**

Add error tracking table to database:

```typescript
const createScrapingErrorsTable = `
  CREATE TABLE IF NOT EXISTS scraping_errors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    asin TEXT NOT NULL,
    error_message TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
  )
`;
```

Add to serialization:

```typescript
this.db.run(createScrapingErrorsTable);
```

**Step 4: Log errors in scheduler**

In `scheduler.ts`, modify error handling:

```typescript
} catch (error) {
  console.error(`  ✗ Error updating ${product.asin}:`, error);
  errors++;
  // Log error to database
  await dbService.logScrapingError(userId, product.id, product.asin, error instanceof Error ? error.message : 'Unknown error');
}
```

**Step 5: Add database method for error logging**

```typescript
async logScrapingError(userId: number, productId: number, asin: string, errorMessage: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const sql = 'INSERT INTO scraping_errors (user_id, product_id, asin, error_message) VALUES (?, ?, ?, ?)';
    this.db.run(sql, [userId, productId, asin, errorMessage], (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

async getScrapingErrors(userId: number, limit = 50): Promise<ScrapingError[]> {
  return new Promise((resolve, reject) => {
    const sql = `
      SELECT se.*, p.description
      FROM scraping_errors se
      JOIN products p ON se.product_id = p.id
      WHERE se.user_id = ?
      ORDER BY se.created_at DESC
      LIMIT ?
    `;
    this.db.all(sql, [userId, limit], (err, rows: any[]) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(rows.map(row => ({
        id: row.id,
        user_id: row.user_id,
        product_id: row.product_id,
        asin: row.asin,
        description: row.description,
        error_message: row.error_message,
        created_at: row.created_at
      })));
    });
  });
}
```

---

### Task 15: Per-User Scheduling

**Files:**
- Modify: `backend/src/services/scheduler.ts`
- Modify: `backend/src/routes/config.ts` (or create admin routes for scheduling)

**Step 1: Add per-user schedule table**

```typescript
const createUserScheduleTable = `
  CREATE TABLE IF NOT EXISTS user_schedule (
    user_id INTEGER PRIMARY KEY,
    cron_expression TEXT NOT NULL DEFAULT '0 0 * * *',
    enabled INTEGER NOT NULL DEFAULT 1,
    last_run DATETIME,
    next_run DATETIME,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )
`;
```

**Step 2: Add scheduler methods for per-user scheduling**

```typescript
async setUserSchedule(userId: number, cronExpression: string, enabled: boolean): Promise<void> {
  return new Promise((resolve, reject) => {
    const sql = `
      INSERT INTO user_schedule (user_id, cron_expression, enabled)
      VALUES (?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        cron_expression = excluded.cron_expression,
        enabled = excluded.enabled
    `;
    this.db.run(sql, [userId, cronExpression, enabled ? 1 : 0], (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

async getUserSchedule(userId: number): Promise<UserSchedule | null> {
  return new Promise((resolve, reject) => {
    const sql = 'SELECT * FROM user_schedule WHERE user_id = ?';
    this.db.get(sql, [userId], (err, row: any) => {
      if (err) {
        reject(err);
        return;
      }
      if (!row) {
        resolve(null);
        return;
      }
      resolve({
        user_id: row.user_id,
        cron_expression: row.cron_expression,
        enabled: !!row.enabled,
        last_run: row.last_run,
        next_run: row.next_run
      });
    });
  });
}

async getAllUserSchedules(): Promise<UserSchedule[]> {
  return new Promise((resolve, reject) => {
    const sql = 'SELECT * FROM user_schedule WHERE enabled = 1';
    this.db.all(sql, [], (err, rows: any[]) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(rows.map(row => ({
        user_id: row.user_id,
        cron_expression: row.cron_expression,
        enabled: !!row.enabled,
        last_run: row.last_run,
        next_run: row.next_run
      })));
    });
  });
}

async updateScheduleRunTime(userId: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const sql = 'UPDATE user_schedule SET last_run = CURRENT_TIMESTAMP WHERE user_id = ?';
    this.db.run(sql, [userId], (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}
```

**Step 3: Update scheduler to use per-user schedules**

In `scheduler.ts`, modify `updateAllPrices()`:

```typescript
async updateAllPrices(): Promise<void> {
  if (this.isUpdating) {
    console.log('Price update already in progress, skipping...');
    return;
  }

  this.isUpdating = true;
  console.log('Starting scheduled price update for all users...');

  try {
    await scraperService.initialize();

    // Get all user schedules
    const schedules = await dbService.getAllUserSchedules();
    console.log(`Found ${schedules.length} scheduled user(s)`);

    let totalUpdated = 0;
    let totalSkipped = 0;
    let totalErrors = 0;

    for (const schedule of schedules) {
      // Check if user has any products
      const products = await dbService.getAllProducts(schedule.user_id);
      if (products.length === 0) {
        continue;
      }

      const user = await dbService.getUserById(schedule.user_id);
      if (!user) continue;

      console.log(`Processing products for user: ${user.username} (ID: ${user.id})`);
      console.log(`  Schedule: ${schedule.cron_expression}`);

      // Process products (same logic as before)
      let updated = 0;
      let skipped = 0;
      let errors = 0;

      for (const product of products) {
        try {
          console.log(`  Processing ${product.asin} (${product.description})...`);

          const scrapedData = await scraperService.scrapeProduct(product.asin);
          const lastPrice = await dbService.getLastPrice(product.id);

          // Update categories if they have changed or were missing
          if (scrapedData.categories && scrapedData.categories.length > 0) {
            const currentCategories = product.categories || [];
            const currentCategoryNames = currentCategories.map(c => c.name).join(' > ');
            const newCategoryNames = scrapedData.categories.join(' > ');

            if (currentCategoryNames !== newCategoryNames) {
              await dbService.setProductCategories(product.id, scrapedData.categories);
              console.log(`    ✓ Categories updated: "${newCategoryNames}"`);
            }
          }

          // Check if product is unavailable
          if (!scrapedData.available) {
            await dbService.addPriceHistory(product.id, null, false, scrapedData.unavailableReason);
            console.log(`    ⚠ Product unavailable: ${scrapedData.unavailableReason}`);
            updated++;
          } else if (lastPrice === null || scrapedData.price !== lastPrice) {
            await dbService.addPriceHistory(product.id, scrapedData.price, true);
            if (lastPrice === null) {
              console.log(`    ✓ Price recorded: R$ ${scrapedData.price?.toFixed(2)} (first price)`);
            } else if (scrapedData.price && lastPrice && scrapedData.price < lastPrice) {
              console.log(`    ✓ Price dropped: R$ ${scrapedData.price.toFixed(2)} (previous: R$ ${lastPrice.toFixed(2)})`);
            } else if (scrapedData.price && lastPrice) {
              console.log(`    ✓ Price increased: R$ ${scrapedData.price.toFixed(2)} (previous: R$ ${lastPrice.toFixed(2)})`);
            }
            updated++;
          } else {
            console.log(`    - Price unchanged: R$ ${scrapedData.price?.toFixed(2)}`);
            skipped++;
          }

          // Small delay between products
          await new Promise(resolve => setTimeout(resolve, 2000));
        } catch (error) {
          console.error(`    ✗ Error updating ${product.asin}:`, error);
          errors++;
          // Log error
          await dbService.logScrapingError(user.id, product.id, product.asin, error instanceof Error ? error.message : 'Unknown error');
        }
      }

      console.log(`  User ${user.username}: ${updated} updated, ${skipped} skipped, ${errors} errors`);
      totalUpdated += updated;
      totalSkipped += skipped;
      totalErrors += errors;

      // Update last run time
      await dbService.updateScheduleRunTime(user.id);
    }

    console.log(`Price update completed: ${totalUpdated} updated, ${totalSkipped} skipped, ${totalErrors} errors`);
  } catch (error) {
    console.error('Error during scheduled price update:', error);
  } finally {
    this.isUpdating = false;
    await scraperService.close();
  }
}
```

---

## Phase 5: Security & Polish

### Task 16: Rate Limiting on Admin Endpoints

**Files:**
- Install: `npm install express-rate-limit`
- Modify: `backend/src/middleware/rateLimit.ts` (create)

**Step 1: Create rate limiting middleware**

```typescript
import rateLimit from 'express-rate-limit';

// General rate limiter for all API endpoints
export const generalRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: { error: 'Too many requests, please try again later.' }
});

// Stricter rate limiter for admin endpoints
export const adminRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // limit each admin to 50 requests per windowMs
  message: { error: 'Admin rate limit exceeded, please try again later.' }
});

// Very strict rate limiter for sensitive operations (create user, reset password, etc.)
export const sensitiveRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // limit to 5 sensitive operations per hour
  message: { error: 'Sensitive operation rate limit exceeded, please try again later.' }
});
```

**Step 2: Apply to admin routes**

```typescript
import { generalRateLimit, adminRateLimit, sensitiveRateLimit } from '../middleware/rateLimit';

// In admin.ts, apply to sensitive endpoints
router.post('/users', sensitiveRateLimit, async (req: AuthRequest, res: Response) => {
  // ... create user logic
});

router.post('/users/:id/reset-password', sensitiveRateLimit, async (req: AuthRequest, res: Response) => {
  // ... reset password logic
});

// Apply admin rate limit to all admin routes
router.use(adminRateLimit);
```

---

### Task 17: Input Validation

**Files:**
- Create: `backend/src/utils/adminValidation.ts`

**Step 1: Create validation utilities**

```typescript
export function validateUsername(username: string): { valid: boolean; error?: string } {
  if (!username || username.length < 3) {
    return { valid: false, error: 'Username must be at least 3 characters' };
  }
  if (username.length > 50) {
    return { valid: false, error: 'Username must be less than 50 characters' };
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
    return { valid: false, error: 'Username can only contain letters, numbers, hyphens, and underscores' };
  }
  return { valid: true };
}

export function validatePassword(password: string): { valid: boolean; error?: string } {
  if (!password || password.length < 6) {
    return { valid: false, error: 'Password must be at least 6 characters' };
  }
  if (password.length > 100) {
    return { valid: false, error: 'Password must be less than 100 characters' };
  }
  return { valid: true };
}

export function validateRole(role: string): { valid: boolean; error?: string } {
  if (!['USER', 'ADMIN'].includes(role)) {
    return { valid: false, error: 'Role must be either USER or ADMIN' };
  }
  return { valid: true };
}

export function validateConfigValue(key: string, value: string): { valid: boolean; error?: string } {
  switch (key) {
    case 'quota_max_products':
    case 'quota_max_lists':
      const num = parseInt(value);
      if (isNaN(num) || num < 0 || num > 10000) {
        return { valid: false, error: 'Value must be a number between 0 and 10000' };
      }
      break;
    case 'scheduler_enabled':
      if (value !== 'true' && value !== 'false') {
        return { valid: false, error: 'Value must be true or false' };
      }
      break;
    case 'scheduler_cron':
      // Basic cron validation - 5 parts separated by space
      if (!/^[0-9,*/-]+\s+[0-9,*/-]+\s+[0-9,*/-]+\s+[0-9,*/-]+\s+[0-9,*/-]+$/.test(value)) {
        return { valid: false, error: 'Invalid cron expression' };
      }
      break;
  }
  return { valid: true };
}
```

**Step 2: Apply validation in admin routes**

```typescript
import { validateUsername, validatePassword, validateRole, validateConfigValue } from '../utils/adminValidation';

// In create user endpoint
const usernameValidation = validateUsername(username);
if (!usernameValidation.valid) {
  return res.status(400).json({ error: usernameValidation.error });
}

const passwordValidation = validatePassword(password);
if (!passwordValidation.valid) {
  return res.status(400).json({ error: passwordValidation.error });
}

const roleValidation = validateRole(role);
if (!roleValidation.valid) {
  return res.status(400).json({ error: roleValidation.error });
}
```

---

### Task 18: Complete Portuguese Translations

**Files:**
- Modify: `frontend/src/i18n/locales/pt-BR.json`

**Step 1: Add all admin translations**

```json
{
  "admin": {
    "title": "Painel Admin",
    "tabs": {
      "users": "Usuários",
      "stats": "Estatísticas",
      "config": "Configuração",
      "audit": "Log de Auditoria"
    },
    "users": {
      "title": "Gerenciamento de Usuários",
      "createUser": "Criar Usuário",
      "searchPlaceholder": "Buscar usuários por nome...",
      "username": "Nome de Usuário",
      "role": "Função",
      "status": "Status",
      "products": "Produtos",
      "createdAt": "Criado em",
      "actions": "Ações",
      "disabled": "Desabilitado",
      "active": "Ativo",
      "viewStats": "Ver Estatísticas",
      "enable": "Habilitar",
      "disable": "Desabilitar",
      "confirmDisable": "Tem certeza que deseja desabilitar este usuário?",
      "userStats": "{{username}} - Estatísticas",
      "lists": "Listas",
      "priceHistory": "Histórico de Preços",
      "resetPassword": "Redefinir Senha",
      "newPassword": "Nova Senha",
      "passwordReset": "Senha redefinida com sucesso"
    },
    "stats": {
      "title": "Estatísticas do Sistema",
      "totalUsers": "Total de Usuários",
      "totalProducts": "Total de Produtos",
      "activeUsers": "Usuários Ativos",
      "totalAdmins": "Total de Admins",
      "disabledUsers": "Usuários Desabilitados",
      "priceHistoryRecords": "Registros de Histórico de Preços",
      "userDistribution": "Distribuição de Usuários",
      "users": "Usuários",
      "admins": "Admins",
      "activeUsers": "Usuários Ativos",
      "disabledUsers": "Usuários Desabilitados",
      "failedToLoad": "Falha ao carregar estatísticas do sistema"
    },
    "config": {
      "title": "Configuração do Sistema",
      "key": "Chave",
      "description": "Descrição",
      "value": "Valor",
      "updatedAt": "Atualizado em",
      "actions": "Ações",
      "edit": "Editar",
      "failedToUpdate": "Falha ao atualizar configuração"
    },
    "audit": {
      "title": "Log de Auditoria",
      "timestamp": "Data/Hora",
      "admin": "Admin",
      "action": "Ação",
      "target": "Alvo",
      "details": "Detalhes",
      "allTypes": "Todos os Tipos",
      "typeUser": "Usuários",
      "typeConfig": "Configuração"
    }
  },
  "common": {
    "close": "Fechar"
  }
}
```

---

### Task 19: Documentation Updates

**Files:**
- Modify: `backend/CLAUDE.md`
- Modify: `frontend/CLAUDE.md`
- Modify: `CLAUDE.md`

**Step 1: Update backend documentation**

Add to backend/CLAUDE.md:

```markdown
## Admin Features

- **Role-based access control**: Two roles (USER, ADMIN) stored in users table
- **Admin-only endpoints**: All `/api/admin/*` routes require admin role
- **Audit logging**: All admin actions logged to `audit_log` table
- **User management**: Create, disable, enable users, reset passwords
- **System config**: Per-user quotas, scheduler settings stored in `system_config` table
- **Rate limiting**: Admin endpoints have stricter rate limits

## Multi-Tenant Isolation

- All product data scoped by `user_id` foreign key
- Admin users can see all data across tenants
- Regular users can only access their own data
- Database queries use `WHERE user_id = ?` for all user-scoped operations
```

**Step 2: Update frontend documentation**

Add to frontend/CLAUDE.md:

```markdown
## Admin UI

- **AdminPanel**: Main admin component with tab navigation
- **User Management**: List, create, disable, enable users, reset passwords
- **System Stats**: Overview charts showing user/product distribution
- **System Config**: Edit system-wide settings
- **Audit Log**: View all admin actions with filtering
- **Access control**: Admin link only shown to users with ADMIN role
```

**Step 3: Update main documentation**

Add to CLAUDE.md:

```markdown
## Multi-User Administration

The app supports two user roles:

- **USER**: Regular users who track their own products
- **ADMIN**: System administrators who can:
  - Manage all users (create, disable, enable, reset passwords)
  - View system-wide statistics
  - Configure system settings (quotas, scheduler)
  - View audit logs of all admin actions

### Initial Admin Setup

First admin user is created via environment variables:
```
INITIAL_ADMIN_USERNAME=admin
INITIAL_ADMIN_PASSWORD=change-this-password-immediately
```

If not set, promote an existing user to admin via database:
```sql
UPDATE users SET role = 'ADMIN' WHERE username = 'your-username';
```

### Admin Access

Admin users see an "Admin" link in the main navigation leading to the admin panel.
```

---

## Testing Strategy

### Where to Add Tests

**Backend Tests** (when test framework is added):
- `backend/test/auth.test.ts`: JWT token generation, role verification, disabled user handling
- `backend/test/admin.test.ts`: Admin route access control, audit logging
- `backend/test/database.test.ts`: Migration scripts, quota enforcement
- `backend/test/scheduler.test.ts`: Per-user scheduling, error logging

**Frontend Tests** (when test framework is added):
- `frontend/src/components/__tests__/AdminPanel.test.tsx`: Tab navigation, role-based rendering
- `frontend/src/components/__tests__/UserManagement.test.tsx`: CRUD operations, modal handling
- `frontend/src/services/__tests__/api.test.ts`: Admin API calls

**Integration Tests**:
- Full admin workflow: create user, disable, enable, reset password
- Audit log verification: actions logged with correct details
- Quota enforcement: prevent product creation beyond limit
- Rate limiting: verify rate limit headers and responses

**E2E Tests** (Playwright):
- Admin login and navigation
- User management flow
- System config updates
- Audit log viewing

---

## Potential Pitfalls & Breaking Changes

### Breaking Changes

1. **JWT Token Format Change**:
   - Old tokens without `role` field will fail verification
   - Mitigation: Graceful fallback to USER role in authenticate middleware
   - Users need to re-login after deployment

2. **Database Schema Changes**:
   - Users table migration runs automatically on startup
   - Existing users get role='USER', is_disabled=0 defaults
   - Manual admin promotion required for first admin user

3. **Frontend User Interface Changes**:
   - User type now includes `role` and `is_disabled` fields
   - AuthContext remains compatible - no breaking changes
   - Existing components should handle new fields gracefully

### Potential Pitfalls

1. **SQLite ALTER TABLE Limitations**:
   - Can only ADD columns, not DROP or RENAME
   - Migration order matters (migrate before creating indexes)
   - Test migration on existing production database copy

2. **Scheduler Concurrent Updates**:
   - `isUpdating` flag prevents concurrent runs globally
   - Per-user scheduling needs more sophisticated queue management
   - Consider Redis/Job Queue for production multi-instance deployments

3. **Admin Route Security**:
   - Ensure `requireAdmin` middleware runs BEFORE route handlers
   - Audit logging must happen for ALL admin operations
   - Never expose user passwords (hash only)

4. **Rate Limiting State**:
   - In-memory rate limiters reset on server restart
   - Use Redis-backed rate limiting for production multi-instance setups
   - Admin rate limits should be more restrictive than general limits

5. **Quota Enforcement Timing**:
   - Check quota BEFORE creating product
   - Show warning at 80% utilization
   - Consider soft limit with override for admins

---

## Future Migration Considerations (SQLite → PostgreSQL)

### When to Migrate

- More than 1000 active users
- More than 100,000 price history records
- Need for horizontal scaling (multiple server instances)
- Need for advanced features (full-text search, complex analytics)

### Migration Strategy

1. **Schema Translation**:
   - SQLite INTEGER AUTOINCREMENT → PostgreSQL SERIAL/BIGSERIAL
   - SQLite TEXT → PostgreSQL TEXT/VARCHAR
   - SQLite INTEGER (boolean) → PostgreSQL BOOLEAN
   - SQLite DATETIME → PostgreSQL TIMESTAMP

2. **Query Adaptation**:
   - SQLite `LIMIT ? OFFSET ?` → PostgreSQL `LIMIT ? OFFSET ?` (same)
   - SQLite `SELECT last_insert_rowid()` → PostgreSQL `RETURNING id`
   - Parameter binding works the same way

3. **Transaction Management**:
   - SQLite: Automatic transactions in serialize()
   - PostgreSQL: Explicit BEGIN/COMMIT/ROLLBACK
   - Need to wrap all DB operations in transactions

4. **Connection Pooling**:
   - SQLite: Single file, no pooling needed
   - PostgreSQL: Use connection pool (pg package)
   - Configure pool size based on load

5. **Migration Path**:
   - Use database migration tool (node-pg-migrate, db-migrate)
   - Export data from SQLite, import to PostgreSQL
   - Update database service to use PostgreSQL driver
   - Keep SQLite as backup during migration

---

## Summary

This plan transforms amzscraper into a multi-tenant SaaS application with:

1. **Role-based access control**: USER and ADMIN roles with JWT-based enforcement
2. **Dedicated admin interface**: Full user management, system stats, configuration, audit logs
3. **Robust multi-tenant isolation**: User-scoped data with admin override capability
4. **Operational features**: Per-user scheduling, quota enforcement, error tracking, audit logging
5. **Security enhancements**: Rate limiting, input validation, audit trails

The implementation follows TDD principles (where tests exist), uses bite-sized tasks, and maintains backward compatibility where possible. All changes are incremental and can be deployed in phases.
