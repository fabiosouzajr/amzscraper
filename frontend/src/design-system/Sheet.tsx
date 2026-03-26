import React, { useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X as XIcon } from 'lucide-react';
import styles from './Sheet.module.css';

export type SheetPosition = 'right' | 'left' | 'top' | 'bottom';
export type SheetSize = 'sm' | 'md' | 'lg' | 'xl' | 'full';

export interface SheetProps {
  /**
   * Whether the sheet is open
   */
  isOpen: boolean;

  /**
   * Callback when sheet should close
   */
  onClose: () => void;

  /**
   * Sheet content
   */
  children: React.ReactNode;

  /**
   * Position of sheet
   */
  position?: SheetPosition;

  /**
   * Width/height of sheet
   */
  size?: SheetSize;

  /**
   * Optional header content
   */
  header?: React.ReactNode;

  /**
   * Optional footer content
   */
  footer?: React.ReactNode;

  /**
   * Close on backdrop click
   */
  closeOnBackdropClick?: boolean;

  /**
   * Close on escape key
   */
  closeOnEscape?: boolean;

  /**
   * Show close button in header
   */
  showCloseButton?: boolean;

  /**
   * Custom className
   */
  className?: string;

  /**
   * Enable swipe to dismiss on touch devices
   */
  swipeToDismiss?: boolean;
}

export const Sheet: React.FC<SheetProps> = ({
  isOpen,
  onClose,
  children,
  position = 'right',
  size = 'lg',
  header,
  footer,
  closeOnBackdropClick = true,
  closeOnEscape = true,
  showCloseButton = true,
  className = '',
  swipeToDismiss = true,
}) => {
  const sheetRef = useRef<HTMLDivElement>(null);
  const previousActiveElement = useRef<HTMLElement | null>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  // Handle escape key
  const handleEscape = useCallback(
    (e: KeyboardEvent) => {
      if (closeOnEscape && e.key === 'Escape') {
        onClose();
      }
    },
    [closeOnEscape, onClose]
  );

  // Handle backdrop click
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (closeOnBackdropClick && e.target === e.currentTarget) {
      onClose();
    }
  };

  // Focus management
  useEffect(() => {
    if (isOpen) {
      previousActiveElement.current = document.activeElement as HTMLElement;

      // Focus first focusable element after sheet renders
      const timeoutId = setTimeout(() => {
        if (sheetRef.current) {
          const focusable = sheetRef.current.querySelector<HTMLElement>(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
          );
          focusable?.focus();
        }
      }, 100);

      return () => clearTimeout(timeoutId);
    }
  }, [isOpen]);

  // Event listeners
  useEffect(() => {
    if (!isOpen) return;

    document.addEventListener('keydown', handleEscape);
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = '';

      if (previousActiveElement.current) {
        previousActiveElement.current.focus();
      }
    };
  }, [isOpen, handleEscape]);

  // Touch handling for swipe to dismiss
  const handleTouchStart = (e: React.TouchEvent) => {
    if (!swipeToDismiss) return;
    touchStartRef.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
    };
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!swipeToDismiss || !touchStartRef.current) return;

    const deltaX = e.touches[0].clientX - touchStartRef.current.x;
    const deltaY = e.touches[0].clientY - touchStartRef.current.y;

    // Only handle horizontal swipes for side sheets
    if ((position === 'left' || position === 'right') && Math.abs(deltaX) > Math.abs(deltaY)) {
      const threshold = 50;
      if (deltaX > threshold && position === 'right') {
        onClose();
      } else if (deltaX < -threshold && position === 'left') {
        onClose();
      }
    }

    // Handle vertical swipes for top/bottom sheets
    if ((position === 'top' || position === 'bottom') && Math.abs(deltaY) > Math.abs(deltaX)) {
      const threshold = 50;
      if (deltaY > threshold && position === 'top') {
        onClose();
      } else if (deltaY < -threshold && position === 'bottom') {
        onClose();
      }
    }
  };

  const handleTouchEnd = () => {
    touchStartRef.current = null;
  };

  if (!isOpen) return null;

  const sheetContent = (
    <div
      className={`${styles.overlay} ${styles[position]}`}
      onClick={handleBackdropClick}
      role="presentation"
    >
      <div
        ref={sheetRef}
        className={`${styles.sheet} ${styles[position]} ${styles[size]} ${className}`}
        role="dialog"
        aria-modal="true"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Header */}
        {(header || showCloseButton) && (
          <div className={styles.header}>
            {header && <div className={styles.headerContent}>{header}</div>}
            {showCloseButton && (
              <button
                type="button"
                className={styles.closeButton}
                onClick={onClose}
                aria-label="Close sheet"
              >
                <XIcon size={20} />
              </button>
            )}
          </div>
        )}

        {/* Content */}
        <div className={styles.content}>

          {children}
        </div>

        {/* Footer */}
        {footer && <div className={styles.footer}>{footer}</div>}
      </div>
    </div>
  );

  return createPortal(sheetContent, document.body);
};
