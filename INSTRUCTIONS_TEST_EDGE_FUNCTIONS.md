# 🧪 Instructions pour tester les Edge Functions

## Option 1 : Obtenir le JWT depuis l'app mobile (RECOMMANDÉ)

Le code de log JWT est déjà en place dans `src/lib/supabase.ts`.

### Étapes :

1. **Lancer l'app** :
   ```bash
   npx expo start
   ```

2. **Ouvrir dans le simulateur** :
   - Appuyer sur `i` (iOS) ou `a` (Android)

3. **Se connecter avec un compte existant**

4. **Récupérer le JWT dans les logs Metro** :
   - Chercher le bloc :
   ```
   🔑 ═══ JWT TOKEN FOR EDGE FUNCTION TEST ═══
   User ID: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
   Access Token: eyJhbG...très_long_token...
   ═══════════════════════════════════════════
   ```

5. **Copier le Access Token** et le sauvegarder dans `/tmp/fisabil-test-jwt.json` :
   ```bash
   echo '{"jwt":"eyJhbG...VOTRE_TOKEN...","userId":"VOTRE_USER_ID"}' > /tmp/fisabil-test-jwt.json
   ```

6. **Lancer les tests** :
   ```bash
   ./test-edge-functions.sh
   ```

---

## Option 2 : Se connecter avec des credentials existants

Si vous avez déjà un compte dans la base de données :

```bash
node get-test-jwt.mjs votre-email@example.com votre-mot-de-passe
```

Puis lancer les tests :
```bash
./test-edge-functions.sh
```

---

## Option 3 : Test manuel avec curl

Remplacez `YOUR_JWT_TOKEN` par votre token obtenu via Option 1 ou 2 :

```bash
# Test tutor-chat-ai
curl -X POST \
  "https://lluabltdmlprrwggwhlq.supabase.co/functions/v1/tutor-chat-ai" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"مرحبا"}],"language":"ar"}'

# Test tts-generate
curl -X POST \
  "https://lluabltdmlprrwggwhlq.supabase.co/functions/v1/tts-generate" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"text":"مرحبا بك في فصبل","voice":"alloy","format":"mp3"}'

# Test generate-dictation
curl -X POST \
  "https://lluabltdmlprrwggwhlq.supabase.co/functions/v1/generate-dictation" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"difficulty":"intermediate","length":3}'

# Test generate-exercises
curl -X POST \
  "https://lluabltdmlprrwggwhlq.supabase.co/functions/v1/generate-exercises" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"vocabList":["كتاب","قلم"],"difficulty":"beginner","count":2}'
```

---

## ⚠️ Nettoyage après les tests

Supprimer les fichiers temporaires et le log JWT :

```bash
rm -f /tmp/fisabil-test-jwt.json
rm -f test-get-jwt.js
rm -f get-test-jwt.mjs
rm -f create-test-user.mjs
rm -f test-edge-functions.sh
```

Retirer le log JWT de `src/lib/supabase.ts` (lignes ajoutées temporairement).

---

## ✅ Edge Functions déployées

Toutes les fonctions suivantes sont déployées et protégées par auth :

- ✅ `tutor-chat-ai` - Chat GPT-4 tuteur arabe
- ✅ `tts-generate` - Text-to-Speech OpenAI
- ✅ `speech-to-text` - Whisper STT
- ✅ `generate-dictation` - Génération dictées
- ✅ `generate-exercises` - Génération exercices
- ✅ `extract-vocab` - Extraction vocabulaire (existe déjà)

URL base : `https://lluabltdmlprrwggwhlq.supabase.co/functions/v1/`
