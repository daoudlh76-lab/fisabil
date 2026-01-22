import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Mapping des langues pour les traductions
const languageNames: Record<string, string> = {
  fr: "French",
  en: "English",
  de: "German",
  es: "Spanish",
  ru: "Russian",
};

serve(async (req) => {
  // Handle CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // 1) Récupérer le token d'auth
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "");

    if (!token) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2) Parser le body
    const { scan_id, ui_lang = "fr" } = await req.json();

    if (!scan_id) {
      return new Response(
        JSON.stringify({ error: "Missing scan_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3) Créer client Supabase
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 4) Récupérer le scan
    const { data: scan, error: scanError } = await supabase
      .from("scans")
      .select("id, title, content, user_id")
      .eq("id", scan_id)
      .single();

    if (scanError || !scan) {
      return new Response(
        JSON.stringify({ error: "Scan not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 5) Vérifier que l'utilisateur connecté est le propriétaire
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || userData.user?.id !== scan.user_id) {
      return new Response(
        JSON.stringify({ error: "Forbidden" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 6) EXTRACTION AVEC OPENAI GPT-4
    const openaiApiKey = Deno.env.get("OPENAI_API_KEY");
    
    if (!openaiApiKey) {
      console.error("❌ OPENAI_API_KEY not configured");
      return new Response(
        JSON.stringify({ error: "OpenAI API key not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const targetLanguage = languageNames[ui_lang] || "French";
    
    const systemPrompt = `You are an expert Arabic linguist teacher. Your task is COMPLETE vocabulary extraction with DECOMPOSITION of compound words.

## CRITICAL: DECOMPOSE COMPOUND WORDS
Arabic words often combine particles, articles, nouns, verbs, and pronouns. You MUST decompose them:

### Examples of decomposition:
- بِالْكِتَابِ → بِ (particule: with) + الْ (particule: the) + كِتَابٌ (vocabulaire: book)
- كِتَابُهُ → كِتَابٌ (vocabulaire: book) + ـهُ (vocabulaire/pronom: his)
- وَالْمَدْرَسَةِ → وَ (particule: and) + الْ (particule: the) + مَدْرَسَةٌ (vocabulaire: school)
- فَذَهَبُوا → فَ (particule: then) + ذَهَبَ (verbe: to go) + ـوا (pronom suffixe: they)
- سَيَكْتُبُونَ → سَ (particule: will) + يَكْتُبُ (verbe: to write) + ـونَ (pronom suffixe: they)
- لِلْعِلْمِ → لِ (particule: for) + الْ (particule: the) + عِلْمٌ (vocabulaire: knowledge)

### Prefixes to extract as particles:
- وَ، فَ (conjunctions)
- بِ، لِ، كَ (prepositions)
- الْ، أَلْ (definite article)
- سَ، سَوْفَ (future markers)
- أَ، هَلْ (question markers)

### Suffixes to note in "remarque" field:
- Pronoun suffixes: ـي، ـكَ، ـكِ، ـهُ، ـهَا، ـنَا، ـكُمْ، ـهُمْ، ـهُنَّ
- Add them to vocabulaire with type "pronom suffixe" in remarque

## EXTRACTION RULES:
1. **DECOMPOSE** every compound word into its base components
2. **VOCABULAIRE**: Only the BASE noun/adjective without prefixes (keep tashkeel appropriate for isolated form)
3. **VERBES**: Only the BASE verb root (3rd person masculine singular past)
4. **PARTICULES**: ALL prefixes, prepositions, conjunctions, articles extracted separately

5. **FULL TASHKEEL REQUIRED** on ALL Arabic

6. **NO DUPLICATES** - Each unique base word appears ONCE

7. **OUTPUT**: Return ONLY valid JSON, no markdown

## JSON STRUCTURE:
{
  "vocabulaire": [{"mot_ar":"base word with tashkeel", "traduction":"${targetLanguage}", "singulier":"or null", "pluriel":"or null", "contraire":"or null", "remarque":"note if originally had suffix like ـهُ"}],
  "verbes": [{"verbe_ar":"infinitive/masdar", "traduction":"${targetLanguage}", "passe_3ms":"past 3ms", "present_3ms":"present 3ms", "imperatif":"imperative", "remarque":"or null"}],
  "particules": [{"particule_ar":"particle with tashkeel", "type":"type in ${targetLanguage}", "traduction":"meaning", "exemple":"example usage or null"}]
}`;

    const userPrompt = `TASK: Extract and DECOMPOSE all vocabulary from this Arabic text.

CRITICAL STEPS:
1. For each word, identify if it's compound (has prefixes like وَ، فَ، بِ، لِ، الْ، سَ or suffixes like ـهُ، ـهَا، ـهُمْ)
2. DECOMPOSE compound words: extract prefixes as separate particles, base word as vocabulaire/verbe
3. Extract ALL components - do not skip any particle or base word
4. Add full tashkeel to every Arabic word

TEXT TO ANALYZE:
"""
${scan.content}
"""

DECOMPOSITION EXAMPLES to follow:
- "بِالْحَقِّ" → بِ (particle) + الْ (particle) + حَقٌّ (noun)
- "قَالُوا" → قَالَ (verb) with suffix ـوا noted
- "رَبُّهُمْ" → رَبٌّ (noun) with suffix ـهُمْ noted
- "فَأَخَذَ" → فَ (particle) + أَخَذَ (verb)
- "وَلِلنَّاسِ" → وَ (particle) + لِ (particle) + الْ (particle) + نَاسٌ (noun)

Return complete JSON with all decomposed components.`;

    console.log("📡 Calling OpenAI GPT-4 for vocabulary extraction...");

    const openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${openaiApiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.3,
        max_tokens: 4096,
      }),
    });

    if (!openaiResponse.ok) {
      const errorData = await openaiResponse.json();
      console.error("❌ OpenAI API error:", errorData);
      return new Response(
        JSON.stringify({ error: errorData.error?.message || "OpenAI API error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const openaiData = await openaiResponse.json();
    const content = openaiData.choices?.[0]?.message?.content || "";

    console.log("✅ OpenAI response received, parsing JSON...");

    // Parser la réponse JSON
    let extractedData;
    try {
      // Nettoyer la réponse (enlever les backticks markdown si présents)
      let cleanContent = content.trim();
      if (cleanContent.startsWith("```json")) {
        cleanContent = cleanContent.slice(7);
      }
      if (cleanContent.startsWith("```")) {
        cleanContent = cleanContent.slice(3);
      }
      if (cleanContent.endsWith("```")) {
        cleanContent = cleanContent.slice(0, -3);
      }
      cleanContent = cleanContent.trim();

      extractedData = JSON.parse(cleanContent);
    } catch (parseError) {
      console.error("❌ JSON parsing error:", parseError);
      console.error("Raw content:", content);
      return new Response(
        JSON.stringify({ error: "Failed to parse AI response" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 7) Retourner le résultat
    return new Response(
      JSON.stringify({
        meta: {
          ui_lang,
          title: scan.title,
          source: "extract-vocab-v1",
          model: "gpt-4o",
        },
        vocabulaire: extractedData.vocabulaire || [],
        verbes: extractedData.verbes || [],
        particules: extractedData.particules || [],
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
