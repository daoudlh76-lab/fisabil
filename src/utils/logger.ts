/**
 * Utilitaire de logging pour production
 * Les logs sont désactivés en production pour éviter les fuites d'information
 * et améliorer les performances
 */

const isDev = __DEV__;

export const logger = {
  log: (...args: any[]) => {
    if (isDev) {
      console.log(...args);
    }
  },

  warn: (...args: any[]) => {
    if (isDev) {
      console.warn(...args);
    }
  },

  error: (...args: any[]) => {
    // Les erreurs sont toujours loguées (utile pour le monitoring)
    console.error(...args);
  },

  debug: (...args: any[]) => {
    if (isDev) {
      console.log('[DEBUG]', ...args);
    }
  },
};

export default logger;
