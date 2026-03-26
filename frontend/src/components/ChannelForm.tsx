import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../services/api';
import {
  NotificationChannel,
  NotificationChannelType,
  EmailConfig,
  TelegramConfig,
  DiscordConfig,
} from '../types';
import { Modal, Button } from '../design-system';

interface ChannelFormProps {
  channel: NotificationChannel | null;
  onClose: () => void;
  onSaved: () => void;
}

export function ChannelForm({ channel, onClose, onSaved }: ChannelFormProps) {
  const { t } = useTranslation();

  const [channelType, setChannelType] = useState<NotificationChannelType>(channel?.type ?? 'email');
  const [name, setName] = useState(channel?.name ?? '');

  const emailCfg = channel && channel.type === 'email' ? (channel.config as EmailConfig) : null;
  const [smtpHost, setSmtpHost] = useState(emailCfg?.smtp_host ?? '');
  const [smtpPort, setSmtpPort] = useState(String(emailCfg?.smtp_port ?? 587));
  const [smtpSecure, setSmtpSecure] = useState(emailCfg?.smtp_secure ?? true);
  const [smtpUser, setSmtpUser] = useState(emailCfg?.smtp_user ?? '');
  const [smtpPass, setSmtpPass] = useState(emailCfg?.smtp_pass ?? '');
  const [fromAddress, setFromAddress] = useState(emailCfg?.from_address ?? '');
  const [toAddress, setToAddress] = useState(emailCfg?.to_address ?? '');

  const telegramCfg = channel && channel.type === 'telegram' ? (channel.config as TelegramConfig) : null;
  const [botToken, setBotToken] = useState(telegramCfg?.bot_token ?? '');
  const [chatId, setChatId] = useState(telegramCfg?.chat_id ?? '');

  const discordCfg = channel && channel.type === 'discord' ? (channel.config as DiscordConfig) : null;
  const [webhookUrl, setWebhookUrl] = useState(discordCfg?.webhook_url ?? '');

  const [submitting, setSubmitting] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const buildConfig = (): EmailConfig | TelegramConfig | DiscordConfig => {
    switch (channelType) {
      case 'email':
        return {
          smtp_host: smtpHost,
          smtp_port: parseInt(smtpPort, 10) || 587,
          smtp_secure: smtpSecure,
          smtp_user: smtpUser,
          smtp_pass: smtpPass,
          from_address: fromAddress,
          to_address: toAddress,
        };
      case 'telegram':
        return { bot_token: botToken, chat_id: chatId };
      case 'discord':
        return { webhook_url: webhookUrl };
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const config = buildConfig();
      if (channel) {
        await api.notifications.updateChannel(channel.id, { name, config });
      } else {
        await api.notifications.createChannel({ type: channelType, name, config });
      }
      onSaved();
    } catch (err) {
      setError(t('notifications.channels.createFailed') + ': ' + (err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleTest = async () => {
    if (!channel) return;
    setTesting(true);
    setTestResult(null);
    try {
      const result = await api.notifications.testChannel(channel.id);
      if (result.success) {
        setTestResult(t('notifications.channels.testSuccess'));
      } else {
        setTestResult(t('notifications.channels.testFailed') + (result.error ? ': ' + result.error : ''));
      }
    } catch (err) {
      setTestResult(t('notifications.channels.testFailed') + ': ' + (err as Error).message);
    } finally {
      setTesting(false);
    }
  };

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title={channel ? t('notifications.channels.edit') : t('notifications.channels.add')}
      size="md"
    >
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label>{t('notifications.channels.type')}</label>
          <select
            value={channelType}
            onChange={(e) => setChannelType(e.target.value as NotificationChannelType)}
            disabled={!!channel}
          >
            <option value="email">{t('notifications.channels.channelTypes.email')}</option>
            <option value="telegram">{t('notifications.channels.channelTypes.telegram')}</option>
            <option value="discord">{t('notifications.channels.channelTypes.discord')}</option>
          </select>
        </div>

        <div className="form-group">
          <label>{t('notifications.channels.name')}</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>

        {channelType === 'email' && (
          <>
            <div className="form-group">
              <label>{t('notifications.channels.email.smtpHost')}</label>
              <input type="text" value={smtpHost} onChange={(e) => setSmtpHost(e.target.value)} required />
            </div>
            <div className="form-group">
              <label>{t('notifications.channels.email.smtpPort')}</label>
              <input type="number" value={smtpPort} onChange={(e) => setSmtpPort(e.target.value)} required />
            </div>
            <div className="form-group">
              <label>
                <input
                  type="checkbox"
                  checked={smtpSecure}
                  onChange={(e) => setSmtpSecure(e.target.checked)}
                />
                {' '}{t('notifications.channels.email.smtpSecure')}
              </label>
            </div>
            <div className="form-group">
              <label>{t('notifications.channels.email.smtpUser')}</label>
              <input type="text" value={smtpUser} onChange={(e) => setSmtpUser(e.target.value)} required />
            </div>
            <div className="form-group">
              <label>{t('notifications.channels.email.smtpPass')}</label>
              <input type="password" value={smtpPass} onChange={(e) => setSmtpPass(e.target.value)} required />
            </div>
            <div className="form-group">
              <label>{t('notifications.channels.email.fromAddress')}</label>
              <input type="email" value={fromAddress} onChange={(e) => setFromAddress(e.target.value)} required />
            </div>
            <div className="form-group">
              <label>{t('notifications.channels.email.toAddress')}</label>
              <input type="email" value={toAddress} onChange={(e) => setToAddress(e.target.value)} required />
            </div>
          </>
        )}

        {channelType === 'telegram' && (
          <>
            <div className="form-group">
              <label>{t('notifications.channels.telegram.botToken')}</label>
              <input type="text" value={botToken} onChange={(e) => setBotToken(e.target.value)} required />
            </div>
            <div className="form-group">
              <label>{t('notifications.channels.telegram.chatId')}</label>
              <input type="text" value={chatId} onChange={(e) => setChatId(e.target.value)} required />
            </div>
          </>
        )}

        {channelType === 'discord' && (
          <div className="form-group">
            <label>{t('notifications.channels.discord.webhookUrl')}</label>
            <input type="url" value={webhookUrl} onChange={(e) => setWebhookUrl(e.target.value)} required />
          </div>
        )}

        {error && <div className="error-message">{error}</div>}
        {testResult && <div className="form-group">{testResult}</div>}

        <div className="modal-actions">
          <button type="button" onClick={onClose} disabled={submitting}>
            {t('common.cancel')}
          </button>
          {channel && (
            <button type="button" onClick={handleTest} disabled={testing || submitting}>
              {testing ? '...' : t('notifications.channels.test')}
            </button>
          )}
          <Button type="submit" variant="primary" disabled={submitting}>
            {submitting ? '...' : t('common.save')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
