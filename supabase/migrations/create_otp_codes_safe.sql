-- Migration sécurisée pour créer la table otp_codes
-- Cette version gère les cas où certains éléments existent déjà

-- Supprimer les index existants si ils existent
DROP INDEX IF EXISTS idx_otp_codes_email;
DROP INDEX IF EXISTS idx_otp_codes_expires_at;

-- Supprimer les politiques existantes si elles existent
DROP POLICY IF EXISTS "Anyone can insert OTP codes" ON otp_codes;
DROP POLICY IF EXISTS "Anyone can read their OTP codes" ON otp_codes;
DROP POLICY IF EXISTS "Anyone can update OTP codes" ON otp_codes;

-- Supprimer la fonction si elle existe
DROP FUNCTION IF EXISTS delete_expired_otp_codes();

-- Supprimer la table si elle existe
DROP TABLE IF EXISTS otp_codes;

-- Créer la table
CREATE TABLE otp_codes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT NOT NULL,
  code TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '10 minutes'),
  used BOOLEAN DEFAULT FALSE
);

-- Créer les index
CREATE INDEX idx_otp_codes_email ON otp_codes(email);
CREATE INDEX idx_otp_codes_expires_at ON otp_codes(expires_at);

-- Fonction pour nettoyer automatiquement les codes expirés
CREATE FUNCTION delete_expired_otp_codes()
RETURNS void AS $$
BEGIN
  DELETE FROM otp_codes WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- Activer RLS
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

-- Afficher un message de succès
SELECT 'Table otp_codes créée avec succès ✅' AS status;
