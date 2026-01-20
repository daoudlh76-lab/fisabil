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
    
    const systemPrompt = `You are an expert Arabic language teacher. Analyze the given Arabic text and extract vocabulary, verbs, and particles. 
    
IMPORTANT: 
- All Arabic words MUST include full diacritical marks (tashkeel/harakat: fatha, kasra, damma, sukun, shadda, tanwin, etc.)
- Translations must be in ${targetLanguage}
- Return ONLY valid JSON, no markdown, no code blocks, no explanations

Return a JSON object with this exact structure:
{
  "vocabulaire": [
    {
      "mot_ar": "Arabic word with full diacritics",
      "traduction": "translation in ${targetLanguage}",
      "singulier": "singular form with diacritics or null",
      "pluriel": "plural form with diacritics or null",
      "contraire": "opposite word with diacritics or null",
      "remarque": "grammatical note in ${targetLanguage} or null"
    }
  ],
  "verbes": [
    {
      "verbe_ar": "Arabic verb with diacritics",
      "traduction": "translation in ${targetLanguage}",
      "passe_3ms": "past tense 3rd person masculine singular with diacritics",
      "present_3ms": "present tense 3rd person masculine singular with diacritics",
      "imperatif": "imperative form with diacritics",
      "remarque": "grammatical note in ${targetLanguage} or null"
    }
  ],
  "particules": [
    {
      "particule_ar": "Arabic particle with diacritics",
      "type": "type in ${targetLanguage} (preposition, conjunction, etc.)",
      "traduction": "translation in ${targetLanguage}",
      "exemple": "example sentence with diacritics or null"
    }
  ]
}`;

    const userPrompt = `Analyze this Arabic text and extract all vocabulary, verbs, and particles. Make sure to add full diacritical marks to ALL Arabic words:

${scan.content}`;

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
