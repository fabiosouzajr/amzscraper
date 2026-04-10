# Notification System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a configurable notification system that alerts users via Email, Telegram, or Discord when tracked products meet price conditions (lowest in N days, below threshold, percentage drop).

**Architecture:** New `NotificationService` evaluates trigger rules after every scrape (scheduled and manual). Rules can be global (apply to all products) or per-product (override globals). A `NotificationChannelService` dispatches messages through configured channels. All config is stored in new SQLite tables and managed via new API routes and a frontend settings UI.

**Tech Stack:** nodemailer (Email/SMTP), node-fetch or built-in fetch (Telegram Bot API, Discord Webhooks), SQLite for rule/channel storage, React components for config UI.

---

## 1. Problem Statement

The app scrapes Amazon.com.br daily and records price history, but users must manually check the dashboard to discover price changes. There is no proactive alerting mechanism. Users need configurable notifications so they are informed immediately when a product hits a meaningful price point — without having to open the app.

### Requirements

- **Three notification channels:** Email (SMTP), Telegram Bot, Discord Webhook
- **Three trigger types:**
  1. **Lowest price in N days** — price is the lowest recorded in the last 30/60/90/custom days
  2. **Price below threshold** — price drops below a user-defined absolute value (e.g., R$ 500)
  3. **Percentage drop** — price drops by X% compared to the highest price in a recent window
- **Two scopes:** Global rules (apply to all products) and per-product rules (override globals)
- **Timing:** Evaluate triggers after every scrape — both the daily scheduled scrape and manual "Update Prices" actions
- **Multi-tenant:** Each user has independent channels and rules

---

## 2. Backend & Database Changes

### 2.1 New Database Tables

Add these tables to the migration block in `backend/src/services/database.ts` (after existing table creation, around line 130):

#### `notification_channels`

Stores user-configured delivery channels.

```sql
CREATE TABLE IF NOT EXISTS notification_channels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('email', 'telegram', 'discord')),
  name TEXT NOT NULL,                    -- user-friendly label, e.g. "My Gmail"
  config TEXT NOT NULL,                  -- JSON blob with channel-specific settings
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_notification_channels_user ON notification_channels(user_id);
```

**`config` JSON by type:**

| Type | Fields |
|------|--------|
| `email` | `{ "smtp_host", "smtp_port", "smtp_secure", "smtp_user", "smtp_pass", "from_address", "to_address" }` |
| `telegram` | `{ "bot_token", "chat_id" }` |
| `discord` | `{ "webhook_url" }` |

#### `notification_rules`

Stores trigger conditions. A rule is either global (`product_id IS NULL`) or per-product.

```sql
CREATE TABLE IF NOT EXISTS notification_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  product_id INTEGER,                    -- NULL = global rule, non-NULL = per-product
  channel_id INTEGER NOT NULL,           -- which channel to notify through
  type TEXT NOT NULL CHECK(type IN ('lowest_in_days', 'below_threshold', 'percentage_drop')),
  params TEXT NOT NULL,                  -- JSON blob with type-specific parameters
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  FOREIGN KEY (channel_id) REFERENCES notification_channels(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_notification_rules_user ON notification_rules(user_id);
CREATE INDEX IF NOT EXISTS idx_notification_rules_product ON notification_rules(product_id);
```

**`params` JSON by type:**

| Type | Fields | Example |
|------|--------|---------|
| `lowest_in_days` | `{ "days": 30 }` | Notify if lowest price in last 30 days |
| `below_threshold` | `{ "threshold": 500.00 }` | Notify if price < R$ 500 |
| `percentage_drop` | `{ "percentage": 20, "window_days": 30 }` | Notify if price dropped 20% from max in last 30 days |

#### `notification_log`

Prevents duplicate notifications and provides history.

```sql
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
);
CREATE INDEX IF NOT EXISTS idx_notification_log_user ON notification_log(user_id);
CREATE INDEX IF NOT EXISTS idx_notification_log_rule_product ON notification_log(rule_id, product_id);
```

**De-duplication logic:** Before sending, check if a notification was already sent for the same `(rule_id, product_id)` pair in the last 24 hours. This prevents spamming on manual re-scrapes.

### 2.2 Database Service Methods

Add to `backend/src/services/database.ts`:

**Notification Channels:**
1. `getNotificationChannels(userId: number): Promise<NotificationChannel[]>`
2. `getNotificationChannel(userId: number, channelId: number): Promise<NotificationChannel | null>`
3. `createNotificationChannel(userId: number, type: string, name: string, config: object): Promise<NotificationChannel>`
4. `updateNotificationChannel(userId: number, channelId: number, updates: Partial<NotificationChannel>): Promise<NotificationChannel>`
5. `deleteNotificationChannel(userId: number, channelId: number): Promise<void>`

**Notification Rules:**
1. `getNotificationRules(userId: number, productId?: number): Promise<NotificationRule[]>` — if productId provided, return rules for that product + global rules
2. `createNotificationRule(userId: number, rule: CreateRuleInput): Promise<NotificationRule>`
3. `updateNotificationRule(userId: number, ruleId: number, updates: Partial<NotificationRule>): Promise<NotificationRule>`
4. `deleteNotificationRule(userId: number, ruleId: number): Promise<void>`
5. `getGlobalRules(userId: number): Promise<NotificationRule[]>` — rules where `product_id IS NULL`
6. `getProductRules(userId: number, productId: number): Promise<NotificationRule[]>` — rules where `product_id = ?`

**Notification Log:**
1. `logNotification(entry: NotificationLogEntry): Promise<void>`
2. `getRecentNotification(ruleId: number, productId: number, withinHours: number): Promise<NotificationLogEntry | null>` — for de-duplication
3. `getNotificationHistory(userId: number, limit?: number): Promise<NotificationLogEntry[]>`

**Price Query Helpers** (for trigger evaluation):
1. `getLowestPriceInDays(productId: number, days: number): Promise<number | null>` — min price in `price_history` within the last N days
2. `getHighestPriceInDays(productId: number, days: number): Promise<number | null>` — max price in `price_history` within the last N days

### 2.3 New Services

#### `backend/src/services/notification-channel.ts` — Channel Dispatchers

Responsible for sending messages through each channel type.

```typescript
interface NotificationPayload {
  productName: string;
  asin: string;
  currentPrice: number;
  triggerDescription: string; // e.g., "Lowest price in 30 days"
  productUrl: string;        // https://www.amazon.com.br/dp/{ASIN}
}

class NotificationChannelService {
  async sendEmail(config: EmailConfig, payload: NotificationPayload): Promise<void>
  async sendTelegram(config: TelegramConfig, payload: NotificationPayload): Promise<void>
  async sendDiscord(config: DiscordConfig, payload: NotificationPayload): Promise<void>
  async send(channel: NotificationChannel, payload: NotificationPayload): Promise<void>
  async testChannel(channel: NotificationChannel): Promise<{ success: boolean; error?: string }>
}
```

**Dependencies to install:**
- `nodemailer` + `@types/nodemailer` — for SMTP email sending
- No new dependencies needed for Telegram/Discord — use built-in `fetch` (Node 18+)

**Telegram sending:** `POST https://api.telegram.org/bot{token}/sendMessage` with `chat_id` and `text` (Markdown format).

**Discord sending:** `POST {webhook_url}` with JSON body `{ content: string }` or embed format.

**Email sending:** Use `nodemailer.createTransport(smtpConfig).sendMail({ from, to, subject, html })`.

#### `backend/src/services/notification-evaluator.ts` — Trigger Evaluation

Responsible for checking which rules fire for a given product after a price update.

```typescript
class NotificationEvaluator {
  /**
   * Called after a product is scraped with a new price.
   * Evaluates all applicable rules (global + per-product) and sends notifications.
   */
  async evaluateProduct(userId: number, productId: number, currentPrice: number): Promise<void>

  private async evaluateRule(rule: NotificationRule, productId: number, currentPrice: number): Promise<boolean>
  private async evaluateLowestInDays(productId: number, currentPrice: number, days: number): Promise<boolean>
  private async evaluateBelowThreshold(currentPrice: number, threshold: number): Promise<boolean>
  private async evaluatePercentageDrop(productId: number, currentPrice: number, percentage: number, windowDays: number): Promise<boolean>
}
```

**Trigger evaluation logic:**

1. **`lowest_in_days`**: Query `getLowestPriceInDays(productId, days)`. If `currentPrice <= lowestPrice`, trigger fires. Edge case: if fewer than 2 price records exist, skip (not enough history).

2. **`below_threshold`**: Simply check `currentPrice < threshold`. De-duplication prevents re-firing on every scrape while price remains below threshold.

3. **`percentage_drop`**: Query `getHighestPriceInDays(productId, windowDays)`. Calculate `dropPercent = ((highestPrice - currentPrice) / highestPrice) * 100`. If `dropPercent >= percentage`, trigger fires.

**Rule resolution order:**
1. Fetch global rules for the user (`product_id IS NULL`)
2. Fetch per-product rules for this product
3. Per-product rules of the same type **replace** (not stack with) global rules of that type
4. Evaluate remaining rules
5. For each triggered rule: check de-duplication → send notification → log result

### 2.4 Integration Point: After Scrape

Modify the scraper/scheduler to call the evaluator after each product price is recorded.

**In `backend/src/services/scheduler.ts`** — inside the loop that processes each product during `updateAllPrices()`:

```typescript
// After recording the price in price_history:
if (scrapedData.price !== null) {
  await notificationEvaluator.evaluateProduct(userId, product.id, scrapedData.price);
}
```

**In `backend/src/routes/prices.ts`** — inside the SSE handler for manual updates, same integration point after each product's price is recorded.

### 2.5 New API Routes

Create `backend/src/routes/notifications.ts` — all routes require authentication.

#### Channels CRUD

| Method | Path | Body | Response |
|--------|------|------|----------|
| `GET` | `/api/notifications/channels` | — | `NotificationChannel[]` |
| `POST` | `/api/notifications/channels` | `{ type, name, config }` | `NotificationChannel` |
| `PUT` | `/api/notifications/channels/:id` | `{ name?, config?, enabled? }` | `NotificationChannel` |
| `DELETE` | `/api/notifications/channels/:id` | — | `{ message }` |
| `POST` | `/api/notifications/channels/:id/test` | — | `{ success, error? }` |

#### Rules CRUD

| Method | Path | Body | Response |
|--------|------|------|----------|
| `GET` | `/api/notifications/rules` | Query: `?productId=` (optional) | `NotificationRule[]` |
| `POST` | `/api/notifications/rules` | `{ product_id?, channel_id, type, params }` | `NotificationRule` |
| `PUT` | `/api/notifications/rules/:id` | `{ channel_id?, type?, params?, enabled? }` | `NotificationRule` |
| `DELETE` | `/api/notifications/rules/:id` | — | `{ message }` |

#### Notification History

| Method | Path | Body | Response |
|--------|------|------|----------|
| `GET` | `/api/notifications/history` | Query: `?limit=` (default 50) | `NotificationLogEntry[]` |

### 2.6 TypeScript Types

Add to a new file `backend/src/types/notification.ts`:

```typescript
interface NotificationChannel {
  id: number;
  user_id: number;
  type: 'email' | 'telegram' | 'discord';
  name: string;
  config: EmailConfig | TelegramConfig | DiscordConfig;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

interface EmailConfig {
  smtp_host: string;
  smtp_port: number;
  smtp_secure: boolean;
  smtp_user: string;
  smtp_pass: string;
  from_address: string;
  to_address: string;
}

interface TelegramConfig {
  bot_token: string;
  chat_id: string;
}

interface DiscordConfig {
  webhook_url: string;
}

interface NotificationRule {
  id: number;
  user_id: number;
  product_id: number | null;
  channel_id: number;
  type: 'lowest_in_days' | 'below_threshold' | 'percentage_drop';
  params: LowestInDaysParams | BelowThresholdParams | PercentageDropParams;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

interface LowestInDaysParams { days: number; }
interface BelowThresholdParams { threshold: number; }
interface PercentageDropParams { percentage: number; window_days: number; }

interface NotificationLogEntry {
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
```

### 2.7 Input Validation

All API routes must validate:
- **Channel type** is one of `email`, `telegram`, `discord`
- **Channel config** matches the expected shape for the type (required fields present, smtp_port is a number, etc.)
- **Rule type** is one of `lowest_in_days`, `below_threshold`, `percentage_drop`
- **Rule params** match the type (`days` > 0, `threshold` > 0, `percentage` between 1-99, `window_days` > 0)
- **channel_id** belongs to the authenticated user
- **product_id** (if provided) belongs to the authenticated user

### 2.8 Backend Dependencies

```bash
cd backend && npm install nodemailer && npm install -D @types/nodemailer
```

No other new dependencies — Telegram and Discord APIs use built-in `fetch`.

---

## 3. Frontend Changes

### 3.1 New API Methods

Add to `frontend/src/services/api.ts`:

```typescript
// Notification Channels
getNotificationChannels(): Promise<NotificationChannel[]>
createNotificationChannel(data: CreateChannelInput): Promise<NotificationChannel>
updateNotificationChannel(id: number, data: UpdateChannelInput): Promise<NotificationChannel>
deleteNotificationChannel(id: number): Promise<void>
testNotificationChannel(id: number): Promise<{ success: boolean; error?: string }>

// Notification Rules
getNotificationRules(productId?: number): Promise<NotificationRule[]>
createNotificationRule(data: CreateRuleInput): Promise<NotificationRule>
updateNotificationRule(id: number, data: UpdateRuleInput): Promise<NotificationRule>
deleteNotificationRule(id: number): Promise<void>

// Notification History
getNotificationHistory(limit?: number): Promise<NotificationLogEntry[]>
```

### 3.2 New Config Section: "Notifications"

Add a new sidebar item in `frontend/src/components/Config.tsx` alongside existing sections (Dashboard, Database, Data Export, Account).

The Notifications section has **three tabs/sub-sections:**

#### Tab 1: Channels

- List of configured channels with enable/disable toggle and delete button
- "Add Channel" button opens a form:
  - **Channel type** selector (Email, Telegram, Discord)
  - **Name** text input
  - **Config fields** change dynamically based on type:
    - **Email:** SMTP host, port, secure toggle, username, password, from address, to address
    - **Telegram:** Bot token, Chat ID (with a help link explaining how to get these)
    - **Discord:** Webhook URL (with a help link explaining how to create one)
  - **"Test"** button — sends a test message and shows success/failure inline
  - **Save** button

#### Tab 2: Global Rules

- List of existing global rules with enable/disable toggle, edit, and delete
- Each rule displays: trigger type (human-readable), parameters, target channel name
- "Add Rule" button opens a form:
  - **Trigger type** selector (Lowest in N days, Below threshold, Percentage drop)
  - **Parameters** change dynamically based on type:
    - **Lowest in N days:** Number input for days (presets: 30, 60, 90)
    - **Below threshold:** Currency input for price (R$)
    - **Percentage drop:** Percentage input + window days input
  - **Channel** selector (dropdown of user's enabled channels)
  - **Save** button

#### Tab 3: Notification History

- Table/list showing recent notifications:
  - Date/time, product name, trigger type, channel used, status (sent/failed)
  - Failed entries show error message on expand/hover
- Pagination or "Load more" for history

### 3.3 Per-Product Rules in ProductDetail

Add a collapsible "Notification Rules" section to `frontend/src/components/ProductDetail.tsx`, below the price history chart.

- Shows rules specific to this product
- Indicates which global rules apply (with label "Global")
- "Add Rule for This Product" button — same form as global rules but with `product_id` pre-filled
- Edit/delete/toggle for per-product rules
- Note: editing global rules from here redirects to the Config > Notifications > Global Rules tab

### 3.4 i18n Translation Keys

Add to both `frontend/src/i18n/locales/en.json` and `frontend/src/i18n/locales/pt-BR.json`:

```
notifications.title
notifications.channels
notifications.channels.add
notifications.channels.edit
notifications.channels.delete
notifications.channels.test
notifications.channels.testSuccess
notifications.channels.testFailed
notifications.channels.type.email
notifications.channels.type.telegram
notifications.channels.type.discord
notifications.channels.name
notifications.channels.enabled
notifications.channels.noChannels

notifications.channels.email.smtpHost
notifications.channels.email.smtpPort
notifications.channels.email.smtpSecure
notifications.channels.email.smtpUser
notifications.channels.email.smtpPass
notifications.channels.email.fromAddress
notifications.channels.email.toAddress
notifications.channels.telegram.botToken
notifications.channels.telegram.chatId
notifications.channels.telegram.help
notifications.channels.discord.webhookUrl
notifications.channels.discord.help

notifications.rules
notifications.rules.add
notifications.rules.addForProduct
notifications.rules.edit
notifications.rules.delete
notifications.rules.global
notifications.rules.perProduct
notifications.rules.type.lowestInDays
notifications.rules.type.belowThreshold
notifications.rules.type.percentageDrop
notifications.rules.params.days
notifications.rules.params.threshold
notifications.rules.params.percentage
notifications.rules.params.windowDays
notifications.rules.channel
notifications.rules.noRules
notifications.rules.enabled

notifications.history
notifications.history.empty
notifications.history.status.sent
notifications.history.status.failed
notifications.history.product
notifications.history.trigger
notifications.history.channel
notifications.history.date
notifications.history.error
```

### 3.5 CSS Styles

Add to `frontend/src/App.css`:

- `.notifications-section` — container for the notifications config area
- `.channel-list`, `.channel-card` — channel display cards with type icon, name, toggle
- `.channel-form` — dynamic form for adding/editing channels
- `.rule-list`, `.rule-card` — rule display with human-readable trigger description
- `.rule-form` — dynamic form for adding/editing rules
- `.notification-history-table` — log table styling
- `.test-button`, `.test-result` — test channel button and inline result display
- `.product-notifications` — collapsible section in ProductDetail

Follow the existing app's visual language: Amazon dark blue (`#232f3e`), orange accents (`#ff9900`), card-based layouts with shadows, consistent form styling matching the Account section in Config.

---

## 4. Implementation Order

The recommended implementation sequence, designed so each step builds on the previous and can be tested independently:

### Phase 1: Database & Types
1. Add TypeScript type definitions (`backend/src/types/notification.ts`)
2. Add the three new tables to the migration block in `database.ts`
3. Add database service methods for channels, rules, and log CRUD
4. Add price query helpers (`getLowestPriceInDays`, `getHighestPriceInDays`)

### Phase 2: Channel Dispatch Service
5. Install `nodemailer` dependency
6. Create `NotificationChannelService` with `sendEmail`, `sendTelegram`, `sendDiscord`
7. Implement `testChannel` method for each type

### Phase 3: Notification Evaluator
8. Create `NotificationEvaluator` with trigger logic for all three types
9. Implement rule resolution (global + per-product, with per-product overrides)
10. Implement de-duplication check against `notification_log`

### Phase 4: API Routes
11. Create `backend/src/routes/notifications.ts` with channels CRUD + test endpoint
12. Add rules CRUD endpoints
13. Add history endpoint
14. Register routes in `backend/src/server.ts`
15. Add input validation for all endpoints

### Phase 5: Scraper Integration
16. Import evaluator into scheduler service
17. Call `evaluateProduct` after each product's price is recorded in `updateAllPrices()`
18. Same integration in manual price update SSE handler in `prices.ts`

### Phase 6: Frontend — API Layer & Config UI
19. Add notification API methods to `frontend/src/services/api.ts`
20. Add all i18n translation keys (en + pt-BR)
21. Build Channels management UI in Config section
22. Build Global Rules management UI in Config section
23. Build Notification History view in Config section

### Phase 7: Frontend — Per-Product Rules
24. Add per-product notification rules section to `ProductDetail.tsx`
25. Add CSS for all new notification components

### Phase 8: Polish & Edge Cases
26. Handle channel deletion cascading to rules (confirm dialog in UI)
27. Handle disabled channels gracefully (skip in evaluator, show visual indicator)
28. Handle products with insufficient price history (skip rule evaluation, show info in UI)
29. Add loading states and error handling for all new API calls

---

## 5. File Change Summary

### New Files
| File | Purpose |
|------|---------|
| `backend/src/types/notification.ts` | TypeScript interfaces for notifications |
| `backend/src/services/notification-channel.ts` | Channel dispatch (Email, Telegram, Discord) |
| `backend/src/services/notification-evaluator.ts` | Trigger evaluation logic |
| `backend/src/routes/notifications.ts` | API routes for channels, rules, history |

### Modified Files
| File | Changes |
|------|---------|
| `backend/src/services/database.ts` | Add 3 tables, CRUD methods, price query helpers |
| `backend/src/services/scheduler.ts` | Call evaluator after price recording |
| `backend/src/routes/prices.ts` | Call evaluator in manual update SSE handler |
| `backend/src/server.ts` | Register notification routes |
| `backend/package.json` | Add `nodemailer` dependency |
| `frontend/src/services/api.ts` | Add notification API methods |
| `frontend/src/components/Config.tsx` | Add Notifications section with 3 tabs |
| `frontend/src/components/ProductDetail.tsx` | Add per-product notification rules |
| `frontend/src/i18n/locales/en.json` | Add ~40 notification translation keys |
| `frontend/src/i18n/locales/pt-BR.json` | Add ~40 notification translation keys |
| `frontend/src/App.css` | Add notification component styles |
