import React from 'react';
import styles from './ProgressBar.module.css';

export interface ProgressBarProps {
  /**
   * Progress value (0-100) for determinate mode
   * Omit for indeterminate mode
   */
  value?: number;

  /**
   * Minimum value (default: 0)
   */
  min?: number;

  /**
   * Maximum value (default: 100)
   */
  max?: number;

  /**
   * Size variant
   */
  size?: 'sm' | 'md' | 'lg';

  /**
   * Color variant
   */
  variant?: 'primary' | 'success' | 'danger' | 'warning' | 'info';

  /**
   * Whether to show percentage label
   */
  showLabel?: boolean;

  /**
   * Custom label text
   */
  label?: string;

  /**
   * Whether to animate the progress
   */
  animate?: boolean;

  /**
   * Custom className
   */
  className?: string;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({
  value,
  min = 0,
  max = 100,
  size = 'md',
  variant = 'primary',
  showLabel = false,
  label,
  animate = true,
  className = '',
}) => {
  const isDeterminate = value !== undefined;
  const percentage = isDeterminate
    ? Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100))
    : undefined;

  const displayLabel = label !== undefined
    ? label
    : percentage !== undefined
      ? `${Math.round(percentage)}%`
      : undefined;

  return (
    <div
      className={`${styles.progressBar} ${styles[size]} ${styles[variant]} ${
        !animate ? styles.noAnimate : ''
      } ${className}`}
      role="progressbar"
      aria-valuenow={isDeterminate ? value : undefined}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuetext={displayLabel}
    >
      <div className={styles.track}>
        <div
          className={styles.fill}
          style={{
            width: isDeterminate ? `${percentage}%` : undefined,
          }}
        >
          {isDeterminate && size === 'lg' && (
            <div className={styles.glow} />
          )}
        </div>
      </div>

      {showLabel && displayLabel && (
        <span className={styles.label}>{displayLabel}</span>
      )}
    </div>
  );
};

/* ========================================
   Linear Progress (thin, full width)
   ======================================== */

export interface LinearProgressProps {
  value?: number;
  min?: number;
  max?: number;
  variant?: 'primary' | 'success' | 'danger' | 'warning' | 'info';
  height?: string;
  animate?: boolean;
  className?: string;
}

export const LinearProgress: React.FC<LinearProgressProps> = ({
  value,
  min = 0,
  max = 100,
  variant = 'primary',
  height = '4px',
  animate = true,
  className = '',
}) => {
  const isDeterminate = value !== undefined;
  const percentage = isDeterminate
    ? Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100))
    : undefined;

  return (
    <div
      className={`${styles.linearProgress} ${styles[variant]} ${
        !animate ? styles.noAnimate : ''
      } ${className}`}
      style={{ height }}
      role="progressbar"
      aria-valuenow={isDeterminate ? value : undefined}
      aria-valuemin={min}
      aria-valuemax={max}
    >
      <div
        className={styles.linearFill}
        style={{
          width: isDeterminate ? `${percentage}%` : undefined,
        }}
      />
    </div>
  );
};
