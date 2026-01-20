import { useState, useCallback } from 'react';
import * as Speech from 'expo-speech';

export const useTextToSpeech = () => {
  const [isConverting, setIsConverting] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [conversionProgress, setConversionProgress] = useState(0);

  // Fonction pour lire le texte à voix haute (synthèse vocale)
  const speakText = useCallback(
    async (text: string, language: string = 'ar-SA'): Promise<void> => {
      try {
        // Arrêter la parole précédente si elle est en cours
        await Speech.stop();
        setIsSpeaking(true);

        await Speech.speak(text, {
          language,
          pitch: 1.0,
          rate: 0.85,
          onDone: () => {
            setIsSpeaking(false);
            console.log('🔊 Lecture terminée');
          },
          onError: (err) => {
            console.error('Erreur synthèse vocale:', err);
            setIsSpeaking(false);
          },
        });
      } catch (error) {
        console.error('Erreur synthèse vocale:', error);
        setIsSpeaking(false);
      }
    },
    []
  );

  // Fonction pour arrêter la parole
  const stopSpeaking = useCallback(async () => {
    try {
      await Speech.stop();
      setIsSpeaking(false);
    } catch (error) {
      console.error('Erreur arrêt parole:', error);
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
        console.log('📢 Utilisation de la synthèse vocale en temps réel');
        
        setConversionProgress(100);
        
        // Retourner null car on ne génère pas de fichier
        // L'app utilisera speakText() pour la lecture
        return null;
      } catch (error) {
        console.error('Erreur conversion texte-audio:', error);
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
