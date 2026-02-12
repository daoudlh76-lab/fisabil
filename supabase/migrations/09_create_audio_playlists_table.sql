-- Migration: Créer la table audio_playlists pour stocker les playlists audio
-- À appliquer dans Supabase Dashboard > SQL Editor

CREATE TABLE IF NOT EXISTS public.audio_tracks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  text TEXT NOT NULL,
  audio_url TEXT,
  duration INTEGER NOT NULL DEFAULT 0,
  folder_id UUID REFERENCES public.folders(id) ON DELETE SET NULL,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index pour améliorer les performances des requêtes
CREATE INDEX IF NOT EXISTS idx_audio_tracks_user_id ON public.audio_tracks(user_id);
CREATE INDEX IF NOT EXISTS idx_audio_tracks_folder_id ON public.audio_tracks(folder_id);
CREATE INDEX IF NOT EXISTS idx_audio_tracks_user_folder ON public.audio_tracks(user_id, folder_id);
CREATE INDEX IF NOT EXISTS idx_audio_tracks_position ON public.audio_tracks(user_id, position);
CREATE INDEX IF NOT EXISTS idx_audio_tracks_created_at ON public.audio_tracks(user_id, created_at DESC);

-- Row Level Security (RLS)
ALTER TABLE public.audio_tracks ENABLE ROW LEVEL SECURITY;

-- Politique : Les utilisateurs peuvent voir uniquement leurs propres pistes
DROP POLICY IF EXISTS "Users can view their own tracks" ON public.audio_tracks;
CREATE POLICY "Users can view their own tracks"
  ON public.audio_tracks
  FOR SELECT
  USING (auth.uid() = user_id);

-- Politique : Les utilisateurs peuvent insérer leurs propres pistes
DROP POLICY IF EXISTS "Users can insert their own tracks" ON public.audio_tracks;
CREATE POLICY "Users can insert their own tracks"
  ON public.audio_tracks
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Politique : Les utilisateurs peuvent mettre à jour leurs propres pistes
DROP POLICY IF EXISTS "Users can update their own tracks" ON public.audio_tracks;
CREATE POLICY "Users can update their own tracks"
  ON public.audio_tracks
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Politique : Les utilisateurs peuvent supprimer leurs propres pistes
DROP POLICY IF EXISTS "Users can delete their own tracks" ON public.audio_tracks;
CREATE POLICY "Users can delete their own tracks"
  ON public.audio_tracks
  FOR DELETE
  USING (auth.uid() = user_id);

-- Trigger pour mettre à jour automatiquement updated_at
CREATE OR REPLACE FUNCTION update_audio_tracks_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_audio_tracks_updated_at ON public.audio_tracks;
CREATE TRIGGER update_audio_tracks_updated_at
  BEFORE UPDATE ON public.audio_tracks
  FOR EACH ROW
  EXECUTE FUNCTION update_audio_tracks_updated_at();

-- Commentaires pour la documentation
COMMENT ON TABLE public.audio_tracks IS 'Pistes audio pour les playlists (textes + audio)';
COMMENT ON COLUMN public.audio_tracks.title IS 'Titre de la piste';
COMMENT ON COLUMN public.audio_tracks.text IS 'Texte de la piste';
COMMENT ON COLUMN public.audio_tracks.audio_url IS 'URL de l''audio (peut être NULL si pas encore généré)';
COMMENT ON COLUMN public.audio_tracks.duration IS 'Durée de la piste en secondes';
COMMENT ON COLUMN public.audio_tracks.folder_id IS 'Dossier dans lequel la piste est rangée (NULL = pas de dossier)';
COMMENT ON COLUMN public.audio_tracks.position IS 'Position de la piste dans la playlist';
