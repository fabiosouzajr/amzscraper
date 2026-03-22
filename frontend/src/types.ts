export interface Category {
  id: number;
  name: string;
  level: number;
}

export interface CategoryTreeNode {
  id: number;
  name: string;
  children: { id: number; name: string }[];
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

// Notification types
export type NotificationChannelType = 'email' | 'telegram' | 'discord';

export interface EmailConfig {
  smtp_host: string;
  smtp_port: number;
  smtp_secure: boolean;
  smtp_user: string;
  smtp_pass: string;
  from_address: string;
  to_address: string;
}

export interface TelegramConfig {
  bot_token: string;
  chat_id: string;
}

export interface DiscordConfig {
  webhook_url: string;
}

export interface NotificationChannel {
  id: number;
  user_id: number;
  type: NotificationChannelType;
  name: string;
  config: EmailConfig | TelegramConfig | DiscordConfig;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface NotificationChannelWithUser extends NotificationChannel {
  username: string;
  role: UserRole;
  is_disabled: boolean;
}

export type NotificationRuleType = 'lowest_in_days' | 'below_threshold' | 'percentage_drop';

export interface LowestInDaysParams { days: number; }
export interface BelowThresholdParams { threshold: number; }
export interface PercentageDropParams { percentage: number; window_days: number; }

export interface NotificationRule {
  id: number;
  user_id: number;
  product_id: number | null;
  channel_id: number;
  type: NotificationRuleType;
  params: LowestInDaysParams | BelowThresholdParams | PercentageDropParams;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface NotificationRuleWithUser extends NotificationRule {
  username: string;
  product_description?: string;
  channel_name: string;
}

export interface NotificationLogEntry {
  id: number;
  user_id: number;
  rule_id: number;
  product_id: number;
  channel_id: number;
  trigger_type: string;
  message: string;
  status: 'sent' | 'failed';
  error_message: string | null;
  created_at: string;
}

export interface NotificationLogEntryWithUser extends NotificationLogEntry {
  username: string;
  product_description?: string;
  channel_name: string;
}

