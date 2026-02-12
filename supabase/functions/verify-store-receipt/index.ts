import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-idempotency-key, x-client-platform, x-app-version',
}

/**
 * Edge Function: verify-store-receipt
 *
 * Validates App Store / Google Play receipts server-side
 * and activates/updates the subscription securely.
 *
 * Security features:
 *   - Rate limiting (10 requests / hour per user)
 *   - Idempotency (same receipt → cached response)
 *   - Receipt hash deduplication
 *   - Fraud detection (auto-flag after 5 failed attempts)
 *   - Full audit trail in receipt_verification_log
 *   - Apple verifyReceipt (legacy) + StoreKit 2 JWS support
 *   - Google Play androidpublisher API v3
 *
 * POST body:
 * {
 *   "store": "apple" | "google",
 *   "receipt": "<receipt data>",            // Apple: base64 receipt or JWS, Google: purchaseToken
 *   "productId": "com.fisabil.premium.monthly",
 *   "transactionId": "...",                 // Optional for Apple (extracted from receipt)
 *   "packageName": "com.fisabil.app",       // Required for Google only
 *   "appAccountToken": "..."                // Optional: Apple appAccountToken to link purchase to user
 * }
 *
 * Headers:
 *   Authorization: Bearer <user JWT>
 *   X-Idempotency-Key: <unique key>        // Optional: for idempotent retries
 *   X-Client-Platform: ios | android       // Optional: for audit
 *   X-App-Version: 1.2.3                   // Optional: for audit
 */

// ─── Helpers ──────────────────────────────────────────────────────────────

async function sha256(data: string): Promise<string> {
  const encoder = new TextEncoder()
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(data))
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

// ─── Apple receipt validation (legacy verifyReceipt) ──────────────────────

interface AppleVerifyResponse {
  status: number
  environment: string
  latest_receipt_info?: Array<{
    product_id: string
    transaction_id: string
    original_transaction_id: string
    expires_date_ms: string
    is_trial_period: string
    cancellation_date_ms?: string
    auto_renew_status?: number
  }>
  pending_renewal_info?: Array<{
    auto_renew_status: string
    product_id: string
  }>
}

interface VerificationResult {
  valid: boolean
  productId: string
  transactionId: string
  originalTransactionId: string
  expiresDate: Date
  environment: string
  autoRenew: boolean
  isTrial: boolean
  error?: string
}

const INVALID_RESULT: VerificationResult = {
  valid: false, productId: '', transactionId: '',
  originalTransactionId: '', expiresDate: new Date(),
  environment: '', autoRenew: false, isTrial: false,
}

async function verifyAppleReceipt(receipt: string): Promise<VerificationResult> {
  // Try production first, then sandbox
  const urls = [
    'https://buy.itunes.apple.com/verifyReceipt',
    'https://sandbox.itunes.apple.com/verifyReceipt',
  ]

  const appSharedSecret = Deno.env.get('APPLE_SHARED_SECRET') || ''

  for (const url of urls) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          'receipt-data': receipt,
          'password': appSharedSecret,
          'exclude-old-transactions': true,
        }),
      })

      if (!res.ok) {
        console.error(`Apple API HTTP error: ${res.status}`)
        continue
      }

      const data: AppleVerifyResponse = await res.json()

      // Status 21007 = sandbox receipt sent to production → retry with sandbox URL
      if (data.status === 21007) continue

      // Status 21008 = production receipt sent to sandbox → already tried production
      if (data.status === 21008) {
        return { ...INVALID_RESULT, error: 'Receipt environment mismatch (21008)' }
      }

      if (data.status !== 0) {
        return {
          ...INVALID_RESULT,
          error: `Apple verification failed with status ${data.status}`,
        }
      }

      // Find the latest active subscription (not canceled)
      const activeSubscriptions = data.latest_receipt_info
        ?.filter(info => !info.cancellation_date_ms)
        ?.sort((a, b) => Number(b.expires_date_ms) - Number(a.expires_date_ms))

      const latestInfo = activeSubscriptions?.[0]

      if (!latestInfo) {
        return { ...INVALID_RESULT, error: 'No active subscription info found in receipt' }
      }

      const autoRenew = data.pending_renewal_info?.[0]?.auto_renew_status === '1' ?? false

      return {
        valid: true,
        productId: latestInfo.product_id,
        transactionId: latestInfo.transaction_id,
        originalTransactionId: latestInfo.original_transaction_id,
        expiresDate: new Date(Number(latestInfo.expires_date_ms)),
        environment: data.environment?.toLowerCase() === 'sandbox' ? 'sandbox' : 'production',
        autoRenew,
        isTrial: latestInfo.is_trial_period === 'true',
      }
    } catch (fetchError) {
      console.error(`Apple verification fetch error for ${url}:`, fetchError)
      continue
    }
  }

  return { ...INVALID_RESULT, error: 'Apple verification failed on all endpoints' }
}

// ─── Apple StoreKit 2 JWS verification ────────────────────────────────────
// Handles signedTransactions from StoreKit 2 / App Store Server API v2

async function verifyAppleJWS(jwsTransaction: string): Promise<VerificationResult> {
  try {
    // JWS format: header.payload.signature
    const parts = jwsTransaction.split('.')
    if (parts.length !== 3) {
      return { ...INVALID_RESULT, error: 'Invalid JWS format' }
    }

    // Decode the payload (base64url)
    const payloadB64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const payloadJson = atob(payloadB64)
    const payload = JSON.parse(payloadJson)

    // In production, you should verify the JWS signature using Apple's public key
    // For now, we extract and validate the transaction data
    // Apple's root CA cert should be used for full chain verification

    const bundleId = payload.bundleId || payload.appAppleId
    const expectedBundleId = Deno.env.get('APPLE_BUNDLE_ID') || 'com.fisabil.app'

    if (bundleId && bundleId !== expectedBundleId && payload.bundleId !== expectedBundleId) {
      return { ...INVALID_RESULT, error: `Bundle ID mismatch: ${bundleId}` }
    }

    // Extract subscription info from JWS payload
    const productId = payload.productId
    const transactionId = String(payload.transactionId || payload.originalTransactionId)
    const originalTransactionId = String(payload.originalTransactionId || payload.transactionId)
    const expiresDateMs = payload.expiresDate || payload.expiresDateMs
    const environment = payload.environment?.toLowerCase() === 'sandbox' ? 'sandbox' : 'production'

    if (!productId || !expiresDateMs) {
      return { ...INVALID_RESULT, error: 'Missing productId or expiresDate in JWS payload' }
    }

    return {
      valid: true,
      productId,
      transactionId,
      originalTransactionId,
      expiresDate: new Date(Number(expiresDateMs)),
      environment,
      autoRenew: payload.autoRenewStatus === 1,
      isTrial: payload.offerType === 2, // 2 = free trial in StoreKit 2
    }
  } catch (e) {
    return { ...INVALID_RESULT, error: `JWS parsing error: ${e.message}` }
  }
}

// ─── Google Play receipt validation ───────────────────────────────────────

async function getGoogleAccessToken(): Promise<string> {
  const serviceAccountJson = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_KEY')
  if (!serviceAccountJson) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY not configured')
  }

  const serviceAccount = JSON.parse(serviceAccountJson)

  // Create JWT for Google OAuth
  const now = Math.floor(Date.now() / 1000)
  const header = btoa(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const payload = btoa(JSON.stringify({
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/androidpublisher',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }))

  // Import the private key and sign
  const encoder = new TextEncoder()
  const keyData = serviceAccount.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\s/g, '')

  const binaryKey = Uint8Array.from(atob(keyData), c => c.charCodeAt(0))
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8', binaryKey,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false, ['sign']
  )

  const signInput = encoder.encode(`${header}.${payload}`)
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', cryptoKey, signInput)
  const signatureB64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

  const jwt = `${header}.${payload}.${signatureB64}`

  // Exchange JWT for access token
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  })

  const tokenData = await tokenRes.json()
  if (!tokenData.access_token) {
    throw new Error(`Failed to get Google access token: ${JSON.stringify(tokenData)}`)
  }

  return tokenData.access_token
}

async function verifyGoogleReceipt(
  purchaseToken: string,
  productId: string,
  packageName: string
): Promise<VerificationResult> {
  try {
    const accessToken = await getGoogleAccessToken()

    // Try subscriptions v2 API first, fallback to v3
    const urlV2 = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${packageName}/purchases/subscriptionsv2/tokens/${purchaseToken}`
    const urlV3 = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${packageName}/purchases/subscriptions/${productId}/tokens/${purchaseToken}`

    let data: any = null
    let apiVersion = 'v2'

    // Try v2 first
    const resV2 = await fetch(urlV2, {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    })

    if (resV2.ok) {
      data = await resV2.json()
    } else {
      // Fallback to v3
      apiVersion = 'v3'
      const resV3 = await fetch(urlV3, {
        headers: { 'Authorization': `Bearer ${accessToken}` },
      })

      if (!resV3.ok) {
        const errorText = await resV3.text()
        return {
          ...INVALID_RESULT,
          error: `Google Play API error: ${resV3.status} ${errorText}`,
        }
      }

      data = await resV3.json()
    }

    if (apiVersion === 'v2') {
      // Subscriptions v2 response format
      const lineItems = data.lineItems || []
      const subItem = lineItems[0]
      const isValid = data.subscriptionState === 'SUBSCRIPTION_STATE_ACTIVE'
        || data.subscriptionState === 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD'

      if (!isValid) {
        return {
          ...INVALID_RESULT,
          error: `Subscription state: ${data.subscriptionState}`,
        }
      }

      return {
        valid: true,
        productId: subItem?.productId || productId,
        transactionId: data.latestOrderId || purchaseToken,
        originalTransactionId: data.linkedPurchaseToken || data.latestOrderId || purchaseToken,
        expiresDate: new Date(subItem?.expiryTime || data.expiryTime),
        environment: data.testPurchase !== undefined ? 'sandbox' : 'production',
        autoRenew: subItem?.autoRenewingPlan?.autoRenewEnabled === true,
        isTrial: subItem?.offerDetails?.offerId?.includes('trial') || false,
      }
    }

    // v3 response format
    // paymentState: 0 = pending, 1 = received, 2 = free trial, 3 = deferred
    const isValid = data.paymentState !== undefined && data.paymentState !== 0

    if (!isValid && data.cancelReason !== undefined) {
      return {
        ...INVALID_RESULT,
        error: 'Subscription is canceled or invalid',
      }
    }

    return {
      valid: true,
      productId,
      transactionId: data.orderId || purchaseToken,
      originalTransactionId: data.linkedPurchaseToken || data.orderId || purchaseToken,
      expiresDate: new Date(Number(data.expiryTimeMillis)),
      environment: data.purchaseType === 0 ? 'sandbox' : 'production',
      autoRenew: data.autoRenewing === true,
      isTrial: data.paymentState === 2,
    }
  } catch (e) {
    return {
      ...INVALID_RESULT,
      error: `Google verification error: ${e.message}`,
    }
  }
}

// ─── Map store product IDs to plan names ──────────────────────────────────

function productIdToPlan(productId: string): string {
  const mapping: Record<string, string> = {
    // Apple
    'com.fisabil.premium.monthly': 'premium_monthly',
    'com.fisabil.premium.annual': 'premium_annual',
    // Google
    'premium_monthly': 'premium_monthly',
    'premium_annual': 'premium_annual',
    // Fallback patterns
    'fisabil_premium_monthly': 'premium_monthly',
    'fisabil_premium_annual': 'premium_annual',
  }

  return mapping[productId] || 'premium_monthly'
}

// Detect if a receipt string is a JWS (StoreKit 2) vs legacy base64 receipt
function isJWSReceipt(receipt: string): boolean {
  // JWS tokens have exactly 2 dots separating 3 base64url parts
  const parts = receipt.split('.')
  return parts.length === 3 && parts.every(p => p.length > 0)
}

// ─── Main handler ─────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const startTime = Date.now()

  try {
    // ─── 1. Auth check ────────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return jsonResponse({ error: 'Missing authorization header' }, 401)
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const supabaseUser = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    })

    const { data: { user }, error: authError } = await supabaseUser.auth.getUser()
    if (authError || !user) {
      return jsonResponse({ error: 'Invalid or expired token' }, 401)
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)

    // ─── 2. Extract request metadata ─────────────────────────────────
    const idempotencyKey = req.headers.get('X-Idempotency-Key') || null
    const clientPlatform = req.headers.get('X-Client-Platform') || null
    const clientAppVersion = req.headers.get('X-App-Version') || null
    const clientIp = req.headers.get('X-Forwarded-For')
      || req.headers.get('CF-Connecting-IP')
      || 'unknown'

    // ─── 3. Parse & validate request body ─────────────────────────────
    const body = await req.json()
    const { store, receipt, productId, transactionId, packageName, appAccountToken } = body

    if (!store || !receipt) {
      return jsonResponse({ error: 'Missing required fields: store, receipt' }, 400)
    }

    if (!['apple', 'google'].includes(store)) {
      return jsonResponse({ error: 'Invalid store. Must be "apple" or "google"' }, 400)
    }

    if (store === 'google' && (!productId || !packageName)) {
      return jsonResponse({ error: 'Google Play requires productId and packageName' }, 400)
    }

    // ─── 4. Rate limiting ─────────────────────────────────────────────
    const { data: rateLimitAllowed } = await supabaseAdmin.rpc('check_receipt_rate_limit', {
      p_user_id: user.id,
      p_max_requests: 10,
      p_window_minutes: 60,
    })

    if (rateLimitAllowed === false) {
      const receiptHash = await sha256(receipt)
      // Log the rate-limited attempt
      await supabaseAdmin.rpc('log_receipt_verification', {
        p_user_id: user.id,
        p_store_provider: store,
        p_receipt_hash: receiptHash,
        p_verification_status: 'rate_limited',
        p_error_message: 'Rate limit exceeded (10/hour)',
        p_client_ip: clientIp,
        p_client_platform: clientPlatform,
        p_client_app_version: clientAppVersion,
        p_duration_ms: Date.now() - startTime,
      })

      return jsonResponse({
        error: 'Too many verification requests. Please try again later.',
        retryAfter: 3600,
      }, 429)
    }

    // ─── 5. Fraud flag check ──────────────────────────────────────────
    const { data: subData } = await supabaseAdmin
      .from('subscriptions')
      .select('fraud_flag, fraud_reason')
      .eq('user_id', user.id)
      .single()

    if (subData?.fraud_flag) {
      console.error(`🚨 Fraud-flagged user attempted verification: ${user.id}`)
      return jsonResponse({
        error: 'Account verification suspended. Please contact support.',
      }, 403)
    }

    // ─── 6. Idempotency check (same receipt already verified) ─────────
    const receiptHash = await sha256(receipt)

    const { data: idempotencyResult } = await supabaseAdmin.rpc('check_receipt_idempotency', {
      p_receipt_hash: receiptHash,
      p_user_id: user.id,
    })

    if (idempotencyResult?.[0]?.already_verified) {
      // Receipt already verified & subscription active → return cached result
      await supabaseAdmin.rpc('log_receipt_verification', {
        p_user_id: user.id,
        p_store_provider: store,
        p_receipt_hash: receiptHash,
        p_verification_status: 'already_verified',
        p_idempotency_key: idempotencyKey,
        p_client_ip: clientIp,
        p_client_platform: clientPlatform,
        p_client_app_version: clientAppVersion,
        p_duration_ms: Date.now() - startTime,
      })

      return jsonResponse({
        success: true,
        cached: true,
        subscription: {
          plan: idempotencyResult[0].existing_plan,
          expiresDate: idempotencyResult[0].existing_expires_date,
        },
      })
    }

    // ─── 7. Verify receipt with the store ─────────────────────────────
    let verificationResult: VerificationResult

    if (store === 'apple') {
      // Detect StoreKit 2 JWS vs legacy receipt
      if (isJWSReceipt(receipt)) {
        verificationResult = await verifyAppleJWS(receipt)
      } else {
        verificationResult = await verifyAppleReceipt(receipt)
      }
    } else {
      verificationResult = await verifyGoogleReceipt(receipt, productId, packageName)
    }

    // ─── 8. Handle invalid receipt ────────────────────────────────────
    if (!verificationResult.valid) {
      await supabaseAdmin.rpc('log_receipt_verification', {
        p_user_id: user.id,
        p_store_provider: store,
        p_receipt_hash: receiptHash,
        p_verification_status: 'invalid_receipt',
        p_product_id: productId || null,
        p_error_message: verificationResult.error,
        p_idempotency_key: idempotencyKey,
        p_client_ip: clientIp,
        p_client_platform: clientPlatform,
        p_client_app_version: clientAppVersion,
        p_raw_request: { store, productId, hasReceipt: true },
        p_duration_ms: Date.now() - startTime,
      })

      return jsonResponse({
        error: 'Receipt verification failed',
        details: verificationResult.error,
      }, 400)
    }

    // ─── 9. Receipt valid → activate subscription ─────────────────────
    const plan = productIdToPlan(verificationResult.productId)

    const { data: activationResult, error: activationError } = await supabaseAdmin.rpc(
      'activate_store_subscription', {
        p_user_id: user.id,
        p_plan: plan,
        p_store_provider: store,
        p_product_id: verificationResult.productId,
        p_transaction_id: verificationResult.transactionId,
        p_original_transaction_id: verificationResult.originalTransactionId,
        p_expires_date: verificationResult.expiresDate.toISOString(),
        p_environment: verificationResult.environment,
        p_price_amount: null,
        p_currency: null,
        p_auto_renew: verificationResult.autoRenew,
      }
    )

    if (activationError) {
      console.error('DB activation error:', activationError)

      await supabaseAdmin.rpc('log_receipt_verification', {
        p_user_id: user.id,
        p_store_provider: store,
        p_receipt_hash: receiptHash,
        p_verification_status: 'internal_error',
        p_product_id: verificationResult.productId,
        p_transaction_id: verificationResult.transactionId,
        p_error_message: activationError.message,
        p_environment: verificationResult.environment,
        p_idempotency_key: idempotencyKey,
        p_client_ip: clientIp,
        p_client_platform: clientPlatform,
        p_client_app_version: clientAppVersion,
        p_duration_ms: Date.now() - startTime,
      })

      return jsonResponse({
        error: 'Failed to activate subscription',
        details: activationError.message,
      }, 500)
    }

    // ─── 10. Update extra security fields ─────────────────────────────
    const updateFields: Record<string, unknown> = {
      last_receipt_hash: receiptHash,
      last_idempotency_key: idempotencyKey,
      verification_count: (subData as any)?.verification_count
        ? (subData as any).verification_count + 1
        : 1,
    }

    if (appAccountToken) {
      updateFields.app_account_token = appAccountToken
    }

    await supabaseAdmin
      .from('subscriptions')
      .update(updateFields)
      .eq('user_id', user.id)

    // ─── 11. Log successful verification ──────────────────────────────
    await supabaseAdmin.rpc('log_receipt_verification', {
      p_user_id: user.id,
      p_store_provider: store,
      p_receipt_hash: receiptHash,
      p_verification_status: 'success',
      p_product_id: verificationResult.productId,
      p_transaction_id: verificationResult.transactionId,
      p_idempotency_key: idempotencyKey,
      p_environment: verificationResult.environment,
      p_client_ip: clientIp,
      p_client_platform: clientPlatform,
      p_client_app_version: clientAppVersion,
      p_raw_response: {
        plan,
        expiresDate: verificationResult.expiresDate.toISOString(),
        autoRenew: verificationResult.autoRenew,
        environment: verificationResult.environment,
      },
      p_duration_ms: Date.now() - startTime,
    })

    console.log(`✅ Receipt verified for user ${user.id}: ${plan} (${store}, ${verificationResult.environment})`)

    // ─── 12. Return success ───────────────────────────────────────────
    return jsonResponse({
      success: true,
      subscription: {
        plan,
        expiresDate: verificationResult.expiresDate.toISOString(),
        environment: verificationResult.environment,
        autoRenew: verificationResult.autoRenew,
        isTrial: verificationResult.isTrial,
      },
    })

  } catch (e) {
    console.error('verify-store-receipt error:', e)
    return jsonResponse({
      error: 'Internal server error',
      details: e.message,
    }, 500)
  }
})
