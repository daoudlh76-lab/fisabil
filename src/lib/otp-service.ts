/**
 * Custom OTP logic has been removed from the codebase.
 * This file is kept as a stub to avoid breaking imports; calling these
 * functions will throw at runtime and indicate that native Supabase
 * Auth should be used instead.
 */

export function createOtpCode(): never {
  throw new Error('createOtpCode() removed: custom OTP logic deleted. Use Supabase Auth native OTP.');
}

export function verifyOtpCode(): never {
  throw new Error('verifyOtpCode() removed: custom OTP logic deleted. Use Supabase Auth native OTP.');
}

export function cleanupExpiredOtpCodes(): never {
  throw new Error('cleanupExpiredOtpCodes() removed: custom OTP logic deleted.');
}
