import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { UserManagement } from './admin/UserManagement';
import { SystemStats } from './admin/SystemStats';
import { SystemConfig } from './admin/SystemConfig';
import { AuditLog } from './admin/AuditLog';

type AdminTab = 'users' | 'stats' | 'config' | 'audit';

export function AdminPanel() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<AdminTab>('users');

  if (!user || user.role !== 'ADMIN') {
    return <div>Access denied</div>;
  }

  return (
    <div className="admin-panel">
      <header className="admin-header">
        <h1>{t('admin.title')}</h1>
        <nav className="admin-tabs">
          <button
            className={`admin-tab ${activeTab === 'users' ? 'active' : ''}`}
            onClick={() => setActiveTab('users')}
          >
            {t('admin.tabs.users')}
          </button>
          <button
            className={`admin-tab ${activeTab === 'stats' ? 'active' : ''}`}
            onClick={() => setActiveTab('stats')}
          >
            {t('admin.tabs.stats')}
          </button>
          <button
            className={`admin-tab ${activeTab === 'config' ? 'active' : ''}`}
            onClick={() => setActiveTab('config')}
          >
            {t('admin.tabs.config')}
          </button>
          <button
            className={`admin-tab ${activeTab === 'audit' ? 'active' : ''}`}
            onClick={() => setActiveTab('audit')}
          >
            {t('admin.tabs.audit')}
          </button>
        </nav>
      </header>

      <main className="admin-content">
        {activeTab === 'users' && <UserManagement />}
        {activeTab === 'stats' && <SystemStats />}
        {activeTab === 'config' && <SystemConfig />}
        {activeTab === 'audit' && <AuditLog />}
      </main>
    </div>
  );
}
