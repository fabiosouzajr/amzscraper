import { useTranslation } from 'react-i18next';

interface DatabaseInfo {
  productCount: number;
  databaseSize: number;
  databaseSizeFormatted: string;
}

interface Props {
  dbInfo: DatabaseInfo | null;
  loadingDbInfo: boolean;
  onSectionChange: (section: string) => void;
}

export function DashboardSection({ dbInfo, loadingDbInfo, onSectionChange }: Props) {
  const { t } = useTranslation();

  return (
    <div className="config-dashboard">
      <h3>{t('config.dashboard')}</h3>
      <div className="dashboard-grid">
        <div className="dashboard-card">
          <div className="dashboard-card-header">
            <h4>{t('config.database')}</h4>
          </div>
          <div className="dashboard-card-content">
            {loadingDbInfo ? (
              <p className="config-description">{t('config.loadingInfo')}</p>
            ) : dbInfo ? (
              <>
                <div className="dashboard-stat">
                  <span className="stat-label">{t('config.totalProducts')}</span>
                  <span className="stat-value">{dbInfo.productCount}</span>
                </div>
                <div className="dashboard-stat">
                  <span className="stat-label">{t('config.databaseSize')}</span>
                  <span className="stat-value">{dbInfo.databaseSizeFormatted}</span>
                </div>
              </>
            ) : (
              <p className="config-description">{t('config.unableToLoad')}</p>
            )}
          </div>
          <div className="dashboard-card-actions">
            <button onClick={() => onSectionChange('database')} className="dashboard-action-button">
              {t('config.viewDetails')}
            </button>
          </div>
        </div>

        <div className="dashboard-card">
          <div className="dashboard-card-header">
            <h4>{t('config.dataExport')}</h4>
          </div>
          <div className="dashboard-card-content">
            <p className="config-description">{t('config.exportDescription')}</p>
          </div>
          <div className="dashboard-card-actions">
            <button onClick={() => onSectionChange('data-export')} className="dashboard-action-button">
              {t('config.exportData')}
            </button>
          </div>
        </div>

        <div className="dashboard-card">
          <div className="dashboard-card-header">
            <h4>{t('config.account')}</h4>
          </div>
          <div className="dashboard-card-content">
            <p className="config-description">{t('config.accountDescription')}</p>
          </div>
          <div className="dashboard-card-actions">
            <button onClick={() => onSectionChange('account')} className="dashboard-action-button">
              {t('config.manageAccount')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
