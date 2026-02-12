# 🚀 Relancer le simulateur avec le projet

**Date:** 9 février 2026
**Action:** Redémarrage du serveur Metro avec cache nettoyé

---

## ✅ COMMANDES EXÉCUTÉES

### 1. Arrêt de l'ancien serveur Metro
```bash
# Tuer le processus sur le port 8081
lsof -ti:8081 | xargs kill -9

# Vérifier que le port est libre
lsof -ti:8081
# (doit être vide)
```

### 2. Redémarrage avec cache nettoyé
```bash
# Relancer avec cache clean
npx expo start --clear
```

**Ce qui se passe:**
- ✅ Cache Metro nettoyé
- ✅ Bundler reconstruit
- ✅ Serveur redémarre sur port 8081
- ✅ Toutes les modifications de code rechargées

---

## 📱 OUVRIR L'APP DANS LE SIMULATEUR

### Option 1: Depuis le terminal Metro

Quand Metro affiche:
```
› Metro waiting on exp://192.168.1.6:8081
› Scan the QR code above with Expo Go (Android) or the Camera app (iOS)

› Press a │ open Android
› Press i │ open iOS simulator
› Press w │ open web

› Press j │ open debugger
› Press r │ reload app
› Press m │ toggle menu
› Press o │ open project code in your editor

› Press ? │ show all commands
```

**Appuyer sur `i`** pour ouvrir le simulateur iOS

### Option 2: Manuellement

```bash
# Ouvrir le simulateur iOS
open -a Simulator

# Puis dans le terminal Metro, appuyer sur 'i'
# OU installer l'app avec:
npx expo run:ios
```

---

## 🔄 RECHARGER L'APP

### Dans le simulateur iOS:
```
cmd + R  (recharge l'app)
cmd + D  (ouvre le dev menu)
```

### Dans le terminal Metro:
```
r  (reload)
```

---

## 🧪 VÉRIFICATIONS APRÈS RECHARGEMENT

### 1. Vérifier que l'app démarre
```
✅ Pas d'erreur "Cannot read property 'auth'"
✅ Écran de login ou tabs s'affiche
```

### 2. Vérifier la navigation
```
✅ Barre de tabs: 6 onglets uniquement
   - Scanner
   - Library
   - Revision
   - Playlist
   - Tutor
   - Settings

✅ Sous-routes Settings accessibles:
   - Settings → À propos du tuteur IA
   - Settings → Privacy Policy
   - Settings → Supprimer mon compte
```

### 3. Vérifier les fonctionnalités
```
✅ Login/Logout fonctionne
✅ OCR Scanner fonctionne
✅ Suppression compte fonctionne (avec compte test)
```

---

## 🐛 TROUBLESHOOTING

### Problème: Port 8081 déjà utilisé
```bash
# Solution 1: Tuer le processus
lsof -ti:8081 | xargs kill -9

# Solution 2: Utiliser un autre port
npx expo start --port 8082
```

### Problème: Cache corrompue
```bash
# Nettoyer complètement
rm -rf node_modules/.cache
rm -rf .expo
npx expo start --clear
```

### Problème: App ne se recharge pas
```bash
# Dans le simulateur: cmd + R
# OU relancer complètement:
npx expo run:ios
```

### Problème: Erreurs de build
```bash
# Nettoyer build iOS
rm -rf ios/build
cd ios && pod install && cd ..

# Relancer
npx expo run:ios
```

---

## 📋 COMMANDES UTILES

### Démarrage:
```bash
npx expo start              # Démarrage normal
npx expo start --clear      # Avec nettoyage cache
npx expo start --ios        # Ouvre iOS directement
npx expo start --android    # Ouvre Android directement
```

### Debug:
```bash
npx expo start --dev-client # Mode dev client
npx expo start --no-dev     # Mode production
npx expo start --https      # Avec HTTPS
```

### Build:
```bash
npx expo run:ios            # Build et lance iOS
npx expo run:android        # Build et lance Android
```

---

## ✅ STATUS ACTUEL

**Metro server:**
- ✅ Port 8081 libéré
- ✅ Serveur redémarré avec `--clear`
- ⏳ Cache en cours de rebuild
- ⏳ Attendre ~30 secondes pour que le serveur soit prêt

**Prochaine action:**
1. Attendre que Metro affiche "Metro waiting on exp://..."
2. Appuyer sur `i` pour ouvrir iOS simulator
3. Attendre le chargement de l'app
4. Vérifier que tout fonctionne

---

## 📞 EN CAS DE PROBLÈME

**Logs Metro:**
```bash
# Voir les logs en temps réel
tail -f /private/tmp/claude-501/-Users-daoudlh-fisabil/tasks/b9109e5.output
```

**Redémarrer complètement:**
```bash
# Tuer Metro
lsof -ti:8081 | xargs kill -9

# Nettoyer cache
rm -rf node_modules/.cache
rm -rf .expo

# Relancer
npx expo start --clear
```

**Vérifier que tout fonctionne:**
- Voir `SUCCESS_FINAL.md` pour liste des tests
- Voir `TEST_QUICK_GUIDE.md` pour guide de test rapide

---

**Date:** 9 février 2026, 01:09 AM
**Status:** ⏳ Metro en cours de redémarrage
**Action suivante:** Appuyer sur `i` quand Metro est prêt
