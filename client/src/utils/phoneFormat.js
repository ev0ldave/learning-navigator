/**
 * Formats a phone number string to (XXX) XXX-XXXX format
 * @param {string} value - The input phone number (can contain any characters)
 * @returns {string} - Formatted phone number
 */
export const formatPhoneNumber = (value) => {
  if (!value) return '';
  
  // Remove all non-digit characters
  const digits = value.replace(/\D/g, '');
  
  // Limit to 10 digits
  const limited = digits.slice(0, 10);
  
  // Format based on length
  if (limited.length === 0) return '';
  if (limited.length <= 3) return `(${limited}`;
  if (limited.length <= 6) return `(${limited.slice(0, 3)}) ${limited.slice(3)}`;
  return `(${limited.slice(0, 3)}) ${limited.slice(3, 6)}-${limited.slice(6)}`;
};

/**
 * Strips formatting from a phone number, returning only digits
 * @param {string} value - The formatted phone number
 * @returns {string} - Digits only
 */
export const unformatPhoneNumber = (value) => {
  if (!value) return '';
  return value.replace(/\D/g, '');
};
