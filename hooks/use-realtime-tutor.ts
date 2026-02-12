/**
 * Hook pour le tuteur en temps réel - DÉSACTIVÉ TEMPORAIREMENT
 *
 * ⚠️ Cette feature est désactivée car elle nécessite un WebSocket direct vers OpenAI,
 * ce qui exposerait la clé API côté client.
 *
 * Solutions possibles pour réactiver :
 * 1. Créer une Edge Function proxy WebSocket (complexe, ~6h de dev)
 * 2. Utiliser le mode chat classique (use-chat-tutor) qui passe par Edge Function
 * 3. Implémenter un polling avec generate-tutor Edge Function
 */

export function useRealtimeTutor() {
  if (__DEV__) {
    console.warn('⚠️ [useRealtimeTutor] Feature temporairement désactivée (sécurité production)');
    console.warn('💡 Utilisez use-chat-tutor pour le mode conversation classique');
  }

  return {
    isConnected: false,
    isListening: false,
    isSpeaking: false,
    isPaused: false,
    messages: [],
    userTexts: [],
    error: 'Feature temporairement désactivée - utilisez le chat tuteur classique',

    // Méthodes vides pour compatibilité
    connect: () => {
      console.warn('[useRealtimeTutor] Feature désactivée');
    },
    disconnect: () => {},
    startListening: () => {
      console.warn('[useRealtimeTutor] Feature désactivée');
    },
    stopListening: () => {},
    pause: () => {},
    resume: () => {},
    stop: () => {},
    loadUserTexts: async () => {},
    selectText: () => {},
  };
}
