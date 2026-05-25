/**
 * Convert a stored international phone (+923XXXXXXXXX) to local display format (03XXXXXXXXX).
 * Falls back to the original string if it doesn't match the +92 pattern.
 */
export const toLocalPhone = (phone) =>
  phone?.startsWith('+92') ? '0' + phone.slice(3) : (phone || '');
