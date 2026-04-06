import React, { useState, lazy, Suspense, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import { PriceDrop } from '../types';
import { usePriceDrops, usePriceIncreases, usePullToRefresh } from '../hooks';
import { formatDateTime } from '../utils/dateFormat';
import { PullToRefreshIndicator } from './PullToRefreshIndicator';
import styles from './Dashboard.module.css';

const MiniPriceChart = lazy(() => import('./MiniPriceChart').then(m => ({ default: m.MiniPriceChart })));
import { formatPrice, formatPercentage } from '../utils/numberFormat';
import { Card, Button, ProgressBar, EmptyState } from '../design-system';

interface DashboardProps {
  onCategoryClick: (categoryName: string) => void;
}

interface PriceChangeCardProps {
  item: PriceDrop;
  variant: 'drop' | 'increase';
  onCategoryClick: (categoryName: string) => void;
}

type LowestPriceBadgeWindow = 7 | 30 | 365;

function getLowestPriceBadgeWindow(item: PriceDrop): LowestPriceBadgeWindow | null {
  if (!item.price_history || item.price_history.length === 0) {
    return null;
  }

  const referenceDate = Number.isNaN(new Date(item.last_updated).getTime())
    ? new Date()
    : new Date(item.last_updated);
  const pricePoints = [...item.price_history.map((entry) => ({
    price: entry.price,
    date: new Date(entry.date),
  }))];

  // Ensure the current observation is part of the comparison window.
  pricePoints.push({ price: item.current_price, date: referenceDate });

  const validPoints = pricePoints.filter((point) => !Number.isNaN(point.date.getTime()));
  if (validPoints.length === 0) {
    return null;
  }

  const oldestPointTime = Math.min(...validPoints.map((point) => point.date.getTime()));
  const centsEpsilon = 0.005;
  const windows: LowestPriceBadgeWindow[] = [365, 30, 7];

  for (const windowDays of windows) {
    const windowStart = new Date(referenceDate);
    windowStart.setDate(referenceDate.getDate() - (windowDays - 1));
    const hasFullWindowCoverage = oldestPointTime <= windowStart.getTime();
    if (!hasFullWindowCoverage) {
      continue;
    }

    const pointsInWindow = validPoints.filter((point) => point.date >= windowStart);
    if (pointsInWindow.length === 0) {
      continue;
    }

    const minPriceInWindow = Math.min(...pointsInWindow.map((point) => point.price));
    if (item.current_price <= minPriceInWindow + centsEpsilon) {
      return windowDays;
    }
  }

  return null;
}

const PriceChangeCard = React.memo(function PriceChangeCard({ item, variant, onCategoryClick }: PriceChangeCardProps) {
  const { t } = useTranslation();
  const cardClass = variant === 'drop' ? styles.priceDropCard : styles.priceIncreaseCard;
  const changePanelClass = variant === 'drop' ? styles.changePanelDrop : styles.changePanelIncrease;
  const changePercentageClass = variant === 'drop' ? styles.changePercentageDrop : styles.changePercentageIncrease;
  const changeAmountClass = variant === 'drop' ? styles.changeAmountDrop : styles.changeAmountIncrease;
  const directionPillClass = variant === 'drop' ? styles.directionPillDrop : styles.directionPillIncrease;
  const directionSymbol = variant === 'drop' ? '▼' : '▲';
  const lowestBadgeWindow = getLowestPriceBadgeWindow(item);
  const lowestBadgeClass = lowestBadgeWindow === 365
    ? styles.lowestBadge365
    : lowestBadgeWindow === 30
      ? styles.lowestBadge30
      : styles.lowestBadge7;

  return (
    <Card
      elevation={1}
      padding="sm"
      onClick={() => onCategoryClick('')}
      className={cardClass}
    >
      {lowestBadgeWindow && (
        <span className={`${styles.cornerBadge} ${lowestBadgeClass}`}>
          <span className={styles.cornerBadgeIcon} aria-hidden="true">editor_choice</span>
          <span className={styles.cornerBadgeText}>
            {t('dashboard.lowestPriceInDays', { days: lowestBadgeWindow })}
          </span>
        </span>
      )}
      <div className={styles.cardTopSection}>
        <div className={styles.priceSummary}>
          <div className={styles.currentRow}>
            <span className={styles.currentLabel}>{t('dashboard.current')}</span>
            <span className={`${styles.directionPill} ${directionPillClass}`}>{directionSymbol}</span>
          </div>
          <div className={styles.currentPrice}>{formatPrice(item.current_price)}</div>
          <div className={styles.previousRow}>
            <span className={styles.previousLabel}>{t('dashboard.previous')}:</span>
            <span className={styles.previousPrice}>{formatPrice(item.previous_price)}</span>
          </div>
          <div className={styles.lastUpdated}>
            {t('dashboard.updated')}: {formatDateTime(item.last_updated)}
          </div>
        </div>
        <div className={`${styles.changePanel} ${changePanelClass}`}>
          <div className={changePercentageClass}>
            {formatPercentage(item.price_drop_percentage)}
          </div>
          <div className={changeAmountClass}>
            {formatPrice(item.price_drop)}
          </div>
        </div>
      </div>
      <div className={styles.productInfo}>
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
            {item.product.image_url && (
              <img
                src={item.product.image_url}
                alt={item.product.description}
                className={styles.productThumbnail}
              />
            )}
            <div className={styles.chartWrapper}>
              <Suspense fallback={null}>
                <MiniPriceChart priceHistory={item.price_history} />
              </Suspense>
            </div>
          </div>
        )}
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
  const [sortBy, setSortBy] = useState<'date' | 'dropAmount' | 'increaseAmount'>('date');

  const sortPriceChanges = useCallback(
    (items: PriceDrop[]) => {
      return [...items].sort((a, b) => {
        if (sortBy === 'date') {
          const aTime = new Date(a.last_updated).getTime() || 0;
          const bTime = new Date(b.last_updated).getTime() || 0;
          return bTime - aTime;
        }
        return b.price_drop - a.price_drop;
      });
    },
    [sortBy]
  );

  const sortedDrops = useMemo(() => sortPriceChanges(drops), [drops, sortPriceChanges]);
  const sortedIncreases = useMemo(() => sortPriceChanges(increases), [increases, sortPriceChanges]);

  const handlePullRefresh = useCallback(async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['priceDrops'] }),
      qc.invalidateQueries({ queryKey: ['priceIncreases'] }),
    ]);
  }, [qc]);

  const { progress: pullProgress, refreshing: pullRefreshing } = usePullToRefresh({
    onRefresh: handlePullRefresh,
  });

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
      <PullToRefreshIndicator progress={pullProgress} refreshing={pullRefreshing} />
      <div className={styles.dashboardHeader}>
        <div className={styles.headerLeft}>
          <Button
            onClick={handleUpdatePrices}
            disabled={updating}
            variant="primary"
            size="md"
          >
            {updating ? t('dashboard.updating') : t('dashboard.updatePrices')}
          </Button>
        </div>
        <h1 className={styles.headerTitle}>{t('dashboard.title')}</h1>
        <div className={`${styles.headerRight} ${styles.sortFilterRow}`}>
          <select
            id="dashboard-sort-select"
            className={styles.sortFilterSelect}
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as 'date' | 'dropAmount' | 'increaseAmount')}
          >
            <option value="date">{t('dashboard.sortDate')}</option>
            <option value="dropAmount">{t('dashboard.sortDropAmount')}</option>
            <option value="increaseAmount">{t('dashboard.sortIncreaseAmount')}</option>
          </select>
        </div>
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

      {sortedDrops.length === 0 && sortedIncreases.length === 0 ? (
        <EmptyState
          title={t('dashboard.noPriceChanges')}
          description={t('dashboard.noPriceChangesHint')}
          variant="no-data"
        />
      ) : (
        <>
          {sortedDrops.length > 0 && (
            <div className={styles.priceChangesSection}>
              <h2 className={styles.sectionTitle}>{t('dashboard.priceDrops')}</h2>
              <div className={styles.priceDropsGrid}>
                {sortedDrops.map((drop) => (
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

          {sortedIncreases.length > 0 && (
            <div className={styles.priceChangesSection}>
              <h2 className={styles.sectionTitle}>{t('dashboard.priceIncreases')}</h2>
              <div className={styles.priceDropsGrid}>
                {sortedIncreases.map((increase) => (
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
