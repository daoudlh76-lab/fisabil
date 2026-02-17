-- Ajouter la colonne updated_at manquante dans la table scans
-- Le trigger update_scans_updated_at existe déjà mais échoue car la colonne n'existe pas
ALTER TABLE public.scans ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
