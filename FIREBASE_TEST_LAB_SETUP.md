# Configuration Firebase Test Lab pour Fisabil

## Étape 1: Créer un projet Firebase

1. Allez sur [Firebase Console](https://console.firebase.google.com/)
2. Cliquez sur "Ajouter un projet"
3. Nom du projet: **Fisabil**
4. Activez Google Analytics (optionnel)
5. Créez le projet

## Étape 2: Activer Firebase Test Lab

1. Dans votre projet Firebase, allez dans le menu latéral
2. Cliquez sur **Test Lab** (sous "Release & Monitor")
3. Activez l'API si demandé

## Étape 3: Configurer Google Cloud CLI (gcloud)

### Installation de gcloud CLI:

**macOS:**
```bash
# Télécharger et installer
curl https://sdk.cloud.google.com | bash

# Redémarrer le terminal, puis initialiser
gcloud init
```

**Linux:**
```bash
curl https://sdk.cloud.google.com | bash
exec -l $SHELL
gcloud init
```

### Authentification:
```bash
# Se connecter à Google Cloud
gcloud auth login

# Configurer le projet
gcloud config set project VOTRE_PROJECT_ID
```

## Étape 4: Télécharger l'APK depuis EAS

Vous avez déjà un build preview disponible. Téléchargez-le:

**Lien du build:** https://expo.dev/accounts/daoudlh/projects/fisabil/builds/cb86a050-f93a-4705-a5a4-973883177362

Ou utilisez EAS CLI:
```bash
# Télécharger le dernier build
eas build:download --platform android --profile preview --output ./fisabil.apk
```

## Étape 5: Lancer les tests sur Firebase Test Lab

### Option A: Via la console web (Simple)

1. Allez sur [Firebase Console](https://console.firebase.google.com/)
2. Sélectionnez votre projet Fisabil
3. Allez dans **Test Lab**
4. Cliquez sur **Exécuter un test**
5. Sélectionnez **Instrumentation** ou **Robo** (test automatique)
6. Téléchargez votre APK
7. Sélectionnez les appareils à tester (recommandé: 3-5 appareils variés)
8. Lancez les tests

### Option B: Via gcloud CLI (Avancé)

#### Test Robo (automatique - RECOMMANDÉ):
```bash
gcloud firebase test android run \
  --type robo \
  --app ./fisabil.apk \
  --device model=Pixel2,version=30,locale=fr_FR,orientation=portrait \
  --device model=Pixel3,version=29,locale=fr_FR,orientation=portrait \
  --timeout 5m
```

#### Test avec scénario personnalisé:
```bash
gcloud firebase test android run \
  --type robo \
  --app ./fisabil.apk \
  --device model=Pixel2,version=30,locale=fr_FR,orientation=portrait \
  --device model=Pixel3,version=29,locale=ar,orientation=portrait \
  --device model=Pixel4,version=31,locale=fr_FR,orientation=portrait \
  --timeout 10m \
  --robo-directives login_username=test@example.com,login_password=testpass123
```

## Étape 6: Appareils recommandés pour les tests

Pour une application en arabe avec fonctionnalités vocales:

```bash
# Configuration recommandée pour Fisabil
gcloud firebase test android run \
  --type robo \
  --app ./fisabil.apk \
  --device model=Pixel2,version=30,locale=ar,orientation=portrait \
  --device model=Pixel3,version=29,locale=fr_FR,orientation=portrait \
  --device model=SamsungGalaxyS10,version=29,locale=ar,orientation=portrait \
  --device model=OnePlus7,version=30,locale=fr_FR,orientation=portrait \
  --timeout 15m
```

### Liste des appareils disponibles:
```bash
# Voir tous les appareils disponibles
gcloud firebase test android models list

# Voir les versions Android disponibles
gcloud firebase test android versions list

# Voir les locales disponibles
gcloud firebase test android locales list
```

## Étape 7: Analyser les résultats

Après l'exécution des tests:

1. Les résultats apparaissent dans la console Firebase Test Lab
2. Vous verrez:
   - Captures d'écran de l'exécution
   - Vidéos de la session de test
   - Logs de l'application
   - Rapports de crash
   - Métriques de performance

3. Les résultats sont aussi disponibles en ligne de commande:
```bash
# Les résultats sont stockés dans Google Cloud Storage
# L'URL sera affichée après l'exécution des tests
```

## Configuration avancée pour Fisabil

### Test avec compte utilisateur:

Si vous voulez tester avec un compte utilisateur spécifique:

```bash
gcloud firebase test android run \
  --type robo \
  --app ./fisabil.apk \
  --device model=Pixel3,version=30,locale=ar,orientation=portrait \
  --robo-directives login_email=test@fisabil.com,login_password=testpass123 \
  --timeout 15m
```

### Test des fonctionnalités spécifiques:

Pour tester spécifiquement:
- OCR et scan de texte
- Tuteur vocal
- Dictées
- Cartes de révision

Utilisez le test Robo qui va explorer automatiquement toutes les fonctionnalités.

## Coûts

Firebase Test Lab offre:
- **10 tests/jour gratuits** sur appareils virtuels
- **5 tests/jour gratuits** sur appareils physiques
- Au-delà: tarification selon l'usage

## Troubleshooting

### Erreur d'authentification:
```bash
gcloud auth login
gcloud auth application-default login
```

### Erreur de quota:
- Vérifiez que vous n'avez pas dépassé la limite quotidienne
- Attendez 24h ou passez à un plan payant

### APK trop volumineux:
- Firebase Test Lab accepte jusqu'à 4 GB
- Votre APK devrait être largement en dessous

## Script automatisé

Un script a été créé pour faciliter le processus:
```bash
npm run test:firebase
```

Voir `scripts/firebase-test-lab.sh` pour les détails.
