/**
 * Appel de la Edge Function process-arabic-text (Gemini 2.0 Flash)
 * Pipeline complet : Image → OCR + Vocalization + Extraction vocab en un seul appel
 */

import * as FileSystem from 'expo-file-system/legacy';
import { invokeEdge } from './edge-ai';

export type ProcessArabicResult = {
  full_text_vocalized: string;
  vocabulaire: {
    singulier: string;
    traduction: string;
    pluriel?: string | null;
    contraire?: string | null;
    remarque?: string | null;
  }[];
  verbes: {
    passe_3ms: string;
    present_3ms: string;
    imperatif: string;
    traduction: string;
    remarque?: string | null;
  }[];
  particules: {
    particule_ar: string;
    type?: string | null;
    traduction: string;
    exemple?: string | null;
  }[];
};

/**
 * Envoie une image à Gemini pour OCR + vocalization + extraction de vocabulaire.
 *
 * @param imageUri - URI locale de l'image (file:// ou content://)
 * @param uiLang - Langue d'interface pour les traductions (fr, en, de, es, ru, ms, ar)
 * @returns Le texte vocalisé + vocabulaire structuré
 */
export async function processArabicImage(
  imageUri: string,
  uiLang: string = 'fr',
): Promise<ProcessArabicResult> {
  // Convertir l'image en base64
  const base64 = await FileSystem.readAsStringAsync(imageUri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  if (__DEV__) {
    const sizeMB = (base64.length / (1024 * 1024)).toFixed(2);
    __DEV__ && console.log(`📡 [process-arabic-text] Image: ${sizeMB} MB base64, lang=${uiLang}`);
  }

  const data = await invokeEdge<ProcessArabicResult>('process-arabic-text', {
    image_base64: base64,
    ui_lang: uiLang,
  });

  if (__DEV__) {
    __DEV__ && console.log(
      `✅ [process-arabic-text] text=${data.full_text_vocalized?.length || 0}ch, ` +
      `vocab=${data.vocabulaire?.length || 0}, verbs=${data.verbes?.length || 0}, ` +
      `particles=${data.particules?.length || 0}`,
    );
  }

  return data;
}
