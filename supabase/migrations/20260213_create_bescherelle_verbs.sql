-- Table pour stocker les 17 031 verbes du Bescherelle arabe (source: Qutrub)
-- Utilisée par l'Edge Function extract-vocab pour corriger les formes verbales de GPT

CREATE TABLE IF NOT EXISTS bescherelle_verbs (
  id SERIAL PRIMARY KEY,
  passe_3ms TEXT NOT NULL,        -- Passé 3ème personne masculin singulier (forme de base)
  present_3ms TEXT NOT NULL,      -- Présent 3ème personne masculin singulier
  imperatif TEXT NOT NULL,        -- Impératif 2ème personne masculin singulier
  passe_norm TEXT NOT NULL,       -- Passé sans diacritiques (pour recherche)
  present_norm TEXT NOT NULL,     -- Présent sans diacritiques (pour recherche)
  imperatif_norm TEXT NOT NULL    -- Impératif sans diacritiques (pour recherche)
);

-- Index pour recherche rapide par n'importe quelle forme (avec ou sans diacritiques)
CREATE INDEX idx_bescherelle_passe ON bescherelle_verbs (passe_3ms);
CREATE INDEX idx_bescherelle_present ON bescherelle_verbs (present_3ms);
CREATE INDEX idx_bescherelle_imperatif ON bescherelle_verbs (imperatif);
CREATE INDEX idx_bescherelle_passe_norm ON bescherelle_verbs (passe_norm);
CREATE INDEX idx_bescherelle_present_norm ON bescherelle_verbs (present_norm);
CREATE INDEX idx_bescherelle_imperatif_norm ON bescherelle_verbs (imperatif_norm);

-- Autoriser la lecture par les Edge Functions (service role)
ALTER TABLE bescherelle_verbs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow service role full access" ON bescherelle_verbs
  FOR ALL USING (true);
