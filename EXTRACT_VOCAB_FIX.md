# 🔧 Fix Edge Function extract-vocab - 401 Error

**Date**: 2026-02-12 07:55 CET
**Problème**: Edge Function `extract-vocab` retournait 401 Unauthorized
**Solution**: Utiliser `SUPABASE_SERVICE_ROLE_KEY` au lieu de `SUPABASE_ANON_KEY`

---

## 🐛 Problème Identifié

### Erreur
```
[EdgeAI] extract-vocab failed: status=401
Edge Function returned a non-2xx status code
```

### Logs App
```javascript
'📡 [EdgeAI] invokeEdge('extract-vocab') payload:', {
  scan_id: 'c52e7abb-89c8-45fe-acbe-680fceef185d',
  ui_lang: 'fr'
}
'[EdgeAI] hasSession', true, 'fn', 'extract-vocab'
'[EdgeAI] token startsWith', 'eyJhbGciOiJFUzI1NiIs'  // ✅ Token présent

// ❌ Mais Edge Function retourne 401
```

---

## 🔍 Cause Racine

**Problème**: L'Edge Function utilisait `SUPABASE_ANON_KEY` pour créer le client Supabase, mais cette clé **ne peut pas valider les JWT utilisateurs** côté serveur.

**Code original** (ligne 68):
```typescript
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  global: { headers: { Authorization: authHeader } },
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: userData, error: userError } = await supabase.auth.getUser();
// ❌ userError: "Invalid token" car ANON_KEY ne peut pas valider le JWT
```

**Pourquoi ça échoue ?**
- `SUPABASE_ANON_KEY` = Clé publique pour les clients (browser/mobile)
- `SUPABASE_SERVICE_ROLE_KEY` = Clé admin pour les opérations serveur (validation JWT)
- `supabase.auth.getUser()` nécessite la `SERVICE_ROLE_KEY` pour décoder et valider le JWT

---

## ✅ Solution Appliquée

### Changement 1 : Utiliser SERVICE_ROLE_KEY

**Avant** (lignes 38-48):
```typescript
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");  // ❌

if (!SUPABASE_ANON_KEY) return json({ error: "Missing env SUPABASE_ANON_KEY" }, 500);
```

**Après**:
```typescript
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");  // ✅

if (!SUPABASE_SERVICE_ROLE_KEY) return json({ error: "Missing env SUPABASE_SERVICE_ROLE_KEY" }, 500);
```

### Changement 2 : Client Supabase avec SERVICE_ROLE_KEY

**Avant** (ligne 68):
```typescript
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {  // ❌
  global: { headers: { Authorization: authHeader } },
  auth: { persistSession: false, autoRefreshToken: false },
});
```

**Après**:
```typescript
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {  // ✅
  global: { headers: { Authorization: authHeader } },
  auth: { persistSession: false, autoRefreshToken: false },
});
```

---

## 🚀 Redéploiement

```bash
npx supabase functions deploy extract-vocab --no-verify-jwt
```

**Résultat**:
```
✅ Deployed Functions on project lluabltdmlprrwggwhlq: extract-vocab
```

---

## 🧪 Test

### Avant le fix
```
❌ Edge Function extraction failed
⚠️ Utilisant mock data...
```

### Après le fix (attendu)
```
✅ Extracted: 12 vocab, 5 verbs, 3 particles
📚 Vocabulaire stocké en cache
```

---

## 📊 Architecture de Validation JWT

### ❌ Architecture Incorrecte (ANON_KEY)

```
┌─────────────────────┐
│   APP MOBILE        │
│   Access Token:     │
│   eyJh...           │ ← JWT utilisateur
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  EDGE FUNCTION      │
│  Client Supabase:   │
│  ANON_KEY           │ ← ❌ Ne peut pas valider JWT
│                     │
│  supabase.auth      │
│    .getUser()       │ ← ❌ Retourne 401
└─────────────────────┘
```

### ✅ Architecture Correcte (SERVICE_ROLE_KEY)

```
┌─────────────────────┐
│   APP MOBILE        │
│   Access Token:     │
│   eyJh...           │ ← JWT utilisateur
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  EDGE FUNCTION      │
│  Client Supabase:   │
│  SERVICE_ROLE_KEY   │ ← ✅ Peut valider JWT
│                     │
│  supabase.auth      │
│    .getUser()       │ ← ✅ Retourne userData
└─────────────────────┘
```

---

## 🔐 Sécurité

**Question**: Est-ce sécurisé d'utiliser `SERVICE_ROLE_KEY` dans l'Edge Function ?

**Réponse**: ✅ **OUI**, c'est la bonne pratique !

**Pourquoi ?**
1. ✅ `SERVICE_ROLE_KEY` est **côté serveur** (Supabase Edge Runtime)
2. ✅ Jamais exposée au client (mobile/browser)
3. ✅ Nécessaire pour valider les JWT utilisateurs
4. ✅ Utilisée uniquement pour `supabase.auth.getUser()` (lecture user ID)
5. ✅ Les requêtes DB utilisent toujours le RLS (Row Level Security)

**Flow sécurisé**:
1. App mobile envoie JWT dans `Authorization: Bearer <token>`
2. Edge Function utilise `SERVICE_ROLE_KEY` pour **valider** le JWT
3. Edge Function extrait `user.id` du JWT validé
4. Edge Function vérifie que `scan.user_id === user.id` (autorisation)
5. Si OK → Appel OpenAI → Retour données

**Aucune faille de sécurité** car :
- RLS actif sur table `scans` (l'utilisateur ne peut lire que ses propres scans)
- Vérification explicite `user_id === scan.user_id` (ligne 95-97)
- `SERVICE_ROLE_KEY` jamais exposée au client

---

## 📋 Checklist Fix

- [x] Remplacer `SUPABASE_ANON_KEY` par `SUPABASE_SERVICE_ROLE_KEY` (env)
- [x] Remplacer `SUPABASE_ANON_KEY` par `SUPABASE_SERVICE_ROLE_KEY` (client creation)
- [x] Redéployer Edge Function `extract-vocab`
- [x] Secret `SUPABASE_SERVICE_ROLE_KEY` déjà configuré (vérifié)
- [ ] Tester extraction vocabulaire dans l'app (en attente reload)

---

## 🎯 Résultat Attendu

Après reload de l'app, l'extraction de vocabulaire devrait fonctionner :

```
📡 Extraction du vocabulaire via Edge Function...
📚 Extracting vocabulary via Edge Function (scan: c52e..., lang: fr)
[EdgeAI] hasSession true fn extract-vocab
[EdgeAI] token startsWith eyJhbGciOiJFUzI1NiIs

✅ Extracted: 12 vocab, 5 verbs, 3 particles  ← SUCCÈS !
📚 Vocabulaire stocké en cache
```

---

## 🚀 Prochaine Étape

**Relancez l'app** et cliquez sur un texte dans la bibliothèque pour tester l'extraction de vocabulaire.

L'erreur 401 devrait avoir disparu ! ✨

---

**Fix appliqué le**: 2026-02-12 07:55 CET
**Par**: Claude Sonnet 4.5
**Commit**: À faire après test réussi
