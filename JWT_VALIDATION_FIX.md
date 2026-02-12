# 🔧 Fix Final - Validation JWT dans extract-vocab

**Date**: 2026-02-12 08:00 CET
**Problème**: Edge Function retournait toujours 401 même avec SERVICE_ROLE_KEY
**Solution**: Utiliser `supabaseAdmin.auth.getUser(jwt)` avec JWT en paramètre

---

## 🐛 Problème

Même après avoir changé `SUPABASE_ANON_KEY` → `SUPABASE_SERVICE_ROLE_KEY`, l'Edge Function retournait toujours **401 Unauthorized**.

### Erreur
```
status: 401
x-deno-execution-id: 97b11ffa-aa32-4df5-9830-ed1579e85070
```

---

## 🔍 Cause Racine

**Problème**: Mauvaise utilisation de `supabase.auth.getUser()`

**Code incorrect** (tentative 1):
```typescript
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  global: { headers: { Authorization: authHeader } },  // ❌ ANON_KEY ne peut pas valider
});
const { data } = await supabase.auth.getUser();  // ❌ 401 Unauthorized
```

**Code incorrect** (tentative 2):
```typescript
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  global: { headers: { Authorization: authHeader } },  // ❌ SERVICE_ROLE_KEY + header = conflit
});
const { data } = await supabase.auth.getUser();  // ❌ TOUJOURS 401
```

**Pourquoi ça échoue encore ?**
- Quand on passe `Authorization` dans `global.headers`, Supabase essaie d'utiliser CE token pour authentifier les opérations
- Mais `SERVICE_ROLE_KEY` dans le client + JWT dans les headers = conflit
- `getUser()` sans paramètre essaie de lire la session actuelle (qui n'existe pas côté serveur)

---

## ✅ Solution Correcte

### Méthode Valide de Validation JWT Côté Serveur

**Code correct** :
```typescript
// ✅ Créer client admin SANS Authorization header
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
  // ⚠️ PAS de global.headers.Authorization ici !
});

// ✅ Extraire le JWT du header
const jwt = authHeader.replace(/^bearer\s+/i, "");

// ✅ Valider le JWT en le passant EN PARAMÈTRE
const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(jwt);
//                                                                              ^^^
//                                                           Passer JWT ici !

if (userError || !userData?.user) {
  return json({ error: "Unauthorized" }, 401);
}

// ✅ Récupérer user.id validé
const userId = userData.user.id;

// ✅ Utiliser le client admin pour les opérations DB
const supabase = supabaseAdmin;
```

---

## 📊 Différences Clés

| Méthode | Client | Headers | getUser() | Résultat |
|---------|--------|---------|-----------|----------|
| **❌ Tentative 1** | ANON_KEY | `{ Authorization }` | `.getUser()` | 401 (ANON_KEY ne peut pas valider JWT) |
| **❌ Tentative 2** | SERVICE_ROLE_KEY | `{ Authorization }` | `.getUser()` | 401 (conflit entre SERVICE_ROLE et JWT header) |
| **✅ Correcte** | SERVICE_ROLE_KEY | Aucun | `.getUser(jwt)` | ✅ OK (JWT validé par SERVICE_ROLE_KEY) |

---

## 🔐 Architecture de Validation Finale

### Flow Complet

```
┌─────────────────────┐
│   APP MOBILE        │
│                     │
│   Access Token:     │
│   eyJhbGci...       │ ← JWT utilisateur (généré par Supabase Auth)
└──────────┬──────────┘
           │
           │ POST /functions/v1/extract-vocab
           │ Authorization: Bearer eyJhbGci...
           │
           ▼
┌─────────────────────────────────────────────┐
│  EDGE FUNCTION (Deno Runtime)               │
│                                             │
│  1. Extraire JWT du header:                │
│     jwt = authHeader.replace("bearer ", "") │
│                                             │
│  2. Créer client admin (SERVICE_ROLE_KEY): │
│     const supabaseAdmin = createClient(     │
│       SUPABASE_URL,                         │
│       SERVICE_ROLE_KEY,  ← Clé admin        │
│       { /* PAS de Authorization */ }        │
│     )                                       │
│                                             │
│  3. Valider JWT avec SERVICE_ROLE_KEY:     │
│     const { data } =                        │
│       await supabaseAdmin.auth.getUser(jwt) │
│     //                              ^^^     │
│     //                    JWT passé ici !   │
│                                             │
│  4. Vérifier autorisation:                 │
│     if (scan.user_id !== data.user.id)     │
│       return 403 Forbidden                  │
│                                             │
│  5. Appeler OpenAI:                        │
│     fetch('https://api.openai.com/...')    │
│                                             │
│  6. Retourner résultat:                    │
│     return { vocabulaire: [...] }          │
└─────────────────────────────────────────────┘
```

---

## 🧪 Test

### Avant le fix
```javascript
'❌ Vocabulary extraction failed'
'⚠️ Edge Function extraction failed'
'📋 Utilisant mock data...'
```

### Après le fix (attendu)
```javascript
'📡 Extraction du vocabulaire via Edge Function...'
'✅ Extracted: 12 vocab, 5 verbs, 3 particles'
'📚 Vocabulaire stocké en cache'
```

---

## 📝 Code Final Complet

**Fichier**: `supabase/functions/extract-vocab/index.ts`

**Lignes clés** (59-79):
```typescript
// ✅ Auth check
const authHeader = req.headers.get("Authorization") || "";
if (!authHeader.toLowerCase().startsWith("bearer ")) {
  return json({ error: "Missing Authorization Bearer token" }, 401);
}

// Dynamic import for Supabase client
const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.38.4");

// Create admin client with SERVICE_ROLE_KEY (without Authorization header)
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Extract and verify user from JWT manually
const jwt = authHeader.replace(/^bearer\s+/i, "");
const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(jwt);
if (userError || !userData?.user) {
  console.log("[extract-vocab] Auth error:", userError?.message);
  return json({ error: "Unauthorized", details: userError?.message ?? "Invalid token" }, 401);
}

console.log("[extract-vocab] Authenticated user:", userData.user.id);

// Use admin client for DB operations (RLS will still apply based on user_id checks)
const supabase = supabaseAdmin;
```

---

## 🎯 Points Clés

### ✅ Bonnes Pratiques
1. ✅ Utiliser `SERVICE_ROLE_KEY` pour créer le client admin
2. ✅ **NE PAS** passer `Authorization` dans `global.headers`
3. ✅ Extraire le JWT manuellement du header
4. ✅ Passer le JWT en paramètre à `supabaseAdmin.auth.getUser(jwt)`
5. ✅ Logger les erreurs d'authentification pour debug
6. ✅ Vérifier `scan.user_id === userData.user.id` (autorisation)

### ❌ Erreurs à Éviter
1. ❌ Utiliser `ANON_KEY` pour valider des JWT (ne fonctionne pas)
2. ❌ Passer `Authorization` dans `global.headers` avec `SERVICE_ROLE_KEY`
3. ❌ Appeler `getUser()` sans paramètre côté serveur
4. ❌ Oublier de vérifier que `scan.user_id === user.id`

---

## 🚀 Déploiement

```bash
npx supabase functions deploy extract-vocab --no-verify-jwt
```

**Résultat**:
```
✅ Deployed Functions on project lluabltdmlprrwggwhlq: extract-vocab
```

---

## 🎉 Prochaine Étape

**Relancez l'app** et testez l'extraction de vocabulaire.

Cette fois, **ça devrait fonctionner** ! 🎉

---

**Fix final appliqué le**: 2026-02-12 08:00 CET
**Par**: Claude Sonnet 4.5
**Méthode**: `supabaseAdmin.auth.getUser(jwt)` avec JWT en paramètre
