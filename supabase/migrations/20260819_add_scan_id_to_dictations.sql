-- Migration: Ajouter la colonne scan_id à la table dictations pour la relier au texte source
-- À appliquer dans Supabase Dashboard > SQL Editor
-- Contexte: la table dictations existait déjà (08_create_dictations_table.sql) mais n'était
-- reliée à aucun scan précis (seulement un champ "title" en texte libre). Nécessaire pour
-- compter fiablement le nombre de pratiques par texte (badge "Déjà pratiqué N×" côté app).

-- Ajouter la colonne scan_id (nullable, la table n'a jamais été peuplée à ce jour)
ALTER TABLE public.dictations
ADD COLUMN IF NOT EXISTS scan_id UUID REFERENCES public.scans(id) ON DELETE CASCADE;

-- Index pour compter rapidement les dictées complétées par (utilisateur, texte)
CREATE INDEX IF NOT EXISTS idx_dictations_scan_id ON public.dictations(user_id, scan_id);

-- Commentaire pour la documentation
COMMENT ON COLUMN public.dictations.scan_id IS 'Texte source (scans.id) dont cette dictée est un segment. NULL pour les éventuelles dictées historiques sans lien direct.';
