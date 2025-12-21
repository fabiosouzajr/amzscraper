import { useState, useEffect } from 'react';
import { api } from '../services/api';
import { Product, Category } from '../types';
import { ASINInput } from './ASINInput';

interface ProductListProps {
  initialCategoryFilter?: string;
  onFilterApplied?: () => void;
}

export function ProductList({ initialCategoryFilter = '', onFilterApplied }: ProductListProps) {
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
      setError('Failed to load products');
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
      setError(err.message || 'Failed to add product');
      throw err;
    } finally {
      setIsValidating(false);
    }
  };

  const handleDeleteProduct = async (id: number) => {
    if (!confirm('Are you sure you want to remove this product?')) {
      return;
    }
    try {
      await api.deleteProduct(id);
      await loadProducts();
    } catch (err) {
      setError('Failed to delete product');
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
      setError('Please select a CSV file');
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
        throw new Error(errorData.error || 'Failed to import ASINs');
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
      setError(err.message || 'Failed to import ASINs');
      console.error(err);
    } finally {
      setImporting(false);
    }
  };

  if (loading) {
    return <div className="loading">Loading products...</div>;
  }

  return (
    <div className="product-list">
      <div className="product-list-header">
        <h2>Manage Products</h2>
        <div className="import-section">
          <label htmlFor="import-file" className="import-button">
            {importing ? 'Importing...' : 'Import ASINs'}
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
              <span className="import-result-item">Total: {importResults.total}</span>
              <span className="import-result-item success">Success: {importResults.success}</span>
              <span className="import-result-item skipped">Skipped: {importResults.skipped}</span>
              <span className="import-result-item failed">Failed: {importResults.failed}</span>
            </div>
          )}
        </div>
      </div>
      
      <div className="add-product-section">
        <h3>Add New Product</h3>
        <ASINInput onAdd={handleAddProduct} isValidating={isValidating} error={error} />
      </div>

      <div className="products-section">
        <div className="products-section-header">
          <h3>Tracked Products ({products.length})</h3>
          <div className="category-filter">
            <label htmlFor="category-filter">Filter by Category:</label>
            <select
              id="category-filter"
              value={selectedCategory}
              onChange={(e) => handleCategoryFilterChange(e.target.value)}
              className="category-select"
            >
              <option value="">All Categories</option>
              {categories.map((category) => (
                <option key={category.id} value={category.name}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        {products.length === 0 ? (
          <p className="empty-state">No products tracked yet. Add an ASIN above to get started.</p>
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
                            title={`Filter by ${cat.name}`}
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
                    Added: {new Date(product.created_at).toLocaleDateString()}
                  </div>
                </div>
                <div className="product-actions">
                  <button
                    className="delete-button"
                    onClick={() => handleDeleteProduct(product.id)}
                  >
                    Remove
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

