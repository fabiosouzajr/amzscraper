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

      // Read file content
      const fileContent = await file.text();

      // Send to backend
      const response = await fetch('/api/config/import-asins', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ csvContent: fileContent }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || t('products.failedToImport'));
      }

      const results = await response.json();
      setImportResults({
        total: results.total,
        success: results.success,
        failed: results.failed,
        skipped: results.skipped,
      });

      // Reload products to show newly imported ones
      await loadProducts();

      // Clear file input
      event.target.value = '';
    } catch (err: any) {
      setError(err.message || t('products.failedToImport'));
      console.error(err);
    } finally {
      setImporting(false);
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
          {importResults && (
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
                  <div className="product-description">
                    {product.description}
                  </div>
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

