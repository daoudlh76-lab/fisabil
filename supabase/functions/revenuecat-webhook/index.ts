import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  try {

    // 🔐 Vérification du secret RevenueCat (variable d'environnement)
    const webhookSecret = Deno.env.get("REVENUECAT_WEBHOOK_SECRET");
    if (!webhookSecret) {
      console.error("REVENUECAT_WEBHOOK_SECRET not configured");
      return new Response("Server misconfigured", { status: 500 });
    }

    if (req.headers.get("authorization") !== `Bearer ${webhookSecret}`) {
      return new Response("Unauthorized", { status: 401 });
    }

    // On accepte seulement POST
    if (req.method !== "POST") {
      return new Response("Only POST", { status: 405 });
    }

    const payload = await req.json();
    const event = payload.event ?? payload;

    const rcUserId = event.app_user_id; // doit être UUID Supabase

    if (!rcUserId) {
      return new Response("Missing app_user_id", { status: 400 });
    }

    // Déterminer si l'abonnement est actif
    const expiresMs =
      event.expiration_at_ms ?? event.expires_at_ms ?? null;

    const expiresAt = expiresMs
      ? new Date(Number(expiresMs)).toISOString()
      : null;

    const isActive = expiresMs
      ? Number(expiresMs) > Date.now()
      : false;

    // Déterminer le plan depuis le product_id RevenueCat
    const productId: string = event.product_id ?? "";
    console.log(`[RC] product_id extracted: "${productId}" (event.type=${event.type ?? "unknown"})`);
    let plan: "free" | "premium_monthly" | "premium_annual" = "free";
    if (isActive) {
      if (productId.includes("yearly") || productId.includes("annual")) {
        plan = "premium_annual";
      } else if (productId.includes("monthly")) {
        plan = "premium_monthly";
      } else {
        // Produit inconnu mais actif → mensuel par défaut
        plan = "premium_monthly";
      }
    }

    // Déterminer le store
    const storeRaw: string = event.store ?? "";
    let storeProvider: "apple" | "google" | null = null;
    if (storeRaw === "APP_STORE" || storeRaw === "MAC_APP_STORE") {
      storeProvider = "apple";
    } else if (storeRaw === "PLAY_STORE") {
      storeProvider = "google";
    }

    // Déterminer le statut
    const eventType: string = event.type ?? "";
    let status: "active" | "canceled" | "expired" | "trialing" = "active";
    if (!isActive) {
      status = "expired";
    } else if (eventType.includes("CANCELLATION")) {
      status = "active"; // encore actif jusqu'à expiration
    }

    // Déterminer si c'est un trial (INITIAL_PURCHASE avec period_type = TRIAL)
    const periodType: string = event.period_type ?? "";
    const isTrialing = isActive && periodType === "TRIAL";
    if (isTrialing) {
      status = "trialing";
    }

    // 🔗 Connexion Supabase (service_role pour bypass RLS)
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } }
    );

    const { error } = await supabase
      .from("subscriptions")
      .upsert(
        {
          user_id: rcUserId,
          plan,
          status,
          is_active: isActive,
          expiry_date: expiresAt,
          store_provider: storeProvider,
          ...(productId ? { store_product_id: productId } : {}),
          auto_renew: event.auto_renew_status ?? false,
          cancel_at_period_end: eventType.includes("CANCELLATION"),
          trial_end: isTrialing ? expiresAt : null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );

    if (error) throw error;

    console.log(
      `✅ RC webhook processed: user=${rcUserId} plan=${plan} active=${isActive} event=${eventType}`
    );

    return new Response(
      JSON.stringify({ ok: true }),
      { headers: { "content-type": "application/json" } }
    );

  } catch (e) {
    console.error("revenuecat-webhook error:", e);
    return new Response(String(e), { status: 500 });
  }
});
