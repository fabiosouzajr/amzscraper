# Telegram Notifications Setup Guide

This guide covers two things: **admin setup** (configure the bot on the server) and **user setup** (connect a Telegram account to receive alerts).

---

## Part 1 — Admin Setup

*Do this once when deploying amzscraper. Requires server access.*

### Step 1: Create the Bot via BotFather

1. Open Telegram and search for **@BotFather**
2. Start a chat and send `/newbot`
3. BotFather asks for a display name — enter anything (e.g. `Amazon Price Bot`)
4. BotFather asks for a username — must end in `bot` (e.g. `amzbrbot`)
5. BotFather replies with your **HTTP API token**:

   ```text
   Use this token to access the HTTP API:
   8469732834:AAFrJ-ixveS_hoVm97h-EMo3x2trwiu_2Ho
   ```

> **Security:** Treat this token like a password. Anyone with it can send messages as your bot.
> Never commit it to git. If it is ever exposed, revoke it immediately via BotFather
> (`/mybots` → select bot → `API Token` → `Revoke current token`).

### Step 2: Add the Token to the Server Environment

**Option A — `.env` file (local/dev):**

```bash
# backend/.env  (this file is gitignored — never commit it)
TELEGRAM_BOT_TOKEN=<your-token-here>
```

**Option B — shell export:**

```bash
export TELEGRAM_BOT_TOKEN=<your-token-here>
```

**Option C — systemd service file:**

```ini
[Service]
Environment=TELEGRAM_BOT_TOKEN=<your-token-here>
```

### Step 3: Restart the Backend

```bash
cd backend && npm run dev      # development
# or your production start command
```

On startup, check the logs for:

```text
[telegram] Bot listener started.
```

If the token is missing or wrong:

```text
[telegram] TELEGRAM_BOT_TOKEN not set — /start listener disabled.
```

### Step 4: Verify the Bot is Running

```bash
curl https://api.telegram.org/bot<YOUR_TOKEN>/getMe
```

Expected:

```json
{
  "ok": true,
  "result": {
    "id": 8469732834,
    "is_bot": true,
    "first_name": "Amazon Price Bot",
    "username": "amzbrbot"
  }
}
```

### Step 5: Communicate the Bot Token to Users

Each user who sets up a Telegram notification channel in amzscraper needs to enter the **bot token** alongside their personal Chat ID. Share the token with your users through a secure channel (private message, internal docs, etc.).

> If you prefer not to share the raw token, you can create a pinned message or internal wiki page that users reference during setup.

### Step 6 (Optional): Set Bot Commands in Telegram

Makes `/start` appear as a suggested command in the Telegram UI.

Send to BotFather:

```text
/setcommands
```

Select your bot, then paste:

```text
start - Get your Chat ID to link this bot to amzscraper
```

---

## Part 2 — User Guide

*Do this once per user account. No server access needed.*

### Step 1: Get Your Chat ID

1. Open Telegram and search for **@amzbrbot** (or whatever username your admin configured)
2. Tap **Start** or send:

   ```text
   /start
   ```

3. The bot replies immediately:

   ```text
   Your Chat ID: 123456789
   ```

4. Copy that number.

### Step 2: Get the Bot Token

Ask your amzscraper admin for the **Bot Token**. It looks like:

```text
8469732834:AAFrJ-ixveS_hoVm97h-EMo3x2trwiu_2Ho
```

### Step 3: Add a Telegram Channel in amzscraper

1. Open amzscraper → **Settings → Notifications**
2. Click **Add Channel**
3. Set **Type** to **Telegram**
4. Fill in the two fields:
   - **Bot Token** — the token from Step 2 (provided by your admin)
   - **Chat ID** — the number from Step 1
5. Click **Save**
6. Click **Test** to verify — you should receive a test message in Telegram immediately

### Step 4: Create a Notification Rule

1. Go to any product's detail page
2. Open the **Notifications** tab
3. Click **Add Rule**
4. Choose a condition (e.g. *Price drops by more than 10%*)
5. Select your Telegram channel
6. Save

When that product's price triggers the rule, you receive a Telegram message.

### Example Alert Message

```text
🔔 Price Alert: Produto Exemplo

Price dropped below threshold

💰 Current Price: R$ 149,90

View Product
ASIN: B09XYZ1234
```

---

## Troubleshooting

| Problem | Fix |
| --- | --- |
| Bot does not respond to `/start` | Check server logs for `[telegram]` — token may be missing or invalid |
| Test notification fails with "Telegram API error" | Verify bot token and chat ID are correct. Make sure you have not blocked the bot. |
| `"ok": false` from `getMe` curl | Token is wrong — regenerate via BotFather: `/mybots` → select bot → `API Token` → `Revoke` |
| Alerts stop arriving | You may have blocked the bot. Open the chat and click Unblock. |
| Token accidentally committed to git | Revoke immediately via BotFather, generate a new token, update the server env var |

---

## Security Notes

- `TELEGRAM_BOT_TOKEN` lives in environment variables only — never in code or git
- If the token is ever exposed (committed, logged, shared publicly), revoke it immediately via BotFather
- Chat IDs are not sensitive — they identify a Telegram chat, not personal data
- The bot only **sends** messages; it does not read chat history or access user data beyond the `/start` sender's chat ID
