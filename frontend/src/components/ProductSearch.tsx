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
  const debounceRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    if (query.trim() === '') {
      setResults([]);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const data = await api.searchProducts(query);
        setResults(data);
      } catch (err) {
        console.error('Search error:', err);
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [query]);

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
      {!loading && query.trim() !== '' && results.length === 0 && (
        <div className="search-no-results">{t('search.noResults')}</div>
      )}
      {results.length > 0 && (
        <div className="search-results">
          {results.map((product) => (
            <div
              key={product.id}
              className="search-result-item"
              onClick={() => {
                onSelectProduct(product);
                setQuery('');
                setResults([]);
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
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

