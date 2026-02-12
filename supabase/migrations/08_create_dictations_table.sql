-- Migration: Créer la table dictations pour stocker les dictées générées
-- À appliquer dans Supabase Dashboard > SQL Editor

CREATE TABLE IF NOT EXISTS public.dictations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  text TEXT NOT NULL,
  audio_url TEXT,
  difficulty TEXT CHECK (difficulty IN ('beginner', 'intermediate', 'advanced')),
  completed BOOLEAN NOT NULL DEFAULT false,
  score INTEGER CHECK (score >= 0 AND score <= 100),
  folder_id UUID REFERENCES public.folders(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index pour améliorer les performances des requêtes
CREATE INDEX IF NOT EXISTS idx_dictations_user_id ON public.dictations(user_id);
CREATE INDEX IF NOT EXISTS idx_dictations_folder_id ON public.dictations(folder_id);
CREATE INDEX IF NOT EXISTS idx_dictations_user_folder ON public.dictations(user_id, folder_id);
CREATE INDEX IF NOT EXISTS idx_dictations_completed ON public.dictations(user_id, completed);
CREATE INDEX IF NOT EXISTS idx_dictations_difficulty ON public.dictations(user_id, difficulty);
CREATE INDEX IF NOT EXISTS idx_dictations_created_at ON public.dictations(user_id, created_at DESC);

-- Row Level Security (RLS)
ALTER TABLE public.dictations ENABLE ROW LEVEL SECURITY;

-- Politique : Les utilisateurs peuvent voir uniquement leurs propres dictées
DROP POLICY IF EXISTS "Users can view their own dictations" ON public.dictations;
CREATE POLICY "Users can view their own dictations"
  ON public.dictations
  FOR SELECT
  USING (auth.uid() = user_id);

-- Politique : Les utilisateurs peuvent insérer leurs propres dictées
DROP POLICY IF EXISTS "Users can insert their own dictations" ON public.dictations;
CREATE POLICY "Users can insert their own dictations"
  ON public.dictations
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Politique : Les utilisateurs peuvent mettre à jour leurs propres dictées
DROP POLICY IF EXISTS "Users can update their own dictations" ON public.dictations;
CREATE POLICY "Users can update their own dictations"
  ON public.dictations
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Politique : Les utilisateurs peuvent supprimer leurs propres dictées
DROP POLICY IF EXISTS "Users can delete their own dictations" ON public.dictations;
CREATE POLICY "Users can delete their own dictations"
  ON public.dictations
  FOR DELETE
  USING (auth.uid() = user_id);

-- Trigger pour mettre à jour automatiquement updated_at
CREATE OR REPLACE FUNCTION update_dictations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_dictations_updated_at ON public.dictations;
CREATE TRIGGER update_dictations_updated_at
  BEFORE UPDATE ON public.dictations
  FOR EACH ROW
  EXECUTE FUNCTION update_dictations_updated_at();

-- Commentaires pour la documentation
COMMENT ON TABLE public.dictations IS 'Dictées générées à partir des textes scannés';
COMMENT ON COLUMN public.dictations.title IS 'Titre de la dictée';
COMMENT ON COLUMN public.dictations.text IS 'Texte de la dictée (avec diacritiques)';
COMMENT ON COLUMN public.dictations.audio_url IS 'URL de l''audio de la dictée (optionnel)';
COMMENT ON COLUMN public.dictations.difficulty IS 'Niveau de difficulté (beginner, intermediate, advanced)';
COMMENT ON COLUMN public.dictations.completed IS 'Indique si la dictée a été complétée';
COMMENT ON COLUMN public.dictations.score IS 'Score obtenu (0-100)';
COMMENT ON COLUMN public.dictations.folder_id IS 'Dossier dans lequel la dictée est rangée (NULL = pas de dossier)';
