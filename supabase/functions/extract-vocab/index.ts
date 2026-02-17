// supabase/functions/extract-vocab/index.ts
// Edge Function Supabase (Deno) — Gemini 2.0 Flash (text-based vocab extraction)

type RequestBody = {
  scan_id: string;
  ui_lang?: string;
};

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders() },
  });
}

// ── Diacritics helpers ──

function stripAll(w: string): string {
  return w.replace(/[\u064B-\u065F\u0670]/g, "");
}

function keepShadda(w: string): string {
  return w.replace(/[\u064B-\u0650\u0652-\u065F\u0670]/g, "");
}

// ── Gemini API call (text-based) ──

async function callGemini(
  apiKey: string,
  arabicText: string,
  title: string,
  targetLang: string,
  uiLang: string,
): Promise<string> {
  const systemPrompt = `You are an expert Arabic linguist specialized in exhaustive vocabulary extraction for language learners.

You receive an Arabic text. Your job is to extract ALL unique vocabulary items, verbs, and particles.

CRITICAL: Add full tashkeel (all vowels/diacritics) to EVERY Arabic word.

⚠️ ABSOLUTE CATEGORIZATION RULES:

1. "vocabulaire" = ONLY nouns (اسم) and adjectives (صفة)
   ✅ كِتَابٌ, مَدْرَسَةٌ, كَبِيرٌ, جَمِيلٌ
   ❌ FORBIDDEN: verbs, particles

   🔴 DUAL FORM RULE: If a word appears in dual (ـَانِ/ـَيْنِ), put SINGULAR in singulier and PLURAL in pluriel.
   🔴 MANDATORY: "pluriel" for ALL nouns. "contraire" for ALL adjectives.

2. "verbes" = ONLY verbs (فعل)
   ✅ ذَهَبَ, كَتَبَ, يَقْرَأُ
   ❌ FORBIDDEN: nouns, adjectives, particles

   🔴 ALL verbs MUST be converted to هُوَ (3rd masculine singular):
   - "passe_3ms": فَعَلَ form (past 3ms) — NEVER starts with يَ/تَ/نَ/أَ
   - "present_3ms": يَفْعَلُ form (present 3ms) — MUST start with يَ
   - "imperatif": اِفْعَلْ form (imperative 2ms)
   - All 3 forms MUST be DIFFERENT

   ⚠️ FORM V (تَفَعَّلَ) / FORM VI (تَفَاعَلَ): past starts with تَ, present = يَتَفَعَّلُ / يَتَفَاعَلُ

3. "particules" = ONLY function words (حرف) — prepositions, conjunctions, pronouns
   ✅ مِنْ, إِلَى, فِي, هُوَ, وَ
   ❌ FORBIDDEN: nouns, verbs, adjectives`;

  const userPrompt = `Extract ALL unique vocabulary from this Arabic text.

Title: "${title}"

Text:
${arabicText}

Provide ${targetLang} translations.

For vocabulary:
- "pluriel": REQUIRED for all nouns (null only for invariable words)
- "contraire": REQUIRED for all adjectives (e.g., كَبِيرٌ → صَغِيرٌ)

For verbs - VERIFY before adding:
- passe_3ms does NOT start with يَ, تَ, نَ, أَ
- present_3ms MUST start with يَ
- All 3 forms are DIFFERENT

Return JSON with this EXACT structure:
{
  "vocabulaire": [
    { "singulier": "...", "traduction": "...", "pluriel": "...", "contraire": "...", "remarque": null }
  ],
  "verbes": [
    { "passe_3ms": "...", "present_3ms": "...", "imperatif": "...", "traduction": "...", "remarque": null }
  ],
  "particules": [
    { "particule_ar": "...", "type": "preposition|conjunction|pronoun|demonstrative", "traduction": "...", "exemple": null }
  ]
}

RETURN ONLY THE JSON. No markdown, no comments.`;

  const body = {
    contents: [
      {
        role: "user",
        parts: [{ text: userPrompt }],
      },
    ],
    systemInstruction: {
      parts: [{ text: systemPrompt }],
    },
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 16384,
      responseMimeType: "application/json",
    },
  };

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error("[extract-vocab] Gemini error:", res.status, errText.slice(0, 500));
    throw new Error(`Gemini API ${res.status}: ${errText.slice(0, 300)}`);
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

  if (!text) {
    throw new Error("Empty response from Gemini");
  }

  return text;
}

// ── Bescherelle correction ──

type BeschRow = {
  passe_3ms: string;
  present_3ms: string;
  imperatif: string;
  passe_norm: string;
};

async function correctVerbsWithBescherelle(
  verbes: any[],
  supabase: any,
): Promise<number> {
  if (!verbes || verbes.length === 0) return 0;

  const passeNorms = new Set<string>();
  for (const v of verbes) {
    if (v.passe_3ms) passeNorms.add(stripAll(v.passe_3ms));
  }

  const normArray = [...passeNorms];
  if (normArray.length === 0) return 0;

  const { data } = await supabase
    .from("bescherelle_verbs")
    .select("passe_3ms, present_3ms, imperatif, passe_norm")
    .in("passe_norm", normArray);

  const dbRows = (data || []) as BeschRow[];
  console.log(`[extract-vocab] Bescherelle: ${dbRows.length} candidates for ${normArray.length} roots`);

  const dbByNorm: Record<string, BeschRow[]> = {};
  for (const row of dbRows) {
    if (!dbByNorm[row.passe_norm]) dbByNorm[row.passe_norm] = [];
    dbByNorm[row.passe_norm].push(row);
  }

  let correctedCount = 0;

  for (const v of verbes) {
    const passe = v.passe_3ms || "";
    const passeStripped = stripAll(passe);
    const passeShadda = keepShadda(passe);

    const candidates = dbByNorm[passeStripped];
    if (!candidates || candidates.length === 0) continue;

    let best: BeschRow | undefined =
      candidates.find((c) => c.passe_3ms === passe) ??
      candidates.find((c) => keepShadda(c.passe_3ms) === passeShadda) ??
      candidates.sort((a, b) => a.passe_3ms.length - b.passe_3ms.length)[0];

    if (best) {
      const oldPresent = v.present_3ms;
      const oldImperatif = v.imperatif;

      v.present_3ms = best.present_3ms;
      v.imperatif = best.imperatif;

      if (oldPresent !== best.present_3ms || oldImperatif !== best.imperatif) {
        console.log(`[extract-vocab] ✅ Bescherelle: ${passe} → pr: ${best.present_3ms}, imp: ${best.imperatif}`);
        correctedCount++;
      }
    }
  }

  return correctedCount;
}

// ── Main handler ──

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders() });

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    // ── ENV ──
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");

    if (!SUPABASE_URL) return json({ error: "Missing env SUPABASE_URL" }, 500);
    if (!SUPABASE_SERVICE_ROLE_KEY) return json({ error: "Missing env SUPABASE_SERVICE_ROLE_KEY" }, 500);
    if (!GEMINI_API_KEY) {
      return json({
        error: "Missing env GEMINI_API_KEY",
        hint: "Supabase Dashboard > Edge Functions > Secrets: add GEMINI_API_KEY",
      }, 500);
    }

    // ── Auth ──
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.toLowerCase().startsWith("bearer ")) {
      return json({ error: "Missing Authorization Bearer token" }, 401);
    }

    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.38.4");

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const jwt = authHeader.replace(/^bearer\s+/i, "");
    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(jwt);
    if (userError || !userData?.user) {
      return json({ error: "Unauthorized", details: userError?.message ?? "Invalid token" }, 401);
    }

    console.log("[extract-vocab] User:", userData.user.id);

    // ── Parse body ──
    const body = (await req.json()) as RequestBody;

    if (!body?.scan_id || typeof body.scan_id !== "string") {
      return json({ error: "Invalid payload: scan_id required" }, 400);
    }

    const { data: scan, error: scanError } = await supabaseAdmin
      .from("scans")
      .select("id, title, content, user_id")
      .eq("id", body.scan_id)
      .single();

    if (scanError || !scan) {
      return json({ error: "Scan not found" }, 404);
    }

    if (userData.user.id !== scan.user_id) {
      return json({ error: "Forbidden - You don't own this scan" }, 403);
    }

    const uiLang = body.ui_lang || "fr";
    const targetLang = uiLang === "fr" ? "French"
      : uiLang === "en" ? "English"
      : uiLang === "de" ? "German"
      : uiLang === "es" ? "Spanish"
      : uiLang === "ru" ? "Russian"
      : uiLang === "ms" ? "Malay"
      : "French";

    console.log(`[extract-vocab] Extracting vocab for scan ${scan.id}, lang=${uiLang}, text=${scan.content.length}ch`);

    // ── Step 1: Gemini extraction ──
    const rawJson = await callGemini(GEMINI_API_KEY, scan.content, scan.title, targetLang, uiLang);

    console.log("[extract-vocab] Gemini response length:", rawJson.length);

    let parsed;
    try {
      parsed = JSON.parse(rawJson.replace(/```json\n?/g, "").replace(/```\n?/g, ""));
    } catch (parseError) {
      console.error("[extract-vocab] Parse error:", parseError);
      return json({
        error: "Failed to parse Gemini response",
        parseError: String(parseError),
        contentPreview: rawJson.slice(0, 500),
      }, 500);
    }

    // ── Step 2: Bescherelle correction ──
    const verbes = parsed.verbes || [];
    const correctedCount = await correctVerbsWithBescherelle(verbes, supabaseAdmin);

    if (correctedCount > 0) {
      console.log(`[extract-vocab] Bescherelle: corrected ${correctedCount}/${verbes.length} verbs`);
    }

    // ── Response ──
    const result = {
      meta: {
        ui_lang: uiLang,
        title: scan.title,
        source: "gemini",
        model: "gemini-2.0-flash",
      },
      vocabulaire: parsed.vocabulaire || [],
      verbes,
      particules: parsed.particules || [],
    };

    console.log(
      `[extract-vocab] Done: vocab=${result.vocabulaire.length}, verbs=${result.verbes.length}, particles=${result.particules.length}`
    );

    return json(result);
  } catch (e) {
    console.error("[extract-vocab] Runtime error:", e);
    return json({ error: "Runtime error", message: String(e) }, 500);
  }
});
