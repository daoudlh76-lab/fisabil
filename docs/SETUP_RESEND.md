# Configuration Resend pour l'envoi d'emails OTP

## Pourquoi Resend ?

- **Gratuit** : 100 emails/jour gratuits (3000/mois)
- **Simple** : Une seule API
- **Rapide** : 5 minutes de setup
- **Fiable** : Utilisé par Vercel, Linear, etc.

## Étapes

### 1. Créer un compte Resend

1. Allez sur [resend.com](https://resend.com)
2. Cliquez sur "Sign Up"
3. Utilisez votre email GitHub ou Google

### 2. Obtenir une API Key

1. Une fois connecté, allez dans **API Keys**
2. Cliquez sur **"Create API Key"**
3. Nom : `Fisabil OTP`
4. Permission : **"Sending access"**
5. Cliquez sur **"Create"**
6. **Copiez la clé** (elle commence par `re_...`)

### 3. Ajouter la clé dans votre projet

#### Option A : Variables d'environnement locales

Créez/modifiez `.env.local` :

```bash
EXPO_PUBLIC_RESEND_API_KEY=re_votre_cle_ici
```

#### Option B : EAS Secrets (pour les builds)

```bash
eas secret:create --scope project --name EXPO_PUBLIC_RESEND_API_KEY --value re_votre_cle_ici
```

### 4. Configurer le domaine d'envoi

#### Option A : Utiliser le domaine Resend (pour tests)

Par défaut, Resend vous donne `onboarding@resend.dev`. Aucune configuration nécessaire !

Modifiez [src/lib/email-service.ts](../src/lib/email-service.ts) :

```typescript
from: 'Fisabil <onboarding@resend.dev>',
```

#### Option B : Utiliser votre propre domaine (production)

1. Dans Resend Dashboard, allez dans **Domains**
2. Cliquez **"Add Domain"**
3. Entrez votre domaine : `fisabil.app`
4. Copiez les enregistrements DNS (SPF, DKIM, etc.)
5. Ajoutez-les dans votre registrar de domaine (Cloudflare, GoDaddy, etc.)
6. Attendez la vérification (quelques minutes à quelques heures)

Une fois vérifié, modifiez [src/lib/email-service.ts](../src/lib/email-service.ts) :

```typescript
from: 'Fisabil <noreply@fisabil.app>',
```

### 5. Modifier le code pour utiliser Resend directement

Remplacez le contenu de [src/lib/email-service.ts](../src/lib/email-service.ts) :

```typescript
/**
 * Envoie un email avec un code OTP via Resend
 */
export async function sendOtpEmail(email: string, code: string): Promise<{ success: boolean; error: Error | null }> {
  try {
    // @ts-ignore - EXPO_PUBLIC_ vars are available at runtime
    const RESEND_API_KEY = process.env.EXPO_PUBLIC_RESEND_API_KEY;

    if (!RESEND_API_KEY) {
      // Pas de clé Resend : afficher dans la console pour le dev
      console.log(`\n🔐 CODE OTP POUR ${email}: ${code}\n`);
      console.log('👆 Configurez EXPO_PUBLIC_RESEND_API_KEY pour envoyer de vrais emails\n');
      return { success: true, error: null };
    }

    // Envoyer l'email via Resend
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: 'Fisabil <onboarding@resend.dev>', // Changez si vous avez votre domaine
        to: [email],
        subject: 'Votre code de vérification Fisabil',
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
          </head>
          <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0;">
            <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
              <div style="text-align: center; padding: 20px 0;">
                <h1 style="color: #2F6B3D; margin: 0;">🕌 Fisabil</h1>
              </div>
              <p>Salam alaykoum,</p>
              <p>Vous avez demandé à réinitialiser votre mot de passe. Voici votre code de vérification :</p>
              <div style="background: #f4f4f4; border: 2px solid #2F6B3D; border-radius: 8px; padding: 20px; text-align: center; margin: 20px 0;">
                <div style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #2F6B3D; font-family: 'Courier New', monospace;">
                  ${code}
                </div>
              </div>
              <p><strong style="color: #d32f2f;">Ce code expire dans 10 minutes.</strong></p>
              <p>Si vous n'avez pas demandé cette réinitialisation, ignorez cet email.</p>
              <div style="text-align: center; font-size: 12px; color: #666; margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee;">
                <p style="margin: 0;">© 2024 Fisabil - Application d'apprentissage de l'arabe</p>
              </div>
            </div>
          </body>
          </html>
        `,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Resend API error: ${JSON.stringify(errorData)}`);
    }

    const result = await response.json();
    console.log('[EMAIL SERVICE] Email envoyé avec succès:', result.id);
    return { success: true, error: null };

  } catch (e: any) {
    console.error('[EMAIL SERVICE] Erreur:', e.message);
    // Fallback : afficher dans la console
    console.log(`\n🔐 CODE OTP POUR ${email}: ${code}\n`);
    return { success: false, error: e };
  }
}
```

### 6. Tester

#### En local (sans clé Resend)

1. `npx expo start`
2. Testez le flux "mot de passe oublié"
3. Le code s'affiche dans la console Metro/Terminal
4. Copiez-le et entrez-le dans l'app

#### Avec Resend configuré

1. Ajoutez votre clé dans `.env.local`
2. Redémarrez l'app : `npx expo start --clear`
3. Testez le flux "mot de passe oublié"
4. Vous devriez recevoir un email !

### 7. Vérifier dans Resend Dashboard

Allez dans **Logs** pour voir tous les emails envoyés, leur statut (delivered, bounced, etc.) et les erreurs éventuelles.

## Limites gratuites

- **100 emails/jour**
- **3000 emails/mois**
- **1 domaine personnalisé**

Au-delà : $20/mois pour 50 000 emails.

## Dépannage

### "Missing API key"

Vérifiez que la variable d'environnement est bien définie et que vous avez redémarré l'app.

```bash
echo $EXPO_PUBLIC_RESEND_API_KEY
```

### "Domain not verified"

Utilisez `onboarding@resend.dev` au lieu de votre domaine en attendant la vérification DNS.

### "Rate limit exceeded"

Vous avez dépassé 100 emails/jour. Attendez demain ou passez au plan payant.

## Alternative : SendGrid

Si vous préférez SendGrid :
1. Créez un compte sur [sendgrid.com](https://sendgrid.com)
2. Obtenez une API key
3. Remplacez l'URL Resend par SendGrid dans le code

## Recommandation

**Pour le développement** : Laissez le code s'afficher dans la console (sans Resend)

**Pour la production** : Configurez Resend avec votre domaine personnalisé
