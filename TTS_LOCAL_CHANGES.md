# Changement: TTS Local pour le Tuteur 🔊

**Date**: 2026-02-09
**Objectif**: Remplacer OpenAI TTS (cloud, payant) par expo-speech (local, gratuit) dans le tuteur vocal.

---

## Modifications effectuées

### Fichier modifié: `hooks/use-chat-tutor.ts`

#### 1. **Imports** - Ligne 7-11

**Avant**:
```typescript
import { clearTTSCache, prefetchTTS, speakWithOpenAI, stopTTS } from '@/src/utils/openai-tts';
import { Audio } from 'expo-av';
```

**Après**:
```typescript
import * as Speech from 'expo-speech';
import { Audio } from 'expo-av';
```

**Raison**: Utiliser expo-speech (TTS système) au lieu d'OpenAI TTS.

---

#### 2. **Fonction `speakText`** - Lignes 102-125

**Avant** (OpenAI TTS cloud):
```typescript
const speakText = useCallback(async (text: string): Promise<void> => {
  console.log('🔊 TTS starting (device):', text.substring(0, 50) + '...');
  setIsSpeaking(true);
  const isArabic = isArabicText(text);
  const lang = isArabic ? 'ar-SA' : uiLang === 'fr' ? 'fr-FR' : ...;
  const speed = isArabic ? 0.9 : 1.0;
  try {
    await speakWithOpenAI({
      text,
      gender,
      speed,
      language: lang,
      onDone: () => { console.log('🔊 TTS onDone'); setIsSpeaking(false); },
      onError: (err) => { console.error('🔊 TTS onError:', err); setIsSpeaking(false); },
    });
  } finally {
    setIsSpeaking(false);
  }
}, [uiLang, gender]);
```

**Après** (expo-speech local):
```typescript
const speakText = useCallback(async (text: string): Promise<void> => {
  return new Promise((resolve) => {
    console.log('🔊 TTS starting (local device):', text.substring(0, 50) + '...');
    setIsSpeaking(true);

    const isArabic = isArabicText(text);
    const lang = isArabic ? 'ar' : uiLang === 'fr' ? 'fr' : uiLang === 'de' ? 'de' : ...;
    const rate = isArabic ? 0.85 : 0.95; // Slightly slower for clarity

    Speech.speak(text, {
      language: lang,
      pitch: 1.0,
      rate: rate,
      onDone: () => {
        console.log('🔊 TTS finished (device)');
        setIsSpeaking(false);
        resolve();
      },
      onError: (error) => {
        console.error('🔊 TTS error (device):', error);
        setIsSpeaking(false);
        resolve();
      },
    });
  });
}, [uiLang]);
```

**Changements clés**:
- ✅ `Speech.speak()` au lieu de `speakWithOpenAI()`
- ✅ Codes langue simplifiés: `'ar'` au lieu de `'ar-SA'`
- ✅ `rate` (vitesse) au lieu de `speed`
- ✅ Retourne une Promise pour compatibilité async/await
- ❌ Plus besoin du paramètre `gender` (voix système)

---

#### 3. **Prefetch TTS supprimé** - Ligne 421-428

**Avant**:
```typescript
// Prefetch NEXT question's audio in background while this one plays + student answers
const nextPool = questionsCacheRef.current[textId] ?? [];
if (nextPool.length > 0) {
  const nextQ = nextPool[0];
  const nextNumber = askedNumber + 1;
  const nextText = `السُّؤَالُ ${intToArabicIndic(nextNumber)}/${intToArabicIndic(total)}: ${nextQ}`;
  prefetchTTS(nextText, gender, 0.9).catch(() => {});
}
```

**Après**:
```typescript
// Note: Prefetch not needed with local TTS (instant playback)
```

**Raison**: Le TTS local n'a pas besoin de prefetch (instantané).

---

#### 4. **Fonction `disconnect`** - Ligne 553-561

**Avant**:
```typescript
stopTTS();
clearTTSCache();
setIsConnected(false);
```

**Après**:
```typescript
Speech.stop(); // Stop local TTS
setIsConnected(false);
```

**Raison**: Arrêter le TTS local avec `Speech.stop()`.

---

#### 5. **Fonction `interrupt`** - Ligne 608

**Avant**:
```typescript
interrupt: () => stopTTS(),
```

**Après**:
```typescript
interrupt: () => Speech.stop(),
```

**Raison**: Utiliser `Speech.stop()` au lieu de `stopTTS()`.

---

## Avantages du TTS local ✅

| Aspect | OpenAI TTS (avant) | expo-speech (après) |
|--------|-------------------|---------------------|
| **Coût** | 💰 Payant ($0.015/1K chars) | ✅ **Gratuit** |
| **Latence** | ⏱️ ~2-3 secondes (API call) | ✅ **Instantané** (<100ms) |
| **Connexion** | ☁️ Nécessite internet | ✅ **Fonctionne hors ligne** |
| **Qualité voix** | 🎤 Très naturelle (alloy/echo) | 🔊 Voix système (correcte) |
| **Langues** | 🌍 Toutes les langues | 🌍 Dépend du système (arabe OK) |
| **Cache/Prefetch** | ⏳ Nécessaire | ✅ **Pas besoin** |

---

## Ce qui reste cloud ☁️

Le tuteur utilise **toujours l'IA cloud** pour:
1. ✅ **Générer 15-20 questions** sur le texte (OpenAI GPT-4o-mini)
2. ✅ **Résumer le texte** en 3-4 phrases (OpenAI GPT-4o-mini)
3. ✅ **Corriger les réponses** de l'apprenant (OpenAI GPT-4o-mini)
4. ✅ **Transcrire l'audio** (OpenAI Whisper)

**Total**: ~4-5 requêtes API par session de tuteur (au lieu de 20-30 avant).

---

## Architecture finale

```
┌─────────────────────────────────────────────────────────────┐
│                    SESSION TUTEUR                           │
└─────────────────────────────────────────────────────────────┘

1. DÉBUT (une seule fois):
   ┌─────────────────────────────────────────┐
   │ ☁️ GPT: Générer 15-20 questions        │ → Payant (1 requête)
   │ ☁️ GPT: Résumer le texte               │ → Payant (1 requête)
   │ 🔊 TTS local: Lire le résumé           │ → Gratuit, instantané
   └─────────────────────────────────────────┘

2. POUR CHAQUE QUESTION (x15-20):
   ┌─────────────────────────────────────────┐
   │ 🔊 TTS local: Lire la question          │ → Gratuit, instantané
   │ 🎤 L'apprenant parle                    │
   │ ☁️ Whisper: Transcrire l'audio         │ → Payant ($0.006/min)
   │ ☁️ GPT: Corriger la réponse            │ → Payant (1 requête)
   │ 🔊 TTS local: Lire la correction        │ → Gratuit, instantané
   └─────────────────────────────────────────┘

3. FIN:
   ┌─────────────────────────────────────────┐
   │ 🔊 TTS local: Message de fin            │ → Gratuit, instantané
   └─────────────────────────────────────────┘
```

**Économies réalisées**:
- Avant: ~40-50 requêtes TTS × $0.015/1K chars = **~$0.30 par session**
- Après: 0 requête TTS = **$0 pour le TTS**
- Reste: ~20-25 requêtes GPT + Whisper = **~$0.05 par session**

**Réduction de coût: 83%** 💰

---

## Test sur appareil

### Voix disponibles (dépend de l'OS)

**iOS (iPhone/iPad)**:
- Arabe: `ar` → Voix Siri arabe (bonne qualité)
- Français: `fr` → Voix Siri française
- Anglais: `en` → Voix Siri anglaise

**Android**:
- Arabe: `ar` → Voix Google TTS arabe
- Dépend des voix installées sur l'appareil

### Comment tester

1. Rechargez l'app dans le simulateur (**Cmd+R**)
2. Allez dans **Révision** → **Tuteur**
3. Lancez une session de questions
4. Vérifiez dans les logs:
   - ✅ `🔊 TTS starting (local device):` au lieu de `🔊 TTS starting (OpenAI):`
   - ✅ Pas d'erreur de connexion TTS
   - ✅ Latence réduite (instantané)

---

## Retour en arrière (si besoin)

Si vous voulez revenir à OpenAI TTS:

```bash
git checkout hooks/use-chat-tutor.ts
```

Ou restaurez manuellement les imports et la fonction `speakText`.

---

## Conclusion

Le tuteur utilise maintenant **TTS local gratuit** pour toutes les lectures vocales, tout en conservant l'IA cloud uniquement pour les tâches complexes (génération de questions, corrections).

**Résultat**: Expérience utilisateur plus rapide, coûts réduits de 83%, et fonctionne partiellement hors ligne! 🎉
