/**
 * Extraction de vocabulaire arabe via Supabase Edge Function (extract-vocab)
 * La logique d'extraction GPT-4 est côté serveur pour sécurité
 */

import { invokeEdge } from './edge-ai';

export type VocabItem = {
  traduction: string;
  singulier: string;
  pluriel?: string | null;
  contraire?: string | null;
  remarque?: string | null;
};

export type VerbItem = {
  traduction: string;
  passe_3ms: string;
  present_3ms: string;
  imperatif: string;
  remarque?: string | null;
};

export type ParticleItem = {
  particule_ar: string;
  type?: string | null;
  traduction: string;
  exemple?: string | null;
};

export type ExtractVocabResult = {
  meta: {
    ui_lang: string;
    title?: string;
    source: string;
    model: string;
  };
  vocabulaire: VocabItem[];
  verbes: VerbItem[];
  particules: ParticleItem[];
};

/**
 * Extraire le vocabulaire d'un scan via Edge Function
 * @param scanId - ID du scan dans la base Supabase
 * @param uiLang - Langue d'interface pour les traductions (fr, en, de, es, ru, ms, ar)
 */
export async function extractVocabularyFromText(
  scanId: string,
  uiLang: string = 'fr'
): Promise<ExtractVocabResult | null> {
  try {
    console.log(`📚 Extracting vocabulary via Edge Function (scan: ${scanId}, lang: ${uiLang})...`);

    const data = await invokeEdge<ExtractVocabResult>('extract-vocab', {
      scan_id: scanId,
      ui_lang: uiLang,
    });

    console.log(`✅ Extracted: ${data.vocabulaire?.length || 0} vocab, ${data.verbes?.length || 0} verbs, ${data.particules?.length || 0} particles`);

    return data;
  } catch (err) {
    console.error('❌ Vocabulary extraction failed:', err);

    // Try to get more detailed error info by making a direct fetch call
    try {
      const { supabase } = await import('./supabase');
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;

      if (accessToken) {
        console.log('🔍 Attempting direct fetch to get detailed error...');
        const response = await fetch(
          `https://lluabltdmlprrwggwhlq.supabase.co/functions/v1/extract-vocab`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              scan_id: scanId,
              ui_lang: uiLang,
            }),
          }
        );

        const responseText = await response.text();
        console.error('🔍 Direct fetch response status:', response.status);
        console.error('🔍 Direct fetch response body:', responseText);

        try {
          const errorJson = JSON.parse(responseText);
          console.error('🔍 Parsed error JSON:', JSON.stringify(errorJson, null, 2));
        } catch (e) {
          console.error('🔍 Could not parse response as JSON');
        }
      }
    } catch (debugErr) {
      console.error('🔍 Debug fetch also failed:', debugErr);
    }

    return null;
  }
}

// Alias pour compatibilité avec l'ancien code
export const extractVocabulary = extractVocabularyFromText;
