import i18n from '../i18n/config';

/**
 * Formats a date based on the current language
 * For Portuguese (pt-BR): dd/mm/yy format
 * For English (en): mm/dd/yy format
 */
export function formatDate(date: Date | string): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  const language = i18n.language || 'en';
  
  if (language === 'pt-BR' || language.startsWith('pt')) {
    // Portuguese format: dd/mm/yy
    const day = dateObj.getDate().toString().padStart(2, '0');
    const month = (dateObj.getMonth() + 1).toString().padStart(2, '0');
    const year = dateObj.getFullYear().toString().slice(-2);
    return `${day}/${month}/${year}`;
  } else {
    // English format: mm/dd/yy
    const day = dateObj.getDate().toString().padStart(2, '0');
    const month = (dateObj.getMonth() + 1).toString().padStart(2, '0');
    const year = dateObj.getFullYear().toString().slice(-2);
    return `${month}/${day}/${year}`;
  }
}

/**
 * Formats a date with time based on the current language
 * For Portuguese (pt-BR): dd/mm/yy HH:mm format
 * For English (en): mm/dd/yy HH:mm format
 */
export function formatDateTime(date: Date | string): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  const language = i18n.language || 'en';
  
  const datePart = formatDate(dateObj);
  const hours = dateObj.getHours().toString().padStart(2, '0');
  const minutes = dateObj.getMinutes().toString().padStart(2, '0');
  
  return `${datePart} ${hours}:${minutes}`;
}

/**
 * Formats a date for chart display (short format)
 * For Portuguese (pt-BR): dd/mm format
 * For English (en): MMM dd format
 */
export function formatDateShort(date: Date | string): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  const language = i18n.language || 'en';
  
  if (language === 'pt-BR' || language.startsWith('pt')) {
    // Portuguese format: dd/mm
    const day = dateObj.getDate().toString().padStart(2, '0');
    const month = (dateObj.getMonth() + 1).toString().padStart(2, '0');
    return `${day}/${month}`;
  } else {
    // English format: MMM dd
    return dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
}

