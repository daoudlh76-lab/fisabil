// supabase/functions/complete-word/index.ts
// Edge Function — Gemini 2.0 Flash: analyse un mot et remplit toutes ses propriétés

type RequestBody = {
  word: string;
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

async function callGemini(
  apiKey: string,
  word: string,
  targetLang: string,
): Promise<string> {
  const systemPrompt = `You are an expert Arabic linguist. You receive a SINGLE word (in Arabic OR in ${targetLang}).

Your job: identify the word type, provide the Arabic form with full tashkeel, and fill ALL fields.

RULES:
1. If the input is in ${targetLang}, find the most common Arabic equivalent.
2. If the input is in Arabic, add full tashkeel and provide the ${targetLang} translation.
3. Detect the word type automatically:
   - "word" = noun (اسم) or adjective (صفة)
   - "verb" = verb (فعل)
   - "particle" = function word (حرف) — preposition, conjunction, pronoun, demonstrative

CRITICAL for tashkeel: Add ALL diacritics to EVERY Arabic letter.

For "word" type:
- "singulier": singular form with tashkeel
- "traduction": ${targetLang} translation
- "pluriel": plural form (null only for invariable words)
- "contraire": antonym for adjectives (null for nouns)
- "remarque": null

For "verb" type — ALL 3 forms in هُوَ (3rd masculine singular):
- "passe_3ms": فَعَلَ form (past) — NEVER starts with يَ/نَ/أَ (except Form IV أَفْعَلَ, Form V/VI تَفَعَّلَ/تَفَاعَلَ)
- "present_3ms": يَفْعَلُ form (present) — MUST start with يَ
- "imperatif": اِفْعَلْ form (imperative 2ms) — MUST be DIFFERENT from passe_3ms
- "traduction": ${targetLang} translation
- "remarque": null

Conjugation examples:
Form I:   كَتَبَ / يَكْتُبُ / اُكْتُبْ
Form I:   ذَهَبَ / يَذْهَبُ / اِذْهَبْ
Form II:  عَلَّمَ / يُعَلِّمُ / عَلِّمْ
Form III: جَاهَدَ / يُجَاهِدُ / جَاهِدْ
Form IV:  أَنْزَلَ / يُنْزِلُ / أَنْزِلْ
Form V:   تَعَلَّمَ / يَتَعَلَّمُ / تَعَلَّمْ
Form VII: اِنْكَسَرَ / يَنْكَسِرُ / اِنْكَسِرْ
Form VIII: اِجْتَمَعَ / يَجْتَمِعُ / اِجْتَمِعْ
Form X:   اِسْتَخْرَجَ / يَسْتَخْرِجُ / اِسْتَخْرِجْ

For "particle" type:
- "particule_ar": Arabic particle with tashkeel
- "type": "preposition" | "conjunction" | "pronoun" | "demonstrative"
- "traduction": ${targetLang} translation
- "exemple": example usage in Arabic with tashkeel`;

  const userPrompt = `Analyze this word: "${word}"

Return JSON with this EXACT structure:
{
  "type": "word" | "verb" | "particle",
  "data": { ... }
}

Where "data" matches the type:
- word: { "singulier": "...", "traduction": "...", "pluriel": "...", "contraire": ..., "remarque": null }
- verb: { "passe_3ms": "...", "present_3ms": "...", "imperatif": "...", "traduction": "...", "remarque": null }
- particle: { "particule_ar": "...", "type": "...", "traduction": "...", "exemple": "..." }

RETURN ONLY THE JSON.`;

  const body = {
    contents: [
      { role: "user", parts: [{ text: userPrompt }] },
    ],
    systemInstruction: {
      parts: [{ text: systemPrompt }],
    },
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 512,
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
    console.error("[complete-word] Gemini error:", res.status, errText.slice(0, 500));
    throw new Error(`Gemini API ${res.status}: ${errText.slice(0, 300)}`);
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

  if (!text) {
    throw new Error("Empty response from Gemini");
  }

  return text;
}

// ── Main handler ──

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders() });

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) {
      return json({ error: "Missing env GEMINI_API_KEY" }, 500);
    }

    // Auth check
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.toLowerCase().startsWith("bearer ")) {
      return json({ error: "Missing Authorization Bearer token" }, 401);
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return json({ error: "Missing Supabase env vars" }, 500);
    }

    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.38.4");
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const jwt = authHeader.replace(/^bearer\s+/i, "");
    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(jwt);
    if (userError || !userData?.user) {
      return json({ error: "Unauthorized" }, 401);
    }

    // Parse body
    const body = (await req.json()) as RequestBody;
    if (!body?.word || typeof body.word !== "string" || !body.word.trim()) {
      return json({ error: "Invalid payload: word required" }, 400);
    }

    const uiLang = body.ui_lang || "fr";
    const targetLang = uiLang === "fr" ? "French"
      : uiLang === "en" ? "English"
      : uiLang === "de" ? "German"
      : uiLang === "es" ? "Spanish"
      : uiLang === "ru" ? "Russian"
      : uiLang === "ms" ? "Malay"
      : "French";

    console.log(`[complete-word] word="${body.word}", lang=${uiLang}, user=${userData.user.id}`);

    const rawJson = await callGemini(GEMINI_API_KEY, body.word.trim(), targetLang);

    let parsed;
    try {
      parsed = JSON.parse(rawJson.replace(/```json\n?/g, "").replace(/```\n?/g, ""));
    } catch (parseError) {
      console.error("[complete-word] Parse error:", parseError);
      return json({ error: "Failed to parse response", preview: rawJson.slice(0, 300) }, 500);
    }

    // Validate structure
    if (!parsed.type || !parsed.data) {
      return json({ error: "Invalid response structure", result: parsed }, 500);
    }

    if (!["word", "verb", "particle"].includes(parsed.type)) {
      return json({ error: `Unknown type: ${parsed.type}` }, 500);
    }

    console.log(`[complete-word] Result: type=${parsed.type}`, JSON.stringify(parsed.data).slice(0, 200));

    return json(parsed);
  } catch (e) {
    console.error("[complete-word] Runtime error:", e);
    return json({ error: "Runtime error", message: String(e) }, 500);
  }
});
