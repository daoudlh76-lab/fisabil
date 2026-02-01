# Guide Rapide: Tester Fisabil sur Firebase Test Lab

## 🚀 Méthode Rapide (Recommandée) - Console Web

### Étape 1: Télécharger l'APK
Téléchargez votre APK depuis EAS:
**https://expo.dev/accounts/daoudlh/projects/fisabil/builds/cb86a050-f93a-4705-a5a4-973883177362**

### Étape 2: Aller sur Firebase Console
1. Allez sur https://console.firebase.google.com/
2. Créez un nouveau projet ou sélectionnez un projet existant
3. Dans le menu latéral, cliquez sur **Test Lab** (section "Release & Monitor")

### Étape 3: Lancer le test
1. Cliquez sur **"Exécuter un test"**
2. Sélectionnez **"Test Robo"** (test automatique)
3. Téléchargez votre fichier `fisabil.apk`
4. Choisissez les appareils à tester (recommandé: 3-5 appareils)
   - Sélectionnez des appareils variés (différentes tailles d'écran)
   - Choisissez différentes versions Android (29, 30, 31)
   - **Important**: Choisissez la locale **ar** (arabe) pour au moins un appareil
5. Cliquez sur **"Démarrer X tests"**

### Étape 4: Attendre les résultats (5-15 minutes)
Firebase Test Lab va:
- Installer l'application sur les appareils
- Explorer automatiquement toutes les fonctionnalités
- Tester les interactions
- Capturer des vidéos et screenshots
- Générer un rapport détaillé

### Étape 5: Analyser les résultats
Vous verrez:
- ✅ **État des tests** (réussi/échoué)
- 📹 **Vidéos** de l'exécution sur chaque appareil
- 📸 **Screenshots** à différentes étapes
- 📊 **Logs** de l'application
- ⚠️ **Crashs** détectés (s'il y en a)
- 📈 **Métriques de performance**

## 🛠️ Méthode Avancée - CLI

### Installation de Google Cloud CLI (une seule fois)

**macOS:**
```bash
# Télécharger et installer
curl https://sdk.cloud.google.com | bash

# Redémarrer le terminal
exec -l $SHELL

# Initialiser et se connecter
gcloud init
```

**Linux:**
```bash
curl https://sdk.cloud.google.com | bash
exec -l $SHELL
gcloud init
```

### Lancer les tests depuis le terminal

1. **Télécharger l'APK:**
```bash
cd /Users/daoudlh/fisabil
curl -L "https://expo.dev/accounts/daoudlh/projects/fisabil/builds/cb86a050-f93a-4705-a5a4-973883177362" -o fisabil.apk
```

2. **Utiliser le script automatisé:**
```bash
npm run test:firebase
```

Ou manuellement:

```bash
# Test rapide (2 appareils, 5 minutes)
gcloud firebase test android run \
  --type robo \
  --app ./fisabil.apk \
  --device model=Pixel2,version=30,locale=ar,orientation=portrait \
  --device model=Pixel3,version=29,locale=fr_FR,orientation=portrait \
  --timeout 5m

# Test complet (4 appareils, 15 minutes)
gcloud firebase test android run \
  --type robo \
  --app ./fisabil.apk \
  --device model=Pixel2,version=30,locale=ar,orientation=portrait \
  --device model=Pixel3,version=29,locale=fr_FR,orientation=portrait \
  --device model=Pixel4,version=31,locale=ar,orientation=portrait \
  --device model=OnePlus7,version=30,locale=fr_FR,orientation=portrait \
  --timeout 15m
```

## 📋 Appareils Recommandés pour Fisabil

Pour tester une application avec:
- Interface en arabe et français
- Reconnaissance vocale
- Synthèse vocale (TTS)
- OCR sur textes arabes

Recommandations:
- **Pixel 3** (Android 29) - Locale: ar
- **Pixel 4** (Android 30) - Locale: fr_FR
- **Samsung Galaxy S10** (Android 29) - Locale: ar
- **OnePlus 7** (Android 30) - Locale: fr_FR

## 💰 Coûts

**Firebase Test Lab - Quotas Gratuits:**
- ✅ **10 tests/jour** sur appareils virtuels (GRATUIT)
- ✅ **5 tests/jour** sur appareils physiques (GRATUIT)
- Au-delà: ~$1-5 par test

Pour Fisabil, les tests gratuits sont largement suffisants.

## 🎯 Points à vérifier dans les résultats

1. **Navigation**: Toutes les pages sont accessibles
2. **OCR**: Le scan de texte fonctionne
3. **Tuteur vocal**: L'enregistrement audio et la synthèse vocale fonctionnent
4. **Dictées**: La lecture et l'affichage fonctionnent
5. **Cartes de révision**: Le swipe et l'affichage fonctionnent
6. **Login/Inscription**: Le flux d'authentification est fluide
7. **Performance**: L'app est fluide (pas de lag)
8. **Crashs**: Aucun crash détecté

## 📞 Support

Si vous rencontrez des problèmes:
1. Vérifiez les logs dans Firebase Console
2. Regardez les vidéos de test pour voir exactement ce qui s'est passé
3. Consultez le fichier `FIREBASE_TEST_LAB_SETUP.md` pour plus de détails

## ✅ Checklist

- [ ] APK téléchargé depuis EAS
- [ ] Compte Firebase créé
- [ ] Test Lab activé dans Firebase
- [ ] Premier test lancé
- [ ] Résultats analysés
- [ ] Problèmes identifiés (si présents)
- [ ] Corrections apportées
- [ ] Nouveau build et re-test
