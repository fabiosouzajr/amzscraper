import React from 'react';
import { Package, Search, AlertCircle, Inbox } from 'lucide-react';
import styles from './EmptyState.module.css';

export type EmptyStateVariant = 'default' | 'search' | 'error' | 'no-data';

export interface EmptyStateProps {
  /**
   * Visual variant that determines icon and colors
   */
  variant?: EmptyStateVariant;

  /**
   * Icon to display. If not provided, a default icon based on variant is used.
   */
  icon?: React.ReactNode;

  /**
   * Title of the empty state
   */
  title: string;

  /**
   * Optional description text
   */
  description?: string;

  /**
   * Optional action button
   */
  action?: React.ReactNode;

  /**
   * Custom className
   */
  className?: string;

  /**
   * Minimum height for the empty state container
   */
  minHeight?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  variant = 'default',
  icon,
  title,
  description,
  action,
  className = '',
  minHeight = '200px',
}) => {
  const getDefaultIcon = () => {
    switch (variant) {
      case 'search':
        return <Search size={48} />;
      case 'error':
        return <AlertCircle size={48} />;
      case 'no-data':
        return <Inbox size={48} />;
      case 'default':
      default:
        return <Package size={48} />;
    }
  };

  return (
    <div
      className={`${styles.emptyState} ${styles[variant]} ${className}`}
      style={{ minHeight }}
      role="status"
      aria-live="polite"
    >
      <div className={styles.iconContainer}>
        {icon || getDefaultIcon()}
      </div>

      <div className={styles.content}>
        <h3 className={styles.title}>{title}</h3>

        {description && (
          <p className={styles.description}>{description}</p>
        )}

        {action && <div className={styles.action}>{action}</div>}
      </div>
    </div>
  );
};
