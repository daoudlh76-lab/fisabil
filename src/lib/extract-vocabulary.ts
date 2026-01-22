/**
 * Extraction de vocabulaire arabe via OpenAI GPT-4
 * Utilisé côté client pour extraire vocabulaire, verbes et particules d'un texte arabe
 */

const OPENAI_API_KEY = process.env.EXPO_PUBLIC_OPENAI_API_KEY || '';
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

// Mapping des langues
const languageNames: Record<string, string> = {
  fr: 'French',
  en: 'English',
  de: 'German',
  es: 'Spanish',
  ru: 'Russian',
};

export type VocabItem = {
  mot_ar: string;
  traduction: string;
  singulier?: string | null;
  pluriel?: string | null;
  contraire?: string | null;
  remarque?: string | null;
};

export type VerbItem = {
  verbe_ar: string;
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
 * Extrait le vocabulaire, verbes et particules d'un texte arabe
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

  const targetLanguage = languageNames[uiLang] || 'French';

  const systemPrompt = `You are an expert Arabic linguist teacher. Your task is COMPLETE vocabulary extraction with DECOMPOSITION of compound words.

## CRITICAL: DECOMPOSE COMPOUND WORDS
Arabic words often combine particles, articles, nouns, verbs, and pronouns. You MUST decompose them:

### Examples of decomposition:
- بِالْكِتَابِ → بِ (particule: with) + الْ (particule: the) + كِتَابٌ (vocabulaire: book)
- كِتَابُهُ → كِتَابٌ (vocabulaire: book) + ـهُ (vocabulaire/pronom: his)
- وَالْمَدْرَسَةِ → وَ (particule: and) + الْ (particule: the) + مَدْرَسَةٌ (vocabulaire: school)
- فَذَهَبُوا → فَ (particule: then) + ذَهَبَ (verbe: to go) + ـوا (pronom suffixe: they)
- سَيَكْتُبُونَ → سَ (particule: will) + يَكْتُبُ (verbe: to write) + ـونَ (pronom suffixe: they)
- لِلْعِلْمِ → لِ (particule: for) + الْ (particule: the) + عِلْمٌ (vocabulaire: knowledge)

### Prefixes to extract as particles:
- وَ، فَ (conjunctions)
- بِ، لِ، كَ (prepositions)
- الْ، أَلْ (definite article)
- سَ، سَوْفَ (future markers)
- أَ، هَلْ (question markers)

### Suffixes to note in "remarque" field:
- Pronoun suffixes: ـي، ـكَ، ـكِ، ـهُ، ـهَا، ـنَا، ـكُمْ، ـهُمْ، ـهُنَّ
- Add them to vocabulaire with type "pronom suffixe" in remarque

## EXTRACTION RULES:
1. **DECOMPOSE** every compound word into its base components
2. **VOCABULAIRE**: Only the BASE noun/adjective without prefixes (keep tashkeel appropriate for isolated form)
3. **VERBES**: Only the BASE verb root (3rd person masculine singular past)
4. **PARTICULES**: ALL prefixes, prepositions, conjunctions, articles extracted separately

5. **FULL TASHKEEL REQUIRED** on ALL Arabic

6. **NO DUPLICATES** - Each unique base word appears ONCE

7. **OUTPUT**: Return ONLY valid JSON, no markdown

## JSON STRUCTURE:
{
  "vocabulaire": [{"mot_ar":"base word with tashkeel", "traduction":"${targetLanguage}", "singulier":"or null", "pluriel":"or null", "contraire":"or null", "remarque":"note if originally had suffix like ـهُ"}],
  "verbes": [{"verbe_ar":"infinitive/masdar", "traduction":"${targetLanguage}", "passe_3ms":"past 3ms", "present_3ms":"present 3ms", "imperatif":"imperative", "remarque":"or null"}],
  "particules": [{"particule_ar":"particle with tashkeel", "type":"type in ${targetLanguage}", "traduction":"meaning", "exemple":"example usage or null"}]
}`;

  const userPrompt = `TASK: Extract and DECOMPOSE all vocabulary from this Arabic text.

CRITICAL STEPS:
1. For each word, identify if it's compound (has prefixes like وَ، فَ، بِ، لِ، الْ، سَ or suffixes like ـهُ، ـهَا، ـهُمْ)
2. DECOMPOSE compound words: extract prefixes as separate particles, base word as vocabulaire/verbe
3. Extract ALL components - do not skip any particle or base word
4. Add full tashkeel to every Arabic word

TEXT TO ANALYZE:
"""
${arabicText}
"""

DECOMPOSITION EXAMPLES to follow:
- "بِالْحَقِّ" → بِ (particle) + الْ (particle) + حَقٌّ (noun)
- "قَالُوا" → قَالَ (verb) with suffix ـوا noted
- "رَبُّهُمْ" → رَبٌّ (noun) with suffix ـهُمْ noted
- "فَأَخَذَ" → فَ (particle) + أَخَذَ (verb)
- "وَلِلنَّاسِ" → وَ (particle) + لِ (particle) + الْ (particle) + نَاسٌ (noun)

Return complete JSON with all decomposed components.`;

  try {
    console.log('📡 Calling OpenAI GPT-4 for vocabulary extraction...');
    console.log('📝 Input text length:', arabicText?.length || 0);
    console.log('📝 First 100 chars:', arabicText?.substring(0, 100) || 'EMPTY');
    
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
        temperature: 0.2,
        max_tokens: 8192,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('❌ OpenAI API error:', errorData);
      return {
        meta: { ui_lang: uiLang, source: 'error', model: 'gpt-4o' },
        vocabulaire: [],
        verbes: [],
        particules: [],
        error: errorData.error?.message || `HTTP ${response.status}`,
      };
    }

    const data = await response.json();
    
    console.log('📝 API Response keys:', Object.keys(data));
    console.log('📝 Choices count:', data.choices?.length);
    console.log('📝 Finish reason:', data.choices?.[0]?.finish_reason);
    
    let content = data.choices?.[0]?.message?.content?.trim() || '';

    console.log('✅ OpenAI response received, parsing JSON...');
    console.log('📝 Raw content length:', content.length);
    console.log('📝 Content starts with:', content.substring(0, 100));
    console.log('📝 Content ends with:', content.substring(Math.max(0, content.length - 100)));
    
    // Si content est vide, retourner une erreur claire
    if (!content || content.length === 0) {
      console.error('❌ OpenAI returned empty content');
      console.error('📝 Full API response:', JSON.stringify(data, null, 2));
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
    
    console.log('📝 After cleanup - ends with:', content.substring(Math.max(0, content.length - 50)));

    // Vérifier si le JSON semble complet (doit se terminer par })
    if (!content.endsWith('}')) {
      console.warn('⚠️ JSON truncated! Trying to repair...');
      
      // Compter les accolades pour voir où on en est
      const openBraces = (content.match(/{/g) || []).length;
      const closeBraces = (content.match(/}/g) || []).length;
      console.log('📝 Open braces:', openBraces, 'Close braces:', closeBraces);
      
      // Ajouter les accolades manquantes
      const missing = openBraces - closeBraces;
      if (missing > 0) {
        // Trouver la dernière propriété valide et fermer proprement
        const lastValidEnd = content.lastIndexOf('}');
        if (lastValidEnd > 0) {
          content = content.substring(0, lastValidEnd + 1);
          // Ajouter les fermetures manquantes pour les tableaux et objets
          content += ']}'.repeat(Math.min(missing, 3));
        }
      }
    }

    // Parser le JSON avec gestion d'erreur améliorée
    let extractedData;
    try {
      extractedData = JSON.parse(content);
    } catch (parseErr) {
      console.error('❌ JSON parse failed, raw content:', content.substring(0, 500));
      throw parseErr;
    }

    console.log('✅ Vocabulary extraction successful:', {
      vocab: extractedData.vocabulaire?.length || 0,
      verbs: extractedData.verbes?.length || 0,
      particles: extractedData.particules?.length || 0,
    });

    return {
      meta: {
        ui_lang: uiLang,
        title,
        source: 'openai-client',
        model: 'gpt-4o',
      },
      vocabulaire: extractedData.vocabulaire || [],
      verbes: extractedData.verbes || [],
      particules: extractedData.particules || [],
    };
  } catch (error) {
    console.error('❌ Vocabulary extraction error:', error);
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
    expectedFormat = `{"mot_ar": "word with tashkeel", "traduction": "translation", "singulier": "singular form or null", "pluriel": "plural form or null"}`;
  } else if (type === 'verb') {
    systemPrompt = `You are an Arabic linguist. Complete the conjugation for this Arabic verb.
ADD FULL TASHKEEL (all diacritics) to ALL Arabic forms.
Translate to ${targetLanguage}.
Return ONLY valid JSON, no markdown.`;
    expectedFormat = `{"verbe_ar": "root/masdar with tashkeel", "traduction": "translation", "passe_3ms": "past 3rd masc sing", "present_3ms": "present 3rd masc sing", "imperatif": "imperative 2nd masc sing"}`;
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
