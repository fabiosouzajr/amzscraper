import React from 'react';
import { Search as SearchIcon, X as XIcon } from 'lucide-react';
import styles from './Input.module.css';

export type InputVariant = 'text' | 'search' | 'number';
export type InputSize = 'sm' | 'md' | 'lg';

export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  variant?: InputVariant;
  size?: InputSize;
  label?: string;
  error?: string;
  helperText?: string;
  leftIcon?: React.ReactNode;
  onClear?: () => void;
  fullWidth?: boolean;
}

export const Input: React.FC<InputProps> = ({
  variant = 'text',
  size = 'md',
  label,
  error,
  helperText,
  leftIcon,
  onClear,
  fullWidth = false,
  value,
  className = '',
  ...props
}) => {
  const showClear = variant === 'search' && value && onClear;
  const hasLeftIcon = leftIcon || variant === 'search';

  return (
    <div
      className={`${styles.inputWrapper} ${styles[variant]} ${styles[size]} ${
        fullWidth ? styles.fullWidth : ''
      } ${error ? styles.error : ''} ${className}`}
    >
      {label && <label className={styles.label}>{label}</label>}

      <div className={styles.inputContainer}>
        {hasLeftIcon && (
          <span className={styles.leftIcon}>
            {leftIcon || <SearchIcon size={16} />}
          </span>
        )}

        <input
          className={styles.input}
          type={variant === 'number' ? 'number' : 'text'}
          value={value}
          {...props}
        />

        {showClear && (
          <button
            type="button"
            className={styles.clearButton}
            onClick={onClear}
            aria-label="Clear input"
          >
            <XIcon size={16} />
          </button>
        )}
      </div>

      {(error || helperText) && (
        <p className={styles.helperText}>
          {error || helperText}
        </p>
      )}
    </div>
  );
};
