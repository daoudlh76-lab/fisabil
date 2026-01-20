import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface RequestBody {
  text: string;
  language?: string;
}

serve(async (req) => {
  // Handle CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Récupérer le body
    const { text, language = "ar" } = (await req.json()) as RequestBody;

    if (!text) {
      return new Response(
        JSON.stringify({ error: "Text is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Vérifier l'authentification (optionnel)
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Appliquer l'algorithme de diacritisation
    const diacritized = addDiacriticsToArabic(text);

    return new Response(
      JSON.stringify({
        original: text,
        diacritized,
        method: "api",
        language,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

/**
 * Ajoute les diacritiques (voyelles) au texte arabe
 * Utilise le damma (ُ) pour les voyelles brèves
 */
function addDiacriticsToArabic(text: string): string {
  const arabicChars: Record<string, string> = {
    ا: "اَ", // Alif with fatha
    ب: "بُ", // Ba with damma
    ت: "تُ", // Ta with damma
    ث: "ثُ", // Tha with damma
    ج: "جُ", // Jim with damma
    ح: "حُ", // Ha with damma
    خ: "خُ", // Kha with damma
    د: "دُ", // Dal with damma
    ذ: "ذُ", // Dhal with damma
    ر: "رُ", // Ra with damma
    ز: "زُ", // Zay with damma
    س: "سُ", // Sin with damma
    ش: "شُ", // Shin with damma
    ص: "صُ", // Sad with damma
    ض: "ضُ", // Dad with damma
    ط: "طُ", // Tah with damma
    ظ: "ظُ", // Za with damma
    ع: "عُ", // Ayn with damma
    غ: "غُ", // Ghayn with damma
    ف: "فُ", // Fa with damma
    ق: "قُ", // Qaf with damma
    ك: "كُ", // Kaf with damma
    ل: "لُ", // Lam with damma
    م: "مُ", // Mim with damma
    ن: "نُ", // Nun with damma
    ه: "هُ", // Ha with damma
    و: "وُ", // Waw with damma
    ي: "يُ", // Ya with damma
  };

  return text
    .split("")
    .map((char) => arabicChars[char] || char)
    .join("");
}
