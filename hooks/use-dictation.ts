import { useVoicePreference, getVoiceOptionsForGender } from '@/contexts/voice-preference-context';
import * as Speech from 'expo-speech';
import { useCallback, useEffect, useRef, useState } from 'react';

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

  // Découper le texte en segments respectant la ponctuation
  const splitIntoSegments = useCallback((text: string): string[] => {
    // D'abord, séparer aux signes de ponctuation arabes et latins
    // On garde la ponctuation attachée au segment précédent
    const punctuationSplit = text
      .split(/(?<=[.،؟!؛:\n。])\s*/)
      .map(s => s.trim())
      .filter(s => s.length > 0);

    const segments: string[] = [];
    const maxWordsPerSegment = 12;

    for (const part of punctuationSplit) {
      const wordCount = part.split(/\s+/).length;
      if (wordCount <= maxWordsPerSegment) {
        // Segment court → garder tel quel
        segments.push(part);
      } else {
        // Segment trop long → sous-découper par groupes de mots
        const words = part.split(/\s+/);
        for (let i = 0; i < words.length; i += maxWordsPerSegment) {
          const chunk = words.slice(i, i + maxWordsPerSegment).join(' ');
          if (chunk.length > 0) segments.push(chunk);
        }
      }
    }

    // Fusionner les segments trop courts (< 3 mots) avec le suivant
    const merged: string[] = [];
    let buffer = '';
    for (const seg of segments) {
      if (buffer) {
        buffer += ' ' + seg;
        if (buffer.split(/\s+/).length >= 3) {
          merged.push(buffer);
          buffer = '';
        }
      } else if (seg.split(/\s+/).length < 3 && merged.length > 0) {
        // Segment trop court, l'ajouter au précédent
        merged[merged.length - 1] += ' ' + seg;
      } else if (seg.split(/\s+/).length < 3) {
        buffer = seg;
      } else {
        merged.push(seg);
      }
    }
    if (buffer) {
      if (merged.length > 0) merged[merged.length - 1] += ' ' + buffer;
      else merged.push(buffer);
    }

    return merged.length > 0 ? merged : [text];
  }, []);

  // Lire un segment spécifique (expo-speech LOCAL - même voix que le tuteur)
  const speakSegmentInternal = useCallback((index: number) => {
    if (index < 0 || index >= segmentsRef.current.length) {
      __DEV__ && console.log('✅ Lecture terminée (tous les segments)');
      setIsSpeaking(false);
      setIsPaused(false);
      isPlayingRef.current = false;
      return;
    }

    const segment = segmentsRef.current[index];
    currentIndexRef.current = index;
    setCurrentSegmentIndex(index);

    if (index === 0) {
      __DEV__ && console.log('▶️ Lecture démarrée');
    }

    // Utiliser les mêmes options de voix que le tuteur
    const voiceOptions = getVoiceOptionsForGender(genderRef.current);

    Speech.speak(segment, {
      language: 'ar',
      pitch: voiceOptions.pitch,
      rate: speedRef.current * 0.85, // Ajuster le rate avec la vitesse sélectionnée
      onDone: () => {
        if (isPlayingRef.current) {
          // Passer au segment suivant
          speakSegmentInternal(index + 1);
        }
      },
      onError: (err) => {
        __DEV__ && console.error('❌ Erreur synthèse vocale:', err);
        setIsSpeaking(false);
        setIsPaused(false);
        isPlayingRef.current = false;
      },
    });
  }, []);

  // Démarrer la lecture
  const speakSentence = useCallback((text: string) => {
    if (!text || text.trim().length === 0) {
      __DEV__ && console.error('❌ Aucun texte à lire');
      return;
    }
    
    __DEV__ && console.log('🔊 Lecture du texte:', text.substring(0, 50) + '...');
    
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
    __DEV__ && console.log('⏸️ Pause');
    isPlayingRef.current = false;
    Speech.stop();
    setIsPaused(true);
    setIsSpeaking(false);
  }, []);

  // Reprendre la lecture
  const resume = useCallback(() => {
    __DEV__ && console.log('▶️ Reprise depuis segment', currentIndexRef.current);
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
    __DEV__ && console.log('⏹️ Stop');
    isPlayingRef.current = false;
    Speech.stop();
    setIsSpeaking(false);
    setIsPaused(false);
    currentIndexRef.current = 0;
    setCurrentSegmentIndex(0);
  }, []);

  // Fonction interne pour reculer et relancer la lecture à un index donné
  const rewindToIndex = useCallback((newIndex: number) => {
    __DEV__ && console.log(`⏪ Retour vers segment ${newIndex}`);

    // IMPORTANT : désactiver isPlaying AVANT Speech.stop pour éviter que le onDone
    // de l'ancienne lecture ne déclenche le segment suivant
    isPlayingRef.current = false;
    Speech.stop();

    currentIndexRef.current = newIndex;
    setCurrentSegmentIndex(newIndex);

    // Redémarrer la lecture après un petit délai pour laisser le stop se terminer
    setTimeout(() => {
      isPlayingRef.current = true;
      setIsSpeaking(true);
      setIsPaused(false);
      speakSegmentInternal(newIndex);
    }, 150);
  }, [speakSegmentInternal]);

  // Reculer de 5 secondes → rejouer le segment actuel depuis le début
  const rewind5s = useCallback(() => {
    rewindToIndex(currentIndexRef.current);
  }, [rewindToIndex]);

  // Reculer de 10 secondes → reculer d'1 segment
  const rewind10s = useCallback(() => {
    const newIndex = Math.max(0, currentIndexRef.current - 1);
    rewindToIndex(newIndex);
  }, [rewindToIndex]);

  // Changer la vitesse de lecture
  const changeSpeed = useCallback((speed: number) => {
    __DEV__ && console.log(`🔄 Vitesse: ${speed}x`);
    setPlaybackSpeed(speed);
    speedRef.current = speed;
    
    // Si en cours de lecture, redémarrer avec la nouvelle vitesse
    if (isPlayingRef.current) {
      isPlayingRef.current = false;
      Speech.stop();
      setTimeout(() => {
        isPlayingRef.current = true;
        speakSegmentInternal(currentIndexRef.current);
      }, 150);
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
