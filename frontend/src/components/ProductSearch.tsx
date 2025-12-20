import { useState, useEffect, useRef } from 'react';
import { api } from '../services/api';
import { Product } from '../types';

interface ProductSearchProps {
  onSelectProduct: (product: Product) => void;
}

export function ProductSearch({ onSelectProduct }: ProductSearchProps) {
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
        placeholder="Search products by name or ASIN..."
        className="search-input"
      />
      {loading && <div className="search-loading">Searching...</div>}
      {!loading && query.trim() !== '' && results.length === 0 && (
        <div className="search-no-results">No products found</div>
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
              <div className="result-description">{product.description}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

