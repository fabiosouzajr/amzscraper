import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { adminApi } from '../../services/api';
import styles from './Notifications.module.css';
import tableStyles from './AdminTable.module.css';

export function AdminNotifications() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<'channels' | 'rules' | 'history'>('channels');
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    loadData();
  }, [activeTab]);

  const loadData = async () => {
    try {
      setLoading(true);
      switch (activeTab) {
        case 'channels':
          const channels = await adminApi.getNotificationChannels();
          setData(channels);
          break;
        case 'rules':
          const rules = await adminApi.getNotificationRules();
          setData(rules);
          break;
        case 'history':
          const history = await adminApi.getNotificationHistory();
          setData(history);
          break;
      }
    } catch (error) {
      console.error('Failed to load notifications:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="loading">{t('common.loading')}</div>;
  }

  const getChannelTypeBadgeClass = (type: string) => {
    const map: Record<string, string> = {
      email: styles.typeEmail,
      telegram: styles.typeTelegram,
      discord: styles.typeDiscord,
    };
    return `${styles.channelTypeBadge} ${map[type] ?? ''}`;
  };

  const getRuleTypeBadgeClass = (type: string) => {
    const map: Record<string, string> = {
      lowest_in_days: styles.typeLowestInDays,
      below_threshold: styles.typeBelowThreshold,
      percentage_drop: styles.typePercentageDrop,
    };
    return `${styles.ruleTypeBadge} ${map[type] ?? ''}`;
  };

  return (
    <div className={styles.adminSection}>
      <h2>{t('admin.notifications.title')}</h2>

      {/* Tabs */}
      <nav className={styles.adminTabs}>
        <button
          className={`${styles.adminTab} ${activeTab === 'channels' ? styles.active : ''}`}
          onClick={() => setActiveTab('channels')}
        >
          {t('admin.notifications.channels')}
        </button>
        <button
          className={`${styles.adminTab} ${activeTab === 'rules' ? styles.active : ''}`}
          onClick={() => setActiveTab('rules')}
        >
          {t('admin.notifications.rules')}
        </button>
        <button
          className={`${styles.adminTab} ${activeTab === 'history' ? styles.active : ''}`}
          onClick={() => setActiveTab('history')}
        >
          {t('admin.notifications.history')}
        </button>
      </nav>

      {/* Channels Tab */}
      {activeTab === 'channels' && (
        <div className={tableStyles.tableWrapper}>
          <table className={tableStyles.adminTable}>
            <thead>
              <tr>
                <th>{t('admin.notifications.username')}</th>
                <th>{t('admin.notifications.type')}</th>
                <th>{t('admin.notifications.name')}</th>
                <th>{t('admin.notifications.status')}</th>
                <th>{t('admin.notifications.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {data && data.map((channel: any) => (
                <tr key={channel.id}>
                  <td>{channel.username}</td>
                  <td>
                    <span className={`role-badge role-${channel.role.toLowerCase()}`}>
                      {channel.role}
                    </span>
                  </td>
                  <td>
                    <span className={getChannelTypeBadgeClass(channel.type)}>
                      {channel.type}
                    </span>
                  </td>
                  <td>{channel.name}</td>
                  <td>
                    {channel.is_disabled ? (
                      <span className="status-badge status-disabled">
                        {t('admin.notifications.disabled')}
                      </span>
                    ) : (
                      <span className="status-badge status-active">
                        {t('admin.notifications.enabled')}
                      </span>
                    )}
                  </td>
                  <td>
                    <button className="btn btn-small" onClick={() => {}}>
                      {t('admin.notifications.viewUser')}
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
        <div className={tableStyles.tableWrapper}>
          <table className={tableStyles.adminTable}>
            <thead>
              <tr>
                <th>{t('admin.notifications.username')}</th>
                <th>{t('admin.notifications.product')}</th>
                <th>{t('admin.notifications.type')}</th>
                <th>{t('admin.notifications.params')}</th>
                <th>{t('admin.notifications.channel')}</th>
                <th>{t('admin.notifications.status')}</th>
                <th>{t('admin.notifications.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {data && data.map((rule: any) => (
                <tr key={rule.id}>
                  <td>{rule.username}</td>
                  <td>{rule.product_description || '-'}</td>
                  <td>
                    <span className={getRuleTypeBadgeClass(rule.type)}>
                      {rule.type}
                    </span>
                  </td>
                  <td>{JSON.stringify(rule.params)}</td>
                  <td>{rule.channel_name}</td>
                  <td>
                    {rule.enabled ? (
                      <span className="status-badge status-active">
                        {t('admin.notifications.enabled')}
                      </span>
                    ) : (
                      <span className="status-badge status-disabled">
                        {t('admin.notifications.disabled')}
                      </span>
                    )}
                  </td>
                  <td>
                    <button className="btn btn-small">
                      {t('admin.notifications.edit')}
                    </button>
                    <button className="btn btn-small btn-danger">
                      {t('admin.notifications.delete')}
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
        <div className={tableStyles.tableWrapper}>
          <table className={tableStyles.adminTable}>
            <thead>
              <tr>
                <th>{t('admin.notifications.date')}</th>
                <th>{t('admin.notifications.username')}</th>
                <th>{t('admin.notifications.product')}</th>
                <th>{t('admin.notifications.trigger')}</th>
                <th>{t('admin.notifications.channel')}</th>
                <th>{t('admin.notifications.status')}</th>
                <th>{t('admin.notifications.message')}</th>
              </tr>
            </thead>
            <tbody>
              {data && data.map((entry: any) => (
                <tr key={entry.id}>
                  <td>{new Date(entry.created_at).toLocaleString()}</td>
                  <td>{entry.username}</td>
                  <td>{entry.product_description || '-'}</td>
                  <td>{entry.trigger_type}</td>
                  <td>{entry.channel_name}</td>
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
    </div>
  );
}
