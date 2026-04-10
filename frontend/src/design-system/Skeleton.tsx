import React from 'react';
import styles from './Skeleton.module.css';

export type SkeletonVariant = 'rectangular' | 'circular' | 'text';
export type SkeletonSize = 'sm' | 'md' | 'lg';

export interface SkeletonProps {
  /**
   * Visual variant
   */
  variant?: SkeletonVariant;

  /**
   * Size of the skeleton
   */
  size?: SkeletonSize;

  /**
   * Custom width
   */
  width?: string | number;

  /**
   * Custom height
   */
  height?: string | number;

  /**
   * Number of lines (for text variant)
   */
  lines?: number;

  /**
   * Whether animation is disabled
   */
  animate?: boolean;

  /**
   * Custom className
   */
  className?: string;
}

export const Skeleton: React.FC<SkeletonProps> = ({
  variant = 'rectangular',
  size = 'md',
  width,
  height,
  lines = 1,
  animate = true,
  className = '',
}) => {
  const style: React.CSSProperties = {
    width: width,
    height: height,
  };

  if (variant === 'text' && lines > 1) {
    return (
      <div className={`${styles.textLines} ${!animate ? styles.noAnimate : ''} ${className}`}>
        {Array.from({ length: lines }).map((_, i) => (
          <div
            key={i}
            className={`${styles.skeleton} ${styles.text} ${styles[size]}`}
            style={{
              width: i === lines - 1 ? '60%' : '100%',
            }}
          />
        ))}
      </div>
    );
  }

  return (
    <div
      className={`${styles.skeleton} ${styles[variant]} ${styles[size]} ${
        !animate ? styles.noAnimate : ''
      } ${className}`}
      style={style}
    />
  );
};

/* ========================================
   Card Skeleton Helper
   ======================================== */

export interface CardSkeletonProps {
  /**
   * Whether to show avatar/image
   */
  showAvatar?: boolean;

  /**
   * Number of title lines
   */
  titleLines?: number;

  /**
   * Number of description lines
   */
  descriptionLines?: number;

  /**
   * Custom className
   */
  className?: string;
}

export const CardSkeleton: React.FC<CardSkeletonProps> = ({
  showAvatar = false,
  titleLines = 1,
  descriptionLines = 2,
  className = '',
}) => {
  return (
    <div className={`${styles.cardSkeleton} ${className}`}>
      {showAvatar && <div className={styles.cardSkeletonAvatar} />}

      <div className={styles.cardSkeletonContent}>
        <div className={styles.cardSkeletonTitle}>
          <Skeleton variant="text" size="sm" lines={titleLines} />
        </div>
        <div className={styles.cardSkeletonDescription}>
          <Skeleton variant="text" size="sm" lines={descriptionLines} />
        </div>
      </div>
    </div>
  );
};

/* ========================================
   Table Skeleton Helper
   ======================================== */

export interface TableSkeletonProps {
  /**
   * Number of rows
   */
  rows?: number;

  /**
   * Number of columns
   */
  columns?: number;

  /**
   * Whether to show header row
   */
  showHeader?: boolean;

  /**
   * Custom className
   */
  className?: string;
}

export const TableSkeleton: React.FC<TableSkeletonProps> = ({
  rows = 5,
  columns = 4,
  showHeader = true,
  className = '',
}) => {
  return (
    <div className={`${styles.tableSkeleton} ${className}`}>
      {showHeader && (
        <div className={styles.tableSkeletonHeader}>
          {Array.from({ length: columns }).map((_, i) => (
            <Skeleton key={`header-${i}`} variant="rectangular" size="sm" />
          ))}
        </div>
      )}

      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div key={`row-${rowIndex}`} className={styles.tableSkeletonRow}>
          {Array.from({ length: columns }).map((_, colIndex) => (
            <Skeleton key={`cell-${rowIndex}-${colIndex}`} variant="text" size="sm" />
          ))}
        </div>
      ))}
    </div>
  );
};
