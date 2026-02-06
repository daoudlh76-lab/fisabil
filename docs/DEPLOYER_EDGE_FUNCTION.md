# Déployer l'Edge Function reset-password-otp

## Option 1 : Installer Supabase CLI (Recommandé)

### Installation

```bash
# Sur macOS avec Homebrew
brew install supabase/tap/supabase

# Vérifier l'installation
supabase --version
```

### Se connecter à Supabase

```bash
# Se connecter
supabase login

# Lier votre projet
supabase link --project-ref VOTRE_PROJECT_ID
```

Pour trouver votre `PROJECT_ID` :
1. Allez sur dashboard.supabase.com
2. Sélectionnez votre projet
3. L'ID est dans l'URL : `https://supabase.com/dashboard/project/[PROJECT_ID]`

### Déployer la fonction

```bash
# Depuis la racine du projet
cd /Users/daoudlh/fisabil

# Déployer la fonction
supabase functions deploy reset-password-otp

# Vérifier le déploiement
supabase functions list
```

## Option 2 : Déploiement manuel via Dashboard

Si vous ne voulez pas installer la CLI, vous pouvez créer la fonction directement dans le Dashboard :

1. Allez sur [dashboard.supabase.com](https://dashboard.supabase.com)
2. Sélectionnez votre projet
3. Allez dans **Edge Functions** (menu de gauche)
4. Cliquez sur **Create a new function**
5. Nom : `reset-password-otp`
6. Copiez le contenu de `supabase/functions/reset-password-otp/index.ts`
7. Cliquez sur **Deploy function**

## Option 3 : Via l'API Supabase Management

Utilisez cURL pour déployer la fonction :

```bash
# Récupérez votre Management API Token depuis Supabase Dashboard
# Settings → API → Management API

curl -X POST 'https://api.supabase.com/v1/projects/VOTRE_PROJECT_ID/functions' \
  -H "Authorization: Bearer VOTRE_MANAGEMENT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "reset-password-otp",
    "verify_jwt": false,
    "import_map": false
  }'

# Puis uploadez le code
# (Processus complexe, privilégiez Option 1 ou 2)
```

## Vérification

Une fois déployée, testez l'Edge Function :

```bash
curl -X POST 'https://VOTRE_PROJECT_ID.supabase.co/functions/v1/reset-password-otp' \
  -H "Authorization: Bearer VOTRE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "newPassword": "nouveauMotDePasse123"
  }'
```

Vous devriez recevoir une réponse comme :
```json
{"success": true, "message": "Mot de passe réinitialisé avec succès"}
```

Ou une erreur si l'utilisateur n'existe pas :
```json
{"error": "Aucun utilisateur trouvé avec cet email"}
```

## Dépannage

### "Function not found"

La fonction n'a pas été déployée. Utilisez l'Option 2 (Dashboard).

### "Permission denied"

Vérifiez que vous êtes bien connecté avec la bonne clé API dans les headers.

### "Missing environment variables"

Les variables `SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY` sont automatiquement injectées par Supabase. Si elles manquent, c'est un problème de configuration Supabase.

## Notes importantes

- L'Edge Function utilise la **Service Role Key** pour avoir les permissions admin
- Cette clé ne doit **JAMAIS** être exposée côté client
- C'est pourquoi on passe par une Edge Function pour réinitialiser le mot de passe
