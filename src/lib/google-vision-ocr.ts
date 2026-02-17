import * as FileSystem from 'expo-file-system/legacy';

// Configuration - Clés API
// ⚠️ SECURITY: OpenAI key REMOVED from client - use Edge Functions instead
const GOOGLE_VISION_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_VISION_API_KEY || '';

const GOOGLE_VISION_API_URL = 'https://vision.googleapis.com/v1/images:annotate';

export interface OcrResult {
  text: string;
  confidence: number;
  words?: string[]; // Mots individuels extraits par Google Vision
  error?: string;
}

/**
 * Lit une image en base64 pour l'OCR.
 * La compression est gérée par ImagePicker (quality: 0.5).
 */
async function prepareImageForOcr(imageUri: string): Promise<string> {
  const base64 = await FileSystem.readAsStringAsync(imageUri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  if (__DEV__) {
    const sizeMB = (base64.length / (1024 * 1024)).toFixed(2);
    __DEV__ && console.log(`📏 Image base64: ${sizeMB} MB`);
  }

  return base64;
}

/**
 * Effectue un fetch avec retry automatique.
 * Contourne le bug QUIC/HTTP3 du simulateur iOS (-1017 "cannot parse response")
 */
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries: number = 3
): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        const delay = attempt * 1500; // 1.5s, 3s, 4.5s
        __DEV__ && console.log(`🔄 Retry ${attempt}/${maxRetries} après ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
      const response = await fetch(url, options);
      return response;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      const isNetworkError = lastError.message.includes('Network request failed') ||
                             lastError.message.includes('cannot parse response') ||
                             lastError.message.includes('Connection reset by peer') ||
                             lastError.message.includes('timed out');
      if (!isNetworkError || attempt === maxRetries) {
        throw lastError;
      }
      __DEV__ && console.warn(`⚠️ Erreur réseau (tentative ${attempt + 1}/${maxRetries + 1}):`, lastError.message);
    }
  }

  throw lastError || new Error('fetchWithRetry: toutes les tentatives ont échoué');
}

/**
 * Effectue l'OCR sur une image en utilisant Google Vision API
 *
 * ⚠️ IMPORTANT: OpenAI OCR a été désactivé pour des raisons de sécurité.
 * La clé OpenAI ne doit jamais être exposée côté client.
 *
 * @param imageUri - URI de l'image (file:// ou content://)
 * @returns Le texte extrait de l'image
 */
export async function performOcr(imageUri: string): Promise<OcrResult> {
  try {
    // Vérifier si Google Vision est configuré
    if (!GOOGLE_VISION_API_KEY) {
      __DEV__ && console.warn('⚠️ Google Vision API key not configured');
      return {
        text: '',
        confidence: 0,
        error: 'API_KEY_MISSING',
      };
    }

    // Convertir en base64
    const base64Image = await prepareImageForOcr(imageUri);

    __DEV__ && console.log('📡 Envoi de la requête à Google Vision...');

    // Préparer la requête pour Google Vision
    const requestBody = {
      requests: [
        {
          image: {
            content: base64Image,
          },
          features: [
            {
              type: 'DOCUMENT_TEXT_DETECTION',
              maxResults: 1,
            },
          ],
          imageContext: {
            languageHints: ['ar'], // Arabic
          },
        },
      ],
    };

    const url = `${GOOGLE_VISION_API_URL}?key=${GOOGLE_VISION_API_KEY}`;

    const response = await fetchWithRetry(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    }, 3);

    if (!response.ok) {
      const errorData = await response.json();
      __DEV__ && console.error('❌ Erreur Google Vision:', errorData);
      throw new Error(errorData.error?.message || `HTTP ${response.status}`);
    }

    const data = await response.json();

    // Extraire le texte et la confiance
    const textAnnotations = data.responses?.[0]?.textAnnotations;
    if (!textAnnotations || textAnnotations.length === 0) {
      __DEV__ && console.warn('⚠️ Aucun texte détecté dans l\'image');
      return {
        text: '',
        confidence: 0,
        error: 'NO_TEXT_FOUND',
      };
    }

    // Le premier élément contient tout le texte détecté
    const fullText = textAnnotations[0].description || '';

    // Extraire les mots individuels (à partir du 2ème élément)
    const words = textAnnotations
      .slice(1) // Skip le premier (texte complet)
      .map(annotation => annotation.description)
      .filter(word => word && /[\u0600-\u06FF]/.test(word)); // Garde uniquement les mots arabes

    // Calculer une confiance moyenne (Google Vision ne fournit pas de score global)
    const confidence = 0.85; // Valeur conservative pour Google Vision

    __DEV__ && console.log(`✅ OCR terminé avec succès (${fullText.length} caractères, ${words.length} mots)`);

    return {
      text: fullText,
      confidence,
      words, // ✅ Mots individuels extraits par Google Vision
    };

  } catch (error) {
    __DEV__ && console.error('❌ Erreur lors de l\'OCR:', error);
    return {
      text: '',
      confidence: 0,
      error: error instanceof Error ? error.message : 'UNKNOWN_ERROR',
    };
  }
}

/**
 * Ajoute automatiquement les diacritiques (tashkeel) au texte arabe
 *
 * ⚠️ DEPRECATED: OpenAI API désactivée côté client pour sécurité.
 * Cette fonction retourne maintenant le texte original sans modification.
 *
 * Pour ajouter les diacritiques, utilisez l'Edge Function Supabase:
 * `supabase.functions.invoke('add-diacritics', { body: { text } })`
 *
 * @param arabicText - Texte arabe sans diacritiques
 * @returns Le texte original (diacritics non ajoutés)
 */
export async function addDiacritics(arabicText: string): Promise<string> {
  if (__DEV__) {
    __DEV__ && console.warn('⚠️ addDiacritics: OpenAI client-side calls disabled for security.');
    __DEV__ && console.warn('💡 Use Supabase Edge Function instead: supabase.functions.invoke("add-diacritics")');
  }

  // Return original text unchanged
  return arabicText;
}

/**
 * Effectue l'OCR et ajoute automatiquement les voyelles
 *
 * ⚠️ Note: Diacritics auto-add disabled. Use Google Vision OCR only.
 *
 * @param imageUri - URI de l'image
 * @returns Le texte extrait (sans diacritiques ajoutés)
 */
export async function performOcrWithDiacritics(imageUri: string): Promise<OcrResult> {
  // Perform OCR with Google Vision
  const ocrResult = await performOcr(imageUri);

  if (ocrResult.error || !ocrResult.text) {
    return ocrResult;
  }

  // Return OCR result without diacritics enhancement
  // (OpenAI client-side calls disabled for security)
  return ocrResult;
}

/**
 * Vérifie si au moins un service OCR est disponible
 */
export function isOcrAvailable(): boolean {
  return !!GOOGLE_VISION_API_KEY;
}
