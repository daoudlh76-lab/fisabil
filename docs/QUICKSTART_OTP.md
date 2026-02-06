# 🚀 Quickstart : Système OTP en 3 étapes

Ce guide vous permet de tester le système OTP avec codes à 6 chiffres en quelques minutes.

## ✅ Étape 1 : Exécuter la migration SQL (2 minutes)

1. Ouvrez [dashboard.supabase.com](https://dashboard.supabase.com)
2. Sélectionnez votre projet **fisabil**
3. Dans le menu de gauche, cliquez sur **SQL Editor**
4. Cliquez sur **+ New Query**
5. Copiez-collez le contenu de [supabase/migrations/create_otp_codes_safe.sql](../supabase/migrations/create_otp_codes_safe.sql)
6. Cliquez sur **Run** (ou appuyez sur ⌘ + Enter)

✅ Vous devriez voir : "Table otp_codes créée avec succès ✅"

**Note** : Cette version "safe" supprime et recrée proprement la table si elle existe déjà.

## ✅ Étape 2 : Déployer l'Edge Function (3 minutes)

### Option A : Via Dashboard (plus simple)

1. Dans Supabase Dashboard, cliquez sur **Edge Functions** (menu de gauche)
2. Cliquez sur **Create a new function**
3. Nom : `reset-password-otp`
4. Copiez le contenu de [supabase/functions/reset-password-otp/index.ts](../supabase/functions/reset-password-otp/index.ts)
5. Collez dans l'éditeur
6. Cliquez sur **Deploy function**

### Option B : Via CLI (si vous avez Supabase CLI)

```bash
# Installer Supabase CLI (si pas déjà fait)
brew install supabase/tap/supabase

# Se connecter
supabase login

# Lier le projet (remplacez PROJECT_ID par votre ID)
supabase link --project-ref PROJECT_ID

# Déployer
supabase functions deploy reset-password-otp
```

## ✅ Étape 3 : Tester avec Xcode (5 minutes)

### Lancer l'app

```bash
cd /Users/daoudlh/fisabil
npx expo run:ios
```

Ou ouvrez dans Xcode :
```bash
open ios/fisabil.xcworkspace
```

### Tester le flux

1. **Ouvrez la console Xcode** (⌘ + Shift + Y)
2. **Lancez l'app** (⌘ + R)
3. Sur l'écran de login, cliquez **"Mot de passe oublié"**
4. Saisissez votre email et cliquez **"Envoyer"**
5. **Regardez la console Xcode**, vous verrez :

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔐 CODE OTP POUR votre@email.com

   123456

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

6. **Entrez ce code** dans l'app (les 6 chiffres)
7. **Définissez un nouveau mot de passe**
8. **Connectez-vous** avec le nouveau mot de passe

🎉 **Ça marche !** Vous avez maintenant des codes à 6 chiffres au lieu de magic links.

## 📧 (Optionnel) Envoyer de vrais emails

Pour envoyer de vrais emails au lieu d'afficher le code dans la console :

1. Créez un compte sur [resend.com](https://resend.com) (gratuit)
2. Générez une clé API
3. Ajoutez dans `.env.local` :
   ```bash
   EXPO_PUBLIC_RESEND_API_KEY=re_votre_cle
   ```
4. Redémarrez l'app

Voir [SETUP_RESEND.md](./SETUP_RESEND.md) pour plus de détails.

## 🐛 Problèmes courants

### "Table otp_codes doesn't exist"
→ Vous avez sauté l'étape 1. Exécutez la migration SQL.

### "Function not found"
→ Vous avez sauté l'étape 2. Déployez l'Edge Function.

### Le code ne s'affiche pas dans la console
→ Vérifiez que la console Xcode est ouverte (⌘ + Shift + Y).

### "Code invalide ou expiré"
→ Le code expire après 10 minutes. Cliquez "Renvoyer le code".

## 📚 Documentation complète

- [SETUP_OTP_SYSTEM.md](./SETUP_OTP_SYSTEM.md) - Guide complet
- [TESTER_OTP_XCODE.md](./TESTER_OTP_XCODE.md) - Tests détaillés avec Xcode
- [DEPLOYER_EDGE_FUNCTION.md](./DEPLOYER_EDGE_FUNCTION.md) - Déploiement de la fonction
- [OTP_SUMMARY.md](./OTP_SUMMARY.md) - Vue d'ensemble du système

## 🎯 Récapitulatif

| Étape | Durée | État |
|-------|-------|------|
| 1. Migration SQL | 2 min | ⬜ |
| 2. Edge Function | 3 min | ⬜ |
| 3. Test Xcode | 5 min | ⬜ |

**Total : 10 minutes** pour avoir un système OTP fonctionnel ! 🚀
