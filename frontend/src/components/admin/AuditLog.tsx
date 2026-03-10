import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { AuditLog } from '../../types';
import { adminApi } from '../../services/api';

export function AuditLog() {
  const { t } = useTranslation();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<string>('');
  const [filterUserId, setFilterUserId] = useState<string>('');

  useEffect(() => {
    loadLogs();
  }, [filterType, filterUserId]);

  const loadLogs = async () => {
    try {
      setLoading(true);
      const data = await adminApi.getAuditLogs(
        100,
        0,
        filterType || undefined,
        filterUserId ? parseInt(filterUserId) : undefined
      );
      setLogs(data);
    } catch (error) {
      console.error('Failed to load audit logs:', error);
    } finally {
      setLoading(false);
    }
  };

  const getActionBadgeClass = (action: string) => {
    const actionLower = action.toLowerCase();
    if (actionLower.includes('create') || actionLower.includes('enable')) return 'action-create';
    if (actionLower.includes('disable') || actionLower.includes('delete')) return 'action-delete';
    return 'action-update';
  };

  const getTargetTypeBadgeClass = (targetType?: string) => {
    if (!targetType) return 'target-none';
    return `target-${targetType.toLowerCase()}`;
  };

  const filterTypeOptions = [
    { value: '', label: t('admin.audit.allTypes') },
    { value: 'USER', label: t('admin.audit.typeUser') },
    { value: 'CONFIG', label: t('admin.audit.typeConfig') },
    { value: 'PRODUCT', label: t('admin.audit.typeProduct') }
  ];

  // Get unique admin users from logs
  const adminUsers = Array.from(new Map(logs.map(log => [log.admin_user_id, log.admin_username])).entries());

  const filteredLogs = filterType
    ? logs.filter(l => l.target_type?.toLowerCase() === filterType.toLowerCase())
    : filterUserId
    ? logs.filter(l => l.admin_user_id === parseInt(filterUserId))
    : logs;

  return (
    <div className="audit-log">
      <div className="audit-header">
        <h2>{t('admin.audit.title')}</h2>

        <select
          className="filter-select"
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
        >
          {filterTypeOptions.map(option => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>

        <select
          className="filter-select"
          value={filterUserId}
          onChange={(e) => setFilterUserId(e.target.value)}
        >
          <option value="">{t('admin.audit.allUsers')}</option>
          {adminUsers.map(([userId, username]) => (
            <option key={userId} value={userId}>{username}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="loading">Loading...</div>
      ) : (
        <table className="admin-table">
          <thead>
            <tr>
              <th>{t('admin.audit.timestamp')}</th>
              <th>{t('admin.audit.admin')}</th>
              <th>{t('admin.audit.action')}</th>
              <th>{t('admin.audit.target')}</th>
              <th>{t('admin.audit.targetId')}</th>
              <th>{t('admin.audit.details')}</th>
            </tr>
          </thead>
          <tbody>
            {filteredLogs.length === 0 ? (
              <tr>
                <td colSpan={6}>No audit logs found</td>
              </tr>
            ) : (
              filteredLogs.map((log) => (
                <tr key={log.id}>
                  <td>{new Date(log.created_at).toLocaleString()}</td>
                  <td>{log.admin_username}</td>
                  <td>
                    <span className={`action-badge ${getActionBadgeClass(log.action)}`}>
                      {log.action}
                    </span>
                  </td>
                  <td>
                    <span className={getTargetTypeBadgeClass(log.target_type)}>
                      {log.target_type || '-'}
                    </span>
                  </td>
                  <td>
                    {log.target_id ? (
                      <span>{log.target_type}:{log.target_id}</span>
                    ) : (
                      <span>-</span>
                    )}
                  </td>
                  <td>{log.details || '-'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
