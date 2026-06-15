# Design: Telegram Bot Integration

**Date:** 2026-06-15
**Status:** Approved
**Grilled:** 2026-06-15

---

## Summary

Add a `/start` bot listener so users can retrieve their Telegram Chat ID by messaging `@amzbrbot`. The backend notification sending, frontend channel form, DB schema, and TypeScript types for Telegram are **already fully implemented**. Only the bot listener and user guide are missing.

---

## What Already Exists

| Component | Status | File |
| --- | --- | --- |
| `sendTelegram()` — sends alerts via raw `fetch()` to Telegram API | Done | `backend/src/services/notification-channel.ts` |
| `TelegramConfig` type — `{ bot_token: string; chat_id: string }` | Done | `backend/src/models/types.ts` |
| DB schema — `telegram` valid in `notification_channels.type` CHECK constraint | Done | `backend/src/services/db/migrations.ts` |
| Channel form — Telegram option with Bot Token + Chat ID fields | Done | `frontend/src/components/ChannelForm.tsx` |
| i18n keys for Telegram labels | Done | `frontend/src/i18n/locales/*.json` |

---

## Architecture

```text
Scheduler → PriceUpdate → NotificationEvaluator → NotificationChannelService.send()
                                                        ├── email  → SMTP
                                                        ├── telegram → fetch(api.telegram.org/sendMessage)
                                                        └── discord → fetch(discord webhook)
```

**Channel config shape:**

```json
{ "chat_id": "123456789" }
```

All users share the same bot token (the `@amzbrbot` token the admin creates via BotFather). Each user has a unique `chat_id`. The bot token lives exclusively in `TELEGRAM_BOT_TOKEN` env var — never in the database. See [ADR-0001](../adr/0001-global-bot-token.md).

---

## What Needs to Be Built

### 1. Bot Listener (`backend/src/services/telegram.ts`) — NEW

Long-polling listener that responds to `/start` with the user's Chat ID. Uses `node-telegram-bot-api`.

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

No graceful shutdown needed — process exit abandons polling intentionally.

### 2. Env Var + Config (`backend/src/config.ts`) — MODIFY

Add to `AppConfig` interface and `loadConfig()`:

```typescript
telegramBotToken: string;
// ...
telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || '',
```

### 3. `sendTelegram` reads from app config — MODIFY `notification-channel.ts`

`sendTelegram` no longer reads `config.bot_token` from the channel record. It receives the token as a parameter (or reads from app config directly). `TelegramConfig` becomes `{ chat_id: string }`.

### 4. DB Migration — MODIFY `migrations.ts`

Strip `bot_token` from all existing `telegram` channel config blobs:

```typescript
// in a new migration step:
await dbRun(db, `
  UPDATE notification_channels
  SET config = json_remove(config, '$.bot_token')
  WHERE type = 'telegram' AND json_extract(config, '$.bot_token') IS NOT NULL
`);
```

### 5. Creation Guard — MODIFY `routes/notifications.ts`

Return `400` when creating a `telegram` channel if `config.telegramBotToken` is not set.

### 6. Frontend `ChannelForm.tsx` — MODIFY

Remove "Bot Token" field from the Telegram channel form. Only "Chat ID" remains.

### 7. Server Startup (`backend/src/server.ts`) — MODIFY

```typescript
import { initTelegramBot } from './services/telegram';
// after DB migrations:
initTelegramBot(config.telegramBotToken);
```

### 8. New Dependency

```bash
cd backend && npm install node-telegram-bot-api @types/node-telegram-bot-api
```

### 9. Reference Document (`docs/telegram-setup.md`) — NEW (already exists, verify content)

User-facing guide covering admin setup + per-user channel configuration.

---

## User Flow

```text
Admin: BotFather → create bot → get token → set TELEGRAM_BOT_TOKEN → restart server
User:  Open @amzbrbot → /start → get Chat ID
User:  Settings → Notifications → Add Channel → Telegram
       Chat ID: <from /start reply>
```

---

## Error Handling

- `initTelegramBot` is a no-op (warning log) if token is empty — server does not crash
- `sendTelegram` already wraps in try/catch via `testChannel` — errors surfaced as `{ success: false, error }` in the UI
- Bad Chat ID (user blocked bot): Telegram returns 403 — `sendTelegram` throws, `NotificationChannelService` catches, logs to `notification_log` with `status: 'failed'`

---

## Out of Scope

- Global bot token UI (pre-filling the token field from server config)
- Bot commands beyond `/start`
- Webhook mode
- Discord (already implemented, same pattern)

---

## Reference Document

`docs/telegram-setup.md` — combined admin + user setup guide
