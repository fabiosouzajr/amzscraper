import { useState, useEffect } from 'react';
import { api } from '../services/api';
import { PriceDrop } from '../types';

export function Dashboard() {
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
      setError('Failed to load price drops');
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
    setUpdateStatus('Starting price update...');
    setError(null);
    
    try {
      // Start the update
      await api.updatePrices();
      setUpdateStatus('Price update started. Processing products...');
      
      // Simulate progress (since we don't have real-time updates from backend)
      // We'll poll for completion by checking if prices changed
      const progressInterval = setInterval(() => {
        setUpdateProgress((prev) => {
          const newProgress = Math.min(prev + 10, 90);
          if (newProgress < 50) {
            setUpdateStatus('Scraping product pages...');
          } else if (newProgress < 80) {
            setUpdateStatus('Comparing prices...');
          } else {
            setUpdateStatus('Finalizing updates...');
          }
          return newProgress;
        });
      }, 500);
      
      // Wait a bit for the update to complete, then refresh
      setTimeout(async () => {
        clearInterval(progressInterval);
        setUpdateProgress(100);
        setUpdateStatus('Update complete! Refreshing dashboard...');
        
        // Small delay before refreshing to show completion
        await new Promise(resolve => setTimeout(resolve, 500));
        
        await loadPriceDrops();
        setUpdating(false);
        setUpdateProgress(0);
        setUpdateStatus('');
      }, 10000); // Wait 10 seconds for update to complete
      
    } catch (err) {
      setError('Failed to trigger price update');
      setUpdateStatus('');
      setUpdating(false);
      setUpdateProgress(0);
      console.error(err);
    }
  };

  if (loading) {
    return <div className="loading">Loading dashboard...</div>;
  }

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <h1>Price Drop Dashboard</h1>
        <button
          onClick={handleUpdatePrices}
          disabled={updating}
          className="update-button"
        >
          {updating ? 'Updating...' : 'Update Prices Now'}
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
          <p>No price drops to display yet.</p>
          <p>Add some products and wait for price updates, or click "Update Prices Now" to check immediately.</p>
        </div>
      ) : (
        <div className="price-drops-grid">
          {priceDrops.map((drop) => (
            <div key={drop.product.id} className="price-drop-card">
              <div className="drop-header">
                <div className="drop-percentage">
                  {drop.price_drop_percentage.toFixed(1)}% OFF
                </div>
                <div className="drop-amount">
                  -R$ {drop.price_drop.toFixed(2)}
                </div>
              </div>
              <div className="product-info">
                <div className="product-asin">{drop.product.asin}</div>
                <div className="product-description">{drop.product.description}</div>
              </div>
              <div className="price-info">
                <div className="price-row">
                  <span className="label">Previous:</span>
                  <span className="price previous">R$ {drop.previous_price.toFixed(2)}</span>
                </div>
                <div className="price-row">
                  <span className="label">Current:</span>
                  <span className="price current">R$ {drop.current_price.toFixed(2)}</span>
                </div>
                <div className="last-updated">
                  Updated: {new Date(drop.last_updated).toLocaleString()}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

