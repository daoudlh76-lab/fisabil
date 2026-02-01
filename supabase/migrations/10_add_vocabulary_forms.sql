-- Migration: Ajouter les colonnes singulier, pluriel et contraire à la table vocabulary
-- À appliquer dans Supabase Dashboard > SQL Editor

-- Ajouter les nouvelles colonnes
ALTER TABLE public.vocabulary
ADD COLUMN IF NOT EXISTS singulier TEXT,
ADD COLUMN IF NOT EXISTS pluriel TEXT,
ADD COLUMN IF NOT EXISTS contraire TEXT,
ADD COLUMN IF NOT EXISTS racine TEXT;

-- Commentaires pour la documentation
COMMENT ON COLUMN public.vocabulary.singulier IS 'Forme singulière du mot arabe avec diacritiques';
COMMENT ON COLUMN public.vocabulary.pluriel IS 'Forme plurielle du mot arabe avec diacritiques';
COMMENT ON COLUMN public.vocabulary.contraire IS 'Antonyme/contraire du mot arabe avec diacritiques';
COMMENT ON COLUMN public.vocabulary.racine IS 'Racine du mot arabe';
