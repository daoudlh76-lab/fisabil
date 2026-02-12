# Guide de Test du Microphone - Fisabil 🎤

## ⚠️ IMPORTANT: Le simulateur iOS ne supporte PAS le microphone

Le **simulateur iOS ne peut pas accéder au microphone de votre Mac**. Les tests de microphone **DOIVENT** être effectués sur un **vrai appareil iOS** (iPhone/iPad physique).

## Pourquoi le simulateur ne fonctionne pas

1. **Pas d'accès matériel**: Le simulateur n'a pas accès au microphone de votre Mac
2. **APIs bloquées**: Les appels à `Audio.getPermissionsAsync()` peuvent se bloquer indéfiniment
3. **Permissions simulées**: Même si vous autorisez, l'enregistrement échouera car il n'y a pas de micro réel

## Solutions pour tester

### Option 1: Tester sur un vrai iPhone/iPad (RECOMMANDÉ ✅)

#### Via Expo Go (le plus rapide)
```bash
# Démarrer le serveur Expo
npx expo start

# Scanner le QR code avec l'app Expo Go sur votre iPhone
```

**Avantages**:
- ✅ Pas besoin de compte développeur Apple
- ✅ Test en quelques secondes
- ✅ Hot reload instantané

**Étapes**:
1. Installez **Expo Go** depuis l'App Store sur votre iPhone
2. Lancez `npx expo start` sur votre Mac
3. Scannez le QR code avec l'appareil photo de l'iPhone
4. L'app s'ouvre dans Expo Go
5. Testez le microphone → la popup d'autorisation apparaîtra

#### Via Build natif (production-like)
```bash
# Build pour iOS (nécessite compte développeur)
eas build --profile development --platform ios

# Ou build local
npx expo run:ios --device
```

**Avantages**:
- ✅ Test comme en production
- ✅ Toutes les fonctionnalités natives disponibles

**Inconvénients**:
- ❌ Nécessite un compte développeur Apple ($99/an)
- ❌ Build plus long (10-20 minutes)

### Option 2: Tester avec un Android physique

Si vous n'avez pas d'iPhone mais un téléphone Android:

```bash
# Activer le mode développeur sur Android
# Puis brancher en USB et lancer:
npx expo start
# Appuyer sur 'a' pour ouvrir sur Android
```

Les permissions microphone fonctionnent mieux sur Android en général.

## Logs de diagnostic

Avec les nouveaux logs ajoutés, vous verrez maintenant:

### Sur un vrai appareil (attendu):
```
🎤 Starting recording...
🎤 Checking permission status...
🎤 Permission result: {"status":"undetermined","canAskAgain":true}
🎤 Requesting permission...
[Popup iOS apparaît]
🎤 Request result: {"status":"granted","canAskAgain":true}
✅ Permission granted
🎤 Setting audio mode...
🎤 Creating recording...
🎤 Preparing to record...
🎤 Starting recording...
✅ Recording started successfully
```

### Sur simulateur (problématique):
```
🎤 Starting recording...
🎤 Checking permission status...
[BLOQUÉ ICI - jamais de réponse]
```

OU:

```
🎤 Starting recording...
🎤 Checking permission status...
🎤 Permission result: {"status":"undetermined","canAskAgain":true}
🎤 Requesting permission...
[BLOQUÉ ICI - pas de popup]
```

## Vérification des permissions sur vrai appareil

### iOS (iPhone/iPad)
1. Ouvrez **Réglages**
2. Faites défiler jusqu'à **Fisabil** (ou **Expo Go** si vous testez via Expo)
3. Vérifiez que **Microphone** est activé ✅

### Android
1. Ouvrez **Paramètres**
2. **Applications** → **Fisabil** (ou **Expo Go**)
3. **Autorisations** → **Microphone** → **Autoriser**

## Debugging si ça ne marche toujours pas

Si même sur vrai appareil le micro ne marche pas:

1. **Vérifiez les logs Xcode/Metro**:
   ```bash
   # Logs détaillés
   npx expo start --dev-client
   ```

2. **Vérifiez app.json** (déjà fait ✅):
   ```json
   "NSMicrophoneUsageDescription": "Permet d'utiliser le microphone...",
   "NSSpeechRecognitionUsageDescription": "Permet de transcrire..."
   ```

3. **Testez l'enregistrement basique**:
   ```typescript
   // Dans une page de test
   const { status } = await Audio.requestPermissionsAsync();
   console.log('Permission:', status);

   const recording = new Audio.Recording();
   await recording.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
   await recording.startAsync();
   console.log('Recording started!');
   ```

4. **Vérifiez expo-av/expo-audio version**:
   ```bash
   npm list expo-av expo-audio
   ```

## Prochaines étapes

1. ✅ Logs détaillés ajoutés (fait)
2. 🎯 **TESTER SUR VRAI IPHONE** avec Expo Go
3. Vérifier si la popup de permission apparaît
4. Si oui → autoriser et tester l'enregistrement
5. Si non → vérifier les logs et le code de permission

## Résumé

| Environnement | Microphone fonctionne? | Popup permission? |
|--------------|------------------------|-------------------|
| **Simulateur iOS** | ❌ NON | ❌ NON |
| **Vrai iPhone (Expo Go)** | ✅ OUI | ✅ OUI |
| **Vrai iPhone (build natif)** | ✅ OUI | ✅ OUI |
| **Émulateur Android** | ⚠️ Parfois | ⚠️ Parfois |
| **Vrai Android** | ✅ OUI | ✅ OUI |

**CONCLUSION**: Pour tester le microphone, **UTILISEZ UN VRAI APPAREIL** (iPhone ou Android) avec **Expo Go** (méthode la plus rapide).
