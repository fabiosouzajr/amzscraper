import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { api } from '../services/api';
import { ProductWithPrice } from '../types';
import { formatDate, formatDateTime } from '../utils/dateFormat';
import { formatPrice, formatPercentage } from '../utils/numberFormat';

interface ProductDetailProps {
  productId: number;
  onBack: () => void;
  onNavigate?: (productId: number) => void;
}

export function ProductDetail({ productId, onBack, onNavigate }: ProductDetailProps) {
  const { t } = useTranslation();
  const [product, setProduct] = useState<ProductWithPrice | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortedProductIds, setSortedProductIds] = useState<number[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(-1);

  useEffect(() => {
    const loadSortedIds = async () => {
      try {
        const ids = await api.getSortedProductIds();
        setSortedProductIds(ids);
        const index = ids.indexOf(productId);
        setCurrentIndex(index);
      } catch (err) {
        console.error('Failed to load sorted product IDs:', err);
      }
    };

    loadSortedIds();
  }, [productId]);

  useEffect(() => {
    const loadProduct = async () => {
      try {
        setLoading(true);
        const data = await api.getProduct(productId);
        setProduct(data);
        setError(null);
        // Update current index when product changes
        const index = sortedProductIds.indexOf(productId);
        setCurrentIndex(index);
      } catch (err) {
        setError(t('productDetail.failedToLoad'));
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    loadProduct();
  }, [productId, sortedProductIds, t]);

  if (loading) {
    return <div className="loading">{t('productDetail.loading')}</div>;
  }

  if (error || !product) {
    return (
      <div className="error">
        <p>{error || t('productDetail.notFound')}</p>
        <button onClick={onBack}>{t('productDetail.goBack')}</button>
      </div>
    );
  }

  // Get price history for chart
  const chartData = product.price_history && product.price_history.length > 0
    ? product.price_history.map((ph) => ({
        date: formatDate(ph.date),
        price: ph.price
      }))
    : [];

  const handlePrevious = () => {
    if (currentIndex > 0 && sortedProductIds.length > 0) {
      const prevId = sortedProductIds[currentIndex - 1];
      if (onNavigate) {
        onNavigate(prevId);
      }
    }
  };

  const handleNext = () => {
    if (currentIndex >= 0 && currentIndex < sortedProductIds.length - 1) {
      const nextId = sortedProductIds[currentIndex + 1];
      if (onNavigate) {
        onNavigate(nextId);
      }
    }
  };

  const hasPrevious = currentIndex > 0;
  const hasNext = currentIndex >= 0 && currentIndex < sortedProductIds.length - 1;

  return (
    <div className="product-detail">
      <div className="product-detail-header">
        <div className="product-navigation">
          <button 
            onClick={handlePrevious} 
            className="nav-button prev-button"
            disabled={!hasPrevious}
          >
            {t('productDetail.previous')}
          </button>
          <button 
            onClick={handleNext} 
            className="nav-button next-button"
            disabled={!hasNext}
          >
            {t('productDetail.next')}
          </button>
        </div>
      </div>
      
      <div className="product-header">
        <div className="product-meta">
          <span className="asin-badge">{t('productDetail.asin')}: {product.asin}</span>
          <span className="date-badge">
            {t('productDetail.added')}: {formatDate(product.created_at)}
          </span>
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
        {product.categories && product.categories.length > 0 && (
          <div className="product-categories">
            {product.categories.map((cat, idx) => (
              <span key={cat.id}>
                <span className="category-badge">
                  {cat.name}
                </span>
                {idx < product.categories!.length - 1 && ' > '}
              </span>
            ))}
          </div>
        )}
        <h2>
          <a
            href={`https://www.amazon.com.br/dp/${product.asin}`}
            target="_blank"
            rel="noopener noreferrer"
            className="product-link"
          >
            {product.description}
          </a>
        </h2>
      </div>

      <div className="price-info">
        {product.current_price !== undefined ? (
          <>
            <div className="current-price">
              <span className="label">{t('productDetail.currentPrice')}</span>
              <span className="value">{formatPrice(product.current_price)}</span>
            </div>
            {product.previous_price !== undefined && (
              <div className="price-comparison">
                <div className="previous-price">
                  <span className="label">{t('productDetail.previousPrice')}</span>
                  <span className="value">{formatPrice(product.previous_price)}</span>
                </div>
                {product.price_drop !== undefined && product.price_drop > 0 && (
                  <div className="price-drop">
                    <span className="label">{t('productDetail.priceDrop')}</span>
                    <span className="value positive">
                      -{formatPrice(product.price_drop)} ({product.price_drop_percentage !== undefined ? formatPercentage(product.price_drop_percentage) : ''})
                    </span>
                  </div>
                )}
              </div>
            )}
            {product.last_updated && (
              <div className="last-updated">
                {t('productDetail.lastUpdated')}: {formatDateTime(product.last_updated)}
              </div>
            )}
          </>
        ) : (
          <div className="no-price-data">{t('productDetail.noPriceData')}</div>
        )}
      </div>

      {chartData.length > 0 && (
        <div className="price-chart">
          <h3>{t('productDetail.priceHistory')}</h3>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip formatter={(value: number) => formatPrice(value)} />
              <Legend />
              <Line type="monotone" dataKey="price" stroke="#8884d8" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
      
      {product.price_history && product.price_history.length > 0 && (
        <div className="price-history-table">
          <h3>{t('productDetail.priceHistoryDetails')}</h3>
          <table>
            <thead>
              <tr>
                <th>{t('productDetail.date')}</th>
                <th>{t('productDetail.price')}</th>
              </tr>
            </thead>
            <tbody>
              {product.price_history.map((ph) => (
                <tr key={ph.id}>
                  <td>{formatDateTime(ph.date)}</td>
                  <td>{formatPrice(ph.price)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

