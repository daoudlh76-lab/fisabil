/**
 * Chargement du vocabulaire connu de l'apprenant depuis ai_cache (= dictionnaire des statistiques).
 * Source unique partagée par tous les hooks tuteur.
 * Déduplique et retourne une liste compacte « mot (traduction) » pour injection dans les prompts GPT.
 */

import { supabase } from '@/src/lib/supabase';
import { needsMigration, migrateExtractVocabResult } from '@/src/lib/migrate-vocab-data';

export interface LearnerWord {
  wordAr: string;        // mot arabe (avec tashkeel)
  translation: string;   // traduction dans la langue de l'UI
  type: 'vocab' | 'verb' | 'particle';
}

/**
 * Charge TOUT le vocabulaire de l'apprenant depuis ai_cache (même source que le dictionnaire dans Statistiques).
 * Déduplique par la racine sans diacritiques.
 */
export async function loadLearnerWords(): Promise<LearnerWord[]> {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user?.id;
    if (!userId) return [];

    const { data: cacheRows, error } = await supabase
      .from('ai_cache')
      .select('payload')
      .eq('user_id', userId)
      .like('key', 'ai_vocab_%');

    if (error || !cacheRows?.length) return [];

    const words: LearnerWord[] = [];
    const seen = new Set<string>();

    for (const row of cacheRows) {
      let payload = row.payload as any;
      if (!payload) continue;

      // Migrer automatiquement si nécessaire (même logique que statistics.tsx)
      if (needsMigration(payload)) {
        payload = migrateExtractVocabResult(payload);
      }

      // Vocabulaire (noms / adjectifs)
      for (const item of payload.vocabulaire || []) {
        const raw = item.singulier || item.word || '';
        const key = raw.replace(/[\u064B-\u0652]/g, '').trim();
        if (key && !seen.has(key)) {
          seen.add(key);
          words.push({
            wordAr: raw,
            translation: item.traduction || item.translation || '',
            type: 'vocab',
          });
        }
      }

      // Verbes
      for (const item of payload.verbes || []) {
        const raw = item.passe_3ms || item.word || '';
        const key = raw.replace(/[\u064B-\u0652]/g, '').trim();
        if (key && !seen.has(key)) {
          seen.add(key);
          words.push({
            wordAr: raw,
            translation: item.traduction || item.translation || '',
            type: 'verb',
          });
        }
      }

      // Particules
      for (const item of payload.particules || []) {
        const raw = item.particule_ar || item.word || '';
        const key = raw.replace(/[\u064B-\u0652]/g, '').trim();
        if (key && !seen.has(key)) {
          seen.add(key);
          words.push({
            wordAr: raw,
            translation: item.traduction || item.translation || '',
            type: 'particle',
          });
        }
      }
    }

    console.log(`📚 Dictionnaire apprenant: ${words.length} mots uniques`);
    return words;
  } catch (e) {
    console.error('[VOCAB] Erreur chargement dictionnaire apprenant:', e);
    return [];
  }
}

/**
 * Transforme la liste de mots en une chaîne compacte pour les prompts GPT.
 * Format: « كِتَاب (livre)، قَلَم (stylo)، ... »
 * Limité à `maxWords` pour ne pas exploser la taille du prompt.
 */
export function buildVocabSummary(words: LearnerWord[], maxWords: number = 200): string {
  return words
    .slice(0, maxWords)
    .map(w => `${w.wordAr} (${w.translation})`)
    .join('، ');
}

/**
 * Construit le bloc d'instruction GPT à injecter dans un prompt.
 * Retourne une chaîne vide si aucun vocabulaire disponible.
 */
export function buildVocabPromptBlock(summary: string): string {
  if (!summary) return '';
  return `

## مُفْرَدَاتُ الطَّالِبِ المَعْرُوفَةُ (vocabulaire connu de l'apprenant) :
${summary}

⚠️ قَاعِدَةٌ مُهِمَّةٌ: اسْتَخْدِمْ أَقْصَى عَدَدٍ مِنْ هَذِهِ المُفْرَدَاتِ عِنْدَ التَّلْخِيصِ وَطَرْحِ الأَسْئِلَةِ وَالتَّصْحِيحِ، لِتَسْهِيلِ فَهْمِ الطَّالِبِ. إِذَا اسْتَخْدَمْتَ كَلِمَةً جَدِيدَةً لَيْسَتْ فِي القَائِمَةِ، اِشْرَحْهَا بِاخْتِصَارٍ.`;
}
