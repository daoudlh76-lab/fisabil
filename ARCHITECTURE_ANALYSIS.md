# 🏗️ Analyse Architecture Tuteur Fisabil

**Date**: 2026-02-09
**Objectif**: Architecture optimale pour tuteur vocal avec Edge Function

---

## 📊 État actuel de l'architecture

### ❌ PROBLÈMES DÉTECTÉS

#### 1. `use-chat-tutor.ts` fait **4 appels directs OpenAI**

**Ligne 255** - `generateQuestionsForText()`:
```typescript
const resp = await fetch('https://api.openai.com/v1/chat/completions', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${OPENAI_API_KEY}` },
  // Génère 15-20 questions
});
```

**Ligne 330** - `summarizeText()`:
```typescript
const resp = await fetch('https://api.openai.com/v1/chat/completions', {
  // Résume le texte en 3-4 phrases
});
```

**Ligne 360** - `sendMessageToGPT()`:
```typescript
const response = await fetch('https://api.openai.com/v1/chat/completions', {
  // Réponse conversationnelle générale
});
```

**Ligne 525** - `evaluateAnswer()`:
```typescript
const resp = await fetch('https://api.openai.com/v1/chat/completions', {
  // Corrige la réponse de l'étudiant
});
```

#### 2. Clé OpenAI exposée côté client

```typescript
const OPENAI_API_KEY = process.env.EXPO_PUBLIC_OPENAI_API_KEY || '';
```

⚠️ **RISQUE DE SÉCURITÉ** :
- Clé visible dans le bundle JavaScript
- Extractible via reverse engineering
- Utilisation frauduleuse possible
- Coûts incontrôlables

---

## 🎯 Architecture cible (recommandée)

### Principe : **Audio local + IA serveur**

```
┌─────────────────────────────────────────────────────────┐
│                 TUTEUR VOCAL COMPLET                     │
└─────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│ 1️⃣ DÉBUT SESSION (une fois)                              │
├──────────────────────────────────────────────────────────┤
│ ☁️  Edge Function: generate-questions                    │
│     Input: { textId, title, content, vocabSummary }     │
│     Output: { questions: string[], summary: string }    │
│     → Génère 15-20 questions + résumé                   │
│                                                          │
│ 🔊 TTS local: Lit le résumé (gratuit, instantané)       │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│ 2️⃣ POUR CHAQUE QUESTION (×15-20)                         │
├──────────────────────────────────────────────────────────┤
│ 🔊 TTS local: Lit la question (local, gratuit)          │
│                                                          │
│ 🎤 L'apprenant parle                                     │
│    ↓                                                     │
│ 📝 expo-speech-recognition: Transcription (local)        │
│    → Texte arabe transcrit                              │
│                                                          │
│ ☁️  Edge Function: evaluate-answer                       │
│     Input: { question, answer, textContext }            │
│     Output: { correction: string }                      │
│     → Corrige la réponse (grammaire + sens)             │
│                                                          │
│ 🔊 TTS local: Lit la correction (local, gratuit)        │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│ 3️⃣ MODE CONVERSATIONNEL (optionnel)                      │
├──────────────────────────────────────────────────────────┤
│ 🎤 Transcription locale                                  │
│    ↓                                                     │
│ ☁️  Edge Function: tutor-chat-ai                         │
│     Input: { messages[], systemPrompt, vocab }          │
│     Output: { content: string }                         │
│                                                          │
│ 🔊 TTS local: Lit la réponse                            │
└──────────────────────────────────────────────────────────┘
```

---

## 🔀 Comparaison architectures

### Architecture actuelle (❌ À corriger)

| Composant | Implémentation | Problème |
|-----------|----------------|----------|
| **Génération questions** | ❌ Appel direct OpenAI | Clé exposée |
| **Résumé texte** | ❌ Appel direct OpenAI | Clé exposée |
| **Correction réponse** | ❌ Appel direct OpenAI | Clé exposée |
| **Chat conversationnel** | ❌ Appel direct OpenAI | Clé exposée |
| **Transcription** | ✅ expo-speech-recognition (local) | OK |
| **TTS** | ✅ expo-speech (local) | OK |

**Coût par session** : ~$0.03 (mais clé exposée = risque infini)

---

### Architecture recommandée (✅ Sécurisée)

| Composant | Implémentation | Avantage |
|-----------|----------------|----------|
| **Génération questions** | ✅ Edge Function `generate-questions` | Clé sécurisée |
| **Résumé texte** | ✅ Edge Function `generate-questions` | Clé sécurisée |
| **Correction réponse** | ✅ Edge Function `evaluate-answer` | Clé sécurisée |
| **Chat conversationnel** | ✅ Edge Function `tutor-chat-ai` | Clé sécurisée |
| **Transcription** | ✅ expo-speech-recognition (local) | Gratuit, instantané |
| **TTS** | ✅ expo-speech (local) | Gratuit, instantané |

**Coût par session** : ~$0.03 (contrôlé, sécurisé)

---

## 📐 Edge Functions nécessaires

### 1. `generate-questions` (nouvelle)

**Payload** :
```typescript
{
  textId: string;
  title: string;
  content: string;
  vocabSummary: string; // Vocabulaire connu de l'apprenant
  uiLang: string;       // 'fr', 'en', etc.
}
```

**Réponse** :
```typescript
{
  questions: string[];  // 15-20 questions en arabe
  summary: string;      // Résumé 3-4 phrases
}
```

**Logique** :
- Appelle OpenAI GPT-4o-mini 2 fois (en parallèle):
  1. Génération questions (avec vocabulaire)
  2. Résumé du texte
- Retourne les deux résultats

---

### 2. `evaluate-answer` (nouvelle)

**Payload** :
```typescript
{
  question: string;
  studentAnswer: string;
  textContext: string;  // Extrait du texte (max 500 chars)
  vocabSummary?: string;
  uiLang: string;
}
```

**Réponse** :
```typescript
{
  correction: string; // Correction en arabe (2-3 phrases)
}
```

**Logique** :
- Appelle OpenAI GPT-4o-mini
- Prompt : correction grammaticale + sens + prononciation
- Limite : 150 tokens

---

### 3. `tutor-chat-ai` (✅ existe déjà)

**Payload** :
```typescript
{
  messages: ChatMessage[];
  max_tokens?: number;
  temperature?: number;
  language?: string;
}
```

**Réponse** :
```typescript
{
  content: string;
  modelUsed: string;
}
```

**Utilisation** : Mode conversationnel libre (pas de questions structurées)

---

## 🔄 Flow optimal du tuteur vocal

### **PHASE 1 : Initialisation (une fois)**

```
USER: Sélectionne un texte et démarre le tuteur
  ↓
HOOK: loadUserTexts() → charge depuis Supabase
HOOK: loadLearnerWords() → charge vocabulaire
  ↓
HOOK: connect()
  ├─ Speak (local): "السَّلَامُ عَلَيْكُمْ! سَنَدْرُسُ مَعًا نَصَّ..."
  ├─ Edge Function: generate-questions
  │   → { questions: [...], summary: "..." }
  ├─ Store: questionsCacheRef.current[textId] = questions
  └─ Speak (local): summary
  ↓
HOOK: askPreparedQuestion(textId) → démarre la première question
```

---

### **PHASE 2 : Question-Réponse (×15-20)**

```
HOOK: askPreparedQuestion(textId)
  ├─ Pop question from cache
  ├─ Speak (local): "السُّؤَالُ ١/٢٠: ..."
  └─ startListening() → active le micro
  ↓
USER: Parle en arabe
  ↓
SPEECH RECOGNITION (local, expo-speech-recognition)
  └─ Event 'result': { transcript: "..." }
  ↓
HOOK: evaluateAnswer(textId, question, transcript)
  ├─ Edge Function: evaluate-answer
  │   → { correction: "أَحْسَنْتَ! ..." }
  ├─ Speak (local): correction
  └─ Auto-chain: askPreparedQuestion(textId) → prochaine question
```

---

### **PHASE 3 : Fin de session**

```
HOOK: Plus de questions dans le cache
  ├─ Speak (local): "أَحْسَنْتَ! لَقَدْ أَجَبْتَ عَلَى ٢٠ أَسْئِلَةٍ..."
  └─ disconnect()
```

---

## 🆚 Fusionner ou séparer les hooks ?

### Option A : **Fusionner** `use-chat-tutor` + `use-tutor` ❌

**Avantages** :
- Un seul hook à maintenir
- Code centralisé

**Inconvénients** :
- ❌ Code complexe (audio + IA + state)
- ❌ Difficile à tester séparément
- ❌ Couplage fort entre audio et IA
- ❌ Difficulté à réutiliser dans d'autres contextes

---

### Option B : **Séparer** en 3 hooks ✅ (RECOMMANDÉ)

#### 1. `use-voice-tutor.ts` (nouveau nom pour `use-chat-tutor.ts`)

**Responsabilité** :
- 🎤 Gestion du microphone
- 🔊 TTS locale
- 📝 Transcription locale
- 🎛️ Orchestration du flow (questions → réponse → correction)
- 📋 Cache des questions

**N'appelle PAS directement OpenAI** → Utilise les Edge Functions

**Dépendances** :
```typescript
import { invokeEdge } from '@/src/lib/edge-ai';
import * as Speech from 'expo-speech';
import { ExpoSpeechRecognitionModule } from 'expo-speech-recognition';
```

---

#### 2. `use-tutor.ts` (✅ existe déjà)

**Responsabilité** :
- 💬 Chat textuel avec l'IA
- 📚 Injection vocabulaire
- 🗨️ Historique conversationnel
- ☁️ Appels Edge Function `tutor-chat-ai`

**Pas d'audio** → Texte uniquement

---

#### 3. `use-tutor-ai.ts` (nouveau - optionnel)

**Responsabilité** :
- 🧠 Wrapper pour tous les appels Edge Function IA
- 🔧 Gestion des erreurs IA
- 📊 Logging/analytics

**Fonctions** :
```typescript
export function useTutorAI() {
  const generateQuestions = async (textId, title, content, vocab) => {
    return invokeEdge('generate-questions', { textId, title, content, vocab });
  };

  const evaluateAnswer = async (question, answer, context) => {
    return invokeEdge('evaluate-answer', { question, answer, context });
  };

  const chatWithTutor = async (messages) => {
    return invokeEdge('tutor-chat-ai', { messages });
  };

  return { generateQuestions, evaluateAnswer, chatWithTutor };
}
```

---

## 🏆 Architecture finale recommandée

```
┌────────────────────────────────────────────────────────┐
│              APP MOBILE (React Native)                  │
├────────────────────────────────────────────────────────┤
│                                                         │
│  ┌──────────────────────────────────────────────┐     │
│  │  use-voice-tutor.ts                          │     │
│  │  ─────────────────────────────────           │     │
│  │  🎤 Microphone                                │     │
│  │  🔊 TTS locale (expo-speech)                 │     │
│  │  📝 Transcription (expo-speech-recognition)   │     │
│  │  📋 Cache questions                          │     │
│  │  🎛️ Orchestration flow                       │     │
│  │                                               │     │
│  │  Appelle ↓                                    │     │
│  └────────────┬─────────────────────────────────┘     │
│               │                                        │
│  ┌────────────▼─────────────────────────────────┐     │
│  │  use-tutor-ai.ts (wrapper Edge Functions)    │     │
│  │  ──────────────────────────────────────       │     │
│  │  generateQuestions() → Edge Function         │     │
│  │  evaluateAnswer() → Edge Function            │     │
│  │  chatWithTutor() → Edge Function             │     │
│  └────────────┬─────────────────────────────────┘     │
│               │                                        │
│  ┌────────────▼─────────────────────────────────┐     │
│  │  use-tutor.ts (chat textuel)                 │     │
│  │  ────────────────────────────                │     │
│  │  💬 Historique messages                      │     │
│  │  📚 Vocabulaire apprenant                    │     │
│  │  ☁️ Appels Edge Function                     │     │
│  └──────────────────────────────────────────────┘     │
│                                                         │
└───────────────────┬─────────────────────────────────────┘
                    │
                    │ HTTPS
                    │
┌───────────────────▼─────────────────────────────────────┐
│           SUPABASE EDGE FUNCTIONS                        │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  ┌────────────────────────────────────────────┐         │
│  │  generate-questions                         │         │
│  │  ─────────────────────                     │         │
│  │  Input: text + vocab                       │         │
│  │  Output: questions[] + summary             │         │
│  │  Calls: OpenAI GPT-4o-mini (×2 parallel)   │         │
│  └────────────────────────────────────────────┘         │
│                                                          │
│  ┌────────────────────────────────────────────┐         │
│  │  evaluate-answer                            │         │
│  │  ────────────────                          │         │
│  │  Input: question + answer + context        │         │
│  │  Output: correction                        │         │
│  │  Calls: OpenAI GPT-4o-mini (×1)            │         │
│  └────────────────────────────────────────────┘         │
│                                                          │
│  ┌────────────────────────────────────────────┐         │
│  │  tutor-chat-ai (✅ existe)                  │         │
│  │  ──────────────────                        │         │
│  │  Input: messages[]                         │         │
│  │  Output: content                           │         │
│  │  Calls: OpenAI GPT-4o-mini (×1)            │         │
│  └────────────────────────────────────────────┘         │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

---

## 🎯 Plan d'action recommandé

### ÉTAPE 1 : Créer les Edge Functions manquantes

**1.1. Créer `generate-questions`** (priorité haute)
```bash
npx supabase functions new generate-questions
```

**1.2. Créer `evaluate-answer`** (priorité haute)
```bash
npx supabase functions new evaluate-answer
```

---

### ÉTAPE 2 : Refactorer `use-chat-tutor.ts`

**2.1. Renommer** : `use-chat-tutor.ts` → `use-voice-tutor.ts`

**2.2. Remplacer les 4 appels directs OpenAI** :

| Fonction actuelle | Remplacer par |
|-------------------|---------------|
| `generateQuestionsForText()` | `invokeEdge('generate-questions', ...)` |
| `summarizeText()` | Inclus dans `generate-questions` |
| `evaluateAnswer()` | `invokeEdge('evaluate-answer', ...)` |
| `sendMessageToGPT()` | `invokeEdge('tutor-chat-ai', ...)` |

**2.3. Supprimer** :
```typescript
const OPENAI_API_KEY = process.env.EXPO_PUBLIC_OPENAI_API_KEY || '';
```

---

### ÉTAPE 3 : Tester l'architecture

**3.1. Test unitaire** : Chaque Edge Function séparément
**3.2. Test intégration** : Flow complet (question → réponse → correction)
**3.3. Test performance** : Latence totale acceptable (<2s par question)

---

### ÉTAPE 4 : Déployer en production

**4.1. Déployer les Edge Functions** :
```bash
npx supabase functions deploy generate-questions
npx supabase functions deploy evaluate-answer
```

**4.2. Configurer les secrets** :
```
OPENAI_API_KEY = sk-...
```

**4.3. Build production** :
```bash
eas build --platform all --profile production
```

---

## 💰 Comparaison coûts

### Architecture actuelle (client-side OpenAI)

| Appel | Fréquence | Coût unitaire | Total |
|-------|-----------|---------------|-------|
| Génération questions | 1× | $0.005 | $0.005 |
| Résumé texte | 1× | $0.003 | $0.003 |
| Correction réponse | 20× | $0.001 | $0.020 |
| **TOTAL** | - | - | **$0.028** |

**+ RISQUE** : Clé exposée = coûts incontrôlables

---

### Architecture Edge Function (recommandée)

| Appel | Fréquence | Coût unitaire | Total |
|-------|-----------|---------------|-------|
| `generate-questions` | 1× | $0.008 | $0.008 |
| `evaluate-answer` | 20× | $0.001 | $0.020 |
| **TOTAL** | - | - | **$0.028** |

**+ SÉCURITÉ** : Clé protégée = coûts contrôlés

**Conclusion** : Même coût, mais **100% sécurisé** ✅

---

## ✅ Recommandations finales

### 1. **Architecture à adopter** : Option B (3 hooks séparés)

```
use-voice-tutor.ts  → Orchestration audio + IA (via Edge Functions)
use-tutor-ai.ts     → Wrapper Edge Functions (optionnel mais recommandé)
use-tutor.ts        → Chat textuel (✅ existe)
```

---

### 2. **Garder séparé** : `use-voice-tutor` ≠ `use-tutor`

**Raisons** :
- ✅ Cas d'usage différents (vocal vs texte)
- ✅ Tests indépendants
- ✅ Maintenance simplifiée
- ✅ Réutilisabilité

**Exemple** :
- `use-voice-tutor` → Écran "Révision" (oral)
- `use-tutor` → Écran "Chat avec le tuteur" (texte)

---

### 3. **Flow optimal** : Voir diagramme "PHASE 1-2-3" ci-dessus

**Principe** :
1. Générer questions **une fois** au début (Edge Function)
2. Cache local des questions (pas de re-génération)
3. Chaque réponse → Edge Function correction
4. Audio 100% local (gratuit, instantané)

---

### 4. **Production-ready checklist**

- ✅ Edge Functions déployées
- ✅ Secrets Supabase configurés
- ✅ Aucune clé OpenAI côté client
- ✅ Tests E2E passés
- ✅ Latence acceptable (<2s par interaction)
- ✅ Gestion erreurs robuste
- ✅ Logs/analytics en place

---

### 5. **Performance cible**

| Métrique | Objectif | Actuel (après refactor) |
|----------|----------|-------------------------|
| Latence TTS | <100ms | ✅ <100ms (local) |
| Latence transcription | <100ms | ✅ <100ms (local) |
| Latence IA (correction) | <2s | ⏱️ À tester |
| Coût par session | <$0.05 | ✅ $0.028 |
| Sécurité clé API | Protégée | ✅ Server-side |

---

## 🚀 Résumé exécutif

### ❌ Problème actuel
- `use-chat-tutor.ts` fait 4 appels directs OpenAI
- Clé API exposée côté client
- Risque de sécurité majeur

### ✅ Solution recommandée
1. **Créer 2 Edge Functions** : `generate-questions`, `evaluate-answer`
2. **Refactorer `use-chat-tutor.ts`** → remplacer appels directs par Edge Functions
3. **Renommer** : `use-chat-tutor.ts` → `use-voice-tutor.ts`
4. **Garder séparé** : `use-voice-tutor` (vocal) ≠ `use-tutor` (texte)
5. **Déployer** et tester en production

### 🎯 Résultat final
- ✅ Architecture 100% sécurisée (clé server-side)
- ✅ Audio 100% locale (gratuit, instantané)
- ✅ IA via Edge Functions (contrôlée)
- ✅ Coût identique ($0.028 par session)
- ✅ Production-ready (App Store + Play Store)

---

**Prochaine étape recommandée** : Créer les Edge Functions puis refactorer `use-chat-tutor.ts`
