import { useVoicePreference } from "@/contexts/voice-preference-context";
import { speakWithOpenAI, stopTTS } from '@/src/utils/openai-tts';
import { invokeEdge, fileUriToBase64 } from '@/src/lib/edge-ai';
import { Audio } from "expo-audio";
import { useCallback, useRef, useState } from "react";
import { useLanguage } from "./use-language";

export function useSpeech() {
  const { language } = useLanguage();
  const { gender } = useVoicePreference();
  const [isListening, setIsListening] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const listeningTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Demander les permissions pour le microphone
  const requestMicrophonePermission = useCallback(async () => {
    try {
      // Vérifier d'abord le statut actuel
      console.log("🎤 Checking microphone permission status...");
      const permissionResult = await Audio.getPermissionsAsync();
      console.log("🎤 Permission result:", JSON.stringify(permissionResult));
      const { status: currentStatus, canAskAgain } = permissionResult;

      if (currentStatus === "granted") {
        console.log("✅ Microphone permission already granted");
        return true;
      }

      // Si on ne peut plus demander (permission refusée définitivement)
      if (!canAskAgain) {
        console.warn("⚠️ Microphone permission was denied. User must enable it in system settings.");
        setError("Permission microphone refusée. Allez dans Réglages → Fisabil → Microphone pour l'activer.");
        return false;
      }

      // Demander la permission
      console.log("🎤 Requesting microphone permission...");
      const requestResult = await Audio.requestPermissionsAsync();
      console.log("🎤 Request result:", JSON.stringify(requestResult));

      if (requestResult.status === "granted") {
        console.log("✅ Microphone permission granted");
        return true;
      } else {
        console.error("❌ Microphone permission denied");
        setError("Permission microphone refusée. Allez dans Réglages → Fisabil → Microphone pour l'activer.");
        return false;
      }
    } catch (err) {
      console.error("❌ Permission error:", err);
      console.error("❌ Error stack:", err instanceof Error ? err.stack : String(err));
      setError("Erreur lors de la demande de permission microphone.");
      return false;
    }
  }, []);

  // Démarrer l'écoute avec enregistrement audio
  const startListening = useCallback(async () => {
    try {
      setError(null);
      setTranscript("");

      // Demander la permission
      const hasPermission = await requestMicrophonePermission();
      if (!hasPermission) {
        const errorMsg = "Microphone permission denied";
        setError(errorMsg);
        console.error("❌", errorMsg);
        return;
      }

      setIsListening(true);
      console.log("🎤 Listening started...");

      // Configurer l'audio
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      // Créer une nouvelle session d'enregistrement
      const recording = new Audio.Recording();
      recordingRef.current = recording;

      try {
        await recording.prepareToRecordAsync(
          Audio.RecordingOptionsPresets.HIGH_QUALITY
        );
        await recording.startAsync();
        console.log("🎤 Recording started");

        // Arrêter automatiquement après 10 secondes
        if (listeningTimeoutRef.current) {
          clearTimeout(listeningTimeoutRef.current);
        }

        listeningTimeoutRef.current = setTimeout(async () => {
          console.log("⏱️ Timeout: stopping recording");
          await stopListening();
        }, 10000);
      } catch (err) {
        console.error("Recording error:", err);
        setError("Recording error");
        setIsListening(false);
      }
    } catch (err) {
      console.error("❌ Speech recognition error:", err);
      const errorMsg =
        err instanceof Error
          ? err.message
          : "Speech recognition error";
      setError(errorMsg);
      setIsListening(false);
    }
  }, [requestMicrophonePermission]);

  // Arrêter l'écoute et traiter le fichier audio
  const stopListening = useCallback(async () => {
    try {
      if (!recordingRef.current) {
        setIsListening(false);
        return;
      }

      if (listeningTimeoutRef.current) {
        clearTimeout(listeningTimeoutRef.current);
      }

      await recordingRef.current.stopAndUnloadAsync();
      const uri = recordingRef.current.getURI();
      recordingRef.current = null;

      console.log("🎤 Recording stopped:", uri);

      setIsListening(false);

      if (!uri) {
        console.error("❌ No audio file recorded");
        setError("No audio recorded");
        return;
      }

      // Indiquer que la transcription est en cours
      setIsTranscribing(true);
      
      // Transcrire l'audio avec l'API Whisper d'OpenAI
      console.log("📝 Transcribing audio with Whisper...");
      const transcribedText = await transcribeWithWhisper(uri);
      
      setIsTranscribing(false);
      
      if (transcribedText) {
        setTranscript(transcribedText);
        console.log("📝 Transcription:", transcribedText);
      } else {
        console.log("❌ Transcription failed or empty");
        setError("Transcription failed");
      }
    } catch (err) {
      console.error("Error stopping recognition:", err);
      setIsListening(false);
      setIsTranscribing(false);
    }
  }, []);

  // Transcrire l'audio avec Supabase Edge Function (speech-to-text)
  const transcribeWithWhisper = async (audioUri: string): Promise<string | null> => {
    try {
      console.log("📤 Transcribing audio via Edge Function...");

      // Lire le fichier audio en base64
      const audioBase64 = await fileUriToBase64(audioUri);

      // Appeler l'Edge Function via invokeEdge
      const data = await invokeEdge<{ text: string; language?: string }>('speech-to-text', {
        audioBase64,
        language: 'ar',
        prompt: 'Ceci est une phrase en arabe. بسم الله الرحمن الرحيم',
      });

      console.log("✅ Transcription result:", data.text);
      return data.text || null;
    } catch (err) {
      console.error("❌ Transcription error:", err);
      return null;
    }
  };

  // Fonction pour détecter si le texte contient de l'arabe
  const isArabicText = (text: string): boolean => {
    // Regex pour détecter les caractères arabes (plage Unicode pour l'arabe)
    const arabicPattern = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/;
    // Compter les caractères arabes vs non-arabes (hors espaces et ponctuation)
    const arabicChars = (text.match(/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/g) || []).length;
    const totalChars = text.replace(/[\s\.,،؟!؛:]/g, '').length;
    // Si plus de 50% des caractères sont arabes, considérer comme texte arabe
    return totalChars > 0 && (arabicChars / totalChars) > 0.5;
  };

  // Parler (OpenAI TTS natural voice, fallback to device)
  const speak = useCallback(
    async (text: string) => {
      try {
        setIsSpeaking(true);
        setError(null);

        // Stop any previous speech
        await stopTTS();

        // Detect language
        let speechLanguage: string;
        if (isArabicText(text)) {
          speechLanguage = "ar-SA";
        } else {
          const langMap: Record<string, string> = {
            fr: "fr-FR",
            en: "en-US",
            de: "de-DE",
            es: "es-ES",
            ru: "ru-RU",
          };
          speechLanguage = langMap[language] || "en-US";
        }

        const speed = isArabicText(text) ? 0.9 : 1.0;

        console.log("🔊 Speaking (OpenAI):", text.slice(0, 50) + "...", "lang:", speechLanguage);

        await speakWithOpenAI({
          text,
          gender,
          speed,
          language: speechLanguage,
          onDone: () => {
            console.log("🔊 Speech finished");
            setIsSpeaking(false);
          },
          onError: (err) => {
            console.error("Speech synthesis error:", err);
            setIsSpeaking(false);
            setError("Speech synthesis error");
          },
        });
      } catch (err) {
        console.error("❌ Speech error:", err);
        const errorMsg =
          err instanceof Error ? err.message : "Speech error";
        setError(errorMsg);
      } finally {
        setIsSpeaking(false);
      }
    },
    [language, gender]
  );

  // Arrêter la parole
  const stopSpeaking = useCallback(async () => {
    try {
      await stopTTS();
      setIsSpeaking(false);
      console.log("🔊 Speech stopped");
    } catch (err) {
      console.error("Error stopping speech:", err);
    }
  }, []);

  // Arrêter tout (écoute + parole)
  const stop = useCallback(async () => {
    await stopListening();
    await stopSpeaking();
  }, [stopListening, stopSpeaking]);

  return {
    isListening,
    isTranscribing,
    isSpeaking,
    transcript,
    error,
    startListening,
    stopListening,
    speak,
    stopSpeaking,
    stop,
  };
}
