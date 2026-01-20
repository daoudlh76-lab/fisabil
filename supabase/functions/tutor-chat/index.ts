import { serve } from "https://deno.land/std@0.208.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface RequestBody {
  messages: Array<{ role: string; content: string }>;
  userMessage: string;
  restrictedVocab: boolean;
  userWords: string[];
}

serve(async (req) => {
  // Handle CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { userMessage, restrictedVocab, userWords } = (await req.json()) as RequestBody;

    if (!userMessage) {
      return new Response(
        JSON.stringify({ error: "User message is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Générer une réponse du tuteur
    const response = generateTutorResponse(userMessage, restrictedVocab, userWords);

    return new Response(
      JSON.stringify({
        response,
        restrictedVocab,
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
 * Génère une réponse du tuteur IA
 */
function generateTutorResponse(
  userMessage: string,
  restrictedVocab: boolean,
  userWords: string[]
): string {
  // Réponses par défaut du tuteur
  const defaultResponses = [
    "شكراً على كتابتك! جملة جميلة.",
    "أحسنت! هل تريد تمرين آخر؟",
    "ممتاز! استمر في الممارسة.",
    "جيد جداً! هل لديك أسئلة؟",
    "أفهم ما تقول. هل يمكنك شرح أكثر؟",
    "رائع! تقدمك جميل جداً.",
    "هل تريد تمرين على نفس الموضوع؟",
    "استمر بالممارسة، أنت تتحسن!",
    "جملة صحيحة! لنتابع.",
    "أعجبتني طريقة كتابتك.",
  ];

  // Déterminer si le message contient des erreurs spécifiques
  if (userMessage.includes("؟") || userMessage.includes("?")) {
    return "سؤال جيد! هل يمكنك توضيح أكثر؟";
  }

  if (userMessage.length < 5) {
    return "الرسالة قصيرة جداً. هل يمكنك كتابة جملة أطول؟";
  }

  // Retourner une réponse aléatoire
  return defaultResponses[Math.floor(Math.random() * defaultResponses.length)];
}
