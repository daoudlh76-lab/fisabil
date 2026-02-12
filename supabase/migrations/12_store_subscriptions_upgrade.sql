-- ═══════════════════════════════════════════════════════════════
-- Migration 12: Compatibilité App Store & Google Play
--
-- Ajoute les colonnes et structures nécessaires pour :
--   1. Validation côté serveur des reçus Apple / Google
--   2. Gestion du renouvellement automatique
--   3. Période de grâce (grace period)
--   4. Historique des transactions store
--   5. Webhook processing log
-- ═══════════════════════════════════════════════════════════════

-- ═══ 1. Nouvelles colonnes sur subscriptions ═══

-- Prix et devise payés (pour analytics & support)
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS store_price_amount NUMERIC(10, 2),
  ADD COLUMN IF NOT EXISTS store_currency TEXT;

-- Renouvellement automatique
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS auto_renew BOOLEAN NOT NULL DEFAULT FALSE;

-- Date d'expiration côté store (peut différer de expiry_date pendant grace period)
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS store_expires_date TIMESTAMPTZ;

-- Grace period : période de grâce après échec de paiement
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS grace_period_expires TIMESTAMPTZ;

-- Identifiant d'abonnement natif du store (subscriptionGroupIdentifier Apple / purchaseToken Google)
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS platform_subscription_id TEXT;

-- Compteur de renouvellements (utile pour analytics)
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS renewal_count INTEGER NOT NULL DEFAULT 0;

-- Dernière vérification du reçu
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS last_verified_at TIMESTAMPTZ;

-- ═══ 2. Table de log des transactions store ═══
-- Historique complet de chaque événement (achat, renouvellement, annulation, remboursement)
CREATE TABLE IF NOT EXISTS store_transaction_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subscription_id UUID REFERENCES subscriptions(id) ON DELETE SET NULL,

  -- Identifiants
  store_provider TEXT NOT NULL CHECK (store_provider IN ('apple', 'google')),
  transaction_id TEXT NOT NULL,
  original_transaction_id TEXT,
  product_id TEXT NOT NULL,

  -- Type d'événement
  event_type TEXT NOT NULL CHECK (event_type IN (
    'purchase',            -- Achat initial
    'renewal',             -- Renouvellement automatique
    'cancellation',        -- Annulation (ne renouvelle plus)
    'refund',              -- Remboursement
    'grace_period',        -- Entrée en période de grâce
    'billing_retry',       -- Retentative de paiement
    'revoke',              -- Révocation (ex: remboursement Apple)
    'price_change',        -- Changement de prix
    'upgrade',             -- Upgrade de plan
    'downgrade',           -- Downgrade de plan
    'expired',             -- Expiration
    'resubscribe'          -- Ré-abonnement après annulation
  )),

  -- Données financières
  price_amount NUMERIC(10, 2),
  currency TEXT,

  -- Environnement
  environment TEXT NOT NULL DEFAULT 'production'
    CHECK (environment IN ('production', 'sandbox')),

  -- Payload brut du store (pour debug & audit)
  raw_payload JSONB,

  -- Statut de traitement
  processed BOOLEAN NOT NULL DEFAULT TRUE,
  error_message TEXT,

  -- Dates
  event_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index pour les requêtes fréquentes
CREATE INDEX IF NOT EXISTS idx_store_tx_log_user
  ON store_transaction_log(user_id);
CREATE INDEX IF NOT EXISTS idx_store_tx_log_tx_id
  ON store_transaction_log(transaction_id);
CREATE INDEX IF NOT EXISTS idx_store_tx_log_original_tx
  ON store_transaction_log(original_transaction_id)
  WHERE original_transaction_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_store_tx_log_event_type
  ON store_transaction_log(event_type);

-- RLS sur store_transaction_log
ALTER TABLE store_transaction_log ENABLE ROW LEVEL SECURITY;

-- L'utilisateur peut voir ses propres transactions
DROP POLICY IF EXISTS "Users can read own transaction logs" ON store_transaction_log;
CREATE POLICY "Users can read own transaction logs"
  ON store_transaction_log FOR SELECT
  USING (auth.uid() = user_id);

-- Seul le serveur (service_role) peut insérer/modifier
-- (pas de INSERT/UPDATE policy côté client = interdit par défaut)


-- ═══ 3. Table pour traiter les notifications serveur (webhooks) ═══
-- Apple Server Notifications v2 & Google RTDN (Real-time Developer Notifications)
CREATE TABLE IF NOT EXISTS store_webhook_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  store_provider TEXT NOT NULL CHECK (store_provider IN ('apple', 'google')),
  notification_type TEXT NOT NULL,  -- ex: DID_RENEW, SUBSCRIBED, EXPIRED, etc.
  subtype TEXT,                      -- ex: AUTO_RENEW_DISABLED, VOLUNTARY, etc.

  -- Identifiants pour retrouver l'abonnement
  original_transaction_id TEXT,
  product_id TEXT,

  -- Payload brut
  raw_payload JSONB NOT NULL,

  -- Traitement
  processed BOOLEAN NOT NULL DEFAULT FALSE,
  processed_at TIMESTAMPTZ,
  error_message TEXT,

  -- Dates
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhook_events_processed
  ON store_webhook_events(processed)
  WHERE processed = FALSE;
CREATE INDEX IF NOT EXISTS idx_webhook_events_original_tx
  ON store_webhook_events(original_transaction_id)
  WHERE original_transaction_id IS NOT NULL;

-- Pas de RLS sur webhook_events (table serveur uniquement)
ALTER TABLE store_webhook_events ENABLE ROW LEVEL SECURITY;
-- Aucune policy = inaccessible côté client


-- ═══ 4. Fonction : activer un abonnement après validation du reçu ═══
-- Appelée par l'Edge Function verify-store-receipt
CREATE OR REPLACE FUNCTION activate_store_subscription(
  p_user_id UUID,
  p_plan TEXT,
  p_store_provider TEXT,
  p_product_id TEXT,
  p_transaction_id TEXT,
  p_original_transaction_id TEXT,
  p_expires_date TIMESTAMPTZ,
  p_environment TEXT DEFAULT 'production',
  p_price_amount NUMERIC DEFAULT NULL,
  p_currency TEXT DEFAULT NULL,
  p_auto_renew BOOLEAN DEFAULT TRUE
)
RETURNS JSONB AS $$
DECLARE
  v_sub_id UUID;
  v_result JSONB;
BEGIN
  -- Upsert la subscription
  INSERT INTO subscriptions (
    user_id, plan, status, is_active,
    start_date, expiry_date,
    store_provider, store_product_id,
    store_transaction_id, store_original_transaction_id,
    store_environment, store_expires_date,
    store_price_amount, store_currency,
    auto_renew, last_verified_at
  ) VALUES (
    p_user_id, p_plan, 'active', TRUE,
    NOW(), p_expires_date,
    p_store_provider, p_product_id,
    p_transaction_id, p_original_transaction_id,
    p_environment, p_expires_date,
    p_price_amount, p_currency,
    p_auto_renew, NOW()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    plan = EXCLUDED.plan,
    status = 'active',
    is_active = TRUE,
    expiry_date = EXCLUDED.expiry_date,
    store_provider = EXCLUDED.store_provider,
    store_product_id = EXCLUDED.store_product_id,
    store_transaction_id = EXCLUDED.store_transaction_id,
    store_original_transaction_id = EXCLUDED.store_original_transaction_id,
    store_environment = EXCLUDED.store_environment,
    store_expires_date = EXCLUDED.store_expires_date,
    store_price_amount = EXCLUDED.store_price_amount,
    store_currency = EXCLUDED.store_currency,
    auto_renew = EXCLUDED.auto_renew,
    last_verified_at = NOW(),
    canceled_at = NULL,
    cancel_at_period_end = FALSE
  RETURNING id INTO v_sub_id;

  -- Logger la transaction
  INSERT INTO store_transaction_log (
    user_id, subscription_id,
    store_provider, transaction_id, original_transaction_id,
    product_id, event_type,
    price_amount, currency, environment
  ) VALUES (
    p_user_id, v_sub_id,
    p_store_provider, p_transaction_id, p_original_transaction_id,
    p_product_id, 'purchase',
    p_price_amount, p_currency, p_environment
  );

  v_result := jsonb_build_object(
    'success', TRUE,
    'subscription_id', v_sub_id,
    'plan', p_plan,
    'expires_date', p_expires_date
  );

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ═══ 5. Fonction : traiter un webhook de renouvellement ═══
CREATE OR REPLACE FUNCTION handle_store_renewal(
  p_original_transaction_id TEXT,
  p_new_transaction_id TEXT,
  p_new_expires_date TIMESTAMPTZ,
  p_store_provider TEXT
)
RETURNS JSONB AS $$
DECLARE
  v_sub RECORD;
  v_result JSONB;
BEGIN
  -- Trouver la subscription par original_transaction_id
  SELECT * INTO v_sub FROM subscriptions
    WHERE store_original_transaction_id = p_original_transaction_id
    LIMIT 1;

  IF v_sub IS NULL THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'Subscription not found');
  END IF;

  -- Mettre à jour
  UPDATE subscriptions SET
    status = 'active',
    is_active = TRUE,
    expiry_date = p_new_expires_date,
    store_expires_date = p_new_expires_date,
    store_transaction_id = p_new_transaction_id,
    last_verified_at = NOW(),
    renewal_count = renewal_count + 1,
    grace_period_expires = NULL
  WHERE id = v_sub.id;

  -- Logger
  INSERT INTO store_transaction_log (
    user_id, subscription_id,
    store_provider, transaction_id, original_transaction_id,
    product_id, event_type, environment
  ) VALUES (
    v_sub.user_id, v_sub.id,
    p_store_provider, p_new_transaction_id, p_original_transaction_id,
    v_sub.store_product_id, 'renewal', v_sub.store_environment
  );

  v_result := jsonb_build_object(
    'success', TRUE,
    'subscription_id', v_sub.id,
    'new_expires_date', p_new_expires_date
  );

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ═══ 6. Fonction : gérer une annulation / expiration ═══
CREATE OR REPLACE FUNCTION handle_store_cancellation(
  p_original_transaction_id TEXT,
  p_event_type TEXT,  -- 'cancellation', 'refund', 'expired', 'revoke'
  p_store_provider TEXT
)
RETURNS JSONB AS $$
DECLARE
  v_sub RECORD;
BEGIN
  SELECT * INTO v_sub FROM subscriptions
    WHERE store_original_transaction_id = p_original_transaction_id
    LIMIT 1;

  IF v_sub IS NULL THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'Subscription not found');
  END IF;

  IF p_event_type = 'cancellation' THEN
    -- Annulation : l'abonnement reste actif jusqu'à expiration
    UPDATE subscriptions SET
      cancel_at_period_end = TRUE,
      canceled_at = NOW(),
      auto_renew = FALSE
    WHERE id = v_sub.id;

  ELSIF p_event_type IN ('refund', 'revoke') THEN
    -- Remboursement/révocation : désactiver immédiatement
    UPDATE subscriptions SET
      status = 'expired',
      is_active = FALSE,
      plan = 'free',
      canceled_at = NOW(),
      auto_renew = FALSE
    WHERE id = v_sub.id;

  ELSIF p_event_type = 'expired' THEN
    -- Expiration naturelle
    UPDATE subscriptions SET
      status = 'expired',
      is_active = FALSE,
      plan = 'free',
      auto_renew = FALSE
    WHERE id = v_sub.id;
  END IF;

  -- Logger
  INSERT INTO store_transaction_log (
    user_id, subscription_id,
    store_provider, transaction_id, original_transaction_id,
    product_id, event_type, environment
  ) VALUES (
    v_sub.user_id, v_sub.id,
    p_store_provider, v_sub.store_transaction_id, p_original_transaction_id,
    v_sub.store_product_id, p_event_type, v_sub.store_environment
  );

  RETURN jsonb_build_object('success', TRUE, 'event', p_event_type);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ═══ 7. Fonction : période de grâce (billing retry) ═══
CREATE OR REPLACE FUNCTION handle_store_grace_period(
  p_original_transaction_id TEXT,
  p_grace_expires TIMESTAMPTZ,
  p_store_provider TEXT
)
RETURNS JSONB AS $$
DECLARE
  v_sub RECORD;
BEGIN
  SELECT * INTO v_sub FROM subscriptions
    WHERE store_original_transaction_id = p_original_transaction_id
    LIMIT 1;

  IF v_sub IS NULL THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'Subscription not found');
  END IF;

  UPDATE subscriptions SET
    status = 'past_due',
    grace_period_expires = p_grace_expires
  WHERE id = v_sub.id;

  INSERT INTO store_transaction_log (
    user_id, subscription_id,
    store_provider, transaction_id, original_transaction_id,
    product_id, event_type, environment
  ) VALUES (
    v_sub.user_id, v_sub.id,
    p_store_provider, v_sub.store_transaction_id, p_original_transaction_id,
    v_sub.store_product_id, 'grace_period', v_sub.store_environment
  );

  RETURN jsonb_build_object('success', TRUE, 'grace_expires', p_grace_expires);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ═══ 8. Mettre à jour is_premium pour inclure grace period ═══
CREATE OR REPLACE FUNCTION public.is_premium(check_user_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM subscriptions
    WHERE user_id = check_user_id
      AND plan IN ('premium_monthly', 'premium_annual')
      AND is_active = TRUE
      AND (
        -- Pas encore expiré
        (expiry_date IS NULL OR expiry_date > NOW())
        OR
        -- Ou en période de grâce
        (grace_period_expires IS NOT NULL AND grace_period_expires > NOW())
      )
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;
