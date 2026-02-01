import { useState, useCallback, useRef } from "react";
import * as Speech from "expo-speech";
import { Audio } from "expo-audio";
import * as FileSystem from "expo-file-system";
import { useLanguage } from "./use-language";
import { useVoicePreference } from "@/contexts/voice-preference-context";

const OPENAI_API_KEY = process.env.EXPO_PUBLIC_OPENAI_API_KEY || '';

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
      const { status } = await Audio.requestPermissionsAsync();
      return status === "granted";
    } catch (err) {
      console.error("Permission error:", err);
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

  // Transcrire l'audio avec l'API Whisper d'OpenAI
  const transcribeWithWhisper = async (audioUri: string): Promise<string | null> => {
    try {
      if (!OPENAI_API_KEY) {
        console.error("❌ OpenAI API key not configured");
        return null;
      }

      // Lire le fichier audio en base64
      const audioBase64 = await FileSystem.readAsStringAsync(audioUri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      // Créer un FormData avec le fichier audio
      const formData = new FormData();
      
      // Créer un blob à partir du base64
      const audioBlob = {
        uri: audioUri,
        type: 'audio/m4a',
        name: 'audio.m4a',
      };
      
      formData.append('file', audioBlob as any);
      formData.append('model', 'whisper-1');
      formData.append('language', 'ar'); // Priorité à l'arabe
      formData.append('prompt', 'Ceci est une phrase en arabe. بسم الله الرحمن الرحيم'); // Aide le modèle

      console.log("📤 Sending audio to Whisper API...");

      const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
        },
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("❌ Whisper API error:", response.status, errorText);
        return null;
      }

      const result = await response.json();
      console.log("✅ Whisper transcription result:", result);
      
      return result.text || null;
    } catch (err) {
      console.error("❌ Whisper transcription error:", err);
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

  // Parler (synthèse vocale) - CETTE FONCTION MARCHE
  const speak = useCallback(
    async (text: string) => {
      try {
        setIsSpeaking(true);
        setError(null);

        // Arrêter la parole précédente si elle est en cours
        await Speech.stop();

        // Détecter automatiquement la langue du texte
        let speechLanguage: string;
        if (isArabicText(text)) {
          speechLanguage = "ar-SA"; // Arabe saoudien
        } else {
          // Utiliser la langue de l'UI pour les textes non-arabes
          const langMap: Record<string, string> = {
            fr: "fr-FR",
            en: "en-US",
            de: "de-DE",
            es: "es-ES",
            ru: "ru-RU",
          };
          speechLanguage = langMap[language] || "en-US";
        }

        // Pitch très différencié pour une différence très audible: homme=grave (0.5), femme=aigu (1.5)
        const pitch = gender === 'female' ? 1.5 : 0.5;

        console.log("🔊 Speaking:", text.slice(0, 50) + "...", "in", speechLanguage, "pitch:", pitch);

        await Speech.speak(text, {
          language: speechLanguage,
          pitch,
          rate: isArabicText(text) ? 0.8 : 0.85, // Un peu plus lent pour l'arabe
          onDone: () => {
            console.log("🔊 Speech finished");
            setIsSpeaking(false);
          },
          onError: (err) => {
            console.error("Speech synthesis error:", err);
            setIsSpeaking(false);
            const errorMsg = "Speech synthesis error";
            setError(errorMsg);
          },
        });
      } catch (err) {
        console.error("❌ Speech error:", err);
        setIsSpeaking(false);
        const errorMsg =
          err instanceof Error
            ? err.message
            : "Speech error";
        setError(errorMsg);
      }
    },
    [language, gender]
  );

  // Arrêter la parole
  const stopSpeaking = useCallback(async () => {
    try {
      await Speech.stop();
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
