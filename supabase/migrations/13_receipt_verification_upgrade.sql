-- ═══════════════════════════════════════════════════════════════
-- Migration 13: Colonnes manquantes pour la validation des reçus
--
-- Ajoute les structures nécessaires pour :
--   1. Suivi de vérification des reçus (audit & sécurité)
--   2. Protection anti-fraude (hash de reçu, idempotence)
--   3. Rate limiting côté serveur
--   4. Support Apple StoreKit 2 (JWS signed transactions)
--   5. Nettoyage automatique des abonnements expirés
-- ═══════════════════════════════════════════════════════════════

-- ═══ 1. Colonnes de sécurité sur subscriptions ═══

-- Hash du dernier reçu validé (pour déduplication)
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS last_receipt_hash TEXT;

-- Compteur de vérifications réussies
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS verification_count INTEGER NOT NULL DEFAULT 0;

-- Compteur de vérifications échouées (fraud detection)
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS failed_verification_count INTEGER NOT NULL DEFAULT 0;

-- Flag fraude détectée
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS fraud_flag BOOLEAN NOT NULL DEFAULT FALSE;

-- Raison du flag fraude (human-readable)
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS fraud_reason TEXT;

-- Identifiant de la dernière requête de vérification (idempotence)
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS last_idempotency_key TEXT;

-- Apple StoreKit 2 : JWS transaction ID (signedTransactionInfo)
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS storekit2_transaction_id TEXT;

-- Apple App Account Token (pour lier l'achat au user côté Apple)
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS app_account_token TEXT;

-- Index sur le hash de reçu pour recherche rapide
CREATE INDEX IF NOT EXISTS idx_subscriptions_receipt_hash
  ON subscriptions(last_receipt_hash)
  WHERE last_receipt_hash IS NOT NULL;

-- Index sur app_account_token
CREATE INDEX IF NOT EXISTS idx_subscriptions_app_account_token
  ON subscriptions(app_account_token)
  WHERE app_account_token IS NOT NULL;


-- ═══ 2. Table d'audit des vérifications de reçus ═══
-- Chaque appel à verify-store-receipt est logué ici
CREATE TABLE IF NOT EXISTS receipt_verification_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subscription_id UUID REFERENCES subscriptions(id) ON DELETE SET NULL,

  -- Identifiants
  store_provider TEXT NOT NULL CHECK (store_provider IN ('apple', 'google')),
  product_id TEXT,
  transaction_id TEXT,

  -- Vérification
  receipt_hash TEXT NOT NULL,
  idempotency_key TEXT,
  verification_status TEXT NOT NULL CHECK (verification_status IN (
    'success',              -- Reçu valide, abonnement activé
    'already_verified',     -- Reçu déjà validé (dédup)
    'invalid_receipt',      -- Reçu invalide (format ou signature)
    'expired',              -- Reçu expiré
    'refunded',             -- Reçu remboursé
    'fraud_detected',       -- Fraude détectée
    'rate_limited',         -- Rate limit atteint
    'store_error',          -- Erreur côté Apple/Google
    'internal_error'        -- Erreur interne
  )),

  -- Détails
  error_message TEXT,
  environment TEXT CHECK (environment IN ('production', 'sandbox', NULL)),

  -- Metadata de la requête
  client_ip TEXT,
  client_platform TEXT CHECK (client_platform IN ('ios', 'android', 'web', NULL)),
  client_app_version TEXT,

  -- Payload brut (pour debug, stocké chiffré en prod)
  raw_request JSONB,
  raw_response JSONB,

  -- Timing
  verification_duration_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index pour les requêtes fréquentes
CREATE INDEX IF NOT EXISTS idx_receipt_log_user
  ON receipt_verification_log(user_id);
CREATE INDEX IF NOT EXISTS idx_receipt_log_hash
  ON receipt_verification_log(receipt_hash);
CREATE INDEX IF NOT EXISTS idx_receipt_log_status
  ON receipt_verification_log(verification_status);
CREATE INDEX IF NOT EXISTS idx_receipt_log_created
  ON receipt_verification_log(created_at);
CREATE INDEX IF NOT EXISTS idx_receipt_log_idempotency
  ON receipt_verification_log(idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- RLS : l'utilisateur peut lire ses propres logs (utile pour debug côté client)
ALTER TABLE receipt_verification_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own verification logs" ON receipt_verification_log;
CREATE POLICY "Users can read own verification logs"
  ON receipt_verification_log FOR SELECT
  USING (auth.uid() = user_id);

-- Seul le serveur (service_role) peut insérer — pas de INSERT policy côté client


-- ═══ 3. Table de rate limiting ═══
-- Limite le nombre de vérifications par user par fenêtre de temps
CREATE TABLE IF NOT EXISTS receipt_rate_limits (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  window_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  request_count INTEGER NOT NULL DEFAULT 1,
  last_request_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(user_id, window_start)
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_user_window
  ON receipt_rate_limits(user_id, window_start);

ALTER TABLE receipt_rate_limits ENABLE ROW LEVEL SECURITY;
-- Aucune policy client = inaccessible côté client


-- ═══ 4. Fonction : vérifier le rate limit ═══
-- Retourne TRUE si la requête est autorisée, FALSE si rate limited
CREATE OR REPLACE FUNCTION check_receipt_rate_limit(
  p_user_id UUID,
  p_max_requests INTEGER DEFAULT 10,       -- Max requêtes par fenêtre
  p_window_minutes INTEGER DEFAULT 60      -- Fenêtre en minutes
)
RETURNS BOOLEAN AS $$
DECLARE
  v_window_start TIMESTAMPTZ;
  v_count INTEGER;
BEGIN
  -- Calculer le début de la fenêtre courante
  v_window_start := date_trunc('hour', NOW())
    + (FLOOR(EXTRACT(MINUTE FROM NOW()) / p_window_minutes) * p_window_minutes) * INTERVAL '1 minute';

  -- Upsert le compteur
  INSERT INTO receipt_rate_limits (user_id, window_start, request_count, last_request_at)
  VALUES (p_user_id, v_window_start, 1, NOW())
  ON CONFLICT (user_id, window_start)
  DO UPDATE SET
    request_count = receipt_rate_limits.request_count + 1,
    last_request_at = NOW()
  RETURNING request_count INTO v_count;

  -- Vérifier la limite
  RETURN v_count <= p_max_requests;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ═══ 5. Fonction : logger une vérification de reçu ═══
CREATE OR REPLACE FUNCTION log_receipt_verification(
  p_user_id UUID,
  p_store_provider TEXT,
  p_receipt_hash TEXT,
  p_verification_status TEXT,
  p_product_id TEXT DEFAULT NULL,
  p_transaction_id TEXT DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL,
  p_error_message TEXT DEFAULT NULL,
  p_environment TEXT DEFAULT NULL,
  p_client_ip TEXT DEFAULT NULL,
  p_client_platform TEXT DEFAULT NULL,
  p_client_app_version TEXT DEFAULT NULL,
  p_raw_request JSONB DEFAULT NULL,
  p_raw_response JSONB DEFAULT NULL,
  p_duration_ms INTEGER DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_sub_id UUID;
  v_log_id UUID;
BEGIN
  -- Trouver la subscription du user
  SELECT id INTO v_sub_id FROM subscriptions WHERE user_id = p_user_id LIMIT 1;

  INSERT INTO receipt_verification_log (
    user_id, subscription_id,
    store_provider, product_id, transaction_id,
    receipt_hash, idempotency_key, verification_status,
    error_message, environment,
    client_ip, client_platform, client_app_version,
    raw_request, raw_response, verification_duration_ms
  ) VALUES (
    p_user_id, v_sub_id,
    p_store_provider, p_product_id, p_transaction_id,
    p_receipt_hash, p_idempotency_key, p_verification_status,
    p_error_message, p_environment,
    p_client_ip, p_client_platform, p_client_app_version,
    p_raw_request, p_raw_response, p_duration_ms
  )
  RETURNING id INTO v_log_id;

  -- Mettre à jour les compteurs sur la subscription
  IF p_verification_status = 'success' THEN
    UPDATE subscriptions SET
      verification_count = verification_count + 1,
      last_receipt_hash = p_receipt_hash,
      last_idempotency_key = p_idempotency_key,
      last_verified_at = NOW()
    WHERE user_id = p_user_id;
  ELSIF p_verification_status IN ('invalid_receipt', 'fraud_detected') THEN
    UPDATE subscriptions SET
      failed_verification_count = failed_verification_count + 1
    WHERE user_id = p_user_id;

    -- Auto-flag fraude après 5 échecs
    UPDATE subscriptions SET
      fraud_flag = TRUE,
      fraud_reason = COALESCE(fraud_reason || '; ', '') || p_verification_status || ' at ' || NOW()::TEXT
    WHERE user_id = p_user_id
      AND failed_verification_count >= 5
      AND fraud_flag = FALSE;
  END IF;

  RETURN v_log_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ═══ 6. Fonction : vérifier l'idempotence (même reçu déjà validé) ═══
CREATE OR REPLACE FUNCTION check_receipt_idempotency(
  p_receipt_hash TEXT,
  p_user_id UUID
)
RETURNS TABLE (
  already_verified BOOLEAN,
  existing_plan TEXT,
  existing_expires_date TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    TRUE AS already_verified,
    s.plan,
    s.expiry_date
  FROM subscriptions s
  WHERE s.user_id = p_user_id
    AND s.last_receipt_hash = p_receipt_hash
    AND s.is_active = TRUE
    AND (s.expiry_date IS NULL OR s.expiry_date > NOW());

  -- Si aucun résultat, retourner une ligne "pas encore vérifié"
  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, NULL::TEXT, NULL::TIMESTAMPTZ;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ═══ 7. Fonction : nettoyage automatique des abonnements expirés ═══
-- À appeler via un cron (pg_cron) ou une Edge Function programmée
CREATE OR REPLACE FUNCTION cleanup_expired_subscriptions()
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER;
BEGIN
  -- Marquer comme expirés les abonnements dont la date est passée
  -- et qui ne sont pas en période de grâce
  WITH expired AS (
    UPDATE subscriptions SET
      status = 'expired',
      is_active = FALSE,
      plan = 'free',
      auto_renew = FALSE
    WHERE status = 'active'
      AND is_active = TRUE
      AND plan IN ('premium_monthly', 'premium_annual')
      AND expiry_date IS NOT NULL
      AND expiry_date < NOW()
      AND (grace_period_expires IS NULL OR grace_period_expires < NOW())
    RETURNING id
  )
  SELECT COUNT(*) INTO v_count FROM expired;

  -- Logger les expirations
  INSERT INTO store_transaction_log (
    user_id, subscription_id,
    store_provider, transaction_id, original_transaction_id,
    product_id, event_type, environment
  )
  SELECT
    s.user_id, s.id,
    COALESCE(s.store_provider, 'manual'),
    COALESCE(s.store_transaction_id, 'auto-cleanup'),
    s.store_original_transaction_id,
    s.store_product_id,
    'expired',
    COALESCE(s.store_environment, 'production')
  FROM subscriptions s
  WHERE s.status = 'expired'
    AND s.is_active = FALSE
    AND s.updated_at >= NOW() - INTERVAL '1 minute';

  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ═══ 8. Nettoyage des rate limits anciens (> 24h) ═══
CREATE OR REPLACE FUNCTION cleanup_old_rate_limits()
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER;
BEGIN
  DELETE FROM receipt_rate_limits
  WHERE window_start < NOW() - INTERVAL '24 hours';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ═══ 9. Vue récapitulative pour le dashboard admin ═══
CREATE OR REPLACE VIEW subscription_stats AS
SELECT
  COUNT(*) FILTER (WHERE plan = 'free') AS free_users,
  COUNT(*) FILTER (WHERE plan = 'premium_monthly' AND is_active) AS active_monthly,
  COUNT(*) FILTER (WHERE plan = 'premium_annual' AND is_active) AS active_annual,
  COUNT(*) FILTER (WHERE fraud_flag = TRUE) AS fraud_flagged,
  COUNT(*) FILTER (WHERE status = 'expired') AS expired,
  COUNT(*) FILTER (WHERE status = 'past_due') AS past_due,
  COUNT(*) FILTER (WHERE store_provider = 'apple') AS apple_subs,
  COUNT(*) FILTER (WHERE store_provider = 'google') AS google_subs,
  SUM(verification_count) AS total_verifications,
  SUM(failed_verification_count) AS total_failed_verifications
FROM subscriptions;
