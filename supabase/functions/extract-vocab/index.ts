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
    
    const systemPrompt = `You are an expert Arabic linguist and grammarian. Extract EVERY SINGLE WORD from the text with FULL TASHKEEL.

## CRITICAL: ADD VOWELS IF MISSING
The input text may or may not have diacritics (tashkeel). You MUST:
1. If the word already has diacritics → preserve them
2. If the word has NO diacritics → ADD FULL TASHKEEL based on Arabic grammar rules:
   - Fatha (فَتْحَة), Damma (ضَمَّة), Kasra (كَسْرَة)
   - Sukun (سُكُون), Shadda (شَدَّة)
   - Tanween (تَنْوِين): ً ٌ ٍ

Example: "الحمد لله رب العالمين" → Extract as "الْحَمْدُ"، "لِلَّهِ"، "رَبُّ"، "الْعَالَمِينَ"

## DECOMPOSE COMPOUND WORDS
- بالكتاب → بِ (particle) + الْ (particle) + كِتَابٌ (noun)
- وقال → وَ (particle) + قَالَ (verb)
- ربهم → رَبٌّ (noun) + note suffix ـهُمْ in remarque

## PREFIXES TO EXTRACT AS PARTICLES:
وَ، فَ، بِ، لِ، كَ، الْ، سَ، أَ، هَلْ

## WHAT TO EXTRACT:
1. **vocabulaire**: ALL nouns, adjectives, adverbs (base form with full tashkeel)
2. **verbes**: ALL verbs (past 3rd masc sing with tashkeel)
3. **particules**: ALL particles with tashkeel

## SINGULIER/PLURIEL - CRITICAL:
For EVERY noun in vocabulaire, you MUST provide:
- **singulier**: The singular form WITH FULL TASHKEEL (e.g., "كِتَابٌ")
- **pluriel**: The plural form WITH FULL TASHKEEL (e.g., "كُتُبٌ")
- If the word in text is singular → mot_ar = singulier, provide pluriel
- If the word in text is plural → mot_ar = pluriel, provide singulier
Examples:
- "الْعَالَمِينَ" (plural) → singulier: "عَالَمٌ", pluriel: "عَالَمُونَ / عَوَالِمُ"
- "كِتَابٌ" (singular) → singulier: "كِتَابٌ", pluriel: "كُتُبٌ"
- "رَجُلٌ" (singular) → singulier: "رَجُلٌ", pluriel: "رِجَالٌ"

## RULES:
- EVERY Arabic word in output MUST have FULL TASHKEEL
- NO duplicates (each unique word once)
- Include EVERY word - proper nouns, numbers, everything
- ALWAYS fill singulier AND pluriel for nouns (never leave both as null)
- Return ONLY valid JSON, no markdown

## JSON FORMAT:
{
  "vocabulaire": [{"mot_ar":"word WITH tashkeel", "traduction":"${targetLanguage} translation", "singulier":"singular WITH tashkeel", "pluriel":"plural WITH tashkeel", "contraire":"opposite or null", "remarque":"grammar note or null"}],
  "verbes": [{"verbe_ar":"masdar WITH tashkeel", "traduction":"${targetLanguage} translation", "passe_3ms":"past WITH tashkeel", "present_3ms":"present WITH tashkeel", "imperatif":"imperative WITH tashkeel", "remarque":"grammar note or null"}],
  "particules": [{"particule_ar":"particle WITH tashkeel", "type":"type", "traduction":"${targetLanguage} meaning", "exemple":"example sentence or null"}]
}`;

    const userPrompt = `Extract EVERY SINGLE WORD from this Arabic text with FULL TASHKEEL (vowels).

CRITICAL: If a word has no diacritics, ADD THEM according to Arabic grammar.

Steps for each word:
1. Read the word
2. If it has no tashkeel → ADD full tashkeel based on grammar
3. If compound (وَ، فَ، بِ، لِ، الْ prefix or ـهُ suffix) → decompose it
4. Add base word (WITH tashkeel) to vocabulaire/verbes
5. Add particles (WITH tashkeel) to particules

TEXT:
"""
${scan.content}
"""

IMPORTANT:
- Text has ~${scan.content.split(/\s+/).length} words - extract ALL of them
- EVERY Arabic word in output MUST have FULL TASHKEEL
- Example: "كتاب" without vowels → output as "كِتَابٌ" with vowels
Return complete JSON.`;

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
        temperature: 0.1,
        max_tokens: 16384,
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
