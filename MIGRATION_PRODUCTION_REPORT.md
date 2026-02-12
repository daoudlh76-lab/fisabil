# 📊 RAPPORT MIGRATION PRODUCTION FISABIL

**Date**: 2026-02-10
**Statut**: 🟡 **MIGRATION PARTIELLE COMPLÉTÉE**

---

## ✅ CE QUI A ÉTÉ ACCOMPLI

### 1. Edge Functions - Déploiement validé ✅

**Test effectué**: Toutes les Edge Functions sont déployées et protégées par auth

| Fonction | Status | HTTP sans auth |
|----------|--------|----------------|
| `tts-generate` | ✅ Déployée | 401 ✓ |
| `speech-to-text` | ✅ Déployée | 401 ✓ |
| `tutor-chat-ai` | ✅ Déployée | 401 ✓ |
| `generate-dictation` | ✅ Déployée | 401 ✓ |
| `generate-exercises` | ✅ Déployée | 401 ✓ |
| `extract-vocab` | ✅ Déployée | 401 ✓ |

**Commande de test exécutée**:
```bash
./test-edge-functions-no-auth.sh
```

### 2. Fichiers client migrés (3/8) ✅

| # | Fichier | Statut | Description |
|---|---------|--------|-------------|
| 1 | `src/utils/openai-tts.ts` | ✅ **MIGRÉ** | TTS via Edge Function |
| 2 | `hooks/use-speech.ts` | ✅ **MIGRÉ** | STT via Edge Function |
| 3 | `src/lib/extract-vocabulary.ts` | ✅ **MIGRÉ** | Extraction vocab via Edge Function |

**Changements effectués**:
- ❌ Supprimé: `const OPENAI_API_KEY = process.env.EXPO_PUBLIC_OPENAI_API_KEY`
- ❌ Supprimé: `fetch('https://api.openai.com/...')`
- ✅ Ajouté: `import { supabase } from '@/src/lib/supabase'`
- ✅ Ajouté: `supabase.functions.invoke('function-name', { body: {...} })`

### 3. Log JWT temporaire ajouté ✅

**Fichier**: `app/_layout.tsx`

**Code ajouté** (lignes 8-20):
```typescript
import { supabase } from '@/src/lib/supabase';

// ⚠️ TEMPORAIRE - LOG JWT POUR TESTS EDGE FUNCTIONS (À SUPPRIMER APRÈS)
(async () => {
  const { data } = await supabase.auth.getSession();
  const s = data.session;
  if (s?.access_token) {
    console.log('\n🔑 ═══ JWT FOR EDGE FUNCTION TEST ═══');
    console.log('USER:', s.user?.id);
    console.log('TOKEN:', s.access_token);
    console.log('═══════════════════════════════════════\n');
  } else {
    console.log('🔑 JWT FOR EDGE TEST: no session yet');
  }
})();
```

**⚠️ ACTION REQUISE**: Supprimer ce log après avoir obtenu le JWT pour les tests

---

## ⚠️ CE QUI RESTE À FAIRE

### 4. Fichiers client NON migrés (5/8) ⚠️

| # | Fichier | Appels OpenAI | Action requise |
|---|---------|---------------|----------------|
| 4 | `hooks/use-chat-tutor.ts` | 5 appels | Remplacer par `tutor-chat-ai` |
| 5 | `hooks/use-tutor.ts` | N appels | Remplacer par `tutor-chat-ai` |
| 6 | `hooks/use-realtime-tutor.ts` | WebSocket | **DÉSACTIVER** temporairement |
| 7 | `app/(tabs)/revision/dictation.tsx` | N appels | Remplacer par `generate-dictation` |
| 8 | `app/(tabs)/revision/index.tsx` | N appels | Remplacer par `generate-exercises` |

### 5. Nettoyage .env ⚠️

**Fichiers à vérifier**:
- `.env`
- `.env.local`

**Ligne à supprimer**:
```bash
EXPO_PUBLIC_OPENAI_API_KEY=sk-proj-...
```

**Commande de vérification**:
```bash
grep "EXPO_PUBLIC_OPENAI_API_KEY" .env*
```

### 6. Test avec JWT réel ⚠️

**Étapes**:
1. Lancer l'app: `npx expo start --clear`
2. Appuyer sur `i` pour iOS
3. Se connecter avec un compte existant
4. Copier le JWT depuis les logs Metro
5. Tester avec curl:

```bash
JWT="<votre_token_ici>"
URL="https://lluabltdmlprrwggwhlq.supabase.co/functions/v1"

# Test TTS
curl -X POST "$URL/tts-generate" \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{"text":"مرحبا بك","voice":"alloy","format":"mp3","speed":1.0}'

# Test Chat Tutor
curl -X POST "$URL/tutor-chat-ai" \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"مرحبا"}],"language":"ar"}'
```

### 7. Validation finale (grep) ⚠️

**Commandes à exécuter après migration complète**:

```bash
# Doit retourner 0 résultats
grep -r "EXPO_PUBLIC_OPENAI" . --exclude-dir={node_modules,.expo,.git,android,ios,supabase}

# Doit retourner 0 résultats
grep -r "api.openai.com" src hooks app

# Doit retourner 0 résultats
grep -r "wss://api.openai.com" src hooks app
```

**État actuel**:
- ❌ `EXPO_PUBLIC_OPENAI`: Quelques occurrences restantes
- ❌ `api.openai.com`: 5 fichiers (use-chat-tutor, use-tutor, use-realtime-tutor, dictation.tsx, index.tsx)
- ❌ `wss://api.openai.com`: À vérifier dans use-realtime-tutor

---

## 📋 GUIDE DE MIGRATION RAPIDE (Fichiers restants)

### Migration type pour hooks/use-chat-tutor.ts

**Remplacer**:
```typescript
// AVANT
const response = await fetch('https://api.openai.com/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${OPENAI_API_KEY}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    model: 'gpt-4o',
    messages: conversationHistory,
  }),
});

const result = await response.json();
const assistantMessage = result.choices[0].message.content;
```

**Par**:
```typescript
// APRÈS
const { data, error } = await supabase.functions.invoke('tutor-chat-ai', {
  body: {
    messages: conversationHistory,
    language: 'ar',
  },
});

if (error || !data) {
  console.error('Chat tutor error:', error);
  // Gérer l'erreur
  return;
}

const assistantMessage = data.message;
```

### Désactivation use-realtime-tutor.ts

**Option simple**:
```typescript
// Début du fichier
export function useRealtimeTutor() {
  console.warn('⚠️ Realtime tutor désactivé (migration Edge Functions)');

  return {
    isConnected: false,
    isListening: false,
    messages: [],
    error: 'Realtime tutor temporairement désactivé',
    connect: () => {},
    disconnect: () => {},
    // ... autres méthodes vides
  };
}
```

---

## 🚀 PLAN D'ACTION FINAL

### Étape 1: Compléter migration client (2-3h)

**Ordre recommandé**:
1. `hooks/use-realtime-tutor.ts` (désactiver) - **10 min**
2. `hooks/use-tutor.ts` - **30 min**
3. `hooks/use-chat-tutor.ts` - **1h** (fichier complexe)
4. `app/(tabs)/revision/dictation.tsx` - **30 min**
5. `app/(tabs)/revision/index.tsx` - **30 min**

**Pour chaque fichier**:
- ❌ Supprimer `const OPENAI_API_KEY = ...`
- ❌ Supprimer `fetch('https://api.openai.com/...')`
- ✅ Ajouter `import { supabase } from '@/src/lib/supabase'`
- ✅ Remplacer par `supabase.functions.invoke(...)`
- ✅ Adapter la gestion des réponses

### Étape 2: Nettoyage (10 min)

```bash
# 1. Supprimer OPENAI_API_KEY des .env
sed -i '' '/EXPO_PUBLIC_OPENAI_API_KEY/d' .env
sed -i '' '/EXPO_PUBLIC_OPENAI_API_KEY/d' .env.local

# 2. Supprimer le log JWT de app/_layout.tsx
# (lignes 8-20)

# 3. Valider
grep -r "EXPO_PUBLIC_OPENAI" .
grep -r "api.openai.com" src hooks app
```

### Étape 3: Test complet (30 min)

```bash
# 1. Redémarrer Metro
npx expo start --clear

# 2. Lancer iOS
# Appuyer sur 'i'

# 3. Tester features:
# - Scan OCR (Google Vision - déjà OK)
# - Extraction vocabulaire
# - TTS (écouter un mot)
# - STT (parler au micro)
# - Chat tuteur
# - Génération dictées
# - Génération exercices
```

### Étape 4: Build production (30 min)

```bash
# iOS
npx expo run:ios --configuration Release

# Android
npx expo run:android --variant release

# Vérifier aucun warning
```

---

## 📊 RÉSUMÉ PROGRESSION

| Catégorie | Complété | Total | % |
|-----------|----------|-------|---|
| **Edge Functions** | 6 | 6 | 100% ✅ |
| **Migration client** | 3 | 8 | 38% 🟡 |
| **Tests déploiement** | 6 | 6 | 100% ✅ |
| **Tests avec JWT** | 0 | 6 | 0% ⏳ |
| **Validation grep** | 0 | 3 | 0% ⏳ |
| **Nettoyage .env** | 0 | 1 | 0% ⏳ |

**Progression globale**: 🟡 **45% COMPLÉTÉ**

---

## 🎯 TEMPS RESTANT ESTIMÉ

| Tâche | Durée |
|-------|-------|
| Migration 5 fichiers client | 2-3h |
| Nettoyage .env | 5 min |
| Tests avec JWT réel | 15 min |
| Validation grep | 5 min |
| Tests E2E features | 30 min |
| Build production | 30 min |
| **TOTAL** | **3-4h** |

---

## 🔧 FICHIERS UTILES CRÉÉS

- ✅ `test-edge-functions-no-auth.sh` - Test déploiement (exécuté avec succès)
- ✅ `MIGRATION_PRODUCTION_REPORT.md` - Ce rapport
- ✅ Scripts de migration dans `MIGRATION_GUIDE.md`

---

## ⚠️ POINTS CRITIQUES

### AVANT de déployer en production:

1. **OBLIGATOIRE**: Supprimer le log JWT de `app/_layout.tsx` (lignes 8-20)
2. **OBLIGATOIRE**: Supprimer `EXPO_PUBLIC_OPENAI_API_KEY` de `.env` et `.env.local`
3. **OBLIGATOIRE**: Migrer les 5 fichiers client restants
4. **OBLIGATOIRE**: Valider `grep` = 0 résultat pour OpenAI
5. **OBLIGATOIRE**: Tester toutes les features avec Edge Functions
6. **RECOMMANDÉ**: Build de test en mode Release avant soumission stores

### Sécurité validée:

✅ Toutes les Edge Functions sont protégées (HTTP 401 sans auth)
✅ Pattern SUPABASE_ANON_KEY appliqué (pas de SERVICE_ROLE_KEY)
✅ 3 fichiers client déjà migrés (TTS, STT, extract-vocab)
✅ Google Vision OCR reste côté client (comme demandé)
✅ Aucune clé OpenAI exposée dans les fichiers migrés

---

**Préparé par**: Claude Sonnet 4.5
**Date**: 2026-02-10
**Statut**: 🟡 MIGRATION PARTIELLE - 5 FICHIERS CLIENT RESTANTS
