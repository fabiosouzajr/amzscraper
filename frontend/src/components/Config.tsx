import { useState, useEffect } from 'react';
import { api } from '../services/api';

interface DatabaseInfo {
  productCount: number;
  databaseSize: number;
  databaseSizeFormatted: string;
}

export function Config() {
  const [exporting, setExporting] = useState(false);
  const [exportingDb, setExportingDb] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dbInfo, setDbInfo] = useState<DatabaseInfo | null>(null);
  const [loadingDbInfo, setLoadingDbInfo] = useState(true);

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
      setError(err.message || 'Failed to load database information');
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
        throw new Error(errorData.error || 'Failed to export ASINs');
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
      setError(err.message || 'Failed to export ASINs');
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
      setError(err.message || 'Failed to export database');
      console.error('Database export error:', err);
    } finally {
      setExportingDb(false);
    }
  };

  return (
    <div className="config-page">
      <h2>Configuration</h2>
      
      <div className="config-section">
        <h3>Database</h3>
        <div className="database-info">
          {loadingDbInfo ? (
            <p className="config-description">Loading database information...</p>
          ) : dbInfo ? (
            <>
              <div className="database-stat">
                <span className="stat-label">Total Products:</span>
                <span className="stat-value">{dbInfo.productCount}</span>
              </div>
              <div className="database-stat">
                <span className="stat-label">Database Size:</span>
                <span className="stat-value">{dbInfo.databaseSizeFormatted}</span>
              </div>
            </>
          ) : (
            <p className="config-description">Unable to load database information</p>
          )}
        </div>
        <div className="config-actions">
          <button
            onClick={handleExportDatabase}
            disabled={exportingDb || loadingDbInfo}
            className="export-button"
          >
            {exportingDb ? 'Exporting...' : 'Export Database'}
          </button>
          <p className="config-description">
            Export the complete SQLite database file containing all products, categories, and price history.
          </p>
        </div>
      </div>

      <div className="config-section">
        <h3>Data Export</h3>
        <div className="config-actions">
          <button
            onClick={handleExportASINs}
            disabled={exporting}
            className="export-button"
          >
            {exporting ? 'Exporting...' : 'Export ASINs'}
          </button>
          <p className="config-description">
            Export all tracked ASINs to a CSV file with a single column containing only the ASINs.
          </p>
        </div>
      </div>

      {error && <div className="error-message">{error}</div>}
    </div>
  );
}
