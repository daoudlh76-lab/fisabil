import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ExercisesRequest {
  vocabList?: string[];
  sourceText?: string;
  difficulty?: "beginner" | "intermediate" | "advanced";
  count?: number;
}

serve(async (req) => {
  // Handle CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // 1) Create Supabase client with user's auth token
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });

    // 2) Verify user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized - Invalid or missing token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3) Parse request
    const {
      vocabList = [],
      sourceText,
      difficulty = "intermediate",
      count = 5,
    } = (await req.json()) as ExercisesRequest;

    // 4) Call OpenAI
    const openaiApiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiApiKey) {
      return new Response(
        JSON.stringify({ error: "Service not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let prompt = `Generate ${count} Arabic language exercises at ${difficulty} level. `;
    if (vocabList.length > 0) {
      prompt += `Use these vocabulary words: ${vocabList.join(", ")}. `;
    }
    if (sourceText) {
      prompt += `Base exercises on this text: "${sourceText}". `;
    }
    prompt += "Return as JSON array with: { question, options: [string], correct: number, explanation }";

    console.log(`📚 Generating exercises for user ${user.id}`);

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openaiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: "You are an Arabic language teacher creating practice exercises. Return valid JSON only.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.7,
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      return new Response(
        JSON.stringify({ error: "Generation failed" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const result = await response.json();
    const content = result.choices?.[0]?.message?.content || "{}";
    const exercises = JSON.parse(content);

    return new Response(
      JSON.stringify({ exercises: exercises.exercises || [], difficulty }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("❌ Exercises generation error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
