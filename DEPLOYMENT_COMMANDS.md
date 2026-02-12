# 🚀 COMMANDES DÉPLOIEMENT EDGE FUNCTIONS

## ✅ PRÉ-REQUIS

1. **Supabase CLI installé** :
```bash
# Vérifier installation
supabase --version

# Si non installé :
brew install supabase/tap/supabase
```

2. **Supabase project lié** :
```bash
# Lier au projet (si pas déjà fait)
supabase link --project-ref <your-project-ref>

# Vérifier
supabase status
```

---

## 🔐 ÉTAPE 1 : CONFIGURER SECRETS

### Via Dashboard Supabase (RECOMMANDÉ)

1. Aller sur : https://supabase.com/dashboard/project/YOUR_PROJECT_ID/settings/functions
2. Cliquer "Edge Function Secrets"
3. Ajouter :
   - Nom : `OPENAI_API_KEY`
   - Valeur : `sk-proj-your-openai-key-here`
4. Sauvegarder

### Via CLI (Alternative)

```bash
# Set OpenAI API key
supabase secrets set OPENAI_API_KEY=sk-proj-your-key-here

# Vérifier (affiche les noms uniquement, pas les valeurs)
supabase secrets list
```

---

## 📦 ÉTAPE 2 : DÉPLOYER LES FUNCTIONS

### Déployer toutes les nouvelles Edge Functions

```bash
# 1. TTS Generate
supabase functions deploy tts-generate

# 2. Speech-to-Text
supabase functions deploy speech-to-text

# 3. Tutor Chat AI
supabase functions deploy tutor-chat-ai

# 4. Generate Dictation
supabase functions deploy generate-dictation

# 5. Generate Exercises
supabase functions deploy generate-exercises

# Optionnel : Redéployer extract-vocab si modifiée
supabase functions deploy extract-vocab
```

### Déployer toutes en une commande

```bash
# Déployer toutes les functions d'un coup
for func in tts-generate speech-to-text tutor-chat-ai generate-dictation generate-exercises; do
  echo "📦 Deploying $func..."
  supabase functions deploy $func
done
```

---

## 🧪 ÉTAPE 3 : TESTER LES FUNCTIONS

### Test TTS Generate

```bash
supabase functions invoke tts-generate \
  --body '{
    "text": "مرحبا بك في فصبل",
    "voice": "alloy",
    "format": "mp3"
  }'
```

**Réponse attendue** :
```json
{
  "audioBase64": "SUQzBAAAAAAAI1RTU0UAAAA...",
  "format": "mp3",
  "size": 12345
}
```

### Test Speech-to-Text

```bash
# Préparer un fichier audio en base64
BASE64_AUDIO=$(base64 -i test-audio.webm)

supabase functions invoke speech-to-text \
  --body "{
    \"audioBase64\": \"$BASE64_AUDIO\",
    \"language\": \"ar\"
  }"
```

**Réponse attendue** :
```json
{
  "text": "مرحبا",
  "language": "ar"
}
```

### Test Tutor Chat AI

```bash
supabase functions invoke tutor-chat-ai \
  --body '{
    "messages": [
      {"role": "user", "content": "مرحبا، كيف حالك؟"}
    ],
    "language": "ar"
  }'
```

**Réponse attendue** :
```json
{
  "message": "مرحبا! أنا بخير، شكراً. كيف يمكنني مساعدتك اليوم؟",
  "usage": { "total_tokens": 45 }
}
```

### Test Generate Dictation

```bash
supabase functions invoke generate-dictation \
  --body '{
    "difficulty": "intermediate",
    "length": 3
  }'
```

**Réponse attendue** :
```json
{
  "text": "الجملة الأولى...\nالجملة الثانية...\nالجملة الثالثة...",
  "difficulty": "intermediate"
}
```

### Test Generate Exercises

```bash
supabase functions invoke generate-exercises \
  --body '{
    "vocabList": ["كتاب", "قلم", "مدرسة"],
    "difficulty": "beginner",
    "count": 3
  }'
```

**Réponse attendue** :
```json
{
  "exercises": [
    {
      "question": "ما هو الترجمة الصحيحة لكلمة 'كتاب'؟",
      "options": ["livre", "stylo", "école", "maison"],
      "correct": 0,
      "explanation": "كتاب يعني livre بالفرنسية"
    }
  ],
  "difficulty": "beginner"
}
```

---

## 📊 ÉTAPE 4 : MONITORING

### Voir les logs en temps réel

```bash
# Logs pour une function spécifique
supabase functions logs tts-generate

# Avec auto-refresh
supabase functions logs tts-generate --follow
```

### Statistiques d'utilisation

Dashboard Supabase > Edge Functions > Analytics :
- Nombre d'invocations
- Temps d'exécution moyen
- Taux d'erreur
- Coûts

---

## ⚠️ ÉTAPE 5 : ROLLBACK (SI NÉCESSAIRE)

### Revenir à une version précédente

```bash
# Lister les versions
supabase functions list

# Rollback vers version spécifique
supabase functions deploy tts-generate --version <previous-version-id>
```

---

## 🔍 ÉTAPE 6 : VALIDATION FINALE

### Vérifier que toutes les functions sont déployées

```bash
# Lister toutes les functions
supabase functions list

# Doit afficher :
# - tts-generate
# - speech-to-text
# - tutor-chat-ai
# - generate-dictation
# - generate-exercises
# - extract-vocab (déjà existante)
```

### Vérifier les secrets

```bash
# Afficher les secrets configurés
supabase secrets list

# Doit afficher :
# - OPENAI_API_KEY
# - SUPABASE_URL (auto)
# - SUPABASE_SERVICE_ROLE_KEY (auto)
```

---

## 📝 CHECKLIST FINALE

- [ ] Supabase CLI installé et configuré
- [ ] Project lié (`supabase link`)
- [ ] Secret `OPENAI_API_KEY` configuré
- [ ] Function `tts-generate` déployée ✅
- [ ] Function `speech-to-text` déployée ✅
- [ ] Function `tutor-chat-ai` déployée ✅
- [ ] Function `generate-dictation` déployée ✅
- [ ] Function `generate-exercises` déployée ✅
- [ ] Test TTS réussi ✅
- [ ] Test STT réussi ✅
- [ ] Test Chat réussi ✅
- [ ] Test Dictation réussi ✅
- [ ] Test Exercises réussi ✅
- [ ] Logs accessibles ✅

---

## 🎯 RÉSULTAT

Après ces étapes, toutes les Edge Functions sont :
- ✅ Déployées en production
- ✅ Sécurisées (auth requise)
- ✅ Configurées avec clé OpenAI server-side
- ✅ Prêtes à être utilisées par l'app mobile

**Prochaine étape** : Migrer le code client pour utiliser ces functions (voir `MIGRATION_GUIDE.md`)

---

**Commandes rapides de référence** :

```bash
# Déployer tout
for func in tts-generate speech-to-text tutor-chat-ai generate-dictation generate-exercises; do
  supabase functions deploy $func
done

# Voir logs
supabase functions logs tts-generate --follow

# Tester TTS
supabase functions invoke tts-generate --body '{"text":"test","voice":"alloy"}'

# Lister functions
supabase functions list

# Lister secrets
supabase secrets list
```
