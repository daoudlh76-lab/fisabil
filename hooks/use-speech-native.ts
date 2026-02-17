
import { useState, useCallback, useEffect } from "react";
import { useLanguage } from "./use-language";
import { Alert } from "react-native";

// Importer de manière conditionnelle pour éviter le crash
let ExpoSpeechRecognitionModule: any = null;
let useSpeechRecognitionEvent: any = null;

try {
  const speechRecognition = require('expo-speech-recognition');
  ExpoSpeechRecognitionModule = speechRecognition.ExpoSpeechRecognitionModule;
  useSpeechRecognitionEvent = speechRecognition.useSpeechRecognitionEvent;
} catch (e) {
  __DEV__ && console.log('⚠️ expo-speech-recognition not available (native module required)');
}

// Hook factice pour quand le module n'est pas disponible
const useNoopEvent = (_event: string, _callback: any) => {};

export function useSpeechNative(forceArabic: boolean = true) {
  const { language } = useLanguage();
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [isAvailable, setIsAvailable] = useState(!!ExpoSpeechRecognitionModule);

  // Vérifier et demander les permissions au montage
  useEffect(() => {
    if (ExpoSpeechRecognitionModule) {
      checkAndRequestPermissions();
    } else {
      setError("Reconnaissance vocale non disponible. Un nouveau build est nécessaire.");
    }
  }, []);

  const checkAndRequestPermissions = async () => {
    if (!ExpoSpeechRecognitionModule) {
      setHasPermission(false);
      return false;
    }

    try {
      const status = await ExpoSpeechRecognitionModule.getPermissionsAsync();
      __DEV__ && console.log('🎤 Permission status:', status);

      if (status.granted) {
        setHasPermission(true);
        return true;
      }

      if (status.canAskAgain) {
        const result = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
        __DEV__ && console.log('🎤 Permission result:', result);
        setHasPermission(result.granted);
        return result.granted;
      } else {
        setHasPermission(false);
        setError("Permission micro refusée. Allez dans les paramètres pour l'activer.");
        return false;
      }
    } catch (err) {
      __DEV__ && console.error('❌ Error checking permissions:', err);
      setHasPermission(false);
      return false;
    }
  };

  // Utiliser le hook d'événements seulement si disponible
  const eventHook = useSpeechRecognitionEvent || useNoopEvent;

  // Ecoute les résultats de transcription
  eventHook('result', (event: any) => {
    __DEV__ && console.log('🎤 Speech result:', event);
    if (event && event.results && event.results[0]) {
      setTranscript(event.results[0].transcript);
    }
  });

  // Ecoute les erreurs
  eventHook('error', (event: any) => {
    __DEV__ && console.error('🎤 Speech error:', event);
    setError(event.message || JSON.stringify(event));
    setIsListening(false);
  });

  // Ecoute la fin de reconnaissance
  eventHook('end', () => {
    __DEV__ && console.log('🎤 Speech ended');
    setIsListening(false);
  });

  const startListening = useCallback(async () => {
    if (!ExpoSpeechRecognitionModule) {
      Alert.alert(
        "Non disponible",
        "La reconnaissance vocale nécessite un nouveau build de l'application. Utilisez le clavier pour l'instant.",
      );
      return;
    }

    try {
      if (hasPermission === false) {
        const granted = await checkAndRequestPermissions();
        if (!granted) {
          Alert.alert(
            "Permission requise",
            "L'accès au microphone est nécessaire pour la reconnaissance vocale.",
          );
          return;
        }
      }

      setTranscript("");
      setError(null);
      setIsListening(true);

      // Si forceArabic est true, toujours utiliser l'arabe (pour le tuteur)
      // Sinon, utiliser la langue de l'interface
      let voiceLang = 'ar-SA';

      if (!forceArabic) {
        const langMap: Record<string, string> = {
          ar: 'ar-SA',
          fr: 'fr-FR',
          en: 'en-US',
          de: 'de-DE',
          es: 'es-ES',
          ru: 'ru-RU',
          ms: 'ms-MY',
        };
        voiceLang = langMap[language] || 'ar-SA';
      }

      __DEV__ && console.log('🎤 Starting speech recognition with lang:', voiceLang);

      await ExpoSpeechRecognitionModule.start({
        lang: voiceLang,
        interimResults: true,
        continuous: false,
      });
    } catch (err) {
      __DEV__ && console.error('❌ Start listening error:', err);
      setError("Impossible de démarrer: " + (err instanceof Error ? err.message : String(err)));
      setIsListening(false);
    }
  }, [language, hasPermission]);

  const stopListening = useCallback(async () => {
    if (!ExpoSpeechRecognitionModule) return;

    try {
      await ExpoSpeechRecognitionModule.stop();
      setIsListening(false);
    } catch (err) {
      setError("Impossible d'arrêter la reconnaissance vocale");
    }
  }, []);

  return {
    isListening,
    transcript,
    error,
    hasPermission,
    isAvailable,
    startListening,
    stopListening,
    requestPermissions: checkAndRequestPermissions,
  };
}
