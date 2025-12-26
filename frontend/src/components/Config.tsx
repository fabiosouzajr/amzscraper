import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../services/api';

interface DatabaseInfo {
  productCount: number;
  databaseSize: number;
  databaseSizeFormatted: string;
}

export function Config() {
  const { t } = useTranslation();
  const [exporting, setExporting] = useState(false);
  const [exportingDb, setExportingDb] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dbInfo, setDbInfo] = useState<DatabaseInfo | null>(null);
  const [loadingDbInfo, setLoadingDbInfo] = useState(true);
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });

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
      setError(err.message || t('config.failedToLoad'));
    } finally {
      setLoadingDbInfo(false);
    }
  };

  const handleExportASINs = async () => {
    try {
      setExporting(true);
      setError(null);
      
      const response = await fetch('/api/config/export-asins');
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || t('config.failedToExport'));
      }
      
      // Get the filename from Content-Disposition header or use default
      const contentDisposition = response.headers.get('Content-Disposition');
      const filename = contentDisposition 
        ? contentDisposition.split('filename=')[1]?.replace(/"/g, '') 
        : `amazon-tracked-asins-${new Date().toISOString().split('T')[0]}.csv`;
      
      // Get the CSV content
      const csvContent = await response.text();
      
      // Create a blob and download
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

  const handleExportDatabase = async () => {
    try {
      setExportingDb(true);
      setError(null);
      
      const blob = await api.exportDatabase();
      const filename = `products-database-${new Date().toISOString().split('T')[0]}.db`;
      
      // Create download link
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

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setPasswordSuccess(null);

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setError(t('config.passwordMismatch'));
      return;
    }

    if (passwordForm.newPassword.length < 6) {
      setError(t('config.passwordTooShort'));
      return;
    }

    try {
      setChangingPassword(true);
      await api.changePassword(passwordForm.currentPassword, passwordForm.newPassword);
      setPasswordSuccess(t('config.passwordChanged'));
      setPasswordForm({
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
      });
      // Clear success message after 5 seconds
      setTimeout(() => {
        setPasswordSuccess(null);
      }, 5000);
    } catch (err: any) {
      setError(err.message || t('config.failedToChangePassword'));
    } finally {
      setChangingPassword(false);
    }
  };

  return (
    <div className="config-page">
      <h2>{t('config.title')}</h2>
      
      <div className="config-section">
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
          <p className="config-description">
            {t('config.exportDatabaseDescription')}
          </p>
        </div>
      </div>

      <div className="config-section">
        <h3>{t('config.dataExport')}</h3>
        <div className="config-actions">
          <button
            onClick={handleExportASINs}
            disabled={exporting}
            className="export-button"
          >
            {exporting ? t('config.exportingASINs') : t('config.exportASINs')}
          </button>
          <p className="config-description">
            {t('config.exportASINsDescription')}
          </p>
        </div>
      </div>

      <div className="config-section">
        <h3>{t('config.account')}</h3>
        <form onSubmit={handleChangePassword} className="password-change-form">
          <div className="form-group">
            <label htmlFor="currentPassword">{t('config.currentPassword')}</label>
            <input
              type="password"
              id="currentPassword"
              value={passwordForm.currentPassword}
              onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })}
              required
              disabled={changingPassword}
            />
          </div>
          <div className="form-group">
            <label htmlFor="newPassword">{t('config.newPassword')}</label>
            <input
              type="password"
              id="newPassword"
              value={passwordForm.newPassword}
              onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
              required
              minLength={6}
              disabled={changingPassword}
            />
          </div>
          <div className="form-group">
            <label htmlFor="confirmPassword">{t('config.confirmPassword')}</label>
            <input
              type="password"
              id="confirmPassword"
              value={passwordForm.confirmPassword}
              onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
              required
              minLength={6}
              disabled={changingPassword}
            />
          </div>
          <button
            type="submit"
            disabled={changingPassword}
            className="change-password-button"
          >
            {changingPassword ? t('config.changingPassword') : t('config.changePassword')}
          </button>
          {passwordSuccess && <div className="success-message">{passwordSuccess}</div>}
        </form>
      </div>

      {error && <div className="error-message">{error}</div>}
    </div>
  );
}
