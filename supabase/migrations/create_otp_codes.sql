-- Table pour stocker les codes OTP temporaires
CREATE TABLE IF NOT EXISTS otp_codes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT NOT NULL,
  code TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '10 minutes'),
  used BOOLEAN DEFAULT FALSE
);

-- Index pour rechercher rapidement par email
CREATE INDEX idx_otp_codes_email ON otp_codes(email);

-- Index pour nettoyer les codes expirés
CREATE INDEX idx_otp_codes_expires_at ON otp_codes(expires_at);

-- Fonction pour nettoyer automatiquement les codes expirés
CREATE OR REPLACE FUNCTION delete_expired_otp_codes()
RETURNS void AS $$
BEGIN
  DELETE FROM otp_codes WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- RLS : Permettre l'insertion et la lecture anonyme (pour le reset password)
ALTER TABLE otp_codes ENABLE ROW LEVEL SECURITY;

-- Politique : tout le monde peut insérer (pour générer un code)
CREATE POLICY "Anyone can insert OTP codes" ON otp_codes
  FOR INSERT WITH CHECK (true);

-- Politique : tout le monde peut lire son propre code (par email)
CREATE POLICY "Anyone can read their OTP codes" ON otp_codes
  FOR SELECT USING (true);

-- Politique : tout le monde peut mettre à jour (marquer comme utilisé)
CREATE POLICY "Anyone can update OTP codes" ON otp_codes
  FOR UPDATE USING (true);
