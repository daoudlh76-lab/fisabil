-- Migration: Créer la table folders pour organiser les textes scannés en dossiers
-- À appliquer dans Supabase Dashboard > SQL Editor

CREATE TABLE IF NOT EXISTS public.folders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#2E7D32',
  icon TEXT DEFAULT '📁',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index pour améliorer les performances des requêtes
CREATE INDEX IF NOT EXISTS idx_folders_user_id ON public.folders(user_id);

-- Row Level Security (RLS)
ALTER TABLE public.folders ENABLE ROW LEVEL SECURITY;

-- Politique : Les utilisateurs peuvent voir uniquement leurs propres dossiers
DROP POLICY IF EXISTS "Users can view their own folders" ON public.folders;
CREATE POLICY "Users can view their own folders"
  ON public.folders
  FOR SELECT
  USING (auth.uid() = user_id);

-- Politique : Les utilisateurs peuvent créer leurs propres dossiers
DROP POLICY IF EXISTS "Users can insert their own folders" ON public.folders;
CREATE POLICY "Users can insert their own folders"
  ON public.folders
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Politique : Les utilisateurs peuvent mettre à jour leurs propres dossiers
DROP POLICY IF EXISTS "Users can update their own folders" ON public.folders;
CREATE POLICY "Users can update their own folders"
  ON public.folders
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Politique : Les utilisateurs peuvent supprimer leurs propres dossiers
DROP POLICY IF EXISTS "Users can delete their own folders" ON public.folders;
CREATE POLICY "Users can delete their own folders"
  ON public.folders
  FOR DELETE
  USING (auth.uid() = user_id);

-- Trigger pour mettre à jour automatiquement updated_at
CREATE OR REPLACE FUNCTION update_folders_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_folders_updated_at ON public.folders;
CREATE TRIGGER update_folders_updated_at
  BEFORE UPDATE ON public.folders
  FOR EACH ROW
  EXECUTE FUNCTION update_folders_updated_at();

-- Commentaires pour la documentation
COMMENT ON TABLE public.folders IS 'Dossiers pour organiser les textes scannés par catégories (Coran, Hadith, Grammaire, etc.)';
COMMENT ON COLUMN public.folders.name IS 'Nom du dossier';
COMMENT ON COLUMN public.folders.color IS 'Couleur du dossier en hexadécimal';
COMMENT ON COLUMN public.folders.icon IS 'Emoji représentant le dossier';
