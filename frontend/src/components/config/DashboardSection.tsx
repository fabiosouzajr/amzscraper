import { useTranslation } from 'react-i18next';
import styles from './Config.module.css';

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
    <div className={styles.configDashboard}>
      <h3>{t('config.dashboard')}</h3>
      <div className={styles.dashboardGrid}>
        <div className={styles.dashboardCard}>
          <div className={styles.dashboardCardHeader}>
            <h4>{t('config.database')}</h4>
          </div>
          <div className={styles.dashboardCardContent}>
            {loadingDbInfo ? (
              <p className={styles.configDescription}>{t('config.loadingInfo')}</p>
            ) : dbInfo ? (
              <>
                <div className={styles.dashboardStat}>
                  <span className={styles.statLabel}>{t('config.totalProducts')}</span>
                  <span className="stat-value">{dbInfo.productCount}</span>
                </div>
                <div className={styles.dashboardStat}>
                  <span className={styles.statLabel}>{t('config.databaseSize')}</span>
                  <span className="stat-value">{dbInfo.databaseSizeFormatted}</span>
                </div>
              </>
            ) : (
              <p className={styles.configDescription}>{t('config.unableToLoad')}</p>
            )}
          </div>
          <div className={styles.dashboardCardActions}>
            <button onClick={() => onSectionChange('database')} className={styles.dashboardActionButton}>
              {t('config.viewDetails')}
            </button>
          </div>
        </div>

        <div className={styles.dashboardCard}>
          <div className={styles.dashboardCardHeader}>
            <h4>{t('config.dataExport')}</h4>
          </div>
          <div className={styles.dashboardCardContent}>
            <p className={styles.configDescription}>{t('config.exportDescription')}</p>
          </div>
          <div className={styles.dashboardCardActions}>
            <button onClick={() => onSectionChange('data-export')} className={styles.dashboardActionButton}>
              {t('config.exportData')}
            </button>
          </div>
        </div>

        <div className={styles.dashboardCard}>
          <div className={styles.dashboardCardHeader}>
            <h4>{t('config.account')}</h4>
          </div>
          <div className={styles.dashboardCardContent}>
            <p className={styles.configDescription}>{t('config.accountDescription')}</p>
          </div>
          <div className={styles.dashboardCardActions}>
            <button onClick={() => onSectionChange('account')} className={styles.dashboardActionButton}>
              {t('config.manageAccount')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
