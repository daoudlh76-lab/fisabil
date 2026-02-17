/**
 * Analyseur morphologique arabe basé sur des règles linguistiques
 * Sans dépendance à OpenAI - extraction locale pure
 */

import { lookupByAnyForm } from "./bescherelle.ts";

// Particules arabes communes (حروف)
const PARTICLES = new Set([
  // Prépositions
  "مِنْ", "إِلَى", "عَلَى", "فِي", "عَنْ", "بِ", "لِ", "كَ",
  // Conjonctions
  "وَ", "فَ", "ثُمَّ", "أَوْ", "لَكِنَّ", "لَكِنْ", "بَلْ",
  // Particules interrogatives
  "هَلْ", "مَا", "مَنْ", "مَاذَا", "أَيْنَ", "كَيْفَ", "مَتَى", "لِمَاذَا",
  // Particules négatives
  "لا", "لَمْ", "لَنْ", "مَا", "لَيْسَ",
  // Adverbes
  "الآنَ", "هُنَا", "هُنَاكَ", "أَمْسِ", "غَدًا", "اليَوْمَ",
  // Pronoms
  "أَنَا", "أَنْتَ", "أَنْتِ", "هُوَ", "هِيَ", "نَحْنُ", "أَنْتُمْ", "أَنْتُنَّ", "هُمْ", "هُنَّ",
  "هُما", "أَنْتُما",
  // Autres particules
  "إِنَّ", "أَنَّ", "لِأَنَّ", "كَأَنَّ", "قَدْ", "سَوْفَ", "سَ",
]);

/**
 * Normalise un mot arabe (retire les diacritiques et normalise les lettres)
 */
function normalizeArabic(word: string): string {
  return word
    // Retire les diacritiques (تشكيل)
    .replace(/[\u064B-\u065F]/g, "")
    // Normalise les alifs
    .replace(/[أإآٱ]/g, "ا")
    // Normalise les ya
    .replace(/ى/g, "ي");
}

/**
 * Vérifie si un mot commence par un préfixe verbal
 */
function startsWithVerbPrefix(word: string): boolean {
  const normalized = normalizeArabic(word);
  // Préfixes du présent (مضارع): ي، ت، أ، ن
  return /^[يتأن]/.test(normalized);
}

/**
 * Vérifie si un mot est un verbe au passé (pattern فَعَلَ)
 */
function isPastVerb(word: string): boolean {
  const normalized = normalizeArabic(word);
  // Pattern passé 3ms: 3+ lettres, souvent se termine par ـَ
  // Exemples: كتب، ذهب، أكل، استطاع
  return normalized.length >= 2 && !/^[يتأن]/.test(normalized);
}

/**
 * Extrait les verbes d'une liste de mots
 */
async function extractVerbs(words: string[]): Promise<Array<{
  passe_3ms: string;
  present_3ms: string;
  imperatif: string;
  traduction: string;
  remarque: string | null;
}>> {
  const verbs = [];
  const seen = new Set<string>();

  for (const word of words) {
    const normalized = normalizeArabic(word);

    // Skip si déjà traité
    if (seen.has(normalized)) continue;

    // Skip les particules
    if (PARTICLES.has(word)) continue;

    // Skip les mots trop courts (< 2 lettres)
    if (normalized.length < 2) continue;

    // Chercher dans le Bescherelle
    const verbForms = await lookupByAnyForm(word);

    if (verbForms) {
      seen.add(normalized);
      verbs.push({
        passe_3ms: verbForms.passe_3ms,
        present_3ms: verbForms.present_3ms,
        imperatif: verbForms.imperatif,
        traduction: "", // Sera complété par traduction séparée
        remarque: null,
      });
    }
  }

  return verbs;
}

/**
 * Extrait les noms et adjectifs
 */
function extractNouns(words: string[]): Array<{
  singulier: string;
  traduction: string;
  pluriel: string | null;
  contraire: string | null;
  remarque: string | null;
}> {
  const nouns = [];
  const seen = new Set<string>();

  for (const word of words) {
    const normalized = normalizeArabic(word);

    // Skip si déjà traité
    if (seen.has(normalized)) continue;

    // Skip les particules
    if (PARTICLES.has(word)) continue;

    // Skip les mots trop courts
    if (normalized.length < 2) continue;

    // Skip si c'est probablement un verbe
    if (startsWithVerbPrefix(word)) continue;

    seen.add(normalized);
    nouns.push({
      singulier: word,
      traduction: "",
      pluriel: null,
      contraire: null,
      remarque: null,
    });
  }

  return nouns;
}

/**
 * Extrait les particules
 */
function extractParticles(words: string[]): Array<{
  particule_ar: string;
  type: string;
  traduction: string;
  exemple: string | null;
}> {
  const particles = [];
  const seen = new Set<string>();

  for (const word of words) {
    if (PARTICLES.has(word) && !seen.has(word)) {
      seen.add(word);

      let type = "particule";
      if (["مِنْ", "إِلَى", "عَلَى", "فِي", "عَنْ", "بِ", "لِ", "كَ"].includes(word)) {
        type = "préposition";
      } else if (["وَ", "فَ", "ثُمَّ", "أَوْ", "لَكِنَّ", "لَكِنْ", "بَلْ"].includes(word)) {
        type = "conjonction";
      } else if (["أَنَا", "أَنْتَ", "أَنْتِ", "هُوَ", "هِيَ", "نَحْنُ", "هُمْ", "هُنَّ", "هُما", "أَنْتُما"].includes(word)) {
        type = "pronom";
      } else if (["هَلْ", "مَا", "مَنْ", "مَاذَا", "أَيْنَ", "كَيْفَ", "مَتَى", "لِمَاذَا"].includes(word)) {
        type = "pronom interrogatif";
      } else if (["لا", "لَمْ", "لَنْ", "مَا", "لَيْسَ"].includes(word)) {
        type = "particule négative";
      } else if (["الآنَ", "هُنَا", "هُنَاكَ", "أَمْسِ", "غَدًا", "اليَوْمَ"].includes(word)) {
        type = "adverbe";
      }

      particles.push({
        particule_ar: word,
        type,
        traduction: "",
        exemple: null,
      });
    }
  }

  return particles;
}

/**
 * Tokenise le texte arabe en mots
 */
function tokenize(text: string): string[] {
  // Sépare par espaces, ponctuation arabe et occidentale
  return text
    .split(/[\s،؛؟!.,:;?!\n\r]+/)
    .map(w => w.trim())
    .filter(w => w.length > 0)
    .filter(w => /[\u0600-\u06FF]/.test(w)); // Garde uniquement les mots avec caractères arabes
}

/**
 * Analyse un texte arabe et extrait le vocabulaire
 */
export async function analyzeArabicText(text: string): Promise<{
  vocabulaire: Array<any>;
  verbes: Array<any>;
  particules: Array<any>;
}> {
  console.log("[ArabicAnalyzer] Starting rule-based extraction...");

  // 1. Tokenisation
  const words = tokenize(text);
  console.log(`[ArabicAnalyzer] Tokenized ${words.length} words`);

  // 2. Extraction des particules (rapide, pas de traduction)
  const particules = extractParticles(words);
  console.log(`[ArabicAnalyzer] Found ${particules.length} particles`);

  // 3. Extraction des verbes (avec Bescherelle)
  const verbes = await extractVerbs(words);
  console.log(`[ArabicAnalyzer] Found ${verbes.length} verbs in Bescherelle`);

  // 4. Extraction des noms (ce qui reste)
  const vocabulaire = extractNouns(words);
  console.log(`[ArabicAnalyzer] Found ${vocabulaire.length} nouns/adjectives`);

  return {
    vocabulaire,
    verbes,
    particules,
  };
}
