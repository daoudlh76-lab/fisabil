// supabase/functions/tts-generate/index.ts
// Edge Function Supabase (Deno)

type RequestBody = {
  text: string;
  voice?: "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer";
  format?: "mp3" | "opus" | "aac" | "flac";
  speed?: number;
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
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");

    console.log("[tts-generate] OPENAI_API_KEY present?", Boolean(OPENAI_API_KEY));

    if (!OPENAI_API_KEY) {
      return json(
        {
          error: "Missing env OPENAI_API_KEY",
          hint: "Supabase Dashboard > Edge Functions > Secrets: ajouter OPENAI_API_KEY puis redeploy.",
        },
        500
      );
    }

    // ✅ Parse body
    const body = (await req.json()) as RequestBody;

    if (!body?.text || typeof body.text !== "string") {
      return json({ error: "Invalid payload: text required" }, 400);
    }

    const text = body.text.slice(0, 4096);
    const voice = body.voice || "alloy";
    const format = body.format || "mp3";
    const speed = Math.min(Math.max(body.speed ?? 1.0, 0.25), 4.0);

    // ✅ Call OpenAI TTS
    const r = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "tts-1",
        input: text,
        voice,
        response_format: format,
        speed,
      }),
    });

    if (!r.ok) {
      const raw = await r.text();
      console.log("[tts-generate] OpenAI status:", r.status);
      console.log("[tts-generate] OpenAI body:", raw.slice(0, 500));

      return json(
        {
          error: "OpenAI TTS failed",
          status: r.status,
          details: raw.slice(0, 500),
        },
        500
      );
    }

    const audioBuffer = await r.arrayBuffer();
    const base64Audio = btoa(String.fromCharCode(...new Uint8Array(audioBuffer)));

    return json({ audioBase64: base64Audio, format });
  } catch (e) {
    console.log("[tts-generate] Runtime error:", String(e));
    return json({ error: "Runtime error", message: String(e) }, 500);
  }
});
