# Design: Telegram Bot Integration

**Date:** 2026-06-15
**Status:** Approved

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
{ "bot_token": "<amzbrbot token>", "chat_id": "123456789" }
```

All users share the same `bot_token` (the `amzbrbot` token the admin creates via BotFather). Each user has a unique `chat_id`.

**Bot token in channel config vs env var:** The current implementation stores `bot_token` per channel (in `config` JSON blob). This means users must enter the bot token when creating a Telegram channel. The admin must communicate the token to users (or document it in settings). This is the existing design — not changed here.

---

## What Needs to Be Built

### 1. Bot Listener (`backend/src/services/telegram.ts`) — NEW

A long-polling listener that responds to `/start` with the user's Chat ID. This is the only missing piece of the user flow.

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

### 2. Env Var + Config (`backend/src/config.ts`) — MODIFY

```typescript
TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || '',
```

### 3. Server Startup (`backend/src/server.ts`) — MODIFY

```typescript
import { initTelegramBot } from './services/telegram';
// after DB migrations:
initTelegramBot(config.TELEGRAM_BOT_TOKEN);
```

### 4. New Dependency

```bash
cd backend && npm install node-telegram-bot-api @types/node-telegram-bot-api
```

### 5. Reference Document (`docs/telegram-setup.md`) — NEW

User-facing guide covering admin setup + per-user channel configuration.

---

## User Flow

```text
Admin: BotFather → create bot → get token → set TELEGRAM_BOT_TOKEN → restart server
User:  Open @amzbrbot → /start → get Chat ID
User:  Settings → Notifications → Add Channel → Telegram
       Bot Token: <admin provides this>
       Chat ID:   <from /start reply>
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
