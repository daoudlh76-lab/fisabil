/**
 * Hook pour le tuteur vocal avec architecture Edge Function
 * Flow complet : connect → welcome → résumé du texte → questions (15-20) → corrections → enchaînement auto
 *
 * Architecture:
 * - 🎤 Reconnaissance vocale: expo-speech-recognition (LOCAL)
 * - 🔊 TTS: expo-speech (LOCAL)
 * - 🧠 IA: Supabase Edge Function 'tutor-chat-ai' (SERVEUR)
 * - ❌ AUCUNE clé OpenAI côté client
 */

import { useVoicePreference } from "@/contexts/voice-preference-context";
import { supabase } from "@/src/lib/supabase";
import { invokeEdge } from "@/src/lib/edge-ai";
import { loadLearnerWords, buildVocabSummary } from "@/src/lib/learner-vocabulary";
import * as Speech from 'expo-speech';
import { useCallback, useEffect, useRef, useState } from "react";

// Importer expo-speech-recognition de manière conditionnelle
let ExpoSpeechRecognitionModule: any = null;
let useSpeechRecognitionEvent: any = null;

try {
  const speechRecognition = require('expo-speech-recognition');
  ExpoSpeechRecognitionModule = speechRecognition.ExpoSpeechRecognitionModule;
  useSpeechRecognitionEvent = speechRecognition.useSpeechRecognitionEvent;
} catch (e) {
  console.log('⚠️ expo-speech-recognition not available (requires rebuild)');
}

// Hook factice si le module n'est pas disponible
const useNoopEvent = (_event: string, _callback: any) => {};

const languageNames: Record<string, string> = {
  fr: 'French',
  en: 'English',
  de: 'German',
  es: 'Spanish',
  ru: 'Russian',
};

interface UserText {
  id: string;
  title: string;
  content: string;
  folder_id: string | null;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: number;
}

export const useChatTutor = (uiLang: string, selectedTextId?: string) => {
  const { gender } = useVoicePreference();

  const [isConnected, setIsConnected] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [userTexts, setUserTexts] = useState<UserText[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState('');
  const [userTranscript, setUserTranscript] = useState('');
  const [conversationHistory, setConversationHistory] = useState<Array<{role: string, content: string}>>([]);
  const [questionCount, setQuestionCount] = useState(0);
  const [vocabSummary, setVocabSummary] = useState<string>('');

  // ═══ QUESTION CACHE: useRef to avoid stale closures ═══
  const questionsCacheRef = useRef<Record<string, string[]>>({});
  const questionsMetaRef = useRef<Record<string, { originalCount: number }>>({});
  const currentQuestionRef = useRef<{textId: string; question: string; askedNumber: number; total: number} | null>(null);
  const [cacheVersion, setCacheVersion] = useState(0); // triggers re-render when cache changes

  const intToArabicIndic = useCallback((num: number) => {
    const mapping = ['\u0660','\u0661','\u0662','\u0663','\u0664','\u0665','\u0666','\u0667','\u0668','\u0669'];
    return String(num).split('').map(d => {
      const idx = Number(d);
      return Number.isNaN(idx) ? d : mapping[idx];
    }).join('');
  }, []);

  const isListeningRef = useRef(false);
  const isPausedRef = useRef(false);
  const isConnectedRef = useRef(false);
  const questionCountRef = useRef(0);
  const currentTranscriptRef = useRef<string>('');

  // Keep questionCountRef in sync with state
  useEffect(() => { questionCountRef.current = questionCount; }, [questionCount]);

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

  // ═══ Load user texts ═══
  const loadUserTexts = useCallback(async () => {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user?.id;
      if (!userId) return [];
      const { data: scans, error: scansError } = await supabase
        .from('scans')
        .select('id, title, content, folder_id')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
      if (scansError) { console.error('[TUTOR] Erreur chargement scans:', scansError.message); return []; }
      const normalizedScans = scans || [];
      setUserTexts(normalizedScans);
      return normalizedScans;
    } catch (e) { console.error('[TUTOR] Erreur chargement textes:', e); return []; }
  }, []);

  // ═══ Detect Arabic ═══
  const isArabicText = (text: string): boolean => {
    const arabicChars = text.match(/[\u0600-\u06FF]/g)?.length || 0;
    const totalChars = text.replace(/\s/g, '').length;
    return totalChars > 0 && (arabicChars / totalChars) > 0.3;
  };

  // ═══ TTS — LOCAL device TTS (expo-speech) — gratuit, utilise les voix natives du téléphone ═══
  const speakText = useCallback(async (text: string): Promise<void> => {
    return new Promise((resolve) => {
      console.log('🔊 TTS starting (local device):', text.substring(0, 50) + '...');
      setIsSpeaking(true);

      const isArabic = isArabicText(text);
      const lang = isArabic ? 'ar' : uiLang === 'fr' ? 'fr' : uiLang === 'de' ? 'de' : uiLang === 'es' ? 'es' : uiLang === 'ru' ? 'ru' : 'en';
      const rate = isArabic ? 0.85 : 0.95; // Slightly slower for clarity

      Speech.speak(text, {
        language: lang,
        pitch: 1.0,
        rate: rate,
        onDone: () => {
          console.log('🔊 TTS finished (device)');
          setIsSpeaking(false);
          resolve();
        },
        onError: (error) => {
          console.error('🔊 TTS error (device):', error);
          setIsSpeaking(false);
          resolve();
        },
      });
    });
  }, [uiLang]);

  // ═══ Expo Speech Recognition Event Listeners ═══
  const eventHook = useSpeechRecognitionEvent || useNoopEvent;

  // Écoute les résultats de transcription en temps réel
  eventHook('result', (event: any) => {
    console.log('🎤 Speech result:', event);
    if (event && event.results && event.results[0]) {
      const transcription = event.results[0].transcript;
      currentTranscriptRef.current = transcription;
      console.log('📝 Transcription partielle:', transcription);
    }
  });

  // Écoute la fin de reconnaissance (déclenché automatiquement quand l'utilisateur arrête de parler)
  eventHook('end', () => {
    console.log('🎤 Speech recognition ended');
    const finalTranscript = currentTranscriptRef.current;

    if (finalTranscript && finalTranscript.trim()) {
      console.log('✅ Transcription finale:', finalTranscript);
      setUserTranscript(finalTranscript);
      setIsListening(false);
      isListeningRef.current = false;
      setIsTranscribing(true);

      // Traiter la transcription
      if (currentQuestionRef.current) {
        const cq = currentQuestionRef.current;
        evaluateAnswer(cq.textId, cq.question, finalTranscript).finally(() => {
          setIsTranscribing(false);
          currentTranscriptRef.current = '';
        });
      } else {
        sendMessageToGPT(finalTranscript).finally(() => {
          setIsTranscribing(false);
          currentTranscriptRef.current = '';
        });
      }
    } else {
      console.log('⚠️ Pas de transcription');
      setIsListening(false);
      isListeningRef.current = false;
      setIsTranscribing(false);

      // Redémarrer l'écoute si la session est active
      if (isConnectedRef.current && !isPausedRef.current) {
        setTimeout(() => startListening(), 500);
      }
    }
  });

  // Écoute les erreurs
  eventHook('error', (event: any) => {
    console.error('🎤 Speech recognition error:', event);
    setError(event.message || 'Erreur de reconnaissance vocale');
    setIsListening(false);
    isListeningRef.current = false;
    setIsTranscribing(false);
  });

  // ═══ Build system prompt (updated for comprehension + grammar + pronunciation) ═══
  const buildSystemPrompt = useCallback((texts: UserText[]) => {
    const targetLang = languageNames[uiLang] || 'French';
    let filteredTexts = texts;
    if (selectedTextId) filteredTexts = texts.filter(t => t.id === selectedTextId);
    if (filteredTexts.length === 0) return "Tu es un tuteur d'arabe. L'étudiant n'a pas encore fourni de texte.";

    const textContent = filteredTexts[0].content;
    const textTitle = filteredTexts[0].title;

    // Injecter le vocabulaire connu si disponible
    const vocabBlock = vocabSummary ? `

## مُفْرَدَاتُ الطَّالِبِ المَعْرُوفَةُ (vocabulaire connu de l'apprenant) :
${vocabSummary}

⚠️ قَاعِدَةٌ مُهِمَّةٌ: اسْتَخْدِمْ أَقْصَى عَدَدٍ مِنْ هَذِهِ المُفْرَدَاتِ عِنْدَ التَّلْخِيصِ وَطَرْحِ الأَسْئِلَةِ وَالتَّصْحِيحِ، لِتَسْهِيلِ فَهْمِ الطَّالِبِ. إِذَا اسْتَخْدَمْتَ كَلِمَةً جَدِيدَةً لَيْسَتْ فِي القَائِمَةِ، اشْرَحْهَا بِاخْتِصَارٍ.` : '';

    return `أنت أستاذٌ لِلعَرَبِيَّةِ الفُصْحَى، لَطِيفٌ وَصَبُورٌ. تَتَحَدَّثُ فَقَطْ بِالعَرَبِيَّةِ الفُصْحَى مَعَ التَّشْكِيلِ الكَامِلِ.

النَّصُّ المَدْرُوسُ: "${textTitle}"
${textContent}

مُهِمَّتُكَ:
١. اِطْرَحْ أَسْئِلَةً عَنْ مَعْنَى النَّصِّ وَمُفْرَدَاتِهِ
٢. صَحِّحْ أَخْطَاءَ الفَهْمِ (المَعْنَى)
٣. صَحِّحْ أَخْطَاءَ النَّحْوِ وَالصَّرْفِ
٤. صَحِّحْ أَخْطَاءَ النُّطْقِ (بِنَاءً عَلَى كِتَابَةِ الطَّالِبِ)

القَوَاعِدُ:
- كُلُّ كَلِمَةٍ بِالتَّشْكِيلِ الكَامِلِ
- لِلمُثَنَّى: اسْتَخْدِمِ الصِّيغَةَ الصَّحِيحَةَ (تَسْكُنَانِ، تُرِيدَانِ، هُمَا)
- كُنْ لَطِيفًا فِي التَّصْحِيحِ
- لَا تَطْلُبْ نَصًّا أَوْ مَعْلُومَاتٍ إِضَافِيَّةً
${vocabBlock}

الطَّالِبُ قَدْ يُجِيبُ بِالـ${targetLang}.`;
  }, [uiLang, selectedTextId, vocabSummary]);

  // ═══ Generate 15-20 questions for a text using Edge Function ═══
  const generateQuestionsForText = useCallback(async (textId: string, title: string, content: string): Promise<string[]> => {
    const prompt = `أنت مُعلّم عربي مُتقَن. قَدِّم لِي قَائِمَةً مِنْ بَيْنِ ١٥ وَ ٢٠ سُؤَالًا عَنْ مَعْنَى النَّصِّ التالي.
كُلُّ سُؤَالٍ بِالْعَرَبِيَّةِ الْفُصْحَى مَعَ التَّشْكِيلِ الكَامِلِ.
اِجْعَلْ الأَسْئِلَةَ عَنْ:
- فَهْمِ المَعْنَى وَالأَفْكَارِ الرَّئِيسِيَّةِ
- شَرْحِ المُفْرَدَاتِ وَالتَّعْبِيرَاتِ
- تَحْلِيلِ العَلاقَاتِ بَيْنَ الأَفْكَارِ
- اسْتِخْلاصِ الدُّرُوسِ وَالعِبَرِ
${vocabSummary ? `\n## مُفْرَدَاتُ الطَّالِبِ المَعْرُوفَةُ:\n${vocabSummary}\n\n⚠️ اسْتَخْدِمْ هَذِهِ المُفْرَدَاتِ فِي الأَسْئِلَةِ.` : ''}

لا تُعطِ أي شُرُوحٍ. أَعِدْ فَقَطْ JSON array of strings.

العُنْوَان: "${title}"

${content}`;

    try {
      console.log('[TUTOR] invokeEdge tutor-chat-ai (generate questions)');
      const response = await invokeEdge<{ content?: string; message?: string }>('tutor-chat-ai', {
        messages: [
          { role: 'system', content: 'You are an assistant that returns clean JSON arrays when asked.' },
          { role: 'user', content: prompt }
        ],
        max_tokens: 1500,
        temperature: 0.3,
      });

      const txt = response.content || response.message || '';
      console.log('[TUTOR] ✅ Questions received (raw):', txt.substring(0, 100) + '...');

      try {
        const parsed = JSON.parse(txt);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed.map(String).filter(Boolean);
      } catch {
        const jsonMatch = txt.match(/\[([\s\S]*)\]/);
        if (jsonMatch) {
          try {
            const p2 = JSON.parse(jsonMatch[0]);
            if (Array.isArray(p2) && p2.length > 0) return p2.map(String).filter(Boolean);
          } catch {}
        }
      }
      const lines = txt.split(/\r?\n/).map((l: string) => l.replace(/^\d+[\.\)\-]\s*/, '').trim()).filter((l: string) => l.length > 5);
      if (lines.length >= 5) return lines;

      console.warn('[TUTOR] Failed to parse questions, using local fallback');
      return generateLocalQuestions(title, content);
    } catch (err) {
      console.error('[TUTOR] generateQuestions exception', err);
      return generateLocalQuestions(title, content);
    }
  }, [vocabSummary]);

  // Local fallback question generation
  const generateLocalQuestions = useCallback((title: string, content: string): string[] => {
    const snippets = content.replace(/\s+/g, ' ').split(/[\.\?\!\n]/).map(s => s.trim()).filter(Boolean);
    const first = snippets[0] || title || 'النَّصّ';
    const excerpt = first.length > 60 ? first.slice(0, 57) + '...' : first;
    return [
      `مَا مَوضُوعُ هَذَا النَّصِّ؟`,
      `مَنْ هُمَا الشَّخْصِيَّتَانِ الذَّانِ ذُكِرَتَا فِي النَّصِّ؟`,
      `أَيْنَ وَقَعَتِ الحَادِثَةُ المَذكُورَةُ؟`,
      `مَتَى حَدَثَ ذَلِكَ؟`,
      `كَيْفَ وَصَفَ المُؤَلِّفُ الحَالَةَ فِي النَّصِّ؟`,
      `لِمَاذَا يَعْتَقِدُ الكَاتِبُ أَنَّ هَذَا مُهِمٌّ؟`,
      `اذْكُرْ كَلِمَتَيْنِ مُفِيدَتَيْنِ مِنَ النَّصِّ وَاشْرَحْ مَعْنَاهُمَا.`,
      `مَا الفِعْلُ الرَّئِيسِيُّ فِي الجُمْلَةِ الأُولَى؟`,
      `هَلْ هُنَاكَ تَضَادٌّ أَو تَشْبِيهٌ؟ وَأَعْطِ مِثَالًا.`,
      `اذْكُرْ خُلاصَةً لِلفِقْرَةِ الأُولَى بِكَلِمَاتٍ قَلِيلَةٍ.`,
      `كَيْفَ تَأَثَّرَتِ الشَّخْصِيَّاتُ بِالأَحْدَاثِ؟`,
      `مَا الدَّرْسُ الأخْلاقيُّ الَّذِي يُسْتَخْرَجُ مِنَ النَّصِّ؟`,
      `هَلْ هُنَاكَ كَلِمَةٌ غَرِيبَةٌ؟ مَا دَوْرُهَا؟`,
      `اِخْتَرْ جُمْلَتَيْنِ وَاشْرَحْ العَلَاقَةَ بَيْنَهُمَا.`,
      `كَيْفَ تَفْهَمُ كَلِمَةَ "${excerpt}" فِي سِيَاقِ النَّصّ؟`,
      `هَلْ يُمْكِنُ تَلْخيصُ النَّصِّ فِي ثَلَاثِ جُمَلٍ؟`,
    ];
  }, []);

  // ═══ Prepare questions for a text and store in ref ═══
  const prepareQuestionsForText = useCallback(async (textId: string, title: string, content: string) => {
    if (questionsCacheRef.current[textId]?.length > 0) {
      console.log('[TUTOR] Questions already prepared for', textId, 'count=', questionsCacheRef.current[textId].length);
      return questionsCacheRef.current[textId].length;
    }
    console.log('[TUTOR] Preparing questions for text', textId);
    const list = await generateQuestionsForText(textId, title, content);
    if (list && list.length > 0) {
      questionsCacheRef.current[textId] = [...list];
      questionsMetaRef.current[textId] = { originalCount: list.length };
      setCacheVersion(v => v + 1);
      console.log('[TUTOR] Prepared questions for text', textId, 'count=', list.length);
      return list.length;
    }
    return 0;
  }, [generateQuestionsForText]);

  // ═══ Summarize the text using Edge Function ═══
  const summarizeText = useCallback(async (title: string, content: string): Promise<string> => {
    const systemPrompt = `أنت مُعلّمٌ عربيٌّ. لَخِّصْ النَّصَّ التالِيَ فِي ٣-٤ جُمَلٍ قَصِيرَةٍ بالعَرَبِيَّةِ الفُصْحَى مَعَ التَّشْكِيلِ الكَامِلِ. اِبْدَأْ بِـ "يَتَحَدَّثُ هَذَا النَّصُّ عَنْ".
${vocabSummary ? `\n## مُفْرَدَاتُ الطَّالِبِ المَعْرُوفَةُ:\n${vocabSummary}\n\n⚠️ اسْتَخْدِمْ هَذِهِ المُفْرَدَاتِ فِي التَّلْخِيصِ.` : ''}`;

    try {
      console.log('[TUTOR] invokeEdge tutor-chat-ai (summarize)');
      const response = await invokeEdge<{ content?: string; message?: string }>('tutor-chat-ai', {
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `العُنْوَان: "${title}"\n\n${content}` }
        ],
        max_tokens: 300,
        temperature: 0.2,
      });

      const summary = response.content || response.message || '';
      console.log('[TUTOR] ✅ Summary received:', summary.substring(0, 100) + '...');
      if (summary.trim().length > 10) return summary.trim();
    } catch (err) {
      console.error('[TUTOR] summarizeText error', err);
    }
    return `هَذَا النَّصُّ بِعُنْوَانِ "${title}". لِنَبْدَأْ بِالأَسْئِلَةِ!`;
  }, [vocabSummary]);

  // ═══ Send a message to GPT-4o-mini via Edge Function (general fallback) ═══
  const sendMessageToGPT = useCallback(async (userMessage: string, textsParam?: UserText[]) => {
    try {
      setIsTranscribing(true);
      let filteredTexts = textsParam ?? userTexts;
      if (selectedTextId) filteredTexts = (textsParam ?? userTexts).filter(t => t.id === selectedTextId);
      const newHistory = [...conversationHistory, { role: 'user', content: userMessage }];
      const systemPrompt = buildSystemPrompt(filteredTexts);

      console.log('[TUTOR] invokeEdge tutor-chat-ai (conversation)');
      const response = await invokeEdge<{ content?: string; message?: string }>('tutor-chat-ai', {
        messages: [{ role: 'system', content: systemPrompt }, ...newHistory],
        max_tokens: 200,
        temperature: 0.1,
      });

      const assistantMessage = response.content || response.message || '';
      console.log('[TUTOR] ✅ Conversation response:', assistantMessage.substring(0, 100) + '...');

      if (!assistantMessage) {
        console.error('[TUTOR] Empty response from Edge Function');
        setError('Erreur de communication avec le tuteur');
        setIsTranscribing(false);
        return;
      }

      setConversationHistory([...newHistory, { role: 'assistant', content: assistantMessage }]);
      const userMsg: ChatMessage = { id: `user_${Date.now()}`, role: 'user', text: userMessage, timestamp: Date.now() };
      const assistantMsg: ChatMessage = { id: `assistant_${Date.now()}`, role: 'assistant', text: assistantMessage, timestamp: Date.now() };
      setMessages(prev => [...prev, userMsg, assistantMsg]);

      await speakText(assistantMessage);
      setIsTranscribing(false);

      if (isConnectedRef.current && !isPausedRef.current) {
        setTimeout(() => startListening(), 500);
      }
    } catch (error: any) {
      console.error('[TUTOR] Error in sendMessageToGPT:', error);
      setError(error.message);
      setIsTranscribing(false);
    }
  }, [conversationHistory, buildSystemPrompt, userTexts, speakText]);

  // ═══ Start speech recognition (LOCAL - no server) ═══
  const startListening = useCallback(async () => {
    if (!ExpoSpeechRecognitionModule) {
      console.error('❌ expo-speech-recognition not available (requires native rebuild)');
      setError('Reconnaissance vocale non disponible. Rebuild nécessaire.');
      return;
    }

    try {
      console.log('🎤 Starting speech recognition (local)...');

      // Vérifier et demander la permission
      const permissionResult = await ExpoSpeechRecognitionModule.getPermissionsAsync();
      console.log('🎤 Permission status:', permissionResult);

      if (!permissionResult.granted) {
        if (permissionResult.canAskAgain) {
          const requestResult = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
          if (!requestResult.granted) {
            console.error('❌ Microphone permission denied');
            setError('Permission microphone refusée. Allez dans Réglages → Fisabil → Microphone.');
            return;
          }
        } else {
          console.error('❌ Cannot ask for permission again');
          setError('Permission microphone refusée. Allez dans Réglages → Fisabil → Microphone.');
          return;
        }
      }

      // Réinitialiser la transcription
      currentTranscriptRef.current = '';
      setTranscript('');
      setError(null);

      // Démarrer la reconnaissance vocale en arabe
      console.log('🎤 Starting recognition with lang: ar-SA');
      await ExpoSpeechRecognitionModule.start({
        lang: 'ar-SA',
        interimResults: true,
        continuous: false, // S'arrête automatiquement quand l'utilisateur arrête de parler
        maxAlternatives: 1,
      });

      isListeningRef.current = true;
      setIsListening(true);
      console.log('✅ Speech recognition started (local)');
    } catch (error: any) {
      console.error('❌ Error starting speech recognition:', error);
      setError('Impossible de démarrer la reconnaissance vocale: ' + error.message);
      setIsListening(false);
      isListeningRef.current = false;
    }
  }, []);

  // ═══ Stop speech recognition (LOCAL) ═══
  const stopListening = useCallback(async () => {
    if (!ExpoSpeechRecognitionModule) {
      console.log('⚠️ Speech recognition module not available');
      return;
    }

    try {
      console.log('🎤 Stopping speech recognition...');
      await ExpoSpeechRecognitionModule.stop();
      isListeningRef.current = false;
      setIsListening(false);
      console.log('✅ Speech recognition stopped');

      // Le traitement de la transcription se fait dans l'event listener 'end'
    } catch (error: any) {
      console.error('❌ Error stopping speech recognition:', error);
      setIsListening(false);
      isListeningRef.current = false;
    }
  }, []);

  // ═══ Ask the next prepared question (reads from REF, never stale) ═══
  const askPreparedQuestion = useCallback(async (textId: string) => {
    const pool = questionsCacheRef.current[textId] ?? [];
    const count = questionCountRef.current;
    console.log('[TUTOR] askPreparedQuestion called for', textId, 'poolLen=', pool.length, 'questionCount=', count);

    if (pool.length === 0) {
      if (count >= 10) {
        const endMsg = `أَحْسَنْتَ! لَقَدْ أَجَبْتَ عَلَى ${intToArabicIndic(count)} أَسْئِلَةٍ. بَارَكَ ٱللّٰهُ فِيكَ!`;
        const msg: ChatMessage = { id: `assistant_end_${Date.now()}`, role: 'assistant', text: endMsg, timestamp: Date.now() };
        setMessages(prev => [...prev, msg]);
        await speakText(endMsg);
        return;
      }
      console.warn('[TUTOR] Pool empty but only', count, 'questions asked. GPT fallback.');
      await sendMessageToGPT('اِطْرَحْ سُؤَالًا آخَرَ عَنِ النَّصِّ.');
      return;
    }

    const question = pool.shift()!;
    questionsCacheRef.current[textId] = pool;
    setCacheVersion(v => v + 1);

    const total = questionsMetaRef.current[textId]?.originalCount ?? 20;
    const askedNumber = count + 1;
    currentQuestionRef.current = { textId, question, askedNumber, total };

    const assistantMsgText = `السُّؤَالُ ${intToArabicIndic(askedNumber)}/${intToArabicIndic(total)}: ${question}`;
    const assistantMsg: ChatMessage = { id: `assistant_q_${Date.now()}`, role: 'assistant', text: assistantMsgText, timestamp: Date.now() };
    setMessages(prev => [...prev, assistantMsg]);
    setQuestionCount(prev => prev + 1);

    // Note: Prefetch not needed with local TTS (instant playback)

    await speakText(assistantMsgText);

    // Auto-start listening after asking
    if (isConnectedRef.current && !isPausedRef.current) {
      console.log('🎤 Auto-starting listening after question...');
      setTimeout(() => startListening(), 300);
    }
  }, [intToArabicIndic, speakText, sendMessageToGPT, startListening]);

  // ═══ Evaluate student's answer via Edge Function: correct → auto-chain next ═══
  const evaluateAnswer = useCallback(async (textId: string, question: string, studentAnswer: string) => {
    try {
      setIsTranscribing(true);
      const textData = userTexts.find(t => t.id === textId);
      const textContext = textData ? `\nالنَّصُّ: "${textData.title}"\n${textData.content.substring(0, 500)}` : '';

      const correctionPrompt = `صَحِّحْ إِجَابَةَ الطَّالِبِ بِإِيجَازٍ (جُمْلَتَيْنِ كَحَدٍّ أَقْصَى) مَعَ التَّشْكِيلِ.

السُّؤَالُ: ${question}
الإِجَابَةُ: "${studentAnswer}"${textContext}
${vocabSummary ? `\n## مُفْرَدَاتُ الطَّالِبِ المَعْرُوفَةُ:\n${vocabSummary}\n\n⚠️ اسْتَخْدِمْ هَذِهِ المُفْرَدَاتِ فِي التَّصْحِيحِ.` : ''}

إِذَا صَحِيحَة: "أَحْسَنْتَ!" + مُلاحَظَة قَصِيرَة.
إِذَا خَاطِئَة: صَحِّحْ بِلُطْفٍ + الإِجَابَة الصَّحِيحَة.`;

      console.log('[TUTOR] invokeEdge tutor-chat-ai (evaluate answer)');
      const response = await invokeEdge<{ content?: string; message?: string }>('tutor-chat-ai', {
        messages: [{ role: 'system', content: correctionPrompt }],
        max_tokens: 150,
        temperature: 0.1,
      });

      let correction = response.content || response.message || '';
      console.log('[TUTOR] ✅ Correction received:', correction.substring(0, 100) + '...');

      if (!correction) {
        correction = 'لِنَنْتَقِلْ إِلَى السُّؤَالِ التَّالِي.';
      }

      const userMsg: ChatMessage = { id: `user_${Date.now()}`, role: 'user', text: studentAnswer, timestamp: Date.now() };
      const assistantMsg: ChatMessage = { id: `assistant_c_${Date.now()}`, role: 'assistant', text: correction, timestamp: Date.now() };
      setMessages(prev => [...prev, userMsg, assistantMsg]);

      await speakText(correction);
      setIsTranscribing(false);
      currentQuestionRef.current = null;

      // ═══ AUTO-CHAIN: immediately ask the next question ═══
      const currentCount = questionCountRef.current;
      const remaining = questionsCacheRef.current[textId]?.length ?? 0;

      if (remaining > 0 || currentCount < 10) {
        // No delay — next question audio is already pre-cached
        if (isConnectedRef.current && !isPausedRef.current) {
          await askPreparedQuestion(textId);
        }
      } else {
        const endMsg = `أَحْسَنْتَ! أَنْهَيْتَ جَمِيعَ الأَسْئِلَةِ. بَارَكَ ٱللّٰهُ فِيكَ!`;
        const endAssistant: ChatMessage = { id: `assistant_final_${Date.now()}`, role: 'assistant', text: endMsg, timestamp: Date.now() };
        setMessages(prev => [...prev, endAssistant]);
        await speakText(endMsg);
      }
    } catch (err) {
      console.error('[TUTOR] evaluateAnswer error', err);
      setIsTranscribing(false);
    }
  }, [userTexts, speakText, askPreparedQuestion, vocabSummary]);

  // Load texts on mount
  useEffect(() => { loadUserTexts(); }, [loadUserTexts]);

  // ═══ CONNECT: the main automated flow (optimized) ═══
  // welcome → (summarize + prepare questions in parallel) → ask first question
  const connect = useCallback(async () => {
    try {
      console.log('🔌 Connecting chat tutor...');
      setError(null);
      const loadedTexts = await loadUserTexts();
      console.log(`✅ Loaded ${loadedTexts.length} texts`);

      let filteredTexts = loadedTexts;
      if (selectedTextId) {
        filteredTexts = loadedTexts.filter(t => t.id === selectedTextId);
        console.log(`🔍 Filtered to: ${filteredTexts.length} text(s)`);
      }
      if (filteredTexts.length === 0) { setError('Aucun texte sélectionné'); return; }

      setIsConnected(true);
      isConnectedRef.current = true;
      setQuestionCount(0);
      questionCountRef.current = 0;
      setConversationHistory([]);
      currentQuestionRef.current = null;

      const text = filteredTexts[0];

      // Step 1: Welcome — while speaking, start summarizing + preparing questions in parallel
      const welcomeText = `السَّلَامُ عَلَيْكُمْ! سَنَدْرُسُ مَعًا نَصَّ "${text.title}".`;
      const welcomeMsg: ChatMessage = { id: `assistant_welcome_${Date.now()}`, role: 'assistant', text: welcomeText, timestamp: Date.now() };
      setMessages([welcomeMsg]);

      // Launch GPT calls in background WHILE the welcome is being spoken
      const summaryPromise = summarizeText(text.title, text.content);
      const questionsPromise = prepareQuestionsForText(text.id, text.title, text.content);

      await speakText(welcomeText);

      // Step 2: Summary — questions are preparing in parallel
      console.log('[TUTOR] Getting summary (started in background)...');
      const summary = await summaryPromise;
      const summaryMsg: ChatMessage = { id: `assistant_summary_${Date.now()}`, role: 'assistant', text: summary, timestamp: Date.now() };
      setMessages(prev => [...prev, summaryMsg]);

      // Speak summary while questions finish preparing
      await speakText(summary);

      // Wait for questions to be ready (likely already done)
      const count = await questionsPromise;
      console.log('[TUTOR] Questions ready:', count);

      // Step 3: Directly ask the first question (no transition message)
      await askPreparedQuestion(text.id);

    } catch (error: any) { console.error('❌ Error connecting:', error); setError(error.message); }
  }, [loadUserTexts, selectedTextId, speakText, summarizeText, prepareQuestionsForText, askPreparedQuestion]);

  // ═══ Disconnect ═══
  const disconnect = useCallback(() => {
    console.log('🔌 Disconnecting...');

    // Arrêter la reconnaissance vocale locale si active
    if (ExpoSpeechRecognitionModule && isListeningRef.current) {
      ExpoSpeechRecognitionModule.stop().catch((err: any) =>
        console.log('⚠️ Error stopping speech recognition:', err)
      );
    }

    // Arrêter le TTS local
    Speech.stop();

    setIsConnected(false);
    isConnectedRef.current = false;
    setIsListening(false);
    setIsSpeaking(false);
    setIsTranscribing(false);
    isListeningRef.current = false;
    currentQuestionRef.current = null;
    currentTranscriptRef.current = '';
  }, []);

  useEffect(() => { return () => { disconnect(); }; }, [disconnect]);

  // ═══ Helper: get prepared question count ═══
  const getPreparedCount = useCallback((textId?: string) => {
    if (!textId) return Object.keys(questionsCacheRef.current).reduce((acc, k) => acc + (questionsCacheRef.current[k]?.length ?? 0), 0);
    return questionsCacheRef.current[textId]?.length ?? 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheVersion]);

  // ═══ Force prepare questions (manual UI action) ═══
  const prepareNow = useCallback(async (textId: string) => {
    try {
      console.log('[TUTOR] prepareNow requested for', textId);
      const existing = questionsCacheRef.current[textId];
      if (existing && existing.length > 0) { console.log('[TUTOR] prepareNow: already prepared, count=', existing.length); return existing.length; }
      let text = userTexts.find(t => t.id === textId);
      if (!text) { const loaded = await loadUserTexts(); text = loaded.find(t => t.id === textId); }
      if (!text) { console.warn('[TUTOR] prepareNow: text not found', textId); return 0; }
      return await prepareQuestionsForText(textId, text.title, text.content);
    } catch (err) { console.error('[TUTOR] prepareNow error', err); return 0; }
  }, [userTexts, loadUserTexts, prepareQuestionsForText]);

  return {
    isConnected,
    isListening,
    isTranscribing,
    isSpeaking,
    isPaused,
    transcript,
    userTranscript,
    messages,
    userTexts,
    error,
    questionCount,
    connect,
    disconnect,
    startListening,
    stopListening,
    loadUserTexts,
    togglePause: () => { setIsPaused(prev => !prev); isPausedRef.current = !isPausedRef.current; },
    clearMessages: () => setMessages([]),
    sendTextMessage: sendMessageToGPT,
    startDialogue: askPreparedQuestion,
    preparedCount: getPreparedCount,
    prepareNow,
    interrupt: () => {
      Speech.stop(); // Arrêter TTS local
      if (ExpoSpeechRecognitionModule && isListeningRef.current) {
        ExpoSpeechRecognitionModule.stop().catch((err: any) =>
          console.log('⚠️ Error stopping speech:', err)
        );
      }
    },
  };
};
