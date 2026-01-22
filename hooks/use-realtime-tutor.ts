/**
 * Hook pour le tuteur en temps réel avec l'API Realtime d'OpenAI
 * Mode conversation vocale avec VAD (Voice Activity Detection)
 * Utilise expo-speech-recognition pour capturer la voix de l'utilisateur
 * et expo-speech pour lire les réponses du tuteur
 */

import { supabase } from "@/src/lib/supabase";
import { useCallback, useEffect, useRef, useState } from "react";
import { useVoicePreference, getOpenAIVoiceForGender } from "@/contexts/voice-preference-context";
import * as Speech from 'expo-speech';

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

// Import conditionnel de expo-speech-recognition
let ExpoSpeechRecognitionModule: any = null;
let addSpeechRecognitionListener: ((event: string, callback: (data: any) => void) => { remove: () => void }) | null = null;
try {
  const speechRecognition = require('expo-speech-recognition');
  ExpoSpeechRecognitionModule = speechRecognition.ExpoSpeechRecognitionModule;
  addSpeechRecognitionListener = speechRecognition.addSpeechRecognitionListener;
} catch (e) {
  console.log('⚠️ expo-speech-recognition not available');
}

export function useRealtimeTutor(uiLang: string = 'fr') {
  const [isConnected, setIsConnected] = useState(false);
  const [isListening, setIsListening] = useState(false);
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

  // Ref pour éviter les doublons de messages
  const processedItemsRef = useRef<Set<string>>(new Set());

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

## IMPORTANT:
- Keep responses concise (2-3 sentences max)
- Speak clearly and at a moderate pace
- Use simple Arabic for beginners
- Only switch to ${targetLang} if explicitly asked

Start by greeting the student warmly in Arabic.`;
  }, [userTexts, uiLang]);

  // Fonction pour détecter si un texte contient de l'arabe
  const isArabicText = (text: string): boolean => {
    const arabicChars = text.match(/[\u0600-\u06FF]/g)?.length || 0;
    const totalChars = text.replace(/\s/g, '').length;
    return totalChars > 0 && (arabicChars / totalChars) > 0.3;
  };

  // Lire le texte avec TTS
  const speakText = useCallback((text: string): Promise<void> => {
    return new Promise((resolve) => {
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
        onDone: () => {
          setIsSpeaking(false);
          resolve();
        },
        onError: () => {
          setIsSpeaking(false);
          resolve();
        },
      });
    });
  }, [uiLang, gender]);

  // Démarrer la reconnaissance vocale en continu
  const startContinuousListening = useCallback(async () => {
    if (!ExpoSpeechRecognitionModule || isListeningRef.current || isPaused) {
      return;
    }

    try {
      const status = await ExpoSpeechRecognitionModule.getPermissionsAsync();
      if (!status.granted) {
        const result = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
        if (!result.granted) {
          setError('Permission micro refusée');
          return;
        }
      }

      isListeningRef.current = true;
      setIsListening(true);
      setUserTranscript('');

      console.log('🎤 Starting continuous listening...');

      await ExpoSpeechRecognitionModule.start({
        lang: 'ar-SA', // Toujours écouter en arabe pour le tuteur
        interimResults: true,
        continuous: true, // Mode continu
      });
    } catch (e) {
      console.error('❌ Speech recognition error:', e);
      isListeningRef.current = false;
      setIsListening(false);
    }
  }, [isPaused]);

  // Arrêter la reconnaissance vocale
  const stopListening = useCallback(async () => {
    if (!ExpoSpeechRecognitionModule) return;

    try {
      await ExpoSpeechRecognitionModule.stop();
    } catch (e) {
      // Ignorer
    }
    isListeningRef.current = false;
    setIsListening(false);
  }, []);

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
            speakText(responseText).then(() => {
              // Attendre un petit moment puis relancer l'écoute
              setTimeout(() => {
                if (shouldRestartListeningRef.current && !isPaused && isConnected) {
                  console.log('🎤 Auto-restarting listening after TTS...');
                  startContinuousListening();
                }
              }, 300);
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
  }, [speakText, isPaused, startContinuousListening, isConnected]);

  // Envoyer ce que l'utilisateur a dit au WebSocket
  const sendUserSpeech = useCallback((text: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN || !text.trim()) {
      return;
    }

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

    // Demander une réponse
    wsRef.current.send(JSON.stringify({
      type: 'response.create',
      response: { modalities: ['text'] },
    }));
  }, []);

  // Configurer les listeners de reconnaissance vocale
  useEffect(() => {
    if (!ExpoSpeechRecognitionModule || !addSpeechRecognitionListener) return;

    let lastTranscript = '';

    // Listener pour les résultats
    const handleResult = (event: any) => {
      if (event?.results?.[0]) {
        const transcript = event.results[0].transcript;
        setUserTranscript(transcript);
        lastTranscript = transcript;

        // Si c'est un résultat final, envoyer au tuteur
        if (event.results[0].isFinal) {
          console.log('🎤 Final transcript:', transcript);

          // Arrêter l'écoute pendant que le tuteur répond
          stopListening();
          setUserTranscript('');

          // Envoyer au tuteur
          sendUserSpeech(transcript);
        }
      }
    };

    // Listener pour la fin
    const handleEnd = () => {
      console.log('🎤 Speech recognition ended');
      isListeningRef.current = false;
      setIsListening(false);

      // Relancer si on a un transcript partiel non envoyé
      if (lastTranscript && !isPaused) {
        sendUserSpeech(lastTranscript);
        lastTranscript = '';
      }
    };

    // Listener pour les erreurs
    const handleError = (event: any) => {
      console.error('🎤 Speech error:', event);
      isListeningRef.current = false;
      setIsListening(false);

      // Relancer automatiquement après une erreur (sauf si en pause)
      if (shouldRestartListeningRef.current && !isPaused) {
        setTimeout(() => {
          startContinuousListening();
        }, 1000);
      }
    };

    // S'abonner aux événements avec la fonction importée
    const unsubscribeResult = addSpeechRecognitionListener('result', handleResult);
    const unsubscribeEnd = addSpeechRecognitionListener('end', handleEnd);
    const unsubscribeError = addSpeechRecognitionListener('error', handleError);

    return () => {
      unsubscribeResult?.remove?.();
      unsubscribeEnd?.remove?.();
      unsubscribeError?.remove?.();
    };
  }, [stopListening, sendUserSpeech, isPaused, startContinuousListening]);

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

        // Message de bienvenue puis démarrer l'écoute automatiquement
        setTimeout(() => {
          ws.send(JSON.stringify({
            type: 'response.create',
            response: {
              modalities: ['text'],
              instructions: 'Greet the student warmly in Arabic. Ask how their Arabic studies are going.',
            },
          }));
        }, 500);

        // Démarrer l'écoute automatiquement après connexion (léger délai pour le message de bienvenue)
        setTimeout(() => {
          if (shouldRestartListeningRef.current) {
            startContinuousListening();
          }
        }, 2000);
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
        shouldRestartListeningRef.current = false;
        stopListening();
      };
    } catch (err) {
      console.error('❌ Connection error:', err);
      setError(err instanceof Error ? err.message : 'Erreur de connexion');
      setIsConnected(false);
    }
  }, [buildSystemInstructions, gender, handleRealtimeEvent, stopListening, startContinuousListening]);

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
      shouldRestartListeningRef.current = true;
      startContinuousListening();
    } else {
      // Mettre en pause
      setIsPaused(true);
      shouldRestartListeningRef.current = false;
      Speech.stop();
      setIsSpeaking(false);
      await stopListening();
    }
  }, [isPaused, startContinuousListening, stopListening]);

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
    if (!isPaused) {
      startContinuousListening();
    }
  }, [isPaused, startContinuousListening]);

  // Déconnecter
  const disconnect = useCallback(async () => {
    console.log('🔌 Disconnecting...');

    shouldRestartListeningRef.current = false;
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
      if (ExpoSpeechRecognitionModule) {
        ExpoSpeechRecognitionModule.stop().catch(() => {});
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
