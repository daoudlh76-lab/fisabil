import { useState, useCallback, useRef, useEffect } from 'react';
import * as Speech from 'expo-speech';
import { useVoicePreference } from '@/contexts/voice-preference-context';

export interface DictationEntry {
  id: string;
  originalText: string;
  userText: string;
  errors: ErrorDetail[];
  isCorrect: boolean;
  attempts: number;
}

export interface ErrorDetail {
  position: number;
  expected: string;
  got: string;
}

// Vitesses de lecture disponibles
export const PLAYBACK_SPEEDS = [0.5, 0.75, 1.0, 1.25, 1.5];

export const useDictation = () => {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [currentText, setCurrentText] = useState('');
  const [dictations, setDictations] = useState<DictationEntry[]>([]);
  const [playbackSpeed, setPlaybackSpeed] = useState(0.75);
  const [currentSegmentIndex, setCurrentSegmentIndex] = useState(0);

  // Préférence de voix (homme/femme)
  const { gender } = useVoicePreference();

  // Références pour gérer la lecture segmentée
  const segmentsRef = useRef<string[]>([]);
  const currentIndexRef = useRef(0);
  const isPlayingRef = useRef(false);
  const speedRef = useRef(0.75);
  const genderRef = useRef(gender);

  // Mettre à jour la ref quand le genre change
  useEffect(() => {
    genderRef.current = gender;
  }, [gender]);

  // Découper le texte en segments (mots groupés par ~5)
  const splitIntoSegments = useCallback((text: string): string[] => {
    const words = text.trim().split(/\s+/);
    const segments: string[] = [];
    const wordsPerSegment = 5;
    
    for (let i = 0; i < words.length; i += wordsPerSegment) {
      segments.push(words.slice(i, i + wordsPerSegment).join(' '));
    }
    
    return segments;
  }, []);

  // Lire un segment spécifique
  const speakSegmentInternal = useCallback((index: number) => {
    if (index < 0 || index >= segmentsRef.current.length) {
      console.log('✅ Lecture terminée (tous les segments)');
      setIsSpeaking(false);
      setIsPaused(false);
      isPlayingRef.current = false;
      return;
    }

    const segment = segmentsRef.current[index];
    currentIndexRef.current = index;
    setCurrentSegmentIndex(index);

    // Pitch différencié mais naturel: homme (0.85-0.9), femme (1.1-1.15)
    const pitch = genderRef.current === 'female' ? 1.12 : 0.88;

    Speech.speak(segment, {
      language: 'ar-SA',
      rate: speedRef.current,
      pitch: pitch,
      volume: 1.0, // Volume maximum pour meilleure audibilité
      onDone: () => {
        if (isPlayingRef.current) {
          // Passer au segment suivant
          speakSegmentInternal(index + 1);
        }
      },
      onError: (error) => {
        console.error('❌ Erreur synthèse vocale:', error);
        setIsSpeaking(false);
        setIsPaused(false);
        isPlayingRef.current = false;
      },
      onStart: () => {
        if (index === 0) {
          console.log('▶️ Lecture démarrée');
        }
      },
    });
  }, []);

  // Démarrer la lecture
  const speakSentence = useCallback((text: string) => {
    if (!text || text.trim().length === 0) {
      console.error('❌ Aucun texte à lire');
      return;
    }
    
    console.log('🔊 Lecture du texte:', text.substring(0, 50) + '...');
    
    // Arrêter toute lecture en cours
    Speech.stop();
    
    // Préparer les segments
    segmentsRef.current = splitIntoSegments(text);
    currentIndexRef.current = 0;
    isPlayingRef.current = true;
    
    setIsSpeaking(true);
    setIsPaused(false);
    setCurrentSegmentIndex(0);
    
    // Commencer la lecture
    speakSegmentInternal(0);
  }, [splitIntoSegments, speakSegmentInternal]);

  // Mettre en pause
  const pause = useCallback(() => {
    console.log('⏸️ Pause');
    Speech.stop();
    isPlayingRef.current = false;
    setIsPaused(true);
    setIsSpeaking(false);
  }, []);

  // Reprendre la lecture
  const resume = useCallback(() => {
    console.log('▶️ Reprise depuis segment', currentIndexRef.current);
    isPlayingRef.current = true;
    setIsPaused(false);
    setIsSpeaking(true);
    speakSegmentInternal(currentIndexRef.current);
  }, [speakSegmentInternal]);

  // Basculer lecture/pause
  const togglePlayPause = useCallback(() => {
    if (isSpeaking) {
      pause();
    } else if (isPaused) {
      resume();
    }
  }, [isSpeaking, isPaused, pause, resume]);

  // Arrêter complètement
  const stop = useCallback(() => {
    console.log('⏹️ Stop');
    Speech.stop();
    isPlayingRef.current = false;
    setIsSpeaking(false);
    setIsPaused(false);
    currentIndexRef.current = 0;
    setCurrentSegmentIndex(0);
  }, []);

  // Reculer de N segments (environ 5 secondes = 1 segment, 10 secondes = 2 segments)
  const rewindSegments = useCallback((segments: number) => {
    const newIndex = Math.max(0, currentIndexRef.current - segments);
    console.log(`⏪ Retour de ${segments} segments vers ${newIndex}`);
    
    Speech.stop();
    currentIndexRef.current = newIndex;
    setCurrentSegmentIndex(newIndex);
    
    // Toujours reprendre la lecture après le retour
    isPlayingRef.current = true;
    setIsSpeaking(true);
    setIsPaused(false);
    speakSegmentInternal(newIndex);
  }, [speakSegmentInternal]);

  // Reculer de 5 secondes (~1 segment)
  const rewind5s = useCallback(() => rewindSegments(1), [rewindSegments]);

  // Reculer de 10 secondes (~2 segments)
  const rewind10s = useCallback(() => rewindSegments(2), [rewindSegments]);

  // Changer la vitesse de lecture
  const changeSpeed = useCallback((speed: number) => {
    console.log(`🔄 Vitesse: ${speed}x`);
    setPlaybackSpeed(speed);
    speedRef.current = speed;
    
    // Si en cours de lecture, redémarrer avec la nouvelle vitesse
    if (isPlayingRef.current) {
      Speech.stop();
      setTimeout(() => {
        speakSegmentInternal(currentIndexRef.current);
      }, 100);
    }
  }, [speakSegmentInternal]);

  const checkDictation = useCallback(
    (original: string, userInput: string): ErrorDetail[] => {
      const errors: ErrorDetail[] = [];
      const maxLen = Math.max(original.length, userInput.length);

      for (let i = 0; i < maxLen; i++) {
        if (original[i] !== userInput[i]) {
          errors.push({
            position: i,
            expected: original[i] || '∅',
            got: userInput[i] || '∅',
          });
        }
      }
      return errors;
    },
    []
  );

  const submitDictation = useCallback(
    (id: string, originalText: string) => {
      const errors = checkDictation(originalText, currentText);
      const isCorrect = errors.length === 0;

      const entry: DictationEntry = {
        id,
        originalText,
        userText: currentText,
        errors,
        isCorrect,
        attempts: 1,
      };

      setDictations((prev) => [...prev, entry]);
      return entry;
    },
    [currentText, checkDictation]
  );

  // Calculer la progression
  const progress = segmentsRef.current.length > 0 
    ? (currentSegmentIndex / segmentsRef.current.length) * 100 
    : 0;

  return {
    // État
    isSpeaking,
    isPaused,
    currentText,
    setCurrentText,
    dictations,
    playbackSpeed,
    progress,
    currentSegmentIndex,
    totalSegments: segmentsRef.current.length,
    
    // Contrôles de lecture
    speakSentence,
    togglePlayPause,
    pause,
    resume,
    stop,
    rewind5s,
    rewind10s,
    changeSpeed,
    
    // Dictée
    submitDictation,
  };
};
