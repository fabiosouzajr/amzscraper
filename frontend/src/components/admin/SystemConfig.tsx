import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { adminApi } from '../../services/api';
import styles from './SystemConfig.module.css';
import tableStyles from './AdminTable.module.css';

interface ConfigItem {
  key: string;
  value: string;
  description?: string;
}

export function SystemConfig() {
  const { t } = useTranslation();
  const [configs, setConfigs] = useState<ConfigItem[]>([]);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadConfigs();
  }, []);

  const loadConfigs = async () => {
    try {
      setLoading(true);
      const data = await adminApi.getAllConfig();
      setConfigs(data);
    } catch (error) {
      console.error('Failed to load config:', error);
    } finally {
      setLoading(false);
    }
  };

  // Convert "M H * * *" daily cron to "HH:MM"
  const cronToTime = (cron: string): string => {
    const parts = cron.trim().split(/\s+/);
    if (parts.length < 2) return '00:00';
    const minute = parseInt(parts[0], 10);
    const hour = parseInt(parts[1], 10);
    if (isNaN(minute) || isNaN(hour)) return '00:00';
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  };

  // Convert "HH:MM" back to "M H * * *" daily cron
  const timeToCron = (time: string): string => {
    const [h, m] = time.split(':').map(Number);
    return `${m ?? 0} ${h ?? 0} * * *`;
  };

  const handleEdit = (config: ConfigItem) => {
    setEditingKey(config.key);
    setEditValue(config.key === 'scheduler_cron' ? cronToTime(config.value) : config.value);
  };

  const handleSave = async (key: string) => {
    if (!confirm(t('admin.config.confirmUpdate', { key }))) return;
    try {
      const valueToSave = key === 'scheduler_cron' ? timeToCron(editValue) : editValue;
      await adminApi.setConfig(key, valueToSave);
      setEditingKey(null);
      loadConfigs();
    } catch (error) {
      console.error('Failed to update config:', error);
    }
  };

  const handleCancel = () => {
    setEditingKey(null);
    setEditValue('');
  };

  const getConfigLabel = (key: string) => {
    const labels: Record<string, string> = {
      'quota_max_products': t('admin.config.quotaMaxProducts'),
      'quota_max_lists': t('admin.config.quotaMaxLists'),
      'scheduler_enabled': t('admin.config.schedulerEnabled'),
      'scheduler_cron': t('admin.config.schedulerCron'),
      'registration_enabled': t('admin.config.registrationEnabled')
    };
    return labels[key] || key;
  };

  const renderValueInput = (config: ConfigItem) => {
    if (editingKey === config.key) {
      if (config.key === 'scheduler_cron') {
        return (
          <input
            type="time"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            className={styles.configInput}
          />
        );
      }
      const isBoolean = config.value.toLowerCase() === 'true' || config.value.toLowerCase() === 'false';
      if (isBoolean) {
        return (
          <select
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
          >
            <option value="true">true</option>
            <option value="false">false</option>
          </select>
        );
      }
      return (
        <input
          type="text"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          className={styles.configInput}
        />
      );
    }
    const displayValue = config.key === 'scheduler_cron' ? cronToTime(config.value) : config.value;
    return <span className={styles.configValue}>{displayValue}</span>;
  };

  if (loading) {
    return <div className="loading">{t('admin.config.loading')}</div>;
  }

  return (
    <div className={styles.systemConfig}>
      <div className={styles.configHeader}>
        <h2>{t('admin.config.title')}</h2>
      </div>

      <div className={tableStyles.tableWrapper}>
        <table className={tableStyles.adminTable}>
          <thead>
            <tr>
              <th>{t('admin.config.tableKey')}</th>
              <th>{t('admin.config.tableValue')}</th>
              <th>{t('admin.config.tableDescription')}</th>
              <th>{t('admin.config.tableActions')}</th>
            </tr>
          </thead>
          <tbody>
            {configs.length === 0 ? (
              <tr>
                <td colSpan={4}>{t('admin.config.noConfigFound')}</td>
              </tr>
            ) : (
              configs.map((config) => (
                <tr key={config.key}>
                  <td>
                    <strong>{getConfigLabel(config.key)}</strong>
                    <div className={styles.configKey}>{config.key}</div>
                  </td>
                  <td>{renderValueInput(config)}</td>
                  <td>{config.description || '-'}</td>
                  <td>
                    {editingKey === config.key ? (
                      <>
                        <button
                          className="btn btn-small btn-success"
                          onClick={() => handleSave(config.key)}
                        >
                          {t('common.save')}
                        </button>
                        <button
                          className="btn btn-small"
                          onClick={handleCancel}
                        >
                          {t('common.cancel')}
                        </button>
                      </>
                    ) : (
                      <button
                        className="btn btn-small"
                        onClick={() => handleEdit(config)}
                      >
                        {t('admin.config.edit')}
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
