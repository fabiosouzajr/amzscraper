import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../services/api';
import { PriceDrop } from '../types';
import { MiniPriceChart } from './MiniPriceChart';

interface DashboardProps {
  onCategoryClick: (categoryName: string) => void;
}

export function Dashboard({ onCategoryClick }: DashboardProps) {
  const { t } = useTranslation();
  const [priceDrops, setPriceDrops] = useState<PriceDrop[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [updateProgress, setUpdateProgress] = useState(0);
  const [updateStatus, setUpdateStatus] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  const loadPriceDrops = async () => {
    try {
      setLoading(true);
      const data = await api.getPriceDrops(20);
      setPriceDrops(data);
      setError(null);
    } catch (err) {
      setError(t('dashboard.failedToLoad'));
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPriceDrops();
  }, []);

  const handleUpdatePrices = async () => {
    setUpdating(true);
    setUpdateProgress(0);
    setUpdateStatus(t('dashboard.startingUpdate'));
    setError(null);
    
    try {
      // Start the update
      await api.updatePrices();
      setUpdateStatus(t('dashboard.updateStarted'));
      
      // Simulate progress (since we don't have real-time updates from backend)
      // We'll poll for completion by checking if prices changed
      const progressInterval = setInterval(() => {
        setUpdateProgress((prev) => {
          const newProgress = Math.min(prev + 10, 90);
          if (newProgress < 50) {
            setUpdateStatus(t('dashboard.scraping'));
          } else if (newProgress < 80) {
            setUpdateStatus(t('dashboard.comparing'));
          } else {
            setUpdateStatus(t('dashboard.finalizing'));
          }
          return newProgress;
        });
      }, 500);
      
      // Wait a bit for the update to complete, then refresh
      setTimeout(async () => {
        clearInterval(progressInterval);
        setUpdateProgress(100);
        setUpdateStatus(t('dashboard.updateComplete'));
        
        // Small delay before refreshing to show completion
        await new Promise(resolve => setTimeout(resolve, 500));
        
        await loadPriceDrops();
        setUpdating(false);
        setUpdateProgress(0);
        setUpdateStatus('');
      }, 10000); // Wait 10 seconds for update to complete
      
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
        <button
          onClick={handleUpdatePrices}
          disabled={updating}
          className="update-button"
        >
          {updating ? t('dashboard.updating') : t('dashboard.updatePrices')}
        </button>
      </div>

      {error && <div className="error-message">{error}</div>}

      {updating && (
        <div className="update-progress-container">
          <div className="progress-bar-wrapper">
            <div 
              className="progress-bar" 
              style={{ width: `${updateProgress}%` }}
            ></div>
          </div>
          <div className="progress-status">{updateStatus}</div>
          <div className="progress-percentage">{updateProgress}%</div>
        </div>
      )}

      {priceDrops.length === 0 ? (
        <div className="empty-state">
          <p>{t('dashboard.noPriceDrops')}</p>
          <p>{t('dashboard.noPriceDropsHint')}</p>
        </div>
      ) : (
        <div className="price-drops-grid">
          {priceDrops.map((drop) => (
            <div key={drop.product.id} className="price-drop-card">
              <div className="drop-header">
                <div className="drop-percentage">
                  {drop.price_drop_percentage.toFixed(1)}% {t('dashboard.off')}
                </div>
                <div className="drop-amount">
                  -R$ {drop.price_drop.toFixed(2)}
                </div>
              </div>
              <div className="product-info">
                <div className="product-asin">{drop.product.asin}</div>
                {drop.product.categories && drop.product.categories.length > 0 && (
                  <div className="product-categories">
                    {drop.product.categories.map((cat, idx) => (
                      <span key={cat.id}>
                        <button
                          className="category-badge category-filter-button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            onCategoryClick(cat.name);
                          }}
                          title={t('dashboard.filterBy', { category: cat.name })}
                        >
                          {cat.name}
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
                  className="product-description product-link"
                >
                  {drop.product.description}
                </a>
                {drop.price_history && drop.price_history.length > 0 && (
                  <div className="mini-chart-container">
                    <MiniPriceChart priceHistory={drop.price_history} />
                  </div>
                )}
              </div>
              <div className="price-info">
                <div className="price-row">
                  <span className="label">{t('dashboard.previous')}:</span>
                  <span className="price previous">R$ {drop.previous_price.toFixed(2)}</span>
                </div>
                <div className="price-row">
                  <span className="label">{t('dashboard.current')}:</span>
                  <span className="price current">R$ {drop.current_price.toFixed(2)}</span>
                </div>
                <div className="last-updated">
                  {t('dashboard.updated')}: {new Date(drop.last_updated).toLocaleString()}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

