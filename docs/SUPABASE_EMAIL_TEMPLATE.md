# Configuration du template email Supabase pour afficher un code OTP

## Le vrai problème

`supabase.auth.signInWithOtp()` génère un token et l'envoie par email. Par défaut, Supabase met ce token dans un lien cliquable. Mais on peut modifier le template pour afficher le token comme un code à 6 chiffres.

## Solution : Modifier le template email

### 1. Aller dans Supabase Dashboard

1. Ouvrez [https://app.supabase.com](https://app.supabase.com)
2. Sélectionnez votre projet **fisabil**
3. Allez dans **Authentication > Email Templates**

### 2. Template "Magic Link"

Cliquez sur **"Magic Link"** dans la liste des templates.

### 3. Remplacer le template par celui-ci

```html
<h2>Code de vérification Fisabil</h2>

<p>Salam alaykoum,</p>

<p>Vous avez demandé à réinitialiser votre mot de passe. Voici votre code de vérification :</p>

<div style="background: #f4f4f4; border: 2px solid #2F6B3D; border-radius: 8px; padding: 20px; text-align: center; margin: 20px 0;">
  <div style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #2F6B3D;">
    {{ .Token }}
  </div>
</div>

<p><strong>Ce code expire dans 1 heure.</strong></p>

<p>Si vous n'avez pas demandé cette réinitialisation, ignorez cet email.</p>

<p style="font-size: 12px; color: #666; margin-top: 20px;">
  © 2024 Fisabil - Application d'apprentissage de l'arabe
</p>
```

### 4. Sauvegarder

Cliquez sur **"Save"** en bas du template.

## ⚠️ Important

Le token généré par Supabase n'est PAS un code à 6 chiffres, mais un long token aléatoire (ex: `pkce_a1b2c3d4...`).

Si vous voulez vraiment un code à 6 chiffres numérique :
- Gardez le système OTP personnalisé que nous avons créé
- Déployez l'Edge Function `send-otp-email`
- Ou configurez Resend/SendGrid

## Alternative : Utiliser le token Supabase tel quel

Si le token long ne vous dérange pas :
1. Modifiez le template comme ci-dessus
2. Revenez au code original dans `forgot-password.tsx` :

```typescript
const { error } = await supabase.auth.signInWithOtp({
  email: email,
  options: {
    shouldCreateUser: false,
  },
});
```

3. Dans `verify-otp.tsx`, acceptez des codes plus longs :

```typescript
const [otp, setOtp] = useState("");  // String au lieu de tableau
```

Mais cette solution n'est pas idéale car le token est trop long pour être tapé manuellement.

## Conclusion

**Pour avoir de VRAIS codes à 6 chiffres numériques** : Gardez le système OTP personnalisé et configurez Resend (voir ci-dessous).
