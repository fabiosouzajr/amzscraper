import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { api } from '../services/api';
import { ProductWithPrice } from '../types';

interface ProductDetailProps {
  productId: number;
  onBack: () => void;
}

export function ProductDetail({ productId, onBack }: ProductDetailProps) {
  const { t } = useTranslation();
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
        setError(t('productDetail.failedToLoad'));
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    loadProduct();
  }, [productId]);

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
        date: new Date(ph.date).toLocaleDateString(),
        price: ph.price
      }))
    : [];

  return (
    <div className="product-detail">
      <button onClick={onBack} className="back-button">{t('productDetail.back')}</button>
      
      <div className="product-header">
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
        <div className="product-meta">
          <span className="asin-badge">{t('productDetail.asin')}: {product.asin}</span>
          <span className="date-badge">
            {t('productDetail.added')}: {new Date(product.created_at).toLocaleDateString()}
          </span>
        </div>
      </div>

      <div className="price-info">
        {product.current_price !== undefined ? (
          <>
            <div className="current-price">
              <span className="label">{t('productDetail.currentPrice')}</span>
              <span className="value">R$ {product.current_price.toFixed(2)}</span>
            </div>
            {product.previous_price !== undefined && (
              <div className="price-comparison">
                <div className="previous-price">
                  <span className="label">{t('productDetail.previousPrice')}</span>
                  <span className="value">R$ {product.previous_price.toFixed(2)}</span>
                </div>
                {product.price_drop !== undefined && product.price_drop > 0 && (
                  <div className="price-drop">
                    <span className="label">{t('productDetail.priceDrop')}</span>
                    <span className="value positive">
                      -R$ {product.price_drop.toFixed(2)} ({product.price_drop_percentage?.toFixed(1)}%)
                    </span>
                  </div>
                )}
              </div>
            )}
            {product.last_updated && (
              <div className="last-updated">
                {t('productDetail.lastUpdated')}: {new Date(product.last_updated).toLocaleString()}
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

