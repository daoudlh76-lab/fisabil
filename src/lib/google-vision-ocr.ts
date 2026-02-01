import * as FileSystem from 'expo-file-system/legacy';

// Configuration - Clés API
const OPENAI_API_KEY = process.env.EXPO_PUBLIC_OPENAI_API_KEY || '';
const GOOGLE_VISION_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_VISION_API_KEY || '';

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
const GOOGLE_VISION_API_URL = 'https://vision.googleapis.com/v1/images:annotate';

export interface OcrResult {
  text: string;
  confidence: number;
  error?: string;
}

/**
 * Effectue l'OCR sur une image en utilisant OpenAI GPT-4 Vision
 * @param imageUri - URI de l'image (file:// ou content://)
 * @returns Le texte extrait de l'image
 */
export async function performOcr(imageUri: string): Promise<OcrResult> {
  try {
    // Vérifier si la clé API est configurée
    if (!OPENAI_API_KEY) {
      console.warn('⚠️ OpenAI API key not configured, using mock OCR');
      return {
        text: '',
        confidence: 0,
        error: 'API_KEY_MISSING',
      };
    }

    // Lire l'image et la convertir en base64
    const base64Image = await FileSystem.readAsStringAsync(imageUri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    // Déterminer le type MIME
    const mimeType = imageUri.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';

    console.log('📡 Envoi de la requête à OpenAI GPT-4 Vision...');

    // Préparer la requête pour OpenAI - avec ajout automatique des voyelles
    const requestBody = {
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `You are a precise OCR system. Your task is to extract Arabic text from images with 100% character-level accuracy.

CORE PRINCIPLE: You are a camera, not an editor. Copy what you see, letter by letter.

RULES:
1. Extract EVERY character EXACTLY as written - same shape, same form
2. Preserve letter endings: if you see ـة keep ـة, if you see ـت keep ـت
3. Preserve all vowel variations: if you see ا keep ا, if you see ى keep ى
4. DO NOT substitute similar-looking words
5. DO NOT fix typos or "correct" the text
6. DO NOT change verb forms or grammatical structures
7. After extraction, add diacritics (َ ُ ِ ْ ّ ً ٌ ٍ) to the EXACT letters you extracted

PROCESS:
- Read each character carefully (including dots, hamza position, letter shape)
- Write the SAME character you saw
- Add appropriate diacritics
- Move to next character

Return only the extracted text with diacritics. No explanations.`,
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Extract the Arabic text from this image. Follow these steps:

1. Look at the first word - what are the EXACT letters? (not what word you think it is, but what letters are actually written)
2. Copy those EXACT letters
3. Add diacritics to those letters
4. Repeat for each word

CRITICAL MISTAKES TO AVOID:
❌ Changing word endings (ة/ت, ا/ى, ي/ى)
❌ Replacing words with synonyms
❌ "Fixing" what looks like errors
❌ Using context to guess different words
❌ Changing verb conjugations

Remember: You are copying letters, not interpreting meaning. Character-by-character precision is mandatory.

Extract the text now:`,
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:${mimeType};base64,${base64Image}`,
              },
            },
          ],
        },
      ],
      max_tokens: 8192,
      temperature: 0.1,
    };

    const response = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('❌ Erreur OpenAI:', errorData);
      throw new Error(errorData.error?.message || `HTTP ${response.status}`);
    }

    const data = await response.json();

    // Extraire le texte de la réponse
    const extractedText = data.choices?.[0]?.message?.content?.trim() || '';

    // Vérifier si l'API a refusé de traiter l'image
    if (extractedText.toLowerCase().includes("i'm sorry") ||
        extractedText.toLowerCase().includes("i can't") ||
        extractedText.toLowerCase().includes("i cannot")) {
      console.error('❌ OpenAI a refusé de traiter cette image');
      return {
        text: '',
        confidence: 0,
        error: 'CONTENT_POLICY_VIOLATION',
      };
    }

    console.log('✅ OCR OpenAI réussi, texte extrait:', extractedText.substring(0, 100) + '...');

    return {
      text: extractedText,
      confidence: 0.95,
    };

  } catch (error) {
    console.error('❌ Erreur OCR:', error);
    return {
      text: '',
      confidence: 0,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Version mock de l'OCR pour les tests sans API
 */
export function performMockOcr(): OcrResult {
  return {
    text: 'الحمد لله رب العالمين\nالرحمن الرحيم\nمالك يوم الدين',
    confidence: 1.0,
  };
}

/**
 * Effectue l'OCR avec Google Cloud Vision API
 * @param imageUri - URI de l'image
 * @returns Le texte extrait de l'image
 */
export async function performGoogleVisionOcr(imageUri: string): Promise<OcrResult> {
  try {
    // Vérifier si la clé API est configurée
    if (!GOOGLE_VISION_API_KEY) {
      console.warn('⚠️ Google Cloud Vision API key not configured');
      return {
        text: '',
        confidence: 0,
        error: 'GOOGLE_API_KEY_MISSING',
      };
    }

    // Lire l'image et la convertir en base64
    const base64Image = await FileSystem.readAsStringAsync(imageUri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    console.log('📡 Envoi de la requête à Google Cloud Vision...');

    // Appel à Google Cloud Vision
    const response = await fetch(
      `${GOOGLE_VISION_API_URL}?key=${GOOGLE_VISION_API_KEY}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          requests: [
            {
              image: {
                content: base64Image,
              },
              features: [
                {
                  type: 'TEXT_DETECTION',
                  maxResults: 1,
                },
              ],
              imageContext: {
                languageHints: ['ar'], // Arabe
              },
            },
          ],
        }),
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      console.error('❌ Erreur Google Vision:', errorData);
      throw new Error(errorData.error?.message || `HTTP ${response.status}`);
    }

    const data = await response.json();

    // Vérifier les erreurs dans la réponse
    if (data.responses?.[0]?.error) {
      const error = data.responses[0].error;
      console.error('❌ Erreur Google Vision:', error);
      throw new Error(error.message || 'Unknown error');
    }

    // Extraire le texte détecté
    const detectedText = data.responses?.[0]?.fullTextAnnotation?.text || '';

    if (!detectedText || detectedText.trim().length === 0) {
      console.warn('⚠️ Aucun texte détecté dans l\'image');
      return {
        text: '',
        confidence: 0,
        error: 'NO_TEXT_DETECTED',
      };
    }

    console.log('✅ OCR Google Vision réussi, texte extrait:', detectedText.substring(0, 100) + '...');

    return {
      text: detectedText,
      confidence: 0.95,
    };

  } catch (error) {
    console.error('❌ Erreur Google Vision OCR:', error);
    return {
      text: '',
      confidence: 0,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Effectue l'OCR avec fallback: Google Vision → OpenAI
 * @param imageUri - URI de l'image
 * @returns Le texte extrait de l'image
 */
export async function performOcrWithFallback(imageUri: string): Promise<OcrResult> {
  // Essayer d'abord Google Cloud Vision (pas de restriction religieuse)
  if (GOOGLE_VISION_API_KEY) {
    console.log('🔍 Tentative avec Google Cloud Vision...');
    const googleResult = await performGoogleVisionOcr(imageUri);

    if (!googleResult.error) {
      console.log('✅ Google Vision a réussi');
      return googleResult;
    }

    console.warn('⚠️ Google Vision a échoué, tentative avec OpenAI...');
  }

  // Fallback vers OpenAI si Google Vision n'est pas configuré ou a échoué
  if (OPENAI_API_KEY) {
    console.log('🔍 Tentative avec OpenAI Vision...');
    const openaiResult = await performOcr(imageUri);

    if (!openaiResult.error) {
      console.log('✅ OpenAI Vision a réussi');
      return openaiResult;
    }

    console.warn('⚠️ OpenAI Vision a aussi échoué');
    return openaiResult;
  }

  // Aucune API configurée
  console.error('❌ Aucune API OCR configurée');
  return {
    text: '',
    confidence: 0,
    error: 'NO_API_CONFIGURED',
  };
}

/**
 * Vérifie si au moins une API OCR est configurée
 */
export function isOcrConfigured(): boolean {
  return !!(OPENAI_API_KEY || GOOGLE_VISION_API_KEY);
}

/**
 * Vérifie si Google Cloud Vision est configuré
 */
export function isGoogleVisionConfigured(): boolean {
  return !!GOOGLE_VISION_API_KEY;
}
