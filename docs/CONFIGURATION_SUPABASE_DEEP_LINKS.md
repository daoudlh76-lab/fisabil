# Configuration des Deep Links Supabase pour la Réinitialisation du Mot de Passe

## Problème
Le lien de réinitialisation du mot de passe dans l'email envoyé par Supabase redirige vers le site web au lieu de l'application mobile.

## Solution

### 1. Configuration dans le Dashboard Supabase

1. Aller sur https://supabase.com/dashboard/project/YOUR_PROJECT_ID/auth/url-configuration

2. Dans la section **"Redirect URLs"**, ajouter les URLs suivantes :

```
fisabil://reset-password
fisabil://*
exp://127.0.0.1:8081/--/reset-password
exp://192.168.1.*:8081/--/reset-password
```

**Explications** :
- `fisabil://reset-password` : Deep link de production pour l'app
- `fisabil://*` : Wildcard pour tous les deep links de l'app
- `exp://...` : URLs pour le développement avec Expo Go
- Ajustez l'adresse IP selon votre réseau local

3. Dans la section **"Site URL"**, vous pouvez garder votre site web actuel, mais les deep links auront la priorité pour l'app mobile.

### 2. Configuration du Template d'Email (Optionnel)

Si vous voulez personnaliser l'email de réinitialisation :

1. Aller sur https://supabase.com/dashboard/project/YOUR_PROJECT_ID/auth/templates

2. Sélectionner "Reset Password"

3. Utiliser ce template qui détecte automatiquement si l'utilisateur est sur mobile ou web :

```html
<h2>Réinitialiser votre mot de passe</h2>
<p>Bonjour,</p>
<p>Cliquez sur le lien ci-dessous pour réinitialiser votre mot de passe :</p>
<p><a href="{{ .ConfirmationURL }}">Réinitialiser mon mot de passe</a></p>
<p>Si vous n'avez pas demandé cette réinitialisation, vous pouvez ignorer cet email.</p>
<p>Ce lien expire dans 24 heures.</p>
```

Le `{{ .ConfirmationURL }}` utilisera automatiquement le `redirectTo` spécifié dans le code.

### 3. Code de l'Application

Le code a été mis à jour dans `/app/(auth)/forgot-password.tsx` :

```typescript
const { error } = await supabase.auth.resetPasswordForEmail(email, {
  redirectTo: 'fisabil://reset-password',
});
```

### 4. Gestion du Deep Link dans l'App

Le deep link `fisabil://reset-password` sera automatiquement géré par Expo Router et redirigera vers `/app/(auth)/reset-password.tsx`.

### 5. Test en Développement

Pour tester avec Expo Go :

1. Lancer l'app : `npx expo start`
2. Noter l'URL Expo (ex: `exp://192.168.1.10:8081`)
3. Ajouter cette URL dans les Redirect URLs de Supabase
4. Demander une réinitialisation de mot de passe
5. Cliquer sur le lien dans l'email

### 6. Test en Production

Une fois l'app publiée sur les stores :

1. Le deep link `fisabil://` fonctionnera automatiquement
2. Sur Android : Le système ouvrira l'app automatiquement
3. Sur iOS : Le système demandera confirmation puis ouvrira l'app

## Vérification

Pour vérifier que tout fonctionne :

1. Demander une réinitialisation de mot de passe
2. Vérifier l'email reçu
3. Le lien devrait contenir `fisabil://reset-password?token=...`
4. Cliquer sur le lien devrait ouvrir l'app (ou Expo Go en développement)
5. L'app devrait afficher la page de réinitialisation avec le formulaire

## Dépannage

### Le lien redirige toujours vers le site web

- Vérifier que `fisabil://reset-password` est bien dans les Redirect URLs de Supabase
- Vérifier que le scheme `fisabil` est bien configuré dans `app.json`
- En développement, utiliser l'URL Expo complète

### L'app ne s'ouvre pas en cliquant sur le lien

- Sur iOS : Vérifier que le scheme est bien configuré dans Info.plist (géré automatiquement par Expo)
- Sur Android : Vérifier que le package name correspond dans `app.json` et sur le store
- En développement : S'assurer qu'Expo Go est bien installé et lancé

### Le token n'est pas récupéré

- Vérifier que la page `/app/(auth)/reset-password.tsx` gère bien les paramètres de l'URL
- Utiliser `useLocalSearchParams()` de `expo-router` pour récupérer le token

## Références

- [Supabase Deep Links](https://supabase.com/docs/guides/auth/native-mobile-deep-linking)
- [Expo Deep Linking](https://docs.expo.dev/guides/deep-linking/)
- [Expo Router Navigation](https://docs.expo.dev/router/reference/authentication/)
