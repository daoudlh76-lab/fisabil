// supabase/functions/tutor-chat-ai/index.ts
// Edge Function Supabase (Deno)

type Role = "system" | "user" | "assistant";
type ChatMessage = { role: Role; content: string };

type RequestBody = {
  messages: ChatMessage[];
  max_tokens?: number;
  temperature?: number;
  language?: string; // ex: "ar", "fr", etc. (optionnel)
  model?: string; // override optionnel
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

function isChatMessage(x: any): x is ChatMessage {
  return (
    x &&
    (x.role === "system" || x.role === "user" || x.role === "assistant") &&
    typeof x.content === "string"
  );
}

function safeNumber(value: any, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

Deno.serve(async (req) => {
  // ✅ CORS preflight
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders() });

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    // ✅ ENV
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    const DEFAULT_MODEL = Deno.env.get("OPENAI_MODEL") ?? "gpt-4o-mini";

    // Logs utiles (sans afficher la clé)
    console.log("[tutor-chat-ai] OPENAI_API_KEY present?", Boolean(OPENAI_API_KEY));
    console.log("[tutor-chat-ai] DEFAULT_MODEL:", DEFAULT_MODEL);

    if (!OPENAI_API_KEY) {
      return json(
        {
          error: "Missing env OPENAI_API_KEY",
          hint:
            "Supabase Dashboard > Edge Functions > Secrets: ajouter OPENAI_API_KEY puis redeploy.",
        },
        500
      );
    }

    // ✅ Parse body
    const body = (await req.json()) as RequestBody;

    const messages = body?.messages;
    if (!Array.isArray(messages) || messages.length === 0) {
      return json({ error: "Invalid payload: messages[] required" }, 400);
    }
    if (!messages.every(isChatMessage)) {
      return json({ error: "Invalid payload: bad messages format" }, 400);
    }

    const max_tokens = safeNumber(body?.max_tokens, 900);
    const temperature = safeNumber(body?.temperature, 0.2);
    const language = typeof body?.language === "string" ? body.language : undefined;

    // Model override optionnel
    const model = typeof body?.model === "string" && body.model.trim().length > 0
      ? body.model.trim()
      : DEFAULT_MODEL;

    // ✅ (Optionnel) si tu veux forcer une langue, on ajoute un mini system msg
    // Sans casser ton prompt existant.
    const finalMessages: ChatMessage[] = [...messages];
    if (language && language.trim().length > 0) {
      finalMessages.unshift({
        role: "system",
        content: `Answer in language: ${language}`,
      });
    }

    // ✅ Call OpenAI
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: finalMessages,
        temperature,
        max_tokens,
      }),
    });

    // ✅ Handle OpenAI errors
    const raw = await r.text();

    if (!r.ok) {
      console.log("[tutor-chat-ai] OpenAI status:", r.status);
      console.log("[tutor-chat-ai] OpenAI body:", raw);

      // on renvoie un message clair au client
      return json(
        {
          error: "OpenAI request failed",
          status: r.status,
          details: raw,
        },
        500
      );
    }

    const data = JSON.parse(raw);
    const content = data?.choices?.[0]?.message?.content ?? "";

    // ✅ Response format simple
    return json({
      content,
      modelUsed: model,
    });
  } catch (e) {
    console.log("[tutor-chat-ai] Runtime error:", String(e));
    return json({ error: "Runtime error", message: String(e) }, 500);
  }
});
