export interface Category {
  id: number;
  name: string;
  level: number;
}

export interface Product {
  id: number;
  asin: string;
  description: string;
  categories?: Category[];
  lists?: UserList[];
  created_at: string;
}

export interface PriceHistory {
  id: number;
  product_id: number;
  price: number;
  date: string;
  created_at: string;
}

export interface ProductWithPrice extends Product {
  current_price?: number;
  previous_price?: number;
  price_drop?: number;
  price_drop_percentage?: number;
  last_updated?: string;
  price_history?: PriceHistory[];
}

export interface PriceDrop {
  product: Product;
  current_price: number;
  previous_price: number;
  price_drop: number;
  price_drop_percentage: number;
  last_updated: string;
  price_history?: PriceHistory[];
}

export type UserRole = 'USER' | 'ADMIN';

export interface UserStats {
  product_count: number;
  list_count: number;
  price_history_count: number;
}

export interface SystemStats {
  total_users: number;
  total_admins: number;
  disabled_users: number;
  total_products: number;
  active_users: number;
  total_price_history: number;
}

export interface SystemConfig {
  key: string;
  value: string;
  description?: string;
  updated_at?: string;
  updated_by?: number;
}

export interface User {
  id: number;
  username: string;
  role: UserRole;
  is_disabled?: boolean;
  created_at: string;
  product_count?: number;
  list_count?: number;
  price_history_count?: number;
  stats?: UserStats;
}

export interface UserList {
  id: number;
  user_id: number;
  name: string;
  created_at: string;
}

export interface AuditLog {
  id: number;
  admin_user_id: number;
  admin_username: string;
  action: string;
  target_type?: string;
  target_id?: number;
  details?: string;
  created_at: string;
}

