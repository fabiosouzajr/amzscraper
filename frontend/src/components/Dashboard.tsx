import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../services/api';
import { PriceDrop } from '../types';
import { MiniPriceChart } from './MiniPriceChart';
import { formatDateTime } from '../utils/dateFormat';
import { formatPrice, formatPercentage } from '../utils/numberFormat';
import { Card, Button, ProgressBar, Badge, EmptyState } from '../design-system';

interface DashboardProps {
  onCategoryClick: (categoryName: string) => void;
}

export function Dashboard({ onCategoryClick }: DashboardProps) {
  const { t } = useTranslation();
  const [priceDrops, setPriceDrops] = useState<PriceDrop[]>([]);
  const [priceIncreases, setPriceIncreases] = useState<PriceDrop[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [updateProgress, setUpdateProgress] = useState(0);
  const [updateStatus, setUpdateStatus] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  const loadPriceChanges = async () => {
    try {
      setLoading(true);
      const [drops, increases] = await Promise.all([
        api.getPriceDrops(20),
        api.getPriceIncreases(20)
      ]);
      setPriceDrops(drops);
      setPriceIncreases(increases);
      setError(null);
    } catch (err) {
      setError(t('dashboard.failedToLoad'));
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPriceChanges();
  }, []);

  const handleUpdatePrices = async () => {
    setUpdating(true);
    setUpdateProgress(0);
    setUpdateStatus(t('dashboard.startingUpdate'));
    setError(null);

    try {
      // Start the update with real-time progress updates
      await api.updatePrices((progress) => {
        // Update progress based on backend status
        if (progress.progress !== undefined) {
          setUpdateProgress(progress.progress);
        }

        // Update status message based on backend status
        switch (progress.status) {
          case 'starting':
            setUpdateStatus(t('dashboard.startingUpdate'));
            break;
          case 'initialized':
            setUpdateStatus(t('dashboard.updateStarted'));
            break;
          case 'processing':
            if (progress.current && progress.total) {
              setUpdateStatus(
                `${t('dashboard.scraping')} (${progress.current}/${progress.total})${progress.currentProduct ? `: ${progress.currentProduct}` : ''}`
              );
            } else {
              setUpdateStatus(t('dashboard.scraping'));
            }
            break;
          case 'completed':
            setUpdateStatus(
              t('dashboard.updateComplete') +
              (progress.updated !== undefined || progress.skipped !== undefined || progress.errors !== undefined
                ? ` - ${progress.updated || 0} updated, ${progress.skipped || 0} skipped, ${progress.errors || 0} errors`
                : '')
            );
            setUpdateProgress(100);
            // Refresh price changes after completion
            setTimeout(async () => {
              await loadPriceChanges();
              setUpdating(false);
              setUpdateProgress(0);
              setUpdateStatus('');
            }, 1000);
            break;
          case 'error':
            setError(progress.error || t('dashboard.failedToUpdate'));
            setUpdateStatus('');
            setUpdating(false);
            setUpdateProgress(0);
            break;
          case 'skipped':
            setError(progress.error || 'Update already in progress');
            setUpdateStatus('');
            setUpdating(false);
            setUpdateProgress(0);
            break;
          default:
            if (progress.status) {
              setUpdateStatus(progress.status);
            }
        }
      });
    } catch (err) {
      setError(t('dashboard.failedToUpdate'));
      setUpdateStatus('');
      setUpdating(false);
      setUpdateProgress(0);
      console.error(err);
    }
  };

  if (loading) {
    return <div className="loading">{t('dashboard.loading')}</div>;
  }

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <h1>{t('dashboard.title')}</h1>
        <Button
          onClick={handleUpdatePrices}
          disabled={updating}
          variant="primary"
          size="md"
        >
          {updating ? t('dashboard.updating') : t('dashboard.updatePrices')}
        </Button>
      </div>

      {error && <div className="error-message">{error}</div>}

      {updating && (
        <Card elevation={1} padding="md">
          <ProgressBar
            value={updateProgress}
            variant="primary"
            size="md"
          />
          <div className="progress-status">{updateStatus}</div>
        </Card>
      )}

      {priceDrops.length === 0 && priceIncreases.length === 0 ? (
        <EmptyState
          title={t('dashboard.noPriceChanges')}
          description={t('dashboard.noPriceChangesHint')}
          variant="no-data"
        />
      ) : (
        <>
          {priceDrops.length > 0 && (
            <div className="price-changes-section">
              <h2 className="section-title">{t('dashboard.priceDrops')}</h2>
              <div className="price-drops-grid">
                {priceDrops.map((drop) => (
                  <Card
                    key={drop.product.id}
                    elevation={1}
                    padding="sm"
                    onClick={() => onCategoryClick('')}
                    className="price-drop-card"
                  >
                    <div className="drop-header">
                      <div className="drop-header-content">
                        <div className="drop-percentage">
                          {formatPercentage(drop.price_drop_percentage)}
                        </div>
                        <div className="drop-amount">
                          {formatPrice(drop.price_drop)}
                        </div>
                      </div>
                    </div>
                    <div className="product-info">
                      <div className="product-asin">{drop.product.asin}</div>
                      {drop.product.categories && drop.product.categories.length > 0 && (
                        <div className="product-categories">
                          {drop.product.categories.map((cat, idx) => (
                            <span key={cat.id}>
                              <button
                                type="button"
                                className="category-badge-btn"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  onCategoryClick(cat.name);
                                }}
                                title={t('dashboard.filterBy', { category: cat.name })}
                              >
                                <Badge variant="info" size="sm">{cat.name}</Badge>
                              </button>
                              {idx < drop.product.categories!.length - 1 && ' > '}
                            </span>
                          ))}
                        </div>
                      )}
                      <a
                        href={`https://www.amazon.com.br/dp/${drop.product.asin}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="product-link"
                      >
                        {drop.product.description}
                      </a>
                      {drop.price_history && drop.price_history.length > 0 && (
                        <div className="mini-chart-container">
                          <MiniPriceChart priceHistory={drop.price_history} />
                        </div>
                      )}
                      <div className="price-info">
                        <div className="price-row">
                          <span className="label">{t('dashboard.previous')}:</span>
                          <span className="price previous">{formatPrice(drop.previous_price)}</span>
                        </div>
                        <div className="price-row">
                          <span className="label">{t('dashboard.current')}:</span>
                          <span className="price current">{formatPrice(drop.current_price)}</span>
                        </div>
                        <div className="last-updated">
                          {t('dashboard.updated')}: {formatDateTime(drop.last_updated)}
                        </div>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {priceIncreases.length > 0 && (
            <div className="price-changes-section">
              <h2 className="section-title">{t('dashboard.priceIncreases')}</h2>
              <div className="price-drops-grid">
                {priceIncreases.map((increase) => (
                  <Card
                    key={increase.product.id}
                    elevation={1}
                    padding="sm"
                    onClick={() => onCategoryClick('')}
                    className="price-increase-card"
                  >
                    <div className="increase-header">
                      <div className="increase-header-content">
                        <div className="increase-percentage">
                          {formatPercentage(increase.price_drop_percentage)}
                        </div>
                        <div className="increase-amount">
                          {formatPrice(increase.price_drop)}
                        </div>
                      </div>
                    </div>
                    <div className="product-info">
                      <div className="product-asin">{increase.product.asin}</div>
                      {increase.product.categories && increase.product.categories.length > 0 && (
                        <div className="product-categories">
                          {increase.product.categories.map((cat, idx) => (
                            <span key={cat.id}>
                              <button
                                type="button"
                                className="category-badge-btn"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  onCategoryClick(cat.name);
                                }}
                                title={t('dashboard.filterBy', { category: cat.name })}
                              >
                                <Badge variant="info" size="sm">{cat.name}</Badge>
                              </button>
                              {idx < increase.product.categories!.length - 1 && ' > '}
                            </span>
                          ))}
                        </div>
                      )}
                      <a
                        href={`https://www.amazon.com.br/dp/${increase.product.asin}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="product-link"
                      >
                        {increase.product.description}
                      </a>
                      {increase.price_history && increase.price_history.length > 0 && (
                        <div className="mini-chart-container">
                          <MiniPriceChart priceHistory={increase.price_history} />
                        </div>
                      )}
                      <div className="price-info">
                        <div className="price-row">
                          <span className="label">{t('dashboard.previous')}:</span>
                          <span className="price previous">{formatPrice(increase.previous_price)}</span>
                        </div>
                        <div className="price-row">
                          <span className="label">{t('dashboard.current')}:</span>
                          <span className="price current increase">{formatPrice(increase.current_price)}</span>
                        </div>
                        <div className="last-updated">
                          {t('dashboard.updated')}: {formatDateTime(increase.last_updated)}
                        </div>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
