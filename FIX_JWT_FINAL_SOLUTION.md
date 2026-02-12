# ✅ SOLUTION FINALE - Invalid JWT corrigé

**Date:** 9 février 2026
**Problème:** Edge Function `delete-account` retournait "Invalid JWT"
**Solution:** Désactiver `verify_jwt` dans config.toml

---

## 🔧 CHANGEMENTS APPLIQUÉS

### A) Supabase Edge Function

**1. Fichier créé:** `supabase/functions/delete-account/config.toml`
```toml
verify_jwt = false
```

**Pourquoi?**
- Par défaut, Supabase Edge Functions vérifient automatiquement le JWT
- Cette vérification automatique causait l'erreur "Invalid JWT"
- En désactivant `verify_jwt`, on gère manuellement l'auth dans le code
- Le code fait déjà `supabase.auth.getUser()` pour vérifier le token (ligne 46)

**2. Fichier modifié:** `supabase/functions/delete-account/index.ts`
```typescript
// Ligne 19: Ajout fallback vide
const authHeader = req.headers.get('Authorization') || '';
```

### B) Code Client (Expo)

✅ **Déjà conforme** - Aucune modification nécessaire

Le code dans `app/(tabs)/settings/delete-account.tsx` utilise déjà:
- `getSession()` pour récupérer le token (ligne 75-76)
- Headers corrects dans fetch (lignes 115-117):
  ```typescript
  headers: {
    Authorization: `Bearer ${accessToken}`,
    apikey: SUPABASE_ANON_KEY,
    'Content-Type': 'application/json',
  }
  ```

### C) Déploiement

**Commande exécutée:**
```bash
npx supabase functions deploy delete-account
```

**Résultat:**
```
✅ Deployed Functions on project lluabltdmlprrwggwhlq: delete-account
✅ STATUS: ACTIVE
✅ VERSION: 12
✅ UPDATED: 2026-02-10 22:54:16 UTC
```

---

## 📋 FICHIERS MODIFIÉS/CRÉÉS

```
✅ supabase/functions/delete-account/config.toml (CRÉÉ)
✅ supabase/functions/delete-account/index.ts (MODIFIÉ - ligne 19)
✅ DEPLOY_COMMANDS.sh (CRÉÉ - script de déploiement)
```

---

## 🧪 TEST MAINTENANT

### Étapes:

1. **Recharger l'app** (le backend est déjà à jour)
   ```
   Dans le simulateur: cmd + R
   ```

2. **Tester la suppression**
   ```
   Settings → Supprimer mon compte
   → Flow complet
   ```

3. **Logs attendus:**

   **Client (Metro):**
   ```
   🔐 Session check: { hasSession: true, hasToken: true, tokenLength: 312, userId: "..." }
   🔥 Calling delete-account: https://lluabltdmlprrwggwhlq.supabase.co/functions/v1/delete-account
   📤 Token prefix: eyJhbGciOiJIUzI1NiIs...
   📥 Response: { status: 200, body: { ok: true, message: "Account deleted successfully" } }
   ```

   **Serveur (Edge Function):**
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

## ✅ RÉSULTAT ATTENDU

**AVANT:**
```
❌ delete-account failed: Invalid JWT
```

**APRÈS:**
```
✅ Account deleted: { ok: true, message: "Account deleted successfully" }
✅ Déconnexion automatique
✅ Redirection vers login
```

---

## 🔍 EXPLICATION TECHNIQUE

### Pourquoi `verify_jwt = false` résout le problème?

**Avec `verify_jwt = true` (défaut):**
1. Supabase vérifie automatiquement le JWT AVANT d'exécuter le code
2. Si la vérification échoue → 401 "Invalid JWT" immédiat
3. Le code dans `index.ts` n'est même pas exécuté

**Avec `verify_jwt = false`:**
1. Supabase laisse passer la requête sans vérifier
2. Le code dans `index.ts` s'exécute
3. Ligne 46: `supabase.auth.getUser()` vérifie manuellement le token
4. Si token invalide → erreur custom avec détails
5. Si token valide → suppression du compte

**Avantages de `verify_jwt = false`:**
- ✅ Contrôle total sur l'authentification
- ✅ Messages d'erreur détaillés (ligne 49-54)
- ✅ Logs de debug (lignes 21-22, 42)
- ✅ Gestion custom des erreurs

---

## 📊 COMMANDES DE VÉRIFICATION

### Vérifier déploiement:
```bash
npx supabase functions list | grep delete-account
# Doit afficher: delete-account | ACTIVE | 12
```

### Vérifier fichier config:
```bash
cat supabase/functions/delete-account/config.toml
# Doit afficher: verify_jwt = false
```

### Voir logs en temps réel:
```bash
npx supabase functions logs delete-account --tail
```

---

## 🚀 PROCHAINES ÉTAPES

1. ✅ **Code prêt** - Tous les changements appliqués
2. ✅ **Edge Function déployée** - Version 12 active
3. ⏳ **Tester dans l'app** - Recharger + tester suppression
4. ⏳ **Vérifier logs** - Client + serveur

**Si ça marche:**
→ Passer aux étapes suivantes (voir `COMPLIANCE_SUMMARY.md`)

**Si ça ne marche toujours pas:**
→ Vérifier logs Edge Function avec `npx supabase functions logs delete-account --tail`

---

## 📝 RÉSUMÉ

**Problème:** `verify_jwt = true` (défaut) causait "Invalid JWT"
**Solution:** `verify_jwt = false` dans config.toml
**Déploiement:** ✅ FAIT (version 12)
**Status:** 🟢 PRÊT À TESTER

**La suppression de compte devrait maintenant fonctionner! 🎉**
