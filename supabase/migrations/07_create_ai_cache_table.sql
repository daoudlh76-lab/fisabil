-- Migration: Créer la table ai_cache pour mettre en cache les réponses de l'IA
-- À appliquer dans Supabase Dashboard > SQL Editor

CREATE TABLE IF NOT EXISTS public.ai_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,

  -- Contrainte unique : un utilisateur ne peut avoir qu'un cache par clé
  UNIQUE(user_id, key)
);

-- Index pour améliorer les performances des requêtes
CREATE INDEX IF NOT EXISTS idx_ai_cache_user_id ON public.ai_cache(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_cache_key ON public.ai_cache(user_id, key);
CREATE INDEX IF NOT EXISTS idx_ai_cache_expires_at ON public.ai_cache(expires_at) WHERE expires_at IS NOT NULL;

-- Row Level Security (RLS)
ALTER TABLE public.ai_cache ENABLE ROW LEVEL SECURITY;

-- Politique : Les utilisateurs peuvent voir uniquement leur propre cache
DROP POLICY IF EXISTS "Users can view their own cache" ON public.ai_cache;
CREATE POLICY "Users can view their own cache"
  ON public.ai_cache
  FOR SELECT
  USING (auth.uid() = user_id);

-- Politique : Les utilisateurs peuvent insérer leur propre cache
DROP POLICY IF EXISTS "Users can insert their own cache" ON public.ai_cache;
CREATE POLICY "Users can insert their own cache"
  ON public.ai_cache
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Politique : Les utilisateurs peuvent mettre à jour leur propre cache
DROP POLICY IF EXISTS "Users can update their own cache" ON public.ai_cache;
CREATE POLICY "Users can update their own cache"
  ON public.ai_cache
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Politique : Les utilisateurs peuvent supprimer leur propre cache
DROP POLICY IF EXISTS "Users can delete their own cache" ON public.ai_cache;
CREATE POLICY "Users can delete their own cache"
  ON public.ai_cache
  FOR DELETE
  USING (auth.uid() = user_id);

-- Trigger pour mettre à jour automatiquement updated_at
CREATE OR REPLACE FUNCTION update_ai_cache_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_ai_cache_updated_at ON public.ai_cache;
CREATE TRIGGER update_ai_cache_updated_at
  BEFORE UPDATE ON public.ai_cache
  FOR EACH ROW
  EXECUTE FUNCTION update_ai_cache_updated_at();

-- Fonction pour nettoyer automatiquement les caches expirés
CREATE OR REPLACE FUNCTION cleanup_expired_cache()
RETURNS void AS $$
BEGIN
  DELETE FROM public.ai_cache
  WHERE expires_at IS NOT NULL AND expires_at < NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Commentaires pour la documentation
COMMENT ON TABLE public.ai_cache IS 'Cache des réponses de l''IA (vocabulaire, traductions, etc.)';
COMMENT ON COLUMN public.ai_cache.key IS 'Clé unique du cache (ex: ai_vocab_scan_123)';
COMMENT ON COLUMN public.ai_cache.payload IS 'Données JSON mises en cache';
COMMENT ON COLUMN public.ai_cache.expires_at IS 'Date d''expiration du cache (NULL = pas d''expiration)';
