import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../services/api';
import styles from './Config.module.css';

interface DatabaseInfo {
  productCount: number;
  databaseSize: number;
  databaseSizeFormatted: string;
}

interface Props {
  dbInfo: DatabaseInfo | null;
  loadingDbInfo: boolean;
}

export function DatabaseSection({ dbInfo, loadingDbInfo }: Props) {
  const { t } = useTranslation();
  const [exportingDb, setExportingDb] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleExportDatabase = async () => {
    try {
      setExportingDb(true);
      setError(null);

      const blob = await api.exportDatabase();
      const filename = `products-database-${new Date().toISOString().split('T')[0]}.db`;

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setError(err.message || t('config.failedToExportDatabase'));
      console.error('Database export error:', err);
    } finally {
      setExportingDb(false);
    }
  };

  return (
    <div id="database" className={styles.configSection}>
      <h3>{t('config.database')}</h3>
      <div className={styles.databaseInfo}>
        {loadingDbInfo ? (
          <p className={styles.configDescription}>{t('config.loadingInfo')}</p>
        ) : dbInfo ? (
          <>
            <div className={styles.databaseStat}>
              <span className={styles.statLabel}>{t('config.totalProducts')}</span>
              <span className="stat-value">{dbInfo.productCount}</span>
            </div>
            <div className={styles.databaseStat}>
              <span className={styles.statLabel}>{t('config.databaseSize')}</span>
              <span className="stat-value">{dbInfo.databaseSizeFormatted}</span>
            </div>
          </>
        ) : (
          <p className={styles.configDescription}>{t('config.unableToLoad')}</p>
        )}
      </div>
      <div className={styles.configActions}>
        <button
          onClick={handleExportDatabase}
          disabled={exportingDb || loadingDbInfo}
          className={styles.exportButton}
        >
          {exportingDb ? t('config.exportingDatabase') : t('config.exportDatabase')}
        </button>
        <p className={styles.configDescription}>{t('config.exportDatabaseDescription')}</p>
      </div>
      {error && <div className="error-message">{error}</div>}
    </div>
  );
}
