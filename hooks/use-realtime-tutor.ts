/**
 * Hook pour le tuteur en temps réel avec l'API Realtime d'OpenAI
 * Mode conversation vocale avec enregistrement audio + Whisper
 * Utilise expo-av pour capturer la voix de l'utilisateur
 * et expo-speech pour lire les réponses du tuteur
 */

import { getOpenAIVoiceForGender, useVoicePreference } from "@/contexts/voice-preference-context";
import { supabase } from "@/src/lib/supabase";
import { speakWithOpenAI, stopTTS } from '@/src/utils/openai-tts';
import { Audio } from 'expo-av';
import * as Speech from 'expo-speech';
import { useCallback, useEffect, useRef, useState } from "react";

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
  folder_id: string | null;
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

export function useRealtimeTutor(uiLang: string = 'fr', selectedTextId?: string) {
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
  const connectRef = useRef<() => Promise<void>>(() => Promise.resolve());
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
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user?.id;

      if (!userId) {
        return [];
      }

      const { data: scans, error: scansError } = await supabase
        .from('scans')
        .select('id, title, content, folder_id')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (scansError) {
        console.error('[TUTOR] Erreur chargement scans:', scansError.message);
        return [];
      }

      const normalizedScans = scans || [];
      setUserTexts(normalizedScans);
      return normalizedScans;
    } catch (e) {
      console.error('[TUTOR] Erreur chargement textes:', e);
      return [];
    }
  }, []);

  // Charger les textes au montage
  useEffect(() => {
    loadUserTexts();
  }, [loadUserTexts]);

  // Construire les instructions système
  const buildSystemInstructions = useCallback((textsToUse?: typeof userTexts) => {
    const targetLang = languageNames[uiLang] || 'French';
    let texts = textsToUse || userTexts;

    // Filtrer pour n'utiliser que le texte sélectionné si selectedTextId est fourni
    if (selectedTextId) {
      console.log(`🔍 [FILTRE] selectedTextId fourni: ${selectedTextId}`);
      texts = texts.filter(t => t.id === selectedTextId);
      console.log(`🔍 [FILTRE] Après filtrage: ${texts.length} texte(s) - Titres: ${texts.map(t => t.title).join(', ')}`);
    } else {
      console.log(`🔍 [FILTRE] Aucun selectedTextId - Utilisation de tous les textes (${texts.length})`);
    }

    // Construire le contexte uniquement avec les textes scannés (pas de vocabulaire séparé)
    // Si un seul texte est sélectionné, prendre le texte complet. Sinon, limiter à 1500 caractères par texte
    const textsContext = texts.length > 0
      ? texts.map((t, i) => {
          const contentLimit = texts.length === 1 ? t.content : t.content.slice(0, 1500);
          return `--- TEXT ${i + 1}: "${t.title}" ---\n${contentLimit}`;
        }).join('\n\n')
      : 'No texts available yet.';

    console.log(`📄 [INSTRUCTIONS] Texte(s) inclus - Premier texte: ${texts[0]?.content.length || 0} caractères`);

    const firstTextTitle = texts.length > 0 ? texts[0].title : '';
    const textCount = texts.length;

    return `Tu es un tuteur d'arabe (معلم اللغة العربية). Ta voix est claire et chaleureuse.

## ⚠️ RÈGLE ABSOLUE - À SUIVRE STRICTEMENT ⚠️
TU NE PEUX POSER DES QUESTIONS QUE SUR LE TEXTE FOURNI CI-DESSOUS.
SI TU POSES UNE QUESTION QUI N'EST PAS DANS LE TEXTE, TU ÉCHOUES.
RELIS LE TEXTE AVANT CHAQUE QUESTION POUR VÉRIFIER QU'ELLE EST DANS LE TEXTE.

## TEXTES À ÉTUDIER (${textCount} texte(s)) :
${textsContext}

## TA MISSION :
1. Lis attentivement le TEXT 1 ci-dessus
2. Résume-le en 3 phrases
3. Pose 10 questions BASÉES SUR CE QUI EST ÉCRIT DANS LE TEXTE
4. Exemple: Si le texte parle de زينب et مريم, demande "من هي زينب؟" ou "ماذا تريد زينب؟"
5. N'invente RIEN qui n'est pas dans le texte

## RÈGLES STRICTES :
- L'étudiant répond en ${targetLang}. ACCEPTE les réponses en ${targetLang}.
- TOUJOURS poser des questions EN ARABE CLASSIQUE (الفصحى)
- TOUJOURS utiliser les DIACRITIQUES (التشكيل) dans tes réponses arabes
- TOUJOURS répondre EN ARABE (sauf si l'étudiant dit "je ne comprends pas")
- Garde TOUT court : 1-2 phrases max, moins de 30 mots
- Après chaque réponse, pose IMMÉDIATEMENT la question suivante
- PRONONCE CLAIREMENT chaque mot avec les voyelles correctes
- ⚠️ INTERDICTION ABSOLUE: Ne pose JAMAIS de questions générales comme "ما اسمك؟", "أين تسكن؟", "ماذا تحب؟"
- ⚠️ OBLIGATION: Toutes tes questions DOIVENT porter sur les personnages, événements, et détails MENTIONNÉS dans le texte

## FORMAT DES 10 QUESTIONS (pour CHAQUE texte) :

**Questions 1-4 (Basique - factuelles) :**
- Idée principale : "ما الفكرة الرئيسية للنص؟"
- Détails : "من؟ ماذا؟ أين؟ متى؟"

**Questions 5-7 (Détaillée) :**
- "لماذا؟" (Pourquoi)
- "كيف؟" (Comment)
- "ما قال النص عن...؟"

**Questions 8-10 (Analyse) :**
- Intention : "ماذا يريد الكاتب أن يقول؟"
- Opinion : "ما رأيك؟"
- Résumé : "لخّص النص"

## EXEMPLE DE DÉROULEMENT :
Toi: "السلام عليكم. كيف حالك؟ سأقرأ النص '${firstTextTitle}' وأسألك ١٠ أسئلة."
Toi: [Résumé en 3 phrases du TEXT 1]
Toi: "السؤال الأول: ما الفكرة الرئيسية للنص؟"
Étudiant: [répond]
Toi: "صحيح!" OU "لا، الإجابة هي..."
Toi: "السؤال الثاني: من..."
[Continue jusqu'à 10 questions]
Toi: "ممتاز! انتقل إلى النص الثاني..."`;


  }, [userTexts, uiLang, selectedTextId]);

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
  const speakText = useCallback(async (text: string): Promise<void> => {
    console.log('🔊 TTS starting:', text.substring(0, 50) + '...');
    setIsSpeaking(true);

    const isArabic = isArabicText(text);
    const lang = isArabic ? 'ar-SA' :
      uiLang === 'fr' ? 'fr-FR' :
      uiLang === 'de' ? 'de-DE' :
      uiLang === 'es' ? 'es-ES' :
      uiLang === 'ru' ? 'ru-RU' : 'en-US';
    const speed = isArabic ? 0.9 : 1.0;

    try {
      await speakWithOpenAI({
        text,
        gender,
        speed,
        language: lang,
        onDone: () => {
          console.log('🔊 TTS onDone - will restart listening');
          setIsSpeaking(false);
        },
        onError: (err) => {
          console.error('🔊 TTS onError:', err);
          setIsSpeaking(false);
        },
      });
    } finally {
      setIsSpeaking(false);
    }
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

  // Expose connect in a ref so we can attempt reconnects from callbacks
  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

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
        instructions: 'CRITICAL: Your NEXT question MUST be about the TEXT content from "TEXTES À ÉTUDIER". Réponds en arabe classique (فصحى) avec les diacritiques. MAXIMUM 15 words. Ask question about TEXT content ONLY.',
        max_output_tokens: 60,
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
            console.log('🔊 [RESPONSE] Calling speakTextRef.current with text:', responseText.substring(0, 50));
            speakTextRef.current(responseText).then(() => {
              console.log('🔊 [RESPONSE] speakTextRef.current completed');
              setTimeout(async () => {
                console.log('🎤 Post-TTS flags:', {
                  shouldRestart: shouldRestartListeningRef.current,
                  isPaused: isPausedRef.current,
                  isConnected: isConnectedRef.current,
                });

                if (!shouldRestartListeningRef.current) {
                  console.log('🎤 shouldRestartListeningRef is false — skipping restart');
                  return;
                }

                if (isPausedRef.current) {
                  console.log('🎤 Currently paused — will not restart listening');
                  return;
                }

                if (!isConnectedRef.current) {
                  console.warn('🔌 WS not connected after TTS — attempting reconnect before listening');
                  try {
                    await connectRef.current();
                    console.log('🔌 Reconnect attempt finished');
                  } catch (reErr) {
                    console.error('❌ Reconnect attempt failed:', reErr);
                    return;
                  }
                }

                console.log('🎤 Auto-restarting listening after TTS...');
                try {
                  await startContinuousListeningRef.current();
                } catch (startErr) {
                  console.error('❌ Failed to restart listening after TTS:', startErr);
                }
              }, 500);
            }).catch((err) => {
              console.error('🔊 [RESPONSE] speakTextRef.current error:', err);
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
      let loadedTexts = await loadUserTexts();
      console.log(`✅ Textes rechargés (${loadedTexts.length} textes)`);

      // Filtrer selon selectedTextId si fourni
      if (selectedTextId) {
        console.log(`🔍 [CONNECT] Filtrage pour selectedTextId: ${selectedTextId}`);
        loadedTexts = loadedTexts.filter(t => t.id === selectedTextId);
        console.log(`🔍 [CONNECT] Après filtrage: ${loadedTexts.length} texte(s) - ${loadedTexts.map(t => t.title).join(', ')}`);
      }

      console.log('🔌 Connexion au WebSocket...');

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
        const instructions = buildSystemInstructions(loadedTexts);
        console.log(`📝 Instructions système construites avec ${loadedTexts.length} texte(s)`);
        console.log('📝 Premiers 500 caractères:', instructions.substring(0, 500));

        // Log du contexte texte pour vérification
        const textsSection = instructions.match(/## TEXTES À ÉTUDIER[\s\S]*?##/)?.[0] || '';
        console.log('📚 Section TEXTES (premiers 1000 chars):', textsSection.substring(0, 1000));

        const sessionConfig = {
          type: 'session.update',
          session: {
            modalities: ['text'],
            instructions,
            voice: openaiVoice,
            turn_detection: null,
          },
        };
        ws.send(JSON.stringify(sessionConfig));

        // Message de bienvenue avec salutations islamiques puis question - l'écoute démarre après le TTS
        setTimeout(() => {
          const targetLang = languageNames[uiLang] || 'French';
          const firstTextTitle = loadedTexts.length > 0 ? loadedTexts[0].title : 'النص';
          const textCountMsg = loadedTexts.length === 1 ? 'un texte' : `${loadedTexts.length} textes`;

          console.log(`📝 [CONNECT] Message de bienvenue avec: ${firstTextTitle} (${textCountMsg})`);

          ws.send(JSON.stringify({
            type: 'response.create',
            response: {
              modalities: ['text'],
              instructions: `CRITICAL: You MUST ONLY ask questions about content in TEXT 1 from "TEXTES À ÉTUDIER" section.

Start with: "السَّلَامُ عَلَيْكُمْ. كَيْفَ حَالُكَ؟ سَأَقْرَأُ النَّصَّ '${firstTextTitle}' وَأَسْأَلُكَ عَشَرَةَ أَسْئِلَةٍ عَن هَذَا النَّصِّ. اِسْتَمِعْ جَيِّدًا."

Then give 3-sentence summary of TEXT 1 content (mention names, actions from the text).

Then ask FIRST question STRICTLY BASED on TEXT 1 content. Example: if TEXT 1 mentions زينب, ask "مَنْ هِيَ زَيْنَبُ؟" or "مَاذَا تُرِيدُ زَيْنَبُ؟".

Student answers in ${targetLang}. Accept ${targetLang}. Keep SHORT (max 30 words).`,
              max_output_tokens: 200,
            },
          }));
        }, 200);
      };

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        handleRealtimeEvent(data);
      };

      ws.onerror = (event) => {
        try {
          console.error('❌ WebSocket error event:', event);
          // Try to extract more useful info
          if ((event as any)?.message) console.error('❌ WebSocket error message:', (event as any).message);
        } catch (err) {
          console.error('❌ Error logging ws.onerror event:', err);
        }
        setError('Erreur de connexion');
      };

      ws.onclose = async (closeEvent: any) => {
        console.warn('🔌 WebSocket closed:', closeEvent);
        const wasShouldRestart = shouldRestartListeningRef.current;
        setIsConnected(false);
        isConnectedRef.current = false;
        // stop listening immediately to avoid orphan recordings
        try {
          await stopListening();
        } catch (err) {
          console.error('❌ Error stopping listening after ws close:', err);
        }

        // If we expected to keep the session alive, attempt limited reconnects
        if (wasShouldRestart && !isPausedRef.current) {
          console.log('🔁 Attempting limited reconnects (3 tries) after unexpected ws close...');
          let reconnected = false;
          for (let attempt = 1; attempt <= 3; attempt++) {
            try {
              console.log(`🔁 Reconnect attempt ${attempt}/3...`);
              // small backoff
              await new Promise(res => setTimeout(res, 1000 * attempt));
              await connectRef.current();
              reconnected = true;
              console.log('🔌 Reconnected successfully');
              break;
            } catch (reErr) {
              console.error(`❌ Reconnect attempt ${attempt} failed:`, reErr);
            }
          }

          if (!reconnected) {
            console.warn('⚠️ All reconnect attempts failed — giving up until user reconnects');
            shouldRestartListeningRef.current = false;
          }
        } else {
          shouldRestartListeningRef.current = false;
        }
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
      stopTTS();
      setIsSpeaking(false);
      await stopListening();
    }
  }, [isPaused, stopListening]);

  // Interrompre le tuteur
  const interrupt = useCallback(() => {
    Speech.stop();
    stopTTS();
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
    stopTTS();

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
      stopTTS();

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
