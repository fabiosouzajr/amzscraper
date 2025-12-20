import { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { api } from '../services/api';
import { ProductWithPrice } from '../types';

interface ProductDetailProps {
  productId: number;
  onBack: () => void;
}

export function ProductDetail({ productId, onBack }: ProductDetailProps) {
  const [product, setProduct] = useState<ProductWithPrice | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadProduct = async () => {
      try {
        setLoading(true);
        const data = await api.getProduct(productId);
        setProduct(data);
        setError(null);
      } catch (err) {
        setError('Failed to load product details');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    loadProduct();
  }, [productId]);

  if (loading) {
    return <div className="loading">Loading product details...</div>;
  }

  if (error || !product) {
    return (
      <div className="error">
        <p>{error || 'Product not found'}</p>
        <button onClick={onBack}>Go Back</button>
      </div>
    );
  }

  // Get price history for chart
  const chartData = product.price_history && product.price_history.length > 0
    ? product.price_history.map((ph) => ({
        date: new Date(ph.date).toLocaleDateString(),
        price: ph.price
      }))
    : [];

  return (
    <div className="product-detail">
      <button onClick={onBack} className="back-button">← Back</button>
      
      <div className="product-header">
        <h2>{product.description}</h2>
        <div className="product-meta">
          <span className="asin-badge">ASIN: {product.asin}</span>
          <span className="date-badge">
            Added: {new Date(product.created_at).toLocaleDateString()}
          </span>
        </div>
      </div>

      <div className="price-info">
        {product.current_price !== undefined ? (
          <>
            <div className="current-price">
              <span className="label">Current Price:</span>
              <span className="value">R$ {product.current_price.toFixed(2)}</span>
            </div>
            {product.previous_price !== undefined && (
              <div className="price-comparison">
                <div className="previous-price">
                  <span className="label">Previous Price:</span>
                  <span className="value">R$ {product.previous_price.toFixed(2)}</span>
                </div>
                {product.price_drop !== undefined && product.price_drop > 0 && (
                  <div className="price-drop">
                    <span className="label">Price Drop:</span>
                    <span className="value positive">
                      -R$ {product.price_drop.toFixed(2)} ({product.price_drop_percentage?.toFixed(1)}%)
                    </span>
                  </div>
                )}
              </div>
            )}
            {product.last_updated && (
              <div className="last-updated">
                Last updated: {new Date(product.last_updated).toLocaleString()}
              </div>
            )}
          </>
        ) : (
          <div className="no-price-data">No price data available yet</div>
        )}
      </div>

      {chartData.length > 0 && (
        <div className="price-chart">
          <h3>Price History</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip formatter={(value: number) => `R$ ${value.toFixed(2)}`} />
              <Legend />
              <Line type="monotone" dataKey="price" stroke="#8884d8" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
      
      {product.price_history && product.price_history.length > 0 && (
        <div className="price-history-table">
          <h3>Price History Details</h3>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Price</th>
              </tr>
            </thead>
            <tbody>
              {product.price_history.map((ph) => (
                <tr key={ph.id}>
                  <td>{new Date(ph.date).toLocaleString()}</td>
                  <td>R$ {ph.price.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

