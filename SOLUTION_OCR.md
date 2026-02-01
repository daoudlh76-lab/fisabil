# Solution pour le problème OCR "I'm sorry, I can't assist with that"

## Problème

OpenAI GPT-4 Vision refuse de traiter certaines images, notamment:
- Images de textes religieux (Coran, Hadith)
- Images qu'ils considèrent comme sensibles

Cela pose problème pour Fisabil qui est spécialisé dans l'apprentissage de l'arabe religieux.

## Solutions

### Option 1: Google Cloud Vision API (RECOMMANDÉ)

**Avantages:**
- Pas de restriction sur les textes religieux
- Très bon pour l'OCR arabe
- API spécialisée pour l'OCR (pas de modèle de langage)
- Moins cher qu'OpenAI pour l'OCR simple

**Configuration:**

1. Aller sur Google Cloud Console: https://console.cloud.google.com
2. Activer l'API Cloud Vision
3. Créer une clé API
4. Ajouter dans `.env.local`:
   ```
   EXPO_PUBLIC_GOOGLE_VISION_API_KEY=votre_cle_ici
   ```

**Code à modifier:**

Dans `src/lib/google-vision-ocr.ts`, ajouter:

```typescript
// Nouvelle fonction utilisant Google Cloud Vision
export async function performGoogleVisionOcr(imageUri: string): Promise<OcrResult> {
  try {
    const GOOGLE_VISION_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_VISION_API_KEY || '';

    if (!GOOGLE_VISION_API_KEY) {
      return {
        text: '',
        confidence: 0,
        error: 'GOOGLE_API_KEY_MISSING',
      };
    }

    // Lire l'image en base64
    const base64Image = await FileSystem.readAsStringAsync(imageUri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    // Appel à Google Cloud Vision
    const response = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${GOOGLE_VISION_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: [
            {
              image: { content: base64Image },
              features: [{ type: 'TEXT_DETECTION' }],
              imageContext: {
                languageHints: ['ar'], // Arabe
              },
            },
          ],
        }),
      }
    );

    const data = await response.json();

    if (data.responses?.[0]?.error) {
      throw new Error(data.responses[0].error.message);
    }

    const detectedText = data.responses?.[0]?.fullTextAnnotation?.text || '';

    if (!detectedText) {
      return {
        text: '',
        confidence: 0,
        error: 'NO_TEXT_DETECTED',
      };
    }

    console.log('✅ Google Vision OCR réussi');

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
```

Puis dans `app/(tabs)/index.tsx`, remplacer:
```typescript
const result = await performOcr(imageUri);
```

Par:
```typescript
const result = await performGoogleVisionOcr(imageUri);
```

**Coût:**
- Gratuit jusqu'à 1000 requêtes/mois
- Puis $1.50 pour 1000 requêtes
- Bien moins cher qu'OpenAI Vision

---

### Option 2: Azure Computer Vision

**Avantages:**
- Pas de restriction sur les textes religieux
- Très bon pour l'arabe
- Prix compétitif

**Inconvénient:**
- Configuration plus complexe

---

### Option 3: Tesseract OCR (Open Source)

**Avantages:**
- Gratuit et open source
- Aucune restriction
- Fonctionne hors ligne

**Inconvénients:**
- Moins précis que les API cloud
- Nécessite un entraînement pour l'arabe avec diacritiques

---

### Option 4: Modifier le prompt OpenAI (temporaire)

Essayer de reformuler le prompt pour éviter les refus:

```typescript
{
  role: 'system',
  content: `You are an OCR system for educational purposes. Extract text from educational material accurately.`
}
```

**Note:** Cette solution n'est pas garantie et OpenAI peut toujours refuser.

---

## Recommandation finale

**Utiliser Google Cloud Vision API** car:
1. Pas de restriction religieuse
2. Spécialisé pour l'OCR
3. Moins cher
4. Très bon pour l'arabe

**Plan B:** Garder OpenAI Vision avec un fallback vers Google Cloud Vision si refus.

**Code avec fallback:**

```typescript
async function runOcr() {
  // Essayer d'abord Google Vision
  let result = await performGoogleVisionOcr(imageUri);

  // Si échec, essayer OpenAI en fallback
  if (result.error === 'GOOGLE_API_KEY_MISSING') {
    result = await performOcr(imageUri); // OpenAI
  }

  // Traiter le résultat...
}
```

Cela permet d'avoir le meilleur des deux mondes.
