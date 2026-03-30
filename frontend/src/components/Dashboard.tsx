import React, { useState, lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import { PriceDrop } from '../types';
import { usePriceDrops, usePriceIncreases } from '../hooks';
import { formatDateTime } from '../utils/dateFormat';
import styles from './Dashboard.module.css';

const MiniPriceChart = lazy(() => import('./MiniPriceChart').then(m => ({ default: m.MiniPriceChart })));
import { formatPrice, formatPercentage } from '../utils/numberFormat';
import { Card, Button, ProgressBar, Badge, EmptyState } from '../design-system';

interface DashboardProps {
  onCategoryClick: (categoryName: string) => void;
}

interface PriceChangeCardProps {
  item: PriceDrop;
  variant: 'drop' | 'increase';
  onCategoryClick: (categoryName: string) => void;
}

const PriceChangeCard = React.memo(function PriceChangeCard({ item, variant, onCategoryClick }: PriceChangeCardProps) {
  const { t } = useTranslation();
  const cardClass = variant === 'drop' ? styles.priceDropCard : styles.priceIncreaseCard;
  const headerClass = variant === 'drop' ? styles.dropHeader : styles.increaseHeader;
  const headerContentClass = variant === 'drop' ? styles.dropHeaderContent : styles.increaseHeaderContent;
  const percentageClass = variant === 'drop' ? styles.dropPercentage : styles.increasePercentage;
  const amountClass = variant === 'drop' ? styles.dropAmount : styles.increaseAmount;
  const currentPriceClass = variant === 'drop' ? 'price current' : 'price current increase';

  return (
    <Card
      elevation={1}
      padding="sm"
      onClick={() => onCategoryClick('')}
      className={cardClass}
    >
      <div className={headerClass}>
        <div className={headerContentClass}>
          <div className={percentageClass}>
            {formatPercentage(item.price_drop_percentage)}
          </div>
          <div className={amountClass}>
            {formatPrice(item.price_drop)}
          </div>
        </div>
      </div>
      <div className="product-info">
        <div className="product-asin">{item.product.asin}</div>
        {item.product.categories && item.product.categories.length > 0 && (
          <div className="product-categories">
            {item.product.categories.map((cat, idx) => (
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
                {idx < item.product.categories!.length - 1 && ' > '}
              </span>
            ))}
          </div>
        )}
        <a
          href={`https://www.amazon.com.br/dp/${item.product.asin}`}
          target="_blank"
          rel="noopener noreferrer"
          className="product-link"
        >
          {item.product.description}
        </a>
        {item.price_history && item.price_history.length > 0 && (
          <div className={styles.miniChartContainer}>
            <Suspense fallback={null}>
              <MiniPriceChart priceHistory={item.price_history} />
            </Suspense>
          </div>
        )}
        <div className="price-info">
          <div className="price-row">
            <span className="label">{t('dashboard.previous')}:</span>
            <span className="price previous">{formatPrice(item.previous_price)}</span>
          </div>
          <div className="price-row">
            <span className="label">{t('dashboard.current')}:</span>
            <span className={currentPriceClass}>{formatPrice(item.current_price)}</span>
          </div>
          <div className="last-updated">
            {t('dashboard.updated')}: {formatDateTime(item.last_updated)}
          </div>
        </div>
      </div>
    </Card>
  );
});

export function Dashboard({ onCategoryClick }: DashboardProps) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data: drops = [], isLoading: dropsLoading } = usePriceDrops(20);
  const { data: increases = [], isLoading: increasesLoading } = usePriceIncreases(20);
  const loading = dropsLoading || increasesLoading;
  const [updating, setUpdating] = useState(false);
  const [updateProgress, setUpdateProgress] = useState(0);
  const [updateStatus, setUpdateStatus] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

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
            // Invalidate queries to refresh price changes after completion
            setTimeout(() => {
              qc.invalidateQueries({ queryKey: ['priceDrops'] });
              qc.invalidateQueries({ queryKey: ['priceIncreases'] });
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
    <div className={styles.dashboard}>
      <div className={styles.dashboardHeader}>
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
          <div
            aria-live="polite"
            aria-atomic="true"
          >
            <ProgressBar
              value={updateProgress}
              variant="primary"
              size="md"
            />
            <div className={styles.progressStatus}>{updateStatus}</div>
          </div>
        </Card>
      )}

      {drops.length === 0 && increases.length === 0 ? (
        <EmptyState
          title={t('dashboard.noPriceChanges')}
          description={t('dashboard.noPriceChangesHint')}
          variant="no-data"
        />
      ) : (
        <>
          {drops.length > 0 && (
            <div className={styles.priceChangesSection}>
              <h2 className={styles.sectionTitle}>{t('dashboard.priceDrops')}</h2>
              <div className={styles.priceDropsGrid}>
                {drops.map((drop) => (
                  <PriceChangeCard
                    key={drop.product.id}
                    item={drop}
                    variant="drop"
                    onCategoryClick={onCategoryClick}
                  />
                ))}
              </div>
            </div>
          )}

          {increases.length > 0 && (
            <div className={styles.priceChangesSection}>
              <h2 className={styles.sectionTitle}>{t('dashboard.priceIncreases')}</h2>
              <div className={styles.priceDropsGrid}>
                {increases.map((increase) => (
                  <PriceChangeCard
                    key={increase.product.id}
                    item={increase}
                    variant="increase"
                    onCategoryClick={onCategoryClick}
                  />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
