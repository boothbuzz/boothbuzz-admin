/** Indian mobile phone helpers — keep Admin UI aligned with boothbuzz-api normalizePhone. */

/** Digits only; if longer than 10 (e.g. +91…), keep the last 10. */
export function normalizeIndianMobile(phone: string): string {
  return String(phone ?? '')
    .replace(/\D/g, '')
    .slice(-10);
}

/** Live input sanitizer for controlled phone fields. */
export function sanitizePhoneInput(raw: string): string {
  return normalizeIndianMobile(raw);
}

/** Exactly 10 digits after normalization. */
export function isValidIndianMobile(phone: string): boolean {
  return /^\d{10}$/.test(normalizeIndianMobile(phone));
}

export const PHONE_PLACEHOLDER = '9876543210';
export const PHONE_HINT = '10-digit Indian mobile (+91)';
