import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../services/api';
import { api as notificationsApi } from '../services/api';

type TabType = 'channels' | 'rules' | 'history';

interface Channel {
  id: number;
  type: string;
  name: string;
  config: any;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

interface Rule {
  id: number;
  type: string;
  product_id: number | null;
  channel_id: number;
  params: any;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

interface HistoryEntry {
  id: number;
  product_id: number;
  channel_id: number;
  trigger_type: string;
  message: string;
  status: 'sent' | 'failed';
  error_message: string | null;
  created_at: string;
}

export function Notifications() {
  const { t } = useTranslation();
  const { user } = useAuth();

  const [activeTab, setActiveTab] = useState<TabType>('channels');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<Channel[] | Rule[] | HistoryEntry[]>(null);

  // Load data based on active tab
  useEffect(() => {
    if (!user) return;
    loadData();
  }, [activeTab]);

  const loadData = async () => {
    setLoading(true);
    try {
      switch (activeTab) {
        case 'channels':
          const channels = await api.notifications.getChannels();
          setData(channels);
          break;
        case 'rules':
          const rules = await api.notifications.getRules();
          setData(rules);
          break;
        case 'history':
          const history = await api.notifications.getHistory();
          setData(history);
          break;
      }
    } catch (error) {
      console.error('Failed to load notifications:', error);
    } finally {
      setLoading(false);
    }
  };

  const channels: Channel[] = [
    { id: 1, type: 'email', name: 'Work Email', enabled: true },
    { id: 2, type: 'telegram', name: 'Personal Telegram', enabled: false },
    { id: 3, type: 'discord', name: 'Discord Webhook', enabled: true },
  ];

  const rules: Rule[] = [
    { id: 1, type: 'lowest_in_days', enabled: true, params: { days: 30 } },
    { id: 2, type: 'below_threshold', enabled: false, params: { threshold: 100 } },
  ];

  const history: HistoryEntry[] = [];

  if (!user) {
    return <div className="notifications-section">
      <p>{t('notifications.pleaseLogin')}</p>
    </div>;
  }

  return (
    <div className="notifications-section">
      <h2>{t('notifications.title')}</h2>

      {/* Tabs */}
      <nav className="notifications-tabs">
        <button
          className={`notifications-tab ${activeTab === 'channels' ? 'active' : ''}`}
          onClick={() => setActiveTab('channels')}
        >
          {t('notifications.channels.title')}
        </button>
        <button
          className={`notifications-tab ${activeTab === 'rules' ? 'active' : ''}`}
          onClick={() => setActiveTab('rules')}
        >
          {t('notifications.rules.title')}
        </button>
        <button
          className={`notifications-tab ${activeTab === 'history' ? 'active' : ''}`}
          onClick={() => setActiveTab('history')}
        >
          {t('notifications.history.title')}
        </button>
      </nav>

      {loading ? (
        <div className="loading">{t('common.loading')}</div>
      ) : (
        <>
          {/* Channels Tab */}
          {activeTab === 'channels' && (
            <div className="channels-content">
              <div className="notifications-header">
                <h3>{t('notifications.channels.title')}</h3>
                <button className="btn btn-primary" onClick={() => setShowChannelForm(true)}>
                  {t('notifications.channels.add')}
                </button>
              </div>

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
                  {channels.map((channel: Channel) => (
                    <tr key={channel.id}>
                      <td>{channel.name}</td>
                      <td>
                        <span className={`channel-type-badge type-${channel.type}`}>
                          {channel.type}
                        </span>
                      </td>
                      <td>
                        <button
                          className={`toggle-button ${channel.enabled ? 'on' : 'off'}`}
                          onClick={() => handleToggleChannel(channel.id, !channel.enabled)}
                        >
                          {channel.enabled ? '🟢' : '⚪'}
                        </button>
                      </td>
                      <td>
                        <button className="btn btn-small" onClick={() => setEditingChannel(channel)}>
                          {t('notifications.channels.edit')}
                        </button>
                        <button className="btn btn-small btn-danger" onClick={() => handleDeleteChannel(channel.id)}>
                          {t('common.delete')}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Rules Tab */}
          {activeTab === 'rules' && (
            <div className="rules-content">
              <div className="notifications-header">
                <h3>{t('notifications.rules.title')}</h3>
                <button className="btn btn-primary" onClick={() => setShowRuleForm(true)}>
                  {t('notifications.rules.add')}
                </button>
              </div>

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
                  {rules.map((rule: Rule) => (
                    <tr key={rule.id}>
                      <td>
                        <span className={`rule-type-badge type-${rule.type}`}>
                          {rule.type}
                        </span>
                      </td>
                      <td>{JSON.stringify(rule.params)}</td>
                      <td>-</td>
                      <td>
                        <button
                          className={`toggle-button ${rule.enabled ? 'on' : 'off'}`}
                          onClick={() => handleToggleRule(rule.id, !rule.enabled)}
                        >
                          {rule.enabled ? '🟢' : '⚪'}
                        </button>
                      </td>
                      <td>
                        <button className="btn btn-small" onClick={() => setEditingRule(rule)}>
                          {t('notifications.rules.edit')}
                        </button>
                        <button className="btn btn-small btn-danger" onClick={() => handleDeleteRule(rule.id)}>
                          {t('common.delete')}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* History Tab */}
          {activeTab === 'history' && (
            <div className="history-content">
              <h3>{t('notifications.history.title')}</h3>
              <table className="notifications-table">
                <thead>
                  <tr>
                    <th>{t('notifications.history.date')}</th>
                    <th>{t('notifications.history.product')}</th>
                    <th>{t('notifications.history.trigger')}</th>
                    <th>{t('notifications.history.channel')}</th>
                    <th>{t('notifications.history.status')}</th>
                    <th>{t('notifications.history.message')}</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((entry: HistoryEntry) => (
                    <tr key={entry.id}>
                      <td>{new Date(entry.created_at).toLocaleString()}</td>
                      <td>{entry.product_description || '-'}</td>
                      <td>{entry.trigger_type}</td>
                      <td>{entry.channel_name || '-'}</td>
                      <td>
                        <span className={`status-badge status-${entry.status}`}>
                          {entry.status}
                        </span>
                      </td>
                      <td>
                        {entry.message?.substring(0, 100)}
                        {entry.error_message && <span className="error-text">: {entry.error_message}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Channel Form Modal */}
      {showChannelForm && (
        <ChannelForm />
      )}

      {/* Rule Form Modal */}
      {showRuleForm && (
        <RuleForm />
      )}
    </div>
  );
}

// Channel Form Component
function ChannelForm() {
  const { t } = useTranslation();
  const [formType, setFormType] = useState<'add' | 'edit'>([formType] as 'add']);
  const [formData, setFormData] = useState({
    email: {
      type: 'email',
      name: '',
      smtp_host: '',
      smtp_port: '587',
      smtp_secure: true,
      smtp_user: '',
      smtp_pass: '',
      from_address: '',
      to_address: '',
    },
    telegram: {
      type: 'telegram',
      bot_token: '',
      chat_id: '',
    },
    discord: {
      type: 'discord',
      webhook_url: '',
    },
  });

  const handleTypeChange = (type: string) => {
    setFormType(type as 'email');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const config = formData[formType];
    let config: any;

    switch (formType) {
      case 'email':
        config = {
          type: 'email',
          name: formData.email.name,
          config: {
            smtp_host: formData.email.smtp_host,
            smtp_port: parseInt(formData.email.smtp_port) || 587,
            smtp_secure: formData.email.smtp_secure !== false,
            smtp_user: formData.email.smtp_user,
            smtp_pass: formData.email.smtp_pass,
            from_address: formData.email.from_address,
            to_address: formData.email.to_address,
          },
        };
        break;
      case 'telegram':
        config = {
          type: 'telegram',
          name: formData.telegram.name,
          config: {
            bot_token: formData.telegram.bot_token,
            chat_id: formData.telegram.chat_id,
          },
        };
        break;
      case 'discord':
        config = {
          type: 'discord',
          name: formData.discord.name,
          config: {
            webhook_url: formData.discord.webhook_url,
          },
        };
        break;
    default:
        return;
    }

    try {
      if (formType === 'add') {
        await api.notifications.createChannel(config);
      } else {
        const channel = data.channels?.find((c: Channel) => c.id === editingChannel?.id);
        if (!channel) return;
        await api.notifications.updateChannel(channel.id, config);
      }

      setShowChannelForm(false);
      setEditingChannel(null);
      loadData();
    } catch (error: any) {
      alert(t('notifications.channels.createFailed') + ': ' + (error as Error).message);
    } finally {
      if (formType === 'add') {
        setFormData(defaultFormData);
      }
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal">
        <h3>{editingChannel ? t('notifications.channels.edit') : t('notifications.channels.add')}</h3>
        <form
              onSubmit={handleSubmit}
            >
              <div className="form-group">
                <label>{t('notifications.channels.type')}</label>
                <select name="type" onChange={handleTypeChange}>
                  <option value="email">{t('notifications.channels.type.email')}</option>
                  <option value="telegram">{t('notifications.channels.type.telegram')}</option>
                  <option value="discord">{t('notifications.channels.type.discord')}</option>
                </select>
              </div>

              <div className="form-group">
                <label>{t('notifications.channels.name')}</label>
                <input type="text" name="name" value={formData.email.name} required />
              </div>

              {/* Email config */}
              <div className="channel-config email-config" style={{ display: 'none' }}>
                <div className="form-group">
                  <label>{t('notifications.channels.email.smtpHost')}</label>
                  <input type="text" name="smtp_host" defaultValue={formData.email.smtp_host} required />
                </div>
                <div className="form-group">
                  <label>{t('notifications.channels.email.smtpPort')}</label>
                  <input type="number" name="smtp_port" defaultValue={formData.email.smtp_port || '587'} required />
                </div>
                <div className="form-group checkbox">
                  <label>
                    <input type="checkbox" name="smtp_secure" defaultChecked={true} />
                    {t('notifications.channels.email.smtpSecure')}
                  </label>
                  <div className="form-group">
                  <label>{t('notifications.channels.email.smtpUser')}</label>
                  <input type="text" name="smtp_user" defaultValue={formData.email.smtp_user || ''} required />
                </div>
                <div className="form-group">
                  <label>{t('notifications.channels.email.smtpPass')}</label>
                  <input type="password" name="smtp_pass" defaultValue={formData.email.smtp_pass || ''} required />
                </div>
                <div className="form-group">
                  <label>{t('notifications.channels.email.fromAddress')}</label>
                  <input type="email" name="from_address" defaultValue={formData.email.from_address || ''} required />
                </div>
                <div className="form-group">
                  <label>{t('notifications.channels.email.toAddress')}</label>
                  <input type="email" name="to_address" defaultValue={formData.email.to_address || ''} required />
                </div>
              </div>

              {/* Telegram config */}
              <div className="channel-config telegram-config" style={{ display: 'none' }}>
                <div className="form-group">
                  <label>{t('notifications.channels.telegram.botToken')}</label>
                  <input type="text" name="bot_token" defaultValue={formData.telegram.bot_token || ''} required />
                </div>
                <div className="form-group">
                  <label>{t('notifications.channels.telegram.chatId')}</label>
                  <input type="text" name="chat_id" defaultValue={formData.telegram.chat_id || ''} required />
                </div>
              </div>

              {/* Discord config */}
              <div className="channel-config discord-config" style={{ display: 'none' }}>
                <div className="form-group">
                  <label>{t('notifications.channels.discord.webhookUrl')}</label>
                  <input type="url" name="webhook_url" defaultValue={formData.discord.webhook_url || ''} required />
                </div>
              </div>

              <div className="modal-actions">
                <button type="button" onClick={() => setShowChannelForm(false)}>
                  {t('common.cancel')}
                </button>
                <button type="submit" className="btn btn-primary">
                  {t('common.save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
  );
}

// Rule Form Component
function RuleForm() {
  const { t } = useTranslation();
  const [formType, setFormType] = useState<'add' | 'edit'>('add');
  const [formData, setFormData] = useState({
    type: 'lowest_in_days',
    params: {},
    channel_id: 0,
    product_id: number | null,
    enabled: true,
  });

  const handleTypeChange = (type: string) => {
    setFormType(type as 'lowest_in_days');
    const newParams: Record<string, any> = {};

    switch (type) {
      case 'lowest_in_days':
        newParams.days = 30;
        break;
      case 'below_threshold':
        newParams.threshold = 100;
        break;
      case 'percentage_drop':
        newParams = { percentage: 20, window_days: 30 };
        break;
    default:
        return;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const config = {
      type: formType,
      params: newParams,
      channel_id: formData.channel_id,
      product_id: formData.product_id || null,
      enabled: formData.enabled,
    };

    try {
      if (formType === 'add') {
        await api.notifications.createRule(config);
      } else {
        const rule = data.rules?.find((r: Rule) => r.id === editingRule?.id);
        if (!rule) return;

        await api.notifications.updateRule(rule.id, config);
      }

      setShowRuleForm(false);
      setEditingRule(null);
      loadData();
    } catch (error: any) {
      alert(t('notifications.rules.createFailed') + ': ' + (error as Error).message);
    } finally {
      if (formType === 'add') {
        setFormData(defaultFormData);
      }
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal">
        <h3>{editingRule ? t('notifications.rules.edit') : t('notifications.rules.add')}</h3>
        <form
              onSubmit={handleSubmit}
            >
              <div className="form-group">
                <label>{t('notifications.rules.type')}</label>
                <select name="type" onChange={handleTypeChange}>
                  <option value="lowest_in_days">{t('notifications.rules.type.lowestInDays')}</option>
                  <option value="below_threshold">{t('notifications.rules.type.belowThreshold')}</option>
                  <option value="percentage_drop">{t('notifications.rules.type.percentageDrop')}</option>
                </select>
              </div>

              <div className="form-group">
                <label>{t('notifications.rules.params')}</label>
                <input type="text" name="params" value={JSON.stringify(formData.params)} required />
              </div>

              <div className="form-group">
                <label>{t('notifications.rules.channel')}</label>
                <select name="channel_id" required>
                  <option value="">Select a channel...</option>
                  {channels.map((c: Channel) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              </div>

              <div className="form-group checkbox">
                <label>
                  <input type="checkbox" name="enabled" defaultChecked={formData.enabled} />
                </label>
              </div>
            </form>

              <div className="modal-actions">
                <button type="button" onClick={() => setShowRuleForm(false)}>
                  {t('common.cancel')}
                </button>
                <button type="submit" className="btn btn-primary">
                  {t('common.save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
  );
}
