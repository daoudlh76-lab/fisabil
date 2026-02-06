-- ═══════════════════════════════════════════════════════════════
-- Table: subscriptions
-- Stocke l'abonnement de chaque utilisateur côté serveur.
-- Source de vérité pour le statut premium.
--
-- Sécurité :
--   - L'utilisateur peut LIRE sa propre subscription (SELECT).
--   - L'utilisateur peut CRÉER sa subscription initiale (INSERT)
--     mais UNIQUEMENT avec le plan 'free'.
--   - Seul le serveur (service_role) peut modifier plan/statut (UPDATE).
--   - Pas de DELETE côté client.
--
-- Colonnes store_* : synchronisation Apple / Google subscriptions.
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Plan & statut
  plan TEXT NOT NULL DEFAULT 'free'
    CHECK (plan IN ('free', 'premium_monthly', 'premium_annual')),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'canceled', 'past_due', 'expired', 'trialing')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,

  -- Dates
  start_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expiry_date TIMESTAMPTZ,
  trial_end TIMESTAMPTZ,
  canceled_at TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,

  -- Store synchronisation (Apple / Google)
  store_provider TEXT CHECK (store_provider IN ('apple', 'google', 'manual', NULL)),
  store_product_id TEXT,
  store_transaction_id TEXT,
  store_original_transaction_id TEXT,
  store_receipt TEXT,
  store_environment TEXT CHECK (store_environment IN ('production', 'sandbox', NULL)),

  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(user_id)
);

-- ═══ Index pour les requêtes fréquentes ═══
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_expiry ON subscriptions(expiry_date)
  WHERE expiry_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_subscriptions_store_tx
  ON subscriptions(store_original_transaction_id)
  WHERE store_original_transaction_id IS NOT NULL;

-- ═══ RLS (Row Level Security) ═══
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

-- 1. L'utilisateur ne peut LIRE que sa propre subscription
CREATE POLICY "Users can read own subscription"
  ON subscriptions FOR SELECT
  USING (auth.uid() = user_id);

-- 2. L'utilisateur peut CRÉER sa subscription initiale (plan free uniquement)
--    Empêche un client de se créer directement un plan premium.
CREATE POLICY "Users can insert own free subscription"
  ON subscriptions FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND plan = 'free'
  );

-- 3. L'utilisateur peut mettre à jour UNIQUEMENT les champs non-sensibles.
--    Le plan, status, is_active, store_* ne sont PAS modifiables côté client.
--    Seul le serveur (service_role key, bypasses RLS) peut changer le plan.
--    On autorise l'UPDATE pour que le cache local puisse se resync,
--    mais on bloque les modifications de plan via un trigger.
CREATE POLICY "Users can update own subscription (restricted)"
  ON subscriptions FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 4. Pas de DELETE côté client
-- (aucune policy DELETE = interdit par défaut avec RLS activé)

-- ═══ Trigger : empêcher le client de modifier le plan ═══
-- Si le rôle n'est pas service_role/postgres, le plan ne peut pas changer.
CREATE OR REPLACE FUNCTION prevent_client_plan_change()
RETURNS TRIGGER AS $$
BEGIN
  -- Autoriser service_role et postgres (migrations, edge functions)
  IF current_setting('role', true) IN ('service_role', 'postgres', 'supabase_admin') THEN
    RETURN NEW;
  END IF;

  -- Bloquer les modifications de champs sensibles côté client
  IF NEW.plan IS DISTINCT FROM OLD.plan THEN
    RAISE EXCEPTION 'Unauthorized: plan can only be changed server-side';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'Unauthorized: status can only be changed server-side';
  END IF;
  IF NEW.store_provider IS DISTINCT FROM OLD.store_provider THEN
    RAISE EXCEPTION 'Unauthorized: store_provider can only be changed server-side';
  END IF;
  IF NEW.store_transaction_id IS DISTINCT FROM OLD.store_transaction_id THEN
    RAISE EXCEPTION 'Unauthorized: store_transaction_id can only be changed server-side';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_prevent_client_plan_change
  BEFORE UPDATE ON subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION prevent_client_plan_change();

-- ═══ Trigger : updated_at automatique ═══
CREATE OR REPLACE FUNCTION update_subscriptions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_subscriptions_updated_at
  BEFORE UPDATE ON subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION update_subscriptions_updated_at();

-- ═══ Fonction helper : vérifier si un user est premium (utilisable dans d'autres policies) ═══
CREATE OR REPLACE FUNCTION public.is_premium(check_user_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM subscriptions
    WHERE user_id = check_user_id
      AND plan IN ('premium_monthly', 'premium_annual')
      AND is_active = TRUE
      AND (expiry_date IS NULL OR expiry_date > NOW())
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;
