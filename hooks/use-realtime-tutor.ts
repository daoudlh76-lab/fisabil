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

  // Charger les textes de l'utilisateur
  useEffect(() => {
    loadUserTexts();
  }, []);

  const loadUserTexts = async () => {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user?.id;

      if (!userId) return;

      const { data: scans } = await supabase
        .from('scans')
        .select('id, title, content')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(10);

      if (scans) {
        setUserTexts(scans);
        console.log('📚 Textes chargés pour tuteur:', scans.length);
      }
    } catch (e) {
      console.error('❌ Erreur chargement textes:', e);
    }
  };

  // Construire les instructions système
  const buildSystemInstructions = useCallback(() => {
    const targetLang = languageNames[uiLang] || 'French';

    const textsContext = userTexts.length > 0
      ? userTexts.map((t, i) => `--- TEXT ${i + 1}: "${t.title}" ---\n${t.content.slice(0, 1000)}`).join('\n\n')
      : 'No texts available yet.';

    return `You are an expert Arabic language teacher (معلم اللغة العربية). You speak with a clear, warm voice.

## YOUR BEHAVIOR:
1. **ALWAYS RESPOND IN ARABIC** - Speak naturally in Arabic
2. **EXCEPTION**: If the student says "je ne comprends pas", "I don't understand", or similar, briefly explain in ${targetLang}, then return to Arabic
3. **BE A REAL TEACHER**: Ask questions, correct mistakes, encourage progress

## YOUR TEACHING METHOD:
1. **ASK QUESTIONS** about the texts the student has studied
2. **CORRECT ALL ERRORS** the student makes
3. **EXPLAIN CORRECTIONS** in Arabic
4. **ENCOURAGE**: Always be positive and supportive

## STUDENT'S TEXTS:
${textsContext}

## IMPORTANT - SPEED IS CRITICAL:
- Keep responses VERY SHORT (1-2 sentences max, under 30 words)
- Respond IMMEDIATELY, don't overthink
- Use simple Arabic for beginners
- Only switch to ${targetLang} if explicitly asked
- NO long explanations - be direct and concise

Start with a SHORT greeting in Arabic (max 10 words).`;
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
      formData.append('prompt', 'بسم الله'); // Prompt court pour plus de rapidité

      console.log("📤 Sending audio to Whisper API...");
      const startTime = Date.now();

      // Timeout de 10 secondes pour Whisper
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

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
          console.error("❌ Whisper timeout (>10s)");
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

      const pitch = gender === 'female' ? 1.15 : 0.85;

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
      });

      console.log('🎤 Creating recording...');
      const recording = new Audio.Recording();
      recordingRef.current = recording;

      await recording.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      await recording.startAsync();

      isListeningRef.current = true;
      setIsListening(true);
      setUserTranscript('');

      console.log('🎤 Recording started successfully');

      // Arrêter automatiquement après 5 secondes pour une réponse plus rapide
      if (listeningTimeoutRef.current) {
        clearTimeout(listeningTimeoutRef.current);
      }

      listeningTimeoutRef.current = setTimeout(async () => {
        console.log('⏱️ Auto-stopping recording after timeout');
        await stopListening();
      }, 5000);

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

    // Demander une réponse courte et rapide
    wsRef.current.send(JSON.stringify({
      type: 'response.create',
      response: {
        modalities: ['text'],
        instructions: 'Respond in 1-2 SHORT sentences only. Be quick and direct.',
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

            // Lire le texte puis reprendre l'écoute automatiquement
            speakTextRef.current(responseText).then(() => {
              // Attendre un petit moment puis relancer l'écoute
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
            instructions: buildSystemInstructions(),
            voice: openaiVoice,
            turn_detection: null,
          },
        };
        ws.send(JSON.stringify(sessionConfig));

        // Message de bienvenue court - l'écoute démarre après le TTS
        setTimeout(() => {
          ws.send(JSON.stringify({
            type: 'response.create',
            response: {
              modalities: ['text'],
              instructions: 'Say ONLY: "مرحباً! كيف حالك؟" (Hello! How are you?) - nothing more.',
            },
          }));
        }, 300);
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
  };
}
