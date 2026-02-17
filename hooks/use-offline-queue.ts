import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { supabase } from '@/src/lib/supabase';

/**
 * Hook de gestion de la file d'attente hors ligne
 *
 * Permet de stocker les actions effectuées sans connexion Internet
 * et de les rejouer automatiquement quand la connexion revient
 */

export type QueueAction =
  | { type: 'insert'; table: string; data: any }
  | { type: 'update'; table: string; id: string; data: any }
  | { type: 'delete'; table: string; id: string }
  | { type: 'upsert'; table: string; data: any };

interface QueueItem {
  id: string;
  action: QueueAction;
  timestamp: string;
  retryCount: number;
  error?: string;
}

const QUEUE_KEY = '@fisabil_offline_queue';
const MAX_RETRIES = 3;

export const useOfflineQueue = () => {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isOnline, setIsOnline] = useState(true);

  // Charger la queue au démarrage
  useEffect(() => {
    loadQueue();
  }, []);

  // Surveiller la connexion Internet
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      const wasOffline = !isOnline;
      const isNowOnline = state.isConnected ?? false;

      setIsOnline(isNowOnline);

      // Si on vient de se reconnecter, traiter la queue
      if (wasOffline && isNowOnline && queue.length > 0) {
        __DEV__ && console.log('📡 Connexion rétablie, traitement de la queue...');
        processQueue();
      }
    });

    return () => unsubscribe();
  }, [isOnline, queue.length]);

  /**
   * Charger la queue depuis AsyncStorage
   */
  const loadQueue = useCallback(async () => {
    try {
      const stored = await AsyncStorage.getItem(QUEUE_KEY);
      if (stored) {
        const parsed: QueueItem[] = JSON.parse(stored);
        setQueue(parsed);
        __DEV__ && console.log(`📋 Queue chargée: ${parsed.length} actions en attente`);
      }
    } catch (error) {
      __DEV__ && console.error('Erreur chargement queue:', error);
    }
  }, []);

  /**
   * Sauvegarder la queue dans AsyncStorage
   */
  const saveQueue = useCallback(async (items: QueueItem[]) => {
    try {
      await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(items));
      setQueue(items);
    } catch (error) {
      __DEV__ && console.error('Erreur sauvegarde queue:', error);
    }
  }, []);

  /**
   * Ajouter une action à la queue
   */
  const enqueue = useCallback(
    async (action: QueueAction) => {
      const item: QueueItem = {
        id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
        action,
        timestamp: new Date().toISOString(),
        retryCount: 0,
      };

      const newQueue = [...queue, item];
      await saveQueue(newQueue);

      __DEV__ && console.log('➕ Action ajoutée à la queue:', action.type, action.table);

      // Si en ligne, traiter immédiatement
      if (isOnline) {
        processQueue();
      }
    },
    [queue, saveQueue, isOnline]
  );

  /**
   * Exécuter une action de la queue
   */
  const executeAction = useCallback(async (action: QueueAction): Promise<boolean> => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;

      if (!userId) {
        __DEV__ && console.warn('Pas d\'utilisateur connecté, impossible d\'exécuter l\'action');
        return false;
      }

      switch (action.type) {
        case 'insert': {
          const payload = Array.isArray(action.data)
            ? action.data.map((item) => ({ ...item, user_id: userId }))
            : { ...action.data, user_id: userId };

          const { error } = await supabase.from(action.table).insert(payload);

          if (error) {
            __DEV__ && console.error('Erreur insert:', error);
            return false;
          }
          break;
        }

        case 'update': {
          const { error } = await supabase
            .from(action.table)
            .update(action.data)
            .eq('id', action.id)
            .eq('user_id', userId);

          if (error) {
            __DEV__ && console.error('Erreur update:', error);
            return false;
          }
          break;
        }

        case 'delete': {
          const { error } = await supabase
            .from(action.table)
            .delete()
            .eq('id', action.id)
            .eq('user_id', userId);

          if (error) {
            __DEV__ && console.error('Erreur delete:', error);
            return false;
          }
          break;
        }

        case 'upsert': {
          const payload = Array.isArray(action.data)
            ? action.data.map((item) => ({ ...item, user_id: userId }))
            : { ...action.data, user_id: userId };

          const { error } = await supabase.from(action.table).upsert(payload);

          if (error) {
            __DEV__ && console.error('Erreur upsert:', error);
            return false;
          }
          break;
        }
      }

      __DEV__ && console.log('✅ Action exécutée:', action.type, action.table);
      return true;
    } catch (error) {
      __DEV__ && console.error('Erreur executeAction:', error);
      return false;
    }
  }, []);

  /**
   * Traiter toute la queue
   */
  const processQueue = useCallback(async () => {
    if (isProcessing || queue.length === 0 || !isOnline) {
      return;
    }

    setIsProcessing(true);
    __DEV__ && console.log(`🔄 Traitement de ${queue.length} actions en queue...`);

    const remainingQueue: QueueItem[] = [];

    for (const item of queue) {
      const success = await executeAction(item.action);

      if (!success) {
        // Si échec et moins de MAX_RETRIES, remettre en queue
        if (item.retryCount < MAX_RETRIES) {
          remainingQueue.push({
            ...item,
            retryCount: item.retryCount + 1,
            error: `Échec tentative ${item.retryCount + 1}/${MAX_RETRIES}`,
          });
        } else {
          __DEV__ && console.error('❌ Action abandonnée après', MAX_RETRIES, 'tentatives:', item.action);
        }
      }
    }

    await saveQueue(remainingQueue);
    setIsProcessing(false);

    if (remainingQueue.length === 0) {
      __DEV__ && console.log('✅ Queue vidée avec succès');
    } else {
      __DEV__ && console.log(`⚠️ ${remainingQueue.length} actions restantes en queue`);
    }
  }, [isProcessing, queue, isOnline, executeAction, saveQueue]);

  /**
   * Vider complètement la queue
   */
  const clearQueue = useCallback(async () => {
    await saveQueue([]);
    __DEV__ && console.log('🗑️ Queue vidée');
  }, [saveQueue]);

  /**
   * Effectuer une action avec fallback offline
   */
  const executeWithFallback = useCallback(
    async (action: QueueAction): Promise<boolean> => {
      if (isOnline) {
        // Si en ligne, exécuter directement
        const success = await executeAction(action);
        if (success) return true;
      }

      // Sinon, ajouter à la queue
      __DEV__ && console.log('📴 Hors ligne, action mise en queue');
      await enqueue(action);
      return false; // Retourne false pour indiquer que l'action est en attente
    },
    [isOnline, executeAction, enqueue]
  );

  return {
    queue,
    isProcessing,
    isOnline,
    enqueue,
    processQueue,
    clearQueue,
    executeWithFallback,
  };
};
