import { useState, useCallback, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

type FeatureKey = 'scanner' | 'tutor' | 'dictation';

interface DailyUsage {
  date: string;
  count: number;
}

const STORAGE_PREFIX = '@fisabil_daily_';

export const useDailyLimit = (featureKey: FeatureKey, limit: number) => {
  const [usage, setUsage] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  // Charger l'utilisation du jour
  const loadUsage = useCallback(async () => {
    try {
      const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
      const storageKey = `${STORAGE_PREFIX}${featureKey}`;
      const data = await AsyncStorage.getItem(storageKey);

      if (data) {
        const parsed: DailyUsage = JSON.parse(data);
        // Si c'est le même jour, charger le compteur
        if (parsed.date === today) {
          setUsage(parsed.count);
        } else {
          // Nouveau jour, réinitialiser
          setUsage(0);
          await AsyncStorage.setItem(
            storageKey,
            JSON.stringify({ date: today, count: 0 })
          );
        }
      } else {
        // Première utilisation
        setUsage(0);
        await AsyncStorage.setItem(
          storageKey,
          JSON.stringify({ date: today, count: 0 })
        );
      }
    } catch (error) {
      console.error('Erreur chargement limite quotidienne:', error);
      setUsage(0);
    } finally {
      setLoading(false);
    }
  }, [featureKey]);

  useEffect(() => {
    loadUsage();
  }, [loadUsage]);

  // Incrémenter le compteur
  const incrementUsage = useCallback(async (): Promise<boolean> => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const storageKey = `${STORAGE_PREFIX}${featureKey}`;

      // Vérifier si on a atteint la limite
      if (usage >= limit) {
        return false;
      }

      const newCount = usage + 1;
      await AsyncStorage.setItem(
        storageKey,
        JSON.stringify({ date: today, count: newCount })
      );

      setUsage(newCount);
      return true;
    } catch (error) {
      console.error('Erreur incrémentation usage:', error);
      return false;
    }
  }, [featureKey, usage, limit]);

  // Vérifier si on peut utiliser la fonctionnalité
  const canUse = usage < limit;

  // Nombre d'utilisations restantes
  const remaining = Math.max(0, limit - usage);

  return {
    usage,
    limit,
    canUse,
    remaining,
    incrementUsage,
    loading,
    reload: loadUsage,
  };
};
