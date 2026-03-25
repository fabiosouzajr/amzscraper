import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../services/api';
import { Product } from '../types';
import { ProductList } from './ProductList';
import { useCallback } from 'react';

interface SearchResultsListProps {
  results: Product[];
  loading: boolean;
  query: string;
  onSelect: (product: Product) => void;
}

function SearchResultsList({ results, loading, query, onSelect }: SearchResultsListProps) {
  const { t } = useTranslation();

  if (loading) {
    return <div className="search-loading">{t('search.searching')}</div>;
  }

  if (query.trim() !== '' && results.length === 0) {
    return <div className="search-no-results">{t('search.noResults')}</div>;
  }

  return (
    <div className="search-results">
      {results.map((product) => (
        <div
          key={product.id}
          className="search-result-item"
          onClick={() => onSelect(product)}
        >
          <div className="product-thumbnail-wrapper">
            <img
              src={`https://images-na.ssl-images-amazon.com/images/P/${product.asin}.01._SCLZZZZZZZ_.jpg`}
              alt={product.description}
              className="product-thumbnail"
              onError={(e) => {
                (e.currentTarget.parentElement as HTMLElement).style.display = 'none';
              }}
            />
          </div>
          <div className="search-result-info">
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
          </div>
        </div>
      ))}
    </div>
  );
}

export function ProductsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();

  const searchParams = new URLSearchParams(location.search);
  const initialCategoryFilter = searchParams.get('category') || '';

  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [isSearchMode, setIsSearchMode] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const handleFilterApplied = useCallback(() => {
    navigate('/products', { replace: true });
  }, [navigate]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (query.trim() === '') {
      setIsSearchMode(false);
      setSearchResults([]);
      return;
    }

    setIsSearchMode(true);
    debounceRef.current = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const data = await api.searchProducts(query);
        setSearchResults(data);
      } catch {
        setSearchResults([]);
      } finally {
        setSearchLoading(false);
      }
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  return (
    <div className="products-page">
      <div className="products-page-search">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('search.placeholder')}
          className="search-input"
        />
        {query && (
          <button
            onClick={() => setQuery('')}
            className="search-clear-btn"
            aria-label="Clear"
          >
            ×
          </button>
        )}
      </div>

      {isSearchMode ? (
        <SearchResultsList
          results={searchResults}
          loading={searchLoading}
          query={query}
          onSelect={(product) => navigate(`/products/${product.id}`)}
        />
      ) : (
        <ProductList
          initialCategoryFilter={initialCategoryFilter}
          onFilterApplied={handleFilterApplied}
        />
      )}
    </div>
  );
}
