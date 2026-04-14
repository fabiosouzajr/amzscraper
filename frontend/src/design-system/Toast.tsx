import React, { useEffect, useRef } from 'react';
import { CheckCircle, XCircle, Info, AlertCircle, X } from 'lucide-react';
import styles from './Toast.module.css';

export type ToastVariant = 'success' | 'error' | 'info' | 'warning';
export type ToastPosition = 'top-right' | 'top-center' | 'top-left' | 'bottom-right' | 'bottom-center' | 'bottom-left';

export interface ToastProps {
  /**
   * Unique identifier for the toast
   */
  id: string;

  /**
   * Visual variant
   */
  variant: ToastVariant;

  /**
   * Toast message
   */
  message: React.ReactNode;

  /**
   * Optional title
   */
  title?: string;

  /**
   * Whether to show close button
   */
  showClose?: boolean;

  /**
   * Auto-dismiss duration in ms (0 to disable)
   */
  duration?: number;

  /**
   * Position in viewport
   */
  position?: ToastPosition;

  /**
   * Callback when dismissed
   */
  onDismiss: (id: string) => void;

  /**
   * Custom className
   */
  className?: string;
}

export const Toast: React.FC<ToastProps> = ({
  id,
  variant,
  message,
  title,
  showClose = true,
  duration = 5000,
  position = 'top-right',
  onDismiss,
  className = '',
}) => {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progressBarRef = useRef<HTMLDivElement>(null);

  // Auto-dismiss timer
  useEffect(() => {
    if (duration > 0) {
      timerRef.current = setTimeout(() => {
        onDismiss(id);
      }, duration);
    }

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [duration, id, onDismiss]);

  const handleDismiss = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    onDismiss(id);
  };

  const getIcon = () => {
    switch (variant) {
      case 'success':
        return <CheckCircle size={20} />;
      case 'error':
        return <XCircle size={20} />;
      case 'warning':
        return <AlertCircle size={20} />;
      case 'info':
      default:
        return <Info size={20} />;
    }
  };

  return (
    <div
      className={`${styles.toast} ${styles[variant]} ${styles[position]} ${className}`}
      role="status"
      aria-atomic="true"
    >
      {/* Icon */}
      <span className={styles.icon}>{getIcon()}</span>

      {/* Content */}
      <div className={styles.content}>
        {title && <p className={styles.title}>{title}</p>}
        <p className={styles.message}>{message}</p>
      </div>

      {/* Close button */}
      {showClose && (
        <button
          type="button"
          className={styles.closeButton}
          onClick={handleDismiss}
          aria-label="Dismiss notification"
        >
          <X size={16} />
        </button>
      )}

      {/* Progress bar (for auto-dismiss) */}
      {duration > 0 && (
        <div className={styles.progress} ref={progressBarRef}>
          <div
            className={styles.progressInner}
            style={{
              animationDuration: `${duration}ms`,
            }}
          />
        </div>
      )}
    </div>
  );
};

/* ========================================
   Toast Container (for managing multiple toasts)
   ======================================== */

export interface ToastContainerProps {
  children: React.ReactNode;
  position?: ToastPosition;
  className?: string;
}

export const ToastContainer: React.FC<ToastContainerProps> = ({
  children,
  position = 'top-right',
  className = '',
}) => {
  return (
    <div
      className={`${styles.container} ${styles[position]} ${className}`}
      role="region"
      aria-live="polite"
      aria-label="Notifications"
    >
      {children}
    </div>
  );
};
