# Notification System Refactoring Plan

**Goal:** Refactor `2026-03-06-notifications.md` to align with the current multi-user SaaS implementation using the repository pattern established in the codebase.

## Context

The existing `2026-03-06-notifications.md` plan was written before the multi-user admin interface was fully implemented. It needs refactoring to:

1. Use the repository pattern (`db/notification-repo.ts`) instead of monolithic `database.ts` methods
2. Integrate with role-based access control (USER/ADMIN roles)
3. Add admin endpoints for cross-tenant notification visibility
4. Leverage `system_config` for notification quotas
5. Apply consistent validation using `utils/validation.ts`
6. Respect `is_disabled` user status

**Current Multi-User Implementation Reference:**
- `backend/src/middleware/auth.ts` - JWT with role, disabled user check
- `backend/src/middleware/admin.ts` - requireAdmin middleware
- `backend/src/routes/admin.ts` - Admin routes pattern
- `backend/src/services/db/migrations.ts` - Migration pattern
- `backend/src/services/db/admin-repo.ts` - Admin repository pattern

---

## Implementation Plan

### Phase 1: Database Schema & Repository

**Task 1: Create Notification Repository**

**File to create:** `backend/src/services/db/notification-repo.ts`

Create repository following the pattern of `admin-repo.ts` with these methods:

```typescript
// Notification Channels
async getNotificationChannels(userId: number): Promise<NotificationChannel[]>
async createNotificationChannel(userId: number, channel: CreateNotificationChannel): Promise<NotificationChannel>
async updateNotificationChannel(userId: number, channelId: number, updates: Partial<NotificationChannel>): Promise<NotificationChannel>
async deleteNotificationChannel(userId: number, channelId: number): Promise<void>

// Notification Rules (user-scoped)
async getNotificationRules(userId: number, productId?: number): Promise<NotificationRule[]>
async createNotificationRule(userId: number, rule: CreateNotificationRule): Promise<NotificationRule>
async updateNotificationRule(userId: number, ruleId: number, updates: Partial<NotificationRule>): Promise<NotificationRule>
async deleteNotificationRule(userId: number, ruleId: number): Promise<void>

// Notification Log
async logNotification(entry: NotificationLogEntry): Promise<void>
async getNotificationHistory(userId: number, limit: number, offset: number): Promise<NotificationLogEntry[]>
async getRecentNotification(ruleId: number, productId: number, withinHours: number): Promise<NotificationLogEntry | null>

// Admin-only methods
async getAllNotificationChannels(limit: number, offset: number): Promise<NotificationChannelWithUser[]>
async getAllNotificationRules(limit: number, offset: number): Promise<NotificationRuleWithUser[]>
async getAllNotificationHistory(limit: number, offset: number, userId?: number): Promise<NotificationLogEntryWithUser[]>

// Price Query Helpers
async getLowestPriceInDays(productId: number, days: number): Promise<number | null>
async getHighestPriceInDays(productId: number, days: number): Promise<number | null>
```

Use `dbRun`, `dbAll`, `dbGet` helpers from `db/helpers.ts`.

---

**Task 2: Add Notification Tables to Migrations**

**File to modify:** `backend/src/services/db/migrations.ts`

Add to DDL object:

```typescript
notificationChannels: `
  CREATE TABLE IF NOT EXISTS notification_channels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('email', 'telegram', 'discord')),
    name TEXT NOT NULL,
    config TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`,

notificationRules: `
  CREATE TABLE IF NOT EXISTS notification_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    product_id INTEGER,
    channel_id INTEGER NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('lowest_in_days', 'below_threshold', 'percentage_drop')),
    params TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    FOREIGN KEY (channel_id) REFERENCES notification_channels(id) ON DELETE CASCADE
  )`,

notificationLog: `
  CREATE TABLE IF NOT EXISTS notification_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    rule_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    channel_id INTEGER NOT NULL,
    trigger_type TEXT NOT NULL,
    message TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('sent', 'failed')),
    error_message TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (rule_id) REFERENCES notification_rules(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    FOREIGN KEY (channel_id) REFERENCES notification_channels(id) ON DELETE CASCADE
  )`,
```

Add indexes to `createIndexes`:

```typescript
'CREATE INDEX IF NOT EXISTS idx_notification_channels_user ON notification_channels(user_id)',
'CREATE INDEX IF NOT EXISTS idx_notification_rules_user ON notification_rules(user_id)',
'CREATE INDEX IF NOT EXISTS idx_notification_rules_product ON notification_rules(product_id)',
'CREATE INDEX IF NOT EXISTS idx_notification_log_user ON notification_log(user_id)',
'CREATE INDEX IF NOT EXISTS idx_notification_log_rule_product ON notification_log(rule_id, product_id)',
```

Add config defaults to `initializeSystemConfig`:

```typescript
{ key: 'quota_max_notification_channels', value: '5', description: 'Max notification channels per user' },
{ key: 'quota_max_notification_rules', value: '20', description: 'Max notification rules per user' },
```

---

**Task 3: Add TypeScript Interfaces**

**File to modify:** `backend/src/models/types.ts`

Add:

```typescript
export type NotificationChannelType = 'email' | 'telegram' | 'discord';

export interface EmailConfig {
  smtp_host: string;
  smtp_port: number;
  smtp_secure: boolean;
  smtp_user: string;
  smtp_pass: string;
  from_address: string;
  to_address: string;
}

export interface TelegramConfig {
  bot_token: string;
  chat_id: string;
}

export interface DiscordConfig {
  webhook_url: string;
}

export interface NotificationChannel {
  id: number;
  user_id: number;
  type: NotificationChannelType;
  name: string;
  config: EmailConfig | TelegramConfig | DiscordConfig;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface NotificationChannelWithUser extends NotificationChannel {
  username: string;
  role: UserRole;
  is_disabled: boolean;
}

export type NotificationRuleType = 'lowest_in_days' | 'below_threshold' | 'percentage_drop';

export interface LowestInDaysParams { days: number; }
export interface BelowThresholdParams { threshold: number; }
export interface PercentageDropParams { percentage: number; window_days: number; }

export interface NotificationRule {
  id: number;
  user_id: number;
  product_id: number | null;
  channel_id: number;
  type: NotificationRuleType;
  params: LowestInDaysParams | BelowThresholdParams | PercentageDropParams;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface NotificationRuleWithUser extends NotificationRule {
  username: string;
  product_description?: string;
  channel_name: string;
}

export interface NotificationLogEntry {
  id: number;
  user_id: number;
  rule_id: number;
  product_id: number;
  channel_id: number;
  trigger_type: string;
  message: string;
  status: 'sent' | 'failed';
  error_message: string | null;
  created_at: string;
}

export interface NotificationLogEntryWithUser extends NotificationLogEntry {
  username: string;
  product_description?: string;
  channel_name: string;
}
```

---

### Phase 2: Backend Services

**Task 4: Create Notification Channel Service**

**File to create:** `backend/src/services/notification-channel.ts`

Service for dispatching notifications through each channel type.

```typescript
interface NotificationPayload {
  productName: string;
  asin: string;
  currentPrice: number;
  triggerDescription: string;
  productUrl: string;
}

class NotificationChannelService {
  async sendEmail(config: EmailConfig, payload: NotificationPayload): Promise<void>
  async sendTelegram(config: TelegramConfig, payload: NotificationPayload): Promise<void>
  async sendDiscord(config: DiscordConfig, payload: NotificationPayload): Promise<void>
  async send(channel: NotificationChannel, payload: NotificationPayload): Promise<void>
  async testChannel(channel: NotificationChannel): Promise<{ success: boolean; error?: string }>
}
```

**Dependencies:** `nodemailer` + `@types/nodemailer`

**Integration:** Use built-in `fetch` for Telegram/Discord APIs (Node 18+).

---

**Task 5: Create Notification Evaluator**

**File to create:** `backend/src/services/notification-evaluator.ts`

Service for evaluating trigger rules after price updates.

```typescript
class NotificationEvaluator {
  async evaluateProduct(userId: number, productId: number, currentPrice: number): Promise<void>

  private async evaluateRule(rule: NotificationRule, productId: number, currentPrice: number): Promise<boolean>
  private async evaluateLowestInDays(productId: number, currentPrice: number, days: number): Promise<boolean>
  private async evaluateBelowThreshold(currentPrice: number, threshold: number): Promise<boolean>
  private async evaluatePercentageDrop(productId: number, currentPrice: number, percentage: number, windowDays: number): Promise<boolean>
}
```

**Disabled User Handling:** Skip notification evaluation for disabled users.

**Rule Resolution:**
1. Fetch global rules (`product_id IS NULL`)
2. Fetch per-product rules
3. Per-product rules replace (not stack with) global rules of same type
4. Check de-duplication (24-hour window) before sending
5. Log result to `notification_log`

---

**Task 6: Integrate with Scheduler**

**File to modify:** `backend/src/services/scheduler.ts`

Add evaluator call after each product price is recorded:

```typescript
import { NotificationEvaluator } from './notification-evaluator';

// In the product processing loop:
if (scrapedData.price !== null && !user.is_disabled) {
  await notificationEvaluator.evaluateProduct(user.id, product.id, scrapedData.price);
}
```

---

### Phase 3: User API Routes

**Task 7: Create Notification Routes**

**File to create:** `backend/src/routes/notifications.ts`

All routes require `authenticate` middleware.

| Method | Path | Body | Response |
|--------|------|------|----------|
| GET | `/api/notifications/channels` | — | `NotificationChannel[]` |
| POST | `/api/notifications/channels` | `{ type, name, config }` | `NotificationChannel` |
| PUT | `/api/notifications/channels/:id` | `{ name?, config?, enabled? }` | `NotificationChannel` |
| DELETE | `/api/notifications/channels/:id` | — | `{ message }` |
| POST | `/api/notifications/channels/:id/test` | — | `{ success, error? }` |
| GET | `/api/notifications/rules` | Query: `?productId=` | `NotificationRule[]` |
| POST | `/api/notifications/rules` | `{ product_id?, channel_id, type, params }` | `NotificationRule` |
| PUT | `/api/notifications/rules/:id` | `{ channel_id?, type?, params?, enabled? }` | `NotificationRule` |
| DELETE | `/api/notifications/rules/:id` | — | `{ message }` |
| GET | `/api/notifications/history` | Query: `?limit=` | `NotificationLogEntry[]` |

**Quota Enforcement:** Check `quota_max_notification_channels` and `quota_max_notification_rules` from `system_config` before creation.

**Validation:** Use `utils/validation.ts` for common validations; add notification-specific validators.

---

### Phase 4: Admin API Routes

**Task 8: Add Admin Notification Endpoints**

**File to modify:** `backend/src/routes/admin.ts`

Add admin-only routes under `/api/admin/notifications/*`:

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/admin/notifications/channels` | List all channels with user info |
| GET | `/api/admin/notifications/rules` | List all rules with user/product info |
| GET | `/api/admin/notifications/history` | View all notification delivery history |

Admin routes:
- Use `requireAdmin` middleware
- Support pagination (`limit`, `offset`)
- Support filtering by `userId` query parameter
- Include user details (username, role, is_disabled) in responses

---

### Phase 5: Frontend Implementation

**Task 9: Add API Methods**

**File to modify:** `frontend/src/services/api.ts`

Add to existing API object:

```typescript
notifications: {
  getChannels: () => Promise<NotificationChannel[]>
  createChannel: (data: CreateChannelInput) => Promise<NotificationChannel>
  updateChannel: (id: number, data: UpdateChannelInput) => Promise<NotificationChannel>
  deleteChannel: (id: number) => Promise<void>
  testChannel: (id: number) => Promise<{ success: boolean; error?: string }>
  getRules: (productId?: number) => Promise<NotificationRule[]>
  createRule: (data: CreateRuleInput) => Promise<NotificationRule>
  updateRule: (id: number, data: UpdateRuleInput) => Promise<NotificationRule>
  deleteRule: (id: number) => Promise<void>
  getHistory: (limit?: number) => Promise<NotificationLogEntry[]>
}
```

Add admin methods:

```typescript
adminNotifications: {
  getAllChannels: (limit?: number, offset?: number) => Promise<NotificationChannelWithUser[]>
  getAllRules: (limit?: number, offset?: number) => Promise<NotificationRuleWithUser[]>
  getAllHistory: (limit?: number, offset?: number, userId?: number) => Promise<NotificationLogEntryWithUser[]>
}
```

---

**Task 10: Add Admin UI Components**

**Files to create:**
- `frontend/src/components/admin/Notifications.tsx` - Admin notifications overview

**Files to modify:**
- `frontend/src/components/AdminPanel.tsx` - Add notifications tab
- `frontend/src/App.css` - Add styles

**Notifications Tab Structure:**
- Sub-tabs: Channels, Rules, History
- Each sub-table shows user info (username, role badge, status badge)
- Search/filter by username
- Click user to view their notification rules/channels

---

**Task 11: Add User Notifications UI**

**Files to create:**
- `frontend/src/components/Notifications.tsx` - User notification management
- `frontend/src/components/ProductNotifications.tsx` - Per-product notification rules

**Files to modify:**
- `frontend/src/components/Config.tsx` - Add notifications section
- `frontend/src/components/ProductDetail.tsx` - Add per-product rules section

**Notifications Section Tabs:**
1. **Channels**: List user's channels, add/edit/delete, test button
2. **Global Rules**: List rules with product_id=null, add/edit/delete
3. **History**: User's notification delivery history

---

**Task 12: Add i18n Translations**

**Files to modify:**
- `frontend/src/i18n/locales/en.json`
- `frontend/src/i18n/locales/pt-BR.json`

Add notification keys (same structure as existing plan, ~50 keys).

Add admin notification keys:

```json
{
  "admin": {
    "notifications": {
      "title": "Notifications",
      "channels": "Channels",
      "rules": "Rules",
      "history": "History",
      "viewUser": "View User",
      "searchUser": "Search by username..."
    }
  }
}
```

---

## Implementation Order

### Phase 1: Database & Types (Days 1-2)
1. Add notification DDL to `migrations.ts`
2. Create `notification-repo.ts` with all CRUD methods
3. Add TypeScript interfaces to `types.ts`

### Phase 2: Backend Services (Days 3-4)
4. Install `nodemailer` dependency
5. Create `notification-channel.ts` service
6. Create `notification-evaluator.ts` service
7. Integrate evaluator with `scheduler.ts`

### Phase 3: API Routes (Days 5-6)
8. Create `routes/notifications.ts` (user endpoints)
9. Add admin endpoints to `routes/admin.ts`
10. Add quota enforcement in routes

### Phase 4: Frontend API (Day 7)
11. Add notification API methods to `api.ts`
12. Add admin notification API methods

### Phase 5: Frontend UI (Days 8-10)
13. Create `Notifications.tsx` user component
14. Create `ProductNotifications.tsx` component
15. Add notifications tab to `AdminPanel.tsx`
16. Add notifications section to `Config.tsx`
17. Add notifications section to `ProductDetail.tsx`
18. Add all i18n translations
19. Add CSS styles

---

## Critical Files Reference

| File | Purpose |
|------|---------|
| `backend/src/services/db/migrations.ts` | Add notification tables and indexes |
| `backend/src/services/db/helpers.ts` | Reuse dbRun, dbAll, dbGet utilities |
| `backend/src/services/db/notification-repo.ts` | **NEW** - Notification database operations |
| `backend/src/services/notification-channel.ts` | **NEW** - Channel dispatch service |
| `backend/src/services/notification-evaluator.ts` | **NEW** - Trigger evaluation service |
| `backend/src/services/scheduler.ts` | Integrate evaluator after price update |
| `backend/src/routes/notifications.ts` | **NEW** - User notification endpoints |
| `backend/src/routes/admin.ts` | Add admin notification endpoints |
| `backend/src/middleware/auth.ts` | Reuse authenticate middleware |
| `backend/src/middleware/admin.ts` | Reuse requireAdmin middleware |
| `backend/src/utils/validation.ts` | Extend with notification validators |
| `backend/src/models/types.ts` | Add notification interfaces |
| `frontend/src/services/api.ts` | Add notification API methods |
| `frontend/src/components/admin/Notifications.tsx` | **NEW** - Admin notifications view |
| `frontend/src/components/Notifications.tsx` | **NEW** - User notifications management |
| `frontend/src/components/AdminPanel.tsx` | Add notifications tab |
| `frontend/src/components/Config.tsx` | Add notifications section |
| `frontend/src/components/ProductDetail.tsx` | Add per-product rules |

---

## Verification

### Backend Testing
1. **Database Migration**: Verify tables and indexes created correctly
   ```sql
   .schema notification_channels
   .schema notification_rules
   .schema notification_log
   ```

2. **Quota Enforcement**: Create channel beyond limit, expect 429 response

3. **Disabled User**: Verify disabled users don't receive notifications

4. **Evaluator Triggers**:
   - Create lowest_in_days rule, trigger notification
   - Create below_threshold rule, trigger notification
   - Create percentage_drop rule, trigger notification

5. **Admin Access**: Verify non-admins get 403 on `/api/admin/notifications/*`

### Frontend Testing
1. **User Flow**:
   - Create email channel, test send
   - Create telegram channel, test send
   - Create global rule
   - Create per-product rule
   - View notification history

2. **Admin Flow**:
   - View all notification channels across users
   - View all notification rules
   - Filter by username
   - View delivery history with user details

3. **Edge Cases**:
   - Disabled user's notification rules not evaluated
   - De-duplication (same rule/product within 24h)
   - Channel deletion cascades to rules

### End-to-End Test
1. User creates notification rule
2. Admin views rule in admin panel
3. Scheduler runs, notification sent
4. User sees entry in history
5. Admin sees entry in admin history

---

## Original Plan File Updates

After implementation, update `docs/plans/2026-03-06-notifications.md`:
- Replace monolithic `database.ts` approach with repository pattern
- Add admin endpoints section
- Add quota enforcement details
- Add disabled user handling
- Update file change summary with actual files created/modified
- Reference this refactoring plan as the source of truth
