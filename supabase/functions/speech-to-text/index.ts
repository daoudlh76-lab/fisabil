// supabase/functions/speech-to-text/index.ts
// Edge Function Supabase (Deno)

type RequestBody = {
  audioBase64: string;
  language?: string;
  prompt?: string;
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

    console.log("[speech-to-text] OPENAI_API_KEY present?", Boolean(OPENAI_API_KEY));

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

    if (!body?.audioBase64 || typeof body.audioBase64 !== "string") {
      return json({ error: "Invalid payload: audioBase64 required" }, 400);
    }

    const audioBytes = Uint8Array.from(atob(body.audioBase64), (c) => c.charCodeAt(0));
    if (audioBytes.length > 25 * 1024 * 1024) {
      return json({ error: "Audio file too large (max 25MB)" }, 400);
    }

    const formData = new FormData();
    formData.append("file", new Blob([audioBytes], { type: "audio/webm" }), "audio.webm");
    formData.append("model", "whisper-1");
    if (body.language) formData.append("language", body.language);
    if (body.prompt) formData.append("prompt", body.prompt);

    // ✅ Call OpenAI Whisper
    const r = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
      body: formData,
    });

    if (!r.ok) {
      const raw = await r.text();
      console.log("[speech-to-text] OpenAI status:", r.status);
      console.log("[speech-to-text] OpenAI body:", raw.slice(0, 500));

      return json(
        {
          error: "OpenAI STT failed",
          status: r.status,
          details: raw.slice(0, 500),
        },
        500
      );
    }

    const data = await r.json();
    const text = data?.text ?? "";

    return json({ text });
  } catch (e) {
    console.log("[speech-to-text] Runtime error:", String(e));
    return json({ error: "Runtime error", message: String(e) }, 500);
  }
});
