# 🎯 Fisabil - App Store & Google Play Compliance Checklist

**Date:** 9 février 2026
**Version:** 1.0.0
**Status:** ✅ READY FOR SUBMISSION

---

## 📱 1. ACCOUNT DELETION (MANDATORY APPLE)

### Implementation
✅ **In-app account deletion feature**
- File: `app/(tabs)/settings/delete-account.tsx`
- Accessible via: Settings → Delete my account
- Multi-step confirmation process:
  1. User must read warning
  2. User must check acknowledgment checkbox
  3. User must type "DELETE" exactly
  4. Final confirmation dialog

### Data Deletion
✅ **Complete data removal**
```typescript
// All user data deleted from Supabase:
- scans (texts)
- ai_cache
- vocab_cards_progress
- vocabulary
- audio_tracks
- dictations
- folders
- subscriptions
- store_transaction_log
- receipt_verification_log
- auth user account
```

### User Experience
✅ **Clear warnings in 3 languages (FR, EN, AR)**
- Explains data loss
- States action is irreversible
- Lists what will be deleted
- No email required
- No support contact required
- All done in-app

✅ **Automatic logout after deletion**
- User redirected to login screen
- Session cleared
- Local storage cleared

---

## 🔐 2. SECURITY & API KEYS

### No Hardcoded Secrets
✅ **All API keys from environment variables**
```typescript
// ✅ CORRECT:
const GOOGLE_VISION_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_VISION_API_KEY || '';
const APPLE_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_APPLE_KEY || '';

// ❌ NEVER:
const API_KEY = 'sk-abc123...'; // NO HARDCODED KEYS
```

### Server-Side AI Processing
✅ **All OpenAI calls via Supabase Edge Functions**
- No direct OpenAI API calls from client
- Edge Functions: `tutor-chat-ai`, `tutor-realtime`, `tts-generate`
- API keys stored in Supabase secrets
- Client only calls: `invokeEdge('function-name', params)`

**Verification:**
```bash
grep -r "api.openai.com" app/ src/ hooks/ contexts/
# Result: No direct OpenAI API calls found ✅
```

### Google Vision OCR
✅ **Client-side OCR acceptable**
- Uses public Google Vision API
- API key in environment variable
- Key restrictions enabled in Google Cloud Console
- Only used for image-to-text conversion

---

## 📜 3. PRIVACY & TRANSPARENCY

### Privacy Policy
✅ **Public web page** (MANDATORY)
- URL: `https://fisabil.fr/privacy`
- Accessible without authentication
- Mobile-responsive design
- File: `privacy-policy.html`

✅ **In-app Privacy Policy screen**
- File: `app/(tabs)/settings/privacy.tsx`
- Multi-language support (FR, EN, AR)
- Button to open web version
- Full content scrollable in-app

### AI Transparency
✅ **"About the AI Tutor" screen**
- File: `app/(tabs)/settings/about.tsx`
- Explains AI usage (OpenAI GPT-4, Google Vision)
- Warns about potential errors
- States app doesn't replace teachers
- Multi-language (FR, EN, AR)

### Contact Information
✅ **Easy to find**
- Email: contact@fisabil.fr
- Displayed in Settings
- Displayed in Privacy Policy
- Displayed in About screen

---

## 🌍 4. INTERNATIONALIZATION

### Supported Languages
✅ **7 languages total**
- French (FR) - default
- English (EN)
- Arabic (AR)
- German (DE)
- Spanish (ES)
- Russian (RU)
- Malay (MS)

### Critical Screens Translated
✅ **All compliance screens multilingual**
- Privacy Policy (FR, EN, AR minimum)
- About AI Tutor (FR, EN, AR minimum)
- Delete Account (FR, EN, AR minimum)
- Settings (all 7 languages)

---

## 📋 5. iOS SPECIFIC (App Store)

### Permissions with Descriptions
✅ **All permissions justified in Info.plist**
```xml
NSCameraUsageDescription: "Permet de scanner des textes arabes..."
NSMicrophoneUsageDescription: "Permet d'utiliser le microphone pour parler au tuteur vocal..."
NSSpeechRecognitionUsageDescription: "Permet de transcrire votre voix en texte arabe..."
NSPhotoLibraryUsageDescription: "Permet de sélectionner des images..."
NSPhotoLibraryAddUsageDescription: "Permet de sauvegarder les textes scannés..."
```

### Export Compliance
✅ **Encryption declaration**
```json
"config": {
  "usesNonExemptEncryption": false
}
```

### Dark Mode
✅ **Automatic dark mode support**
- `userInterfaceStyle: "automatic"` in app.json
- All screens support dark mode via `useColorScheme()`
- Privacy, About, Delete Account screens tested

---

## 🤖 6. ANDROID SPECIFIC (Google Play)

### Minimal Permissions
✅ **Only necessary permissions requested**
```json
"permissions": [
  "android.permission.RECORD_AUDIO",  // Voice tutor
  "android.permission.INTERNET",      // API calls
  "android.permission.CAMERA",        // OCR scanning
  "android.permission.READ_MEDIA_IMAGES" // Gallery access
]
```

### Target SDK
✅ **Modern Android support**
- minSdkVersion: 24 (Android 7.0)
- Edge-to-edge enabled
- Adaptive icon provided

---

## 🎨 7. USER EXPERIENCE

### Offline Handling
✅ **Graceful degradation**
- Network errors show user-friendly messages
- No app crashes when offline
- Fallback TTS to device speech when Edge Function unavailable
- Cached data accessible offline

### Error Messages
✅ **Clear, translated error messages**
- All errors in user's language
- No technical jargon
- Actionable information when possible

### App Information
✅ **Visible in Settings**
- App version: displayed from `Constants.expoConfig.version`
- Platform: iOS / Android auto-detected
- Contact email: visible
- Links to Privacy Policy, About AI

---

## 📝 8. STORE METADATA

### App Name
**Fisabil - Arabic Learning**

### Short Description (FR)
Apprenez l'arabe avec un tuteur IA : scannez des textes, pratiquez la prononciation et progressez avec des exercices personnalisés.

### Short Description (EN)
Learn Arabic with an AI tutor: scan texts, practice pronunciation, and progress with personalized exercises.

### Full Description (FR)
**Fisabil - Votre Compagnon d'Apprentissage de l'Arabe**

Fisabil révolutionne l'apprentissage de l'arabe en combinant intelligence artificielle et pédagogie interactive.

**🤖 TUTEUR IA INTELLIGENT**
Conversez en arabe avec un tuteur virtuel alimenté par GPT-4. Il vous pose des questions, corrige vos erreurs et s'adapte à votre niveau. Recevez des explications personnalisées et des encouragements tout au long de votre parcours.

**📸 SCANNER OCR ARABE**
Photographiez n'importe quel texte arabe (livre, panneau, article) et Fisabil l'extrait instantanément grâce à Google Vision OCR. Créez votre bibliothèque personnelle de textes pour étudier.

**🎤 PRONONCIATION & DICTÉES**
Pratiquez votre accent arabe avec la reconnaissance vocale. Faites des dictées interactives avec correction instantanée et synthèse vocale naturelle.

**📚 VOCABULAIRE INTELLIGENT**
Fisabil extrait automatiquement les mots-clés de vos textes et crée des cartes de révision avec traductions, racines et formes verbales. Système de répétition espacée pour mémoriser durablement.

**🎧 MODE AUDIO**
Écoutez vos textes en arabe avec une voix naturelle pendant vos trajets. Créez des playlists personnalisées pour l'immersion quotidienne.

**🌍 MULTILINGUE**
Interface disponible en français, anglais, arabe, allemand, espagnol, russe et malais.

**💎 ABONNEMENT PREMIUM**
• Tuteur IA illimité
• Scanner OCR sans limite
• Dictées illimitées
• Support prioritaire

**🔒 CONFIDENTIALITÉ**
Vos données sont protégées et jamais vendues. Consulter notre politique de confidentialité complète dans l'app.

**ℹ️ TRANSPARENCE IA**
Fisabil utilise OpenAI GPT-4 pour le tuteur virtuel et Google Vision pour l'OCR. Les réponses de l'IA sont générées automatiquement et peuvent contenir des erreurs. L'application ne remplace pas un enseignant professionnel.

**📧 CONTACT**
contact@fisabil.fr | www.fisabil.fr

### Full Description (EN)
**Fisabil - Your Arabic Learning Companion**

Fisabil revolutionizes Arabic learning by combining artificial intelligence and interactive pedagogy.

**🤖 INTELLIGENT AI TUTOR**
Converse in Arabic with a virtual tutor powered by GPT-4. It asks you questions, corrects your mistakes, and adapts to your level. Receive personalized explanations and encouragement throughout your journey.

**📸 ARABIC OCR SCANNER**
Photograph any Arabic text (book, sign, article) and Fisabil extracts it instantly using Google Vision OCR. Build your personal library of texts to study.

**🎤 PRONUNCIATION & DICTATIONS**
Practice your Arabic accent with voice recognition. Do interactive dictations with instant correction and natural text-to-speech.

**📚 SMART VOCABULARY**
Fisabil automatically extracts keywords from your texts and creates flashcards with translations, roots, and verb forms. Spaced repetition system for lasting memorization.

**🎧 AUDIO MODE**
Listen to your Arabic texts with a natural voice during your commutes. Create personalized playlists for daily immersion.

**🌍 MULTILINGUAL**
Interface available in French, English, Arabic, German, Spanish, Russian, and Malay.

**💎 PREMIUM SUBSCRIPTION**
• Unlimited AI tutor
• Unlimited OCR scanner
• Unlimited dictations
• Priority support

**🔒 PRIVACY**
Your data is protected and never sold. View our complete privacy policy in the app.

**ℹ️ AI TRANSPARENCY**
Fisabil uses OpenAI GPT-4 for the virtual tutor and Google Vision for OCR. AI responses are automatically generated and may contain errors. The application does not replace a professional teacher.

**📧 CONTACT**
contact@fisabil.fr | www.fisabil.fr

### Keywords (Both Stores)
arabic, learning, tutor, ai, ocr, scanner, vocabulary, flashcards, pronunciation, dictation, gpt, education, language

### Category
**Education**

### Age Rating
**4+** (Everyone)

---

## 🔍 9. AI DISCLOSURE (REQUIRED BY BOTH STORES)

### For App Store Connect
**Question: "Does your app use AI?"**
✅ **YES**

**AI Features:**
1. **AI Tutor** - Uses OpenAI GPT-4 to generate educational content and have conversations with learners
2. **Text-to-Speech** - Uses OpenAI TTS to generate natural Arabic pronunciation
3. **OCR** - Uses Google Cloud Vision API to extract Arabic text from images

**Data Processing:**
- User messages are sent to OpenAI API via secure Supabase Edge Functions
- Images are sent to Google Vision API for text extraction
- No user data is used to train AI models
- Processing complies with OpenAI and Google privacy policies

**Transparency:**
- "About the AI Tutor" screen explains AI usage
- Privacy Policy discloses third-party AI services
- Users informed that AI responses may contain errors

### For Google Play Console
**Question: "Does your app use AI-generated content?"**
✅ **YES**

**AI-Generated Content Types:**
- Text responses from virtual tutor
- Spoken audio for pronunciation
- Educational questions and corrections

**Third-Party AI Services:**
- OpenAI GPT-4 (tutor responses)
- OpenAI TTS (text-to-speech)
- Google Cloud Vision (OCR)

**User Disclosure:**
- Visible "About the AI Tutor" section in Settings
- Clear warning that AI may produce errors
- Privacy Policy lists all AI services used

---

## 📤 10. REVIEW NOTES FOR APPLE

**To App Review Team:**

This application helps users learn Arabic through AI-assisted education.

**AI IMPLEMENTATION:**
We use OpenAI GPT-4 API for the virtual tutor feature. For security, all OpenAI API calls are made server-side via Supabase Edge Functions (Deno runtime). The mobile app never directly calls OpenAI - it only invokes our Edge Functions.

**Edge Functions (server-side):**
- `tutor-chat-ai` - Generates educational responses
- `tutor-realtime` - Real-time voice conversations
- `tts-generate` - Text-to-speech generation

**Client-side code:**
- Uses `invokeEdge('function-name', params)` helper
- No OpenAI API keys in the app
- No direct api.openai.com calls

**OCR Feature:**
Google Vision API is called client-side for image-to-text conversion. The API key is restricted in Google Cloud Console to our bundle ID.

**Account Deletion:**
Users can delete their account in-app via Settings → Delete my account. This permanently removes all user data from our Supabase database and signs them out.

**Privacy:**
Full privacy policy available at https://fisabil.fr/privacy and in-app.

**Test Account:**
Email: reviewer@fisabil.fr
Password: TestReview2026!

Please feel free to contact us at contact@fisabil.fr for any questions.

---

## ✅ FINAL CHECKLIST

### Before Submission
- [x] Account deletion feature tested
- [x] Privacy Policy uploaded to https://fisabil.fr/privacy
- [x] No API keys in source code
- [x] All OpenAI calls via Edge Functions
- [x] Dark mode tested
- [x] Offline mode tested (no crashes)
- [x] All permissions justified
- [x] Screenshots prepared (iPhone, iPad, Android)
- [x] App icons ready (1024x1024)
- [x] Metadata translated (FR + EN minimum)
- [x] Test account created for reviewers

### Post-Submission Monitoring
- [ ] Monitor crash reports (Sentry/Crashlytics)
- [ ] Check review feedback
- [ ] Respond to questions within 24h
- [ ] Prepare for potential rejections:
  - AI transparency → show About AI screen
  - Account deletion → show delete-account.tsx implementation
  - Privacy → provide https://fisabil.fr/privacy URL

---

## 📞 SUPPORT

**Questions?**
Email: contact@fisabil.fr
Website: www.fisabil.fr

**Apple App Store:**
https://developer.apple.com/contact/app-store/

**Google Play Console:**
https://support.google.com/googleplay/android-developer/

---

**Document last updated:** 9 février 2026
**Maintained by:** Fisabil Development Team
