# ✅ RAPPORT MIGRATION OPENAI → EDGE FUNCTIONS

**Date** : 2026-02-10
**App** : Fisabil
**Statut** : 🟢 EDGE FUNCTIONS CRÉÉES — MIGRATION CLIENT EN ATTENTE

---

## 📦 LIVRABLES

### 1️⃣ Edge Functions créées (5 nouvelles + 1 existante)

| Function | Fichier | Statut | Usage |
|----------|---------|--------|-------|
| `tts-generate` | [supabase/functions/tts-generate/index.ts](supabase/functions/tts-generate/index.ts) | ✅ CRÉÉ | Text-to-Speech OpenAI |
| `speech-to-text` | [supabase/functions/speech-to-text/index.ts](supabase/functions/speech-to-text/index.ts) | ✅ CRÉÉ | Whisper STT |
| `tutor-chat-ai` | [supabase/functions/tutor-chat-ai/index.ts](supabase/functions/tutor-chat-ai/index.ts) | ✅ CRÉÉ | Chat GPT-4 tuteur |
| `generate-dictation` | [supabase/functions/generate-dictation/index.ts](supabase/functions/generate-dictation/index.ts) | ✅ CRÉÉ | Génération dictées |
| `generate-exercises` | [supabase/functions/generate-exercises/index.ts](supabase/functions/generate-exercises/index.ts) | ✅ CRÉÉ | Génération exercices |
| `extract-vocab` | supabase/functions/extract-vocab/index.ts | ✅ EXISTE | Extraction vocabulaire |

### 2️⃣ Guides créés

| Document | Contenu |
|----------|---------|
| [MIGRATION_GUIDE.md](MIGRATION_GUIDE.md) | Guide complet migration code client |
| [DEPLOYMENT_COMMANDS.md](DEPLOYMENT_COMMANDS.md) | Commandes déploiement Supabase |
| [SECURITY_AUDIT_REPORT.md](SECURITY_AUDIT_REPORT.md) | Audit sécurité (créé précédemment) |
| [PRODUCTION_READINESS_REPORT.md](PRODUCTION_READINESS_REPORT.md) | Conformité production |

### 3️⃣ Fichiers modifiés (corrections partielles)

| Fichier | Modifications | Statut |
|---------|---------------|--------|
| [app.json](app.json) | Permissions Android nettoyées | ✅ TERMINÉ |
| [src/lib/google-vision-ocr.ts](src/lib/google-vision-ocr.ts) | OpenAI désactivé, Google Vision seul | ✅ TERMINÉ |

---

## ⚠️ TRAVAIL RESTANT (MIGRATION CLIENT)

### Fichiers nécessitant migration (8 fichiers)

| # | Fichier | Appels OpenAI | Priorité | Edge Function cible |
|---|---------|---------------|----------|---------------------|
| 1 | `src/lib/extract-vocabulary.ts` | ✅ Expose clé | 🔴 HAUTE | `extract-vocab` (existe) |
| 2 | `src/utils/openai-tts.ts` | ✅ Expose clé | 🔴 HAUTE | `tts-generate` (créée) |
| 3 | `hooks/use-speech.ts` | ✅ Expose clé | 🔴 HAUTE | `speech-to-text` (créée) |
| 4 | `hooks/use-chat-tutor.ts` | ✅ Expose clé | 🔴 HAUTE | `tutor-chat-ai` (créée) |
| 5 | `hooks/use-realtime-tutor.ts` | ✅ WebSocket exposé | 🟡 MOYENNE | Désactiver temporairement |
| 6 | `hooks/use-tutor.ts` | ✅ Expose clé | 🔴 HAUTE | `tutor-chat-ai` (créée) |
| 7 | `app/(tabs)/revision/dictation.tsx` | ✅ Expose clé | 🟡 MOYENNE | `generate-dictation` (créée) |
| 8 | `app/(tabs)/revision/index.tsx` | ✅ Expose clé | 🟡 MOYENNE | `generate-exercises` (créée) |

**Temps estimé migration client** : 3-4 heures

---

## 🔐 SÉCURITÉ DES EDGE FUNCTIONS

### ✅ Fonctionnalités sécurité implémentées

Chaque Edge Function inclut :

1. **Authentification requise**
   ```typescript
   const authHeader = req.headers.get("Authorization");
   const { data: userData } = await supabase.auth.getUser(token);
   ```

2. **Validation payload**
   ```typescript
   if (!text || text.length > MAX_TEXT_LENGTH) {
     return error 400;
   }
   ```

3. **Rate limiting** (via Supabase)
   - Limites automatiques par IP
   - Limites par utilisateur possibles

4. **CORS configuré**
   ```typescript
   const corsHeaders = {
     "Access-Control-Allow-Origin": "*",
     "Access-Control-Allow-Headers": "authorization, ...",
   };
   ```

5. **Logs sécurisés**
   ```typescript
   console.log(`🎤 Generating TTS for user ${userData.user.id}`);
   // Ne log jamais la clé OpenAI
   ```

6. **Gestion erreurs**
   ```typescript
   try { ... } catch (error) {
     // Pas de leak d'info sensible
     return { error: "Internal server error" };
   }
   ```

---

## 📋 CHECKLIST DÉPLOIEMENT

### Backend (Edge Functions)

- [x] Functions créées localement
- [ ] Secrets Supabase configurés (`OPENAI_API_KEY`)
- [ ] Functions déployées via `supabase functions deploy`
- [ ] Tests endpoint TTS réussi
- [ ] Tests endpoint STT réussi
- [ ] Tests endpoint Chat réussi
- [ ] Tests endpoint Dictation réussi
- [ ] Tests endpoint Exercises réussi
- [ ] Monitoring logs activé

### Frontend (Migration client)

- [ ] `src/lib/extract-vocabulary.ts` migré
- [ ] `src/utils/openai-tts.ts` migré
- [ ] `hooks/use-speech.ts` migré
- [ ] `hooks/use-chat-tutor.ts` migré
- [ ] `hooks/use-realtime-tutor.ts` désactivé
- [ ] `hooks/use-tutor.ts` migré
- [ ] `app/(tabs)/revision/dictation.tsx` migré
- [ ] `app/(tabs)/revision/index.tsx` migré
- [ ] Variable `EXPO_PUBLIC_OPENAI_API_KEY` supprimée

### Tests & Validation

- [ ] Recherche `EXPO_PUBLIC_OPENAI` → 0 résultat
- [ ] Recherche `api.openai.com` → 0 résultat
- [ ] OCR Google Vision fonctionne
- [ ] TTS via Edge Function fonctionne
- [ ] Chat tuteur via Edge Function fonctionne
- [ ] Build iOS réussit
- [ ] Build Android réussit

---

## 🎯 NEXT STEPS (ORDRE RECOMMANDÉ)

### ÉTAPE 1 : Déployer Edge Functions (15 min)

```bash
# 1. Configurer secret OpenAI
supabase secrets set OPENAI_API_KEY=sk-proj-...

# 2. Déployer functions
for func in tts-generate speech-to-text tutor-chat-ai generate-dictation generate-exercises; do
  supabase functions deploy $func
done

# 3. Tester
supabase functions invoke tts-generate --body '{"text":"test"}'
```

### ÉTAPE 2 : Migrer fichiers critiques (2h)

**Priorité 1** (bloquants) :
1. `src/utils/openai-tts.ts` → Utiliser `tts-generate`
2. `hooks/use-speech.ts` → Utiliser `speech-to-text`
3. `hooks/use-chat-tutor.ts` → Utiliser `tutor-chat-ai`

**Priorité 2** (importants) :
4. `src/lib/extract-vocabulary.ts` → Utiliser `extract-vocab`
5. `hooks/use-tutor.ts` → Utiliser `tutor-chat-ai`

**Priorité 3** (optionnels) :
6. `app/(tabs)/revision/dictation.tsx` → Utiliser `generate-dictation`
7. `app/(tabs)/revision/index.tsx` → Utiliser `generate-exercises`
8. `hooks/use-realtime-tutor.ts` → Désactiver

### ÉTAPE 3 : Nettoyer & Valider (30 min)

```bash
# Supprimer variable
# Dans .env / .env.local :
# ❌ Supprimer : EXPO_PUBLIC_OPENAI_API_KEY=...

# Validation
grep -r "EXPO_PUBLIC_OPENAI" src/ hooks/ app/
# → Doit retourner 0 résultat

grep -r "api.openai.com" src/ hooks/ app/
# → Doit retourner 0 résultat
```

### ÉTAPE 4 : Tests E2E (1h)

- [ ] Scan texte avec OCR Google Vision
- [ ] Extraction vocabulaire via Edge Function
- [ ] Génération audio TTS
- [ ] Reconnaissance vocale STT
- [ ] Chat tuteur IA
- [ ] Abonnement RevenueCat

### ÉTAPE 5 : Build Production (30 min)

```bash
# iOS
npx expo run:ios --configuration Release

# Android
npx expo run:android --variant release

# Vérifier aucun warning sécurité
```

---

## 📊 COMPARAISON AVANT / APRÈS

### AVANT (Insécurisé)

```typescript
// ❌ Clé exposée côté client
const OPENAI_API_KEY = process.env.EXPO_PUBLIC_OPENAI_API_KEY;

// ❌ Appel direct depuis l'app
const response = await fetch('https://api.openai.com/v1/audio/speech', {
  headers: { 'Authorization': `Bearer ${OPENAI_API_KEY}` },
  ...
});
```

**Problèmes** :
- 🔴 Clé extraitable depuis APK/IPA
- 🔴 Facturation frauduleuse possible
- 🔴 Rejet App Store / Play Store
- 🔴 Aucun contrôle d'usage

### APRÈS (Sécurisé)

```typescript
// ✅ Aucune clé côté client
import { supabase } from '@/src/lib/supabase';

// ✅ Appel Edge Function sécurisée
const { data, error } = await supabase.functions.invoke('tts-generate', {
  body: { text, voice: 'alloy' },
});
```

**Avantages** :
- ✅ Clé OpenAI uniquement server-side
- ✅ Auth Supabase requise
- ✅ Rate limiting possible
- ✅ Conforme stores
- ✅ Monitoring & logs

---

## 💰 COÛTS OPENAI

### Contrôle côté serveur

Avec Edge Functions, vous pouvez :

1. **Limiter par utilisateur**
   ```typescript
   // Dans Edge Function
   const usage = await checkUserUsage(userData.user.id);
   if (usage.ttsMinutesThisMonth > 10) {
     return error("Usage limit exceeded");
   }
   ```

2. **Tarification premium**
   ```typescript
   // Réserver certaines features aux premium
   const isPremium = await checkPremiumStatus(userData.user.id);
   if (!isPremium && requestedModel === 'gpt-4o') {
     return error("Premium feature");
   }
   ```

3. **Monitoring coûts**
   - Dashboard Supabase : nombre d'appels
   - Logs OpenAI : tokens utilisés
   - Alertes si dépassement

---

## 🔍 VALIDATION SÉCURITÉ

### Tests à effectuer avant production

```bash
# 1. Aucune clé OpenAI exposée
grep -r "sk-proj-" src/ hooks/ app/
grep -r "EXPO_PUBLIC_OPENAI" src/ hooks/ app/

# 2. Aucun endpoint OpenAI direct
grep -r "api.openai.com" src/ hooks/ app/
grep -r "wss://api.openai.com" src/ hooks/ app/

# 3. Toutes les clés sont publiques
grep -r "EXPO_PUBLIC_" .env* | grep -v "SUPABASE\|VISION\|REVENUECAT"

# 4. Build analysis
# iOS : Xcode > Product > Analyze
# Android : gradlew check
```

**Résultat attendu** : ✅ 0 warning sécurité

---

## 📞 SUPPORT & RÉFÉRENCES

### Documentation

- [Supabase Edge Functions](https://supabase.com/docs/guides/functions)
- [OpenAI API Reference](https://platform.openai.com/docs/api-reference)
- [Expo Secure Store](https://docs.expo.dev/versions/latest/sdk/securestore/)

### Fichiers de référence

- `MIGRATION_GUIDE.md` : Guide détaillé migration code
- `DEPLOYMENT_COMMANDS.md` : Commandes Supabase
- `SECURITY_AUDIT_REPORT.md` : Audit sécurité complet

### Rollback si problème

Si migration cause problème :
1. Garder Edge Functions déployées (pas de risque)
2. Restaurer code client depuis git
3. Re-tester avec clés (temporaire uniquement)
4. Debug le problème
5. Ré-appliquer migration correctement

---

## ✅ CONCLUSION

### Ce qui est fait

✅ **5 Edge Functions créées** et prêtes à déployer
✅ **Sécurité implémentée** (auth, validation, CORS, logs)
✅ **Guides complets** fournis (migration + déploiement)
✅ **OCR sécurisé** (Google Vision seul)
✅ **Permissions Android** conformes

### Ce qui reste à faire

⚠️ **Déployer Edge Functions** (15 min via Supabase CLI)
⚠️ **Migrer 8 fichiers client** (3-4h de développement)
⚠️ **Supprimer EXPO_PUBLIC_OPENAI_API_KEY** (5 min)
⚠️ **Tests complets** (1h)
⚠️ **Build production** (30 min)

### Temps total restant estimé

🕐 **5-6 heures de développement**

---

## 🎯 STATUT FINAL

🟡 **MIGRATION BACKEND COMPLÈTE — FRONTEND EN ATTENTE**

**Pour rendre l'app 100% production-ready** :
1. Déployer les Edge Functions ✅ (backend prêt)
2. Migrer le code client → Edge Functions ⏳ (à faire)
3. Tester + build ⏳ (à faire)

**Après ces étapes** : 🟢 APP PRÊTE POUR APP STORE / GOOGLE PLAY

---

**Préparé par** : Claude Sonnet 4.5
**Date** : 2026-02-10
