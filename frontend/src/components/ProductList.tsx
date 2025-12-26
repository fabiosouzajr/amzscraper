import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../services/api';
import { Product, Category, UserList } from '../types';
import { ASINInput } from './ASINInput';
import { ListsSidebar } from './ListsSidebar';
import { formatDate } from '../utils/dateFormat';
import { useAuth } from '../contexts/AuthContext';

interface ProductListProps {
  initialCategoryFilter?: string;
  onFilterApplied?: () => void;
}

export function ProductList({ initialCategoryFilter = '', onFilterApplied }: ProductListProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>(initialCategoryFilter);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [selectedListId, setSelectedListId] = useState<number | null>(null);
  const [lists, setLists] = useState<UserList[]>([]);
  const [addingToListProductId, setAddingToListProductId] = useState<number | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(20);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const dropdownRefs = useRef<{ [key: number]: HTMLDivElement | null }>({});
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

  const loadLists = async () => {
    if (!user) return;
    try {
      const data = await api.getLists();
      setLists(data);
    } catch (err) {
      console.error('Failed to load lists:', err);
    }
  };

  const loadProducts = async (page: number = currentPage) => {
    try {
      setLoading(true);
      const response = await api.getProducts(selectedCategory || undefined, page, pageSize);
      // Sort products alphabetically by description
      const sorted = [...response.products].sort((a, b) => 
        a.description.localeCompare(b.description, undefined, { sensitivity: 'base' })
      );
      setProducts(sorted);
      setTotalPages(response.pagination.totalPages);
      setTotalCount(response.pagination.totalCount);
      setCurrentPage(response.pagination.page);
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
    if (user) {
      loadLists();
    }
    if (initialCategoryFilter) {
      setSelectedCategory(initialCategoryFilter);
      // Clear the initial filter after applying it
      onFilterApplied?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCategoryFilter, user]);

  useEffect(() => {
    setCurrentPage(1); // Reset to first page when category changes
    loadProducts(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCategory]);

  // Adjust dropdown position to stay in viewport
  const adjustDropdownPosition = (productId: number) => {
    const dropdown = dropdownRefs.current[productId];
    if (!dropdown) return;

    // Get button position to calculate dropdown position
    const container = dropdown.parentElement;
    if (!container) return;

    const button = container.querySelector('.add-to-list-button') as HTMLElement;
    if (!button) return;

    const buttonRect = button.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    
    // Calculate available space
    const spaceBelow = viewportHeight - buttonRect.bottom;
    const spaceAbove = buttonRect.top;
    const estimatedDropdownHeight = Math.min(300, lists.length * 50 + 20); // Estimate based on list count
    
    // If not enough space below but enough above, flip upward
    if (spaceBelow < estimatedDropdownHeight && spaceAbove > estimatedDropdownHeight) {
      dropdown.classList.add('dropdown-up');
      // Adjust max-height to fit available space above
      const maxHeight = Math.min(300, spaceAbove - 20);
      dropdown.style.maxHeight = `${maxHeight}px`;
    } else {
      dropdown.classList.remove('dropdown-up');
      // Adjust max-height to fit available space below
      const maxHeight = Math.min(300, spaceBelow - 20);
      dropdown.style.maxHeight = `${maxHeight}px`;
    }
  };

  // Adjust dropdown positions when window is resized or scrolled
  useEffect(() => {
    const handleResize = () => {
      if (addingToListProductId !== null) {
        adjustDropdownPosition(addingToListProductId);
      }
    };

    const handleScroll = () => {
      if (addingToListProductId !== null) {
        adjustDropdownPosition(addingToListProductId);
      }
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('scroll', handleScroll, true);
    
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [addingToListProductId]);

  const handleCategoryClick = (categoryName: string) => {
    setSelectedCategory(categoryName);
  };

  const handleCategoryFilterChange = (categoryName: string) => {
    setSelectedCategory(categoryName);
  };

  const handleAddProduct = async (asin: string) => {
    setIsValidating(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const product = await api.addProduct(asin);
      setSuccessMessage(t('products.addedSuccessfully', { name: product.description || asin }));
      // Reload first page to show the new product (new products appear at the top)
      setCurrentPage(1);
      await loadProducts(1);
      // Clear success message after 5 seconds
      setTimeout(() => {
        setSuccessMessage(null);
      }, 5000);
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
      // If we're on a page that might be empty after deletion, go to previous page
      const currentProductsOnPage = filteredProducts.length;
      if (currentProductsOnPage === 1 && currentPage > 1) {
        const newPage = currentPage - 1;
        setCurrentPage(newPage);
        await loadProducts(newPage);
      } else {
        await loadProducts(currentPage);
      }
    } catch (err) {
      setError(t('products.failedToDelete'));
      console.error(err);
    }
  };

  const handleListClick = (listId: number | null) => {
    setSelectedListId(listId);
  };

  const handleAddToList = async (productId: number, listId: number) => {
    try {
      await api.addProductToList(listId, productId);
      
      // Update the product's lists in state without reloading all products
      const listToAdd = lists.find(l => l.id === listId);
      if (listToAdd) {
        setProducts(prevProducts => 
          prevProducts.map(product => 
            product.id === productId
              ? {
                  ...product,
                  lists: product.lists 
                    ? product.lists.some(l => l.id === listId)
                      ? product.lists // Already in list, don't add duplicate
                      : [...product.lists, listToAdd]
                    : [listToAdd]
                }
              : product
          )
        );
      }
      
      setAddingToListProductId(null);
    } catch (err: any) {
      setError(err.message || t('products.failedToAddToList'));
    }
  };

  const handleRemoveFromList = async (productId: number, listId: number) => {
    try {
      await api.removeProductFromList(listId, productId);
      
      // Update the product's lists in state without reloading all products
      setProducts(prevProducts => 
        prevProducts.map(product => 
          product.id === productId
            ? {
                ...product,
                lists: (() => {
                  const updatedLists = product.lists?.filter(l => l.id !== listId) || [];
                  return updatedLists.length > 0 ? updatedLists : undefined;
                })()
              }
            : product
        )
      );
    } catch (err: any) {
      setError(err.message || t('products.failedToRemoveFromList'));
    }
  };

  // Filter products by selected list
  const filteredProducts = selectedListId
    ? products.filter(product => product.lists?.some(list => list.id === selectedListId))
    : products;

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
      const token = localStorage.getItem('authToken');
      const headers: HeadersInit = {
        'Content-Type': 'application/json',
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      
      const response = await fetch('/api/config/import-asins', {
        method: 'POST',
        headers,
        body: JSON.stringify({ csvContent: fileContent }),
      });

      // Check if response is streaming (text/event-stream) or regular JSON
      const contentType = response.headers.get('content-type') || '';
      const isStreaming = contentType.includes('text/event-stream');

      if (!isStreaming && !response.ok) {
        // Try to parse error as JSON, fallback to text
        try {
          const errorData = await response.json();
          const errorMsg = errorData.error || t('products.failedToImport');
          console.error('Import error (non-streaming):', errorMsg);
          throw new Error(errorMsg);
        } catch (parseError) {
          const errorText = await response.text().catch(() => '');
          const errorMsg = errorText || t('products.failedToImport');
          console.error('Import error (text):', errorMsg);
          throw new Error(errorMsg);
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
        setCurrentPage(1);
        await loadProducts(1);
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
                      // Reload first page to show newly imported ones
                      setCurrentPage(1);
                      await loadProducts(1);
                    } else if (data.status === 'error') {
                      const errorMsg = data.error || t('products.failedToImport');
                      console.error('Import error:', errorMsg);
                      throw new Error(errorMsg);
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
      <div className="product-list-layout">
        {user && (
          <div className="product-list-sidebar">
            <ListsSidebar
              onListClick={handleListClick}
              selectedListId={selectedListId}
              onListChange={loadLists}
            />
          </div>
        )}
        <div className="product-list-content">
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
        <ASINInput onAdd={handleAddProduct} isValidating={isValidating} error={error} successMessage={successMessage} />
      </div>

      <div className="products-section">
        <div className="products-section-header">
          <h3>{t('products.trackedProducts')} ({selectedListId ? filteredProducts.length : totalCount}{selectedListId ? ` / ${totalCount}` : ''})</h3>
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
        {filteredProducts.length === 0 ? (
          <p className="empty-state">
            {selectedListId ? t('products.noProductsInList') : t('products.noProducts')}
          </p>
        ) : (
          <div className="products-list">
            {filteredProducts.map((product) => (
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
                  {product.lists && product.lists.length > 0 && (
                    <div className="product-lists">
                      <span className="lists-label">{t('products.inLists')}: </span>
                      {product.lists.map((list, idx) => (
                        <span key={list.id} className="list-badge">
                          {list.name}
                          {user && (
                            <button
                              className="remove-from-list-button"
                              onClick={() => handleRemoveFromList(product.id, list.id)}
                              title={t('products.removeFromList')}
                            >
                              ×
                            </button>
                          )}
                          {idx < product.lists!.length - 1 && ', '}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="product-date">
                    {t('products.added')}: {formatDate(product.created_at)}
                  </div>
                </div>
                <div className="product-actions">
                  {user && (
                    <div className="add-to-list-container">
                      <button
                        className="add-to-list-button"
                        onClick={() => {
                          const newState = addingToListProductId === product.id ? null : product.id;
                          setAddingToListProductId(newState);
                          // Adjust dropdown position after state update
                          if (newState !== null) {
                            setTimeout(() => {
                              adjustDropdownPosition(product.id);
                            }, 0);
                          }
                        }}
                      >
                        {t('products.addToList')}
                      </button>
                      {addingToListProductId === product.id && (
                        <div 
                          ref={(el) => { dropdownRefs.current[product.id] = el; }}
                          className="add-to-list-dropdown"
                        >
                          {lists.length === 0 ? (
                            <div className="no-lists-message">{t('products.noListsAvailable')}</div>
                          ) : (
                            lists.map((list) => {
                              const isInList = product.lists?.some(l => l.id === list.id);
                              return (
                                <button
                                  key={list.id}
                                  className={`list-option ${isInList ? 'in-list' : ''}`}
                                  onClick={() => {
                                    if (isInList) {
                                      handleRemoveFromList(product.id, list.id);
                                    } else {
                                      handleAddToList(product.id, list.id);
                                    }
                                  }}
                                  disabled={isInList}
                                >
                                  {list.name}
                                  {isInList && ' ✓'}
                                </button>
                              );
                            })
                          )}
                        </div>
                      )}
                    </div>
                  )}
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
        
        {/* Pagination */}
        {!selectedListId && totalPages > 1 && (
          <div className="pagination">
            <button
              onClick={() => {
                const newPage = currentPage - 1;
                setCurrentPage(newPage);
                loadProducts(newPage);
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              disabled={currentPage === 1}
              className="pagination-button"
            >
              {t('pagination.previous')}
            </button>
            <span className="pagination-info">
              {t('pagination.pageInfo', { page: currentPage, totalPages, total: totalCount })}
            </span>
            <button
              onClick={() => {
                const newPage = currentPage + 1;
                setCurrentPage(newPage);
                loadProducts(newPage);
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              disabled={currentPage === totalPages}
              className="pagination-button"
            >
              {t('pagination.next')}
            </button>
          </div>
        )}
      </div>
        </div>
      </div>
    </div>
  );
}

