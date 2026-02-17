// supabase/functions/extract-vocab/index.ts
// Edge Function Supabase (Deno)

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
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(),
    },
  });
}

Deno.serve(async (req) => {
  // ✅ CORS preflight
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders() });

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    // ✅ ENV
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    const OPENAI_MODEL = Deno.env.get("OPENAI_MODEL") ?? "gpt-4o";

    console.log("[extract-vocab] OPENAI_API_KEY present?", Boolean(OPENAI_API_KEY));
    console.log("[extract-vocab] SUPABASE_URL present?", Boolean(SUPABASE_URL));
    console.log("[extract-vocab] OPENAI_MODEL:", OPENAI_MODEL);

    if (!SUPABASE_URL) return json({ error: "Missing env SUPABASE_URL" }, 500);
    if (!SUPABASE_SERVICE_ROLE_KEY) return json({ error: "Missing env SUPABASE_SERVICE_ROLE_KEY" }, 500);
    if (!OPENAI_API_KEY) {
      return json(
        {
          error: "Missing env OPENAI_API_KEY",
          hint: "Supabase Dashboard > Edge Functions > Secrets: ajouter OPENAI_API_KEY puis redeploy.",
        },
        500
      );
    }

    // ✅ Auth check
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.toLowerCase().startsWith("bearer ")) {
      return json({ error: "Missing Authorization Bearer token" }, 401);
    }

    // Dynamic import for Supabase client
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.38.4");

    // Create admin client with SERVICE_ROLE_KEY (without Authorization header)
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Extract and verify user from JWT manually
    const jwt = authHeader.replace(/^bearer\s+/i, "");
    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(jwt);
    if (userError || !userData?.user) {
      console.log("[extract-vocab] Auth error:", userError?.message);
      return json({ error: "Unauthorized", details: userError?.message ?? "Invalid token" }, 401);
    }

    console.log("[extract-vocab] Authenticated user:", userData.user.id);

    // Use admin client for DB operations (RLS will still apply based on user_id checks)
    const supabase = supabaseAdmin;

    // ✅ Parse body
    const body = (await req.json()) as RequestBody;

    if (!body?.scan_id || typeof body.scan_id !== "string") {
      return json({ error: "Invalid payload: scan_id required" }, 400);
    }

    const { data: scan, error: scanError } = await supabase
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
    const targetLang = uiLang === "fr" ? "French" : "English";

    const systemPrompt = `You are an expert Arabic linguist specialized in exhaustive vocabulary extraction for language learners.

TASK: Extract EVERY UNIQUE WORD from the Arabic text without exception.

CRITICAL RULES:
- Extract EVERY word that appears in the text (nouns, verbs, adjectives, particles, pronouns)
- NO DUPLICATES - each unique word appears only once
- Do NOT filter or skip any words - extract EVERYTHING
- Add full tashkeel (diacritics) to ALL Arabic words
- Provide accurate ${targetLang} translations

⚠️ ABSOLUTE CATEGORIZATION RULES - VIOLATION = CRITICAL ERROR:

1. "vocabulaire" array = ONLY nouns (اسم) and adjectives (صفة)
   ✅ CORRECT: كِتَابٌ (book), مَدْرَسَةٌ (school), كَبِيرٌ (big), جَمِيلٌ (beautiful)
   ✅ Test: Can you ask "What is this?" → It's a noun/adjective
   ❌ FORBIDDEN: ANY word that shows action (verb)
   ❌ FORBIDDEN: ANY word with verb conjugations (ذَهَبَ, يَذْهَبُ, etc.)

   🔴 DUAL FORM (المثنى) RULE - CRITICAL:
   If a word appears in DUAL form (ending in ـَانِ/-اَنِ or ـَيْنِ/-َيْنِ), you MUST:
   - Put the SINGULAR form in "singulier" (NOT the dual)
   - Put the PLURAL form in "pluriel" (NOT the dual)
   Examples:
     • كِتَابَانِ (two books) → singulier: كِتَابٌ, pluriel: كُتُبٌ
     • وَلَدَانِ (two boys) → singulier: وَلَدٌ, pluriel: أَوْلَادٌ
     • مُعَلِّمَيْنِ (two teachers) → singulier: مُعَلِّمٌ, pluriel: مُعَلِّمُونَ
     • يَدَانِ (two hands) → singulier: يَدٌ, pluriel: أَيْدٍ
   NEVER put the dual form in singulier or pluriel columns.

   🔴 MANDATORY FIELDS - NEVER LEAVE NULL UNLESS IMPOSSIBLE:
   - "pluriel": REQUIRED for ALL nouns (only null for invariable words like أَمْسِ)
   - "contraire": REQUIRED for ALL adjectives and quality nouns
     Examples requiring contraire:
     • كَبِيرٌ → صَغِيرٌ (big → small)
     • جَمِيلٌ → قَبِيحٌ (beautiful → ugly)
     • طَوِيلٌ → قَصِيرٌ (tall → short)
     • حَارٌّ → بَارِدٌ (hot → cold)
     • سَهْلٌ → صَعْبٌ (easy → difficult)
     • نَظِيفٌ → قَذِرٌ (clean → dirty)
     • جَدِيدٌ → قَدِيمٌ (new → old)
     • سَرِيعٌ → بَطِيءٌ (fast → slow)
   - If you cannot find an obvious antonym, provide a related opposite concept
   - Only use null for contraire if the word is truly non-opposable (proper nouns, unique concepts)

2. "verbes" array = ONLY verbs (فعل) - words that express ACTION
   ✅ CORRECT: ذَهَبَ (went/to go), كَتَبَ (wrote/to write), قَالَ (said/to say)
   ✅ Test: Does it express an action? Can you conjugate it? → It's a verb
   ❌ FORBIDDEN: Nouns (كِتَابٌ), adjectives (كَبِيرٌ), particles (مِنْ)

   🔴 CRITICAL VERB FORM RULES - ERRORS HERE ARE UNACCEPTABLE:

   ⚠️ IMPORTANT: The text may contain verbs conjugated in feminine (فَعَلَتْ),
   plural (يَفْعَلُونَ, فَعَلُوا), 1st person (نَزَّلْنَا, رَتَّلْنَاهُ), or other forms.
   You MUST convert ALL verbs to هُوَ (3rd masculine singular):
     • فَعَلَتْ (she did) → passe_3ms: فَعَلَ (remove the تْ)
     • ذَهَبَتْ (she went) → passe_3ms: ذَهَبَ
     • نَزَّلْنَا (we sent down) → passe_3ms: نَزَّلَ
     • رَتَّلْنَاهُ (we recited it) → passe_3ms: رَتَّلَ
     • يَسْتَطِيعُوا (they can) → passe_3ms: اِسْتَطَاعَ
     • يَأْتُوا (they come) → passe_3ms: أَتَى
     • اجْتَمَعَتْ (she gathered) → passe_3ms: اِجْتَمَعَ
     • تَدُلُّ (she indicates) → passe_3ms: دَلَّ
     • تُؤَيِّدُ (she supports) → passe_3ms: أَيَّدَ
     • بَقِيَتْ (she remained) → passe_3ms: بَقِيَ

   - "passe_3ms": MUST be فَعَلَ form (past tense, 3rd person MASCULINE singular = هُوَ)
     ✅ CORRECT: ذَهَبَ, كَتَبَ, كَانَ, قَالَ, دَلَّ, أَتَى, بَقِيَ, أَنْزَلَ, نَزَّلَ, رَتَّلَ
     ❌ WRONG: فَعَلَتْ, فَعَلْنَا, يَفْعَلُونَ, يَفْعَلُ, تَفْعَلُ in passe_3ms
     ❌ WRONG: تَثْبِيتُ (this is a masdar/noun, NOT a past tense verb)

   - "present_3ms": MUST be يَفْعَلُ form (present tense, 3rd person MASCULINE singular = هُوَ)
     The present MUST end with ضَمَّة (ـُ) for indicative mood (المرفوع).

   🔴 HOLLOW VERBS (الأفعال الجوفاء) - MOST COMMON ERRORS:
     • كَانَ → يَكُونُ (NOT يُكانِ or يَكانُ)
     • قَالَ → يَقُولُ (NOT يُقالِ or يَقالُ)
     • زَارَ → يَزُورُ
     • نَامَ → يَنَامُ
     • صَامَ → يَصُومُ
     • عَادَ → يَعُودُ

   🔴 FORM I PRESENT TENSE VOWEL PATTERNS - CRITICAL:
     Pattern فَعَلَ/يَفْعُلُ (damma): كَتَبَ/يَكْتُبُ, خَرَجَ/يَخْرُجُ, دَخَلَ/يَدْخُلُ, كَفَرَ/يَكْفُرُ
     Pattern فَعَلَ/يَفْعِلُ (kasra): جَلَسَ/يَجْلِسُ, نَزَلَ/يَنْزِلُ, ضَرَبَ/يَضْرِبُ
     Pattern فَعَلَ/يَفْعَلُ (fatha): ذَهَبَ/يَذْهَبُ, فَتَحَ/يَفْتَحُ, ظَهَرَ/يَظْهَرُ, قَرَأَ/يَقْرَأُ
     The middle radical in present tense has a SUKUN (ـْ), NOT a vowel: يَكْتُبُ not يَكَتُبُ

   🔴 FORM IV (أَفْعَلَ) PRESENT: prefix يُ with sukun on first radical:
     • أَنْزَلَ → يُنْزِلُ (NOT يُنَزِّلُ - that's Form II)
     • أَرْسَلَ → يُرْسِلُ
     • أَخْرَجَ → يُخْرِجُ

   ⚠️ FORM V (تَفَعَّلَ) and FORM VI (تَفَاعَلَ) - SPECIAL ATTENTION:
   These verbs START with تَ in the PAST tense. Do NOT confuse with feminine present!
   The present tense adds يَ BEFORE the تَ → يَتَفَعَّلُ / يَتَفَاعَلُ
     • تَعَلَّمَ → يَتَعَلَّمُ, تَكَلَّمَ → يَتَكَلَّمُ, تَقَدَّمَ → يَتَقَدَّمُ
     • تَشَابَهَ → يَتَشَابَهُ, تَنَاوَلَ → يَتَنَاوَلُ

   🔴 FORM VII (اِنْفَعَلَ): اِنْشَقَّ → يَنْشَقُّ (with tashdid on last letter)
   🔴 FORM VIII (اِفْتَعَلَ): اِجْتَمَعَ → يَجْتَمِعُ
   🔴 FORM X (اِسْتَفْعَلَ): اِسْتَطَاعَ → يَسْتَطِيعُ

   - "imperatif": MUST be imperative 2nd person masculine singular
     ✅ CORRECT: اِذْهَبْ, اُكْتُبْ, اِقْرَأْ, كُنْ, قُلْ

   🔴 VERIFICATION: Before adding a verb, verify that:
   - passe_3ms is the هُوَ past form (NOT feminine تْ, NOT plural وا, NOT 1st person نَا)
   - passe_3ms does NOT start with يَ (that's present tense!)
   - present_3ms MUST start with يَ and end with ـُ (damma)
   - All three forms are DIFFERENT from each other
   - Forms are MASCULINE singular (هُوَ), never feminine or plural

3. "particules" array = ONLY function words (حرف) - prepositions, conjunctions, pronouns
   ✅ CORRECT: مِنْ (from), إِلَى (to), فِي (in), هُوَ (he), هِيَ (she), وَ (and), لِ (for)
   ✅ Test: Is it a grammatical particle? A pronoun? → It's a particle
   ❌ FORBIDDEN: Nouns, verbs, adjectives

⚠️ DOUBLE-CHECK BEFORE ADDING:
- If a word describes ACTION → "verbes" ONLY
- If a word is a THING or QUALITY → "vocabulaire" ONLY
- If a word is a FUNCTION WORD → "particules" ONLY

OUTPUT FORMAT (JSON only, no markdown):
{
  "vocabulaire": [
    {
      "singulier": "noun/adjective with full tashkeel",
      "traduction": "${targetLang} translation",
      "pluriel": "plural form with tashkeel (null only if word has no plural)",
      "contraire": "opposite/antonym with tashkeel (null only if no opposite exists)",
      "remarque": "grammatical note or context (null if not needed)"
    }
  ],
  "verbes": [
    {
      "passe_3ms": "past 3ms with tashkeel",
      "present_3ms": "present 3ms with tashkeel",
      "imperatif": "imperative with tashkeel",
      "traduction": "${targetLang} infinitive",
      "remarque": "verb pattern or note (null if not needed)"
    }
  ],
  "particules": [
    {
      "particule_ar": "particle with tashkeel",
      "type": "preposition/conjunction/pronoun/demonstrative/etc",
      "traduction": "${targetLang} meaning",
      "exemple": "usage example with the particle (null if not needed)"
    }
  ]
}`;

    const userPrompt = `Extract EVERY UNIQUE WORD from this Arabic text. Do not skip any words. Include ALL nouns, ALL verbs, ALL particles, ALL pronouns.

Title: "${scan.title}"

Text:
${scan.content}

CRITICAL INSTRUCTIONS - FOLLOW EXACTLY:
1. Read the entire text word by word
2. Extract EVERY unique word (no duplicates)
3. For EACH word, ask yourself:
   a) Does it express an ACTION? → Put in "verbes" array with 3 forms
   b) Is it a THING or QUALITY (noun/adjective)? → Put in "vocabulaire" array
   c) Is it a FUNCTION WORD (preposition/pronoun)? → Put in "particules" array
4. VERIFICATION STEP - Before finalizing:
   - Check "vocabulaire" array: Are there ANY verbs? → MOVE THEM to "verbes"
   - Check "verbes" array: Are there ANY nouns? → MOVE THEM to "vocabulaire"
   - A verb in "vocabulaire" is a CRITICAL ERROR - NEVER ALLOW THIS
5. Add full tashkeel to each word
6. Provide ${targetLang} translation
7. VERB FORMS VERIFICATION - CRITICAL:
   For EVERY verb in "verbes" array, verify:
   - "passe_3ms" is فَعَلَ form (past 3ms): ذَهَبَ, كَتَبَ, قَرَأَ, جَلَسَ, شَرِبَ
     • MUST NOT start with يَ
     • MUST NOT be present or imperative form
   - "present_3ms" is يَفْعَلُ form (present 3ms): يَذْهَبُ, يَكْتُبُ, يَقْرَأُ
     • MUST start with يَ
   - "imperatif" is اِفْعَلْ form (imperative): اِذْهَبْ, اُكْتُبْ, اِقْرَأْ
   - All 3 forms are DIFFERENT from each other
8. For EVERY WORD in "vocabulaire":
   - MANDATORY "pluriel": Provide plural form for ALL nouns (null only for invariable words)
   - MANDATORY "contraire": Provide antonym for ALL adjectives and quality nouns
   - Examples of required antonyms:
     • كَبِيرٌ MUST have صَغِيرٌ
     • جَمِيلٌ MUST have قَبِيحٌ
     • طَوِيلٌ MUST have قَصِيرٌ
     • سَهْلٌ MUST have صَعْبٌ
     • حَارٌّ MUST have بَارِدٌ
   - If direct antonym doesn't exist, provide related opposite concept
   - Only use null if word is truly non-opposable (proper nouns, unique entities)

EXAMPLES OF COMMON MISTAKES TO AVOID:
❌ WRONG: Putting ذَهَبَ (went) in "vocabulaire" → ✅ CORRECT: Put in "verbes"
❌ WRONG: Putting كِتَابٌ (book) in "verbes" → ✅ CORRECT: Put in "vocabulaire"
❌ WRONG: Using يَذْهَبُ in "passe_3ms" field → ✅ CORRECT: Use ذَهَبَ (past form)
❌ WRONG: Using اِذْهَبْ in "passe_3ms" field → ✅ CORRECT: Use ذَهَبَ (past form)
❌ WRONG: Verb forms that are all identical → ✅ CORRECT: 3 different forms

Return ONLY the JSON object, no markdown, no comments, no explanation.`;

    // ✅ Call OpenAI GPT-4o for vocabulary extraction
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        max_tokens: 16000,
        temperature: 0.1,
        response_format: { type: "json_object" },
      }),
    });

    if (!r.ok) {
      const raw = await r.text();
      console.log("[extract-vocab] OpenAI status:", r.status);
      console.log("[extract-vocab] OpenAI body:", raw.slice(0, 500));

      return json(
        {
          error: "OpenAI failed",
          status: r.status,
          details: raw.slice(0, 500),
        },
        500
      );
    }

    const data = await r.json();
    const content = data?.choices?.[0]?.message?.content ?? "";

    console.log("[extract-vocab] OpenAI response length:", content.length);
    console.log("[extract-vocab] Content preview:", content.slice(0, 200));

    if (!content || content.trim().length === 0) {
      console.log("[extract-vocab] Empty response from OpenAI");
      return json({
        error: "Empty response from OpenAI",
        data: data
      }, 500);
    }

    let parsed;
    try {
      parsed = JSON.parse(content.replace(/```json\n?/g, "").replace(/```\n?/g, ""));
    } catch (parseError) {
      console.log("[extract-vocab] Parse error:", String(parseError));
      console.log("[extract-vocab] Raw content:", content.slice(0, 1000));
      return json({
        error: "Failed to parse OpenAI response",
        parseError: String(parseError),
        contentPreview: content.slice(0, 500)
      }, 500);
    }

    return json({
      vocabulaire: parsed.vocabulaire || [],
      verbes: parsed.verbes || [],
      particules: parsed.particules || [],
    });
  } catch (e) {
    console.log("[extract-vocab] Runtime error:", String(e));
    return json({ error: "Runtime error", message: String(e) }, 500);
  }
});
