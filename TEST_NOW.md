# 🧪 Lancer le Test Firebase Test Lab MAINTENANT

L'APK de Fisabil a été téléchargé et est prêt : **fisabil.apk** (120 MB)

## 📋 Option 1: Console Web Firebase (5 minutes - RECOMMANDÉ)

### Étape 1: Ouvrir Firebase Console
👉 **https://console.firebase.google.com/**

### Étape 2: Sélectionner ou créer un projet
- Si vous n'avez pas de projet: cliquez sur "Ajouter un projet"
  - Nom: **Fisabil**
  - Google Analytics: Optionnel
  - Créer
- Si vous avez déjà un projet: sélectionnez-le

### Étape 3: Aller dans Test Lab
1. Dans le menu de gauche, cliquez sur **"Test Lab"** (sous "Release & Monitor")
2. Si c'est la première fois, cliquez sur "Commencer"

### Étape 4: Télécharger l'APK
1. Cliquez sur **"Exécuter un test"**
2. Sélectionnez **"Test Robo"** (test automatique intelligent)
3. Cliquez sur "Parcourir" et sélectionnez:
   📁 `/Users/daoudlh/fisabil/fisabil.apk`

### Étape 5: Sélectionner les appareils
Sélectionnez 3-5 appareils parmi:

**Recommandations pour Fisabil:**
- ✅ **Pixel 3** - Android 29 - Locale: **ar** (arabe)
- ✅ **Pixel 4** - Android 30 - Locale: **fr_FR** (français)
- ✅ **Samsung Galaxy S10** - Android 29 - Locale: **ar**
- ✅ **OnePlus 7** - Android 30 - Locale: **fr_FR**

⚠️ **Important**: Choisissez au moins un appareil avec locale **ar** (arabe)

### Étape 6: Lancer les tests
1. Cliquez sur **"Démarrer les tests"** (en bas à droite)
2. Attendez 5-15 minutes
3. Les résultats apparaîtront automatiquement

---

## 🖥️ Option 2: Ligne de commande (Si gcloud est installé)

### Installation de gcloud (une seule fois):
```bash
# macOS
curl https://sdk.cloud.google.com | bash
exec -l $SHELL
gcloud init
```

### Lancer le test rapide (2 appareils, 5 min):
```bash
cd /Users/daoudlh/fisabil

gcloud firebase test android run \
  --type robo \
  --app ./fisabil.apk \
  --device model=Pixel2,version=30,locale=ar,orientation=portrait \
  --device model=Pixel3,version=29,locale=fr_FR,orientation=portrait \
  --timeout 5m
```

### Lancer le test complet (4 appareils, 15 min):
```bash
gcloud firebase test android run \
  --type robo \
  --app ./fisabil.apk \
  --device model=Pixel2,version=30,locale=ar,orientation=portrait \
  --device model=Pixel3,version=29,locale=fr_FR,orientation=portrait \
  --device model=Pixel4,version=31,locale=ar,orientation=portrait \
  --device model=OnePlus7,version=30,locale=fr_FR,orientation=portrait \
  --timeout 15m
```

---

## 📊 Résultats attendus

Après l'exécution, vous verrez:

✅ **Vidéos complètes** de l'exécution sur chaque appareil
✅ **Screenshots** à différentes étapes
✅ **Logs détaillés** de l'application
✅ **Rapports de crashs** (si présents)
✅ **Métriques de performance** (temps de chargement, utilisation mémoire)

### Points testés automatiquement:
- Navigation entre les pages
- Login/Inscription
- Scan OCR de textes
- Tuteur vocal (enregistrement + TTS)
- Dictées (lecture audio)
- Cartes de révision (swipe)
- Toutes les interactions UI

---

## 💰 Coût: GRATUIT

- 10 tests/jour gratuits sur appareils virtuels
- 5 tests/jour gratuits sur appareils physiques

---

## ✅ Checklist

- [x] APK téléchargé (120 MB - `/Users/daoudlh/fisabil/fisabil.apk`)
- [ ] Firebase Console ouvert
- [ ] Projet créé/sélectionné
- [ ] Test Lab ouvert
- [ ] APK téléchargé dans Test Lab
- [ ] Appareils sélectionnés (dont au moins 1 en arabe)
- [ ] Tests lancés
- [ ] Résultats analysés

---

## 🆘 Aide

Si vous avez besoin d'aide, consultez:
- [QUICK_START_FIREBASE_TEST.md](QUICK_START_FIREBASE_TEST.md) - Guide détaillé
- [FIREBASE_TEST_LAB_SETUP.md](FIREBASE_TEST_LAB_SETUP.md) - Documentation complète

---

## 🎯 Prochaines étapes

1. Lancez le test maintenant via la console Firebase
2. Attendez les résultats (5-15 min)
3. Analysez les vidéos et logs
4. Identifiez les problèmes éventuels
5. Si nécessaire: corrections → nouveau build → re-test
