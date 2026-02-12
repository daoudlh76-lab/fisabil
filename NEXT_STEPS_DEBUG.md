# 🔧 Prochaines étapes - Debug Invalid JWT

**Date:** 9 février 2026
**Status:** Code modifié ✅, mais app doit être rechargée

---

## ✅ CE QUI A ÉTÉ FAIT

### 1. Code modifié avec `refreshSession()`

**Fichier:** `app/(tabs)/settings/delete-account.tsx`

**Ligne 79:** Ajout de `refreshSession()` pour obtenir un token valide
```typescript
const { data: refreshData, error: refreshError } =
  await supabase.auth.refreshSession();
```

**Vérification:**
```bash
grep "refreshSession" app/\(tabs\)/settings/delete-account.tsx
# Output: 79:        await supabase.auth.refreshSession();
# ✅ Code bien présent
```

### 2. Edge Function redéployée

```bash
npx supabase functions deploy delete-account
# ✅ Deployed Functions on project lluabltdmlprrwggwhlq: delete-account
```

---

## ❌ PROBLÈME ACTUEL

**Logs observés (dernière tentative):**
```
📥 Response status: 401
❌ delete-account failed: Invalid JWT
❌ Account deletion error: [Error: Delete account failed: Invalid JWT]
```

**Cause:**
L'app mobile qui tourne utilise encore l'**ancien code** (sans `refreshSession()`).
Les modifications ne sont pas encore prises en compte par Metro.

---

## 🔧 SOLUTION: RECHARGER L'APP

### Option 1: Reload dans le simulateur (RAPIDE - 5 sec)

**iOS:**
```
cmd + R  (dans le simulateur iOS)
```

**Android:**
```
Double-tap R  (dans l'app Android)
OU
ctrl + M → Reload
```

### Option 2: Redémarrer Metro avec clear cache (COMPLET - 1 min)

```bash
# Arrêter Metro server (ctrl+C dans le terminal Metro)

# Nettoyer cache et redémarrer
npx expo start --clear

# Attendre que l'app se recharge automatiquement
```

---

## 🧪 APRÈS RECHARGEMENT

### Logs attendus (SUCCÈS):

**Avant l'appel (nouveaux logs):**
```
🔄 Refreshing session before account deletion...
🔐 Session check: {
  hasSession: true,
  hasToken: true,
  tokenLength: 312,
  userId: "abc123-...",
  expiresAt: 1707515633,
  expiresIn: "59 minutes"  ⬅️ Token frais!
}
```

**Pendant l'appel:**
```
📤 Request headers: {
  authPrefix: "eyJhbGciOiJIUzI1NiIs...",
  apikeyPrefix: "eyJhbGciOiJIUzI1NiIs..."
}
🔥 Calling delete-account via fetch: https://lluabltdmlprrwggwhlq.supabase.co/functions/v1/delete-account
```

**Réponse (SUCCÈS):**
```
📥 Response status: 200 OK  ⬅️ Plus de 401!
✅ Account deleted: { ok: true, message: "Account deleted successfully" }
```

**Edge Function logs (serveur):**
```bash
npx supabase functions logs delete-account --tail
```

Logs attendus:
```
[Delete Account] Auth header present: true
[Delete Account] Auth header preview: Bearer eyJhbGci...
[Delete Account] Verifying JWT token...
[Delete Account] Starting deletion for user: abc123...
[Delete Account] Deleted data from 10 tables
[Delete Account] Successfully deleted user: abc123...
```

---

## ⚠️ SI L'ERREUR PERSISTE APRÈS RELOAD

### Diagnostic approfondi:

**1. Vérifier que les nouveaux logs apparaissent**

Si après reload tu vois:
```
🔄 Refreshing session before account deletion...
🔐 Session check: { ... }
```

✅ Le code est bien rechargé.

Si tu NE vois PAS ces logs:
❌ Le code n'est pas rechargé → essayer Option 2 (clear cache)

---

**2. Vérifier expiration du token**

Si les logs montrent:
```
🔐 Session check: {
  expiresIn: "-12 minutes"  ⬅️ NÉGATIF = expiré!
}
```

**Solution:** Se déconnecter puis reconnecter avant de tester la suppression.

---

**3. Vérifier que refreshSession() a réussi**

Si les logs montrent:
```
❌ Session refresh failed: [Error: ...]
```

**Causes possibles:**
- Utilisateur non connecté
- Session corrompue
- Problème réseau

**Solution:** Se déconnecter puis reconnecter.

---

**4. Vérifier les variables d'environnement**

```bash
grep SUPABASE_URL .env
grep SUPABASE_ANON_KEY .env

# Ou dans app.json
grep SUPABASE app.json
```

Vérifier que les URLs/keys sont correctes:
- `SUPABASE_URL`: https://lluabltdmlprrwggwhlq.supabase.co
- `SUPABASE_ANON_KEY`: eyJhbGci... (long JWT)

---

## 🎯 PLAN D'ACTION

### Étape 1: Recharger l'app (30 sec)
```bash
# Dans le simulateur iOS
cmd + R

# OU redémarrer Metro
npx expo start --clear
```

### Étape 2: Se connecter avec un compte test
```
Email: test-deletion@example.com
Password: TestDelete123!
```

### Étape 3: Tester suppression immédiatement après login
```
Settings → Supprimer mon compte
→ Flow complet
```

**Pourquoi immédiatement après login?**
Le token vient d'être créé, il est **garanti valide** pour 1h.

### Étape 4: Vérifier les logs Metro

**Si tu vois:**
```
🔄 Refreshing session before account deletion...
🔐 Session check: { expiresIn: "59 minutes" }
📥 Response status: 200 OK
✅ Account deleted: { ok: true }
```

✅ **SUCCÈS** - Le fix fonctionne!

**Si tu vois encore:**
```
📥 Response status: 401
❌ delete-account failed: Invalid JWT
```

❌ Problème plus profond → voir diagnostics ci-dessus.

---

## 📊 CHECKLIST

Avant de tester:
- [ ] Code modifié vérifié (`grep refreshSession`)
- [ ] Edge Function déployée (`npx supabase functions deploy delete-account`)
- [ ] App rechargée (cmd+R OU `npx expo start --clear`)
- [ ] Logs Metro visibles (terminal Metro ouvert)

Pendant le test:
- [ ] Connecté avec compte test frais
- [ ] Aller dans Settings → Supprimer mon compte
- [ ] Observer les logs Metro en temps réel

Logs à chercher (SUCCÈS):
- [ ] `🔄 Refreshing session before account deletion...`
- [ ] `🔐 Session check: { expiresIn: "XX minutes" }`
- [ ] `📥 Response status: 200 OK`
- [ ] `✅ Account deleted: { ok: true }`

Logs à chercher (ÉCHEC):
- [ ] `❌ Session refresh failed: ...`
- [ ] `📥 Response status: 401`
- [ ] `❌ delete-account failed: Invalid JWT`

---

## 🚨 SI TU VEUX TESTER MAINTENANT

### Commandes rapides:

```bash
# 1. Recharger l'app dans le simulateur
# (cmd+R dans le simulateur iOS)

# 2. Observer les logs en temps réel
# (regarder le terminal Metro)

# 3. Tester la suppression avec compte test
# Settings → Supprimer mon compte

# 4. Si ça marche, vérifier logs Edge Function
npx supabase functions logs delete-account --tail
```

---

## ✅ RÉSUMÉ

**Code prêt:** ✅ OUI
**Edge Function déployée:** ✅ OUI
**Prochaine action:** 🔄 **RECHARGER L'APP** (cmd+R)

Après rechargement, le fix `refreshSession()` devrait résoudre le problème "Invalid JWT".

**Document parent:** `DELETE_ACCOUNT_FIX_JWT_FINAL.md`
