# Système OTP personnalisé pour la réinitialisation de mot de passe

## 🎯 Objectif

Envoyer un **code à 6 chiffres** par email au lieu d'un magic link lors de la réinitialisation du mot de passe.

## ❌ Pourquoi Supabase Auth ne suffit pas

`supabase.auth.signInWithOtp()` envoie par défaut un **magic link** (lien cliquable), pas un code à 6 chiffres visible.

Il n'existe pas de configuration simple dans le Dashboard Supabase pour forcer l'envoi d'un code numérique à la place du lien.

## ✅ Solution implémentée : Système OTP personnalisé

### Architecture

```
1. forgot-password.tsx
   └─> Génère code 6 chiffres (otp-service.ts)
   └─> Stocke dans table otp_codes (Supabase)
   └─> Envoie email avec code (email-service.ts)
   └─> Redirige vers verify-otp.tsx

2. verify-otp.tsx
   └─> Vérifie code dans table otp_codes
   └─> Marque code comme utilisé
   └─> Redirige vers reset-password.tsx avec email + verified=true

3. reset-password.tsx
   └─> Crée session temporaire avec email
   └─> Change le mot de passe via updateUser()
   └─> Redirige vers login
```

### Fichiers créés

#### 1. Table Supabase : `/supabase/migrations/create_otp_codes.sql`

Stocke les codes OTP temporaires :
- `email` : Email de l'utilisateur
- `code` : Code à 6 chiffres
- `expires_at` : Expiration (10 minutes)
- `used` : Marqueur d'utilisation

**⚠️ À exécuter dans le SQL Editor de Supabase Dashboard**

#### 2. Service OTP : `/src/lib/otp-service.ts`

Gère la génération et validation des codes :
- `createOtpCode(email)` : Génère et stocke un code
- `verifyOtpCode(email, code)` : Vérifie et marque comme utilisé
- `cleanupExpiredOtpCodes()` : Nettoie les codes expirés

#### 3. Service Email : `/src/lib/email-service.ts`

Envoie les emails avec les codes :
- `sendOtpEmail(email, code)` : Envoie le code par email

**⚠️ IMPORTANT** : Ce fichier contient une implémentation temporaire qui log le code dans la console. En production, remplacez par SendGrid, Resend, AWS SES, ou Mailgun.

### Fichiers modifiés

#### 1. `/app/(auth)/forgot-password.tsx`

**Changements** :
- Import de `createOtpCode` et `sendOtpEmail`
- Vérifie que l'utilisateur existe dans `profiles`
- Génère un code OTP personnalisé
- Envoie l'email avec le code
- Redirige vers `verify-otp`

#### 2. `/app/(auth)/verify-otp.tsx`

**Changements** :
- Import de `verifyOtpCode` et `createOtpCode`
- Vérifie le code via `verifyOtpCode()` au lieu de `supabase.auth.verifyOtp()`
- Redirige vers `reset-password` avec `email` et `verified=true`
- Fonction `resendCode()` utilise `createOtpCode()`

#### 3. `/app/(auth)/reset-password.tsx`

**Changements** :
- Import de `useLocalSearchParams` pour lire `email` et `verified`
- Vérifie si on vient du flux OTP (`verified=true`) ou magic link (session)
- Si flux OTP : crée session temporaire avant de changer le mot de passe
- Change le mot de passe via `updateUser()`

## 🚀 Étapes de déploiement

### 1. Créer la table `otp_codes`

Dans le **SQL Editor** de Supabase Dashboard :

```sql
-- Copier tout le contenu de supabase/migrations/create_otp_codes.sql
-- et l'exécuter
```

### 2. Configurer le service d'email

**Option A** : Pour le développement

Le code actuel log le code dans la console. Vous verrez :
```
[EMAIL SERVICE] Code OTP pour user@example.com: 123456
```

**Option B** : Pour la production (Resend recommandé)

1. Créez un compte sur [resend.com](https://resend.com)
2. Obtenez une API key
3. Ajoutez dans `.env` :
```bash
RESEND_API_KEY=re_xxxxxxxxxxxxx
```

4. Modifiez `/src/lib/email-service.ts` :

```typescript
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendOtpEmail(email: string, code: string) {
  try {
    await resend.emails.send({
      from: 'Fisabil <noreply@yourdomain.com>',
      to: email,
      subject: 'Votre code de vérification Fisabil',
      html: `
        <h1>Code de vérification</h1>
        <p>Votre code de vérification est :</p>
        <h2 style="font-size: 32px; letter-spacing: 8px;">${code}</h2>
        <p>Ce code expire dans 10 minutes.</p>
      `,
    });
    return { success: true, error: null };
  } catch (e: any) {
    return { success: false, error: e };
  }
}
```

### 3. Installer les dépendances (si Resend)

```bash
npm install resend
```

## 🧪 Test du flux

1. **Lancer l'app** : `npx expo start`
2. **Aller sur "Mot de passe oublié"**
3. **Saisir email** → Code généré (visible dans console si dev)
4. **Saisir code 6 chiffres** → Validation
5. **Nouveau mot de passe** → Changement effectué
6. **Login avec nouveau mot de passe** → ✅ Succès

## 📊 Nettoyage automatique

Les codes expirent automatiquement après 10 minutes. Pour nettoyer manuellement :

```sql
SELECT delete_expired_otp_codes();
```

Vous pouvez créer un cron job dans Supabase (Database > Cron Jobs) :

```sql
SELECT cron.schedule(
  'cleanup-expired-otp',
  '*/30 * * * *', -- Toutes les 30 minutes
  $$SELECT delete_expired_otp_codes()$$
);
```

## 🔒 Sécurité

- Codes expirés après 10 minutes
- Marqués comme utilisés après validation
- RLS activé sur la table `otp_codes`
- Validation côté serveur (Supabase)
- Pas de stockage en localStorage (seulement en DB)

## 📝 TODO pour la production

- [ ] Configurer un service d'email réel (Resend/SendGrid)
- [ ] Ajouter rate limiting (max 3 codes/heure par email)
- [ ] Logger les tentatives de validation échouées
- [ ] Ajouter monitoring/alertes sur les erreurs d'envoi
- [ ] Tester avec différents providers email (Gmail, Outlook, etc.)
- [ ] Ajouter des templates email multilingues
