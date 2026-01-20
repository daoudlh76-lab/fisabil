# Supabase Edge Functions

## extract-vocab

Cette fonction extrait le vocabulaire, les verbes et les particules d'un texte arabe en utilisant l'IA.

### Déploiement

```bash
# 1. Installer Supabase CLI (si pas déjà fait)
npm install -g supabase

# 2. Se connecter à Supabase
supabase login

# 3. Lier le projet local
supabase link --project-ref lluabltdmlprrwggwhlq

# 4. Déployer les functions
supabase functions deploy extract-vocab

# 5. Tester localement (développement)
supabase start
```

### Paramètres

**Request Body:**
```json
{
  "scan_id": "uuid-du-scan",
  "ui_lang": "fr" // ou "en", "ar"
}
```

**Headers:**
```
Authorization: Bearer <access_token>
```

### Réponse Succès (200)

```json
{
  "meta": {
    "ui_lang": "fr",
    "title": "Mon texte",
    "source": "extract-vocab-v1",
    "model": "mock"
  },
  "vocabulaire": [
    {
      "mot_ar": "كتاب",
      "traduction": "livre",
      "singulier": "كتاب",
      "pluriel": "كتب",
      "contraire": null,
      "remarque": "Nom masculin singulier"
    }
  ],
  "verbes": [
    {
      "verbe_ar": "كتب",
      "traduction": "écrire",
      "passe_3ms": "كتب",
      "present_3ms": "يكتب",
      "imperatif": "اكتب",
      "remarque": "Verbe régulier"
    }
  ],
  "particules": [
    {
      "particule_ar": "في",
      "type": "préposition",
      "traduction": "dans",
      "exemple": "في البيت"
    }
  ]
}
```

### Erreurs Possibles

| Code | Message | Cause |
|------|---------|-------|
| 400 | Missing scan_id | scan_id manquant |
| 401 | Unauthorized | Token d'auth invalide/manquant |
| 403 | Forbidden | L'utilisateur ne peut pas accéder ce scan |
| 404 | Scan not found | Le scan n'existe pas |
| 500 | Internal server error | Erreur serveur |

### Notes

- **verify_jwt: false** → La fonction accepte n'importe quel token (à changer en production)
- Utilisez `SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY` comme variables d'env
- Pour utiliser l'IA réelle, remplacez la logique MOCK par un appel à une API d'IA
