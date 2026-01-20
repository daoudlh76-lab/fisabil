/**
 * Hook pour le tuteur en temps réel avec l'API Realtime d'OpenAI
 * Version React Native utilisant WebSocket pour le streaming
 * Note: L'audio temps réel nécessite react-native-webrtc (configuration native)
 */

import { supabase } from "@/src/lib/supabase";
import * as Speech from "expo-speech";
import { useCallback, useEffect, useRef, useState } from "react";
import { useVoicePreference, getOpenAIVoiceForGender } from "@/contexts/voice-preference-context";

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
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [transcript, setTranscript] = useState<string>('');
  const [messages, setMessages] = useState<RealtimeMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [userTexts, setUserTexts] = useState<UserText[]>([]);

  // Préférence de voix (homme/femme)
  const { gender } = useVoicePreference();

  const wsRef = useRef<WebSocket | null>(null);
  const currentResponseRef = useRef<string>('');

  // Ref pour éviter les doublons de messages
  const lastMessageIdRef = useRef<string>('');
  const isProcessingResponseRef = useRef(false);

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
        console.log('📚 Textes chargés pour tuteur temps réel:', scans.length);
      }
    } catch (e) {
      console.error('❌ Erreur chargement textes:', e);
    }
  };

  // Construire les instructions système pour le tuteur
  const buildSystemInstructions = useCallback(() => {
    const targetLang = languageNames[uiLang] || 'French';
    
    const textsContext = userTexts.length > 0 
      ? userTexts.map((t, i) => `--- TEXT ${i + 1}: "${t.title}" ---\n${t.content.slice(0, 1000)}`).join('\n\n')
      : 'No texts available yet.';

    return `You are an expert Arabic language teacher (معلم اللغة العربية). You speak with a clear, warm voice.

## YOUR BEHAVIOR:
1. **ALWAYS RESPOND IN ARABIC** - Speak naturally in Arabic
2. **EXCEPTION**: If the student says "je ne comprends pas", "I don't understand", "Ich verstehe nicht" or similar, briefly explain in ${targetLang}, then return to Arabic
3. **BE A REAL TEACHER**: Ask questions, correct mistakes, encourage progress

## YOUR TEACHING METHOD:
1. **ASK QUESTIONS** about the texts the student has studied
2. **CORRECT ALL ERRORS** the student makes (grammar, pronunciation, comprehension)
3. **EXPLAIN CORRECTIONS** in Arabic
4. **ENCOURAGE**: Always be positive and supportive

## STUDENT'S TEXTS (for reference):
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
    const arabicRegex = /[\u0600-\u06FF]/;
    const arabicChars = text.match(/[\u0600-\u06FF]/g)?.length || 0;
    const totalChars = text.replace(/\s/g, '').length;
    return totalChars > 0 && (arabicChars / totalChars) > 0.3;
  };

  // Lire le texte avec TTS (expo-speech)
  const speakText = useCallback(async (text: string) => {
    try {
      setIsSpeaking(true);

      // Déterminer la langue pour la synthèse vocale
      const lang = isArabicText(text) ? 'ar-SA' :
        uiLang === 'fr' ? 'fr-FR' :
        uiLang === 'de' ? 'de-DE' :
        uiLang === 'es' ? 'es-ES' :
        uiLang === 'ru' ? 'ru-RU' : 'en-US';

      // Ajuster le pitch selon le genre (voix plus grave pour homme, plus aiguë pour femme)
      const pitch = gender === 'female' ? 1.15 : 0.85;

      Speech.speak(text, {
        language: lang,
        rate: 0.9,
        pitch: pitch,
        onDone: () => setIsSpeaking(false),
        onError: () => setIsSpeaking(false),
      });
    } catch (e) {
      console.error('❌ TTS error:', e);
      setIsSpeaking(false);
    }
  }, [uiLang, gender]);

  // Gérer les événements du tuteur en temps réel
  const handleRealtimeEvent = useCallback((event: any) => {
    switch (event.type) {
      case 'session.created':
        console.log('📡 Session created');
        break;

      case 'session.updated':
        console.log('📡 Session updated');
        break;

      case 'response.text.delta':
        // Le tuteur envoie du texte - accumuler
        currentResponseRef.current += event.delta || '';
        setTranscript(currentResponseRef.current);
        break;

      case 'response.text.done':
        // Ne rien faire ici, attendre response.done
        break;

      case 'response.done':
        // Réponse complète terminée - traiter une seule fois
        if (currentResponseRef.current && !isProcessingResponseRef.current) {
          isProcessingResponseRef.current = true;

          const responseText = currentResponseRef.current;

          // Éviter les doublons en comparant avec le dernier message
          if (lastMessageIdRef.current !== responseText.slice(0, 50)) {
            lastMessageIdRef.current = responseText.slice(0, 50);

            const msg: RealtimeMessage = {
              id: `assistant_${Date.now()}`,
              role: 'assistant',
              text: responseText,
              timestamp: Date.now(),
            };
            setMessages(prev => [...prev, msg]);

            // Lire le texte à voix haute
            speakText(responseText);
          }

          currentResponseRef.current = '';
          setTranscript('');
          isProcessingResponseRef.current = false;
        }
        break;

      case 'error':
        console.error('❌ Realtime error:', event.error);
        setError(event.error?.message || 'Realtime error');
        break;
    }
  }, [speakText]);

  // Connecter au tuteur en temps réel via WebSocket
  const connect = useCallback(async () => {
    try {
      setError(null);
      console.log('🔌 Connecting to Realtime API via WebSocket...');

      if (!OPENAI_API_KEY) {
        throw new Error('OpenAI API key not configured');
      }

      // Créer la connexion WebSocket
      const ws = new WebSocket(
        'wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17',
        ['realtime', `openai-insecure-api-key.${OPENAI_API_KEY}`, 'openai-beta.realtime-v1']
      );
      
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('✅ WebSocket connected');
        setIsConnected(true);
        
        // Configurer la session avec la voix appropriée selon le genre
        const openaiVoice = getOpenAIVoiceForGender(gender);
        const sessionUpdate = {
          type: 'session.update',
          session: {
            modalities: ['text'],
            instructions: buildSystemInstructions(),
            voice: openaiVoice,
            input_audio_format: 'pcm16',
            output_audio_format: 'pcm16',
            turn_detection: null, // Mode manuel
          },
        };
        ws.send(JSON.stringify(sessionUpdate));
        
        // Demander un message de bienvenue
        setTimeout(() => {
          const createResponse = {
            type: 'response.create',
            response: {
              modalities: ['text'],
              instructions: 'Greet the student warmly in Arabic. Ask them how their Arabic studies are going.',
            },
          };
          ws.send(JSON.stringify(createResponse));
        }, 500);
      };

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        handleRealtimeEvent(data);
      };

      ws.onerror = (event) => {
        console.error('❌ WebSocket error:', event);
        setError('Connection error');
      };

      ws.onclose = () => {
        console.log('🔌 WebSocket closed');
        setIsConnected(false);
      };
    } catch (err) {
      console.error('❌ Connection error:', err);
      setError(err instanceof Error ? err.message : 'Connection error');
      setIsConnected(false);
    }
  }, [buildSystemInstructions, gender, handleRealtimeEvent]);

  // Envoyer un message texte
  const sendTextMessage = useCallback((text: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      console.error('WebSocket not connected');
      return;
    }

    // Ajouter le message de l'utilisateur
    const userMsg: RealtimeMessage = {
      id: `user_${Date.now()}`,
      role: 'user',
      text,
      timestamp: Date.now(),
    };
    setMessages(prev => [...prev, userMsg]);

    // Créer l'item de conversation
    const createItem = {
      type: 'conversation.item.create',
      item: {
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text }],
      },
    };
    wsRef.current.send(JSON.stringify(createItem));

    // Demander une réponse
    const createResponse = {
      type: 'response.create',
      response: {
        modalities: ['text'],
      },
    };
    wsRef.current.send(JSON.stringify(createResponse));
  }, []);

  // Interrompre le tuteur
  const interrupt = useCallback(() => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      return;
    }

    // Arrêter la synthèse vocale
    Speech.stop();
    setIsSpeaking(false);

    // Annuler la réponse en cours
    const cancelEvent = {
      type: 'response.cancel',
    };
    wsRef.current.send(JSON.stringify(cancelEvent));
    
    currentResponseRef.current = '';
    setTranscript('');
  }, []);

  // Déconnecter
  const disconnect = useCallback(() => {
    console.log('🔌 Disconnecting...');

    Speech.stop();

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    setIsConnected(false);
    setIsListening(false);
    setIsSpeaking(false);
    setTranscript('');
    currentResponseRef.current = '';
  }, []);

  // Nettoyer à la destruction du composant
  useEffect(() => {
    return () => {
      // Cleanup sans dépendance pour éviter les boucles
      Speech.stop();
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, []); // Pas de dépendances pour éviter les re-rendus

  // Effacer les messages
  const clearMessages = useCallback(() => {
    setMessages([]);
    setTranscript('');
    currentResponseRef.current = '';
  }, []);

  return {
    // État
    isConnected,
    isListening,
    isSpeaking,
    transcript,
    messages,
    error,
    userTexts,
    
    // Actions
    connect,
    disconnect,
    sendTextMessage,
    interrupt,
    clearMessages,
  };
}
