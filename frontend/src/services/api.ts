import { Product, ProductWithPrice, PriceDrop } from '../types';

const API_BASE_URL = '/api';

export const api = {
  // Products
  async getProducts(): Promise<Product[]> {
    const response = await fetch(`${API_BASE_URL}/products`);
    if (!response.ok) {
      throw new Error('Failed to fetch products');
    }
    return response.json();
  },

  async getProduct(id: number): Promise<ProductWithPrice> {
    const response = await fetch(`${API_BASE_URL}/products/${id}`);
    if (!response.ok) {
      throw new Error('Failed to fetch product');
    }
    return response.json();
  },

  async searchProducts(query: string): Promise<Product[]> {
    const response = await fetch(`${API_BASE_URL}/products/search?q=${encodeURIComponent(query)}`);
    if (!response.ok) {
      throw new Error('Failed to search products');
    }
    return response.json();
  },

  async addProduct(asin: string): Promise<Product> {
    const response = await fetch(`${API_BASE_URL}/products`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ asin }),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to add product');
    }
    return response.json();
  },

  async deleteProduct(id: number): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/products/${id}`, {
      method: 'DELETE',
    });
    if (!response.ok) {
      throw new Error('Failed to delete product');
    }
  },

  // Dashboard
  async getPriceDrops(limit: number = 10): Promise<PriceDrop[]> {
    const response = await fetch(`${API_BASE_URL}/dashboard/drops?limit=${limit}`);
    if (!response.ok) {
      throw new Error('Failed to fetch price drops');
    }
    return response.json();
  },

  // Prices
  async updatePrices(): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/prices/update`, {
      method: 'POST',
    });
    if (!response.ok) {
      throw new Error('Failed to trigger price update');
    }
  },
};

