# Configuration de Google Cloud Vision API

## Pourquoi Google Cloud Vision?

OpenAI Vision refuse parfois de traiter les images de textes religieux (Coran, Hadith). Google Cloud Vision n'a pas cette restriction et est spécialisé pour l'OCR.

## Étapes de configuration (5 minutes)

### 1. Créer un compte Google Cloud

1. Aller sur https://console.cloud.google.com
2. Se connecter avec un compte Google
3. Accepter les conditions d'utilisation
4. **Important**: Vous avez $300 de crédit gratuit pour 90 jours

### 2. Créer un projet

1. Cliquer sur "Select a project" en haut
2. Cliquer sur "NEW PROJECT"
3. Nom du projet: `fisabil-ocr` (ou autre nom)
4. Cliquer sur "CREATE"
5. Attendre quelques secondes que le projet soit créé

### 3. Activer l'API Cloud Vision

1. Dans le menu hamburger (☰), aller dans **APIs & Services** > **Library**
2. Rechercher "Cloud Vision API"
3. Cliquer sur **Cloud Vision API**
4. Cliquer sur **ENABLE**
5. Attendre quelques secondes

### 4. Créer une clé API

1. Dans le menu hamburger (☰), aller dans **APIs & Services** > **Credentials**
2. Cliquer sur **+ CREATE CREDENTIALS** en haut
3. Choisir **API key**
4. Une clé sera générée automatiquement (ex: `AIzaSyD...`)
5. **IMPORTANT**: Copier cette clé immédiatement

### 5. Restreindre la clé API (sécurité)

1. Dans la popup, cliquer sur **RESTRICT KEY**
2. Donner un nom: `Fisabil Mobile App`
3. Dans **API restrictions**:
   - Choisir **Restrict key**
   - Sélectionner uniquement **Cloud Vision API**
4. Cliquer sur **SAVE**

### 6. Ajouter la clé dans votre projet

Ouvrir le fichier `.env.local` à la racine du projet et ajouter:

```bash
EXPO_PUBLIC_GOOGLE_VISION_API_KEY=AIzaSyD...votre_cle_ici
```

**Attention**: Ne pas committer ce fichier dans Git!

### 7. Vérifier que `.env.local` est dans `.gitignore`

Ouvrir `.gitignore` et vérifier que cette ligne existe:
```
.env.local
```

Si elle n'existe pas, l'ajouter.

### 8. Redémarrer le serveur Expo

```bash
npx expo start -c
```

Le `-c` efface le cache pour prendre en compte la nouvelle variable d'environnement.

## Comment ça fonctionne maintenant?

L'app utilisera automatiquement le fallback:

1. **Si Google Cloud Vision est configuré** → Essaie d'abord Google Vision
2. **Si Google Vision échoue** → Essaie OpenAI en fallback
3. **Si OpenAI échoue aussi** → Affiche une erreur

**Ordre de priorité:**
```
Google Vision (pas de restriction) → OpenAI Vision (peut refuser) → Erreur
```

## Coûts

Google Cloud Vision API:
- ✅ **Gratuit jusqu'à 1000 requêtes/mois**
- Puis $1.50 pour 1000 requêtes supplémentaires

Avec le crédit de $300:
- Vous pouvez faire **200,000 scans gratuits** pendant 90 jours
- Largement suffisant pour le développement et les premiers utilisateurs

## Tester la configuration

1. Lancer l'app
2. Aller dans Scanner
3. Prendre une photo d'un texte arabe
4. Dans les logs, vous devriez voir:
   ```
   🔍 Tentative avec Google Cloud Vision...
   ✅ Google Vision a réussi
   ```

Si vous voyez:
```
⚠️ Google Cloud Vision API key not configured
🔍 Tentative avec OpenAI Vision...
```

Alors la clé n'est pas configurée correctement.

## Dépannage

### Erreur: "API key not valid"
- Vérifier que la clé est bien copiée dans `.env.local`
- Vérifier qu'il n'y a pas d'espaces avant/après
- Redémarrer le serveur avec `npx expo start -c`

### Erreur: "Cloud Vision API has not been used"
- Attendre 2-3 minutes après avoir activé l'API
- Vérifier que l'API est bien activée dans la console

### Erreur: "The request is missing a valid API key"
- La clé n'est pas passée correctement
- Vérifier que le fichier `.env.local` est à la racine du projet
- Redémarrer le serveur

### Les logs disent "Google Cloud Vision API key not configured"
- Vérifier le nom de la variable: `EXPO_PUBLIC_GOOGLE_VISION_API_KEY`
- **Important**: Le préfixe `EXPO_PUBLIC_` est obligatoire
- Redémarrer avec `npx expo start -c`

## Pour aller plus loin

### Quota et limites
- 1000 requêtes/mois gratuites
- Puis $1.50/1000 requêtes
- Pas de limite de taux

### Monitoring
Pour voir l'utilisation:
1. Aller dans Google Cloud Console
2. Menu > **APIs & Services** > **Dashboard**
3. Cliquer sur **Cloud Vision API**
4. Voir les graphiques d'utilisation

### Alternative: Service Account (production)
Pour la production, il est recommandé d'utiliser un Service Account au lieu d'une clé API:
1. Plus sécurisé
2. Meilleure gestion des permissions
3. Rotation des clés facilitée

Mais pour le développement, une clé API suffit.

## Résumé des fichiers modifiés

- ✅ `src/lib/google-vision-ocr.ts` - Ajout de Google Vision OCR + fallback
- ✅ `app/(tabs)/index.tsx` - Utilisation du fallback automatique
- ✅ `.env.local` - Ajout de `EXPO_PUBLIC_GOOGLE_VISION_API_KEY`

Vous êtes maintenant prêt à scanner des textes religieux sans restriction! 🎉
