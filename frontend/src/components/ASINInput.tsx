import { useState } from 'react';
import { useTranslation } from 'react-i18next';

interface ASINInputProps {
  onAdd: (asin: string) => Promise<void>;
  isValidating?: boolean;
  error?: string | null;
}

export function ASINInput({ onAdd, isValidating = false, error }: ASINInputProps) {
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
    <form onSubmit={handleSubmit} className="asin-input">
      <div className="input-group">
        <input
          type="text"
          value={asin}
          onChange={(e) => setAsin(e.target.value.toUpperCase())}
          placeholder={t('asinInput.placeholder')}
          maxLength={10}
          disabled={isSubmitting || isValidating}
          className={!isValid ? 'invalid' : ''}
        />
        <button
          type="submit"
          disabled={!isValid || isSubmitting || isValidating || asin.trim() === ''}
        >
          {isSubmitting ? t('asinInput.adding') : t('asinInput.addProduct')}
        </button>
      </div>
      {error && <div className="error-message">{error}</div>}
      {!isValid && asin.trim() !== '' && (
        <div className="error-message">{t('asinInput.invalidFormat')}</div>
      )}
    </form>
  );
}

