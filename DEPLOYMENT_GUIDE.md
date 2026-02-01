# Guide de Déploiement Fisabil

## Prérequis

### Comptes nécessaires
- [ ] Apple Developer Account ($99/an)
- [ ] Google Play Console Account ($25 one-time)
- [ ] Expo Account (gratuit)

### Outils installés
- [ ] Node.js 18+
- [ ] EAS CLI: `npm install -g eas-cli`
- [ ] Expo CLI: `npm install -g expo-cli`

## Étape 1: Configuration des Variables d'Environnement

### Production Environment Variables

Créer `.env.production` :

```bash
EXPO_PUBLIC_SUPABASE_URL=your_production_supabase_url
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_production_supabase_anon_key
EXPO_PUBLIC_OPENAI_API_KEY=your_production_openai_api_key
```

⚠️ **Important**: Utiliser des clés de production séparées, pas les clés de développement!

## Étape 2: Vérifications Pré-Build

```bash
# Vérifier la configuration
eas config

# Vérifier les credentials
eas credentials

# Test du build localement (optionnel)
npx expo export --platform all
```

## Étape 3: Build iOS

### 3.1 Configuration Apple

```bash
# Login EAS
eas login

# Configurer les credentials iOS
eas credentials
```

Sélectionner:
1. iOS → Distribution Certificate
2. iOS → Provisioning Profile
3. Push Notification Key (optionnel)

### 3.2 Build de production iOS

```bash
# Build pour App Store
eas build --platform ios --profile production

# Attendre la fin du build (~15-30 minutes)
# URL du build sera affichée
```

### 3.3 Submit à App Store

```bash
# Submit automatiquement
eas submit --platform ios --latest

# OU manuellement via App Store Connect:
# 1. Télécharger le .ipa depuis expo.dev
# 2. Upload via Transporter app
# 3. Remplir les informations dans App Store Connect
```

## Étape 4: Build Android

### 4.1 Générer le Keystore (première fois seulement)

```bash
# EAS génère automatiquement
eas credentials

# Ou créer manuellement:
keytool -genkey -v -keystore fisabil-release.keystore \
  -alias fisabil -keyalg RSA -keysize 2048 -validity 10000
```

### 4.2 Build de production Android

```bash
# Build AAB pour Play Store
eas build --platform android --profile production

# Attendre la fin du build (~15-30 minutes)
```

### 4.3 Submit à Google Play

#### Option A: Automatique (recommandé)

1. Créer un Service Account dans Google Play Console
2. Télécharger le JSON key
3. Placer dans `./google-service-account.json`
4. Submit:

```bash
eas submit --platform android --latest
```

#### Option B: Manuel

1. Télécharger le .aab depuis expo.dev
2. Upload manuellement dans Google Play Console

## Étape 5: Remplir les Store Listings

### App Store Connect

1. **App Information**
   - Name: Fisabil - Apprendre l'Arabe
   - Subtitle: Tuteur IA pour l'arabe
   - Primary Language: French
   - Category: Education → Language Learning
   - Content Rights: ✓ Contains third-party content

2. **Pricing and Availability**
   - Price: Free
   - Availability: All countries

3. **Privacy**
   - Privacy Policy URL: https://fisabil.com/privacy
   - User Privacy Choices URL: https://fisabil.com/privacy#choices

4. **App Review Information**
   - Contact: support@fisabil.com
   - Phone: +33 X XX XX XX XX
   - Demo Account: reviewer@fisabil.com / ReviewTest2026!
   - Notes: Tester avec le tuteur vocal et le scanner OCR

5. **Version Information**
   - Screenshots (voir STORE_LISTING.md)
   - Promotional Text
   - Description
   - Keywords
   - Support URL: https://fisabil.com/support
   - Marketing URL: https://fisabil.com

6. **Build**
   - Sélectionner le build uploadé
   - Export Compliance: No encryption OR encryption registration

### Google Play Console

1. **Store Listing**
   - App name: Fisabil - Apprendre l'Arabe
   - Short description (80 chars)
   - Full description (4000 chars)
   - Screenshots (2-8 par type)
   - Feature graphic (1024x500)
   - App icon (512x512)

2. **Store Settings**
   - App category: Education
   - Tags: Language learning, Education, Arabic
   - Contact email: support@fisabil.com
   - Website: https://fisabil.com
   - Privacy policy: https://fisabil.com/privacy

3. **Content Rating**
   - Complete questionnaire
   - Expected: Everyone (PEGI 3)

4. **Target Audience**
   - Age groups: 13+ (or all ages)
   - Appeals primarily to children: No

5. **Data Safety**
   - Data collected: Email, usage data, photos (OCR), voice (temporary)
   - Data shared: None
   - Encryption: Yes
   - User can request deletion: Yes

6. **App Content**
   - Privacy policy
   - Ads: No
   - In-app purchases: No (pour v1.0)
   - Target audience: General

7. **Pricing & Distribution**
   - Countries: All available
   - Price: Free
   - Contains ads: No
   - In-app purchases: No

## Étape 6: Préparer les Assets

### Screenshots à créer

Utiliser un simulateur/émulateur pour capturer:

```bash
# iOS Simulator
xcrun simctl list devices

# Capturer screenshot
xcrun simctl io booted screenshot screenshot.png

# Android Emulator
adb shell screencap -p /sdcard/screenshot.png
adb pull /sdcard/screenshot.png
```

**Écrans à capturer:**
1. Welcome/Login
2. Scanner OCR
3. Bibliothèque
4. Détail texte + vocabulaire
5. Tuteur vocal
6. Cartes révision
7. Dictée
8. Paramètres

### Feature Graphic (Google Play)

Dimensions: 1024 x 500 pixels
- Logo Fisabil
- Texte: "Apprenez l'arabe avec l'IA"
- Capture d'écran du tuteur vocal

## Étape 7: Test Pre-Release

### TestFlight (iOS)

```bash
# Build pour TestFlight
eas build --platform ios --profile production

# Submit à TestFlight
eas submit --platform ios --latest
```

1. Inviter testeurs externes
2. Remplir les informations de test
3. Soumettre pour review TestFlight
4. Attendre approbation (~24h)

### Internal Testing (Android)

1. Upload dans Google Play Console
2. Create Internal Testing release
3. Ajouter testeurs (max 100)
4. Distribuer le lien de test

## Étape 8: Soumission Finale

### iOS App Review

Checklist:
- [ ] Toutes les métadonnées remplies
- [ ] Screenshots uploadés (6-10)
- [ ] Privacy policy active
- [ ] Demo account créé
- [ ] Build sélectionné
- [ ] Export compliance répondu

**Soumettre pour review**:
1. App Store Connect → My Apps → Fisabil
2. Version → Submit for Review
3. Répondre aux questions
4. Submit

**Temps d'attente**: 24-48 heures (en moyenne)

### Google Play Review

Checklist:
- [ ] Store listing complet
- [ ] Content rating obtenu
- [ ] Data safety rempli
- [ ] Pricing & distribution configuré
- [ ] Release notes ajoutées

**Soumettre pour review**:
1. Play Console → Fisabil
2. Production → Create new release
3. Upload AAB
4. Review release
5. Start rollout to Production

**Temps d'attente**: Quelques heures à 7 jours

## Étape 9: Monitoring Post-Launch

### Crashlytics / Error Tracking

Installer Sentry (optionnel):

```bash
npm install @sentry/react-native
eas build:configure
```

### Analytics

Vérifier:
- Downloads
- Crashes
- User reviews
- Retention rate

### Updates OTA

Pour les updates qui ne nécessitent pas de nouveau build:

```bash
# Publish update
eas update --branch production --message "Fix minor bugs"
```

## Étape 10: Marketing

### Landing Page

Créer https://fisabil.com avec:
- Description de l'app
- Screenshots
- Download links (App Store + Google Play)
- Privacy policy
- Support/Contact

### App Store Optimization (ASO)

1. **Keywords research**
   - Utiliser App Annie, Sensor Tower
   - Analyser les concurrents
   - Tester différents keywords

2. **A/B Testing**
   - Tester différents screenshots
   - Tester différentes descriptions
   - Optimiser la conversion

3. **Reviews Management**
   - Répondre aux reviews
   - Encourager les reviews positifs
   - Fixer les problèmes signalés

## Commandes Utiles

```bash
# Vérifier status build
eas build:list

# Vérifier submissions
eas submit:list

# Voir les credentials
eas credentials

# Mettre à jour la version
# Éditer app.json → version & versionCode/buildNumber
# Puis rebuild

# Annuler un build en cours
eas build:cancel

# Logs d'une build
eas build:view [build-id]
```

## Troubleshooting

### Build Failed

1. Vérifier les logs: `eas build:view [build-id]`
2. Vérifier app.json syntax
3. Vérifier package.json dependencies
4. Vérifier .gitignore (pas de fichiers sensibles)

### Rejected by App Store

Raisons courantes:
- Informations incomplètes
- Screenshots manquants
- Fonctionnalité ne marche pas
- Privacy policy manquante
- Demo account invalide

→ Lire attentivement le message de rejection
→ Corriger et resoumettre

### Google Play Rejection

- Vérifier Data Safety section
- Vérifier Content Rating
- S'assurer que l'APK/AAB est signé correctement

## Checklist Finale

Avant de soumettre:

**Technique**
- [ ] Build production réussi
- [ ] Testé sur devices réels (iOS + Android)
- [ ] Pas de crashes
- [ ] Toutes les features fonctionnent
- [ ] Performance acceptable
- [ ] Taille de l'app raisonnable

**Métadonnées**
- [ ] Nom d'app vérifié
- [ ] Description optimisée
- [ ] Keywords recherchés
- [ ] Screenshots de qualité
- [ ] Privacy policy en ligne
- [ ] Support email actif

**Légal**
- [ ] Privacy policy conforme RGPD
- [ ] Terms of service (si applicable)
- [ ] Content rating approprié
- [ ] Permissions justifiées

**Post-Launch**
- [ ] Monitoring configuré
- [ ] Support préparé
- [ ] Landing page prête
- [ ] Social media prêts

## Ressources

- [Expo EAS Build Docs](https://docs.expo.dev/build/introduction/)
- [App Store Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- [Google Play Policy](https://play.google.com/about/developer-content-policy/)
- [ASO Guide](https://www.apptopia.com/academy/app-store-optimization)

---

**Bonne chance avec le lancement de Fisabil! 🚀**
