# 📱 Guide Complet de Test et Déploiement

## ✅ Application Lancée!

L'app Expo est maintenant en cours d'exécution sur **http://localhost:8081**

### Accédez à l'app:

```bash
# Option 1: Web (dans votre navigateur)
http://localhost:8081

# Option 2: Expo Go (sur votre téléphone)
# Scannez le QR code affiché dans le terminal

# Option 3: iOS Simulator
# Tapez 'i' dans le terminal
```

---

## 🧪 Tests Sans Déploiement (Fonctionne Déjà!)

L'app utilise du **mock data** quand les Edge Functions ne sont pas disponibles.

### Testé Localement:

✅ **Authentification (Login/Signup)**
```
1. Cliquez sur "Connexion" ↔️ "S'inscrire"
2. Entrez email + mot de passe
3. Cliquez "Se connecter"
```

✅ **Scanner de Texte**
```
1. Onglet "Scanner"
2. Entrez un titre
3. Cliquez "Photo" ou "Galerie"
4. Cliquez "📖 Faire l'OCR"
5. Cliquez "🔤 Ajouter voyelles" ← NOUVEAU!
6. Les voyelles arabes sont ajoutées automatiquement
7. Cliquez "✅ Valider & Sauvegarder"
```

✅ **Bibliothèque**
```
1. Onglet "Bibliothèque"
2. Voir tous vos textes scannés
3. Cliquez sur un texte pour voir les détails
4. Cliquez "🧠 Générer vocabulaire (IA)"
5. Le vocabulaire s'affiche (mock data pour maintenant)
```

---

## 🚀 Déploiement sur Supabase (Optionnel)

Pour utiliser les **vraies données d'IA** au lieu du mock:

### Étape 1: Installer Supabase CLI

**macOS (Homebrew):**
```bash
brew install supabase/tap/supabase
```

**Autres systèmes:**
Voir: https://supabase.com/docs/guides/cli/getting-started

### Étape 2: Se Connecter

```bash
supabase login
```

Cela ouvrira une page web pour vous connecter à Supabase.

### Étape 3: Lier le Projet

```bash
supabase link --project-ref lluabltdmlprrwggwhlq
```

### Étape 4: Déployer les Functions

**Option A: Script automatisé (Recommandé)**
```bash
chmod +x deploy-functions.sh
./deploy-functions.sh
```

**Option B: Déployer manuellement**
```bash
supabase functions deploy extract-vocab
supabase functions deploy add-diacritics
```

### Étape 5: Vérifier le Déploiement

```bash
supabase functions list
```

Vous devriez voir:
```
extract-vocab       ✓
add-diacritics      ✓
```

---

## 🔍 Tester les Edge Functions

Une fois déployées, testez-les:

### Test 1: Extraction de Vocabulaire

```bash
curl -X POST \
  https://lluabltdmlprrwggwhlq.supabase.co/functions/v1/extract-vocab \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"scan_id":"test","ui_lang":"fr"}'
```

### Test 2: Ajout de Diacritiques

```bash
curl -X POST \
  https://lluabltdmlprrwggwhlq.supabase.co/functions/v1/add-diacritics \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"text":"مدرسة","language":"ar"}'
```

---

## 📊 État du Système

| Composant | État | Notes |
|-----------|------|-------|
| **App Expo** | ✅ Lancée | http://localhost:8081 |
| **Authentification** | ✅ Fonctionnelle | Login/Signup/Logout |
| **Scanner OCR** | ✅ Demo | Mock data |
| **Ajouter Voyelles** | ✅ Fonctionnel | Algorithme local |
| **Vocabulaire IA** | ⚠️ Mock | Prêt à déployer |
| **Edge Functions** | 📋 Non déployées | Voir étapes de déploiement |

---

## 🛠️ Dossiers Créés

```
supabase/functions/
├── extract-vocab/          ← Extraction du vocabulaire arabe
│   └── index.ts
└── add-diacritics/         ← Ajout des voyelles arabes
    └── index.ts

hooks/
└── use-diacritics.ts       ← Hook React pour les diacritiques

app/(tabs)/
└── index.tsx               ← Scanner amélioré avec voyelles
```

---

## ❓ FAQ

**Q: Pourquoi mock data?**
A: Les Edge Functions doivent être déployées sur Supabase. Voir "Déploiement".

**Q: Les voyelles fonctionnent sans déploiement?**
A: Oui! L'algorithme local fonctionne offline. Le déploiement ajoute des données d'IA plus précises.

**Q: Comment tester sans Expo Go?**
A: Tapez `w` dans le terminal pour ouvrir la version Web.

**Q: L'app plante?**
A: Faites `npx expo start --clear` pour nettoyer le cache.

---

## 📞 Support

Pour toute question sur:
- **Supabase**: https://supabase.com/docs
- **Expo**: https://docs.expo.dev
- **Edge Functions**: https://supabase.com/docs/guides/functions

Bon développement! 🚀
