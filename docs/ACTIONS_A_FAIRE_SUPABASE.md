# Actions à Faire sur Supabase Dashboard

## 🔴 URGENT : Configuration des Deep Links pour Réinitialisation du Mot de Passe

### Étape 1 : Ajouter les Redirect URLs

1. Aller sur : https://supabase.com/dashboard/project/YOUR_PROJECT_ID/auth/url-configuration

2. Dans la section **"Redirect URLs"**, ajouter ces URLs (une par ligne) :

```
fisabil://reset-password
fisabil://*
```

3. **Pour le développement** (optionnel), ajouter aussi :
```
exp://127.0.0.1:8081/--/reset-password
exp://192.168.1.*:8081/--/reset-password
```
(Ajuster l'IP selon votre réseau local)

4. Cliquer sur **"Save"**

### Étape 2 : Appliquer la Migration SQL pour la Progression des Cartes

1. Aller sur : https://supabase.com/dashboard/project/YOUR_PROJECT_ID/sql/new

2. Copier-coller le contenu du fichier :
   `supabase/migrations/20260203_fix_vocab_progress_structure.sql`

3. Cliquer sur **"Run"**

Cette migration va :
- Créer une nouvelle table `vocab_cards_progress` avec la bonne structure
- Utiliser `scan_id` + `word_ar` au lieu d'un UUID artificiel
- Configurer les permissions RLS correctement

### Étape 3 : Vérifier les Templates d'Email (Optionnel)

1. Aller sur : https://supabase.com/dashboard/project/YOUR_PROJECT_ID/auth/templates

2. Sélectionner "Reset Password"

3. Vérifier que le template contient `{{ .ConfirmationURL }}`

Le template par défaut devrait fonctionner correctement.

## 🟢 Vérification

### Test de Réinitialisation du Mot de Passe

1. Dans l'app, cliquer sur "Mot de passe oublié"
2. Entrer votre email
3. Vérifier votre boîte mail
4. Le lien devrait maintenant être : `fisabil://reset-password?token=...`
5. Cliquer sur le lien devrait ouvrir l'app (ou Expo Go en dev)
6. Remplir le formulaire de réinitialisation
7. Le mot de passe devrait être changé avec succès

### Test de Sauvegarde de Progression des Cartes

1. Aller dans l'onglet "Révision"
2. Marquer une carte comme "Facile", "Moyen" ou "Difficile"
3. Vérifier dans la console qu'il n'y a plus d'erreur UUID
4. La progression devrait être sauvegardée correctement

## 📋 Résumé des Changements dans le Code

### Fichiers Modifiés

1. **app/(auth)/forgot-password.tsx**
   - Ajout du `redirectTo: 'fisabil://reset-password'`

2. **hooks/use-vocab-cards.ts**
   - Ajout du champ `scanId` à l'interface VocabCard
   - Modification de la sauvegarde pour utiliser `scan_id` + `word_ar`

3. **app/(tabs)/revision/index.tsx**
   - Ajout du `scanId` lors de la création des cartes

### Nouveaux Fichiers

1. **supabase/migrations/20260203_fix_vocab_progress_structure.sql**
   - Migration SQL pour la nouvelle structure de la table

2. **docs/CONFIGURATION_SUPABASE_DEEP_LINKS.md**
   - Documentation complète sur la configuration des deep links

3. **docs/ACTIONS_A_FAIRE_SUPABASE.md**
   - Ce fichier (checklist des actions)

## ⚠️ Important

- **Les deep links ne fonctionneront qu'après avoir ajouté les URLs dans Supabase Dashboard**
- En développement avec Expo Go, utilisez les URLs `exp://`
- En production, le deep link `fisabil://` fonctionnera automatiquement

## 🔧 Dépannage

Si le lien redirige toujours vers le site web :
1. Vérifier que les URLs sont bien enregistrées dans Supabase
2. Attendre 1-2 minutes après la sauvegarde (propagation)
3. Vider le cache de l'email et redemander un nouveau lien
4. En dernier recours, redémarrer l'app

## 📞 Support

Pour plus d'informations :
- [Documentation Supabase Deep Links](https://supabase.com/docs/guides/auth/native-mobile-deep-linking)
- [Documentation Expo Deep Linking](https://docs.expo.dev/guides/deep-linking/)
