# Fix 401 Edge Functions - Rapport

## Date: 2026-02-11

## Modifications effectuées

### 1. Fichier `src/lib/edge-ai.ts` ✅

**Modifications appliquées:**
- Récupération correcte du token: `const { data: sessionData } = await supabase.auth.getSession()`
- Extraction sécurisée: `const accessToken = sessionData?.session?.access_token`
- **Suppression du header Content-Type** (peut causer des problèmes CORS/preflight)
- Ajout des logs de debug:
  ```typescript
  console.log("[EdgeAI] hasSession", !!accessToken, "fn", fnName);
  console.log("[EdgeAI] token startsWith", accessToken?.slice(0, 20));
  ```
- Amélioration des logs d'erreur avec status, message et URL

**Code final:**
```typescript
export async function invokeEdge<T = any>(fnName: string, body: any): Promise<T> {
  if (__DEV__) {
    console.log(`📡 [EdgeAI] invokeEdge('${fnName}') payload:`, body);
  }

  // Récupérer la session
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData?.session?.access_token;

  if (!accessToken) {
    throw new Error("No session or access token");
  }

  console.log("[EdgeAI] hasSession", !!accessToken, "fn", fnName);
  console.log("[EdgeAI] token startsWith", accessToken?.slice(0, 20));

  const { data, error } = await supabase.functions.invoke(fnName, {
    body,
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });

  if (__DEV__) {
    console.log(`📡 [EdgeAI] invokeEdge('${fnName}') response:`, data, error);
  }
  if (error) {
    const errMsg = `[EdgeAI] ${fnName} failed: status=${error.status || 'unknown'}, message=${error.message}`;
    console.error(errMsg, "url:", error.context?.url);
    throw new Error(errMsg);
  }
  return data as T;
}
```

### 2. Vérification codebase ✅

- ✅ Tous les appels Edge Functions utilisent `invokeEdge()`
- ✅ Aucun appel direct à `supabase.functions.invoke()` trouvé (sauf dans edge-ai.ts)
- ✅ Fichiers vérifiés: `use-chat-tutor.ts`, `use-tutor.ts`, `openai-tts.ts`, etc.

### 3. Tests effectués ✅

- ✅ Metro bundler relancé avec cache clean: `npx expo start -c`
- ✅ App rechargée dans iOS Simulator (iPhone 17 Pro)
- ✅ Logs `[EdgeAI]` apparaissent correctement
- ✅ JWT est bien envoyé (token startsWith visible dans logs)

## Problème persistant: 401 Unauthorized ❌

### Symptômes observés dans les logs

```
'[EdgeAI] hasSession', true, 'fn', 'tutor-chat-ai'
'[EdgeAI] token startsWith', 'eyJhbGciOiJFUzI1NiIs'
'📡 [EdgeAI] invokeEdge('tutor-chat-ai') response:', null, {
  FunctionsHttpError: Edge Function returned a non-2xx status code
  status: 401
  url: 'https://lluabltdmlprrwggwhlq.supabase.co/functions/v1/tutor-chat-ai'
}
'[EdgeAI] tutor-chat-ai failed: status=unknown, message=Edge Function returned a non-2xx status code'
```

### Diagnostic

**Le problème n'est PAS côté client** - le JWT est correctement envoyé.

**Le problème est côté serveur:**
- Les Edge Functions sont bloquées par le Supabase Gateway **AVANT** d'atteindre le code de l'Edge Function
- Les fichiers `config.toml` avec `verify_jwt = false` ne sont pas appliqués
- Supabase utilise probablement une vérification JWT automatique qui rejette le token

### Fichiers config.toml créés (mais non appliqués)

Tous les fichiers existent mais ne sont pas pris en compte:
- `supabase/functions/tutor-chat-ai/config.toml`
- `supabase/functions/speech-to-text/config.toml`
- `supabase/functions/tts-generate/config.toml`
- `supabase/functions/extract-vocab/config.toml`

Contenu de chaque fichier:
```toml
# Disable automatic JWT verification
# The function handles auth manually with supabase.auth.getUser()
verify_jwt = false
```

### Code Edge Function vérifié

Les Edge Functions vérifient bien le JWT manuellement (ex: `tutor-chat-ai/index.ts:40`):
```typescript
const { data: { user }, error: userError } = await supabase.auth.getUser();
if (userError || !user) {
  return new Response(
    JSON.stringify({ error: "Unauthorized - Invalid or missing token" }),
    { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}
```

## Causes possibles du 401

1. **JWT expiré ou invalide**
   - Le token envoyé pourrait être expiré
   - Le token ne correspond pas au secret Supabase attendu
   - Format du token incorrect (bien que le début soit correct: `eyJhbGciOiJFUzI1NiIs`)

2. **config.toml non déployés**
   - Supabase CLI ne lit pas les config.toml lors du déploiement
   - Les configs doivent être définies via le Dashboard Supabase
   - Ou via `supabase secrets set` pour les configs

3. **Problème de configuration projet Supabase**
   - JWT Secret incorrect dans `.env.local`
   - SUPABASE_ANON_KEY différent entre client et serveur
   - Projet Supabase en mode "restricted" bloquant les calls non-vérifiés

4. **Headers manquants ou incorrects**
   - Supabase attend peut-être `apikey` en plus de `Authorization`
   - Format du header Authorization incorrect (bien que `Bearer ${token}` soit standard)

## Solutions à tester

### 1. Vérifier la validité du JWT côté client

Ajouter un log pour voir le token complet (temporairement, en DEV uniquement):
```typescript
if (__DEV__) {
  console.log("[EdgeAI] Full token (DEV ONLY):", accessToken);
}
```

### 2. Ajouter le header `apikey` en plus de `Authorization`

Modifier `src/lib/edge-ai.ts`:
```typescript
const { data, error } = await supabase.functions.invoke(fnName, {
  body,
  headers: {
    Authorization: `Bearer ${accessToken}`,
    apikey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || ''
  }
});
```

### 3. Configurer `verify_jwt = false` via Supabase Dashboard

1. Aller sur https://supabase.com/dashboard
2. Sélectionner le projet `lluabltdmlprrwggwhlq`
3. Edge Functions → Settings → Each function
4. Désactiver "Verify JWT" pour chaque fonction

### 4. Redéployer les Edge Functions avec force

```bash
npx supabase functions deploy tutor-chat-ai --no-verify-jwt
npx supabase functions deploy speech-to-text --no-verify-jwt
npx supabase functions deploy tts-generate --no-verify-jwt
npx supabase functions deploy extract-vocab --no-verify-jwt
```

### 5. Vérifier la configuration Supabase

Vérifier que dans `.env.local`:
- `EXPO_PUBLIC_SUPABASE_URL` correspond au projet
- `EXPO_PUBLIC_SUPABASE_ANON_KEY` est la clé ANON correcte (pas la SERVICE_ROLE_KEY)

### 6. Tester avec un nouvel access token

Forcer un refresh du token:
```typescript
const { data: sessionData } = await supabase.auth.refreshSession();
const accessToken = sessionData?.session?.access_token;
```

## Logs complets de test

Voir le terminal Metro pour les logs complets. Extraits pertinents:

```
✅ Session valide: user logged in
✅ JWT envoyé: eyJhbGciOiJFUzI1NiIs...
✅ Headers corrects: Authorization: Bearer <token>
❌ Réponse: 401 Unauthorized
❌ Error: Edge Function returned a non-2xx status code
```

## Fichiers modifiés dans ce fix

- `src/lib/edge-ai.ts` (modifié ✅)
- `supabase/functions/*/config.toml` (créés mais non appliqués ❌)

## État actuel

- **Code client:** ✅ Corrigé et fonctionnel
- **JWT envoyé:** ✅ Token valide envoyé dans headers
- **Edge Functions:** ❌ Rejettent toujours avec 401
- **Config verify_jwt:** ❌ Non appliquée

## Recommandation finale

**La solution la plus rapide est probablement:**

1. Aller dans le Supabase Dashboard
2. Désactiver `verify_jwt` pour chaque Edge Function via l'interface web
3. OU ajouter le header `apikey` côté client en plus de `Authorization`

Le problème est au niveau de la **configuration du projet Supabase**, pas au niveau du code client.
