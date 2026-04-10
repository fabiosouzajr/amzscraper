import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { UserManagement } from './admin/UserManagement';
import { SystemStats } from './admin/SystemStats';
import { SystemConfig } from './admin/SystemConfig';
import { AuditLog } from './admin/AuditLog';
import { AdminNotifications } from './admin/Notifications';
import styles from './AdminPanel.module.css';

type AdminTab = 'users' | 'stats' | 'config' | 'audit' | 'notifications';

export function AdminPanel() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<AdminTab>('users');

  if (!user || user.role !== 'ADMIN') {
    return <div>{t('admin.accessDenied')}</div>;
  }

  return (
    <div className={styles.adminPanel}>
      <header className={styles.adminHeader}>
        <h1>{t('admin.title')}</h1>
        <nav className={styles.adminTabs}>
          <button
            className={`${styles.adminTab} ${activeTab === 'users' ? styles.active : ''}`}
            onClick={() => setActiveTab('users')}
          >
            {t('admin.tabs.users')}
          </button>
          <button
            className={`${styles.adminTab} ${activeTab === 'stats' ? styles.active : ''}`}
            onClick={() => setActiveTab('stats')}
          >
            {t('admin.tabs.stats')}
          </button>
          <button
            className={`${styles.adminTab} ${activeTab === 'config' ? styles.active : ''}`}
            onClick={() => setActiveTab('config')}
          >
            {t('admin.tabs.config')}
          </button>
          <button
            className={`${styles.adminTab} ${activeTab === 'audit' ? styles.active : ''}`}
            onClick={() => setActiveTab('audit')}
          >
            {t('admin.tabs.audit')}
          </button>
          <button
            className={`${styles.adminTab} ${activeTab === 'notifications' ? styles.active : ''}`}
            onClick={() => setActiveTab('notifications')}
          >
            {t('admin.tabs.notifications')}
          </button>
        </nav>
      </header>

      <main className={styles.adminContent}>
        {activeTab === 'users' && <UserManagement />}
        {activeTab === 'stats' && <SystemStats />}
        {activeTab === 'config' && <SystemConfig />}
        {activeTab === 'audit' && <AuditLog />}
        {activeTab === 'notifications' && <AdminNotifications />}
      </main>
    </div>
  );
}
