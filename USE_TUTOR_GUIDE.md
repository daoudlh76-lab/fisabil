# Guide d'utilisation: `use-tutor.ts` 📚

**Date**: 2026-02-09
**Hook**: `hooks/use-tutor.ts`
**Architecture**: Supabase Edge Function + Vocabulaire apprenant

---

## Vue d'ensemble

Le hook `useTutor` fournit une interface de chat avec un tuteur IA qui :
- ✅ Charge les textes scannés de l'utilisateur (table `scans`)
- ✅ Charge le vocabulaire connu de l'apprenant (via `learner-vocabulary.ts`)
- ✅ Utilise **Supabase Edge Function** `tutor-chat-ai` (pas d'appel direct OpenAI)
- ✅ Personnalise les questions selon le vocabulaire de l'apprenant
- ✅ Répond en arabe classique avec tashkeel complet

---

## Architecture

```
┌──────────────────────────────────────────────────┐
│          HOOK: useTutor()                         │
├──────────────────────────────────────────────────┤
│ 1. Charge textes (Supabase table: scans)         │
│ 2. Charge vocabulaire (learner-vocabulary)       │
│ 3. Construit prompt système avec:                │
│    - Textes scannés                               │
│    - Vocabulaire connu (max 200 mots)            │
│ 4. Envoie à Edge Function: tutor-chat-ai         │
│ 5. Reçoit réponse en arabe                       │
└──────────────────────────────────────────────────┘
                      ↓
┌──────────────────────────────────────────────────┐
│   SUPABASE EDGE FUNCTION: tutor-chat-ai          │
├──────────────────────────────────────────────────┤
│ - Reçoit: messages[] (system + history + user)   │
│ - Appelle: OpenAI GPT-4o-mini                    │
│ - Retourne: { content, modelUsed }               │
└──────────────────────────────────────────────────┘
```

---

## Import & Utilisation

### Import

```typescript
import { useTutor } from '@/hooks/use-tutor';
```

### Exemple simple

```typescript
function TutorChat() {
  const { language } = useLanguage(); // 'fr', 'en', etc.
  const {
    messages,
    loading,
    error,
    sendMessage,
    clearMessages,
    startConversation,
    userTexts,
    textsLoaded,
    refreshTexts,
  } = useTutor(language);

  // Démarrer une conversation au montage
  useEffect(() => {
    if (textsLoaded && userTexts.length > 0) {
      startConversation(); // Ou startConversation(textId) pour un texte spécifique
    }
  }, [textsLoaded, userTexts, startConversation]);

  // Envoyer un message
  const handleSend = async () => {
    await sendMessage("ما معنى هذه الكلمة؟");
  };

  return (
    <View>
      {messages.map(msg => (
        <Text key={msg.id}>{msg.content}</Text>
      ))}
      {loading && <ActivityIndicator />}
      {error && <Text style={{ color: 'red' }}>{error}</Text>}
    </View>
  );
}
```

---

## API du Hook

### Paramètres

```typescript
useTutor(uiLang: string = 'fr')
```

- **`uiLang`** : Langue de l'interface (`'fr'`, `'en'`, `'de'`, etc.)
  → Utilisé pour construire le prompt système (ex: "Le student peut répondre en French")

---

### Retour

| Propriété | Type | Description |
|-----------|------|-------------|
| **`messages`** | `ChatMessage[]` | Historique des messages (user + assistant) |
| **`loading`** | `boolean` | Indique si un appel API est en cours |
| **`error`** | `string \| null` | Message d'erreur si échec |
| **`sendMessage`** | `(msg: string, textId?: string) => Promise<void>` | Envoie un message au tuteur |
| **`clearMessages`** | `() => void` | Vide l'historique des messages |
| **`startConversation`** | `(textId?: string) => Promise<void>` | Démarre une nouvelle conversation |
| **`userTexts`** | `UserText[]` | Liste des textes scannés de l'utilisateur |
| **`textsLoaded`** | `boolean` | Indique si les textes ont été chargés |
| **`refreshTexts`** | `() => Promise<void>` | Recharge les textes depuis Supabase |

---

### Types

```typescript
interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
}

interface UserText {
  id: string;
  title: string;
  content: string;
  folder_id: string | null;
  created_at?: string;
}
```

---

## Fonctions principales

### 1. `startConversation(textId?: string)`

Démarre une nouvelle conversation avec un message de bienvenue.

**Sans textId** :
```typescript
await startConversation();
// → "السَّلَامُ عَلَيْكُمْ! لَدَيْكَ 5 نُصُوصٍ مَمْسُوحَةٍ..."
```

**Avec textId** :
```typescript
await startConversation('uuid-du-texte');
// → "السَّلَامُ عَلَيْكُمْ! سَنَدْرُسُ مَعًا نَصَّ 'العلم والعمل'..."
```

---

### 2. `sendMessage(message: string, textId?: string)`

Envoie un message au tuteur et reçoit une réponse.

**Exemple** :
```typescript
await sendMessage("اشرح لي معنى كلمة 'العلم'");
// → Le tuteur répond en arabe avec tashkeel complet
```

**Avec contexte de texte spécifique** :
```typescript
await sendMessage("ما الفكرة الرئيسية؟", 'uuid-du-texte');
// → Le tuteur répond en se basant uniquement sur ce texte
```

---

### 3. `clearMessages()`

Vide l'historique des messages (utile pour réinitialiser la conversation).

```typescript
clearMessages();
// messages = []
```

---

### 4. `refreshTexts()`

Recharge les textes scannés depuis Supabase.

```typescript
await refreshTexts();
// userTexts est mis à jour
```

---

## Prompt système généré

Le hook construit automatiquement un prompt système qui inclut :

### 1. **Contexte des textes**

```
النُّصُوصُ المَدْرُوسَةُ:
1. "العلم والعمل"
العلم نور والجهل ظلام. من طلب العلم...

2. "الصداقة"
الصديق وقت الضيق...
```

### 2. **Vocabulaire connu de l'apprenant**

```
مُفْرَدَاتُ الطَّالِبِ المَعْرُوفَةُ:
كِتَابٌ (livre)، قَلَمٌ (stylo)، مَدْرَسَةٌ (école)، ...

⚠️ قَاعِدَةٌ مُهِمَّةٌ: اسْتَخْدِمْ أَقْصَى عَدَدٍ مِنْ هَذِهِ المُفْرَدَاتِ...
```

### 3. **Instructions pour le tuteur**

```
مُهِمَّتُكَ:
١. اِطْرَحْ أَسْئِلَةً عَنْ مَعْنَى النُّصُوصِ وَمُفْرَدَاتِهَا
٢. صَحِّحْ أَخْطَاءَ الفَهْمِ (المَعْنَى)
٣. صَحِّحْ أَخْطَاءَ النَّحْوِ وَالصَّرْفِ
...

القَوَاعِدُ:
- كُلُّ كَلِمَةٍ بِالتَّشْكِيلِ الكَامِلِ
- كُنْ لَطِيفًا فِي التَّصْحِيحِ
- اِجْعَلْ أَجْوِبَتَكَ قَصِيرَةً (٢-٣ جُمَلٍ)
```

---

## Gestion du vocabulaire

Le hook charge automatiquement le vocabulaire de l'apprenant au montage :

```typescript
useEffect(() => {
  const loadVocabulary = async () => {
    const words = await loadLearnerWords(); // Charge depuis ai_cache
    const summary = buildVocabSummary(words, 200); // Max 200 mots
    setVocabSummary(summary);
  };
  loadVocabulary();
}, []);
```

**Résultat** :
- Le tuteur **privilégie** les mots connus dans ses questions
- Il **explique** les nouveaux mots s'il doit les utiliser
- L'apprenant comprend mieux et progresse plus vite

---

## Edge Function : `tutor-chat-ai`

### Emplacement
```
supabase/functions/tutor-chat-ai/index.ts
```

### Payload envoyé
```typescript
{
  messages: [
    { role: 'system', content: '...' },
    { role: 'user', content: 'السلام عليكم' },
    { role: 'assistant', content: 'وعليكم السلام...' },
    { role: 'user', content: 'ما معنى العلم؟' }
  ],
  max_tokens: 500,
  temperature: 0.2,
  language: 'ar'
}
```

### Réponse
```typescript
{
  content: "العِلْمُ هُوَ المَعْرِفَةُ...",
  modelUsed: "gpt-4o-mini"
}
```

---

## Variables d'environnement

### Supabase Edge Function

Dans **Supabase Dashboard → Edge Functions → Secrets** :

```bash
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini  # Optionnel, défaut: gpt-4o-mini
```

### Client (React Native)

**Pas besoin** de `EXPO_PUBLIC_OPENAI_API_KEY` côté client !
L'Edge Function gère l'authentification OpenAI.

---

## Flux complet d'une conversation

```
1. USER: ouvre l'écran du tuteur
   ↓
2. HOOK: refreshTexts() → charge 5 textes depuis Supabase
   ↓
3. HOOK: loadLearnerWords() → charge 150 mots connus
   ↓
4. USER: appuie sur "Démarrer"
   ↓
5. HOOK: startConversation()
   → Construit prompt système avec textes + vocabulaire
   → Affiche: "السَّلَامُ عَلَيْكُمْ! لَدَيْكَ 5 نُصُوصٍ..."
   ↓
6. USER: tape "اطرح سؤالا عن النص الأول"
   ↓
7. HOOK: sendMessage("اطرح سؤالا عن النص الأول")
   → Appelle Edge Function avec messages[]
   ↓
8. EDGE FUNCTION: appelle OpenAI GPT-4o-mini
   ↓
9. EDGE FUNCTION: retourne { content: "مَا المَوضُوعُ..." }
   ↓
10. HOOK: ajoute la réponse à messages[]
    ↓
11. UI: affiche la réponse du tuteur
```

---

## Différences avec `use-chat-tutor.ts`

| Aspect | `use-chat-tutor.ts` | `use-tutor.ts` |
|--------|---------------------|----------------|
| **Architecture** | Appels directs OpenAI | Supabase Edge Function |
| **Clé API** | Client-side (❌ exposée) | Server-side (✅ sécurisée) |
| **Audio** | expo-speech-recognition + TTS | ❌ Pas d'audio (texte uniquement) |
| **Questions** | Générées + cache local | À la demande (IA conversationnelle) |
| **Vocabulaire** | ❌ Non utilisé | ✅ Injecté dans le prompt |
| **Cas d'usage** | Tuteur vocal interactif | Chat textuel avec l'IA tuteur |

---

## Exemple complet

```typescript
import { useTutor } from '@/hooks/use-tutor';
import { useLanguage } from '@/hooks/use-language';
import { useState } from 'react';
import { View, Text, TextInput, Button, FlatList } from 'react-native';

export default function TutorChatScreen() {
  const { language } = useLanguage();
  const {
    messages,
    loading,
    error,
    sendMessage,
    startConversation,
    userTexts,
    textsLoaded,
  } = useTutor(language);

  const [input, setInput] = useState('');

  const handleStart = async () => {
    if (userTexts.length > 0) {
      await startConversation(userTexts[0].id); // Premier texte
    }
  };

  const handleSend = async () => {
    if (input.trim()) {
      await sendMessage(input);
      setInput('');
    }
  };

  return (
    <View style={{ flex: 1, padding: 16 }}>
      <Text>Textes disponibles: {userTexts.length}</Text>

      {!messages.length && textsLoaded && (
        <Button title="Démarrer la conversation" onPress={handleStart} />
      )}

      <FlatList
        data={messages}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <View style={{ marginVertical: 8 }}>
            <Text style={{ fontWeight: 'bold' }}>
              {item.role === 'user' ? 'Vous' : 'Tuteur'}
            </Text>
            <Text>{item.content}</Text>
          </View>
        )}
      />

      {error && <Text style={{ color: 'red' }}>{error}</Text>}

      <View style={{ flexDirection: 'row', marginTop: 16 }}>
        <TextInput
          value={input}
          onChangeText={setInput}
          placeholder="Tapez votre message..."
          style={{ flex: 1, borderWidth: 1, padding: 8 }}
        />
        <Button title="Envoyer" onPress={handleSend} disabled={loading} />
      </View>
    </View>
  );
}
```

---

## Déploiement de l'Edge Function

### 1. Déployer la fonction

```bash
npx supabase functions deploy tutor-chat-ai
```

### 2. Configurer les secrets

Dans **Supabase Dashboard → Edge Functions → Secrets** :
```
OPENAI_API_KEY = sk-...
```

### 3. Vérifier les logs

```bash
npx supabase functions logs tutor-chat-ai
```

---

## Tests

### Test manuel (curl)

```bash
curl -X POST https://YOUR_PROJECT.supabase.co/functions/v1/tutor-chat-ai \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "system", "content": "Tu es un tuteur arabe."},
      {"role": "user", "content": "السلام عليكم"}
    ],
    "max_tokens": 200
  }'
```

### Test avec le hook

```typescript
// Dans votre composant
useEffect(() => {
  const test = async () => {
    await startConversation();
    await sendMessage("اطرح سؤالا");
  };
  test();
}, []);
```

---

## Troubleshooting

### Erreur: "Missing env OPENAI_API_KEY"

**Solution** : Configurer la clé dans Supabase Dashboard → Edge Functions → Secrets

---

### Erreur: "Invalid payload: messages[] required"

**Solution** : Vérifier que le payload envoyé contient bien un array `messages`

---

### Pas de réponse du tuteur

**Solution** : Vérifier les logs de l'Edge Function :
```bash
npx supabase functions logs tutor-chat-ai
```

---

## Conclusion

Le hook `useTutor` fournit une **interface sécurisée et personnalisée** pour le tuteur IA :
- ✅ Clés API protégées côté serveur (Edge Function)
- ✅ Vocabulaire de l'apprenant intégré automatiquement
- ✅ Contexte des textes scannés injecté dans le prompt
- ✅ Réponses en arabe classique avec tashkeel complet
- ✅ Prêt pour la production

**Utilisation recommandée** : Chat textuel avec le tuteur IA
**Complément** : `use-chat-tutor.ts` pour le tuteur vocal interactif

---

**Créé le** : 2026-02-09
**Version** : 1.0.0
**Auteur** : Claude Code (Anthropic)
