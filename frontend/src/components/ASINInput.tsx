import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './ASINInput.module.css';

interface ASINInputProps {
  onAdd: (asin: string) => Promise<void>;
  isValidating?: boolean;
  error?: string | null;
  successMessage?: string | null;
}

export function ASINInput({ onAdd, isValidating = false, error, successMessage }: ASINInputProps) {
  const { t } = useTranslation();
  const [asin, setAsin] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const validateASIN = (value: string): boolean => {
    const cleaned = value.trim().toUpperCase();
    return /^[A-Z0-9]{10}$/.test(cleaned);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = asin.trim().toUpperCase();
    
    if (!validateASIN(cleaned)) {
      return;
    }

    setIsSubmitting(true);
    try {
      await onAdd(cleaned);
      setAsin('');
    } catch (err) {
      // Error handled by parent
    } finally {
      setIsSubmitting(false);
    }
  };

  const isValid = asin.trim() === '' || validateASIN(asin);

  return (
    <form onSubmit={handleSubmit} className={styles.asinInput}>
      <div className={styles.inputGroup}>
        <label htmlFor="asin-input" className={styles.visuallyHidden}>
          {t('asinInput.placeholder')}
        </label>
        <input
          id="asin-input"
          name="asin"
          type="text"
          value={asin}
          onChange={(e) => setAsin(e.target.value.toUpperCase())}
          placeholder={t('asinInput.placeholder')}
          maxLength={10}
          autoComplete="off"
          spellCheck={false}
          disabled={isSubmitting || isValidating}
          aria-invalid={!isValid}
          aria-describedby={!isValid && asin.trim() !== '' ? 'asin-input-error' : undefined}
          className={!isValid ? styles.invalid : ''}
        />
        <button
          type="submit"
          disabled={!isValid || isSubmitting || isValidating || asin.trim() === ''}
        >
          {isSubmitting || isValidating ? t('asinInput.adding') : t('asinInput.addProduct')}
        </button>
      </div>
      {successMessage && <div className="success-message">{successMessage}</div>}
      {error && <div className="error-message">{error}</div>}
      {!isValid && asin.trim() !== '' && (
        <div id="asin-input-error" className="error-message">{t('asinInput.invalidFormat')}</div>
      )}
    </form>
  );
}
