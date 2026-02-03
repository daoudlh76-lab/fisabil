/**
 * Migration utility pour convertir les anciennes données de vocabulaire
 * vers la nouvelle structure (sans mot_ar et verbe_ar)
 */

import type { VocabItem, VerbItem, ExtractVocabResult } from './extract-vocabulary';

/**
 * Migre un item de vocabulaire de l'ancienne vers la nouvelle structure
 */
function migrateVocabItem(item: any): VocabItem {
  // Si l'item a déjà la nouvelle structure, le retourner tel quel
  if (!item.mot_ar && item.singulier) {
    return item as VocabItem;
  }

  // Ancienne structure: mot_ar existe
  // Nouvelle structure: mot_ar n'existe pas, utiliser singulier
  return {
    traduction: item.traduction,
    singulier: item.singulier || item.mot_ar, // Fallback sur mot_ar si singulier manque
    pluriel: item.pluriel || null,
    contraire: item.contraire || null,
    remarque: item.remarque || null,
  };
}

/**
 * Migre un item de verbe de l'ancienne vers la nouvelle structure
 */
function migrateVerbItem(item: any): VerbItem {
  // Si l'item a déjà la nouvelle structure, le retourner tel quel
  if (!item.verbe_ar && item.passe_3ms) {
    return item as VerbItem;
  }

  // Ancienne structure: verbe_ar existe
  // Nouvelle structure: verbe_ar n'existe pas
  return {
    traduction: item.traduction,
    passe_3ms: item.passe_3ms || item.verbe_ar, // Fallback sur verbe_ar si passe_3ms manque
    present_3ms: item.present_3ms,
    imperatif: item.imperatif,
    remarque: item.remarque || null,
  };
}

/**
 * Migre un résultat d'extraction complet
 */
export function migrateExtractVocabResult(data: any): ExtractVocabResult {
  if (!data) {
    return {
      meta: { ui_lang: 'fr', source: 'empty', model: 'none' },
      vocabulaire: [],
      verbes: [],
      particules: [],
    };
  }

  return {
    meta: data.meta || { ui_lang: 'fr', source: 'unknown', model: 'unknown' },
    vocabulaire: (data.vocabulaire || []).map(migrateVocabItem),
    verbes: (data.verbes || []).map(migrateVerbItem),
    particules: data.particules || [],
  };
}

/**
 * Vérifie si les données ont besoin d'être migrées
 */
export function needsMigration(data: any): boolean {
  if (!data) return false;

  // Vérifier si vocabulaire contient des items avec mot_ar
  const hasOldVocab = data.vocabulaire?.some((item: any) => 'mot_ar' in item);

  // Vérifier si verbes contient des items avec verbe_ar
  const hasOldVerbs = data.verbes?.some((item: any) => 'verbe_ar' in item);

  return hasOldVocab || hasOldVerbs;
}
