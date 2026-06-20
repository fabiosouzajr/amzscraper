# Telegram Bot Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `/start` bot listener so users can get their Telegram Chat ID, and wire the global `TELEGRAM_BOT_TOKEN` env var into both the listener and `sendTelegram` (removing per-channel token storage).

**Architecture:** `TELEGRAM_BOT_TOKEN` lives exclusively in the env var / `AppConfig.telegramBotToken`. `TelegramConfig` drops `bot_token`, keeping only `chat_id`. A new `backend/src/services/telegram.ts` holds the long-polling `/start` listener using `node-telegram-bot-api`. A DB migration strips `bot_token` from any existing Telegram channel configs on startup. Creating a Telegram channel returns `400` if the env var is not set.

**Tech Stack:** `node-telegram-bot-api` + `@types/node-telegram-bot-api`, Express, SQLite3, React 18 + i18next

**Spec:** `docs/superpowers/specs/2026-06-15-telegram-bot-design.md`
**ADR:** `docs/adr/0001-global-bot-token.md`

---

## File Map

| Action | File | Change |
| -------- | ------ | -------- |
| Modify | `backend/src/config.ts` | Add `telegramBotToken` to `AppConfig` + `loadConfig` |
| Modify | `backend/src/models/types.ts` | `TelegramConfig`: remove `bot_token`, keep `chat_id` only |
| Modify | `backend/src/services/notification-channel.ts` | `sendTelegram` reads token from `appConfig.telegramBotToken` |
| Create | `backend/src/services/telegram.ts` | `initTelegramBot` — long-polling `/start` listener |
| Modify | `backend/src/services/db/migrations.ts` | New step: strip `bot_token` from existing telegram channel configs |
| Modify | `backend/src/routes/notifications.ts` | Guard: reject telegram channel creation if token not set |
| Modify | `backend/src/server.ts` | Call `initTelegramBot(config.telegramBotToken)` after DB ready |
| Modify | `frontend/src/types.ts` | `TelegramConfig`: remove `bot_token` |
| Modify | `frontend/src/components/ChannelForm.tsx` | Remove `botToken` state + Bot Token input field |
| Modify | `frontend/src/i18n/locales/en.json` | Remove `notifications.channels.telegram.botToken` key |
| Modify | `frontend/src/i18n/locales/pt-BR.json` | Same |

---

### Task 1: Install dependency

**Files:**
- Modify: `backend/package.json` (auto-updated by npm)

- [ ] **Step 1: Install `node-telegram-bot-api`**

```bash
cd backend && npm install node-telegram-bot-api @types/node-telegram-bot-api
```

Expected: `package.json` and `package-lock.json` updated, no errors.

- [ ] **Step 2: Verify TypeScript type available**

```bash
cd backend && npx tsc --noEmit 2>&1 | head -20
```

Expected: same errors as before (pre-existing test file errors only) — no new errors about `node-telegram-bot-api`.

- [ ] **Step 3: Commit**

```bash
git add backend/package.json backend/package-lock.json
git commit -m "chore: add node-telegram-bot-api dependency"
```

---

### Task 2: Add `telegramBotToken` to backend config

**Files:**
- Modify: `backend/src/config.ts`

- [ ] **Step 1: Add field to `AppConfig` interface**

In `backend/src/config.ts`, add `telegramBotToken: string;` to the `AppConfig` interface:

```typescript
export interface AppConfig {
  // Server
  port: number;
  portFallback: number;
  bindAddress: string;

  // Security
  jwtSecret: string;
  jwtExpiresIn: string;
  bcryptRounds: number;

  // Database
  dbPath: string;

  // Admin bootstrap (legacy -- deprecated, use setup flow)
  initialAdminUsername: string | null;
  initialAdminPassword: string | null;

  // Telegram
  telegramBotToken: string;

  // Environment
  nodeEnv: 'development' | 'production' | 'test';
  isProduction: boolean;
}
```

- [ ] **Step 2: Add to `loadConfig()` return value**

In the `return { ... }` block inside `loadConfig()`, add:

```typescript
telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || '',
```

Place it after `initialAdminPassword` and before `nodeEnv`.

- [ ] **Step 3: Verify TypeScript**

```bash
cd backend && npx tsc --noEmit 2>&1 | head -20
```

Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add backend/src/config.ts
git commit -m "feat: add TELEGRAM_BOT_TOKEN to backend config"
```

---

### Task 3: Update backend `TelegramConfig` type and `sendTelegram`

**Files:**
- Modify: `backend/src/models/types.ts`
- Modify: `backend/src/services/notification-channel.ts`

- [ ] **Step 1: Remove `bot_token` from `TelegramConfig` in `backend/src/models/types.ts`**

Find:
```typescript
export interface TelegramConfig {
  bot_token: string;
  chat_id: string;
}
```

Replace with:
```typescript
export interface TelegramConfig {
  chat_id: string;
}
```

- [ ] **Step 2: Update `sendTelegram` in `backend/src/services/notification-channel.ts`**

Add import at the top of the file (after existing imports):
```typescript
import { config as appConfig } from '../config';
```

Find the `sendTelegram` method:
```typescript
  async sendTelegram(config: TelegramConfig, payload: NotificationPayload): Promise<void> {
    const telegramUrl = `https://api.telegram.org/bot${config.bot_token}/sendMessage`;
```

Replace the `telegramUrl` line only:
```typescript
  async sendTelegram(config: TelegramConfig, payload: NotificationPayload): Promise<void> {
    const telegramUrl = `https://api.telegram.org/bot${appConfig.telegramBotToken}/sendMessage`;
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd backend && npx tsc --noEmit 2>&1 | head -20
```

Expected: no new errors. The only pre-existing errors are about test files (different `rootDir`).

- [ ] **Step 4: Commit**

```bash
git add backend/src/models/types.ts backend/src/services/notification-channel.ts
git commit -m "feat: telegram sendTelegram reads token from env config, not channel record"
```

---

### Task 4: DB migration — strip `bot_token` from existing telegram channels

**Files:**
- Modify: `backend/src/services/db/migrations.ts`

- [ ] **Step 1: Add migration function before `createMigrations`**

Add this function before the `// Public API` comment block (around line 310):

```typescript
// ---------------------------------------------------------------------------
// Step 7 — strip bot_token from telegram channel configs (moved to env var)
// ---------------------------------------------------------------------------

async function migrateTelegramBotToken(db: sqlite3.Database): Promise<void> {
  const rows = await dbAll<{ id: number; config: string }>(
    db,
    "SELECT id, config FROM notification_channels WHERE type = 'telegram'"
  );
  for (const row of rows) {
    let cfg: Record<string, unknown>;
    try {
      cfg = JSON.parse(row.config);
    } catch {
      continue;
    }
    if ('bot_token' in cfg) {
      delete cfg.bot_token;
      await dbRun(
        db,
        'UPDATE notification_channels SET config = ? WHERE id = ?',
        [JSON.stringify(cfg), row.id]
      );
    }
  }
}
```

- [ ] **Step 2: Call it in `createMigrations().run()`**

Find:
```typescript
    async run(): Promise<void> {
      await createBaseTables(db);
      await migrateUsersTable(db);
      await migratePriceHistoryTable(db);
      await migrateProductsTable(db);
      await createIndexes(db);
      await initializeSystemConfig(db);
    },
```

Replace with:
```typescript
    async run(): Promise<void> {
      await createBaseTables(db);
      await migrateUsersTable(db);
      await migratePriceHistoryTable(db);
      await migrateProductsTable(db);
      await createIndexes(db);
      await initializeSystemConfig(db);
      await migrateTelegramBotToken(db);
    },
```

- [ ] **Step 3: Verify TypeScript**

```bash
cd backend && npx tsc --noEmit 2>&1 | head -20
```

Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add backend/src/services/db/migrations.ts
git commit -m "feat: migrate existing telegram channel configs to strip bot_token"
```

---

### Task 5: Creation guard in notifications route

**Files:**
- Modify: `backend/src/routes/notifications.ts`

- [ ] **Step 1: Add config import**

At the top of `backend/src/routes/notifications.ts`, add after the existing imports:

```typescript
import { config } from '../config';
```

- [ ] **Step 2: Add guard in `POST /channels`**

Find the existing type validation block in `POST /channels` (around line 49):

```typescript
    if (
!['email', 'telegram', 'discord'].includes(type)
) {
      return res.status(400).json({ error: 'Type must be email, telegram, or discord' });
    }
```

Add the guard immediately after it:

```typescript
    if (type === 'telegram' && !config.telegramBotToken) {
      return res.status(400).json({ error: 'TELEGRAM_BOT_TOKEN is not configured on this server. Ask the admin to set it.' });
    }
```

- [ ] **Step 3: Verify TypeScript**

```bash
cd backend && npx tsc --noEmit 2>&1 | head -20
```

Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add backend/src/routes/notifications.ts
git commit -m "feat: reject telegram channel creation when TELEGRAM_BOT_TOKEN not set"
```

---

### Task 6: Create bot listener service and wire into server

**Files:**
- Create: `backend/src/services/telegram.ts`
- Modify: `backend/src/server.ts`

- [ ] **Step 1: Create `backend/src/services/telegram.ts`**

```typescript
import TelegramBot from 'node-telegram-bot-api';

let bot: TelegramBot | null = null;

export function initTelegramBot(token: string): void {
  if (!token) {
    console.warn('[telegram] TELEGRAM_BOT_TOKEN not set — /start listener disabled');
    return;
  }
  bot = new TelegramBot(token, { polling: true });
  bot.onText(/\/start/, (msg) => {
    bot!.sendMessage(msg.chat.id, `Your Chat ID: ${msg.chat.id}`);
  });
  console.log('[telegram] Bot listener started.');
}
```

- [ ] **Step 2: Wire into `backend/src/server.ts`**

Add import after the existing service imports (e.g. after `import { dbService } from './services/database';`):

```typescript
import { initTelegramBot } from './services/telegram';
```

In the `startServer` function, after the `dbReady = true;` line and before the scheduler section, add:

```typescript
    // Start Telegram bot listener (no-op if TELEGRAM_BOT_TOKEN not set)
    initTelegramBot(config.telegramBotToken);
```

The placement inside `server.listen` callback, after `await dbService.ready` and `dbReady = true`, ensures the bot only starts after DB migrations (including the bot_token strip migration) complete.

- [ ] **Step 3: Verify TypeScript**

```bash
cd backend && npx tsc --noEmit 2>&1 | head -20
```

Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add backend/src/services/telegram.ts backend/src/server.ts
git commit -m "feat: add Telegram /start bot listener via node-telegram-bot-api"
```

---

### Task 7: Update frontend `TelegramConfig` type and `ChannelForm`

**Files:**
- Modify: `frontend/src/types.ts`
- Modify: `frontend/src/components/ChannelForm.tsx`

- [ ] **Step 1: Remove `bot_token` from `TelegramConfig` in `frontend/src/types.ts`**

Find:
```typescript
export interface TelegramConfig {
  bot_token: string;
  chat_id: string;
}
```

Replace with:
```typescript
export interface TelegramConfig {
  chat_id: string;
}
```

- [ ] **Step 2: Remove `botToken` state from `ChannelForm.tsx`**

Find:
```typescript
  const telegramCfg = channel && channel.type === 'telegram' ? (channel.config as TelegramConfig) : null;
  const [botToken, setBotToken] = useState(telegramCfg?.bot_token ?? '');
  const [chatId, setChatId] = useState(telegramCfg?.chat_id ?? '');
```

Replace with:
```typescript
  const telegramCfg = channel && channel.type === 'telegram' ? (channel.config as TelegramConfig) : null;
  const [chatId, setChatId] = useState(telegramCfg?.chat_id ?? '');
```

- [ ] **Step 3: Remove `bot_token` from `buildConfig` in `ChannelForm.tsx`**

Find:
```typescript
      case 'telegram':
        return { bot_token: botToken, chat_id: chatId };
```

Replace with:
```typescript
      case 'telegram':
        return { chat_id: chatId };
```

- [ ] **Step 4: Remove Bot Token input from JSX in `ChannelForm.tsx`**

Find and delete the entire Bot Token form group:
```typescript
        {channelType === 'telegram' && (
          <>
            <div className={styles.formGroup}>
              <label>{t('notifications.channels.telegram.botToken')}</label>
              <input type="text" value={botToken} onChange={(e) => setBotToken(e.target.value)} required />
            </div>
            <div className={styles.formGroup}>
              <label>{t('notifications.channels.telegram.chatId')}</label>
              <input type="text" value={chatId} onChange={(e) => setChatId(e.target.value)} required />
            </div>
          </>
        )}
```

Replace with:
```typescript
        {channelType === 'telegram' && (
          <div className={styles.formGroup}>
            <label>{t('notifications.channels.telegram.chatId')}</label>
            <input type="text" value={chatId} onChange={(e) => setChatId(e.target.value)} required />
          </div>
        )}
```

- [ ] **Step 5: Verify TypeScript**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors (frontend has `noUnusedLocals` strict mode — removing `botToken` eliminates the now-unused var).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/types.ts frontend/src/components/ChannelForm.tsx
git commit -m "feat: remove bot_token from frontend TelegramConfig and ChannelForm"
```

---

### Task 8: i18n cleanup

**Files:**
- Modify: `frontend/src/i18n/locales/en.json`
- Modify: `frontend/src/i18n/locales/pt-BR.json`

- [ ] **Step 1: Remove `botToken` key from `en.json`**

Find in `frontend/src/i18n/locales/en.json`:
```json
      "telegram": {
        "botToken": "Bot Token",
```

Remove the `"botToken": "Bot Token",` line (keep the `"telegram"` block and any remaining keys like `chatId`).

- [ ] **Step 2: Remove `botToken` key from `pt-BR.json`**

Find in `frontend/src/i18n/locales/pt-BR.json`:
```json
      "telegram": {
        "botToken": "Token do Bot",
```

Remove the `"botToken": "Token do Bot",` line.

- [ ] **Step 3: Verify TypeScript still passes**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/i18n/locales/en.json frontend/src/i18n/locales/pt-BR.json
git commit -m "chore: remove unused telegram botToken i18n keys"
```

---

### Task 9: Update `docs/telegram-setup.md`

**Files:**
- Modify: `docs/telegram-setup.md`

The doc was written for the old design (per-channel bot token). Three sections are now wrong:
- Admin Part 1, Step 5 ("Communicate the Bot Token to Users") — users no longer need the token
- User Part 2, Step 2 ("Get the Bot Token") — no longer exists
- User Part 2, Step 3 — "Bot Token" field is gone; only "Chat ID" remains

- [ ] **Step 1: Remove "Step 5: Communicate the Bot Token to Users" from Part 1**

Delete the entire section:

```markdown
### Step 5: Communicate the Bot Token to Users

Each user who sets up a Telegram notification channel in amzscraper needs to enter the **bot token** alongside their personal Chat ID. Share the token with your users through a secure channel (private message, internal docs, etc.).

> If you prefer not to share the raw token, you can create a pinned message or internal wiki page that users reference during setup.
```

Renumber "Step 6 (Optional)" to "Step 5 (Optional)".

- [ ] **Step 2: Remove "Step 2: Get the Bot Token" from Part 2**

Delete the entire section:

```markdown
### Step 2: Get the Bot Token

Ask your amzscraper admin for the **Bot Token**. It looks like:

```text
8469732834:AAFrJ-ixveS_hoVm97h-EMo3x2trwiu_2Ho
```
```

Renumber the remaining Part 2 steps (old Step 3 becomes Step 2, old Step 4 becomes Step 3).

- [ ] **Step 3: Update the now-Step-2 ("Add a Telegram Channel") in Part 2**

Find:
```markdown
4. Fill in the two fields:
   - **Bot Token** — the token from Step 2 (provided by your admin)
   - **Chat ID** — the number from Step 1
```

Replace with:
```markdown
4. Fill in:
   - **Chat ID** — the number from Step 1
```

- [ ] **Step 4: Commit**

```bash
git add docs/telegram-setup.md
git commit -m "docs: update telegram-setup.md to reflect global bot token design"
```

---

### Task 10: End-to-end verification

- [ ] **Step 1: Start backend without the env var — verify guard**

```bash
cd backend && npm run dev
```

Then in another terminal:
```bash
curl -s -X POST http://localhost:3000/api/notifications/channels \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <your-jwt>" \
  -d '{"type":"telegram","name":"test","config":{"chat_id":"123"}}' | jq .
```

Expected: `{"error": "TELEGRAM_BOT_TOKEN is not configured on this server. Ask the admin to set it."}`

- [ ] **Step 2: Restart backend with `TELEGRAM_BOT_TOKEN` set — verify bot starts**

```bash
TELEGRAM_BOT_TOKEN=<real-token> npm run dev
```

Expected in logs: `[telegram] Bot listener started.`

- [ ] **Step 3: Message the bot `/start` from Telegram**

Open Telegram, message `@amzbrbot` with `/start`.

Expected reply: `Your Chat ID: <numeric-id>`

- [ ] **Step 4: Create a Telegram channel with only Chat ID**

```bash
curl -s -X POST http://localhost:3000/api/notifications/channels \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <your-jwt>" \
  -d '{"type":"telegram","name":"My Telegram","config":{"chat_id":"<id-from-step-3>"}}' | jq .
```

Expected: `201` with channel object. Config should contain only `chat_id` — no `bot_token`.

- [ ] **Step 5: Test the channel**

```bash
curl -s -X POST http://localhost:3000/api/notifications/channels/<channel-id>/test \
  -H "Authorization: Bearer <your-jwt>" | jq .
```

Expected: `{"success": true}` and a test message in Telegram.

- [ ] **Step 6: Start frontend and verify Telegram channel form shows only Chat ID field**

```bash
cd frontend && npm run dev
```

Open `http://localhost:5174`, go to Settings → Notifications → Add Channel → select Telegram.

Expected: form shows only `Chat ID` field (no `Bot Token` field).

- [ ] **Step 7: Final commit if any stragglers**

```bash
git status
```

If clean, done. If any files missed, stage and commit.
