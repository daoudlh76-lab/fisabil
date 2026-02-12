# 🔍 DEBUG: Invalid JWT - Suppression de compte

**Date:** 9 février 2026
**Erreur:** `Invalid JWT` lors de l'appel à l'Edge Function `delete-account`

---

## ❌ SYMPTÔMES

```
'🔥 Calling delete-account via fetch:', 'https://lluabltdmlprrwggwhlq.supabase.co/functions/v1/delete-account'
'❌ delete-account failed:', 'Invalid JWT'
```

- Le fetch call réussit (pas d'erreur réseau)
- L'Edge Function répond avec status 401
- Message: "Invalid JWT"

---

## 🔧 DEBUGGING AJOUTÉ

### Fichier: `app/(tabs)/settings/delete-account.tsx`

**Lignes 80-95:** Debug de session avant l'appel

```typescript
console.log('🔐 Session check:', {
  hasSession: !!sessionData?.session,
  hasToken: !!accessToken,
  tokenLength: accessToken?.length,
  userId: sessionData?.session?.user?.id,
  expiresAt: sessionData?.session?.expires_at,
  expiresIn: sessionData?.session?.expires_at
    ? Math.floor((sessionData.session.expires_at - Date.now() / 1000) / 60) + ' minutes'
    : 'N/A',
});

// Check if token expired
const expiresAt = sessionData?.session?.expires_at;
if (expiresAt && Date.now() / 1000 > expiresAt) {
  console.error('❌ Token expired at:', new Date(expiresAt * 1000).toISOString());
  throw new Error('Session expirée. Déconnecte-toi puis reconnecte-toi.');
}
```

**Lignes 104-108:** Debug des headers de requête

```typescript
console.log('📤 Request headers:', {
  authPrefix: accessToken.substring(0, 20) + '...',
  apikeyPrefix: SUPABASE_ANON_KEY.substring(0, 20) + '...',
});

// ... fetch call ...

console.log('📥 Response status:', res.status, res.statusText);
```

---

### Fichier: `supabase/functions/delete-account/index.ts`

**Lignes 16-33:** Debug de l'authentification côté serveur

```typescript
const authHeader = req.headers.get('Authorization');

console.log('[Delete Account] Auth header present:', !!authHeader);
console.log('[Delete Account] Auth header preview:', authHeader?.substring(0, 30) + '...');

if (!authHeader) {
  console.error('[Delete Account] Missing Authorization header');
  return new Response(
    JSON.stringify({ error: 'Missing Authorization header' }),
    { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

console.log('[Delete Account] Verifying JWT token...');
const { data: { user }, error: authError } = await supabase.auth.getUser();

if (authError || !user) {
  console.error('[Delete Account] Authentication failed:', {
    error: authError?.message,
    name: authError?.name,
    status: authError?.status,
    hasUser: !!user,
  });
  return new Response(
    JSON.stringify({
      error: 'Invalid JWT',
      details: authError?.message || 'User verification failed',
    }),
    { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}
```

---

## 🧪 ÉTAPES DE TEST

### 1. Redéployer l'Edge Function

```bash
cd /Users/daoudlh/fisabil
npx supabase functions deploy delete-account
```

### 2. Tester dans l'app

1. Se connecter avec un compte test
2. Aller dans Settings → Supprimer mon compte
3. Suivre le flow de suppression
4. Regarder les logs Metro (client)
5. Regarder les logs Edge Function (serveur)

### 3. Vérifier les logs Metro (client)

**Ce qu'on devrait voir:**

```
🔐 Session check: {
  hasSession: true,
  hasToken: true,
  tokenLength: 200+,
  userId: "abc123...",
  expiresAt: 1707512345,
  expiresIn: "58 minutes"
}

📤 Request headers: {
  authPrefix: "eyJhbGciOiJIUzI1NiIs...",
  apikeyPrefix: "eyJhbGciOiJIUzI1NiIs..."
}

🔥 Calling delete-account via fetch: https://lluabltdmlprrwggwhlq.supabase.co/functions/v1/delete-account

📥 Response status: 200 OK
```

**Si token expiré:**

```
🔐 Session check: {
  expiresAt: 1707500000,
  expiresIn: "-12 minutes"  ⚠️ NÉGATIF!
}

❌ Token expired at: 2026-02-09T14:00:00.000Z
```

### 4. Vérifier les logs Edge Function (serveur)

```bash
npx supabase functions logs delete-account --tail
```

**Ce qu'on devrait voir (succès):**

```
[Delete Account] Auth header present: true
[Delete Account] Auth header preview: Bearer eyJhbGciOiJIUzI1NiIs...
[Delete Account] Verifying JWT token...
[Delete Account] Starting deletion for user: abc123...
[Delete Account] Deleted data from 10 tables
[Delete Account] Successfully deleted user: abc123...
```

**Si JWT invalide:**

```
[Delete Account] Auth header present: true
[Delete Account] Auth header preview: Bearer eyJhbGciOiJIUzI1NiIs...
[Delete Account] Verifying JWT token...
[Delete Account] Authentication failed: {
  error: "JWT expired" / "invalid signature" / "malformed token",
  name: "AuthError",
  status: 401,
  hasUser: false
}
```

---

## 🔍 CAUSES POSSIBLES

### 1. Token expiré ⏱️
- JWT Supabase expire par défaut après 1 heure
- Si utilisateur reste connecté longtemps, le token n'est pas auto-refresh

**Solution:** Forcer un refresh avant suppression

```typescript
// Dans executeAccountDeletion():
const { data, error } = await supabase.auth.refreshSession();
if (error) throw new Error('Impossible de rafraîchir la session');
const accessToken = data.session?.access_token;
```

### 2. Token malformé 🔨
- Variable d'environnement SUPABASE_URL ou ANON_KEY incorrecte
- Token contient des caractères spéciaux non échappés

**Solution:** Vérifier les variables d'environnement

```bash
# Vérifier .env ou app.json
grep SUPABASE .env
```

### 3. CORS ou headers manquants 🌐
- L'Edge Function ne reçoit pas le header Authorization
- Proxy ou CDN strip le header

**Solution:** Vérifier avec curl direct

```bash
# Récupérer un vrai JWT depuis l'app
TOKEN="eyJhbGci..."

curl -i -X POST \
  'https://lluabltdmlprrwggwhlq.supabase.co/functions/v1/delete-account' \
  -H "Authorization: Bearer $TOKEN" \
  -H "apikey: eyJhbGci..." \
  -H "Content-Type: application/json" \
  -d '{}'
```

### 4. Edge Function pas déployée 🚀
- Code modifié mais pas redéployé
- Deploy failed silencieusement

**Solution:** Redéployer explicitement

```bash
npx supabase functions deploy delete-account --debug
```

### 5. Supabase JWT secret changed 🔐
- Project reset ou migration
- Secret rotation

**Solution:** Vérifier dans Supabase Dashboard → Settings → API

---

## ✅ FIX PROBABLE: Refresh Session

**Hypothèse la plus probable:** Token expiré car utilisateur connecté depuis longtemps.

**Fix recommandé:**

```typescript
const executeAccountDeletion = async () => {
  setIsDeleting(true);

  try {
    // ✅ Force session refresh AVANT de récupérer le token
    console.log('🔄 Refreshing session...');
    const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();

    if (refreshError) {
      console.error('❌ Refresh failed:', refreshError);
      throw new Error('Impossible de rafraîchir la session. Reconnecte-toi.');
    }

    const accessToken = refreshData?.session?.access_token;

    if (!accessToken) {
      throw new Error('Session introuvable après refresh.');
    }

    console.log('🔐 Session refreshed, token length:', accessToken.length);

    // ... reste du code fetch ...
  } catch (error: any) {
    // ...
  }
};
```

---

## 📊 RÉSUMÉ

**Fichiers modifiés:**
- `app/(tabs)/settings/delete-account.tsx` (lignes 80-95, 104-108)
- `supabase/functions/delete-account/index.ts` (lignes 16-48)

**Prochaines étapes:**
1. Redéployer Edge Function
2. Tester avec les nouveaux logs
3. Si token expiré → ajouter `refreshSession()`
4. Si autre erreur → analyser les logs serveur

**Commandes:**
```bash
# Déployer
npx supabase functions deploy delete-account

# Logs serveur
npx supabase functions logs delete-account --tail

# Logs client
npx expo start
```

---

**Status:** 🔍 DEBUGGING EN COURS
**Next:** Redéployer + tester + analyser les logs
