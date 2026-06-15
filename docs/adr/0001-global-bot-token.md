# Global bot token via env var, not per-channel config

All users of this app share a single Telegram bot (`@amzbrbot`). Storing `bot_token` per channel config in the database was the original design, but it required every user to manually enter the token (obtained out-of-band from the admin) and exposed the token in API responses. We changed `TelegramConfig` to `{ chat_id: string }` only, and moved the bot token to the `TELEGRAM_BOT_TOKEN` environment variable. `sendTelegram()` reads the token from app config; the bot listener (`initTelegramBot`) uses the same env var. A DB migration strips `bot_token` from any existing channel config blobs on startup.

## Consequences

- Creating a Telegram channel returns `400` if `TELEGRAM_BOT_TOKEN` is not set — fail fast at creation, not at send time.
- The frontend `ChannelForm` no longer shows a Bot Token field for Telegram channels.
- Token rotation requires only an env var change and server restart, not a DB update across all users.
