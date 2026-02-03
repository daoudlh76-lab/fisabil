/**
 * Hook pour le tuteur en temps réel avec l'API Realtime d'OpenAI
 * Mode conversation vocale avec enregistrement audio + Whisper
 * Utilise expo-av pour capturer la voix de l'utilisateur
 * et expo-speech pour lire les réponses du tuteur
 */

import { supabase } from "@/src/lib/supabase";
import { useCallback, useEffect, useRef, useState } from "react";
import { useVoicePreference, getOpenAIVoiceForGender } from "@/contexts/voice-preference-context";
import * as Speech from 'expo-speech';
import { Audio } from 'expo-av';

const OPENAI_API_KEY = process.env.EXPO_PUBLIC_OPENAI_API_KEY || '';

// Mapping des langues
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
  vocabulary?: Array<{
    word: string;
    translation?: string;
    root?: string;
  }>;
  userVocabulary?: Array<{
    word: string;
    translation: string;
  }>;
}

interface RealtimeMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: number;
}

export function useRealtimeTutor(uiLang: string = 'fr') {
  const [isConnected, setIsConnected] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [transcript, setTranscript] = useState<string>('');
  const [userTranscript, setUserTranscript] = useState<string>('');
  const [messages, setMessages] = useState<RealtimeMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [userTexts, setUserTexts] = useState<UserText[]>([]);

  // Préférence de voix (homme/femme)
  const { gender } = useVoicePreference();

  const wsRef = useRef<WebSocket | null>(null);
  const currentResponseRef = useRef<string>('');
  const isListeningRef = useRef(false);
  const shouldRestartListeningRef = useRef(false);
  const isPausedRef = useRef(false);
  const isConnectedRef = useRef(false);

  // Refs pour l'enregistrement audio (expo-av)
  const recordingRef = useRef<Audio.Recording | null>(null);
  const listeningTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Ref pour éviter les doublons de messages
  const processedItemsRef = useRef<Set<string>>(new Set());

  // Refs pour les fonctions stables (éviter les dépendances circulaires)
  const startContinuousListeningRef = useRef<() => Promise<void>>(() => Promise.resolve());
  const speakTextRef = useRef<(text: string) => Promise<void>>(() => Promise.resolve());
  const sendUserSpeechRef = useRef<(text: string) => void>(() => {});

  // Fonction pour charger les textes de l'utilisateur
  const loadUserTexts = useCallback(async () => {
    try {
      console.log('🔍 [TUTOR] Début loadUserTexts...');
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user?.id;
      console.log('🔍 [TUTOR] User ID:', userId);

      if (!userId) {
        console.log('⚠️ [TUTOR] Pas d\'utilisateur connecté');
        return [];
      }

      // Charger TOUS les scans ET TOUT le vocabulaire (pas de limite)
      console.log('🔍 [TUTOR] Requête Supabase pour scans et vocabulary...');
      console.log('🔍 [TUTOR] userId utilisé pour la requête:', userId);

      const [{ data: scans, error: scansError }, { data: vocab, error: vocabError }] = await Promise.all([
        supabase
          .from('scans')
          .select('id, title, content, vocabulary')
          .eq('user_id', userId)
          .order('created_at', { ascending: false }),
        supabase
          .from('vocabulary')
          .select('word, translation')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
      ]);

      if (scansError) {
        console.error('❌ [TUTOR] Erreur chargement scans:', scansError);
        console.error('❌ [TUTOR] Détails erreur scans:', JSON.stringify(scansError));
      }
      if (vocabError) {
        console.error('❌ [TUTOR] Erreur chargement vocabulary:', vocabError);
        console.error('❌ [TUTOR] Détails erreur vocabulary:', JSON.stringify(vocabError));
      }

      console.log('📚 [TUTOR] Scans chargés:', scans?.length || 0);
      console.log('📖 [TUTOR] Vocabulary chargé:', vocab?.length || 0);
      console.log('📊 [TUTOR] Type de scans:', typeof scans, Array.isArray(scans));
      console.log('📊 [TUTOR] Valeur de scans:', scans);

      if (scans && scans.length > 0) {
        console.log('✅ [TUTOR] Premier scan:', scans[0].title);
        console.log('✅ [TUTOR] Premier scan ID:', scans[0].id);
        console.log('✅ [TUTOR] Premier scan content length:', scans[0].content?.length || 0);
      } else {
        console.log('⚠️ [TUTOR] Aucun scan trouvé dans la base de données');
      }

      // Stocker TOUT le vocabulaire dans userTexts
      let loadedTexts: any[] = [];

      // Normaliser les résultats (null -> [])
      const normalizedScans = scans || [];
      const normalizedVocab = vocab || [];

      console.log('📊 [TUTOR] Scans normalisés:', normalizedScans.length);
      console.log('📊 [TUTOR] Vocab normalisé:', normalizedVocab.length);

      if (normalizedScans.length > 0) {
        if (normalizedVocab.length > 0) {
          // Cas 1: On a des scans ET du vocabulaire
          const textsWithVocab = normalizedScans.map(scan => ({
            ...scan,
            userVocabulary: normalizedVocab
          }));
          setUserTexts(textsWithVocab);
          loadedTexts = textsWithVocab;
          console.log('✅ [TUTOR] Textes avec vocabulaire combinés:', textsWithVocab.length);
        } else {
          // Cas 2: On a des scans SANS vocabulaire
          setUserTexts(normalizedScans);
          loadedTexts = normalizedScans;
          console.log('✅ [TUTOR] Textes sans vocabulaire:', normalizedScans.length);
        }
      } else {
        // Cas 3: Aucun scan - mettre un tableau vide
        setUserTexts([]);
        loadedTexts = [];
        console.log('⚠️ [TUTOR] Aucun texte à charger - state mis à []');
      }

      console.log('✅ [TUTOR] loadUserTexts terminé, retour de', loadedTexts.length, 'textes');
      return loadedTexts;
    } catch (e) {
      console.error('❌ Erreur chargement textes:', e);
      return [];
    }
  }, []);

  // Charger les textes au montage
  useEffect(() => {
    console.log('🔄 Chargement initial des textes du tuteur...');
    loadUserTexts();
  }, [loadUserTexts]);

  // Construire les instructions système
  const buildSystemInstructions = useCallback((textsToUse?: typeof userTexts) => {
    const targetLang = languageNames[uiLang] || 'French';
    const texts = textsToUse || userTexts;

    // Extraire TOUT le vocabulaire de TOUS les textes scannés
    const allVocabulary: string[] = [];
    const userVocabList: Array<{word: string, translation: string}> = [];

    texts.forEach(text => {
      // Vocabulaire extrait des textes scannés
      if (text.vocabulary && Array.isArray(text.vocabulary)) {
        text.vocabulary.forEach((item: any) => {
          if (item.word) allVocabulary.push(item.word);
        });
      }
      // Vocabulaire sauvegardé par l'utilisateur
      if ((text as any).userVocabulary) {
        userVocabList.push(...(text as any).userVocabulary);
      }
    });

    // Utiliser TOUT le vocabulaire, pas de limite
    const textsContext = texts.length > 0
      ? texts.map((t, i) => `--- TEXT ${i + 1}: "${t.title}" ---\n${t.content.slice(0, 600)}`).join('\n\n')
      : 'No texts available yet.';

    // Inclure TOUT le vocabulaire disponible
    const vocabularyContext = allVocabulary.length > 0
      ? `\n\n## VOCABULARY FROM ALL STUDENT'S TEXTS (${allVocabulary.length} words - USE THESE WORDS PRIMARILY):\n${allVocabulary.join(', ')}`
      : '';

    // Inclure TOUT le vocabulaire sauvegardé
    const userVocabContext = userVocabList.length > 0
      ? `\n\n## STUDENT'S SAVED VOCABULARY (${userVocabList.length} words - PRIORITY - USE THESE FIRST):\n${userVocabList.map(v => `${v.word} (${v.translation})`).join(', ')}`
      : '';

    return `You are an expert Arabic language teacher (معلم اللغة العربية). You speak with a clear, warm voice.

## YOUR BEHAVIOR:
1. **ALWAYS RESPOND IN ARABIC** - Speak naturally in Arabic
2. **EXCEPTION**: If the student says "je ne comprends pas", "I don't understand", or similar, briefly explain in ${targetLang}, then return to Arabic
3. **BE A REAL TEACHER**: You MUST actively ASK QUESTIONS. Don't wait for the student - take initiative!
4. **IMMEDIATELY START TESTING**: After greeting, IMMEDIATELY ask a question about their vocabulary

## YOUR TEACHING METHOD - CRITICAL RULES:
1. **ONLY USE STUDENT'S KNOWN VOCABULARY**: You MUST use ONLY words from the student's saved vocabulary and scanned texts listed below
2. **NEVER use words the student hasn't seen**: If a word is not in their vocabulary list, DO NOT use it
3. **ASK QUESTIONS ABOUT THEIR TEXTS**: Base ALL your questions on the content they have studied
4. **BUILD ON WHAT THEY KNOW**: Use ONLY words they've already seen in their texts
5. **TEST THEIR KNOWLEDGE**: Ask about meanings, grammar, or usage of words from THEIR vocabulary
6. **CORRECT ALL ERRORS** the student makes in Arabic, using ONLY their known vocabulary to explain
7. **ENCOURAGE**: Always be positive and supportive
8. **BE PROACTIVE**: After EVERY student response, ask a NEW question. Never just acknowledge - always follow up with a question!

## ALL STUDENT'S SCANNED TEXTS:
${textsContext}${vocabularyContext}${userVocabContext}

## CRITICAL - YOUR QUESTIONS MUST:
- Use ONLY vocabulary from the lists above
- Ask about meanings of words they've scanned
- Test their understanding of THEIR specific texts
- Check if they remember words from THEIR texts
- Quiz them on grammar patterns they've seen
- Ask them to use words from THEIR vocabulary in sentences
- Keep responses SHORT (1-2 sentences, under 30 words)
- Be direct and conversational
- ALWAYS end with a question mark (؟)

## EXAMPLES OF GOOD QUESTIONS (using student's vocabulary):
- "ما معنى كلمة [word from their vocab]؟"
- "هل تتذكر هذه الكلمة من النص؟"
- "استخدم كلمة [their word] في جملة"

## CONVERSATION FLOW:
1. FIRST TIME ONLY: Full Islamic greeting "السلام عليكم. كيف حالك؟" + ask first question
2. After student answers: Brief praise (2-3 words) + IMMEDIATELY ask next question
3. Never end a response without asking a question
4. If student is correct: Brief praise (2-3 words) + new question
5. If student is wrong: Brief correction + ask simpler question about same word

Start with: "السلام عليكم. كيف حالك؟ ما معنى [pick a word from their vocabulary]؟"`;
  }, [userTexts, uiLang]);

  // Fonction pour détecter si un texte contient de l'arabe
  const isArabicText = (text: string): boolean => {
    const arabicChars = text.match(/[\u0600-\u06FF]/g)?.length || 0;
    const totalChars = text.replace(/\s/g, '').length;
    return totalChars > 0 && (arabicChars / totalChars) > 0.3;
  };

  // Transcrire l'audio avec l'API Whisper d'OpenAI (avec timeout)
  const transcribeWithWhisper = useCallback(async (audioUri: string): Promise<string | null> => {
    try {
      if (!OPENAI_API_KEY) {
        console.error("❌ OpenAI API key not configured");
        return null;
      }

      // Créer un FormData avec le fichier audio
      const formData = new FormData();

      // Créer un blob à partir de l'URI
      const audioBlob = {
        uri: audioUri,
        type: 'audio/m4a',
        name: 'audio.m4a',
      };

      formData.append('file', audioBlob as any);
      formData.append('model', 'whisper-1');
      formData.append('language', 'ar'); // Priorité à l'arabe
      formData.append('temperature', '0'); // Plus précis et déterministe
      // Prompt contextuel plus riche pour améliorer la reconnaissance
      formData.append('prompt', 'بسم الله الرحمن الرحيم، السلام عليكم، كيف حالك، أنا أتعلم اللغة العربية');

      console.log("📤 Sending audio to Whisper API...");
      const startTime = Date.now();

      // Timeout de 15 secondes pour Whisper (plus de temps pour meilleure reconnaissance)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);

      try {
        const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${OPENAI_API_KEY}`,
          },
          body: formData,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorText = await response.text();
          console.error("❌ Whisper API error:", response.status, errorText);
          return null;
        }

        const result = await response.json();
        const elapsed = Date.now() - startTime;
        console.log(`✅ Whisper transcription (${elapsed}ms):`, result.text);

        return result.text || null;
      } catch (fetchErr: any) {
        clearTimeout(timeoutId);
        if (fetchErr.name === 'AbortError') {
          console.error("❌ Whisper timeout (>15s)");
          return null;
        }
        throw fetchErr;
      }
    } catch (err) {
      console.error("❌ Whisper transcription error:", err);
      return null;
    }
  }, []);

  // Lire le texte avec TTS
  const speakText = useCallback((text: string): Promise<void> => {
    return new Promise((resolve) => {
      console.log('🔊 TTS starting:', text.substring(0, 50) + '...');
      setIsSpeaking(true);

      const lang = isArabicText(text) ? 'ar-SA' :
        uiLang === 'fr' ? 'fr-FR' :
        uiLang === 'de' ? 'de-DE' :
        uiLang === 'es' ? 'es-ES' :
        uiLang === 'ru' ? 'ru-RU' : 'en-US';

      // Voix féminine: pitch plus élevé (1.2), voix masculine: pitch plus bas (0.8)
      const pitch = gender === 'female' ? 1.2 : 0.8;

      Speech.speak(text, {
        language: lang,
        rate: 0.9,
        pitch: pitch,
        onStart: () => {
          console.log('🔊 TTS onStart');
        },
        onDone: () => {
          console.log('🔊 TTS onDone - will restart listening');
          setIsSpeaking(false);
          resolve();
        },
        onError: (error) => {
          console.error('🔊 TTS onError:', error);
          setIsSpeaking(false);
          resolve();
        },
      });
    });
  }, [uiLang, gender]);

  // Mettre à jour la ref speakText
  useEffect(() => {
    speakTextRef.current = speakText;
  }, [speakText]);

  // Arrêter l'enregistrement et transcrire
  const stopListening = useCallback(async () => {
    console.log('🎤 stopListening called');

    if (listeningTimeoutRef.current) {
      clearTimeout(listeningTimeoutRef.current);
      listeningTimeoutRef.current = null;
    }

    if (!recordingRef.current) {
      console.log('🎤 No recording to stop');
      isListeningRef.current = false;
      setIsListening(false);
      return;
    }

    try {
      console.log('🎤 Stopping recording...');
      await recordingRef.current.stopAndUnloadAsync();
      const uri = recordingRef.current.getURI();
      recordingRef.current = null;

      isListeningRef.current = false;
      setIsListening(false);

      if (!uri) {
        console.error('❌ No audio file recorded');
        return;
      }

      console.log('🎤 Recording stopped, URI:', uri);

      // Transcrire l'audio
      setIsTranscribing(true);
      setUserTranscript('Transcription en cours...');

      const transcribedText = await transcribeWithWhisper(uri);

      setIsTranscribing(false);

      if (transcribedText && transcribedText.trim()) {
        console.log('📝 Transcription:', transcribedText);
        setUserTranscript(transcribedText);

        // Envoyer au tuteur
        sendUserSpeechRef.current(transcribedText);
      } else {
        console.log('❌ Transcription empty or failed');
        setUserTranscript('');
      }
    } catch (err) {
      console.error('❌ Error stopping recording:', err);
      isListeningRef.current = false;
      setIsListening(false);
      setIsTranscribing(false);
    }
  }, [transcribeWithWhisper]);

  // Démarrer l'enregistrement audio
  const startContinuousListening = useCallback(async () => {
    console.log('🎤 startContinuousListening called');
    console.log('🎤 State check:', {
      isListening: isListeningRef.current,
      isPaused: isPausedRef.current,
      isConnected: isConnectedRef.current,
      shouldRestart: shouldRestartListeningRef.current,
    });

    if (isListeningRef.current) {
      console.log('🎤 Cannot start: already listening');
      return;
    }

    if (isPausedRef.current) {
      console.log('🎤 Cannot start: paused');
      return;
    }

    if (!isConnectedRef.current) {
      console.log('🎤 Cannot start: not connected');
      return;
    }

    try {
      console.log('🎤 Requesting audio permissions...');
      const { status } = await Audio.requestPermissionsAsync();

      if (status !== 'granted') {
        console.error('❌ Audio permission denied');
        setError('Permission micro refusée');
        return;
      }

      console.log('🎤 Configuring audio mode...');
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true, // Réduit autres sons pendant enregistrement
        playThroughEarpieceAndroid: false,
      });

      console.log('🎤 Creating recording...');
      const recording = new Audio.Recording();
      recordingRef.current = recording;

      // Configuration audio optimisée pour la voix arabe
      await recording.prepareToRecordAsync({
        android: {
          extension: '.m4a',
          outputFormat: Audio.AndroidOutputFormat.MPEG_4,
          audioEncoder: Audio.AndroidAudioEncoder.AAC,
          sampleRate: 48000, // Meilleur pour la voix
          numberOfChannels: 1, // Mono pour meilleure qualité vocale
          bitRate: 128000, // Qualité élevée pour meilleure reconnaissance
        },
        ios: {
          extension: '.m4a',
          outputFormat: Audio.IOSOutputFormat.MPEG4AAC,
          audioQuality: Audio.IOSAudioQuality.MAX,
          sampleRate: 48000,
          numberOfChannels: 1,
          bitRate: 128000,
          linearPCMBitDepth: 16,
          linearPCMIsBigEndian: false,
          linearPCMIsFloat: false,
        },
        web: {
          mimeType: 'audio/webm',
          bitsPerSecond: 128000,
        },
      });
      await recording.startAsync();

      isListeningRef.current = true;
      setIsListening(true);
      setUserTranscript('');

      console.log('🎤 Recording started successfully');

      // Arrêter automatiquement après 5 secondes
      if (listeningTimeoutRef.current) {
        clearTimeout(listeningTimeoutRef.current);
      }

      listeningTimeoutRef.current = setTimeout(async () => {
        console.log('⏱️ Auto-stopping recording after timeout');
        await stopListening();
      }, 8000); // Augmenté à 8 secondes pour laisser plus de temps de parole

    } catch (err) {
      console.error('❌ Error starting recording:', err);
      isListeningRef.current = false;
      setIsListening(false);
      setError('Erreur démarrage enregistrement');
    }
  }, [stopListening]);

  // Mettre à jour la ref startContinuousListening
  useEffect(() => {
    startContinuousListeningRef.current = startContinuousListening;
  }, [startContinuousListening]);

  // Envoyer ce que l'utilisateur a dit au WebSocket
  const sendUserSpeech = useCallback((text: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN || !text.trim()) {
      console.log('❌ Cannot send user speech: WebSocket not ready or empty text');
      return;
    }

    console.log('📤 Sending user speech to tutor:', text);

    // Ajouter le message utilisateur
    const msgId = `user_${Date.now()}`;
    if (!processedItemsRef.current.has(msgId)) {
      processedItemsRef.current.add(msgId);
      const userMsg: RealtimeMessage = {
        id: msgId,
        role: 'user',
        text: text.trim(),
        timestamp: Date.now(),
      };
      setMessages(prev => [...prev, userMsg]);
    }

    // Envoyer au WebSocket
    wsRef.current.send(JSON.stringify({
      type: 'conversation.item.create',
      item: {
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text: text.trim() }],
      },
    }));

    // Demander une réponse TRÈS courte (conversation naturelle)
    wsRef.current.send(JSON.stringify({
      type: 'response.create',
      response: {
        modalities: ['text'],
        instructions: 'MAXIMUM 15 words. ONE sentence. Talk like face-to-face conversation.',
        max_output_tokens: 50, // Limiter strictement la longueur
      },
    }));
  }, []);

  // Mettre à jour la ref sendUserSpeech
  useEffect(() => {
    sendUserSpeechRef.current = sendUserSpeech;
  }, [sendUserSpeech]);

  // Gérer les événements Realtime
  const handleRealtimeEvent = useCallback((event: any) => {
    switch (event.type) {
      case 'session.created':
        console.log('📡 Session created');
        break;

      case 'session.updated':
        console.log('📡 Session updated');
        break;

      case 'response.text.delta':
        // Accumuler la réponse texte
        currentResponseRef.current += event.delta || '';
        setTranscript(currentResponseRef.current);
        break;

      case 'response.text.done':
        // Texte complet reçu
        break;

      case 'response.done':
        // Réponse terminée - lire à voix haute
        if (currentResponseRef.current) {
          const responseId = event.response?.id || `assistant_${Date.now()}`;
          const responseText = currentResponseRef.current;

          if (!processedItemsRef.current.has(responseId)) {
            processedItemsRef.current.add(responseId);

            const msg: RealtimeMessage = {
              id: responseId,
              role: 'assistant',
              text: responseText,
              timestamp: Date.now(),
            };
            setMessages(prev => [...prev, msg]);

            // Lire le texte puis reprendre l'écoute après un court délai
            speakTextRef.current(responseText).then(() => {
              setTimeout(() => {
                if (shouldRestartListeningRef.current && !isPausedRef.current && isConnectedRef.current) {
                  console.log('🎤 Auto-restarting listening after TTS...');
                  startContinuousListeningRef.current();
                }
              }, 500);
            });
          }

          currentResponseRef.current = '';
          setTranscript('');
        }
        break;

      case 'error':
        console.error('❌ Realtime error:', event.error);
        setError(event.error?.message || 'Erreur de connexion');
        break;
    }
  }, []);

  // Connecter au tuteur
  const connect = useCallback(async () => {
    try {
      setError(null);
      console.log('🔌 Connecting to OpenAI Realtime...');

      if (!OPENAI_API_KEY) {
        throw new Error('Clé API OpenAI non configurée');
      }

      // IMPORTANT: Charger les textes AVANT de se connecter pour les avoir dans les instructions
      console.log('📚 Rechargement des textes avant connexion...');
      const loadedTexts = await loadUserTexts();
      console.log(`✅ Textes rechargés (${loadedTexts.length} textes), connexion au WebSocket...`);

      const ws = new WebSocket(
        'wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17',
        ['realtime', `openai-insecure-api-key.${OPENAI_API_KEY}`, 'openai-beta.realtime-v1']
      );

      wsRef.current = ws;

      ws.onopen = () => {
        console.log('✅ WebSocket connected');
        setIsConnected(true);
        isConnectedRef.current = true;
        shouldRestartListeningRef.current = true;

        // Configurer la session (mode texte uniquement)
        const openaiVoice = getOpenAIVoiceForGender(gender);
        const sessionConfig = {
          type: 'session.update',
          session: {
            modalities: ['text'],
            instructions: buildSystemInstructions(loadedTexts),
            voice: openaiVoice,
            turn_detection: null,
          },
        };
        ws.send(JSON.stringify(sessionConfig));

        // Message de bienvenue avec salutations islamiques puis question - l'écoute démarre après le TTS
        setTimeout(() => {
          ws.send(JSON.stringify({
            type: 'response.create',
            response: {
              modalities: ['text'],
              instructions: 'Start with EXACTLY: "السلام عليكم. كيف حالك؟" then pick ONE word from student vocabulary and ask "ما معنى [word]؟"',
              max_output_tokens: 30,
            },
          }));
        }, 200);
      };

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        handleRealtimeEvent(data);
      };

      ws.onerror = (event) => {
        console.error('❌ WebSocket error:', event);
        setError('Erreur de connexion');
      };

      ws.onclose = () => {
        console.log('🔌 WebSocket closed');
        setIsConnected(false);
        isConnectedRef.current = false;
        shouldRestartListeningRef.current = false;
        stopListening();
      };
    } catch (err) {
      console.error('❌ Connection error:', err);
      setError(err instanceof Error ? err.message : 'Erreur de connexion');
      setIsConnected(false);
      isConnectedRef.current = false;
    }
  }, [buildSystemInstructions, gender, handleRealtimeEvent, stopListening]);

  // Envoyer un message texte (fallback clavier)
  const sendTextMessage = useCallback((text: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      return;
    }

    const userMsg: RealtimeMessage = {
      id: `user_${Date.now()}`,
      role: 'user',
      text,
      timestamp: Date.now(),
    };
    setMessages(prev => [...prev, userMsg]);

    wsRef.current.send(JSON.stringify({
      type: 'conversation.item.create',
      item: {
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text }],
      },
    }));

    wsRef.current.send(JSON.stringify({
      type: 'response.create',
      response: { modalities: ['text'] },
    }));
  }, []);

  // Pause / Reprendre
  const togglePause = useCallback(async () => {
    if (isPaused) {
      // Reprendre
      setIsPaused(false);
      isPausedRef.current = false;
      shouldRestartListeningRef.current = true;
      startContinuousListeningRef.current();
    } else {
      // Mettre en pause
      setIsPaused(true);
      isPausedRef.current = true;
      shouldRestartListeningRef.current = false;
      Speech.stop();
      setIsSpeaking(false);
      await stopListening();
    }
  }, [isPaused, stopListening]);

  // Interrompre le tuteur
  const interrupt = useCallback(() => {
    Speech.stop();
    setIsSpeaking(false);

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'response.cancel' }));
    }

    currentResponseRef.current = '';
    setTranscript('');

    // Reprendre l'écoute
    if (!isPausedRef.current && isConnectedRef.current) {
      startContinuousListeningRef.current();
    }
  }, []);

  // Déconnecter
  const disconnect = useCallback(async () => {
    console.log('🔌 Disconnecting...');

    shouldRestartListeningRef.current = false;
    isConnectedRef.current = false;
    isPausedRef.current = false;
    await stopListening();
    Speech.stop();

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    setIsConnected(false);
    setIsListening(false);
    setIsSpeaking(false);
    setIsPaused(false);
    setTranscript('');
    setUserTranscript('');
    currentResponseRef.current = '';
    processedItemsRef.current.clear();
  }, [stopListening]);

  // Cleanup
  useEffect(() => {
    return () => {
      shouldRestartListeningRef.current = false;
      Speech.stop();

      // Arrêter l'enregistrement si en cours
      if (recordingRef.current) {
        recordingRef.current.stopAndUnloadAsync().catch(() => {});
        recordingRef.current = null;
      }

      if (listeningTimeoutRef.current) {
        clearTimeout(listeningTimeoutRef.current);
      }

      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  // Effacer les messages
  const clearMessages = useCallback(() => {
    setMessages([]);
    setTranscript('');
    setUserTranscript('');
    currentResponseRef.current = '';
    processedItemsRef.current.clear();
  }, []);

  return {
    isConnected,
    isListening,
    isTranscribing,
    isSpeaking,
    isPaused,
    transcript,
    userTranscript,
    messages,
    error,
    userTexts,

    connect,
    disconnect,
    sendTextMessage,
    interrupt,
    togglePause,
    clearMessages,
    startListening: startContinuousListening,
    stopListening,
    loadUserTexts,
  };
}
