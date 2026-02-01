-- Migration: Ajouter la colonne folder_id à la table dictations pour organiser les audios/dictées
-- À appliquer dans Supabase Dashboard > SQL Editor
-- IMPORTANT: La table 'folders' doit exister avant d'appliquer cette migration (voir 03_create_folders_table.sql)

-- Ajouter la colonne folder_id (nullable car les dictées existantes n'ont pas de dossier)
ALTER TABLE public.dictations
ADD COLUMN IF NOT EXISTS folder_id UUID REFERENCES public.folders(id) ON DELETE SET NULL;

-- Index pour améliorer les performances des requêtes par dossier
CREATE INDEX IF NOT EXISTS idx_dictations_folder_id ON public.dictations(folder_id);

-- Index composite pour filtrer par utilisateur ET dossier
CREATE INDEX IF NOT EXISTS idx_dictations_user_folder ON public.dictations(user_id, folder_id);

-- Commentaire pour la documentation
COMMENT ON COLUMN public.dictations.folder_id IS 'Dossier dans lequel la dictée est rangée (NULL = pas de dossier)';
