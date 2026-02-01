-- Migration: Créer la table scans pour stocker les textes scannés avec OCR
-- À appliquer dans Supabase Dashboard > SQL Editor

CREATE TABLE IF NOT EXISTS public.scans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  image_url TEXT,
  folder_id UUID REFERENCES public.folders(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index pour améliorer les performances des requêtes
CREATE INDEX IF NOT EXISTS idx_scans_user_id ON public.scans(user_id);
CREATE INDEX IF NOT EXISTS idx_scans_folder_id ON public.scans(folder_id);
CREATE INDEX IF NOT EXISTS idx_scans_user_folder ON public.scans(user_id, folder_id);
CREATE INDEX IF NOT EXISTS idx_scans_created_at ON public.scans(user_id, created_at DESC);

-- Row Level Security (RLS)
ALTER TABLE public.scans ENABLE ROW LEVEL SECURITY;

-- Politique : Les utilisateurs peuvent voir uniquement leurs propres scans
CREATE POLICY "Users can view their own scans"
  ON public.scans
  FOR SELECT
  USING (auth.uid() = user_id);

-- Politique : Les utilisateurs peuvent insérer leurs propres scans
CREATE POLICY "Users can insert their own scans"
  ON public.scans
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Politique : Les utilisateurs peuvent mettre à jour leurs propres scans
CREATE POLICY "Users can update their own scans"
  ON public.scans
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Politique : Les utilisateurs peuvent supprimer leurs propres scans
CREATE POLICY "Users can delete their own scans"
  ON public.scans
  FOR DELETE
  USING (auth.uid() = user_id);

-- Trigger pour mettre à jour automatiquement updated_at
CREATE OR REPLACE FUNCTION update_scans_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_scans_updated_at
  BEFORE UPDATE ON public.scans
  FOR EACH ROW
  EXECUTE FUNCTION update_scans_updated_at();

-- Commentaires pour la documentation
COMMENT ON TABLE public.scans IS 'Textes scannés avec OCR (Coran, Hadith, etc.)';
COMMENT ON COLUMN public.scans.title IS 'Titre du texte scanné';
COMMENT ON COLUMN public.scans.content IS 'Contenu du texte extrait par OCR';
COMMENT ON COLUMN public.scans.image_url IS 'URL de l''image scannée (optionnel)';
COMMENT ON COLUMN public.scans.folder_id IS 'Dossier dans lequel le texte est rangé (NULL = pas de dossier)';
