/**
 * Hook pour le tuteur IA - Architecture Edge Function
 * Utilise Supabase Edge Function 'tutor-chat-ai' au lieu d'appels directs OpenAI
 * Charge le vocabulaire de l'apprenant pour personnaliser les questions
 */

import { supabase } from "@/src/lib/supabase";
import { invokeEdge } from "@/src/lib/edge-ai";
import { loadLearnerWords, buildVocabSummary } from "@/src/lib/learner-vocabulary";
import { useCallback, useEffect, useState } from "react";

interface UserText {
  id: string;
  title: string;
  content: string;
  folder_id: string | null;
  created_at?: string;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
}

const languageNames: Record<string, string> = {
  fr: 'French',
  en: 'English',
  de: 'German',
  es: 'Spanish',
  ru: 'Russian',
  ms: 'Malay',
};

export function useTutor(uiLang: string = 'fr') {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userTexts, setUserTexts] = useState<UserText[]>([]);
  const [textsLoaded, setTextsLoaded] = useState(false);
  const [vocabSummary, setVocabSummary] = useState<string>('');

  // ═══ Load user texts from Supabase ═══
  const refreshTexts = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user?.id;

      if (!userId) {
        console.warn('[TUTOR] No authenticated user');
        setUserTexts([]);
        setTextsLoaded(true);
        setLoading(false);
        return;
      }

      const { data: scans, error: scansError } = await supabase
        .from('scans')
        .select('id, title, content, folder_id, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (scansError) {
        console.error('[TUTOR] Error loading scans:', scansError.message);
        setError('Erreur de chargement des textes');
        setUserTexts([]);
        setTextsLoaded(true);
        setLoading(false);
        return;
      }

      const normalizedScans = scans || [];
      console.log(`[TUTOR] Loaded ${normalizedScans.length} texts`);
      setUserTexts(normalizedScans);
      setTextsLoaded(true);
      setLoading(false);
    } catch (e) {
      console.error('[TUTOR] Exception loading texts:', e);
      setError('Erreur de chargement des textes');
      setUserTexts([]);
      setTextsLoaded(true);
      setLoading(false);
    }
  }, []);

  // ═══ Load learner vocabulary on mount ═══
  useEffect(() => {
    const loadVocabulary = async () => {
      try {
        console.log('[TUTOR] Loading learner vocabulary...');
        const words = await loadLearnerWords();
        const summary = buildVocabSummary(words, 200); // Max 200 mots
        setVocabSummary(summary);
        console.log(`[TUTOR] Loaded ${words.length} known words`);
      } catch (e) {
        console.error('[TUTOR] Error loading vocabulary:', e);
        setVocabSummary('');
      }
    };

    loadVocabulary();
  }, []);

  // ═══ Load texts on mount ═══
  useEffect(() => {
    refreshTexts();
  }, [refreshTexts]);

  // ═══ Build system prompt with texts + vocabulary ═══
  const buildSystemPrompt = useCallback((selectedTextId?: string): string => {
    const targetLang = languageNames[uiLang] || 'French';
    let filteredTexts = userTexts;

    if (selectedTextId) {
      filteredTexts = userTexts.filter(t => t.id === selectedTextId);
    }

    if (filteredTexts.length === 0) {
      return `أنت أستاذٌ لِلعَرَبِيَّةِ الفُصْحَى، لَطِيفٌ وَصَبُورٌ. تَتَحَدَّثُ فَقَطْ بِالعَرَبِيَّةِ الفُصْحَى مَعَ التَّشْكِيلِ الكَامِلِ.

الطَّالِبُ لَمْ يُقَدِّمْ نَصًّا بَعْدُ. اِطْلُبْ مِنْهُ أَنْ يَمْسَحَ نَصًّا أَوْ يُضِيفَ نَصًّا لِلدِّرَاسَةِ.

الطَّالِبُ قَدْ يُجِيبُ بِالـ${targetLang}.`;
    }

    // Construire le contexte avec tous les textes disponibles
    const textsContext = filteredTexts
      .map((t, idx) => `${idx + 1}. "${t.title}"\n${t.content.substring(0, 500)}${t.content.length > 500 ? '...' : ''}`)
      .join('\n\n');

    // Injecter le vocabulaire connu si disponible
    const vocabBlock = vocabSummary ? `

## مُفْرَدَاتُ الطَّالِبِ المَعْرُوفَةُ (vocabulaire connu de l'apprenant) :
${vocabSummary}

⚠️ قَاعِدَةٌ مُهِمَّةٌ: اسْتَخْدِمْ أَقْصَى عَدَدٍ مِنْ هَذِهِ المُفْرَدَاتِ عِنْدَ طَرْحِ الأَسْئِلَةِ وَالتَّصْحِيحِ، لِتَسْهِيلِ فَهْمِ الطَّالِبِ. إِذَا اسْتَخْدَمْتَ كَلِمَةً جَدِيدَةً لَيْسَتْ فِي القَائِمَةِ، اشْرَحْهَا بِاخْتِصَارٍ.` : '';

    return `أنت أستاذٌ لِلعَرَبِيَّةِ الفُصْحَى، لَطِيفٌ وَصَبُورٌ. تَتَحَدَّثُ فَقَطْ بِالعَرَبِيَّةِ الفُصْحَى مَعَ التَّشْكِيلِ الكَامِلِ.

## النُّصُوصُ المَدْرُوسَةُ:
${textsContext}

## مُهِمَّتُكَ:
١. اِطْرَحْ أَسْئِلَةً عَنْ مَعْنَى النُّصُوصِ وَمُفْرَدَاتِهَا
٢. صَحِّحْ أَخْطَاءَ الفَهْمِ (المَعْنَى)
٣. صَحِّحْ أَخْطَاءَ النَّحْوِ وَالصَّرْفِ
٤. صَحِّحْ أَخْطَاءَ النُّطْقِ (بِنَاءً عَلَى كِتَابَةِ الطَّالِبِ)
٥. اِشْرَحْ المُفْرَدَاتِ الصَّعْبَةَ
٦. قَدِّمْ أَمْثِلَةً مِنَ النُّصُوصِ

## القَوَاعِدُ:
- كُلُّ كَلِمَةٍ بِالتَّشْكِيلِ الكَامِلِ
- لِلمُثَنَّى: اسْتَخْدِمِ الصِّيغَةَ الصَّحِيحَةَ (تَسْكُنَانِ، تُرِيدَانِ، هُمَا)
- كُنْ لَطِيفًا فِي التَّصْحِيحِ
- لَا تَطْلُبْ نَصًّا أَوْ مَعْلُومَاتٍ إِضَافِيَّةً (النُّصُوصُ أَعْلَاهُ)
- اِجْعَلْ أَجْوِبَتَكَ قَصِيرَةً وَمُرَكَّزَةً (٢-٣ جُمَلٍ كَحَدٍّ أَقْصَى)
${vocabBlock}

الطَّالِبُ قَدْ يُجِيبُ بِالـ${targetLang}.`;
  }, [uiLang, userTexts, vocabSummary]);

  // ═══ Send message to tutor via Edge Function ═══
  const sendMessage = useCallback(async (userMessage: string, selectedTextId?: string) => {
    if (!userMessage.trim()) {
      console.warn('[TUTOR] Empty message, skipping');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Ajouter le message utilisateur immédiatement
      const userMsg: ChatMessage = {
        id: `user_${Date.now()}`,
        role: 'user',
        content: userMessage,
        timestamp: Date.now(),
      };
      setMessages(prev => [...prev, userMsg]);

      // Construire le prompt système avec le contexte
      const systemPrompt = buildSystemPrompt(selectedTextId);

      // Construire l'array de messages pour l'Edge Function
      // Format: [system, ...history, user_message_actuel]
      const messagesToSend = [
        { role: 'system' as const, content: systemPrompt },
        ...messages.map(m => ({
          role: m.role as 'user' | 'assistant' | 'system',
          content: m.content,
        })),
        { role: 'user' as const, content: userMessage.trim() },
      ];

      // Appeler l'Edge Function Supabase
      console.log('[TUTOR] Calling Edge Function: tutor-chat-ai');
      const response = await invokeEdge<{ content: string; modelUsed?: string; error?: string }>('tutor-chat-ai', {
        messages: messagesToSend,
        max_tokens: 500,
        temperature: 0.2,
        language: 'ar', // Force Arabic output
      });

      if (response.error) {
        console.error('[TUTOR] Edge Function error:', response.error);
        setError(response.error);
        setLoading(false);
        return;
      }

      if (!response.content) {
        console.error('[TUTOR] Empty response from Edge Function');
        setError('Réponse vide du tuteur');
        setLoading(false);
        return;
      }

      // Ajouter la réponse du tuteur
      const assistantMsg: ChatMessage = {
        id: `assistant_${Date.now()}`,
        role: 'assistant',
        content: response.content,
        timestamp: Date.now(),
      };
      setMessages(prev => [...prev, assistantMsg]);

      console.log('[TUTOR] ✅ Response received:', response.content.substring(0, 100) + '...');
      console.log('[TUTOR] Model used:', response.modelUsed || 'gpt-4o-mini');
      setLoading(false);
    } catch (err: any) {
      console.error('[TUTOR] Exception in sendMessage:', err);
      setError(err.message || 'Erreur de communication avec le tuteur');
      setLoading(false);
    }
  }, [messages, buildSystemPrompt, uiLang]);

  // ═══ Start a new conversation with a welcome message ═══
  const startConversation = useCallback(async (selectedTextId?: string) => {
    try {
      setLoading(true);
      setError(null);
      setMessages([]);

      // Vérifier qu'il y a des textes
      if (userTexts.length === 0) {
        const welcomeMsg: ChatMessage = {
          id: `assistant_welcome_${Date.now()}`,
          role: 'assistant',
          content: 'السَّلَامُ عَلَيْكُمْ! لَمْ أَجِدْ أَيَّ نَصٍّ مَمْسُوحٍ. اِمْسَحْ نَصًّا أَوْ أَضِفْ نَصًّا لِنَبْدَأَ الدَّرْسَ.',
          timestamp: Date.now(),
        };
        setMessages([welcomeMsg]);
        setLoading(false);
        return;
      }

      // Filtrer les textes si un ID est fourni
      let filteredTexts = userTexts;
      if (selectedTextId) {
        filteredTexts = userTexts.filter(t => t.id === selectedTextId);
      }

      if (filteredTexts.length === 0) {
        setError('Texte non trouvé');
        setLoading(false);
        return;
      }

      const text = filteredTexts[0];

      // Générer un message de bienvenue personnalisé
      const welcomeMessage = selectedTextId
        ? `السَّلَامُ عَلَيْكُمْ! سَنَدْرُسُ مَعًا نَصَّ "${text.title}". اِسْأَلْنِي عَنْ أَيِّ شَيْءٍ فِي النَّصِّ أَوِ اطْلُبْ مِنِّي أَنْ أَطْرَحَ أَسْئِلَةً.`
        : `السَّلَامُ عَلَيْكُمْ! لَدَيْكَ ${userTexts.length} نُصُوصٍ مَمْسُوحَةٍ. اِخْتَرْ نَصًّا أَوِ اسْأَلْنِي عَنْ أَيِّ نَصٍّ تُرِيدُ دِرَاسَتَهُ.`;

      const welcomeMsg: ChatMessage = {
        id: `assistant_welcome_${Date.now()}`,
        role: 'assistant',
        content: welcomeMessage,
        timestamp: Date.now(),
      };

      setMessages([welcomeMsg]);
      console.log(`[TUTOR] Conversation started with text: ${text.title}`);
      setLoading(false);
    } catch (err: any) {
      console.error('[TUTOR] Error starting conversation:', err);
      setError(err.message || 'Erreur de démarrage de la conversation');
      setLoading(false);
    }
  }, [userTexts]);

  // ═══ Clear messages ═══
  const clearMessages = useCallback(() => {
    console.log('[TUTOR] Clearing messages');
    setMessages([]);
    setError(null);
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
