import { useState, useCallback, useEffect } from "react";
import { supabase } from "@/src/lib/supabase";

const OPENAI_API_KEY = process.env.EXPO_PUBLIC_OPENAI_API_KEY || '';
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

export interface Message {
  id: string;
  role: "user" | "tutor" | "system";
  text: string;
  timestamp: number;
}

interface UserText {
  id: string;
  title: string;
  content: string;
}

// Mapping des langues
const languageNames: Record<string, string> = {
  fr: 'French',
  en: 'English',
  de: 'German',
  es: 'Spanish',
  ru: 'Russian',
};

export function useTutor(uiLang: string = 'fr') {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userTexts, setUserTexts] = useState<UserText[]>([]);
  const [textsLoaded, setTextsLoaded] = useState(false);

  // Charger les textes de l'utilisateur au démarrage
  useEffect(() => {
    loadUserTexts();
  }, []);

  const loadUserTexts = async () => {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user?.id;
      
      if (!userId) {
        console.log('⚠️ Pas de session pour charger les textes');
        setTextsLoaded(true);
        return;
      }

      const { data: scans, error } = await supabase
        .from('scans')
        .select('id, title, content')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(10); // Limiter aux 10 derniers textes

      if (error) {
        console.error('❌ Erreur chargement textes:', error);
      } else {
        setUserTexts(scans || []);
        console.log('📚 Textes chargés pour le tuteur:', scans?.length || 0);
      }
      setTextsLoaded(true);
    } catch (e) {
      console.error('❌ Erreur:', e);
      setTextsLoaded(true);
    }
  };

  // Construire le prompt système pour le tuteur
  const buildSystemPrompt = useCallback(() => {
    const targetLang = languageNames[uiLang] || 'French';
    
    // Préparer un résumé des textes de l'utilisateur
    const textsContext = userTexts.length > 0 
      ? userTexts.map((t, i) => `--- TEXT ${i + 1}: "${t.title}" ---\n${t.content.slice(0, 1500)}`).join('\n\n')
      : 'No texts available yet.';

    return `You are an expert Arabic language teacher (معلم اللغة العربية). Your role is to help the student practice and improve their Arabic through conversation.

## YOUR BEHAVIOR:
1. **ALWAYS RESPOND IN ARABIC** - Every response must be in Arabic with full tashkeel/diacritics (فَتْحَة، ضَمَّة، كَسْرَة، سُكُون، شَدَّة، تَنْوِين)
2. **EXCEPTION**: If the student explicitly asks for explanation in their language (says "explain in ${targetLang}", "je ne comprends pas", "I don't understand", "Ich verstehe nicht", etc.), then you may briefly explain in ${targetLang}, then return to Arabic.
3. **BE A REAL TEACHER**: Ask questions, give exercises, correct mistakes, encourage progress.

## YOUR TEACHING METHOD:
1. **ASK QUESTIONS** about the texts the student has studied (provided below)
2. **CORRECT ALL ERRORS** the student makes:
   - Grammar errors (الأخطاء النحوية)
   - Spelling errors (الأخطاء الإملائية)
   - Comprehension errors (أخطاء الفهم)
   - Word choice errors (اختيار الكلمات)
3. **EXPLAIN CORRECTIONS** in Arabic: "الصواب هو..." / "الخطأ في..." 
4. **ENCOURAGE**: Always be positive and supportive

## CORRECTION FORMAT (in Arabic):
When the student makes an error, use this format:
✏️ تصحيح: [correct form]
📝 الخطأ: [what was wrong]
💡 القاعدة: [the grammar/spelling rule]

## QUESTION TYPES TO ASK:
- ما معنى [كلمة] في النص؟
- ماذا فهمت من هذا النص؟
- هل يمكنك تلخيص الفقرة؟
- ما هو الفعل في هذه الجملة؟
- ما هو جمع/مفرد [كلمة]؟
- اكتب جملة باستخدام [كلمة]

## STUDENT'S TEXTS (for reference):
${textsContext}

## IMPORTANT RULES:
- Start by greeting and asking about a text
- Keep your Arabic simple at first, increase difficulty gradually
- If student struggles, offer hints (in Arabic)
- Only switch to ${targetLang} if student explicitly requests explanation
- Always return to Arabic after any ${targetLang} explanation
- Add full tashkeel to ALL Arabic words

Begin the conversation by greeting the student and asking them about one of their texts.`;
  }, [userTexts, uiLang]);

  // Envoyer un message au tuteur via OpenAI
  const sendMessage = useCallback(
    async (userMessage: string, restrictedVocab: boolean = true) => {
      if (!userMessage.trim()) return;

      try {
        setLoading(true);
        setError(null);

        console.log("📤 Sending message to tutor:", userMessage);

        // Ajouter le message de l'utilisateur
        const userMsg: Message = {
          id: `user_${Date.now()}`,
          role: "user",
          text: userMessage,
          timestamp: Date.now(),
        };

        setMessages((prev) => [...prev, userMsg]);

        // Si pas de clé API, utiliser une réponse de fallback
        if (!OPENAI_API_KEY) {
          console.log('⚠️ No OpenAI API key, using fallback');
          await new Promise((resolve) => setTimeout(resolve, 1000));
          
          const fallbackMsg: Message = {
            id: `tutor_${Date.now()}`,
            role: "tutor",
            text: "مَرْحَبًا! أَنَا مُعَلِّمُكَ. لِلْأَسَفِ، لَا يُمْكِنُنِي الْاتِّصَالُ بِالذَّكَاءِ الْاصْطِنَاعِيِّ الْآنَ. حَاوِلْ لَاحِقًا!",
            timestamp: Date.now(),
          };
          setMessages((prev) => [...prev, fallbackMsg]);
          return;
        }

        // Construire l'historique des messages pour OpenAI
        const conversationHistory = messages.map(m => ({
          role: m.role === 'user' ? 'user' as const : 'assistant' as const,
          content: m.text,
        }));

        // Appeler l'API OpenAI avec retry
        let response: Response | null = null;
        let lastError: Error | null = null;

        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            console.log(`🔄 Tentative ${attempt}/3...`);

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 60000); // 60s timeout

            response = await fetch(OPENAI_API_URL, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${OPENAI_API_KEY}`,
              },
              body: JSON.stringify({
                model: 'gpt-4o',
                messages: [
                  { role: 'system', content: buildSystemPrompt() },
                  ...conversationHistory,
                  { role: 'user', content: userMessage },
                ],
                temperature: 0.7,
                max_tokens: 1000,
              }),
              signal: controller.signal,
            });

            clearTimeout(timeoutId);

            if (response.ok) {
              break; // Succès, sortir de la boucle
            }

            // Si erreur 429 (rate limit), attendre avant de réessayer
            if (response.status === 429) {
              console.log('⏳ Rate limit atteint, attente de 5s...');
              await new Promise(resolve => setTimeout(resolve, 5000));
              continue;
            }

            // Autre erreur
            lastError = new Error(`API error: ${response.status}`);
          } catch (err) {
            lastError = err instanceof Error ? err : new Error('Unknown error');
            console.log(`❌ Tentative ${attempt} échouée:`, lastError.message);

            if (attempt < 3) {
              await new Promise(resolve => setTimeout(resolve, 2000)); // Attendre 2s avant retry
            }
          }
        }

        if (!response || !response.ok) {
          throw lastError || new Error('Échec après 3 tentatives');
        }

        const data = await response.json();
        const tutorResponse = data.choices?.[0]?.message?.content || 'عُذْرًا، حَدَثَ خَطَأٌ.';

        console.log("🤖 Tutor response received");

        const tutorMsg: Message = {
          id: `tutor_${Date.now()}`,
          role: "tutor",
          text: tutorResponse,
          timestamp: Date.now(),
        };

        setMessages((prev) => [...prev, tutorMsg]);
      } catch (err) {
        console.error("❌ Tutor error:", err);
        setError(err instanceof Error ? err.message : "خطأ");
        
        // Message d'erreur en arabe
        const errorMsg: Message = {
          id: `tutor_${Date.now()}`,
          role: "tutor",
          text: "عُذْرًا، حَدَثَ خَطَأٌ فِي الِاتِّصَالِ. حَاوِلْ مَرَّةً أُخْرَى!",
          timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, errorMsg]);
      } finally {
        setLoading(false);
      }
    },
    [messages, buildSystemPrompt]
  );

  // Démarrer une nouvelle conversation
  const startConversation = useCallback(async () => {
    if (!OPENAI_API_KEY || userTexts.length === 0) {
      // Message de bienvenue par défaut
      const welcomeMsg: Message = {
        id: `tutor_${Date.now()}`,
        role: "tutor",
        text: userTexts.length === 0 
          ? "مَرْحَبًا! أَنَا مُعَلِّمُكَ لِلُّغَةِ الْعَرَبِيَّةِ. لَمْ تَقُمْ بِمَسْحِ أَيِّ نَصٍّ بَعْدُ. اِذْهَبْ إِلَى الْمَاسِحِ الضَّوْئِيِّ وَامْسَحْ نَصًّا لِنَبْدَأَ التَّعَلُّمَ!"
          : "مَرْحَبًا! أَنَا مُعَلِّمُكَ. كَيْفَ حَالُكَ الْيَوْمَ؟",
        timestamp: Date.now(),
      };
      setMessages([welcomeMsg]);
      return;
    }

    try {
      setLoading(true);
      
      // Demander à l'IA de commencer la conversation
      const response = await fetch(OPENAI_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: [
            { role: 'system', content: buildSystemPrompt() },
            { role: 'user', content: 'ابدأ المحادثة بتحية الطالب واسأله عن أحد النصوص التي درسها.' },
          ],
          temperature: 0.7,
          max_tokens: 500,
        }),
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();
      const greeting = data.choices?.[0]?.message?.content || 'مَرْحَبًا! كَيْفَ حَالُكَ الْيَوْمَ؟';

      const welcomeMsg: Message = {
        id: `tutor_${Date.now()}`,
        role: "tutor",
        text: greeting,
        timestamp: Date.now(),
      };
      setMessages([welcomeMsg]);
    } catch (err) {
      console.error('❌ Error starting conversation:', err);
      const fallbackMsg: Message = {
        id: `tutor_${Date.now()}`,
        role: "tutor",
        text: "مَرْحَبًا! أَنَا مُعَلِّمُكَ لِلُّغَةِ الْعَرَبِيَّةِ. تَعَالَ نَتَحَدَّثُ!",
        timestamp: Date.now(),
      };
      setMessages([fallbackMsg]);
    } finally {
      setLoading(false);
    }
  }, [userTexts, buildSystemPrompt]);

  const clearMessages = useCallback(() => {
    setMessages([]);
    setError(null);
  }, []);

  // Rafraîchir les textes
  const refreshTexts = useCallback(() => {
    loadUserTexts();
  }, []);

  return {
    messages,
    loading,
    error,
    sendMessage,
    clearMessages,
    startConversation,
    userTexts,
    textsLoaded,
    refreshTexts,
  };
}
