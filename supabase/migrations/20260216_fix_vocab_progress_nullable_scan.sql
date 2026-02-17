-- Fix: rendre scan_id nullable et ajouter vocabulary_id pour supporter les deux cas
-- Les cartes peuvent venir de la table vocabulary (pas de scan_id) ou directement d'un scan

-- 1. Rendre scan_id nullable
ALTER TABLE vocab_cards_progress ALTER COLUMN scan_id DROP NOT NULL;

-- 2. Ajouter vocabulary_id (nullable)
ALTER TABLE vocab_cards_progress ADD COLUMN IF NOT EXISTS vocabulary_id UUID REFERENCES vocabulary(id) ON DELETE CASCADE;

-- 3. Supprimer l'ancienne contrainte unique
ALTER TABLE vocab_cards_progress DROP CONSTRAINT IF EXISTS vocab_cards_progress_new_user_id_scan_id_word_ar_key;
ALTER TABLE vocab_cards_progress DROP CONSTRAINT IF EXISTS vocab_cards_progress_user_id_scan_id_word_ar_key;

-- 4. Nouvelle contrainte unique sur user_id + word_ar (un mot par utilisateur)
ALTER TABLE vocab_cards_progress ADD CONSTRAINT vocab_cards_progress_user_word_unique UNIQUE(user_id, word_ar);

-- 5. Index sur vocabulary_id
CREATE INDEX IF NOT EXISTS idx_vocab_progress_vocabulary_id ON vocab_cards_progress(vocabulary_id);
