export interface Product {
  id: number;
  asin: string;
  description: string;
  categories?: Category[];
  lists?: UserList[];
  created_at: string;
}

export interface Category {
  id: number;
  name: string;
  level: number;
}

export interface PriceHistory {
  id: number;
  product_id: number;
  price: number | null;
  available: boolean;
  unavailable_reason?: string;
  date: string;
  created_at: string;
}

export interface ProductWithPrice extends Product {
  current_price?: number;
  previous_price?: number;
  price_drop?: number;
  price_drop_percentage?: number;
  last_updated?: string;
}

export interface ScrapedProductData {
  asin: string;
  description: string;
  price: number | null;
  available: boolean;
  unavailableReason?: string;
  categories?: string[];
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

export interface User {
  id: number;
  username: string;
  created_at: string;
}

export interface UserList {
  id: number;
  user_id: number;
  name: string;
  created_at: string;
}

