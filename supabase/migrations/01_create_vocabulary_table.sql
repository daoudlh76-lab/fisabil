-- Migration: Créer la table vocabulary pour stocker le vocabulaire extrait des textes
-- À appliquer dans Supabase Dashboard > SQL Editor

CREATE TABLE IF NOT EXISTS public.vocabulary (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  word TEXT NOT NULL,
  translation TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index pour améliorer les performances des requêtes
CREATE INDEX IF NOT EXISTS idx_vocabulary_user_id ON public.vocabulary(user_id);
CREATE INDEX IF NOT EXISTS idx_vocabulary_word ON public.vocabulary(word);

-- Row Level Security (RLS)
ALTER TABLE public.vocabulary ENABLE ROW LEVEL SECURITY;

-- Politique : Les utilisateurs peuvent voir uniquement leur propre vocabulaire
CREATE POLICY "Users can view their own vocabulary"
  ON public.vocabulary
  FOR SELECT
  USING (auth.uid() = user_id);

-- Politique : Les utilisateurs peuvent insérer leur propre vocabulaire
CREATE POLICY "Users can insert their own vocabulary"
  ON public.vocabulary
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Politique : Les utilisateurs peuvent mettre à jour leur propre vocabulaire
CREATE POLICY "Users can update their own vocabulary"
  ON public.vocabulary
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Politique : Les utilisateurs peuvent supprimer leur propre vocabulaire
CREATE POLICY "Users can delete their own vocabulary"
  ON public.vocabulary
  FOR DELETE
  USING (auth.uid() = user_id);

-- Trigger pour mettre à jour automatiquement updated_at
CREATE OR REPLACE FUNCTION update_vocabulary_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_vocabulary_updated_at
  BEFORE UPDATE ON public.vocabulary
  FOR EACH ROW
  EXECUTE FUNCTION update_vocabulary_updated_at();

-- Commentaires pour la documentation
COMMENT ON TABLE public.vocabulary IS 'Vocabulaire arabe extrait des textes scannés par les utilisateurs';
COMMENT ON COLUMN public.vocabulary.word IS 'Mot arabe avec diacritiques (tashkeel)';
COMMENT ON COLUMN public.vocabulary.translation IS 'Traduction du mot dans la langue de l''utilisateur';
