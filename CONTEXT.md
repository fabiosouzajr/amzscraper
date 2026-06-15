# Amazon Price Tracker

Multi-tenant web app that tracks Amazon product prices and alerts users when prices change.

## Language

### Notifications

**Notification Channel**: A user-configured destination for price alerts — email, Telegram, or Discord. Each channel stores a `type` and a `config` JSON blob specific to that type.
_Avoid_: Integration, webhook, sink

**Notification Rule**: A per-product condition that triggers a notification (e.g. "price drops below R$ 50"). Bound to a channel.
_Avoid_: Alert rule, trigger

**Chat ID**: The numeric Telegram identifier for a specific user or chat. Users discover their Chat ID by sending `/start` to `@amzbrbot`. Required when creating a Telegram channel.
_Avoid_: Telegram ID, user ID

**Bot Token**: The `@amzbrbot` authentication credential issued by BotFather. Shared across all users of the app. Stored in the `TELEGRAM_BOT_TOKEN` environment variable only — never in the database.
_Avoid_: Telegram token, API key

### Products

**ASIN**: Amazon Standard Identification Number. A 10-character alphanumeric product identifier. The primary key for all tracked products within a user's account.

**Price Drop / Price Increase**: A price change event detected after a scrape. Evaluated against Notification Rules to decide whether to send alerts.
