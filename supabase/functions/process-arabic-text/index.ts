// supabase/functions/process-arabic-text/index.ts
// Edge Function Supabase (Deno) — Gemini 1.5 Flash
//
// Pipeline complet : Image base64 → Gemini (OCR + vocalization + extraction) → Bescherelle correction → JSON

type RequestBody = {
  image_base64: string;
  mime_type?: string; // image/jpeg | image/png | image/webp
  ui_lang?: string;   // fr | en | de | es | ru | ms | ar
  scan_id?: string;
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

/** Supprime TOUTES les voyelles (y compris shadda) → racine nue */
function stripAll(w: string): string {
  return w.replace(/[\u064B-\u065F\u0670]/g, "");
}

/** Supprime les voyelles SAUF la shadda → distingue forme I / II */
function keepShadda(w: string): string {
  return w.replace(/[\u064B-\u0650\u0652-\u065F\u0670]/g, "");
}

// ── Gemini API call ──

async function callGemini(
  apiKey: string,
  imageBase64: string,
  mimeType: string,
  targetLang: string,
  uiLang: string,
): Promise<string> {
  const systemPrompt = buildSystemPrompt(targetLang);
  const userPrompt = buildUserPrompt(targetLang, uiLang);

  const body = {
    contents: [
      {
        role: "user",
        parts: [
          {
            inlineData: {
              mimeType: mimeType,
              data: imageBase64,
            },
          },
          { text: userPrompt },
        ],
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

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error("[process-arabic-text] Gemini error:", res.status, errText.slice(0, 500));
    throw new Error(`Gemini API ${res.status}: ${errText.slice(0, 300)}`);
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

  if (!text) {
    throw new Error("Empty response from Gemini");
  }

  return text;
}

// ── Prompts ──

function buildSystemPrompt(targetLang: string): string {
  return `You are an expert Arabic linguist specialized in OCR and exhaustive vocabulary extraction for language learners.

You receive an image containing Arabic text. Your job is to:
1. Extract the FULL text from the image with COMPLETE tashkeel (all vowels/diacritics).
2. Extract ALL unique vocabulary items, verbs, and particles.

CRITICAL: Add full tashkeel to EVERY Arabic word. This is essential for text-to-speech.

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
   - "passe_3ms": فَعَلَ form (past 3ms) — NEVER starts with يَ/نَ/أَ (except Form V/VI which start with تَ)
   - "present_3ms": يَفْعَلُ form (present 3ms) — MUST start with يَ
   - "imperatif": اِفْعَلْ form (imperative 2ms) — MUST be DIFFERENT from passe_3ms
   - All 3 forms MUST be DIFFERENT from each other

   ⚠️ FORM V (تَفَعَّلَ) / FORM VI (تَفَاعَلَ): past starts with تَ, present = يَتَفَعَّلُ / يَتَفَاعَلُ

   📋 CORRECT CONJUGATION EXAMPLES (follow these patterns exactly):
   Form I:   كَتَبَ / يَكْتُبُ / اُكْتُبْ (kataba/yaktub/uktub)
   Form I:   ذَهَبَ / يَذْهَبُ / اِذْهَبْ (dhahaba/yadh-hab/idh-hab)
   Form I:   جَعَلَ / يَجْعَلُ / اِجْعَلْ (ja3ala/yaj3al/ij3al)
   Form I:   عَلِمَ / يَعْلَمُ / اِعْلَمْ (3alima/ya3lam/i3lam)
   Form I:   قَرَأَ / يَقْرَأُ / اِقْرَأْ (qara'a/yaqra'/iqra')
   Form I:   قَالَ / يَقُولُ / قُلْ (qaala/yaquul/qul)
   Form I:   كَانَ / يَكُونُ / كُنْ (kaana/yakuun/kun)
   Form II:  عَلَّمَ / يُعَلِّمُ / عَلِّمْ (3allama/yu3allim/3allim)
   Form III: جَاهَدَ / يُجَاهِدُ / جَاهِدْ (jaahada/yujaahid/jaahid)
   Form IV:  أَنْزَلَ / يُنْزِلُ / أَنْزِلْ (anzala/yunzil/anzil)
   Form IV:  أَرْسَلَ / يُرْسِلُ / أَرْسِلْ (arsala/yursil/arsil)
   Form V:   تَعَلَّمَ / يَتَعَلَّمُ / تَعَلَّمْ (ta3allama/yata3allam/ta3allam)
   Form VI:  تَعَاوَنَ / يَتَعَاوَنُ / تَعَاوَنْ (ta3aawana/yata3aawan/ta3aawan)
   Form VII: اِنْكَسَرَ / يَنْكَسِرُ / اِنْكَسِرْ (inkasara/yankasir/inkasir)
   Form VIII: اِجْتَمَعَ / يَجْتَمِعُ / اِجْتَمِعْ (ijtama3a/yajtami3/ijtami3)
   Form X:   اِسْتَخْرَجَ / يَسْتَخْرِجُ / اِسْتَخْرِجْ (istakhraja/yastakhrij/istakhrij)

   ⚠️ COMMON MISTAKES TO AVOID:
   - Present tense: the 2nd root letter often gets sukuun (ـْـ), NOT fatha. E.g. يَكْتُبُ NOT يَكَتَبُ
   - Imperative: MUST be different from past. E.g. اُكْتُبْ NOT كَتَبَ
   - Form IV present: starts with يُـ (damma), e.g. يُنْزِلُ NOT يَنْزِلُ
   - Form II present: starts with يُـ (damma), e.g. يُعَلِّمُ NOT يَعَلِّمُ

3. "particules" = ONLY function words (حرف) — prepositions, conjunctions, pronouns
   ✅ مِنْ, إِلَى, فِي, هُوَ, وَ
   ❌ FORBIDDEN: nouns, verbs, adjectives`;
}

function buildUserPrompt(targetLang: string, uiLang: string): string {
  return `Extract ALL text from this image and analyze it.

STEP 1: Read the FULL Arabic text from the image and add COMPLETE tashkeel (diacritics) to every word.
STEP 2: Extract EVERY unique word into the correct category.
STEP 3: Provide ${targetLang} translations.

For vocabulary:
- "pluriel": REQUIRED for all nouns (null only for invariable words)
- "contraire": REQUIRED for all adjectives (e.g., كَبِيرٌ → صَغِيرٌ)

For verbs - VERIFY before adding:
- passe_3ms does NOT start with يَ, تَ, نَ, أَ
- present_3ms MUST start with يَ
- All 3 forms are DIFFERENT

Return JSON with this EXACT structure:
{
  "full_text_vocalized": "the complete Arabic text with full tashkeel",
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

  // Collect normalized past forms
  const passeNorms = new Set<string>();
  for (const v of verbes) {
    if (v.passe_3ms) passeNorms.add(stripAll(v.passe_3ms));
  }

  const normArray = [...passeNorms];
  if (normArray.length === 0) return 0;

  // Batch query
  const { data } = await supabase
    .from("bescherelle_verbs")
    .select("passe_3ms, present_3ms, imperatif, passe_norm")
    .in("passe_norm", normArray);

  const dbRows = (data || []) as BeschRow[];
  console.log(`[process-arabic-text] Bescherelle: ${dbRows.length} candidates for ${normArray.length} roots`);

  // Index by normalized past
  const dbByNorm: Record<string, BeschRow[]> = {};
  for (const row of dbRows) {
    if (!dbByNorm[row.passe_norm]) dbByNorm[row.passe_norm] = [];
    dbByNorm[row.passe_norm].push(row);
  }

  // Correct each verb
  let correctedCount = 0;

  for (const v of verbes) {
    const passe = v.passe_3ms || "";
    const passeStripped = stripAll(passe);
    const passeShadda = keepShadda(passe);

    const candidates = dbByNorm[passeStripped];
    if (!candidates || candidates.length === 0) continue;

    // Best match: 1. Exact → 2. Shadda match → 3. Shortest (Form I)
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
        console.log(`[process-arabic-text] ✅ Bescherelle: ${passe} → pr: ${best.present_3ms}, imp: ${best.imperatif}`);
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

    console.log("[process-arabic-text] User:", userData.user.id);

    // ── Parse body ──
    const body = (await req.json()) as RequestBody;

    if (!body?.image_base64 || typeof body.image_base64 !== "string") {
      return json({ error: "Invalid payload: image_base64 required" }, 400);
    }

    // Strip data URI prefix if present
    const base64 = body.image_base64.replace(/^data:image\/[a-z]+;base64,/, "");

    const uiLang = body.ui_lang || "fr";
    const mimeType = body.mime_type || "image/jpeg";
    const targetLang = uiLang === "fr" ? "French"
      : uiLang === "en" ? "English"
      : uiLang === "de" ? "German"
      : uiLang === "es" ? "Spanish"
      : uiLang === "ru" ? "Russian"
      : uiLang === "ms" ? "Malay"
      : "French";

    console.log(`[process-arabic-text] Processing image (${(base64.length / 1024).toFixed(0)} KB base64), mime=${mimeType}, lang=${uiLang}`);

    // ── Step 1: Gemini OCR + extraction ──
    const rawJson = await callGemini(GEMINI_API_KEY, base64, mimeType, targetLang, uiLang);

    console.log("[process-arabic-text] Gemini response length:", rawJson.length);

    let parsed;
    try {
      parsed = JSON.parse(rawJson.replace(/```json\n?/g, "").replace(/```\n?/g, ""));
    } catch (parseError) {
      console.error("[process-arabic-text] Parse error:", parseError);
      return json({
        error: "Failed to parse Gemini response",
        parseError: String(parseError),
        contentPreview: rawJson.slice(0, 500),
      }, 500);
    }

    // ── Step 2: Bescherelle correction (disabled — data quality issues) ──
    const verbes = parsed.verbes || [];

    // ── Response ──
    const result = {
      full_text_vocalized: parsed.full_text_vocalized || "",
      vocabulaire: parsed.vocabulaire || [],
      verbes,
      particules: parsed.particules || [],
    };

    console.log(
      `[process-arabic-text] Done: text=${result.full_text_vocalized.length}ch, ` +
      `vocab=${result.vocabulaire.length}, verbs=${result.verbes.length}, particles=${result.particules.length}`
    );

    return json(result);
  } catch (e) {
    console.error("[process-arabic-text] Runtime error:", e);
    return json({ error: "Runtime error", message: String(e) }, 500);
  }
});
