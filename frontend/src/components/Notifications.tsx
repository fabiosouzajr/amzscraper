import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../services/api';
import {
  NotificationChannel,
  NotificationChannelType,
  NotificationRule,
  NotificationRuleType,
  NotificationLogEntry,
  EmailConfig,
  TelegramConfig,
  DiscordConfig,
  LowestInDaysParams,
  BelowThresholdParams,
  PercentageDropParams,
} from '../types';
import { Modal, Button } from '../design-system';

type TabType = 'channels' | 'rules' | 'history';

function formatRuleParams(type: NotificationRuleType, params: LowestInDaysParams | BelowThresholdParams | PercentageDropParams, t: (key: string, options?: Record<string, unknown>) => string): string {
  switch (type) {
    case 'lowest_in_days':
      return `${(params as LowestInDaysParams).days} ${t('notifications.rules.daysUnit')}`;
    case 'below_threshold':
      return `R$ ${(params as BelowThresholdParams).threshold.toFixed(2)}`;
    case 'percentage_drop': {
      const p = params as PercentageDropParams;
      return `${p.percentage}% / ${p.window_days} ${t('notifications.rules.daysUnit')}`;
    }
  }
}

// ─── ChannelForm ─────────────────────────────────────────────────────────────

interface ChannelFormProps {
  channel: NotificationChannel | null;
  onClose: () => void;
  onSaved: () => void;
}

function ChannelForm({ channel, onClose, onSaved }: ChannelFormProps) {
  const { t } = useTranslation();

  const [channelType, setChannelType] = useState<NotificationChannelType>(channel?.type ?? 'email');
  const [name, setName] = useState(channel?.name ?? '');

  // Email fields
  const emailCfg = channel && channel.type === 'email' ? (channel.config as EmailConfig) : null;
  const [smtpHost, setSmtpHost] = useState(emailCfg?.smtp_host ?? '');
  const [smtpPort, setSmtpPort] = useState(String(emailCfg?.smtp_port ?? 587));
  const [smtpSecure, setSmtpSecure] = useState(emailCfg?.smtp_secure ?? true);
  const [smtpUser, setSmtpUser] = useState(emailCfg?.smtp_user ?? '');
  const [smtpPass, setSmtpPass] = useState(emailCfg?.smtp_pass ?? '');
  const [fromAddress, setFromAddress] = useState(emailCfg?.from_address ?? '');
  const [toAddress, setToAddress] = useState(emailCfg?.to_address ?? '');

  // Telegram fields
  const telegramCfg = channel && channel.type === 'telegram' ? (channel.config as TelegramConfig) : null;
  const [botToken, setBotToken] = useState(telegramCfg?.bot_token ?? '');
  const [chatId, setChatId] = useState(telegramCfg?.chat_id ?? '');

  // Discord fields
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

// ─── RuleForm ─────────────────────────────────────────────────────────────────

interface RuleFormProps {
  rule: NotificationRule | null;
  channels: NotificationChannel[];
  onClose: () => void;
  onSaved: () => void;
}

function RuleForm({ rule, channels, onClose, onSaved }: RuleFormProps) {
  const { t } = useTranslation();

  const [ruleType, setRuleType] = useState<NotificationRuleType>(rule?.type ?? 'lowest_in_days');
  const [channelId, setChannelId] = useState(String(rule?.channel_id ?? ''));
  const [days, setDays] = useState(String((rule?.params as LowestInDaysParams)?.days ?? 30));
  const [threshold, setThreshold] = useState(String((rule?.params as BelowThresholdParams)?.threshold ?? 100));
  const [percentage, setPercentage] = useState(String((rule?.params as PercentageDropParams)?.percentage ?? 20));
  const [windowDays, setWindowDays] = useState(String((rule?.params as PercentageDropParams)?.window_days ?? 30));

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const buildParams = (): LowestInDaysParams | BelowThresholdParams | PercentageDropParams => {
    switch (ruleType) {
      case 'lowest_in_days':
        return { days: parseInt(days, 10) || 30 };
      case 'below_threshold':
        return { threshold: parseFloat(threshold) || 100 };
      case 'percentage_drop':
        return { percentage: parseFloat(percentage) || 20, window_days: parseInt(windowDays, 10) || 30 };
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const params = buildParams();
      const chanId = parseInt(channelId, 10);
      if (rule) {
        await api.notifications.updateRule(rule.id, { channel_id: chanId, type: ruleType, params });
      } else {
        await api.notifications.createRule({ product_id: null, channel_id: chanId, type: ruleType, params });
      }
      onSaved();
    } catch (err) {
      setError(t('notifications.rules.createFailed') + ': ' + (err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title={rule ? t('notifications.rules.edit') : t('notifications.rules.add')}
      size="md"
    >
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>{t('notifications.rules.type')}</label>
            <select value={ruleType} onChange={(e) => setRuleType(e.target.value as NotificationRuleType)}>
              <option value="lowest_in_days">{t('notifications.rules.ruleTypes.lowestInDays')}</option>
              <option value="below_threshold">{t('notifications.rules.ruleTypes.belowThreshold')}</option>
              <option value="percentage_drop">{t('notifications.rules.ruleTypes.percentageDrop')}</option>
            </select>
          </div>

          <div className="form-group">
            <label>{t('notifications.rules.channel')}</label>
            <select value={channelId} onChange={(e) => setChannelId(e.target.value)} required>
              <option value="">—</option>
              {channels.map((c) => (
                <option key={c.id} value={String(c.id)}>{c.name}</option>
              ))}
            </select>
          </div>

          {ruleType === 'lowest_in_days' && (
            <div className="form-group">
              <label>{t('notifications.rules.days')}</label>
              <input type="number" value={days} onChange={(e) => setDays(e.target.value)} min="1" required />
            </div>
          )}

          {ruleType === 'below_threshold' && (
            <div className="form-group">
              <label>{t('notifications.rules.threshold')}</label>
              <input type="number" value={threshold} onChange={(e) => setThreshold(e.target.value)} min="0" step="0.01" required />
            </div>
          )}

          {ruleType === 'percentage_drop' && (
            <>
              <div className="form-group">
                <label>{t('notifications.rules.percentage')}</label>
                <input type="number" value={percentage} onChange={(e) => setPercentage(e.target.value)} min="1" max="100" required />
              </div>
              <div className="form-group">
                <label>{t('notifications.rules.windowDays')}</label>
                <input type="number" value={windowDays} onChange={(e) => setWindowDays(e.target.value)} min="1" required />
              </div>
            </>
          )}

          {error && <div className="error-message">{error}</div>}

          <div className="modal-actions">
            <Button type="button" variant="secondary" onClick={onClose} disabled={submitting}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" variant="primary" disabled={submitting}>
              {submitting ? '...' : t('common.save')}
            </Button>
          </div>
        </form>
      </Modal>
  );
}

// ─── Notifications (main) ─────────────────────────────────────────────────────

export function Notifications() {
  const { t } = useTranslation();

  const [activeTab, setActiveTab] = useState<TabType>('channels');
  const [channels, setChannels] = useState<NotificationChannel[]>([]);
  const [rules, setRules] = useState<NotificationRule[]>([]);
  const [history, setHistory] = useState<NotificationLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showChannelForm, setShowChannelForm] = useState(false);
  const [showRuleForm, setShowRuleForm] = useState(false);
  const [editingChannel, setEditingChannel] = useState<NotificationChannel | null>(null);
  const [editingRule, setEditingRule] = useState<NotificationRule | null>(null);

  const loadChannels = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.notifications.getChannels();
      setChannels(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const loadRules = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.notifications.getRules();
      setRules(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const loadHistory = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.notifications.getHistory();
      setHistory(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'channels') loadChannels();
    else if (activeTab === 'rules') loadRules();
    else loadHistory();
  }, [activeTab]);

  const handleToggleChannel = async (id: number, enabled: boolean) => {
    try {
      await api.notifications.updateChannel(id, { enabled });
      await loadChannels();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleDeleteChannel = async (id: number) => {
    if (!window.confirm(t('notifications.channels.confirmDelete'))) return;
    try {
      await api.notifications.deleteChannel(id);
      await loadChannels();
    } catch (err) {
      setError(t('notifications.channels.deleteFailed') + ': ' + (err as Error).message);
    }
  };

  const handleToggleRule = async (id: number, enabled: boolean) => {
    try {
      await api.notifications.updateRule(id, { enabled });
      await loadRules();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleDeleteRule = async (id: number) => {
    if (!window.confirm(t('notifications.rules.confirmDelete'))) return;
    try {
      await api.notifications.deleteRule(id);
      await loadRules();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const getChannelName = (channelId: number): string => {
    const ch = channels.find((c) => c.id === channelId);
    return ch ? ch.name : String(channelId);
  };

  return (
    <div className="notifications-section">
      <h2>{t('notifications.title')}</h2>

      <nav className="notifications-tabs">
        <button
          className={`notifications-tab${activeTab === 'channels' ? ' active' : ''}`}
          onClick={() => setActiveTab('channels')}
        >
          {t('notifications.channels.title')}
        </button>
        <button
          className={`notifications-tab${activeTab === 'rules' ? ' active' : ''}`}
          onClick={() => setActiveTab('rules')}
        >
          {t('notifications.rules.title')}
        </button>
        <button
          className={`notifications-tab${activeTab === 'history' ? ' active' : ''}`}
          onClick={() => setActiveTab('history')}
        >
          {t('notifications.history.title')}
        </button>
      </nav>

      {error && <div className="error-message">{error}</div>}

      {loading ? (
        <div className="loading">...</div>
      ) : (
        <>
          {/* Channels Tab */}
          {activeTab === 'channels' && (
            <>
              <div className="notifications-header">
                <h3>{t('notifications.channels.title')}</h3>
                <button
                  className="btn btn-primary"
                  onClick={() => { setEditingChannel(null); setShowChannelForm(true); }}
                >
                  {t('notifications.channels.add')}
                </button>
              </div>

              {channels.length === 0 ? (
                <div className="empty-state">{t('notifications.channels.noChannels')}</div>
              ) : (
                <table className="notifications-table">
                  <thead>
                    <tr>
                      <th>{t('notifications.channels.name')}</th>
                      <th>{t('notifications.channels.type')}</th>
                      <th>{t('notifications.channels.enabled')}</th>
                      <th>{t('notifications.channels.actions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {channels.map((channel) => (
                      <tr key={channel.id}>
                        <td>{channel.name}</td>
                        <td>
                          <span className={`channel-type-badge type-${channel.type}`}>
                            {t(`notifications.channels.channelTypes.${channel.type}`)}
                          </span>
                        </td>
                        <td>
                          <button
                            className={`toggle-button ${channel.enabled ? 'enabled' : 'disabled'}`}
                            onClick={() => handleToggleChannel(channel.id, !channel.enabled)}
                          >
                            {channel.enabled ? '✓' : '✗'}
                          </button>
                        </td>
                        <td>
                          <button
                            className="btn btn-small"
                            onClick={() => { setEditingChannel(channel); setShowChannelForm(true); }}
                          >
                            {t('notifications.channels.edit')}
                          </button>
                          {' '}
                          <button
                            className="btn btn-small btn-danger"
                            onClick={() => handleDeleteChannel(channel.id)}
                          >
                            {t('notifications.delete')}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          )}

          {/* Rules Tab */}
          {activeTab === 'rules' && (
            <>
              <div className="notifications-header">
                <h3>{t('notifications.rules.title')}</h3>
                <button
                  className="btn btn-primary"
                  onClick={() => { setEditingRule(null); setShowRuleForm(true); }}
                >
                  {t('notifications.rules.add')}
                </button>
              </div>

              {rules.length === 0 ? (
                <div className="empty-state">{t('notifications.rules.noRules')}</div>
              ) : (
                <table className="notifications-table">
                  <thead>
                    <tr>
                      <th>{t('notifications.rules.type')}</th>
                      <th>{t('notifications.rules.params')}</th>
                      <th>{t('notifications.rules.channel')}</th>
                      <th>{t('notifications.rules.enabled')}</th>
                      <th>{t('notifications.rules.actions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rules.map((rule) => (
                      <tr key={rule.id}>
                        <td>
                          <span className={`rule-type-badge type-${rule.type}`}>
                            {t(`notifications.rules.ruleTypes.${rule.type === 'lowest_in_days' ? 'lowestInDays' : rule.type === 'below_threshold' ? 'belowThreshold' : 'percentageDrop'}`)}
                          </span>
                        </td>
                        <td>{formatRuleParams(rule.type, rule.params, t)}</td>
                        <td>{getChannelName(rule.channel_id)}</td>
                        <td>
                          <button
                            className={`toggle-button ${rule.enabled ? 'enabled' : 'disabled'}`}
                            onClick={() => handleToggleRule(rule.id, !rule.enabled)}
                          >
                            {rule.enabled ? '✓' : '✗'}
                          </button>
                        </td>
                        <td>
                          <button
                            className="btn btn-small"
                            onClick={() => { setEditingRule(rule); setShowRuleForm(true); }}
                          >
                            {t('notifications.rules.edit')}
                          </button>
                          {' '}
                          <button
                            className="btn btn-small btn-danger"
                            onClick={() => handleDeleteRule(rule.id)}
                          >
                            {t('notifications.delete')}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          )}

          {/* History Tab */}
          {activeTab === 'history' && (
            <>
              <h3>{t('notifications.history.title')}</h3>
              {history.length === 0 ? (
                <div className="empty-state">{t('notifications.history.noHistory')}</div>
              ) : (
                <table className="notifications-table">
                  <thead>
                    <tr>
                      <th>{t('notifications.history.date')}</th>
                      <th>{t('notifications.history.trigger')}</th>
                      <th>{t('notifications.history.status')}</th>
                      <th>{t('notifications.history.message')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((entry) => (
                      <tr key={entry.id}>
                        <td>{new Date(entry.created_at).toLocaleString()}</td>
                        <td>{entry.trigger_type}</td>
                        <td>
                          <span className={`status-badge status-${entry.status}`}>
                            {entry.status}
                          </span>
                        </td>
                        <td>
                          {entry.message?.substring(0, 100)}
                          {entry.error_message && (
                            <span className="error-message">: {entry.error_message}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          )}
        </>
      )}

      {showChannelForm && (
        <ChannelForm
          channel={editingChannel}
          onClose={() => { setShowChannelForm(false); setEditingChannel(null); }}
          onSaved={() => { setShowChannelForm(false); setEditingChannel(null); loadChannels(); }}
        />
      )}

      {showRuleForm && (
        <RuleForm
          rule={editingRule}
          channels={channels}
          onClose={() => { setShowRuleForm(false); setEditingRule(null); }}
          onSaved={() => { setShowRuleForm(false); setEditingRule(null); loadRules(); }}
        />
      )}
    </div>
  );
}

export default Notifications;
