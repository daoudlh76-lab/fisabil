# 📦 RAPPORT CONFORMITÉ PRODUCTION - FISABIL

**Date**: 2026-02-10  
**Plateforme**: Expo Bare Workflow / React Native  
**Stores cibles**: Apple App Store + Google Play Store

---

## ✅ CORRECTIONS APPLIQUÉES

### 1. Permissions Android (CONFORME ✅)

**Fichier modifié**: `app.json`

**Avant** :
```json
"permissions": [
  "android.permission.RECORD_AUDIO",
  "android.permission.INTERNET",
  "android.permission.CAMERA",
  "android.permission.READ_MEDIA_IMAGES",
  "android.permission.READ_EXTERNAL_STORAGE",    // ❌ INTERDIT
  "android.permission.WRITE_EXTERNAL_STORAGE"    // ❌ INTERDIT
]
```

**Après** :
```json
"permissions": [
  "android.permission.RECORD_AUDIO",
  "android.permission.INTERNET",
  "android.permission.CAMERA",
  "android.permission.READ_MEDIA_IMAGES"         // ✅ Scoped Storage
]
```

**Impact** :
- ✅ Conforme Google Play Scoped Storage
- ✅ Compatible Android 13+
- ✅ Pas de rejet automatique Play Store

---

### 2. Sécurité OCR (PARTIEL ⚠️)

**Fichier modifié**: `src/lib/google-vision-ocr.ts`

**Changements** :
- ✅ Supprimé : `EXPO_PUBLIC_OPENAI_API_KEY`
- ✅ Supprimé : Tous appels directs OpenAI GPT-4 Vision
- ✅ Conservé : Google Vision API (sécurisé côté client avec clé publique)
- ✅ Ajouté : Fallback propre si Google Vision indisponible
- ✅ Ajouté : Documentation claire des fonctions deprecated

**Fonctionnalités** :
- ✅ `performOcr()` : Utilise Google Vision uniquement
- ⚠️ `addDiacritics()` : DEPRECATED - retourne texte original
- ⚠️ `performOcrWithDiacritics()` : N'ajoute plus les diacritiques

**Note importante** :
Les fonctions de diacritisation automatique sont désactivées pour sécurité.
L'Edge Function Supabase `add-diacritics` existe mais n'utilise pas OpenAI.

---

## ⚠️ FICHIERS NÉCESSITANT MIGRATION (CRITIQUE)

Les fichiers suivants exposent ENCORE la clé OpenAI :

### Fichiers React Native à modifier

1. **`src/lib/extract-vocabulary.ts`** (CRITIQUE)
   - Lignes : 7, 274, 398, 479, 514
   - Usage : Extraction vocabulaire arabe
   - Solution : Utiliser Edge Function `extract-vocab` existante
   - Migration : Remplacer appels directs par `supabase.functions.invoke('extract-vocab')`

2. **`src/utils/openai-tts.ts`** (CRITIQUE)
   - Lignes : 19, 97, 147, 265, 278
   - Usage : Text-to-Speech OpenAI
   - Solution : Créer Edge Function `tts-generate` (À FAIRE)
   - Migration : Upload audio vers Supabase Storage

3. **`hooks/use-speech.ts`** (CRITIQUE)
   - Lignes : 8, 144, 174
   - Usage : Speech-to-Text Whisper
   - Solution : Créer Edge Function `speech-to-text` (À FAIRE)
   - Migration : Upload audio base64 vers Edge Function

4. **`hooks/use-chat-tutor.ts`** (CRITIQUE)
   - Lignes : 14, 137, 145, 191, 219, 290, 297, 327, 476
   - Usage : Chat tuteur GPT-4
   - Solution : Améliorer Edge Function `tutor-chat` existante avec OpenAI
   - Migration : Streaming de réponses via Edge Function

5. **`hooks/use-realtime-tutor.ts`** (CRITIQUE)
   - Lignes : 16, 231, 264, 651, 671
   - Usage : WebSocket temps réel OpenAI
   - Solution : Créer Edge Function proxy WebSocket (COMPLEXE)
   - Migration : Server-side WebSocket uniquement

6. **`hooks/use-tutor.ts`** (CRITIQUE)
   - Lignes : 5, 137, 172, 250, 272
   - Usage : Suggestions textes tuteur
   - Solution : Utiliser Edge Function `tutor-chat`
   - Migration : Remplacer appels directs

7. **`app/(tabs)/revision/dictation.tsx`** (MOYEN)
   - Lignes : 16, 37
   - Usage : Génération dictées
   - Solution : Créer Edge Function `generate-dictation` (À FAIRE)
   - Migration : Appel Edge Function simple

8. **`app/(tabs)/revision/index.tsx`** (MOYEN)
   - Lignes : 22, 39
   - Usage : Génération exercices
   - Solution : Créer Edge Function `generate-exercises` (À FAIRE)
   - Migration : Appel Edge Function simple

---

## 🔒 SÉCURITÉ ACTUELLE

### ✅ CONFORME

| Composant | Statut | Détails |
|-----------|--------|---------|
| **RevenueCat** | ✅ SÉCURISÉ | Clés publiques uniquement (`EXPO_PUBLIC_REVENUECAT_*`) |
| **Supabase** | ✅ SÉCURISÉ | Anon key publique uniquement |
| **Google Vision** | ✅ SÉCURISÉ | Clé publique restreinte par domaine/bundle ID |
| **Permissions Android** | ✅ CONFORME | Scoped Storage moderne |
| **Logique Premium** | ✅ SÉCURISÉ | Défaut `isPremium: false`, cache validé server-side |

### ❌ NON-CONFORME

| Composant | Statut | Risque | Action |
|-----------|--------|--------|--------|
| **OpenAI** | ❌ EXPOSÉE | CRITIQUE | Migrer vers Edge Functions |
| **TTS** | ❌ EXPOSÉE | CRITIQUE | Créer Edge Function |
| **STT** | ❌ EXPOSÉE | CRITIQUE | Créer Edge Function |
| **Chat Tutor** | ❌ EXPOSÉE | CRITIQUE | Améliorer Edge Function existante |
| **Realtime** | ❌ EXPOSÉE | CRITIQUE | Proxy WebSocket server-side |
| **Vocab Extract** | ❌ EXPOSÉE | CRITIQUE | Utiliser Edge Function existante |

---

## 🛠️ EDGE FUNCTIONS SUPABASE

### Existantes (Déjà déployées)

| Fonction | Statut | Utilise OpenAI | Notes |
|----------|--------|----------------|-------|
| `extract-vocab` | ✅ DÉPLOYÉE | ✅ OUI | Sécurisée server-side, prête à utiliser |
| `add-diacritics` | ✅ DÉPLOYÉE | ❌ NON | Algorithme basique, pas IA |
| `tutor-chat` | ✅ DÉPLOYÉE | ❌ NON | Réponses prédéfinies uniquement |
| `verify-store-receipt` | ✅ DÉPLOYÉE | ❌ NON | RevenueCat verification |

### À créer (Migration requise)

| Fonction | Priorité | Complexité | Temps estimé |
|----------|----------|------------|--------------|
| `tts-generate` | 🔴 HAUTE | Moyenne | 1-2h |
| `speech-to-text` | 🔴 HAUTE | Moyenne | 1-2h |
| `tutor-chat-ai` | 🔴 HAUTE | Moyenne | 2-3h (améliorer existante) |
| `realtime-tutor` | 🟡 MOYENNE | Haute | 4-6h (WebSocket proxy) |
| `generate-dictation` | 🟡 MOYENNE | Basse | 30min-1h |
| `generate-exercises` | 🟡 MOYENNE | Basse | 30min-1h |

---

## 📊 ESTIMATION MIGRATION COMPLÈTE

### Temps de développement total : 10-16 heures

**Breakdown** :
- Edge Functions backend : 6-10h
- Modifications client : 3-4h
- Tests + débogage : 1-2h

### Approche progressive recommandée

#### ÉTAPE 1 : Fonctions critiques (4-6h)
1. ✅ Améliorer `tutor-chat` avec OpenAI
2. ✅ Créer `tts-generate`
3. ✅ Créer `speech-to-text`
4. ✅ Modifier `use-chat-tutor.ts`, `use-speech.ts`, `openai-tts.ts`

#### ÉTAPE 2 : Extraction vocabulaire (1h)
1. ✅ Modifier `src/lib/extract-vocabulary.ts`
2. ✅ Utiliser Edge Function `extract-vocab` existante

#### ÉTAPE 3 : Génération contenu (2h)
1. ✅ Créer `generate-dictation`
2. ✅ Créer `generate-exercises`
3. ✅ Modifier `dictation.tsx` et `index.tsx`

#### ÉTAPE 4 : Realtime (optionnel, 4-6h)
1. ⚠️ Créer `realtime-tutor` (proxy WebSocket)
2. ⚠️ Modifier `use-realtime-tutor.ts`
3. ⚠️ Ou désactiver temporairement cette feature

---

## 🎯 DÉCISION RECOMMANDÉE

### Option A : Migration complète progressive (RECOMMANDÉ)

**Durée** : 2-3 jours de travail

**Avantages** :
- ✅ 100% sécurisé
- ✅ Toutes fonctionnalités préservées
- ✅ Conforme App Store + Play Store
- ✅ Contrôle coûts OpenAI server-side

**Inconvénients** :
- ⏱️ Nécessite développement backend
- ⏱️ Tests approfondis requis

### Option B : Désactivation temporaire + déploiement rapide

**Durée** : 30 minutes

**Avantages** :
- ✅ App déployable immédiatement
- ✅ Zéro risque sécurité
- ✅ Google Vision OCR fonctionne

**Inconvénients** :
- ⚠️ Fonctionnalités IA désactivées temporairement
- ⚠️ Expérience utilisateur dégradée
- ⚠️ Nécessite migration future de toute façon

---

## 🔍 CHECKLIST FINALE PRODUCTION

### Avant build :

- [ ] Supprimer `EXPO_PUBLIC_OPENAI_API_KEY` de tous les fichiers .env
- [ ] Supprimer tous les appels `fetch('https://api.openai.com/')` côté client
- [ ] Vérifier aucune clé secrète dans le code source
- [ ] Tester OCR avec Google Vision uniquement
- [ ] Tester RevenueCat (achat + restauration)
- [ ] Vérifier permissions Android (pas de READ/WRITE_EXTERNAL_STORAGE)

### Build iOS :

- [ ] `npx expo run:ios` réussit sans erreur
- [ ] Aucun warning sécurité Xcode
- [ ] Info.plist permissions OK
- [ ] RevenueCat native module fonctionne

### Build Android :

- [ ] `npx expo run:android` réussit sans erreur
- [ ] Aucun warning Google Play Policy
- [ ] Permissions manifest OK
- [ ] RevenueCat native module fonctionne

### Tests E2E :

- [ ] Scan texte avec OCR Google Vision
- [ ] Extraction vocabulaire (Edge Function)
- [ ] Achat abonnement RevenueCat
- [ ] Restauration achats
- [ ] Mode premium/free switching

---

## 📝 CONCLUSION

**État actuel** : 🟡 PARTIELLEMENT SÉCURISÉ

**Changements appliqués** :
- ✅ Permissions Android nettoyées
- ✅ OCR sécurisé (Google Vision uniquement)
- ✅ Documentation complète des problèmes

**Changements requis pour production** :
- ⚠️ Migration OpenAI vers Edge Functions (7 fichiers)
- ⚠️ Suppression variable `EXPO_PUBLIC_OPENAI_API_KEY`
- ⚠️ Tests complets post-migration

**Recommandation finale** :

> Pour un déploiement production sécurisé et conforme, suivre l'**Option A (migration progressive)** sur 2-3 jours.  
> Les Edge Functions Supabase garantissent zéro exposition de clés secrètes et un contrôle total des coûts OpenAI.

**Fichiers de référence** :
- 📄 `SECURITY_AUDIT_REPORT.md` : Détails techniques migration
- 📄 `PRODUCTION_READINESS_REPORT.md` : Ce rapport
- 📄 `app.json` : Permissions nettoyées ✅
- 📄 `src/lib/google-vision-ocr.ts` : OCR sécurisé ✅

---

**Préparé par** : Claude Sonnet 4.5  
**Date** : 2026-02-10
