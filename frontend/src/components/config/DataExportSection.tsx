import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './Config.module.css';

export function DataExportSection() {
  const { t } = useTranslation();
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleExportASINs = async () => {
    try {
      setExporting(true);
      setError(null);

      const token = localStorage.getItem('authToken');
      const response = await fetch('/api/config/export-asins', {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {},
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || t('config.failedToExport'));
      }

      const contentDisposition = response.headers.get('Content-Disposition');
      const filename = contentDisposition
        ? contentDisposition.split('filename=')[1]?.replace(/"/g, '')
        : `amazon-tracked-asins-${new Date().toISOString().split('T')[0]}.csv`;

      const csvContent = await response.text();
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setError(err.message || t('config.failedToExport'));
      console.error('Export error:', err);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div id="data-export" className={styles.configSection}>
      <h3>{t('config.dataExport')}</h3>
      <div className={styles.configActions}>
        <button onClick={handleExportASINs} disabled={exporting} className={styles.exportButton}>
          {exporting ? t('config.exportingASINs') : t('config.exportASINs')}
        </button>
        <p className={styles.configDescription}>{t('config.exportASINsDescription')}</p>
      </div>
      {error && <div className="error-message">{error}</div>}
    </div>
  );
}
