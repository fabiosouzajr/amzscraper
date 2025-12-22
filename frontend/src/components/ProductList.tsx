import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../services/api';
import { Product, Category } from '../types';
import { ASINInput } from './ASINInput';

interface ProductListProps {
  initialCategoryFilter?: string;
  onFilterApplied?: () => void;
}

export function ProductList({ initialCategoryFilter = '', onFilterApplied }: ProductListProps) {
  const { t } = useTranslation();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>(initialCategoryFilter);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<{
    current: number;
    total: number;
    currentASIN?: string;
    status: string;
    success: number;
    failed: number;
    skipped: number;
  } | null>(null);
  const [importResults, setImportResults] = useState<{
    total: number;
    success: number;
    failed: number;
    skipped: number;
  } | null>(null);

  const loadCategories = async () => {
    try {
      const data = await api.getCategories();
      setCategories(data);
    } catch (err) {
      console.error('Failed to load categories:', err);
    }
  };

  const loadProducts = async () => {
    try {
      setLoading(true);
      const data = await api.getProducts(selectedCategory || undefined);
      // Sort products alphabetically by description
      const sorted = [...data].sort((a, b) => 
        a.description.localeCompare(b.description, undefined, { sensitivity: 'base' })
      );
      setProducts(sorted);
      setError(null);
    } catch (err) {
      setError(t('products.failedToLoad'));
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCategories();
    if (initialCategoryFilter) {
      setSelectedCategory(initialCategoryFilter);
      // Clear the initial filter after applying it
      onFilterApplied?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCategoryFilter]);

  useEffect(() => {
    loadProducts();
  }, [selectedCategory]);

  const handleCategoryClick = (categoryName: string) => {
    setSelectedCategory(categoryName);
  };

  const handleCategoryFilterChange = (categoryName: string) => {
    setSelectedCategory(categoryName);
  };

  const handleAddProduct = async (asin: string) => {
    setIsValidating(true);
    setError(null);
    try {
      await api.addProduct(asin);
      await loadProducts();
    } catch (err: any) {
      setError(err.message || t('products.failedToAdd'));
      throw err;
    } finally {
      setIsValidating(false);
    }
  };

  const handleDeleteProduct = async (id: number) => {
    if (!confirm(t('products.confirmDelete'))) {
      return;
    }
    try {
      await api.deleteProduct(id);
      await loadProducts();
    } catch (err) {
      setError(t('products.failedToDelete'));
      console.error(err);
    }
  };

  const handleImportASINs = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    // Validate file type
    if (!file.name.endsWith('.csv') && file.type !== 'text/csv') {
      setError(t('products.invalidFile'));
      event.target.value = ''; // Reset input
      return;
    }

    try {
      setImporting(true);
      setError(null);
      setImportResults(null);
      setImportProgress(null);

      // Read file content
      const fileContent = await file.text();

      // Send to backend and handle streaming response
      const response = await fetch('/api/config/import-asins', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ csvContent: fileContent }),
      });

      // Check if response is streaming (text/event-stream) or regular JSON
      const contentType = response.headers.get('content-type') || '';
      const isStreaming = contentType.includes('text/event-stream');

      if (!isStreaming && !response.ok) {
        // Try to parse error as JSON, fallback to text
        try {
          const errorData = await response.json();
          throw new Error(errorData.error || t('products.failedToImport'));
        } catch {
          throw new Error(t('products.failedToImport'));
        }
      }

      if (!isStreaming) {
        // Fallback to non-streaming response (for backwards compatibility)
        const results = await response.json();
        setImportResults({
          total: results.total,
          success: results.success,
          failed: results.failed,
          skipped: results.skipped,
        });
        await loadProducts();
      } else {
        // Handle streaming response (Server-Sent Events)
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let importCompleted = false;

        if (!reader) {
          throw new Error(t('products.failedToImport'));
        }

        try {
          while (true) {
            const { done, value } = await reader.read();
            
            if (done) {
              break;
            }

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || ''; // Keep incomplete line in buffer

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                try {
                  const data = JSON.parse(line.slice(6));
                  setImportProgress(data);

                  if (data.status === 'completed' || data.status === 'error') {
                    if (data.status === 'completed') {
                      setImportResults({
                        total: data.total,
                        success: data.success,
                        failed: data.failed,
                        skipped: data.skipped,
                      });
                      importCompleted = true;
                      // Reload products to show newly imported ones
                      await loadProducts();
                    } else if (data.status === 'error') {
                      throw new Error(data.error || t('products.failedToImport'));
                    }
                  }
                } catch (parseError) {
                  // If it's an error status, rethrow; otherwise just log parse errors
                  if (line.includes('"status":"error"')) {
                    try {
                      const errorData = JSON.parse(line.slice(6));
                      throw new Error(errorData.error || t('products.failedToImport'));
                    } catch {
                      console.error('Error parsing progress data:', parseError);
                    }
                  } else {
                    console.error('Error parsing progress data:', parseError);
                  }
                }
              }
            }
          }
        } finally {
          reader.releaseLock();
        }

        if (!importCompleted && !importProgress) {
          throw new Error(t('products.failedToImport'));
        }
      }

      // Clear file input
      event.target.value = '';
    } catch (err: any) {
      setError(err.message || t('products.failedToImport'));
      console.error(err);
    } finally {
      setImporting(false);
      setImportProgress(null);
    }
  };

  if (loading) {
    return <div className="loading">{t('products.loading')}</div>;
  }

  return (
    <div className="product-list">
      <div className="product-list-header">
        <h2>{t('products.title')}</h2>
        <div className="import-section">
          <label htmlFor="import-file" className="import-button">
            {importing ? t('products.importing') : t('products.importASINs')}
          </label>
          <input
            id="import-file"
            type="file"
            accept=".csv"
            onChange={handleImportASINs}
            disabled={importing}
            style={{ display: 'none' }}
          />
          {importProgress && (
            <div className="import-progress-container">
              <div className="progress-bar-wrapper">
                <div 
                  className="progress-bar" 
                  style={{ 
                    width: `${(importProgress.current / importProgress.total) * 100}%` 
                  }}
                />
              </div>
              <div className="progress-status">
                {importProgress.status === 'starting' && t('products.importStarting')}
                {importProgress.status === 'processing' && (
                  <>
                    {t('products.importProcessing', { 
                      current: importProgress.current, 
                      total: importProgress.total 
                    })}
                    {importProgress.currentASIN && (
                      <span className="current-asin"> ({importProgress.currentASIN})</span>
                    )}
                  </>
                )}
                {importProgress.status === 'completed' && t('products.importCompleted')}
                {importProgress.status === 'error' && t('products.importError')}
              </div>
              <div className="progress-stats">
                <span className="progress-stat success">
                  {t('products.importSuccess')}: {importProgress.success}
                </span>
                <span className="progress-stat skipped">
                  {t('products.importSkipped')}: {importProgress.skipped}
                </span>
                <span className="progress-stat failed">
                  {t('products.importFailed')}: {importProgress.failed}
                </span>
              </div>
            </div>
          )}
          {importResults && !importing && (
            <div className="import-results">
              <span className="import-result-item">{t('products.importTotal')}: {importResults.total}</span>
              <span className="import-result-item success">{t('products.importSuccess')}: {importResults.success}</span>
              <span className="import-result-item skipped">{t('products.importSkipped')}: {importResults.skipped}</span>
              <span className="import-result-item failed">{t('products.importFailed')}: {importResults.failed}</span>
            </div>
          )}
        </div>
      </div>
      
      <div className="add-product-section">
        <h3>{t('products.addNew')}</h3>
        <ASINInput onAdd={handleAddProduct} isValidating={isValidating} error={error} />
      </div>

      <div className="products-section">
        <div className="products-section-header">
          <h3>{t('products.trackedProducts')} ({products.length})</h3>
          <div className="category-filter">
            <label htmlFor="category-filter">{t('products.filterByCategory')}:</label>
            <select
              id="category-filter"
              value={selectedCategory}
              onChange={(e) => handleCategoryFilterChange(e.target.value)}
              className="category-select"
            >
              <option value="">{t('products.allCategories')}</option>
              {categories.map((category) => (
                <option key={category.id} value={category.name}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        {products.length === 0 ? (
          <p className="empty-state">{t('products.noProducts')}</p>
        ) : (
          <div className="products-list">
            {products.map((product) => (
              <div key={product.id} className="product-list-item">
                <div className="product-info">
                  {product.categories && product.categories.length > 0 && (
                    <div className="product-categories">
                      {product.categories.map((cat, idx) => (
                        <span key={cat.id}>
                          <button
                            className="category-badge category-filter-button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handleCategoryClick(cat.name);
                            }}
                            title={t('dashboard.filterBy', { category: cat.name })}
                          >
                            {cat.name}
                          </button>
                          {idx < product.categories!.length - 1 && ' > '}
                        </span>
                      ))}
                    </div>
                  )}
                  <a
                    href={`https://www.amazon.com.br/dp/${product.asin}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="product-description product-link"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {product.description}
                  </a>
                  <div className="product-asin">{product.asin}</div>
                  <div className="product-date">
                    {t('products.added')}: {new Date(product.created_at).toLocaleDateString()}
                  </div>
                </div>
                <div className="product-actions">
                  <button
                    className="delete-button"
                    onClick={() => handleDeleteProduct(product.id)}
                  >
                    {t('products.remove')}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

