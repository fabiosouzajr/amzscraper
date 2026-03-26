import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../services/api';
import {
  NotificationChannel,
  NotificationRule,
  NotificationLogEntry,
  LowestInDaysParams,
  BelowThresholdParams,
  PercentageDropParams,
  NotificationRuleType,
} from '../types';
import { Badge, EmptyState, TableSkeleton, SimpleTabs, Button } from '../design-system';
import { ChannelForm } from './ChannelForm';
import { RuleForm } from './RuleForm';

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

  const tabs = [
    { value: 'channels', label: t('notifications.channels.title') },
    { value: 'rules', label: t('notifications.rules.title') },
    { value: 'history', label: t('notifications.history.title') },
  ];

  return (
    <div className="notifications-section">
      <h2>{t('notifications.title')}</h2>

      <SimpleTabs
        tabs={tabs}
        value={activeTab}
        onChange={(v) => setActiveTab(v as TabType)}
        variant="underlined"
      />

      {error && <div className="error-message">{error}</div>}

      {loading ? (
        <TableSkeleton rows={4} columns={activeTab === 'history' ? 4 : activeTab === 'channels' ? 4 : 5} />
      ) : (
        <>
          {/* Channels Tab */}
          {activeTab === 'channels' && (
            <>
              <div className="notifications-header">
                <h3>{t('notifications.channels.title')}</h3>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => { setEditingChannel(null); setShowChannelForm(true); }}
                >
                  {t('notifications.channels.add')}
                </Button>
              </div>

              {channels.length === 0 ? (
                <EmptyState
                  variant="no-data"
                  title={t('notifications.channels.noChannels')}
                  action={
                    <Button variant="primary" size="sm" onClick={() => { setEditingChannel(null); setShowChannelForm(true); }}>
                      {t('notifications.channels.add')}
                    </Button>
                  }
                />
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
                          <Badge variant="info" size="sm">
                            {t(`notifications.channels.channelTypes.${channel.type}`)}
                          </Badge>
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
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => { setEditingRule(null); setShowRuleForm(true); }}
                >
                  {t('notifications.rules.add')}
                </Button>
              </div>

              {rules.length === 0 ? (
                <EmptyState
                  variant="no-data"
                  title={t('notifications.rules.noRules')}
                  action={
                    <Button variant="primary" size="sm" onClick={() => { setEditingRule(null); setShowRuleForm(true); }}>
                      {t('notifications.rules.add')}
                    </Button>
                  }
                />
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
                          <Badge variant="neutral" size="sm">
                            {t(`notifications.rules.ruleTypes.${rule.type === 'lowest_in_days' ? 'lowestInDays' : rule.type === 'below_threshold' ? 'belowThreshold' : 'percentageDrop'}`)}
                          </Badge>
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
                <EmptyState variant="no-data" title={t('notifications.history.noHistory')} />
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
                          <Badge
                            variant={entry.status === 'sent' ? 'success' : entry.status === 'failed' ? 'danger' : 'warning'}
                            size="sm"
                          >
                            {entry.status}
                          </Badge>
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
