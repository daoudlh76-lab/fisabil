# Configuration du système OTP personnalisé

Ce guide explique comment configurer le système de réinitialisation de mot de passe avec codes OTP à 6 chiffres.

## Vue d'ensemble

Le système OTP personnalisé permet de :
- Générer des codes à 6 chiffres aléatoires
- Les stocker de manière sécurisée dans Supabase
- Les envoyer par email
- Valider les codes et réinitialiser le mot de passe

## Étapes d'installation

### 1. Exécuter la migration SQL

La table `otp_codes` doit être créée dans votre base de données Supabase.

**Option A : Via Supabase Dashboard**

1. Connectez-vous à votre projet Supabase
2. Allez dans **SQL Editor**
3. Cliquez sur **New Query**
4. Copiez le contenu de `supabase/migrations/create_otp_codes.sql`
5. Cliquez sur **Run**

**Option B : Via Supabase CLI**

```bash
# Si vous avez installé Supabase CLI
supabase db push

# Ou appliquer une migration spécifique
supabase migration up
```

### 2. Déployer l'Edge Function

L'Edge Function `reset-password-otp` permet de réinitialiser le mot de passe sans session active.

```bash
# Déployer la fonction
supabase functions deploy reset-password-otp

# Vérifier que la fonction est déployée
supabase functions list
```

**Variables d'environnement requises** (automatiquement disponibles dans Supabase) :
- `SUPABASE_URL` : URL de votre projet
- `SUPABASE_SERVICE_ROLE_KEY` : Clé de service (permissions admin)

Ces variables sont automatiquement injectées par Supabase dans les Edge Functions.

### 3. Configurer l'envoi d'emails (Optionnel)

Par défaut, en développement, les codes OTP s'affichent dans la console :

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔐 CODE OTP POUR user@example.com

   123456

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**Pour envoyer de vrais emails en production**, configurez Resend :

1. Créez un compte sur [resend.com](https://resend.com)
2. Générez une clé API
3. Ajoutez la clé dans `.env.local` :

```bash
EXPO_PUBLIC_RESEND_API_KEY=re_votre_cle_api_ici
```

4. Redémarrez l'application

Voir [SETUP_RESEND.md](./SETUP_RESEND.md) pour plus de détails.

## Flux de réinitialisation

```
1. Utilisateur saisit son email
   └─> forgot-password.tsx

2. Code OTP généré et stocké en DB
   └─> createOtpCode() dans otp-service.ts

3. Email envoyé (ou code affiché en console)
   └─> sendOtpEmail() dans email-service.ts

4. Utilisateur saisit le code à 6 chiffres
   └─> verify-otp.tsx

5. Code vérifié en DB
   └─> verifyOtpCode() dans otp-service.ts

6. Redirection vers reset-password
   └─> reset-password.tsx

7. Changement du mot de passe via Edge Function
   └─> Edge Function reset-password-otp
```

## Tester le système

### En développement (sans email)

1. Lancez l'application : `npx expo start`
2. Allez sur "Mot de passe oublié"
3. Saisissez un email valide d'un utilisateur existant
4. **Regardez la console** → Le code s'affiche :
   ```
   🔐 CODE OTP POUR user@example.com
      123456
   ```
5. Copiez le code
6. Entrez-le dans l'application
7. Changez le mot de passe

### Avec emails activés

Si vous avez configuré Resend, l'email sera envoyé automatiquement. Vérifiez votre boîte de réception.

## Sécurité

### Protections en place

- ✅ Codes expirés automatiquement après 10 minutes
- ✅ Codes marqués "utilisés" après validation (usage unique)
- ✅ Row Level Security (RLS) activé sur la table `otp_codes`
- ✅ Pas de stockage côté client
- ✅ Validation côté serveur uniquement
- ✅ Edge Function utilise l'API Admin pour changer le mot de passe

### Recommandations production

1. **Rate limiting** : Limitez le nombre de codes par email/heure
2. **Monitoring** : Surveillez les tentatives de codes invalides
3. **Logs** : Gardez des traces des réinitialisations de mot de passe
4. **Email service** : Utilisez un service professionnel (Resend, SendGrid)

## Dépannage

### "Table otp_codes doesn't exist"

**Cause** : La migration SQL n'a pas été exécutée.

**Solution** : Exécutez la migration dans Supabase Dashboard (SQL Editor).

### "Code invalide ou expiré"

**Causes possibles** :
- Le code a expiré (>10 minutes)
- Le code a déjà été utilisé
- Mauvaise saisie du code

**Solution** : Demandez un nouveau code avec "Renvoyer le code".

### "Erreur lors de la réinitialisation"

**Cause** : L'Edge Function n'est pas déployée.

**Solution** : Déployez la fonction avec `supabase functions deploy reset-password-otp`.

### "Email rate limit exceeded"

**Cause** : Trop d'emails envoyés (limite Supabase free tier).

**Solution** :
- Attendez 1 heure
- Configurez Resend pour contourner les limites Supabase

### Le code s'affiche dans la console mais pas d'email

**Cause** : Normal en développement sans clé Resend.

**Solution** : Configurez Resend pour envoyer de vrais emails (voir étape 3).

## Fichiers du système

| Fichier | Description |
|---------|-------------|
| `supabase/migrations/create_otp_codes.sql` | Migration SQL pour créer la table |
| `src/lib/otp-service.ts` | Génération et validation des codes |
| `src/lib/email-service.ts` | Envoi d'emails via Resend |
| `supabase/functions/reset-password-otp/index.ts` | Edge Function pour changer le mot de passe |
| `app/(auth)/forgot-password.tsx` | Interface de demande de réinitialisation |
| `app/(auth)/verify-otp.tsx` | Interface de saisie du code |
| `app/(auth)/reset-password.tsx` | Interface de saisie du nouveau mot de passe |

## Checklist avant production

- [ ] Migration SQL exécutée
- [ ] Edge Function déployée et testée
- [ ] Service d'email configuré (Resend)
- [ ] Tests de bout en bout effectués
- [ ] Rate limiting ajouté
- [ ] Monitoring configuré
- [ ] Logs de sécurité en place

## Support

Pour plus d'informations, consultez :
- [OTP_SUMMARY.md](./OTP_SUMMARY.md) - Vue d'ensemble du système
- [SETUP_RESEND.md](./SETUP_RESEND.md) - Configuration de l'envoi d'emails
- [OTP_RESET_PASSWORD.md](./OTP_RESET_PASSWORD.md) - Documentation technique complète
