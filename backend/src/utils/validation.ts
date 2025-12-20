/**
 * Validates an Amazon ASIN (Amazon Standard Identification Number)
 * ASINs are 10 characters long and can contain letters and numbers
 */
export function validateASIN(asin: string): boolean {
  if (!asin) {
    return false;
  }
  
  // Remove any whitespace
  const cleaned = asin.trim();
  
  // ASINs are exactly 10 characters
  if (cleaned.length !== 10) {
    return false;
  }
  
  // ASINs contain only alphanumeric characters
  const asinRegex = /^[A-Z0-9]{10}$/i;
  return asinRegex.test(cleaned);
}

/**
 * Normalizes an ASIN by trimming and converting to uppercase
 */
export function normalizeASIN(asin: string): string {
  return asin.trim().toUpperCase();
}

