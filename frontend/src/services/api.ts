import { Product, ProductWithPrice, PriceDrop, Category, User, UserList } from '../types';

const API_BASE_URL = '/api';

// Helper to get auth headers
const getAuthHeaders = (): HeadersInit => {
  const token = localStorage.getItem('authToken');
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
};

export const api = {
  // Authentication
  async login(username: string, password: string): Promise<{ user: User; token: string }> {
    const response = await fetch(`${API_BASE_URL}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ username, password }),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to login');
    }
    return response.json();
  },

  async register(username: string, password: string): Promise<{ user: User; token: string }> {
    const response = await fetch(`${API_BASE_URL}/auth/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ username, password }),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to register');
    }
    return response.json();
  },

  async logout(): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/auth/logout`, {
      method: 'POST',
      headers: getAuthHeaders(),
    });
    if (!response.ok) {
      // Don't throw error on logout failure
      console.error('Logout request failed');
    }
  },

  async getCurrentUser(): Promise<User> {
    const response = await fetch(`${API_BASE_URL}/auth/me`, {
      headers: getAuthHeaders(),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to get current user');
    }
    return response.json();
  },

  // Lists
  async getLists(): Promise<UserList[]> {
    const response = await fetch(`${API_BASE_URL}/lists`, {
      headers: getAuthHeaders(),
    });
    if (!response.ok) {
      throw new Error('Failed to fetch lists');
    }
    return response.json();
  },

  async createList(name: string): Promise<UserList> {
    const response = await fetch(`${API_BASE_URL}/lists`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ name }),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to create list');
    }
    return response.json();
  },

  async updateList(listId: number, name: string): Promise<UserList> {
    const response = await fetch(`${API_BASE_URL}/lists/${listId}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify({ name }),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to update list');
    }
    return response.json();
  },

  async deleteList(listId: number): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/lists/${listId}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to delete list');
    }
  },

  async addProductToList(listId: number, productId: number): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/lists/${listId}/products`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ productId }),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to add product to list');
    }
  },

  async removeProductFromList(listId: number, productId: number): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/lists/${listId}/products/${productId}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to remove product from list');
    }
  },

  // Products
  async getProducts(categoryFilter?: string): Promise<Product[]> {
    const url = categoryFilter 
      ? `${API_BASE_URL}/products?category=${encodeURIComponent(categoryFilter)}`
      : `${API_BASE_URL}/products`;
    const response = await fetch(url, {
      headers: getAuthHeaders(),
    });
    if (!response.ok) {
      throw new Error('Failed to fetch products');
    }
    return response.json();
  },

  async getProduct(id: number): Promise<ProductWithPrice> {
    const response = await fetch(`${API_BASE_URL}/products/${id}`, {
      headers: getAuthHeaders(),
    });
    if (!response.ok) {
      throw new Error('Failed to fetch product');
    }
    return response.json();
  },

  async searchProducts(query: string, categoryFilter?: string): Promise<Product[]> {
    const url = categoryFilter
      ? `${API_BASE_URL}/products/search?q=${encodeURIComponent(query)}&category=${encodeURIComponent(categoryFilter)}`
      : `${API_BASE_URL}/products/search?q=${encodeURIComponent(query)}`;
    const response = await fetch(url, {
      headers: getAuthHeaders(),
    });
    if (!response.ok) {
      throw new Error('Failed to search products');
    }
    return response.json();
  },

  async getCategories(): Promise<Category[]> {
    const response = await fetch(`${API_BASE_URL}/products/categories`, {
      headers: getAuthHeaders(),
    });
    if (!response.ok) {
      throw new Error('Failed to fetch categories');
    }
    return response.json();
  },

  async addProduct(asin: string): Promise<Product> {
    const response = await fetch(`${API_BASE_URL}/products`, {
      method: 'POST',
      headers: getAuthHeaders(),
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
      headers: getAuthHeaders(),
    });
    if (!response.ok) {
      throw new Error('Failed to delete product');
    }
  },

  // Dashboard
  async getPriceDrops(limit: number = 10): Promise<PriceDrop[]> {
    const response = await fetch(`${API_BASE_URL}/dashboard/drops?limit=${limit}`, {
      headers: getAuthHeaders(),
    });
    if (!response.ok) {
      throw new Error('Failed to fetch price drops');
    }
    return response.json();
  },

  // Prices
  async updatePrices(): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/prices/update`, {
      method: 'POST',
      headers: getAuthHeaders(),
    });
    if (!response.ok) {
      throw new Error('Failed to trigger price update');
    }
  },

  // Config
  async getDatabaseInfo(): Promise<{ productCount: number; databaseSize: number; databaseSizeFormatted: string }> {
    const response = await fetch(`${API_BASE_URL}/config/database-info`, {
      headers: getAuthHeaders(),
    });
    if (!response.ok) {
      throw new Error('Failed to fetch database information');
    }
    return response.json();
  },

  async exportDatabase(): Promise<Blob> {
    const response = await fetch(`${API_BASE_URL}/config/export-database`, {
      headers: getAuthHeaders(),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to export database');
    }
    return response.blob();
  },
};

