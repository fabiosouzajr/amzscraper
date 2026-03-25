import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { api } from '../services/api';
import { User, Database, Download, Bell, Users, BarChart, Settings as SettingsIcon, FileText } from 'lucide-react';
import { Notifications } from './Notifications';
import { DatabaseSection } from './config/DatabaseSection';
import { DataExportSection } from './config/DataExportSection';
import { AccountSection } from './config/AccountSection';
import { UserManagement } from './admin/UserManagement';
import { SystemStats } from './admin/SystemStats';
import { SystemConfig } from './admin/SystemConfig';
import { AuditLog } from './admin/AuditLog';
import { AdminNotifications } from './admin/Notifications';

interface DatabaseInfo {
  productCount: number;
  databaseSize: number;
  databaseSizeFormatted: string;
}

interface Section {
  id: string;
  labelKey: string;
  icon: React.ComponentType<{ size?: string | number }>;
}

// User sections (shown to everyone)
const USER_SECTIONS: Section[] = [
  { id: 'account', labelKey: 'config.account', icon: User },
  { id: 'database', labelKey: 'config.database', icon: Database },
  { id: 'data-export', labelKey: 'config.dataExport', icon: Download },
  { id: 'notifications', labelKey: 'config.notifications', icon: Bell },
];

// Admin-only sections (shown to ADMIN only)
const ADMIN_SECTIONS: Section[] = [
  { id: 'users', labelKey: 'admin.tabs.users', icon: Users },
  { id: 'stats', labelKey: 'admin.tabs.stats', icon: BarChart },
  { id: 'config', labelKey: 'admin.tabs.config', icon: SettingsIcon },
  { id: 'audit', labelKey: 'admin.tabs.audit', icon: FileText },
  { id: 'admin-notifications', labelKey: 'admin.tabs.notifications', icon: Bell },
];

export function SettingsPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const isMobile = useMediaQuery('(max-width: 767px)');

  const isAdmin = user && user.role === 'ADMIN';
  const sections = isAdmin ? [...USER_SECTIONS, ...ADMIN_SECTIONS] : USER_SECTIONS;

  const [activeSection, setActiveSection] = useState<string>('account');
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [pendingSection, setPendingSection] = useState<string | null>(null);
  const [dbInfo, setDbInfo] = useState<DatabaseInfo | null>(null);
  const [loadingDbInfo, setLoadingDbInfo] = useState(true);
  const [dbError, setDbError] = useState<string | null>(null);

  useEffect(() => {
    loadDatabaseInfo();
  }, []);

  const loadDatabaseInfo = async () => {
    try {
      setLoadingDbInfo(true);
      const info = await api.getDatabaseInfo();
      setDbInfo(info);
    } catch (err: any) {
      console.error('Failed to load database info:', err);
      setDbError(err.message || t('config.failedToLoad'));
    } finally {
      setLoadingDbInfo(false);
    }
  };

  const handleSectionChange = (sectionId: string) => {
    if (hasUnsavedChanges && activeSection === 'account') {
      setPendingSection(sectionId);
      setShowConfirmDialog(true);
    } else {
      setActiveSection(sectionId);
    }
  };

  const handleConfirmNavigation = () => {
    if (pendingSection) {
      setActiveSection(pendingSection);
      setHasUnsavedChanges(false);
    }
    setShowConfirmDialog(false);
    setPendingSection(null);
  };

  const handleCancelNavigation = () => {
    setShowConfirmDialog(false);
    setPendingSection(null);
  };

  return (
    <div className="settings-page">
      <h2>{t('config.title')}</h2>

      <div className="settings-layout">
        {/* Navigation sidebar (desktop) or tab bar (mobile) */}
        <div className="settings-sidebar">
          <nav className="settings-nav">
            {sections.map(({ id, labelKey, icon: Icon }) => (
              <button
                key={id}
                onClick={() => handleSectionChange(id)}
                className={`settings-nav-item ${activeSection === id ? 'active' : ''}`}
              >
                <Icon size={isMobile ? 16 : 18} />
                <span>{t(labelKey)}</span>
              </button>
            ))}
          </nav>
        </div>

        {/* Content area */}
        <div className="settings-content">
          {/* Account Section */}
          {activeSection === 'account' && (
            <AccountSection onUnsavedChangesChange={setHasUnsavedChanges} />
          )}

          {/* Database Section */}
          {activeSection === 'database' && (
            <DatabaseSection dbInfo={dbInfo} loadingDbInfo={loadingDbInfo} />
          )}

          {/* Data Export Section */}
          {activeSection === 'data-export' && <DataExportSection />}

          {/* Notifications Section */}
          {activeSection === 'notifications' && (
            <div id="notifications" className="settings-section">
              <Notifications />
            </div>
          )}

          {/* Admin: User Management */}
          {activeSection === 'users' && <UserManagement />}

          {/* Admin: System Stats */}
          {activeSection === 'stats' && <SystemStats />}

          {/* Admin: System Config */}
          {activeSection === 'config' && <SystemConfig />}

          {/* Admin: Audit Log */}
          {activeSection === 'audit' && <AuditLog />}

          {/* Admin: Admin Notifications */}
          {activeSection === 'admin-notifications' && <AdminNotifications />}

          {dbError && activeSection === 'account' && (
            <div className="error-message">{dbError}</div>
          )}
        </div>
      </div>

      {/* Confirmation dialog for unsaved changes */}
      {showConfirmDialog && (
        <div className="confirm-dialog-overlay">
          <div className="confirm-dialog">
            <h3>{t('config.unsavedChanges')}</h3>
            <p>{t('config.unsavedChangesMessage')}</p>
            <div className="confirm-dialog-actions">
              <button onClick={handleCancelNavigation} className="confirm-dialog-button cancel">
                {t('config.cancel')}
              </button>
              <button onClick={handleConfirmNavigation} className="confirm-dialog-button confirm">
                {t('config.discardChanges')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
