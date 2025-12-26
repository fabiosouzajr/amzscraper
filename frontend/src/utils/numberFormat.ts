import i18n from '../i18n/config';

/**
 * Formats a number with the correct decimal and thousand separators based on language
 * For Portuguese (pt-BR): uses comma (,) for decimal and period (.) for thousands
 * For English (en): uses period (.) for decimal and comma (,) for thousands
 */
function formatNumberWithSeparators(value: number, decimals: number = 2): string {
  const language = i18n.language || 'en';
  const isPortuguese = language === 'pt-BR' || language.startsWith('pt');
  
  // Split into integer and decimal parts
  const fixed = value.toFixed(decimals);
  const parts = fixed.split('.');
  const integerPart = parts[0];
  const decimalPart = parts[1] || '';
  
  // Add thousand separators to integer part
  const formattedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, isPortuguese ? '.' : ',');
  
  // Combine with appropriate decimal separator
  if (decimals > 0 && decimalPart) {
    return `${formattedInteger}${isPortuguese ? ',' : '.'}${decimalPart}`;
  }
  return formattedInteger;
}

/**
 * Formats a price value with currency symbol
 * For Portuguese: R$ 1.234,56
 * For English: R$ 1,234.56
 */
export function formatPrice(value: number): string {
  return `R$ ${formatNumberWithSeparators(value, 2)}`;
}

/**
 * Formats a percentage value
 * For Portuguese: 12,5%
 * For English: 12.5%
 */
export function formatPercentage(value: number, decimals: number = 1): string {
  return `${formatNumberWithSeparators(value, decimals)}%`;
}

/**
 * Formats a number with specified decimal places
 * For Portuguese: 1.234,56
 * For English: 1,234.56
 */
export function formatNumber(value: number, decimals: number = 2): string {
  return formatNumberWithSeparators(value, decimals);
}

