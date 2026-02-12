# 🧪 Guide de Test Rapide - Fisabil

**Pour vérifier que tous les fixes fonctionnent correctement**

---

## ⚡ TEST EXPRESS (5 minutes)

### 1. OCR Scanner (1 min)
```
✅ Onglet Scanner
✅ Prendre photo ou choisir galerie
✅ Cliquer "Extraire le texte"
❌ Si crash "isOcrConfigured is not a function" → OCR_FIX.md
✅ Texte doit s'afficher
```

### 2. Privacy Policy (1 min)
```
✅ Settings → Privacy Policy
✅ Page doit charger en FR/EN/AR
✅ Scroll jusqu'en bas fonctionne
✅ Dark mode fonctionne
```

### 3. About AI (30 sec)
```
✅ Settings → À propos du tuteur IA
✅ Texte explique OpenAI GPT-4, Google Vision
✅ Version app + plateforme affichées
```

### 4. Account Deletion - FLOW COMPLET (2 min)
```
⚠️ ATTENTION: Utiliser un COMPTE TEST uniquement!

✅ Settings → Supprimer mon compte
✅ Lire avertissement irréversible
✅ Cocher "Je comprends"
✅ Taper "DELETE" (exactement en majuscules)
✅ Confirmer dans dialog final
✅ Voir "Suppression en cours..." avec spinner
✅ Déconnexion automatique
✅ Redirection vers login

❌ Si erreur "Invalid JWT" → DELETE_ACCOUNT_FIX_JWT_FINAL.md
```

---

## 📋 LOGS À VÉRIFIER

### Logs Metro (Client)

**Pour OCR:**
```
✅ Ne doit PAS contenir: "isOcrConfigured is not a function"
✅ Doit contenir: "📡 Envoi de la requête à Google Vision..."
```

**Pour Account Deletion:**
```
✅ 🔄 Refreshing session before account deletion...
✅ 🔐 Session check: { hasToken: true, expiresIn: "XX minutes" }
✅ 📤 Request headers: { authPrefix: "eyJhbGci..." }
✅ 🔥 Calling delete-account via fetch: https://lluabltdmlprrwggwhlq.supabase.co/functions/v1/delete-account
✅ 📥 Response status: 200 OK
✅ ✅ Account deleted: { ok: true, message: "Account deleted successfully" }

❌ Ne doit PAS contenir: "Invalid JWT"
❌ Ne doit PAS contenir: "401"
```

### Logs Edge Function (Serveur)

```bash
npx supabase functions logs delete-account --tail
```

**Logs attendus:**
```
✅ [Delete Account] Auth header present: true
✅ [Delete Account] Auth header preview: Bearer eyJhbGci...
✅ [Delete Account] Verifying JWT token...
✅ [Delete Account] Starting deletion for user: abc123...
✅ [Delete Account] Deleted data from 10 tables
✅ [Delete Account] Successfully deleted user: abc123...

❌ Ne doit PAS contenir: "Authentication failed"
❌ Ne doit PAS contenir: "Invalid JWT"
```

---

## 🔧 TROUBLESHOOTING RAPIDE

### Problème: OCR crash "isOcrConfigured is not a function"
```bash
# Vérifier que le fix est appliqué
grep "isOcrAvailable" app/\(tabs\)/index.tsx

# Doit afficher plusieurs lignes (26, 123, 148)
# Si rien → relancer Metro / recharger app (cmd+R)
```

### Problème: Account deletion "Invalid JWT"
```bash
# Vérifier que refreshSession() est utilisé
grep "refreshSession" app/\(tabs\)/settings/delete-account.tsx

# Doit afficher ligne ~77
# Si rien → fichier pas à jour, vérifier git diff

# Redéployer Edge Function
npx supabase functions deploy delete-account

# Relancer app
npx expo start
```

### Problème: Privacy Policy ne charge pas
```bash
# Vérifier route
ls -la app/\(tabs\)/settings/privacy.tsx

# Doit exister
# Si manquant → fichier non créé, voir COMPLIANCE_SUMMARY.md
```

### Problème: "Supprimer mon compte" button invisible
```bash
# Vérifier button ajouté
grep "deleteAccount" app/\(tabs\)/settings.tsx

# Doit afficher lignes ~610-621
# Si rien → fichier pas à jour
```

---

## 🎯 CHECKLIST RAPIDE

**Avant de tester:**
- [ ] Metro server tourne (`npx expo start`)
- [ ] Edge Function déployée (`npx supabase functions deploy delete-account`)
- [ ] App rechargée (cmd+R / ctrl+R dans simulateur)

**Tests OCR:**
- [ ] Scanner fonctionne sans crash
- [ ] Texte extrait s'affiche

**Tests Privacy:**
- [ ] Privacy Policy in-app fonctionne
- [ ] About AI fonctionne
- [ ] Dark mode OK partout

**Tests Account Deletion (COMPTE TEST UNIQUEMENT):**
- [ ] Flow complet sans erreur
- [ ] Logs client OK (refresh session, 200 OK)
- [ ] Logs serveur OK (auth OK, 10 tables, user deleted)
- [ ] Déconnexion automatique
- [ ] Impossible de reconnecter avec compte supprimé

---

## 📊 SI TOUT FONCTIONNE

**Tu devrais voir:**

✅ OCR Scanner fonctionne
✅ Privacy Policy accessible
✅ About AI accessible
✅ Account deletion fonctionne end-to-end
✅ Logs client propres (pas d'erreur 401)
✅ Logs serveur propres (pas "Invalid JWT")
✅ Dark mode partout
✅ Traductions FR/EN/AR

**Prochaine étape:**
→ Voir `COMPLIANCE_SUMMARY.md` pour soumission stores (déployer Privacy Policy, screenshots, build, submit)

---

## 🚨 SI PROBLÈME PERSISTE

1. **Lire le document de fix correspondant:**
   - OCR → `OCR_FIX.md`
   - 401 → `DELETE_ACCOUNT_FIX_401.md`
   - Invalid JWT → `DELETE_ACCOUNT_FIX_JWT_FINAL.md`

2. **Vérifier git status:**
   ```bash
   git status
   git diff app/\(tabs\)/index.tsx
   git diff app/\(tabs\)/settings/delete-account.tsx
   ```

3. **Hard reload app:**
   ```bash
   # Arrêter Metro (ctrl+C)
   # Clear cache
   npx expo start --clear
   # Reload app (cmd+R dans simulateur)
   ```

4. **Redéployer Edge Function:**
   ```bash
   npx supabase functions deploy delete-account
   ```

5. **Vérifier logs en détail:**
   ```bash
   # Client (Metro console)
   # Chercher 🔐, 📤, 📥, ❌

   # Serveur
   npx supabase functions logs delete-account --tail
   ```

---

**Temps total:** ~5 minutes pour test express, ~10 minutes pour test complet avec logs

**Document parent:** `FIXES_SUMMARY_2026-02-09.md`
