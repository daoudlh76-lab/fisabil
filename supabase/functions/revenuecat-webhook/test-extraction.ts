// Test minimal — vérifie l'extraction de product_id du payload RevenueCat
// Usage : deno run test-extraction.ts

const testCases = [
  {
    label: "Cas normal — INITIAL_PURCHASE avec product_id",
    payload: {
      api_version: "1.0",
      event: {
        type: "INITIAL_PURCHASE",
        app_user_id: "00000000-0000-0000-0000-000000000001",
        product_id: "fisabil_premium_monthly_999",
        expiration_at_ms: Date.now() + 86400000,
        store: "APP_STORE",
        period_type: "NORMAL",
        auto_renew_status: true,
      },
    },
    expected_product_id: "fisabil_premium_monthly_999",
  },
  {
    label: "Cas bug historique — product_id absent (ex: SUBSCRIBER_ALIAS)",
    payload: {
      api_version: "1.0",
      event: {
        type: "SUBSCRIBER_ALIAS",
        app_user_id: "00000000-0000-0000-0000-000000000002",
        // Pas de product_id
      },
    },
    expected_product_id: "",
  },
  {
    label: "Vérification payload plat (sans wrapper .event)",
    payload: {
      type: "INITIAL_PURCHASE",
      app_user_id: "00000000-0000-0000-0000-000000000003",
      product_id: "fisabil_premium_annual_4999",
    },
    expected_product_id: "fisabil_premium_annual_4999",
  },
];

let passed = 0;
let failed = 0;

for (const tc of testCases) {
  const payload = tc.payload as Record<string, unknown>;
  const event = (payload.event as Record<string, unknown>) ?? payload;
  const productId: string = (event.product_id as string) ?? "";

  const storeProductId = productId ? productId : undefined;

  const ok = productId === tc.expected_product_id;
  const status = ok ? "✅ PASS" : "❌ FAIL";

  console.log(`\n${status} — ${tc.label}`);
  console.log(`  [RC] product_id extracted: "${productId}" (event.type=${event.type ?? "unknown"})`);
  console.log(`  store_product_id dans upsert : ${storeProductId ?? "(omis — valeur existante préservée)"}`);
  console.log(`  Attendu : "${tc.expected_product_id}"`);

  if (ok) passed++; else failed++;
}

console.log(`\n${"─".repeat(50)}`);
console.log(`Résultat : ${passed} PASS / ${failed} FAIL`);
Deno.exit(failed > 0 ? 1 : 0);
