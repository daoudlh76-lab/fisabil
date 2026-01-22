import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type Gender = 'male' | 'female';

interface VoicePreferenceContextType {
  gender: Gender;
  setGender: (gender: Gender) => Promise<void>;
  isReady: boolean;
}

const VoicePreferenceContext = createContext<VoicePreferenceContextType | undefined>(undefined);

const VOICE_PREFERENCE_KEY = 'user_voice_preference';

export function VoicePreferenceProvider({ children }: { children: ReactNode }) {
  const [gender, setGenderState] = useState<Gender>('male');
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const loadPreference = async () => {
      try {
        const stored = await AsyncStorage.getItem(VOICE_PREFERENCE_KEY);
        if (stored === 'male' || stored === 'female') {
          setGenderState(stored);
        }
      } catch (e) {
        console.error('Error loading voice preference:', e);
      } finally {
        setIsReady(true);
      }
    };
    loadPreference();
  }, []);

  const setGender = async (newGender: Gender) => {
    try {
      await AsyncStorage.setItem(VOICE_PREFERENCE_KEY, newGender);
      setGenderState(newGender);
    } catch (e) {
      console.error('Error saving voice preference:', e);
    }
  };

  return (
    <VoicePreferenceContext.Provider value={{ gender, setGender, isReady }}>
      {children}
    </VoicePreferenceContext.Provider>
  );
}

export function useVoicePreference(): VoicePreferenceContextType {
  const context = useContext(VoicePreferenceContext);
  if (!context) {
    throw new Error('useVoicePreference must be used within VoicePreferenceProvider');
  }
  return context;
}

// Mapping des voix par genre pour expo-speech
// Note: Les voix disponibles varient selon l'appareil
export const getVoiceOptionsForGender = (gender: Gender) => {
  if (gender === 'female') {
    return {
      // Voix féminines arabes
      pitch: 1.1,
      // Sur iOS, on peut spécifier une voix
      voice: 'com.apple.voice.compact.ar-SA.Maged', // Fallback, sera ignoré si pas dispo
    };
  }
  return {
    // Voix masculines (défaut)
    pitch: 0.9,
    voice: 'com.apple.voice.compact.ar-SA.Maged',
  };
};

// Pour OpenAI Realtime API
export const getOpenAIVoiceForGender = (gender: Gender): string => {
  // Voix disponibles: alloy, ash, ballad, coral, sage, shimmer, verse, marin, cedar
  // ash, verse, cedar = plus masculines
  // shimmer, coral, sage = plus féminines
  return gender === 'female' ? 'shimmer' : 'ash';
};
