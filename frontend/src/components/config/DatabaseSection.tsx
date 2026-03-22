import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../services/api';

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
    <div id="database" className="config-section">
      <h3>{t('config.database')}</h3>
      <div className="database-info">
        {loadingDbInfo ? (
          <p className="config-description">{t('config.loadingInfo')}</p>
        ) : dbInfo ? (
          <>
            <div className="database-stat">
              <span className="stat-label">{t('config.totalProducts')}</span>
              <span className="stat-value">{dbInfo.productCount}</span>
            </div>
            <div className="database-stat">
              <span className="stat-label">{t('config.databaseSize')}</span>
              <span className="stat-value">{dbInfo.databaseSizeFormatted}</span>
            </div>
          </>
        ) : (
          <p className="config-description">{t('config.unableToLoad')}</p>
        )}
      </div>
      <div className="config-actions">
        <button
          onClick={handleExportDatabase}
          disabled={exportingDb || loadingDbInfo}
          className="export-button"
        >
          {exportingDb ? t('config.exportingDatabase') : t('config.exportDatabase')}
        </button>
        <p className="config-description">{t('config.exportDatabaseDescription')}</p>
      </div>
      {error && <div className="error-message">{error}</div>}
    </div>
  );
}
