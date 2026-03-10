import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { adminApi } from '../../services/api';

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

  const handleEdit = (config: ConfigItem) => {
    setEditingKey(config.key);
    setEditValue(config.value);
  };

  const handleSave = async (key: string) => {
    if (!confirm(t('admin.config.confirmUpdate', { key }))) return;
    try {
      await adminApi.setConfig(key, editValue);
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
      'quota.max_products': t('admin.config.quotaMaxProducts'),
      'quota.max_lists': t('admin.config.quotaMaxLists'),
      'scheduler.enabled': t('admin.config.schedulerEnabled'),
      'scheduler.cron': t('admin.config.schedulerCron')
    };
    return labels[key] || key;
  };

  const renderValueInput = (config: ConfigItem) => {
    if (editingKey === config.key) {
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
          className="config-input"
        />
      );
    }
    return <span className="config-value">{config.value}</span>;
  };

  if (loading) {
    return <div className="loading">{t('admin.users.loading')}</div>;
  }

  return (
    <div className="system-config">
      <div className="config-header">
        <h2>{t('admin.config.title')}</h2>
      </div>

      <table className="admin-table">
        <thead>
          <tr>
            <th>{t('admin.config.title')}</th>
            <th>{t('admin.config.title')}</th>
            <th>{t('admin.config.title')}</th>
            <th>{t('admin.config.title')}</th>
          </tr>
        </thead>
        <tbody>
          {configs.length === 0 ? (
            <tr>
              <td colSpan={4}>No configuration found</td>
            </tr>
          ) : (
            configs.map((config) => (
              <tr key={config.key}>
                <td>
                  <strong>{getConfigLabel(config.key)}</strong>
                  <div className="config-key">{config.key}</div>
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
  );
}
