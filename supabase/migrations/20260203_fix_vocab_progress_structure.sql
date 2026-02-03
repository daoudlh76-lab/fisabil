-- Migration pour corriger la structure de vocab_cards_progress
-- Remplacer vocabulary_id (UUID) par scan_id (UUID) + word_ar (text)

-- 1. Créer une nouvelle table avec la bonne structure
CREATE TABLE IF NOT EXISTS vocab_cards_progress_new (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scan_id UUID NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
  word_ar TEXT NOT NULL,
  difficulty TEXT NOT NULL CHECK (difficulty IN ('easy', 'medium', 'hard', 'forgotten')),
  last_reviewed TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  next_review TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  review_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, scan_id, word_ar)
);

-- 2. Créer les index
CREATE INDEX IF NOT EXISTS idx_vocab_progress_new_user_scan ON vocab_cards_progress_new(user_id, scan_id);
CREATE INDEX IF NOT EXISTS idx_vocab_progress_new_next_review ON vocab_cards_progress_new(next_review);

-- 3. Activer RLS
ALTER TABLE vocab_cards_progress_new ENABLE ROW LEVEL SECURITY;

-- 4. Créer les policies
CREATE POLICY "Users can view their own vocab progress"
  ON vocab_cards_progress_new FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own vocab progress"
  ON vocab_cards_progress_new FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own vocab progress"
  ON vocab_cards_progress_new FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own vocab progress"
  ON vocab_cards_progress_new FOR DELETE
  USING (auth.uid() = user_id);

-- 5. Renommer les tables (drop l'ancienne et renommer la nouvelle)
DROP TABLE IF EXISTS vocab_cards_progress;
ALTER TABLE vocab_cards_progress_new RENAME TO vocab_cards_progress;

-- 6. Créer un trigger pour updated_at
CREATE OR REPLACE FUNCTION update_vocab_progress_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_vocab_progress_updated_at
  BEFORE UPDATE ON vocab_cards_progress
  FOR EACH ROW
  EXECUTE FUNCTION update_vocab_progress_updated_at();
