# GUIDE DE TEST - DISCUSSION TUTEUR

## 🔴 PROBLÈME PRINCIPAL
L'utilisateur signale: "Je n'ai pas de discussion écrite ni orale en temps réel avec le tuteur"

## ✅ CE QUI A ÉTÉ FAIT
1. **Créé hook `useTutor`**: Gère la logique des messages avec:
   - Ajout message user
   - Attendre 800-1500ms
   - Générer réponse tuteur
   - Afficher réponse

2. **Créé hook `useSpeech`**: Gère:
   - ✅ Synthèse vocale (tuteur parle)
   - ⚠️ Enregistrement (mic OK, mais pas transcription)

3. **Créé écran Tutor** avec:
   - Mode TEXTE (📝): Taper + bouton 📤
   - Mode VOCAL (🎤): Micro + automatique speak

## 🧪 TEST ÉTAPE PAR ÉTAPE

### Test 1: Mode TEXTE (doit marcher)
```
1. Ouvrir Expo Go
2. Scanner QR code dans terminal
3. Aller à l'onglet Tuteur (👨‍🏫)
4. S'assurer qu'on est en mode 📝 (pas 🎤)
5. Taper: "مرحبا"
6. Appuyer sur 📤
7. VÉRIFIER:
   ✅ Message "مرحبا" apparaît en BLEU à DROITE
   ✅ Après 1-2 secondes, réponse grise à GAUCHE
   ✅ Indicateur "المعلم يكتب..." s'affiche pendant réponse
```

### Test 2: Mode VOCAL (synthèse vocale)
```
1. Rester en mode Texte d'abord
2. Envoyer: "السلام عليكم"
3. Tuteur doit PARLER sa réponse (son)
   ✅ Si vous entendez du son: synthèse vocale marche!
   ❌ Si pas de son: problème avec expo-speech
```

### Test 3: Mode VOCAL (enregistrement)
```
1. Appuyer sur 🎤 en haut
2. Appuyer sur 🎤 grand bouton
3. PARLER pendant 3 secondes
4. Appuyer sur ⏹️ pour arrêter
5. VÉRIFIER:
   ⚠️ Texte sera "أنا أتعلم اللغة العربية" (simulé)
   ✅ Tuteur doit répondre
   ✅ Tuteur doit PARLER sa réponse
```

## 🔍 LOGS À VÉRIFIER

Si ça ne marche pas, cherchez ces logs dans Expo:
```
✅ Si vous voyez: "📤 Sending message:"
   → Le hook useTutor reçoit le message

✅ Si vous voyez: "🤖 Tutor response:"
   → La réponse a été générée

❌ Si vous NE voyez PAS ces logs
   → Vérifier la console du navigateur Expo Go
   → Appuyer sur "j" dans terminal pour ouvrir debugger
```

## 🆘 SI RIEN NE MARCHE

Les problèmes potentiels:

| Problème | Solution |
|----------|----------|
| Messages n'apparaissent pas | Vérifier ScrollView, recharger app (r) |
| Pas de son | Vérifier volume, expo-speech installé |
| App crash | Vérifier erreurs dans console Expo |
| Transcription vide | C'est NORMAL - pas encore implémentée |

## 🎯 PRIORITÉS

1. **URGENT**: Tester mode TEXTE
   - Si ✅: Pas de problème avec le hook/composant
   - Si ❌: Debugging UI/state

2. **IMPORTANT**: Tester son synthèse
   - Si ✅: expo-speech marche
   - Si ❌: Besoin de reconfigurer audio

3. **OPTIONNEL**: Ajouter vraie transcription vocale
   - Nécessite API Google/Azure/OpenAI
   - Ou custom dev build avec native modules
