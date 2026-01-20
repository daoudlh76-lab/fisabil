import * as FileSystem from 'expo-file-system/legacy';

// Configuration - Clé API OpenAI
const OPENAI_API_KEY = process.env.EXPO_PUBLIC_OPENAI_API_KEY || '';

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

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

    // Préparer la requête pour OpenAI
    const requestBody = {
      model: 'gpt-4o',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Extract ALL the Arabic text from this image. Return ONLY the Arabic text, nothing else. Preserve the original formatting and line breaks. If there is no Arabic text, return an empty string.',
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
      max_tokens: 4096,
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
 * Vérifie si l'API OCR est configurée
 */
export function isOcrConfigured(): boolean {
  return !!OPENAI_API_KEY;
}
