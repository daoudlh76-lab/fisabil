/**
 * Extraction de vocabulaire arabe via OpenAI GPT-4
 * Utilisé côté client pour extraire vocabulaire, verbes et particules d'un texte arabe
 * Gère les textes longs en les divisant en segments
 */

const OPENAI_API_KEY = process.env.EXPO_PUBLIC_OPENAI_API_KEY || '';
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

// Nombre maximum de mots par segment pour éviter les réponses tronquées
const MAX_WORDS_PER_SEGMENT = 150;

// Mapping des langues
const languageNames: Record<string, string> = {
  fr: 'French',
  en: 'English',
  de: 'German',
  es: 'Spanish',
  ru: 'Russian',
};

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
  error?: string;
};

/**
 * Vérifie si l'API est configurée
 */
export function isVocabExtractionConfigured(): boolean {
  return !!OPENAI_API_KEY;
}

/**
 * Divise un texte en segments de taille maximale
 */
function splitTextIntoSegments(text: string, maxWords: number): string[] {
  const words = text.split(/\s+/).filter(w => w.length > 0);
  const segments: string[] = [];

  for (let i = 0; i < words.length; i += maxWords) {
    segments.push(words.slice(i, i + maxWords).join(' '));
  }

  return segments;
}

/**
 * Fusionne les résultats de plusieurs extractions en évitant les doublons
 */
function mergeResults(results: ExtractVocabResult[]): ExtractVocabResult {
  const seenVocab = new Set<string>();
  const seenVerbs = new Set<string>();
  const seenParticles = new Set<string>();

  const merged: ExtractVocabResult = {
    meta: results[0]?.meta || { ui_lang: 'fr', source: 'openai-client', model: 'gpt-4o' },
    vocabulaire: [],
    verbes: [],
    particules: [],
  };

  for (const result of results) {
    for (const item of result.vocabulaire || []) {
      const key = item.singulier?.replace(/[\u064B-\u0652]/g, '') || ''; // Normaliser sans tashkeel pour comparaison
      if (!seenVocab.has(key) && item.singulier) {
        seenVocab.add(key);
        merged.vocabulaire.push(item);
      }
    }

    for (const item of result.verbes || []) {
      const key = item.passe_3ms?.replace(/[\u064B-\u0652]/g, '') || '';
      if (!seenVerbs.has(key) && item.passe_3ms) {
        seenVerbs.add(key);
        merged.verbes.push(item);
      }
    }

    for (const item of result.particules || []) {
      const key = item.particule_ar?.replace(/[\u064B-\u0652]/g, '') || '';
      if (!seenParticles.has(key) && item.particule_ar) {
        seenParticles.add(key);
        merged.particules.push(item);
      }
    }
  }

  return merged;
}

/**
 * Extrait le vocabulaire d'un segment de texte (fonction interne)
 */
async function extractVocabularySegment(
  arabicText: string,
  uiLang: string,
  targetLanguage: string,
  segmentIndex: number,
  totalSegments: number
): Promise<ExtractVocabResult> {
  const systemPrompt = `You are an expert Arabic linguist and grammarian. Extract EVERY SINGLE WORD from the text with FULL TASHKEEL.

## CRITICAL: ADD VOWELS IF MISSING
The input text may or may not have diacritics (tashkeel). You MUST:
1. If the word already has diacritics → preserve them
2. If the word has NO diacritics → ADD FULL TASHKEEL based on Arabic grammar rules:
   - Fatha (فَتْحَة), Damma (ضَمَّة), Kasra (كَسْرَة)
   - Sukun (سُكُون), Shadda (شَدَّة)
   - Tanween (تَنْوِين): ً ٌ ٍ

Example: "الحمد لله رب العالمين" → Extract as "الْحَمْدُ"، "لِلَّهِ"، "رَبُّ"، "الْعَالَمِينَ"

## DECOMPOSE COMPOUND WORDS
- بالكتاب → بِ (particle) + الْ (particle) + كِتَابٌ (noun)
- وقال → وَ (particle) + قَالَ (verb)
- ربهم → رَبٌّ (noun) + note suffix ـهُمْ in remarque

## PREFIXES TO EXTRACT AS PARTICLES:
وَ، فَ، بِ، لِ، كَ، الْ، سَ، أَ، هَلْ

## WHAT TO EXTRACT:
1. **vocabulaire**: ALL nouns, adjectives, adverbs (base form with full tashkeel)
2. **verbes**: ALL verbs (past 3rd masc sing with tashkeel)
3. **particules**: ALL particles with tashkeel

## SINGULIER/PLURIEL - CRITICAL:
For EVERY noun in vocabulaire, you MUST provide:
- **traduction**: Translation of the SINGULAR form in ${targetLanguage}
- **singulier**: The SINGULAR form WITH FULL TASHKEEL (e.g., "كِتَابٌ")
- **pluriel**: The plural form WITH FULL TASHKEEL (e.g., "كُتُبٌ")
- **contraire**: The opposite/antonym WITH FULL TASHKEEL or null
- **remarque**: If the word appeared as plural in text, note it: "Appeared as [plural form] in text"

Examples:
- Text has "الْعَالَمِينَ" (plural) → traduction: "world" (singular meaning), singulier: "عَالَمٌ", pluriel: "عَالَمُونَ / عَوَالِمُ", remarque: "Appeared as الْعَالَمِينَ in text"
- Text has "كِتَابٌ" (singular) → traduction: "book", singulier: "كِتَابٌ", pluriel: "كُتُبٌ", remarque: null
- Text has "رِجَالٌ" (plural) → traduction: "man", singulier: "رَجُلٌ", pluriel: "رِجَالٌ", remarque: "Appeared as رِجَالٌ in text"

## CONTRAIRE (ANTONYME) - REQUIRED:
For EVERY word (noun, adjective) in vocabulaire, you MUST provide:
- **contraire**: The opposite/antonym WITH FULL TASHKEEL
- If no direct opposite exists, provide null
Examples:
- "كَبِيرٌ" (big) → contraire: "صَغِيرٌ"
- "جَمِيلٌ" (beautiful) → contraire: "قَبِيحٌ"
- "حَارٌّ" (hot) → contraire: "بَارِدٌ"
- "نَهَارٌ" (day) → contraire: "لَيْلٌ"
- "حَيَاةٌ" (life) → contraire: "مَوْتٌ"
- "سَعِيدٌ" (happy) → contraire: "حَزِينٌ"
- "خَيْرٌ" (good) → contraire: "شَرٌّ"

## RULES:
- EVERY Arabic word in output MUST have FULL TASHKEEL
- NO duplicates (each unique singular form once)
- Include EVERY word - proper nouns, numbers, everything
- For nouns: traduction translates the SINGULAR form, singulier is the singular with tashkeel
- If word appeared as plural in text, note it in remarque field
- ALWAYS fill singulier AND pluriel for nouns
- ALWAYS provide contraire (opposite) when it exists, otherwise null
- Return ONLY valid JSON, no markdown

## JSON FORMAT - STRICT STRUCTURE:
{
  "vocabulaire": [
    {
      "traduction": "${targetLanguage} translation of the SINGULAR form",
      "singulier": "singular form WITH full tashkeel",
      "pluriel": "plural form WITH full tashkeel or null",
      "contraire": "opposite/antonym WITH full tashkeel or null",
      "remarque": "note 'Appeared as [plural] in text' if word was plural, or other grammar note, or null"
    }
  ],
  "verbes": [
    {
      "traduction": "${targetLanguage} translation of the verb",
      "passe_3ms": "past 3rd masc sing WITH full tashkeel",
      "present_3ms": "present 3rd masc sing WITH full tashkeel",
      "imperatif": "imperative 2nd masc sing WITH full tashkeel",
      "remarque": "grammar note or null"
    }
  ],
  "particules": [
    {
      "particule_ar": "particle WITH tashkeel",
      "type": "type of particle",
      "traduction": "${targetLanguage} meaning",
      "exemple": "example sentence or null"
    }
  ]
}

IMPORTANT: NEVER omit the "contraire" field from vocabulaire items. ALWAYS include it (with value or null).`;

  const wordCount = arabicText.split(/\s+/).filter(w => w.length > 0).length;

  const userPrompt = `Extract EVERY SINGLE WORD from this Arabic text (segment ${segmentIndex + 1}/${totalSegments}) with FULL TASHKEEL.

CRITICAL RULES:
1. If a word has no diacritics, ADD THEM according to Arabic grammar
2. For ALL NOUNS: singulier is the SINGULAR form, traduction translates the SINGULAR
3. If a word appears as plural in text, use its SINGULAR and note the plural form in remarque
4. For ALL VERBS: provide traduction, passe_3ms, present_3ms, imperatif (NO verbe_ar field)

TEXT:
"""
${arabicText}
"""

IMPORTANT:
- This segment has ~${wordCount} words - extract ALL of them
- EVERY Arabic word in output MUST have FULL TASHKEEL
- For vocabulaire: NO mot_ar field, use singulier and translate the SINGULAR
- For verbes: NO verbe_ar field, use passe_3ms, present_3ms, imperatif
- Return complete JSON.`;

  try {
    const response = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.1,
        max_tokens: 16384,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error(`❌ OpenAI API error for segment ${segmentIndex + 1}:`, errorData);
      return {
        meta: { ui_lang: uiLang, source: 'error', model: 'gpt-4o' },
        vocabulaire: [],
        verbes: [],
        particules: [],
        error: errorData.error?.message || `HTTP ${response.status}`,
      };
    }

    const data = await response.json();
    const finishReason = data.choices?.[0]?.finish_reason;

    console.log(`📝 Segment ${segmentIndex + 1}/${totalSegments} - Finish reason:`, finishReason);

    let content = data.choices?.[0]?.message?.content?.trim() || '';

    if (!content || content.length === 0) {
      console.error(`❌ OpenAI returned empty content for segment ${segmentIndex + 1}`);
      return {
        meta: { ui_lang: uiLang, source: 'error', model: 'gpt-4o' },
        vocabulaire: [],
        verbes: [],
        particules: [],
        error: 'EMPTY_RESPONSE',
      };
    }

    // Nettoyer les backticks markdown si présents
    if (content.startsWith('```json')) {
      content = content.slice(7);
    }
    if (content.startsWith('```')) {
      content = content.slice(3);
    }
    if (content.endsWith('```')) {
      content = content.slice(0, -3);
    }
    content = content.trim();

    // Réparer le JSON si tronqué
    if (!content.endsWith('}')) {
      console.warn(`⚠️ Segment ${segmentIndex + 1} JSON truncated, repairing...`);

      const openBraces = (content.match(/{/g) || []).length;
      const closeBraces = (content.match(/}/g) || []).length;
      const openBrackets = (content.match(/\[/g) || []).length;
      const closeBrackets = (content.match(/]/g) || []).length;

      // Fermer les tableaux et objets ouverts
      const missingBrackets = openBrackets - closeBrackets;
      const missingBraces = openBraces - closeBraces;

      if (missingBrackets > 0 || missingBraces > 0) {
        // Trouver un point de coupure propre (après un objet complet)
        const lastCompleteObject = content.lastIndexOf('},');
        if (lastCompleteObject > 0) {
          content = content.substring(0, lastCompleteObject + 1);
        }

        // Ajouter les fermetures manquantes
        content += ']'.repeat(Math.max(0, missingBrackets));
        content += '}'.repeat(Math.max(0, missingBraces));
      }
    }

    const extractedData = JSON.parse(content);

    console.log(`✅ Segment ${segmentIndex + 1}/${totalSegments} extraction:`, {
      vocab: extractedData.vocabulaire?.length || 0,
      verbs: extractedData.verbes?.length || 0,
      particles: extractedData.particules?.length || 0,
    });

    return {
      meta: {
        ui_lang: uiLang,
        source: 'openai-client',
        model: 'gpt-4o',
      },
      vocabulaire: extractedData.vocabulaire || [],
      verbes: extractedData.verbes || [],
      particules: extractedData.particules || [],
    };
  } catch (error) {
    console.error(`❌ Segment ${segmentIndex + 1} extraction error:`, error);
    return {
      meta: { ui_lang: uiLang, source: 'error', model: 'gpt-4o' },
      vocabulaire: [],
      verbes: [],
      particules: [],
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Extrait le vocabulaire, verbes et particules d'un texte arabe
 * Divise automatiquement les textes longs en segments pour une extraction complète
 * @param arabicText - Le texte arabe à analyser
 * @param uiLang - La langue pour les traductions (fr, en, de, es, ru)
 * @param title - Le titre du texte (optionnel)
 */
export async function extractVocabulary(
  arabicText: string,
  uiLang: string = 'fr',
  title?: string
): Promise<ExtractVocabResult> {
  // Vérifier la clé API
  if (!OPENAI_API_KEY) {
    console.error('❌ OpenAI API key not configured for vocabulary extraction');
    return {
      meta: { ui_lang: uiLang, source: 'error', model: 'none' },
      vocabulaire: [],
      verbes: [],
      particules: [],
      error: 'API_KEY_MISSING',
    };
  }

  if (!arabicText || arabicText.trim().length === 0) {
    console.error('❌ Empty arabic text provided');
    return {
      meta: { ui_lang: uiLang, source: 'error', model: 'none' },
      vocabulaire: [],
      verbes: [],
      particules: [],
      error: 'EMPTY_TEXT',
    };
  }

  const targetLanguage = languageNames[uiLang] || 'French';
  const wordCount = arabicText.split(/\s+/).filter(w => w.length > 0).length;

  console.log('📡 Starting vocabulary extraction...');
  console.log('📝 Total words:', wordCount);

  // Diviser en segments si le texte est trop long
  if (wordCount > MAX_WORDS_PER_SEGMENT) {
    const segments = splitTextIntoSegments(arabicText, MAX_WORDS_PER_SEGMENT);
    console.log(`📝 Text divided into ${segments.length} segments`);

    const results: ExtractVocabResult[] = [];

    for (let i = 0; i < segments.length; i++) {
      console.log(`📡 Processing segment ${i + 1}/${segments.length}...`);
      const result = await extractVocabularySegment(
        segments[i],
        uiLang,
        targetLanguage,
        i,
        segments.length
      );
      results.push(result);

      // Petite pause entre les segments pour éviter le rate limiting
      if (i < segments.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    const merged = mergeResults(results);
    merged.meta.title = title;

    console.log('✅ All segments merged:', {
      vocab: merged.vocabulaire.length,
      verbs: merged.verbes.length,
      particles: merged.particules.length,
    });

    return merged;
  }

  // Texte court: extraction directe
  const result = await extractVocabularySegment(arabicText, uiLang, targetLanguage, 0, 1);
  result.meta.title = title;
  return result;
}

/**
 * Complète automatiquement les informations d'un mot arabe
 * @param wordAr - Le mot arabe à compléter
 * @param type - Le type: 'word', 'verb', ou 'particle'
 * @param uiLang - La langue pour les traductions
 */
export async function completeWordInfo(
  wordAr: string,
  type: 'word' | 'verb' | 'particle',
  uiLang: string = 'fr'
): Promise<VocabItem | VerbItem | ParticleItem | null> {
  if (!OPENAI_API_KEY) {
    console.error('❌ OpenAI API key not configured');
    return null;
  }

  const targetLanguage = languageNames[uiLang] || 'French';

  let systemPrompt = '';
  let expectedFormat = '';

  if (type === 'word') {
    systemPrompt = `You are an Arabic linguist. Complete the information for this Arabic word.
ADD FULL TASHKEEL (all diacritics) to ALL Arabic: فَتْحَة, ضَمَّة, كَسْرَة, سُكُون, شَدَّة, تَنْوِين.
Translate to ${targetLanguage}.
Return ONLY valid JSON, no markdown.`;
    expectedFormat = `{"traduction": "translation of singular", "singulier": "singular form with tashkeel", "pluriel": "plural form with tashkeel or null", "contraire": "opposite or null"}`;
  } else if (type === 'verb') {
    systemPrompt = `You are an Arabic linguist. Complete the conjugation for this Arabic verb.
ADD FULL TASHKEEL (all diacritics) to ALL Arabic forms.
Translate to ${targetLanguage}.
Return ONLY valid JSON, no markdown.`;
    expectedFormat = `{"traduction": "translation", "passe_3ms": "past 3rd masc sing with tashkeel", "present_3ms": "present 3rd masc sing with tashkeel", "imperatif": "imperative 2nd masc sing with tashkeel"}`;
  } else {
    systemPrompt = `You are an Arabic linguist. Complete the information for this Arabic particle/preposition.
ADD FULL TASHKEEL (all diacritics) to ALL Arabic.
Translate to ${targetLanguage}.
Return ONLY valid JSON, no markdown.`;
    expectedFormat = `{"particule_ar": "particle with tashkeel", "traduction": "translation", "type": "type of particle", "exemple": "example sentence in Arabic"}`;
  }

  try {
    const response = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Complete this Arabic ${type}: "${wordAr}"\n\nFormat: ${expectedFormat}` },
        ],
        temperature: 0.2,
        max_tokens: 500,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    let content = data.choices?.[0]?.message?.content || '';

    // Nettoyer le JSON
    content = content.trim();
    if (content.startsWith('```json')) content = content.slice(7);
    if (content.startsWith('```')) content = content.slice(3);
    if (content.endsWith('```')) content = content.slice(0, -3);
    content = content.trim();

    const result = JSON.parse(content);
    console.log('✅ Word completion successful:', result);
    return result;
  } catch (error) {
    console.error('❌ Word completion error:', error);
    return null;
  }
}
