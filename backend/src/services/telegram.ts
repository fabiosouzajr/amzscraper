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
