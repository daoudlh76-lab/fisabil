# ⚡ TODO - TERMINER MIGRATION PRODUCTION

**Temps restant estimé**: 3-4 heures
**Progression actuelle**: 45% (3/8 fichiers migrés)

---

## 🎯 ACTIONS OBLIGATOIRES (ORDRE)

### 1. MIGRER 5 FICHIERS CLIENT (2-3h)

#### A. hooks/use-realtime-tutor.ts (10 min) - DÉSACTIVER

Remplacer tout le contenu par:

```typescript
export function useRealtimeTutor() {
  console.warn('⚠️ Realtime tutor temporairement désactivé (migration Edge Functions)');

  return {
    isConnected: false,
    isListening: false,
    isSpeaking: false,
    messages: [],
    error: 'Feature temporairement désactivée - utilisez le chat tuteur classique',
    connect: () => console.warn('Realtime désactivé'),
    disconnect: () => {},
    startListening: () => {},
    stopListening: () => {},
    stop: () => {},
  };
}
```

#### B. hooks/use-tutor.ts (30 min)

Chercher et remplacer:

```bash
# Pattern à chercher:
fetch('https://api.openai.com/v1/chat/completions'

# Remplacer par:
supabase.functions.invoke('tutor-chat-ai', {
  body: { messages, language: 'ar' }
})
```

Ajouter en haut du fichier:
```typescript
import { supabase } from '@/src/lib/supabase';
```

Supprimer:
```typescript
const OPENAI_API_KEY = process.env.EXPO_PUBLIC_OPENAI_API_KEY || '';
```

#### C. hooks/use-chat-tutor.ts (1h) - FICHIER COMPLEXE

5 appels `fetch()` à remplacer (lignes 143, 217, 295, 325, 474):

**Ligne 143** (audio/transcriptions):
```diff
- const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
-   headers: { 'Authorization': `Bearer ${OPENAI_API_KEY}` },
-   body: formData
- });
- const result = await response.json();
- return result.text;
+ const { data, error } = await supabase.functions.invoke('speech-to-text', {
+   body: { audioBase64, language: 'ar' }
+ });
+ if (error || !data) return null;
+ return data.text;
```

**Lignes 217, 295, 325, 474** (chat/completions):
```diff
- const response = await fetch('https://api.openai.com/v1/chat/completions', {
-   headers: { 'Authorization': `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
-   body: JSON.stringify({ model: 'gpt-4o', messages: [...] })
- });
- const result = await response.json();
- const message = result.choices[0].message.content;
+ const { data, error } = await supabase.functions.invoke('tutor-chat-ai', {
+   body: { messages: [...], language: 'ar' }
+ });
+ if (error || !data) { /* gérer erreur */ return; }
+ const message = data.message;
```

#### D. app/(tabs)/revision/dictation.tsx (30 min)

Chercher:
```typescript
fetch('https://api.openai.com/v1/chat/completions'
```

Remplacer par:
```typescript
const { data, error } = await supabase.functions.invoke('generate-dictation', {
  body: {
    difficulty: 'intermediate',
    length: 3,
    sourceText: textContent  // si applicable
  }
});

if (error || !data) {
  console.error('Dictation error:', error);
  return;
}

const dictationText = data.text;
```

#### E. app/(tabs)/revision/index.tsx (30 min)

Chercher:
```typescript
fetch('https://api.openai.com/v1/chat/completions'
```

Remplacer par:
```typescript
const { data, error } = await supabase.functions.invoke('generate-exercises', {
  body: {
    vocabList: selectedWords,
    difficulty: 'beginner',
    count: 5
  }
});

if (error || !data) {
  console.error('Exercises error:', error);
  return;
}

const exercises = data.exercises;
```

### 2. NETTOYER .ENV (5 min)

```bash
# Supprimer la clé OpenAI
sed -i '' '/EXPO_PUBLIC_OPENAI_API_KEY/d' .env
sed -i '' '/EXPO_PUBLIC_OPENAI_API_KEY/d' .env.local

# Vérifier suppression
grep "EXPO_PUBLIC_OPENAI_API_KEY" .env* || echo "✅ OK"
```

### 3. VALIDATION GREP (5 min)

```bash
# DOIT RETOURNER 0
echo "Vérification EXPO_PUBLIC_OPENAI:"
grep -r "EXPO_PUBLIC_OPENAI" . --exclude-dir={node_modules,.expo,.git,android,ios,supabase} | wc -l

echo "Vérification api.openai.com:"
grep -r "api.openai.com" src hooks app | wc -l

echo "Vérification wss://api.openai.com:"
grep -r "wss://api.openai.com" src hooks app | wc -l
```

**Résultat attendu**: `0` pour les 3 commandes

### 4. TESTER AVEC JWT (15 min)

```bash
# 1. Lancer l'app
npx expo start --clear

# 2. Ouvrir simulateur iOS (appuyer sur 'i')

# 3. Se connecter avec un compte

# 4. Ajouter temporairement dans app/_layout.tsx (ligne 14):
import { supabase } from '@/src/lib/supabase';

useEffect(() => {
  supabase.auth.getSession().then(({ data }) => {
    if (data.session) {
      console.log('JWT:', data.session.access_token);
    }
  });
}, []);

# 5. Copier le JWT depuis les logs

# 6. Tester avec curl:
JWT="<votre_jwt>"

curl -X POST "https://lluabltdmlprrwggwhlq.supabase.co/functions/v1/tts-generate" \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{"text":"مرحبا","voice":"alloy","format":"mp3"}' | jq

# Doit retourner: {"audioBase64":"...","format":"mp3","size":...}
```

### 5. TESTS E2E (30 min)

Dans l'app, tester:

- [ ] Scanner un texte arabe (OCR Google Vision)
- [ ] Extraire vocabulaire (extract-vocab)
- [ ] Écouter un mot (TTS via tts-generate)
- [ ] Parler au micro (STT via speech-to-text)
- [ ] Discuter avec tuteur IA (tutor-chat-ai)
- [ ] Générer une dictée (generate-dictation)
- [ ] Générer des exercices (generate-exercises)

### 6. BUILD PRODUCTION (30 min)

```bash
# iOS Release
npx expo run:ios --configuration Release

# Vérifier aucun warning sécurité

# Android Release
npx expo run:android --variant release

# Vérifier aucun warning
```

---

## ✅ CHECKLIST FINALE

Avant soumission stores:

- [ ] 5 fichiers migrés (use-realtime-tutor, use-tutor, use-chat-tutor, dictation, exercises)
- [ ] EXPO_PUBLIC_OPENAI_API_KEY supprimé de .env
- [ ] Validation grep = 0 pour les 3 patterns
- [ ] Tests E2E passent (7/7 features fonctionnent)
- [ ] Build Release iOS sans warning
- [ ] Build Release Android sans warning
- [ ] Log JWT temporaire supprimé ✅ DÉJÀ OK

---

## 🆘 EN CAS DE PROBLÈME

### Edge Function retourne erreur

```bash
# Voir les logs
npx supabase functions logs tts-generate --follow

# Redéployer si besoin
npx supabase functions deploy tts-generate
```

### App crash après migration

1. Vérifier que `import { supabase } from '@/src/lib/supabase'` est présent
2. Vérifier que `.env` contient `EXPO_PUBLIC_SUPABASE_URL` et `EXPO_PUBLIC_SUPABASE_ANON_KEY`
3. Restart Metro: `npx expo start --clear`

### Tests E2E échouent

1. Vérifier que l'utilisateur est connecté (session active)
2. Vérifier les logs Metro pour voir les erreurs Edge Functions
3. Tester Edge Functions isolément avec curl + JWT

---

## 📞 RESSOURCES

- **Rapport complet**: `RAPPORT_FINAL_MIGRATION.md`
- **Guide migration**: `MIGRATION_GUIDE.md`
- **Commandes Supabase**: `DEPLOYMENT_COMMANDS.md`
- **Tests détaillés**: `TESTS_AUTOMATIQUES_COMPLETS.md`

---

**Temps estimé total**: 3-4 heures
**Prochaine action**: Désactiver `use-realtime-tutor.ts` (10 min)
