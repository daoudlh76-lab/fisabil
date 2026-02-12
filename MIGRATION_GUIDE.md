# 🔄 GUIDE MIGRATION OPENAI → EDGE FUNCTIONS

## ✅ EDGE FUNCTIONS CRÉÉES

| Fonction | Endpoint | Remplace |
|----------|----------|----------|
| `tts-generate` | `supabase.functions.invoke('tts-generate')` | OpenAI TTS direct |
| `speech-to-text` | `supabase.functions.invoke('speech-to-text')` | OpenAI Whisper direct |
| `tutor-chat-ai` | `supabase.functions.invoke('tutor-chat-ai')` | OpenAI Chat direct |
| `generate-dictation` | `supabase.functions.invoke('generate-dictation')` | GPT-4 dictation direct |
| `generate-exercises` | `supabase.functions.invoke('generate-exercises')` | GPT-4 exercises direct |
| `extract-vocab` | `supabase.functions.invoke('extract-vocab')` | ✅ EXISTE DÉJÀ |

---

## 📦 FICHIERS À MIGRER

### 1. src/lib/extract-vocabulary.ts

**Avant** :
```typescript
const OPENAI_API_KEY = process.env.EXPO_PUBLIC_OPENAI_API_KEY || '';

const response = await fetch(OPENAI_API_URL, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${OPENAI_API_KEY}`,
  },
  body: JSON.stringify({ ... }),
});
```

**Après** :
```typescript
import { supabase } from '@/src/lib/supabase';

const { data, error } = await supabase.functions.invoke('extract-vocab', {
  body: {
    scan_id: scanId,
    ui_lang: language,
  },
});

if (error) {
  console.error('Vocabulary extraction failed:', error);
  throw new Error('Failed to extract vocabulary');
}

return data;
```

---

### 2. src/utils/openai-tts.ts

**Avant** :
```typescript
const OPENAI_API_KEY = process.env.EXPO_PUBLIC_OPENAI_API_KEY || '';

const response = await fetch('https://api.openai.com/v1/audio/speech', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${OPENAI_API_KEY}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ model: 'tts-1', input: text, voice }),
});

const audioBuffer = await response.arrayBuffer();
```

**Après** :
```typescript
import { supabase } from '@/src/lib/supabase';

const { data, error } = await supabase.functions.invoke('tts-generate', {
  body: {
    text,
    voice,
    format: 'mp3',
    speed: 1.0,
  },
});

if (error) throw new Error('TTS generation failed');

// Convert base64 to audio blob
const audioBuffer = Uint8Array.from(atob(data.audioBase64), c => c.charCodeAt(0));
const audioBlob = new Blob([audioBuffer], { type: `audio/${data.format}` });
```

---

### 3. hooks/use-speech.ts

**Avant** :
```typescript
const OPENAI_API_KEY = process.env.EXPO_PUBLIC_OPENAI_API_KEY || '';

const formData = new FormData();
formData.append('file', audioBlob, 'audio.webm');
formData.append('model', 'whisper-1');

const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${OPENAI_API_KEY}`,
  },
  body: formData,
});
```

**Après** :
```typescript
import { supabase } from '@/src/lib/supabase';

// Convert audio blob to base64
const reader = new FileReader();
const audioBase64 = await new Promise<string>((resolve) => {
  reader.onloadend = () => {
    const base64 = (reader.result as string).split(',')[1];
    resolve(base64);
  };
  reader.readAsDataURL(audioBlob);
});

const { data, error } = await supabase.functions.invoke('speech-to-text', {
  body: {
    audioBase64,
    language: 'ar',
  },
});

if (error) throw new Error('Transcription failed');
return data.text;
```

---

### 4. hooks/use-chat-tutor.ts

**Avant** :
```typescript
const OPENAI_API_KEY = process.env.EXPO_PUBLIC_OPENAI_API_KEY || '';

const response = await fetch('https://api.openai.com/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${OPENAI_API_KEY}`,
  },
  body: JSON.stringify({
    model: 'gpt-4o',
    messages,
  }),
});
```

**Après** :
```typescript
import { supabase } from '@/src/lib/supabase';

const { data, error } = await supabase.functions.invoke('tutor-chat-ai', {
  body: {
    messages,
    userWords,
    restrictVocab,
    language: 'ar',
  },
});

if (error) throw new Error('Tutor response failed');
return data.message;
```

---

### 5. hooks/use-realtime-tutor.ts

**⚠️ ATTENTION** : WebSocket realtime nécessite approche différente.

**Solution recommandée** : Désactiver temporairement la feature ou utiliser polling.

**Alternative complexe** : Créer proxy WebSocket Deno (4-6h dev).

**Code temporaire** :
```typescript
export function useRealtimeTutor() {
  const [isAvailable] = useState(false);

  if (__DEV__) {
    console.warn('⚠️ Realtime tutor temporairement désactivé (migration Edge Functions)');
    console.warn('💡 Utiliser use-chat-tutor à la place');
  }

  return {
    isAvailable,
    connect: () => {
      throw new Error('Realtime tutor not available in this version');
    },
  };
}
```

---

### 6. hooks/use-tutor.ts

**Avant** :
```typescript
const response = await fetch('https://api.openai.com/v1/chat/completions', {
  headers: { 'Authorization': `Bearer ${OPENAI_API_KEY}` },
  ...
});
```

**Après** :
```typescript
// Utiliser tutor-chat-ai Edge Function (même que use-chat-tutor)
const { data, error } = await supabase.functions.invoke('tutor-chat-ai', {
  body: { messages, ... },
});
```

---

### 7. app/(tabs)/revision/dictation.tsx

**Avant** :
```typescript
const response = await fetch('https://api.openai.com/v1/chat/completions', {
  headers: { 'Authorization': `Bearer ${OPENAI_API_KEY}` },
  ...
});
```

**Après** :
```typescript
const { data, error } = await supabase.functions.invoke('generate-dictation', {
  body: {
    sourceText,
    difficulty: 'intermediate',
    length: 3,
  },
});

if (error) throw new Error('Dictation generation failed');
return data.text;
```

---

### 8. app/(tabs)/revision/index.tsx

**Avant** :
```typescript
const response = await fetch('https://api.openai.com/v1/chat/completions', {
  headers: { 'Authorization': `Bearer ${OPENAI_API_KEY}` },
  ...
});
```

**Après** :
```typescript
const { data, error } = await supabase.functions.invoke('generate-exercises', {
  body: {
    vocabList,
    difficulty: 'intermediate',
    count: 5,
  },
});

if (error) throw new Error('Exercises generation failed');
return data.exercises;
```

---

## 🔒 SUPPRESSION CLÉS

### Dans tous les fichiers, supprimer :

```typescript
// ❌ SUPPRIMER
const OPENAI_API_KEY = process.env.EXPO_PUBLIC_OPENAI_API_KEY || '';
const OPENAI_API_URL = 'https://api.openai.com/v1/...';
```

### Dans .env / .env.local :

```bash
# ❌ SUPPRIMER cette ligne
EXPO_PUBLIC_OPENAI_API_KEY=sk-proj-...
```

---

## 🚀 DÉPLOIEMENT

### 1. Configurer secrets Supabase

```bash
# Depuis Dashboard Supabase > Edge Functions > Secrets
OPENAI_API_KEY=sk-proj-your-key-here
```

### 2. Déployer les Edge Functions

```bash
# Déployer toutes les nouvelles functions
supabase functions deploy tts-generate
supabase functions deploy speech-to-text
supabase functions deploy tutor-chat-ai
supabase functions deploy generate-dictation
supabase functions deploy generate-exercises

# Optionnel : redéployer extract-vocab si modifications
supabase functions deploy extract-vocab
```

### 3. Tester

```bash
# Test TTS
supabase functions invoke tts-generate --body '{"text":"مرحبا","voice":"alloy"}'

# Test STT (avec base64 audio)
supabase functions invoke speech-to-text --body '{"audioBase64":"..."}'

# Test Chat
supabase functions invoke tutor-chat-ai --body '{"messages":[{"role":"user","content":"مرحبا"}]}'
```

---

## ✅ VALIDATION FINALE

Après migration complète, vérifier :

```bash
# Aucune clé OpenAI côté client
grep -r "EXPO_PUBLIC_OPENAI" src/ hooks/ app/
# → Doit retourner 0 résultat

# Aucun appel direct OpenAI
grep -r "api.openai.com" src/ hooks/ app/
# → Doit retourner 0 résultat

# Aucun WebSocket OpenAI direct
grep -r "wss://api.openai.com" src/ hooks/ app/
# → Doit retourner 0 résultat
```

---

## 📝 CHECKLIST MIGRATION

- [ ] Edge Functions créées (6 functions)
- [ ] Secrets Supabase configurés (OPENAI_API_KEY)
- [ ] Functions déployées
- [ ] src/lib/extract-vocabulary.ts migré
- [ ] src/utils/openai-tts.ts migré
- [ ] hooks/use-speech.ts migré
- [ ] hooks/use-chat-tutor.ts migré
- [ ] hooks/use-realtime-tutor.ts désactivé/migré
- [ ] hooks/use-tutor.ts migré
- [ ] app/(tabs)/revision/dictation.tsx migré
- [ ] app/(tabs)/revision/index.tsx migré
- [ ] EXPO_PUBLIC_OPENAI_API_KEY supprimé de .env
- [ ] Tests : OCR Google Vision fonctionne
- [ ] Tests : TTS Edge Function fonctionne
- [ ] Tests : STT Edge Function fonctionne
- [ ] Tests : Chat tuteur fonctionne
- [ ] Build iOS sans erreur
- [ ] Build Android sans erreur

---

## 🎯 RÉSULTAT ATTENDU

✅ **App 100% sécurisée**
- Zéro clé OpenAI exposée côté client
- Toutes les features IA fonctionnent via Edge Functions
- Conforme App Store + Google Play
- Contrôle coûts OpenAI server-side
- Rate limiting + auth sur toutes les functions

---

**Préparé par** : Claude Sonnet 4.5
**Date** : 2026-02-10
