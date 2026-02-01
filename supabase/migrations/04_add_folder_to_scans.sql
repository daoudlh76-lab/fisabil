-- Migration: Ajouter la colonne folder_id à la table scans pour organiser les textes
-- À appliquer dans Supabase Dashboard > SQL Editor
-- IMPORTANT: La table 'folders' doit exister avant d'appliquer cette migration (voir 03_create_folders_table.sql)

-- Ajouter la colonne folder_id (nullable car les textes existants n'ont pas de dossier)
ALTER TABLE public.scans
ADD COLUMN IF NOT EXISTS folder_id UUID REFERENCES public.folders(id) ON DELETE SET NULL;

-- Index pour améliorer les performances des requêtes par dossier
CREATE INDEX IF NOT EXISTS idx_scans_folder_id ON public.scans(folder_id);

-- Index composite pour filtrer par utilisateur ET dossier
CREATE INDEX IF NOT EXISTS idx_scans_user_folder ON public.scans(user_id, folder_id);

-- Commentaire pour la documentation
COMMENT ON COLUMN public.scans.folder_id IS 'Dossier dans lequel le texte est rangé (NULL = pas de dossier)';
