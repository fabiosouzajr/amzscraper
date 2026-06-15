import { useState, useEffect, lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './ProductDetail.module.css';

const PriceChart = lazy(() => import('./PriceChart'));
import { api } from '../services/api';
import { ProductWithPrice } from '../types';
import { formatDate, formatDateTime, formatDateShort } from '../utils/dateFormat';
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
  showBackButton?: boolean;
}

export function ProductDetail({ productId, onBack, onClose, onNavigate, isSheet = false, showBackButton = false }: ProductDetailProps) {
  const { t } = useTranslation();
  const [product, setProduct] = useState<ProductWithPrice | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortedProductIds, setSortedProductIds] = useState<number[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(-1);
  const [showHistory, setShowHistory] = useState(false);

  const swipeRef = useSwipeToDismiss(() => {
    if (onClose) onClose();
  }).ref as React.RefObject<HTMLDivElement>;

  useEffect(() => {
    const loadSortedIds = async () => {
      try {
        const ids = await api.getSortedProductIds();
        setSortedProductIds(ids);
        setCurrentIndex(ids.indexOf(productId));
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
        setCurrentIndex(sortedProductIds.indexOf(productId));
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

  const priceHistory = product.price_history ?? [];
  const chartYear = priceHistory.length > 0
    ? (() => {
        const years = new Set(priceHistory.map(ph => new Date(ph.date).getFullYear()));
        return years.size === 1 ? [...years][0].toString() : null;
      })()
    : null;

  const chartData = priceHistory.length > 0
    ? [...priceHistory].reverse().map((ph) => ({
        date: chartYear ? formatDateShort(ph.date) : formatDate(ph.date),
        price: ph.price,
      }))
    : [];

  const handlePrevious = () => {
    if (currentIndex > 0 && onNavigate) onNavigate(sortedProductIds[currentIndex - 1]);
  };

  const handleNext = () => {
    if (currentIndex >= 0 && currentIndex < sortedProductIds.length - 1 && onNavigate) {
      onNavigate(sortedProductIds[currentIndex + 1]);
    }
  };

  const hasPrevious = currentIndex > 0;
  const hasNext = currentIndex >= 0 && currentIndex < sortedProductIds.length - 1;
  const backHandler = onBack ?? onClose;
  const backLabel = onBack ? t('productDetail.goBack') : t('productDetail.back');
  const shouldShowBackButton = Boolean(onBack || (showBackButton && onClose));
  const isMobileOverlay = isSheet && showBackButton;

  const hasPriceDrop = product.price_drop !== undefined && product.price_drop > 0;

  return (
    <div className={styles.productDetail} ref={swipeRef}>

      {/* ── Header — only rendered when it has content ── */}
      {(shouldShowBackButton || !isSheet) && (
        <div className={styles.header}>
          {shouldShowBackButton && backHandler && (
            <button onClick={backHandler} className={styles.backButton} type="button">
              ← {backLabel}
            </button>
          )}
          {!isSheet && (
            <nav className={styles.productNavigation} aria-label={t('productDetail.navigation')}>
              <button
                onClick={handlePrevious}
                className={styles.navButton}
                disabled={!hasPrevious}
                aria-label={t('productDetail.previous')}
                type="button"
              >
                ←
              </button>
              {currentIndex >= 0 && (
                <span className={styles.navCounter}>
                  {currentIndex + 1}&nbsp;/&nbsp;{sortedProductIds.length}
                </span>
              )}
              <button
                onClick={handleNext}
                className={styles.navButton}
                disabled={!hasNext}
                aria-label={t('productDetail.next')}
                type="button"
              >
                →
              </button>
            </nav>
          )}
        </div>
      )}

      {/* ── Meta strip + categories ── */}
      <div className={styles.metaAndCategories}>
        {isSheet && !showBackButton && onClose && (
          <button
            type="button"
            className={styles.metaCloseButton}
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        )}
        <div className={styles.metaStrip}>
          <span className={`${styles.metaChip} ${styles.chipAsin}`} translate="no">
            <span className={styles.chipLabel}>{t('productDetail.asin')}</span>
            <span className={styles.chipValue}>{product.asin}</span>
          </span>
          <span className={`${styles.metaChip} ${styles.chipAdded}`}>
            <span className={styles.chipLabel}>{t('productDetail.added')}</span>
            <span className={styles.chipValue}>{formatDate(product.created_at)}</span>
          </span>
          {product.lists && product.lists.length > 0 && (
            <span className={`${styles.metaChip} ${styles.chipLists}`}>
              <span className={styles.chipLabel}>{t('products.inLists')}</span>
              <span className={styles.chipValue}>{product.lists.map(l => l.name).join(', ')}</span>
            </span>
          )}
        </div>
        {product.categories && product.categories.length > 0 && (
          <div className={styles.categories}>
            {(() => {
              const cats = product.categories!;
              if (cats.length <= 2) {
                return cats.map((cat, idx) => (
                  <span key={cat.id} className={styles.catItem}>
                    <Badge variant="info" size="sm">{cat.name}</Badge>
                    {idx < cats.length - 1 && <span className={styles.catSep} aria-hidden="true">›</span>}
                  </span>
                ));
              }
              return (
                <>
                  <span className={styles.catItem}>
                    <Badge variant="info" size="sm">{cats[0].name}</Badge>
                  </span>
                  <span className={styles.catEllipsis} title={cats.slice(1, -1).map(c => c.name).join(' › ')} aria-label={`${cats.length - 2} categorias intermediárias`}>···</span>
                  <span className={styles.catItem}>
                    <Badge variant="info" size="sm">{cats[cats.length - 1].name}</Badge>
                  </span>
                </>
              );
            })()}
          </div>
        )}
      </div>

      {/* ── Product title (below categories) ── */}
      <h2 className={styles.productTitle}>
        <a
          href={`https://www.amazon.com.br/dp/${product.asin}`}
          target="_blank"
          rel="noopener noreferrer"
          className={styles.productTitleLink}
        >
          {product.description}
        </a>
      </h2>

      {/* ── Image + Price (always side by side) ── */}
      <div className={styles.imageAndPrice}>
        <div className={styles.heroImage}>
          <img
            src={getPreferredProductImageUrl(product)}
            alt={product.description}
            className={styles.heroImg}
            onError={(e) => handleProductImageError(e, product.asin)}
            loading="lazy"
            width={400}
            height={400}
          />
        </div>

        <div className={styles.priceBlock}>
          {product.current_price != null ? (
            <>
              <div className={styles.currentPriceLabel}>{t('productDetail.currentPrice')}</div>
              <div className={styles.currentPriceValue}>
                {(() => {
                  const str = formatPrice(product.current_price!);
                  const m = str.match(/^([^\d]+?)\s*(\d[\s\S]*)$/);
                  return m ? (
                    <>
                      <span className={styles.currencySymbol}>{m[1].trim()}</span>
                      <span className={styles.priceAmount}>{m[2]}</span>
                    </>
                  ) : str;
                })()}
              </div>

              {hasPriceDrop && (
                <div className={styles.priceDropPill}>
                  ▼&nbsp;{formatPrice(product.price_drop!)}
                  {product.price_drop_percentage !== undefined && (
                    <span className={styles.pillPercent}>&nbsp;·&nbsp;{formatPercentage(product.price_drop_percentage)}</span>
                  )}
                </div>
              )}

              {product.previous_price != null && (
                <div className={styles.previousPriceRow}>
                  <span className={styles.previousPriceLabel}>{t('productDetail.previousPrice')}</span>
                  <span className={styles.previousPriceValue}>{formatPrice(product.previous_price)}</span>
                </div>
              )}

              {product.last_updated && (
                <div className={styles.lastUpdated}>
                  {t('productDetail.lastUpdated')}: {formatDateTime(product.last_updated)}
                </div>
              )}
            </>
          ) : (
            <div className={styles.noPriceData}>{t('productDetail.noPriceData')}</div>
          )}
        </div>
      </div>

      {/* ── Chart (full width below image+price) ── */}
      {chartData.length > 0 && (
        <div className={styles.chartSection}>
          <div className={styles.chartTitle}>
            {t('productDetail.priceHistory')}{chartYear ? ` ${chartYear}` : ''}
          </div>
          <Suspense fallback={<div className={styles.chartLoading}>Loading…</div>}>
            <PriceChart data={chartData} height={isMobileOverlay ? 160 : 200} />
          </Suspense>
        </div>
      )}

      {/* ── Collapsible price history ─────── */}
      {product.price_history && product.price_history.length > 0 && (
        <div className={styles.historySection}>
          <button
            className={styles.historyToggle}
            onClick={() => setShowHistory(s => !s)}
            aria-expanded={showHistory}
            type="button"
          >
            <span>{t('productDetail.priceHistoryDetails')}</span>
            <span className={`${styles.historyChevron} ${showHistory ? styles.historyChevronOpen : ''}`} aria-hidden="true">
              ▾
            </span>
          </button>
          {showHistory && (
            <div className={styles.historyTableWrapper}>
              <table className={styles.historyTable}>
                <thead>
                  <tr>
                    <th scope="col">{t('productDetail.date')}</th>
                    <th scope="col">{t('productDetail.price')}</th>
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
      )}

      <ProductNotifications productId={product.id} />

    </div>
  );
}
