-- Migration: Créer la table vocab_cards_progress pour sauvegarder la progression des cartes de révision
-- À appliquer dans Supabase Dashboard > SQL Editor
-- IMPORTANT: La table 'vocabulary' doit exister avant d'appliquer cette migration (voir 01_create_vocabulary_table.sql)

CREATE TABLE IF NOT EXISTS public.vocab_cards_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  vocabulary_id UUID NOT NULL REFERENCES public.vocabulary(id) ON DELETE CASCADE,
  difficulty TEXT NOT NULL CHECK (difficulty IN ('easy', 'medium', 'hard', 'forgotten')),
  last_reviewed TIMESTAMPTZ,
  next_review TIMESTAMPTZ NOT NULL,
  review_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Contrainte unique : un utilisateur ne peut avoir qu'une progression par mot de vocabulaire
  UNIQUE(user_id, vocabulary_id)
);

-- Index pour améliorer les performances des requêtes
CREATE INDEX IF NOT EXISTS idx_vocab_cards_progress_user_id ON public.vocab_cards_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_vocab_cards_progress_next_review ON public.vocab_cards_progress(user_id, next_review);

-- Row Level Security (RLS)
ALTER TABLE public.vocab_cards_progress ENABLE ROW LEVEL SECURITY;

-- Politique : Les utilisateurs peuvent voir uniquement leur propre progression
DROP POLICY IF EXISTS "Users can view their own progress" ON public.vocab_cards_progress;
CREATE POLICY "Users can view their own progress"
  ON public.vocab_cards_progress
  FOR SELECT
  USING (auth.uid() = user_id);

-- Politique : Les utilisateurs peuvent insérer leur propre progression
DROP POLICY IF EXISTS "Users can insert their own progress" ON public.vocab_cards_progress;
CREATE POLICY "Users can insert their own progress"
  ON public.vocab_cards_progress
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Politique : Les utilisateurs peuvent mettre à jour leur propre progression
DROP POLICY IF EXISTS "Users can update their own progress" ON public.vocab_cards_progress;
CREATE POLICY "Users can update their own progress"
  ON public.vocab_cards_progress
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Politique : Les utilisateurs peuvent supprimer leur propre progression
DROP POLICY IF EXISTS "Users can delete their own progress" ON public.vocab_cards_progress;
CREATE POLICY "Users can delete their own progress"
  ON public.vocab_cards_progress
  FOR DELETE
  USING (auth.uid() = user_id);

-- Trigger pour mettre à jour automatiquement updated_at
CREATE OR REPLACE FUNCTION update_vocab_cards_progress_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_vocab_cards_progress_updated_at ON public.vocab_cards_progress;
CREATE TRIGGER update_vocab_cards_progress_updated_at
  BEFORE UPDATE ON public.vocab_cards_progress
  FOR EACH ROW
  EXECUTE FUNCTION update_vocab_cards_progress_updated_at();

-- Commentaires pour la documentation
COMMENT ON TABLE public.vocab_cards_progress IS 'Progression des cartes de révision de vocabulaire avec système de répétition espacée';
COMMENT ON COLUMN public.vocab_cards_progress.difficulty IS 'Difficulté de la carte : easy (30j), medium (7j), hard (3j), forgotten (1j)';
COMMENT ON COLUMN public.vocab_cards_progress.last_reviewed IS 'Date de la dernière révision';
COMMENT ON COLUMN public.vocab_cards_progress.next_review IS 'Date de la prochaine révision selon l''algorithme de répétition espacée';
COMMENT ON COLUMN public.vocab_cards_progress.review_count IS 'Nombre de fois que la carte a été révisée';
