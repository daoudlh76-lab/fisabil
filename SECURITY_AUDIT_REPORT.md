# 🔐 RAPPORT AUDIT SÉCURITÉ PRODUCTION - FISABIL

**Date**: 2026-02-10  
**Statut**: 🔴 CRITIQUE - APP NON-DÉPLOYABLE EN L'ÉTAT  
**Priorité**: URGENTE

---

## 📋 RÉSUMÉ EXÉCUTIF

L'application Fisabil expose actuellement la clé OpenAI côté client dans 8+ fichiers, représentant un **risque de sécurité critique** et une **violation des politiques App Store / Google Play**.

### ✅ CORRECTIONS APPLIQUÉES IMMÉDIATEMENT

1. ✅ **Permissions Android nettoyées** (TERMINÉ)
   - Supprimé: `READ_EXTERNAL_STORAGE`
   - Supprimé: `WRITE_EXTERNAL_STORAGE`
   - Fichier: `app.json`
   - Conforme Google Play Scoped Storage

2. ✅ **OCR sécurisé** (TERMINÉ)
   - Fichier: `src/lib/google-vision-ocr.ts`
   - OpenAI désactivé côté client
   - Google Vision conservé (comme demandé)
   - Fallback propre avec messages clairs

### ⚠️ CORRECTIONS RESTANTES (URGENT)

Les fichiers suivants utilisent ENCORE la clé OpenAI côté client :

| Fichier | Usage | Risque | Action requise |
|---------|-------|--------|----------------|
| `src/lib/extract-vocabulary.ts` | Extraction vocab | 🔴 CRITIQUE | Utiliser Edge Function existante |
| `src/utils/openai-tts.ts` | Text-to-Speech | 🔴 CRITIQUE | Créer Edge Function TTS |
| `hooks/use-speech.ts` | Speech-to-Text | 🔴 CRITIQUE | Créer Edge Function STT |
| `hooks/use-chat-tutor.ts` | Chat tuteur | 🔴 CRITIQUE | Améliorer Edge Function existante |
| `hooks/use-realtime-tutor.ts` | WebSocket temps réel | 🔴 CRITIQUE | Créer proxy WebSocket |
| `hooks/use-tutor.ts` | Suggestions textes | 🔴 CRITIQUE | Utiliser Edge Function |
| `app/(tabs)/revision/dictation.tsx` | Génération dictées | 🟡 MOYEN | Créer Edge Function |
| `app/(tabs)/revision/index.tsx` | Génération exercices | 🟡 MOYEN | Créer Edge Function |

---

## 🛠️ PLAN DE MIGRATION COMPLET

### PHASE 1 : Edge Functions à créer (Backend Supabase)

#### 1.1 TTS (Text-to-Speech)
```typescript
// supabase/functions/tts-generate/index.ts
// Input: { text: string, voice?: string, speed?: number }
// Output: { audioUrl: string } // Signed URL Supabase Storage
```

#### 1.2 STT (Speech-to-Text)
```typescript
// supabase/functions/speech-to-text/index.ts
// Input: { audioData: base64, language?: string }
// Output: { text: string, confidence: number }
```

#### 1.3 Tutor Chat AI
```typescript
// supabase/functions/tutor-chat-ai/index.ts
// Améliorer l'existante avec OpenAI GPT-4
// Input: { messages: [], userWords: [] }
// Output: { response: string, suggestions?: [] }
```

#### 1.4 Realtime Tutor (Proxy WebSocket)
```typescript
// supabase/functions/realtime-tutor/index.ts
// Proxy sécurisé vers OpenAI Realtime API
// Gestion WebSocket server-side uniquement
```

#### 1.5 Generate Dictation
```typescript
// supabase/functions/generate-dictation/index.ts
// Input: { text: string, difficulty: string }
// Output: { dictation: {...} }
```

#### 1.6 Generate Exercises
```typescript
// supabase/functions/generate-exercises/index.ts
// Input: { text: string, exerciseType: string }
// Output: { exercises: [...] }
```

### PHASE 2 : Modifications côté client (React Native)

Chaque fichier doit être modifié pour :
1. Supprimer `EXPO_PUBLIC_OPENAI_API_KEY`
2. Supprimer tous les appels directs `fetch('https://api.openai.com/...')`
3. Remplacer par appels Supabase Edge Functions :
```typescript
const { data, error } = await supabase.functions.invoke('function-name', {
  body: { ...params }
});
```
4. Ajouter gestion d'erreurs propre
5. Ajouter fallback si Edge Function indisponible

### PHASE 3 : Variables d'environnement

#### Client (.env)
```bash
# ✅ GARDER (publiques)
EXPO_PUBLIC_SUPABASE_URL=...
EXPO_PUBLIC_SUPABASE_ANON_KEY=...
EXPO_PUBLIC_GOOGLE_VISION_API_KEY=...
EXPO_PUBLIC_REVENUECAT_API_KEY=...

# ❌ SUPPRIMER (secrète)
EXPO_PUBLIC_OPENAI_API_KEY=... # À SUPPRIMER COMPLÈTEMENT
```

#### Supabase Edge Functions (secrets)
```bash
# Dans Dashboard Supabase > Edge Functions > Secrets
OPENAI_API_KEY=sk-proj-...
SUPABASE_SERVICE_ROLE_KEY=...
```

---

## 📊 ÉTAT ACTUEL DE SÉCURITÉ

### ✅ CONFORME
- RevenueCat : Clé publique OK côté client
- Supabase : Anon key OK côté client
- Google Vision : Clé publique OK (comme demandé)
- Permissions Android : CONFORME Google Play

### ❌ NON-CONFORME
- OpenAI : Clé secrète EXPOSÉE dans 7+ fichiers
- Risque financier : Facturation frauduleuse illimitée
- Risque rejet stores : Violation politiques Apple/Google

---

## 🎯 PROCHAINES ÉTAPES RECOMMANDÉES

### Option A : Migration complète (RECOMMANDÉ - 100% sécurisé)
**Durée estimée** : 4-6 heures de développement

1. Créer les 6 Edge Functions manquantes
2. Modifier les 7 fichiers client
3. Tester toutes les fonctionnalités
4. Supprimer `EXPO_PUBLIC_OPENAI_API_KEY`
5. Build de production

**Avantages** :
- ✅ Sécurité maximale
- ✅ Conforme App Store / Play Store
- ✅ Contrôle coûts OpenAI
- ✅ Meilleur monitoring

### Option B : Désactivation temporaire (RAPIDE - Mode dégradé)
**Durée estimée** : 30 minutes

1. Désactiver toutes les fonctions OpenAI côté client
2. Afficher messages : "Fonctionnalité en cours de mise à jour"
3. Conserver Google Vision OCR uniquement
4. Build de production possible immédiatement

**Avantages** :
- ✅ App déployable rapidement
- ✅ Zéro risque sécurité
- ⚠️ Fonctionnalités réduites temporairement

---

## 🔍 VALIDATION FINALE

Avant déploiement production, vérifier :

- [ ] Aucun `EXPO_PUBLIC_OPENAI_API_KEY` dans le code
- [ ] Aucun appel `fetch('https://api.openai.com/')` côté client
- [ ] Aucune clé secrète dans variables .env client
- [ ] Permissions Android conformes (pas de READ/WRITE_EXTERNAL_STORAGE)
- [ ] Edge Functions déployées et testées
- [ ] Build iOS réussit sans erreur
- [ ] Build Android réussit sans erreur
- [ ] Tests E2E passent (OCR, TTS, Chat, etc.)

---

## 📞 CONTACT / SUPPORT

Pour questions techniques sur cette migration :
- Documentation Supabase Edge Functions : https://supabase.com/docs/guides/functions
- Documentation OpenAI API : https://platform.openai.com/docs/api-reference

---

**CONCLUSION** :  
L'application Fisabil nécessite une migration immédiate des appels OpenAI vers Edge Functions sécurisées avant tout déploiement en production.

**Statut actuel** : 🔴 BLOQUÉ pour production  
**Après correction** : 🟢 PRÊT pour App Store / Google Play
