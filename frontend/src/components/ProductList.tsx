import { useState, useEffect } from 'react';
import { api } from '../services/api';
import { Product } from '../types';
import { ASINInput } from './ASINInput';

export function ProductList() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isValidating, setIsValidating] = useState(false);

  const loadProducts = async () => {
    try {
      setLoading(true);
      const data = await api.getProducts();
      setProducts(data);
      setError(null);
    } catch (err) {
      setError('Failed to load products');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProducts();
  }, []);

  const handleAddProduct = async (asin: string) => {
    setIsValidating(true);
    setError(null);
    try {
      await api.addProduct(asin);
      await loadProducts();
    } catch (err: any) {
      setError(err.message || 'Failed to add product');
      throw err;
    } finally {
      setIsValidating(false);
    }
  };

  const handleDeleteProduct = async (id: number) => {
    if (!confirm('Are you sure you want to remove this product?')) {
      return;
    }
    try {
      await api.deleteProduct(id);
      await loadProducts();
    } catch (err) {
      setError('Failed to delete product');
      console.error(err);
    }
  };

  if (loading) {
    return <div className="loading">Loading products...</div>;
  }

  return (
    <div className="product-list">
      <h2>Manage Products</h2>
      
      <div className="add-product-section">
        <h3>Add New Product</h3>
        <ASINInput onAdd={handleAddProduct} isValidating={isValidating} error={error} />
      </div>

      <div className="products-section">
        <h3>Tracked Products ({products.length})</h3>
        {products.length === 0 ? (
          <p className="empty-state">No products tracked yet. Add an ASIN above to get started.</p>
        ) : (
          <div className="products-grid">
            {products.map((product) => (
              <div key={product.id} className="product-card">
                <div className="product-info">
                  <div 
                    className="product-description"
                    title={product.description}
                  >
                    {product.description.length > 25 
                      ? `${product.description.substring(0, 25)}...` 
                      : product.description}
                  </div>
                </div>
                <div className="product-actions">
                  <button
                    className="delete-button"
                    onClick={() => handleDeleteProduct(product.id)}
                  >
                    Remove
                  </button>
                  <div className="product-asin">{product.asin}</div>
                  <div className="product-date">
                    Added: {new Date(product.created_at).toLocaleDateString()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

