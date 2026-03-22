import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../services/api';
import { Notifications } from '../Notifications';
import { DashboardSection } from './DashboardSection';
import { DatabaseSection } from './DatabaseSection';
import { DataExportSection } from './DataExportSection';
import { AccountSection } from './AccountSection';

interface DatabaseInfo {
  productCount: number;
  databaseSize: number;
  databaseSizeFormatted: string;
}

const NAV_SECTIONS = [
  { id: 'dashboard', labelKey: 'config.dashboard' },
  { id: 'database', labelKey: 'config.database' },
  { id: 'data-export', labelKey: 'config.dataExport' },
  { id: 'notifications', labelKey: 'config.notifications' },
  { id: 'account', labelKey: 'config.account' },
] as const;

export function Config() {
  const { t } = useTranslation();
  const [activeSection, setActiveSection] = useState<string>('dashboard');
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
    <div className="config-page">
      <h2>{t('config.title')}</h2>

      <div className="config-layout">
        <div className="config-sidebar">
          <nav className="config-nav">
            {NAV_SECTIONS.map(({ id, labelKey }) => (
              <button
                key={id}
                onClick={() => handleSectionChange(id)}
                className={`config-nav-link ${activeSection === id ? 'active' : ''}`}
              >
                {t(labelKey)}
              </button>
            ))}
          </nav>
        </div>

        <div className="config-content">
          {activeSection === 'dashboard' && (
            <DashboardSection
              dbInfo={dbInfo}
              loadingDbInfo={loadingDbInfo}
              onSectionChange={handleSectionChange}
            />
          )}
          {activeSection === 'database' && (
            <DatabaseSection dbInfo={dbInfo} loadingDbInfo={loadingDbInfo} />
          )}
          {activeSection === 'data-export' && <DataExportSection />}
          {activeSection === 'notifications' && (
            <div id="notifications" className="config-section">
              <Notifications />
            </div>
          )}
          {activeSection === 'account' && (
            <AccountSection onUnsavedChangesChange={setHasUnsavedChanges} />
          )}
          {dbError && activeSection === 'dashboard' && (
            <div className="error-message">{dbError}</div>
          )}
        </div>
      </div>

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
