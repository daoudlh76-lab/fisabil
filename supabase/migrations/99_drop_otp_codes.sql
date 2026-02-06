-- Migration to drop otp_codes and related objects (custom OTP removed)
DROP INDEX IF EXISTS idx_otp_codes_email;
DROP INDEX IF EXISTS idx_otp_codes_expires_at;
DROP FUNCTION IF EXISTS delete_expired_otp_codes();
DROP TABLE IF EXISTS otp_codes;

-- This migration is safe to run on projects that may have previously created
-- the otp_codes table for the custom OTP flow. It removes storage used by
-- the deprecated custom OTP system.
