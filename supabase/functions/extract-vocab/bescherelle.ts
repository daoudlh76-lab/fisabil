/**
 * Bescherelle arabe - Lookup dans le dictionnaire complet (17,031 verbes)
 * Source: Qutrub (https://github.com/linuxscout/qutrub)
 *
 * Données intégrées dans bescherelle-data.ts pour compatibilité Edge Functions.
 */

import VERBS from "./bescherelle-data.ts";

type VerbForms = {
  passe_3ms: string;
  present_3ms: string;
  imperatif: string;
};

/**
 * Normalise un mot arabe en supprimant les diacritiques
 */
function stripDiacritics(word: string): string {
  return word.replace(/[\u064B-\u065F\u0670]/g, "");
}

/**
 * Cherche un verbe par n'importe quelle forme (passé, présent, impératif)
 * Compare avec et sans diacritiques pour maximiser les chances de match.
 */
export function lookupByAnyForm(arabicWord: string): VerbForms | null {
  const wordNorm = stripDiacritics(arabicWord);

  // 1. Cherche directement par la clé (forme passé)
  if (VERBS[arabicWord]) {
    const forms = VERBS[arabicWord];
    return { passe_3ms: forms[0], present_3ms: forms[1], imperatif: forms[2] };
  }

  // 2. Cherche par clé sans diacritiques
  for (const [past, forms] of Object.entries(VERBS)) {
    if (stripDiacritics(past) === wordNorm) {
      return { passe_3ms: forms[0], present_3ms: forms[1], imperatif: forms[2] };
    }
  }

  // 3. Cherche dans les formes présent et impératif
  for (const [, forms] of Object.entries(VERBS)) {
    if (
      forms[1] === arabicWord || stripDiacritics(forms[1]) === wordNorm ||
      forms[2] === arabicWord || stripDiacritics(forms[2]) === wordNorm
    ) {
      return { passe_3ms: forms[0], present_3ms: forms[1], imperatif: forms[2] };
    }
  }

  return null;
}

/**
 * Cherche un verbe par sa forme au passé 3ms
 */
export function lookupByPast(past_3ms: string): VerbForms | null {
  const forms = VERBS[past_3ms];
  if (!forms) {
    // Essayer sans diacritiques
    const norm = stripDiacritics(past_3ms);
    for (const [past, f] of Object.entries(VERBS)) {
      if (stripDiacritics(past) === norm) {
        return { passe_3ms: f[0], present_3ms: f[1], imperatif: f[2] };
      }
    }
    return null;
  }
  return { passe_3ms: forms[0], present_3ms: forms[1], imperatif: forms[2] };
}
