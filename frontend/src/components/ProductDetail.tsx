import { useState, useEffect, lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './ProductDetail.module.css';

const PriceChart = lazy(() => import('./PriceChart'));
import { api } from '../services/api';
import { ProductWithPrice } from '../types';
import { formatDate, formatDateTime } from '../utils/dateFormat';
import { formatPrice, formatPercentage } from '../utils/numberFormat';
import { getPreferredProductImageUrl, handleProductImageError } from '../utils/productImage';
import { ProductNotifications } from './ProductNotifications';
import { Badge } from '../design-system';
import { useSwipeToDismiss } from '../hooks';

interface ProductDetailProps {
  productId: number;
  onBack?: () => void;
  onClose?: () => void;
  onNavigate?: (productId: number) => void;
  isSheet?: boolean;
}

export function ProductDetail({ productId, onBack, onClose, onNavigate, isSheet = false }: ProductDetailProps) {
  const { t } = useTranslation();
  const [product, setProduct] = useState<ProductWithPrice | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortedProductIds, setSortedProductIds] = useState<number[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(-1);

  const swipeRef = useSwipeToDismiss(() => {
    if (onClose) {
      onClose();
    }
  }).ref as React.RefObject<HTMLDivElement>;

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
        {onBack && <button onClick={onBack}>{t('productDetail.goBack')}</button>}
      </div>
    );
  }

  // Get price history for chart - reverse DESC array to chronological order (oldest left, newest right)
  const chartData = product.price_history && product.price_history.length > 0
    ? [...product.price_history].reverse().map((ph) => ({
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
    <div className={styles.productDetail} ref={swipeRef}>
      {!isSheet && (
        <div className={styles.productDetailHeader}>
          <div className={styles.productNavigation}>
            <button
              onClick={handlePrevious}
              className={`${styles.navButton} ${styles.prevButton}`}
              disabled={!hasPrevious}
            >
              {t('productDetail.previous')}
            </button>
            <button
              onClick={handleNext}
              className={`${styles.navButton} ${styles.nextButton}`}
              disabled={!hasNext}
            >
              {t('productDetail.next')}
            </button>
          </div>
        </div>
      )}

      <div className={styles.productHeader}>
        <div className={styles.productMeta}>
          <Badge variant="neutral" size="sm">
            {t('productDetail.asin')}: {product.asin}
          </Badge>
          <Badge variant="neutral" size="sm">
            {t('productDetail.added')}: {formatDate(product.created_at)}
          </Badge>
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
                <Badge variant="info" size="sm">
                  {cat.name}
                </Badge>
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
        <div className={styles.priceInfoBody}>
          <div className={`product-thumbnail-wrapper ${styles.productThumbnailWrapperLg}`}>
            <img
              src={getPreferredProductImageUrl(product)}
              alt={product.description}
              className="product-thumbnail"
              onError={(e) => handleProductImageError(e, product.asin)}
            />
          </div>
          <div className={styles.priceData}>
            {product.current_price != null ? (
              <>
                <div className={styles.currentPrice}>
                  <span className="label">{t('productDetail.currentPrice')}</span>
                  <span className="value">{formatPrice(product.current_price)}</span>
                </div>
                {product.previous_price != null && (
                  <div className={styles.priceComparison}>
                    <div className={styles.previousPrice}>
                      <span className="label">{t('productDetail.previousPrice')}</span>
                      <span className="value">{formatPrice(product.previous_price)}</span>
                    </div>
                    {product.price_drop !== undefined && product.price_drop > 0 && (
                      <div className={styles.priceDrop}>
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
              <div className={styles.noPriceData}>{t('productDetail.noPriceData')}</div>
            )}
          </div>
        </div>
      </div>

      {chartData.length > 0 && (
        <div className={styles.priceChart}>
          <h3>{t('productDetail.priceHistory')}</h3>
          <Suspense fallback={<div className="chart-loading">Loading chart...</div>}>
            <PriceChart data={chartData} />
          </Suspense>
        </div>
      )}

      {product.price_history && product.price_history.length > 0 && (
        <div className={styles.priceHistoryTable}>
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

      <ProductNotifications productId={product.id} />
    </div>
  );
}
