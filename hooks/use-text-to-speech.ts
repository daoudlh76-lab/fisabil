import { useVoicePreference } from '@/contexts/voice-preference-context';
import { speakWithOpenAI, stopTTS } from '@/src/utils/openai-tts';
import { useCallback, useState } from 'react';

export const useTextToSpeech = () => {
  const [isConverting, setIsConverting] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [conversionProgress, setConversionProgress] = useState(0);

  // Préférence de voix (homme/femme)
  const { gender } = useVoicePreference();

  // Fonction pour lire le texte à voix haute (OpenAI TTS natural voice)
  const speakText = useCallback(
    async (text: string, language: string = 'ar-SA'): Promise<void> => {
      try {
        // Arrêter la parole précédente si elle est en cours
        await stopTTS();
        setIsSpeaking(true);

        const speed = language.startsWith('ar') ? 0.9 : 1.0;
        __DEV__ && console.log(`🔊 Lecture avec voix ${gender === 'female' ? 'féminine' : 'masculine'} (locale, gender: ${gender})`);

        await speakWithOpenAI({
          text,
          gender,
          speed,
          language,
          onDone: () => {
            setIsSpeaking(false);
            __DEV__ && console.log('🔊 Lecture terminée');
          },
          onError: (err) => {
            __DEV__ && console.error('Erreur synthèse vocale:', err);
            setIsSpeaking(false);
          },
        });
      } catch (error) {
        __DEV__ && console.error('Erreur synthèse vocale:', error);
      } finally {
        setIsSpeaking(false);
      }
    },
    [gender]
  );

  // Fonction pour arrêter la parole
  const stopSpeaking = useCallback(async () => {
    try {
      await stopTTS();
      setIsSpeaking(false);
    } catch (error) {
      __DEV__ && console.error('Erreur arrêt parole:', error);
    }
  }, []);

  // Fonction de génération de fichier audio (retourne null car expo-speech ne génère pas de fichiers)
  // Pour générer de vrais fichiers audio, il faudrait utiliser une API externe (Google TTS, AWS Polly, etc.)
  const generateAudioFile = useCallback(
    async (text: string, language: string = 'ar-SA'): Promise<string | null> => {
      try {
        setIsConverting(true);
        setConversionProgress(0);

        // Note: expo-speech ne peut pas générer de fichiers audio
        // On utilise directement la lecture vocale à la place
        __DEV__ && console.log('📢 Utilisation de la synthèse vocale en temps réel');
        
        setConversionProgress(100);
        
        // Retourner null car on ne génère pas de fichier
        // L'app utilisera speakText() pour la lecture
        return null;
      } catch (error) {
        __DEV__ && console.error('Erreur conversion texte-audio:', error);
        return null;
      } finally {
        setIsConverting(false);
        setConversionProgress(0);
      }
    },
    []
  );

  return {
    generateAudioFile,
    speakText,
    stopSpeaking,
    isConverting,
    isSpeaking,
    conversionProgress,
  };
};
