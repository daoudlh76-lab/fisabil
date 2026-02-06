/**
 * Custom email/Resend OTP logic removed.
 * This file remains as a stub to avoid breaking imports. Calling
 * `sendOtpEmail` will throw and indicate that native Supabase Auth
 * should be used instead of the removed custom email flow.
 */

export function sendOtpEmail(): never {
  throw new Error('sendOtpEmail() removed: custom OTP email flow deleted. Use Supabase Auth native OTP emails instead.');
}
