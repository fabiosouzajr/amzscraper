import nodemailer from 'nodemailer';
import {
  NotificationChannel,
  EmailConfig,
  TelegramConfig,
  DiscordConfig,
} from '../models/types';

export interface NotificationPayload {
  productName: string;
  asin: string;
  currentPrice: number;
  triggerDescription: string;
  productUrl: string;
}

export class NotificationChannelService {
  /**
   * Send notification via Email (SMTP)
   */
  async sendEmail(config: EmailConfig, payload: NotificationPayload): Promise<void> {
    const transporter = nodemailer.createTransport({
      host: config.smtp_host,
      port: config.smtp_port,
      secure: config.smtp_secure,
      auth: {
        user: config.smtp_user,
        pass: config.smtp_pass,
      },
    });

    const mailOptions = {
      from: config.from_address,
      to: config.to_address,
      subject: `Price Alert: ${payload.productName}`,
      html: `
        <h2>Price Alert: ${payload.productName}</h2>
        <p><strong>${payload.triggerDescription}</strong></p>
        <p>Current Price: R$ ${payload.currentPrice.toFixed(2)}</p>
        <p><a href="${payload.productUrl}">View Product</a></p>
        <hr>
        <p><small>ASIN: ${payload.asin}</small></p>
      `,
    };

    await transporter.sendMail(mailOptions);
    await transporter.close();
  }

  /**
   * Send notification via Telegram Bot API
   */
  async sendTelegram(config: TelegramConfig, payload: NotificationPayload): Promise<void> {
    const telegramUrl = `https://api.telegram.org/bot${config.bot_token}/sendMessage`;
    const message = `🔔 *Price Alert: ${payload.productName}*\n\n${payload.triggerDescription}\n\n💰 Current Price: R$ ${payload.currentPrice.toFixed(2)}\n\n[View Product](${payload.productUrl})\n\n\`ASIN: ${payload.asin}\``;

    const response = await fetch(telegramUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: config.chat_id,
        text: message,
        parse_mode: 'Markdown',
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Telegram API error: ${error}`);
    }
  }

  /**
   * Send notification via Discord Webhook
   */
  async sendDiscord(config: DiscordConfig, payload: NotificationPayload): Promise<void> {
    const message = {
      content: null,
      embeds: [
        {
          title: `🔔 Price Alert: ${payload.productName}`,
          description: `${payload.triggerDescription}\n\n💰 Current Price: **R$ ${payload.currentPrice.toFixed(2)}**`,
          url: payload.productUrl,
          color: 0xff9900,
          fields: [
            {
              name: 'ASIN',
              value: payload.asin,
              inline: true,
            },
          ],
        },
      ],
    };

    const response = await fetch(config.webhook_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Discord webhook error: ${error}`);
    }
  }

  /**
   * Send notification through the appropriate channel
   */
  async send(channel: NotificationChannel, payload: NotificationPayload): Promise<void> {
    switch (channel.type) {
      case 'email':
        await this.sendEmail(channel.config as EmailConfig, payload);
        break;
      case 'telegram':
        await this.sendTelegram(channel.config as TelegramConfig, payload);
        break;
      case 'discord':
        await this.sendDiscord(channel.config as DiscordConfig, payload);
        break;
      default:
        throw new Error(`Unknown channel type: ${(channel as any).type}`);
    }
  }

  /**
   * Test a notification channel with a test message
   */
  async testChannel(channel: NotificationChannel): Promise<{ success: boolean; error?: string }> {
    const testPayload: NotificationPayload = {
      productName: 'Test Product',
      asin: 'TEST123456',
      currentPrice: 99.99,
      triggerDescription: 'This is a test notification',
      productUrl: 'https://www.amazon.com.br/dp/TEST123456',
    };

    try {
      await this.send(channel, testPayload);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}

export const notificationChannelService = new NotificationChannelService();
