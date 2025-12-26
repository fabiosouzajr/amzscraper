import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../services/api';
import { Product } from '../types';

interface ProductSearchProps {
  onSelectProduct: (product: Product) => void;
}

export function ProductSearch({ onSelectProduct }: ProductSearchProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(10);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [isSearchMode, setIsSearchMode] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout>();

  const loadRecentProducts = async (page: number = 1) => {
    try {
      setLoading(true);
      const response = await api.getProducts(undefined, page, pageSize);
      setResults(response.products);
      setTotalPages(response.pagination.totalPages);
      setTotalCount(response.pagination.totalCount);
      setCurrentPage(response.pagination.page);
    } catch (err) {
      console.error('Error loading recent products:', err);
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    if (query.trim() === '') {
      setIsSearchMode(false);
      loadRecentProducts(1);
      setCurrentPage(1);
      return;
    }

    setIsSearchMode(true);
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const data = await api.searchProducts(query);
        setResults(data);
        setTotalPages(1);
        setTotalCount(data.length);
        setCurrentPage(1);
      } catch (err) {
        console.error('Search error:', err);
        setResults([]);
        setTotalPages(1);
        setTotalCount(0);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const handlePageChange = (newPage: number) => {
    setCurrentPage(newPage);
    loadRecentProducts(newPage);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="product-search">
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t('search.placeholder')}
        className="search-input"
      />
      {loading && <div className="search-loading">{t('search.searching')}</div>}
      {!loading && isSearchMode && query.trim() !== '' && results.length === 0 && (
        <div className="search-no-results">{t('search.noResults')}</div>
      )}
      {!loading && !isSearchMode && results.length === 0 && (
        <div className="search-no-results">{t('search.noProducts')}</div>
      )}
      {results.length > 0 && (
        <>
          <div className="search-results">
            {results.map((product) => (
              <div
                key={product.id}
                className="search-result-item"
                onClick={() => {
                  onSelectProduct(product);
                  if (isSearchMode) {
                    setQuery('');
                    setResults([]);
                  }
                }}
              >
                <div className="result-asin">{product.asin}</div>
                <a
                  href={`https://www.amazon.com.br/dp/${product.asin}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="result-description product-link"
                  onClick={(e) => e.stopPropagation()}
                >
                  {product.description}
                </a>
                {product.lists && product.lists.length > 0 && (
                  <div className="product-lists">
                    <span className="lists-label">{t('products.inLists')}: </span>
                    {product.lists.map((list, idx) => (
                      <span key={list.id} className="list-badge">
                        {list.name}
                        {idx < product.lists!.length - 1 && ', '}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
          {!isSearchMode && totalPages > 1 && (
            <div className="pagination">
              <button
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1}
                className="pagination-button"
              >
                {t('pagination.previous')}
              </button>
              <span className="pagination-info">
                {t('pagination.pageInfo', { page: currentPage, totalPages, total: totalCount })}
              </span>
              <button
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
                className="pagination-button"
              >
                {t('pagination.next')}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

