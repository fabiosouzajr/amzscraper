import { Product, ProductWithPrice, PriceDrop, Category, CategoryTreeNode, User, UserList, NotificationChannel, NotificationChannelType, EmailConfig, TelegramConfig, DiscordConfig, NotificationRule, NotificationRuleType, LowestInDaysParams, BelowThresholdParams, PercentageDropParams, NotificationLogEntry, NotificationChannelWithUser, NotificationRuleWithUser, NotificationLogEntryWithUser } from '../types';

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

  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/auth/change-password`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to change password');
    }
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
  async getProducts(categoryFilter?: string, page?: number, pageSize?: number): Promise<{ products: Product[]; pagination: { page: number; pageSize: number; totalCount: number; totalPages: number } }> {
    const params = new URLSearchParams();
    if (categoryFilter) {
      params.append('category', categoryFilter);
    }
    if (page) {
      params.append('page', page.toString());
    }
    if (pageSize) {
      params.append('pageSize', pageSize.toString());
    }
    
    const url = `${API_BASE_URL}/products${params.toString() ? '?' + params.toString() : ''}`;
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

  async getSortedProductIds(): Promise<number[]> {
    const response = await fetch(`${API_BASE_URL}/products/ids/sorted`, {
      headers: getAuthHeaders(),
    });
    if (!response.ok) {
      throw new Error('Failed to fetch sorted product IDs');
    }
    const data = await response.json();
    return data.productIds;
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

  async getCategoryTree(): Promise<CategoryTreeNode[]> {
    const response = await fetch(`${API_BASE_URL}/products/categories/tree`, {
      headers: getAuthHeaders(),
    });
    if (!response.ok) {
      throw new Error('Failed to fetch category tree');
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

  async getPriceIncreases(limit: number = 10): Promise<PriceDrop[]> {
    const response = await fetch(`${API_BASE_URL}/dashboard/increases?limit=${limit}`, {
      headers: getAuthHeaders(),
    });
    if (!response.ok) {
      throw new Error('Failed to fetch price increases');
    }
    return response.json();
  },

  // Prices
  async updatePrices(
    onProgress?: (progress: {
      status: string;
      progress?: number;
      current?: number;
      total?: number;
      currentProduct?: string;
      updated?: number;
      skipped?: number;
      errors?: number;
      error?: string;
    }) => void
  ): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/prices/update`, {
      method: 'POST',
      headers: getAuthHeaders(),
    });
    
    if (!response.ok) {
      throw new Error('Failed to trigger price update');
    }

    if (!response.body) {
      throw new Error('No response body');
    }

    // Handle Server-Sent Events stream
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.substring(6));
              onProgress?.(data);
            } catch (e) {
              console.error('Error parsing progress data:', e);
            }
          }
        }
      }
    } catch (error) {
      console.error('Error reading price update stream:', error);
      throw error;
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

  // Notification API methods
  notifications: {
    async getChannels(): Promise<NotificationChannel[]> {
      const response = await fetch(`${API_BASE_URL}/notifications/channels`, {
        headers: getAuthHeaders()
      });
      if (!response.ok) throw new Error('Failed to fetch notification channels');
      return response.json();
    },

    async createChannel(data: { type: NotificationChannelType; name: string; config: EmailConfig | TelegramConfig | DiscordConfig }): Promise<NotificationChannel> {
      const response = await fetch(`${API_BASE_URL}/notifications/channels`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, config: typeof data.config === 'string' ? data.config : JSON.stringify(data.config) })
      });
      if (!response.ok) throw new Error('Failed to create notification channel');
      return response.json();
    },

    async updateChannel(id: number, data: { name?: string; config?: string | object; enabled?: boolean }): Promise<NotificationChannel> {
      const response = await fetch(`${API_BASE_URL}/notifications/channels/${id}`, {
        method: 'PUT',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (!response.ok) throw new Error('Failed to update notification channel');
      return response.json();
    },

    async deleteChannel(id: number): Promise<void> {
      const response = await fetch(`${API_BASE_URL}/notifications/channels/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      });
      if (!response.ok) throw new Error('Failed to delete notification channel');
    },

    async testChannel(id: number): Promise<{ success: boolean; error?: string }> {
      const response = await fetch(`${API_BASE_URL}/notifications/channels/${id}/test`, {
        method: 'POST',
        headers: getAuthHeaders()
      });
      if (!response.ok) throw new Error('Failed to test notification channel');
      return response.json();
    },

    async getRules(productId?: number): Promise<NotificationRule[]> {
      const params = productId ? `?productId=${productId}` : '';
      const response = await fetch(`${API_BASE_URL}/notifications/rules${params}`, {
        headers: getAuthHeaders()
      });
      if (!response.ok) throw new Error('Failed to fetch notification rules');
      return response.json();
    },

    async createRule(data: { product_id?: number | null; channel_id: number; type: NotificationRuleType; params: LowestInDaysParams | BelowThresholdParams | PercentageDropParams }): Promise<NotificationRule> {
      const response = await fetch(`${API_BASE_URL}/notifications/rules`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, params: typeof data.params === 'string' ? data.params : JSON.stringify(data.params) })
      });
      if (!response.ok) throw new Error('Failed to create notification rule');
      return response.json();
    },

    async updateRule(id: number, data: { channel_id?: number; type?: NotificationRuleType; params?: string | object; enabled?: boolean }): Promise<NotificationRule> {
      const response = await fetch(`${API_BASE_URL}/notifications/rules/${id}`, {
        method: 'PUT',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (!response.ok) throw new Error('Failed to update notification rule');
      return response.json();
    },

    async deleteRule(id: number): Promise<void> {
      const response = await fetch(`${API_BASE_URL}/notifications/rules/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      });
      if (!response.ok) throw new Error('Failed to delete notification rule');
    },

    async getHistory(limit?: number): Promise<NotificationLogEntry[]> {
      const params = limit ? `?limit=${limit}` : '';
      const response = await fetch(`${API_BASE_URL}/notifications/history${params}`, {
        headers: getAuthHeaders()
      });
      if (!response.ok) throw new Error('Failed to fetch notification history');
      return response.json();
    },
  },
};

// Admin API methods
export const adminApi = {
  getUsers: async (limit = 50, offset = 0, search?: string): Promise<User[]> => {
    const params = new URLSearchParams({ limit: limit.toString(), offset: offset.toString() });
    if (search) params.append('search', search);
    const response = await fetch(`${API_BASE_URL}/admin/users?${params}`, {
      headers: getAuthHeaders()
    });
    if (!response.ok) throw new Error('Failed to fetch users');
    const data = await response.json();
    return data.users;
  },

  getUserStats: async (userId: number): Promise<import('../types').UserStats> => {
    const response = await fetch(`${API_BASE_URL}/admin/users/${userId}`, {
      headers: getAuthHeaders()
    });
    if (!response.ok) throw new Error('Failed to fetch user stats');
    return response.json();
  },

  createUser: async (username: string, password: string, role: string): Promise<User> => {
    const response = await fetch(`${API_BASE_URL}/admin/users`, {
      method: 'POST',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, role })
    });
    if (!response.ok) throw new Error('Failed to create user');
    return response.json();
  },

  disableUser: async (userId: number): Promise<void> => {
    const response = await fetch(`${API_BASE_URL}/admin/users/${userId}/disable`, {
      method: 'PATCH',
      headers: getAuthHeaders()
    });
    if (!response.ok) throw new Error('Failed to disable user');
    return response.json();
  },

  enableUser: async (userId: number): Promise<void> => {
    const response = await fetch(`${API_BASE_URL}/admin/users/${userId}/enable`, {
      method: 'PATCH',
      headers: getAuthHeaders()
    });
    if (!response.ok) throw new Error('Failed to enable user');
    return response.json();
  },

  resetPassword: async (userId: number, newPassword: string): Promise<void> => {
    const response = await fetch(`${API_BASE_URL}/admin/users/${userId}/reset-password`, {
      method: 'POST',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ newPassword })
    });
    if (!response.ok) throw new Error('Failed to reset password');
    return response.json();
  },

  getAuditLogs: async (limit = 100, offset = 0, targetType?: string, adminUserId?: number): Promise<import('../types').AuditLog[]> => {
    const params = new URLSearchParams({ limit: limit.toString(), offset: offset.toString() });
    if (targetType) params.append('target_type', targetType);
    if (adminUserId !== undefined) params.append('admin_user_id', adminUserId.toString());
    const response = await fetch(`${API_BASE_URL}/admin/audit?${params}`, {
      headers: getAuthHeaders()
    });
    if (!response.ok) throw new Error('Failed to fetch audit logs');
    return response.json();
  },

  setConfig: async (key: string, value: string): Promise<void> => {
    const response = await fetch(`${API_BASE_URL}/admin/config/${key}`, {
      method: 'PUT',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ value })
    });
    if (!response.ok) throw new Error('Failed to update config');
  },

  getSystemStats: async (): Promise<import('../types').SystemStats> => {
    const response = await fetch(`${API_BASE_URL}/admin/stats`, {
      headers: getAuthHeaders()
    });
    if (!response.ok) throw new Error('Failed to fetch system stats');
    return response.json();
  },

  getAllConfig: async (): Promise<import('../types').SystemConfig[]> => {
    const response = await fetch(`${API_BASE_URL}/admin/config`, {
      headers: getAuthHeaders()
    });
    if (!response.ok) throw new Error('Failed to fetch config');
    return response.json();
  },

  updateConfig: async (key: string, value: string): Promise<void> => {
    const response = await fetch(`${API_BASE_URL}/admin/config/${key}`, {
      method: 'PUT',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ value })
    });
    if (!response.ok) throw new Error('Failed to update config');
    return response.json();
  },

  // Admin notification API methods
  async getNotificationChannels(limit?: number, offset?: number): Promise<NotificationChannelWithUser[]> {
    const params = new URLSearchParams({ limit: (limit || 50).toString(), offset: (offset || 0).toString() });
    const response = await fetch(`${API_BASE_URL}/admin/notifications/channels?${params}`, {
      headers: getAuthHeaders()
    });
    if (!response.ok) throw new Error('Failed to fetch admin notification channels');
    return response.json();
  },

  async getNotificationRules(limit?: number, offset?: number): Promise<NotificationRuleWithUser[]> {
    const params = new URLSearchParams({ limit: (limit || 50).toString(), offset: (offset || 0).toString() });
    const response = await fetch(`${API_BASE_URL}/admin/notifications/rules?${params}`, {
      headers: getAuthHeaders()
    });
    if (!response.ok) throw new Error('Failed to fetch admin notification rules');
    return response.json();
  },

  async getNotificationHistory(limit?: number, offset?: number, userId?: number): Promise<NotificationLogEntryWithUser[]> {
    const params = new URLSearchParams({ limit: (limit || 100).toString(), offset: (offset || 0).toString() });
    if (userId !== undefined) params.append('userId', userId.toString());
    const response = await fetch(`${API_BASE_URL}/admin/notifications/history?${params}`, {
      headers: getAuthHeaders()
    });
    if (!response.ok) throw new Error('Failed to fetch admin notification history');
    return response.json();
  },
};

