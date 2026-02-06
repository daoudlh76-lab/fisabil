# Tester le système OTP avec Xcode

## Prérequis

1. ✅ Migration SQL exécutée (table `otp_codes` créée)
2. ✅ Edge Function déployée (voir [DEPLOYER_EDGE_FUNCTION.md](./DEPLOYER_EDGE_FUNCTION.md))

## Étapes de test

### 1. Lancer l'app avec Xcode

```bash
# Dans le terminal, depuis la racine du projet
npx expo run:ios
```

Ou ouvrez directement dans Xcode :
```bash
open ios/fisabil.xcworkspace
```

Puis appuyez sur **⌘ + R** pour lancer l'app sur le simulateur.

### 2. Voir les logs dans Xcode

Pour voir le code OTP qui s'affiche dans la console :

1. Dans Xcode, ouvrez le panneau **Debug Area** (en bas)
2. Ou utilisez le raccourci **⌘ + Shift + Y**
3. Les logs apparaîtront ici

### 3. Tester le flux de réinitialisation

1. **Lancez l'app** sur le simulateur iOS
2. **Cliquez sur "Mot de passe oublié"** depuis l'écran de connexion
3. **Saisissez un email** d'un utilisateur existant (par exemple celui que vous utilisez pour vous connecter)
4. **Appuyez sur "Envoyer"**

### 4. Récupérer le code OTP

Le code s'affichera dans la console Xcode :

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔐 CODE OTP POUR user@example.com

   123456

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
👆 Copiez ce code pour tester l'application

💡 Pour envoyer de vrais emails, configurez Resend:
   Voir docs/SETUP_RESEND.md
```

### 5. Entrer le code dans l'app

1. L'app vous redirige automatiquement vers l'écran de saisie du code
2. **Saisissez les 6 chiffres** affichés dans la console
3. Le code est vérifié automatiquement dès que vous entrez le 6ème chiffre

### 6. Réinitialiser le mot de passe

1. Si le code est valide, vous êtes redirigé vers l'écran de nouveau mot de passe
2. **Saisissez un nouveau mot de passe** (minimum 6 caractères)
3. **Confirmez le mot de passe**
4. **Appuyez sur "Réinitialiser"**

### 7. Connexion avec le nouveau mot de passe

1. Vous êtes redirigé vers l'écran de connexion
2. **Connectez-vous avec votre email et le nouveau mot de passe**

## Voir les logs en détail

### Console Metro Bundler

En parallèle de Xcode, vous pouvez aussi voir les logs dans le terminal Metro :

```bash
# Les logs Metro s'affichent automatiquement quand vous lancez
npx expo run:ios
```

### Console Xcode

Pour filtrer uniquement les logs de votre app :

1. Dans la console Xcode (en bas), cliquez sur le champ de recherche
2. Tapez "OTP" pour filtrer uniquement les messages OTP
3. Ou tapez "🔐" pour voir uniquement les codes

## Dépannage

### Le code ne s'affiche pas dans la console

**Solutions** :
1. Vérifiez que le panneau Debug Area est ouvert (**⌘ + Shift + Y**)
2. Vérifiez que vous avez bien sélectionné votre simulateur dans la liste des devices
3. Relancez l'app (**⌘ + R**)

### "Table otp_codes doesn't exist"

**Cause** : La migration SQL n'a pas été exécutée.

**Solution** : Allez dans Supabase Dashboard → SQL Editor et exécutez la migration.

### "Error calling Edge Function"

**Cause** : L'Edge Function n'est pas déployée.

**Solution** : Déployez la fonction (voir [DEPLOYER_EDGE_FUNCTION.md](./DEPLOYER_EDGE_FUNCTION.md)).

### "Code invalide ou expiré"

**Causes** :
- Vous avez attendu plus de 10 minutes
- Vous avez déjà utilisé ce code
- Vous avez mal saisi le code

**Solution** : Appuyez sur "Renvoyer le code" dans l'app.

### L'app crashe au changement de mot de passe

**Cause probable** : L'Edge Function retourne une erreur.

**Solution** :
1. Vérifiez les logs de l'Edge Function dans Supabase Dashboard → Edge Functions → Logs
2. Vérifiez que l'utilisateur existe bien dans Supabase Auth

## Passer en mode production (vrais emails)

Une fois les tests terminés, configurez l'envoi de vrais emails :

1. Créez un compte sur [resend.com](https://resend.com)
2. Générez une clé API
3. Ajoutez dans `.env.local` :
   ```bash
   EXPO_PUBLIC_RESEND_API_KEY=re_votre_cle_api
   ```
4. Reconstruisez l'app :
   ```bash
   npx expo run:ios
   ```

Voir [SETUP_RESEND.md](./SETUP_RESEND.md) pour plus de détails.

## Checklist de test

- [ ] Migration SQL exécutée
- [ ] Edge Function déployée
- [ ] App lancée dans Xcode
- [ ] Console visible pour voir le code
- [ ] Email valide saisi
- [ ] Code OTP visible dans la console
- [ ] Code OTP saisi dans l'app
- [ ] Code validé avec succès
- [ ] Nouveau mot de passe défini
- [ ] Connexion réussie avec nouveau mot de passe

## Vidéo du flux complet

Le flux devrait ressembler à ceci :

```
1. Écran Login
   ↓ Clic "Mot de passe oublié"
2. Écran Forgot Password
   ↓ Saisie email + clic "Envoyer"
3. Console Xcode affiche : 🔐 123456
   ↓ Redirection auto
4. Écran Verify OTP (6 champs)
   ↓ Saisie 1-2-3-4-5-6
5. Vérification auto du code
   ↓ Si valide
6. Écran Reset Password
   ↓ Saisie nouveau mot de passe
7. Écran Login
   ↓ Connexion avec nouveau mot de passe
8. ✅ Connecté
```

## Support

Si vous rencontrez des problèmes, vérifiez :
- [SETUP_OTP_SYSTEM.md](./SETUP_OTP_SYSTEM.md) - Configuration générale
- [DEPLOYER_EDGE_FUNCTION.md](./DEPLOYER_EDGE_FUNCTION.md) - Déploiement de l'Edge Function
- [OTP_SUMMARY.md](./OTP_SUMMARY.md) - Vue d'ensemble du système
