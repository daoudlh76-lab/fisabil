# 🎯 Flow du Tuteur Vocal - Diagramme Simplifié

**Architecture optimale** : Audio local + IA serveur

---

## 📱 Flow complet d'une session de tuteur vocal

```
┌──────────────────────────────────────────────────────────────────┐
│                         UTILISATEUR                               │
│                 Sélectionne un texte scanné                       │
│                 Appuie sur "Démarrer le tuteur"                   │
└───────────────────────────┬──────────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────────┐
│                   INITIALISATION (1 fois)                         │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  📚 Hook: loadUserTexts()                                        │
│     └─ Supabase: SELECT * FROM scans WHERE user_id = ...        │
│                                                                   │
│  📖 Hook: loadLearnerWords()                                     │
│     └─ Supabase: SELECT * FROM ai_cache WHERE key LIKE 'ai_vocab_%' │
│     └─ Résultat: "كِتَابٌ (livre)، قَلَمٌ (stylo)، ..."         │
│                                                                   │
│  🔊 TTS Local: "السَّلَامُ عَلَيْكُمْ!"                          │
│                                                                   │
│  ☁️  Edge Function: generate-questions                           │
│     ┌──────────────────────────────────────────────┐            │
│     │ POST /functions/v1/generate-questions        │            │
│     │ {                                             │            │
│     │   textId: "uuid-123",                         │            │
│     │   title: "العلم والعمل",                      │            │
│     │   content: "العلم نور...",                    │            │
│     │   vocabSummary: "كِتَابٌ (livre)، ..."       │            │
│     │ }                                             │            │
│     └──────────────┬───────────────────────────────┘            │
│                    │                                             │
│                    ▼                                             │
│     ┌──────────────────────────────────────────────┐            │
│     │ Response:                                     │            │
│     │ {                                             │            │
│     │   questions: [                                │            │
│     │     "مَا مَوضُوعُ النَّصِّ؟",                 │            │
│     │     "مَنِ المُؤَلِّفُ؟",                      │            │
│     │     ... (15-20 questions)                     │            │
│     │   ],                                          │            │
│     │   summary: "يَتَحَدَّثُ النَّصُّ عَنْ..."     │            │
│     │ }                                             │            │
│     └──────────────┬───────────────────────────────┘            │
│                    │                                             │
│                    ▼                                             │
│  💾 Cache: questionsCacheRef.current[textId] = questions        │
│                                                                   │
│  🔊 TTS Local: Lit le résumé                                     │
│                                                                   │
└───────────────────────────┬──────────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────────┐
│              QUESTION 1/20 (répété 20 fois)                       │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  🔊 TTS Local: "السُّؤَالُ ١/٢٠: مَا مَوضُوعُ النَّصِّ؟"        │
│                                                                   │
│  🎤 Micro s'active (expo-speech-recognition)                     │
│     ┌──────────────────────────────────────────────┐            │
│     │ Speech Recognition (LOCAL iOS/Android)       │            │
│     │ Lang: ar-SA                                   │            │
│     │ Continuous: false                             │            │
│     └──────────────┬───────────────────────────────┘            │
│                    │                                             │
│                    ▼                                             │
│  👤 Utilisateur parle: "يَتَحَدَّثُ النَّصُّ عَنِ العِلْمِ..."  │
│                    │                                             │
│                    ▼                                             │
│  📝 Event 'result': { transcript: "يَتَحَدَّثُ..." }            │
│  📝 Event 'end': Reconnaissance terminée                         │
│                    │                                             │
│                    ▼                                             │
│  ☁️  Edge Function: evaluate-answer                              │
│     ┌──────────────────────────────────────────────┐            │
│     │ POST /functions/v1/evaluate-answer           │            │
│     │ {                                             │            │
│     │   question: "مَا مَوضُوعُ النَّصِّ؟",         │            │
│     │   studentAnswer: "يَتَحَدَّثُ النَّصُّ عَنِ العِلْمِ...", │            │
│     │   textContext: "العلم نور... (500 chars)",   │            │
│     │   vocabSummary: "كِتَابٌ (livre)، ..."       │            │
│     │ }                                             │            │
│     └──────────────┬───────────────────────────────┘            │
│                    │                                             │
│                    ▼                                             │
│     ┌──────────────────────────────────────────────┐            │
│     │ Response:                                     │            │
│     │ {                                             │            │
│     │   correction: "أَحْسَنْتَ! الإِجَابَةُ صَحِيحَةٌ. العِلْمُ نُورٌ..." │            │
│     │ }                                             │            │
│     └──────────────┬───────────────────────────────┘            │
│                    │                                             │
│                    ▼                                             │
│  🔊 TTS Local: Lit la correction                                │
│                                                                   │
│  ⏭️  Auto-chain: askPreparedQuestion(textId) → Question 2/20    │
│                                                                   │
└───────────────────────────┬──────────────────────────────────────┘
                            │
                            ▼
                    [Répéter 19 fois]
                            │
                            ▼
┌──────────────────────────────────────────────────────────────────┐
│                      FIN DE SESSION                               │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  📊 questionCount = 20                                           │
│  📋 Cache vide                                                   │
│                                                                   │
│  🔊 TTS Local: "أَحْسَنْتَ! لَقَدْ أَجَبْتَ عَلَى ٢٠ أَسْئِلَةٍ. بَارَكَ ٱللّٰهُ فِيكَ!" │
│                                                                   │
│  🔌 disconnect()                                                 │
│     └─ Stop speech recognition                                   │
│     └─ Stop TTS                                                  │
│     └─ Reset state                                               │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
```

---

## 🔄 Flow alternatif : Mode conversationnel

Si l'utilisateur veut poser une question libre (hors questions pré-générées) :

```
┌──────────────────────────────────────────────────────────────────┐
│                 MODE CONVERSATIONNEL                              │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  🎤 Utilisateur parle: "شَرِحْ لِي مَعْنَى كَلِمَةِ العِلْمِ"    │
│     ↓                                                             │
│  📝 Transcription locale: "شَرِحْ لِي مَعْنَى..."                │
│     ↓                                                             │
│  ☁️  Edge Function: tutor-chat-ai                                │
│     ┌──────────────────────────────────────────────┐            │
│     │ POST /functions/v1/tutor-chat-ai             │            │
│     │ {                                             │            │
│     │   messages: [                                 │            │
│     │     { role: 'system', content: "أنت أستاذ..." }, │         │
│     │     { role: 'user', content: "شَرِحْ لِي..." } │          │
│     │   ],                                          │            │
│     │   max_tokens: 500,                            │            │
│     │   language: 'ar'                              │            │
│     │ }                                             │            │
│     └──────────────┬───────────────────────────────┘            │
│                    │                                             │
│                    ▼                                             │
│     ┌──────────────────────────────────────────────┐            │
│     │ Response:                                     │            │
│     │ {                                             │            │
│     │   content: "العِلْمُ هُوَ المَعْرِفَةُ وَالفَهْمُ..." │      │
│     │ }                                             │            │
│     └──────────────┬───────────────────────────────┘            │
│                    │                                             │
│                    ▼                                             │
│  🔊 TTS Local: Lit la réponse                                    │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
```

---

## ⚡ Latence par étape

| Étape | Composant | Latence | Type |
|-------|-----------|---------|------|
| 🔊 TTS | expo-speech | **<100ms** | ✅ Local |
| 🎤 Transcription | expo-speech-recognition | **<100ms** | ✅ Local |
| ☁️ Generate questions | Edge Function → OpenAI | ~2-3s | ☁️ Cloud |
| ☁️ Evaluate answer | Edge Function → OpenAI | ~1-2s | ☁️ Cloud |
| ☁️ Chat conversationnel | Edge Function → OpenAI | ~1-2s | ☁️ Cloud |

**Latence totale par question** : TTS (0.1s) + Transcription (0.1s) + Correction (1.5s) + TTS (0.1s) = **~1.8s**

**Expérience utilisateur** : Ultra fluide 🚀

---

## 💰 Coût par session (20 questions)

| Appel | Fréquence | Tokens | Coût unitaire | Total |
|-------|-----------|--------|---------------|-------|
| **Generate questions** | 1× | ~1000 | $0.008 | $0.008 |
| **Evaluate answer** | 20× | ~100 | $0.001 | $0.020 |
| **TOTAL** | - | - | - | **$0.028** |

**TTS + Transcription** = **$0** (100% local)

---

## 🔐 Sécurité

### ❌ Architecture actuelle (à corriger)

```
┌─────────────────────┐
│   App Mobile        │
│  ┌───────────────┐  │
│  │ OPENAI_API_KEY│  │ ← ❌ Exposée dans le bundle JS
│  └───────────────┘  │
│         │            │
│         ▼            │
│  fetch('openai.com')│ ← ❌ Appel direct depuis le client
└─────────────────────┘
```

**Risque** : Clé extractible → utilisation frauduleuse → coûts incontrôlables

---

### ✅ Architecture recommandée (sécurisée)

```
┌─────────────────────┐
│   App Mobile        │
│  (PAS de clé API)   │
│         │            │
│         ▼            │
│  invokeEdge(...)    │
└─────────┬───────────┘
          │
          │ HTTPS
          ▼
┌─────────────────────┐
│  Supabase Edge Fn   │
│  ┌───────────────┐  │
│  │ OPENAI_API_KEY│  │ ← ✅ Sécurisée (server-side)
│  └───────────────┘  │
│         │            │
│         ▼            │
│  fetch('openai.com')│
└─────────────────────┘
```

**Résultat** : Clé protégée + coûts contrôlés ✅

---

## 📊 Comparaison architectures

| Aspect | Actuelle (❌) | Recommandée (✅) |
|--------|--------------|------------------|
| **Clé OpenAI** | Client-side (exposée) | Server-side (protégée) |
| **Appels IA** | 4× directs OpenAI | 2× Edge Functions |
| **Transcription** | Local (expo-speech-recognition) | Local (inchangé) |
| **TTS** | Local (expo-speech) | Local (inchangé) |
| **Coût par session** | $0.028 | $0.028 (identique) |
| **Sécurité** | ❌ Vulnérable | ✅ Sécurisée |
| **Latence** | ~1.8s | ~1.8s (identique) |
| **Production-ready** | ❌ Non | ✅ Oui |

---

## 🎯 Checklist migration

### Phase 1 : Edge Functions
- [ ] Créer `generate-questions` Edge Function
- [ ] Créer `evaluate-answer` Edge Function
- [ ] Déployer sur Supabase
- [ ] Configurer secrets (OPENAI_API_KEY)
- [ ] Tester avec curl/Postman

### Phase 2 : Refactor hooks
- [ ] Renommer `use-chat-tutor.ts` → `use-voice-tutor.ts`
- [ ] Remplacer `generateQuestionsForText()` par `invokeEdge('generate-questions')`
- [ ] Remplacer `summarizeText()` (inclus dans generate-questions)
- [ ] Remplacer `evaluateAnswer()` par `invokeEdge('evaluate-answer')`
- [ ] Remplacer `sendMessageToGPT()` par `invokeEdge('tutor-chat-ai')`
- [ ] Supprimer `OPENAI_API_KEY` côté client

### Phase 3 : Tests
- [ ] Test unitaire : Edge Functions
- [ ] Test intégration : Flow complet (initialisation → 20 questions → fin)
- [ ] Test performance : Latence <2s par question
- [ ] Test erreurs : Gestion réseau, timeout, etc.

### Phase 4 : Production
- [ ] Build production (EAS)
- [ ] Vérifier bundle JS (aucune clé API)
- [ ] Test sur vrai appareil (iOS + Android)
- [ ] Soumission App Store / Play Store

---

## 🚀 Résultat final

### Avant (architecture actuelle)
```
Audio local ✅ + IA client-side ❌ = Risque sécurité
```

### Après (architecture recommandée)
```
Audio local ✅ + IA server-side ✅ = Production-ready 🎉
```

**Gain** :
- ✅ Même performance (latence identique)
- ✅ Même coût ($0.028 par session)
- ✅ Sécurité maximale (clé protégée)
- ✅ Prêt pour production (App Store + Play Store)

---

**Documentation complète** : Voir [ARCHITECTURE_ANALYSIS.md](ARCHITECTURE_ANALYSIS.md)
