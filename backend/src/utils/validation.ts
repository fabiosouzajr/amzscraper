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

/**
 * Validates a username
 * Usernames must be 3-30 characters and contain only alphanumeric, underscore, or dash
 */
export function validateUsername(username: string): boolean {
  if (!username || typeof username !== 'string') {
    return false;
  }

  const trimmed = username.trim();

  // Username length 3-30
  if (trimmed.length < 3 || trimmed.length > 30) {
    return false;
  }

  // Username contains only alphanumeric, underscore, or dash
  const usernameRegex = /^[a-zA-Z0-9_-]+$/;
  return usernameRegex.test(trimmed);
}

/**
 * Validates a password
 * Passwords must be at least 6 characters
 */
export function validatePassword(password: string): boolean {
  if (!password || typeof password !== 'string') {
    return false;
  }

  return password.length >= 6;
}

/**
 * Validates a cron expression (basic validation)
 * Cron expressions have 5 or 6 space-separated parts
 */
export function validateCronExpression(cron: string): boolean {
  if (!cron || typeof cron !== 'string') {
    return false;
  }

  const trimmed = cron.trim();
  const parts = trimmed.split(/\s+/);

  // Cron expressions have 5 or 6 parts
  if (parts.length < 5 || parts.length > 6) {
    return false;
  }

  // Each part should contain valid cron characters
  const validChars = /^[*0-9,-/]+$/;
  return parts.every(part => validChars.test(part));
}

/**
 * Validates a user role
 */
export function validateRole(role: string): boolean {
  if (!role || typeof role !== 'string') {
    return false;
  }

  const validRoles = ['USER', 'ADMIN'];
  return validRoles.includes(role.toUpperCase());
}

/**
 * Validates an integer ID
 */
export function validateIntegerId(id: any): boolean {
  const num = parseInt(id);
  return !isNaN(num) && num > 0 && id === num.toString();
}

/**
 * Validates pagination parameters
 */
export function validatePagination(limit?: any, offset?: any): { limit: number; offset: number } | null {
  const parsedLimit = limit ? parseInt(limit) : 50;
  const parsedOffset = offset ? parseInt(offset) : 0;

  if (isNaN(parsedLimit) || parsedLimit < 1 || parsedLimit > 1000) {
    return null;
  }

  if (isNaN(parsedOffset) || parsedOffset < 0) {
    return null;
  }

  return { limit: parsedLimit, offset: parsedOffset };
}

