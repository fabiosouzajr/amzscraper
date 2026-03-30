import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { Package } from 'lucide-react';
import { api } from '../services/api';
import { ASINInput } from './ASINInput';
import { ListsSidebar } from './ListsSidebar';
import { CategoryFilter } from './CategoryFilter';
import { EmptyState } from '../design-system';
import { formatDate } from '../utils/dateFormat';
import { getPreferredProductImageUrl, handleProductImageError } from '../utils/productImage';
import { useAuth } from '../contexts/AuthContext';
import { useImport } from '../contexts/ImportContext';
import { useProducts, useAddProduct, useDeleteProduct, useLists, useMediaQuery, useSwipeGesture } from '../hooks';
import styles from './ProductList.module.css';



interface SwipeableRowProps {
  productId: number;
  onDelete: (id: number) => void;
  children: React.ReactNode;
  isMobile: boolean;
}

const SwipeableRow = React.memo(function SwipeableRow({ productId, onDelete, children, isMobile }: SwipeableRowProps) {
  const { t } = useTranslation();
  const [swiped, setSwiped] = useState(false);

  const { ref: swipeRef } = useSwipeGesture({
    onSwipeLeft: isMobile ? () => setSwiped(true) : undefined,
    onSwipeRight: isMobile ? () => setSwiped(false) : undefined,
    threshold: 60,
  });

  return (
    <div className={`${styles.swipeableRowContainer}${swiped ? ` ${styles.swipeableRowSwiped}` : ''}`}>
      <div ref={swipeRef as React.RefObject<HTMLDivElement>} className={styles.swipeableRowContent}>
        {children}
      </div>
      {isMobile && (
        <div className={styles.swipeableRowActions} aria-hidden={!swiped}>
          <button
            className={styles.swipeDeleteBtn}
            onClick={() => { onDelete(productId); setSwiped(false); }}
            tabIndex={swiped ? 0 : -1}
          >
            {t('common.delete')}
          </button>
        </div>
      )}
    </div>
  );
});

interface ProductListProps {
  initialCategoryFilter?: string;
  onFilterApplied?: () => void;
  onProductSelect?: (productId: number) => void;
}

export function ProductList({ initialCategoryFilter = '', onFilterApplied, onProductSelect }: ProductListProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { importing, importResults, startImport, setOnImportComplete } = useImport();
  const qc = useQueryClient();
  const [selectedCategory, setSelectedCategory] = useState<string>(initialCategoryFilter);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [selectedListId, setSelectedListId] = useState<number | null>(null);
  const [addingToListProductId, setAddingToListProductId] = useState<number | null>(null);
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const dropdownRefs = useRef<{ [key: number]: HTMLDivElement | null }>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data, isLoading: loading, error: queryError } = useProducts(
    selectedCategory || undefined,
    currentPage,
    pageSize,
  );
  const products = data?.products ?? [];
  const totalPages = data?.pagination.totalPages ?? 1;
  const totalCount = data?.pagination.totalCount ?? 0;
  const fetchError = queryError ? t('products.failedToLoad') : null;

  const addProductMutation = useAddProduct();
  const deleteMutation = useDeleteProduct();
  const { data: lists = [] } = useLists();
  const isMobile = useMediaQuery('(max-width: 767px)');

  useEffect(() => {
    if (initialCategoryFilter) {
      setSelectedCategory(initialCategoryFilter);
      onFilterApplied?.();
    }
    // Register a callback so the context can tell us when import finishes
    setOnImportComplete(() => {
      setCurrentPage(1);
      qc.invalidateQueries({ queryKey: ['products'] });
    });
    return () => setOnImportComplete(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCategoryFilter, user]);

  useEffect(() => {
    setCurrentPage(1);
    // TanStack Query handles refetch automatically when selectedCategory changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCategory]);

  const adjustDropdownPosition = (productId: number) => {
    const dropdown = dropdownRefs.current[productId];
    if (!dropdown) return;
    const container = dropdown.parentElement;
    if (!container) return;
    const button = container.querySelector(`.${styles.addToListButton}`) as HTMLElement;
    if (!button) return;
    const buttonRect = button.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const spaceBelow = viewportHeight - buttonRect.bottom;
    const spaceAbove = buttonRect.top;
    const estimatedDropdownHeight = Math.min(300, lists.length * 50 + 20);
    if (spaceBelow < estimatedDropdownHeight && spaceAbove > estimatedDropdownHeight) {
      dropdown.classList.add(styles.dropdownUp);
      dropdown.style.maxHeight = `${Math.min(300, spaceAbove - 20)}px`;
    } else {
      dropdown.classList.remove(styles.dropdownUp);
      dropdown.style.maxHeight = `${Math.min(300, spaceBelow - 20)}px`;
    }
  };

  useEffect(() => {
    const handleResize = () => {
      if (addingToListProductId !== null) adjustDropdownPosition(addingToListProductId);
    };
    const handleScroll = () => {
      if (addingToListProductId !== null) adjustDropdownPosition(addingToListProductId);
    };
    window.addEventListener('resize', handleResize);
    window.addEventListener('scroll', handleScroll, true);
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [addingToListProductId]);

  const handlePageSizeChange = (newSize: number) => {
    setPageSize(newSize);
    setCurrentPage(1);
  };

  const handleCategoryClick = useCallback((categoryName: string) => setSelectedCategory(categoryName), []);

  const toggleExpanded = useCallback((id: number) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleAddProduct = async (asin: string) => {
    setIsValidating(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const product = await addProductMutation.mutateAsync(asin);
      setSuccessMessage(t('products.addedSuccessfully', { name: product.description || asin }));
      setCurrentPage(1);
      setTimeout(() => setSuccessMessage(null), 5000);
    } catch (err: any) {
      setError(err.message || t('products.failedToAdd'));
      throw err;
    } finally {
      setIsValidating(false);
    }
  };

  const handleDeleteProduct = useCallback(async (id: number) => {
    if (!confirm(t('products.confirmDelete'))) return;
    try {
      await deleteMutation.mutateAsync(id);
      // If deleting the last item on a page > 1, go back one page
      const currentProductsOnPage = selectedListId
        ? products.filter(p => p.lists?.some(l => l.id === selectedListId)).length
        : products.length;
      if (currentProductsOnPage === 1 && currentPage > 1) {
        setCurrentPage(currentPage - 1);
      }
    } catch (err) {
      setError(t('products.failedToDelete'));
      console.error(err);
    }
  }, [deleteMutation, products, selectedListId, currentPage, t]);

  const handleListClick = useCallback((listId: number | null) => setSelectedListId(listId), []);

  const handleToggleDropdown = useCallback((productId: number) => {
    const newState = addingToListProductId === productId ? null : productId;
    setAddingToListProductId(newState);
    if (newState !== null) {
      setTimeout(() => adjustDropdownPosition(productId), 0);
    }
  }, [addingToListProductId]);

  const handleAddToList = useCallback(async (productId: number, listId: number) => {
    try {
      await api.addProductToList(listId, productId);
      const listToAdd = lists.find(l => l.id === listId);
      if (listToAdd) {
        // Optimistic local update — query will sync on next refetch
        qc.setQueryData(
          ['products', selectedCategory || '', currentPage, pageSize],
          (old: typeof data) => {
            if (!old) return old;
            return {
              ...old,
              products: old.products.map(product =>
                product.id === productId
                  ? {
                      ...product,
                      lists: product.lists
                        ? product.lists.some(l => l.id === listId)
                          ? product.lists
                          : [...product.lists, listToAdd]
                        : [listToAdd],
                    }
                  : product
              ),
            };
          }
        );
      }
      setAddingToListProductId(null);
    } catch (err: any) {
      setError(err.message || t('products.failedToAddToList'));
    }
  }, [lists, qc, selectedCategory, currentPage, pageSize, t]);

  const handleRemoveFromList = useCallback(async (productId: number, listId: number) => {
    try {
      await api.removeProductFromList(listId, productId);
      qc.setQueryData(
        ['products', selectedCategory || '', currentPage, pageSize],
        (old: typeof data) => {
          if (!old) return old;
          return {
            ...old,
            products: old.products.map(product =>
              product.id === productId
                ? {
                    ...product,
                    lists: (() => {
                      const updatedLists = product.lists?.filter(l => l.id !== listId) || [];
                      return updatedLists.length > 0 ? updatedLists : undefined;
                    })(),
                  }
                : product
            ),
          };
        }
      );
    } catch (err: any) {
      setError(err.message || t('products.failedToRemoveFromList'));
    }
  }, [qc, selectedCategory, currentPage, pageSize, t]);

  const handleImportClick = () => {
    if (!importing) fileInputRef.current?.click();
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.csv') && file.type !== 'text/csv') {
      setError(t('products.invalidFile'));
      event.target.value = '';
      return;
    }

    try {
      await startImport(file);
    } catch (err: any) {
      setError(err.message || t('products.failedToImport'));
    }
    event.target.value = '';
  };

  const filteredProducts = selectedListId
    ? products.filter(product => product.lists?.some(list => list.id === selectedListId))
    : products;

  const displayError = error || fetchError;

  if (loading) {
    return <div className="loading">{t('products.loading')}</div>;
  }

  return (
    <div className={styles.productList}>
      {/* Import button above the lists+content area */}
      <div className={styles.importSection}>
        <button
          className={`${styles.importButton} ${styles.importButtonCsv}${importing ? ` ${styles.disabled}` : ''}`}
          onClick={handleImportClick}
          disabled={importing}
          title={t('products.importASINs')}
        >
          <svg className={styles.csvIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
            <polyline points="10 9 9 9 8 9" />
          </svg>
          {importing ? t('products.importing') : t('products.importASINs')}
        </button>
        <input
          ref={fileInputRef}
          id="import-file"
          type="file"
          accept=".csv"
          onChange={handleFileChange}
          disabled={importing}
          style={{ display: 'none' }}
        />
        {importResults && !importing && (
          <div className={styles.importResults}>
            <span className={styles.importResultItem}>{t('products.importTotal')}: {importResults.total}</span>
            <span className={`${styles.importResultItem} ${styles.success}`}>{t('products.importSuccess')}: {importResults.success}</span>
            <span className={`${styles.importResultItem} ${styles.skipped}`}>{t('products.importSkipped')}: {importResults.skipped}</span>
            <span className={`${styles.importResultItem} ${styles.failed}`}>{t('products.importFailed')}: {importResults.failed}</span>
          </div>
        )}
      </div>

      <div className={styles.productListLayout}>
        {user && (
          <div className={styles.productListSidebar}>
            <ListsSidebar
              onListClick={handleListClick}
              selectedListId={selectedListId}
            />
          </div>
        )}
        <div className={styles.productListContent}>
          <h2 className={styles.productListTitle}>{t('products.title')}</h2>
          <div className={styles.addProductSection}>
            <h3>{t('products.addNew')}</h3>
            <ASINInput onAdd={handleAddProduct} isValidating={isValidating} error={displayError} successMessage={successMessage} />
          </div>

          <div className={styles.productsSection}>
            <div className={styles.productsSectionHeader}>
              <h3>{t('products.trackedProducts')} ({selectedListId ? filteredProducts.length : totalCount}{selectedListId ? ` / ${totalCount}` : ''})</h3>
              <div className={styles.categoryFilterPanel}>
                <label className={styles.categoryFilterLabel}>{t('products.filterByCategory')}:</label>
                <CategoryFilter
                  selectedCategory={selectedCategory}
                  onChange={setSelectedCategory}
                />
              </div>
            </div>
            {filteredProducts.length === 0 ? (
              <EmptyState
                icon={<Package size={48} />}
                title={selectedListId ? t('products.noProductsInList') : selectedCategory ? t('products.noProductsInCategory') : t('products.noProducts')}
                description={!selectedListId && !selectedCategory ? t('products.addFirstProduct') : undefined}
              />
            ) : (
              <div className={styles.productsList}>
                {filteredProducts.map((product) => (
                  <SwipeableRow
                    key={product.id}
                    productId={product.id}
                    onDelete={handleDeleteProduct}
                    isMobile={isMobile}
                  >
                  <div className={styles.productListItem}>
                    {/* Main row — always visible */}
                    <div className={styles.productRowMain}>
                      <div className="product-thumbnail-wrapper">
                        <img
                          src={getPreferredProductImageUrl(product)}
                          alt={product.description}
                          className="product-thumbnail"
                          onError={(e) => handleProductImageError(e, product.asin)}
                        />
                      </div>

                      <div className={styles.productRowSummary}>
                        <a
                          href={`https://www.amazon.com.br/dp/${product.asin}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`product-description product-link ${styles.productDescriptionLink}`}
                          onClick={(e) => e.stopPropagation()}
                        >
                          {product.description}
                        </a>
                        <div className={styles.productRowMeta}>
                          <span className={styles.productRowAsinBadge}>{product.asin}</span>
                          {(product as any).current_price != null && (
                            <span className={styles.productRowPrice}>
                              {(product as any).current_price}
                            </span>
                          )}
                          {product.categories && product.categories.length > 0 && (
                            <div className={styles.productRowCategoriesHover} aria-hidden="true">
                              {product.categories.map((cat, idx) => (
                                <span key={cat.id}>
                                  <button
                                    className={styles.categoryFilterButton}
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
                        </div>
                        {product.lists && product.lists.length > 0 && (
                          <div className="product-lists">
                            <span className="lists-label">{t('products.inLists')}: </span>
                            {product.lists.map((list, idx) => (
                              <span key={list.id} className="list-badge">
                                {list.name}
                                {user && (
                                  <button
                                    className={styles.removeFromListButton}
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
                      </div>

                      <div className={`${styles.productRowActions} product-actions`}>
                        <button
                          className={styles.btnIcon}
                          onClick={() => toggleExpanded(product.id)}
                          aria-expanded={expandedRows.has(product.id)}
                          aria-label={expandedRows.has(product.id) ? t('products.collapse') : t('products.expand')}
                          title={expandedRows.has(product.id) ? t('products.collapse') : t('products.expand')}
                        >
                          {expandedRows.has(product.id) ? '▴' : '▾'}
                        </button>
                        {user && (
                          <div className={styles.addToListContainer}>
                            <button
                              className={styles.addToListButton}
                              onClick={() => handleToggleDropdown(product.id)}
                            >
                              {t('products.addToList')}
                            </button>
                            {addingToListProductId === product.id && (
                              <div
                                ref={(el) => { dropdownRefs.current[product.id] = el; }}
                                className={styles.addToListDropdown}
                              >
                                {lists.length === 0 ? (
                                  <div className={styles.noListsMessage}>{t('products.noListsAvailable')}</div>
                                ) : (
                                  lists.map((list) => {
                                    const isInList = product.lists?.some(l => l.id === list.id);
                                    return (
                                      <button
                                        key={list.id}
                                        className={`${styles.listOption}${isInList ? ` ${styles.inList}` : ''}`}
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
                        {onProductSelect && (
                          <button
                            className={styles.viewButton}
                            onClick={() => onProductSelect(product.id)}
                          >
                            {t('products.view')}
                          </button>
                        )}
                        <button
                          className="delete-button"
                          onClick={() => handleDeleteProduct(product.id)}
                        >
                          {t('products.remove')}
                        </button>
                      </div>
                    </div>

                    {/* Details row — shown only when expanded */}
                    {expandedRows.has(product.id) && (
                      <div className={styles.productRowDetails}>
                        <div className={styles.productDate}>
                          {t('products.added')}: {formatDate(product.created_at)}
                        </div>
                        {product.categories && product.categories.length > 0 && (
                          <div className="product-categories">
                            {product.categories.map((cat, idx) => (
                              <span key={cat.id}>
                                <button
                                  className={styles.categoryFilterButton}
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
                      </div>
                    )}
                  </div>
                  </SwipeableRow>
                ))}
              </div>
            )}

            {!selectedListId && (
              <div className={styles.pagination}>
                <select
                  value={pageSize}
                  onChange={(e) => handlePageSizeChange(Number(e.target.value))}
                  className={styles.pageSizeSelect}
                  aria-label={t('products.itemsPerPage')}
                >
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                </select>
                <span>{t('products.perPage')}</span>
                {totalPages > 1 && (
                  <>
                    <button
                      onClick={() => {
                        const newPage = currentPage - 1;
                        setCurrentPage(newPage);
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                      disabled={currentPage === 1}
                      className={styles.paginationButton}
                    >
                      {t('pagination.previous')}
                    </button>
                    <span className={styles.paginationInfo}>
                      {t('pagination.pageInfo', { page: currentPage, totalPages, total: totalCount })}
                    </span>
                    <button
                      onClick={() => {
                        const newPage = currentPage + 1;
                        setCurrentPage(newPage);
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                      disabled={currentPage === totalPages}
                      className={styles.paginationButton}
                    >
                      {t('pagination.next')}
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
