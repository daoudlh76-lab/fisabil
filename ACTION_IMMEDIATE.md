# ⚡ ACTION IMMÉDIATE - Fix Invalid JWT

**Tu vois encore l'erreur "Invalid JWT" car l'app n'a pas rechargé le nouveau code.**

---

## 🎯 FAIS CECI MAINTENANT (30 secondes)

### Option 1: Reload dans le simulateur

**Si simulateur iOS est ouvert:**
```
Appuie sur: cmd + R
```

**Si émulateur Android:**
```
Double-tap R dans l'app
```

### Option 2: Clear cache Metro (si Option 1 ne marche pas)

```bash
# Arrêter Metro (ctrl+C)
npx expo start --clear
```

---

## ✅ APRÈS RELOAD

**Teste à nouveau la suppression de compte.**

Tu DOIS maintenant voir ces nouveaux logs:
```
🔄 Refreshing session before account deletion...
🔐 Session check: { hasToken: true, expiresIn: "59 minutes" }
📤 Request headers: { authPrefix: "eyJhbGci..." }
🔥 Calling delete-account via fetch: ...
📥 Response status: 200 OK  ⬅️ PLUS D'ERREUR 401!
✅ Account deleted: { ok: true }
```

**Si tu NE vois PAS ces logs:**
→ L'app n'a pas rechargé → Essayer Option 2 (clear cache)

**Si tu VOIS ces logs ET que ça marche:**
→ ✅ **PROBLÈME RÉSOLU!**

---

## 📋 SI TU VEUX VÉRIFIER QUE TOUT EST PRÊT

```bash
# Vérifier que le code est bien modifié
grep "refreshSession" app/\(tabs\)/settings/delete-account.tsx
# Doit afficher: 79:        await supabase.auth.refreshSession();

# Vérifier Edge Function déployée
npx supabase functions list | grep delete-account
# Doit afficher: delete-account | ACTIVE
```

---

## 🎯 RÉSUMÉ

**Problème:** Code modifié mais app pas rechargée
**Solution:** cmd+R dans le simulateur (ou `npx expo start --clear`)
**Temps:** 30 secondes
**Après:** Tester suppression → devrait fonctionner ✅

---

**Plus de détails:** Voir `NEXT_STEPS_DEBUG.md`
