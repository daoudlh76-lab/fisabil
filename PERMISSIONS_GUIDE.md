# Guide des Permissions - Fisabil 🎤

## ⚠️ IMPORTANT: Testez sur un VRAI appareil

Le **simulateur iOS ne supporte PAS le microphone**. Pour tester la fonctionnalité microphone:
- ✅ Utilisez un **vrai iPhone/iPad** avec Expo Go
- ✅ Ou un **téléphone Android** physique
- ❌ Le simulateur iOS ne fonctionne PAS (voir [TESTING_MICROPHONE.md](TESTING_MICROPHONE.md))

## Problème: Le microphone ne s'ouvre pas

Si vous ne voyez **plus la demande d'autorisation du microphone**, c'est que vous avez probablement refusé la permission lors d'une demande précédente. iOS et Android ne redemandent pas automatiquement les permissions refusées.

## Solution: Réactiver le microphone dans les paramètres

### Sur iOS (iPhone/iPad) 📱

1. **Ouvrez l'app Réglages** (icône grise avec des engrenages)
2. **Faites défiler vers le bas** jusqu'à trouver **Fisabil**
3. **Appuyez sur Fisabil**
4. Vous verrez une liste de permissions, trouvez **Microphone**
5. **Activez le bouton Microphone** (il devient vert ✅)
6. **Relancez l'application Fisabil**

```
Réglages
  ↓
Fisabil
  ↓
Microphone ⚪️ → Microphone ✅
```

### Sur Android 🤖

1. **Ouvrez les Paramètres** (Settings)
2. Allez dans **Applications** (ou **Apps**)
3. Trouvez et appuyez sur **Fisabil**
4. Appuyez sur **Autorisations** (Permissions)
5. Trouvez **Microphone** dans la liste
6. **Sélectionnez "Autoriser"** ou **"Autoriser seulement pendant l'utilisation"**
7. **Relancez l'application Fisabil**

```
Paramètres
  ↓
Applications
  ↓
Fisabil
  ↓
Autorisations
  ↓
Microphone → Autoriser ✅
```

## Vérification

Après avoir réactivé la permission:

1. **Relancez complètement l'app Fisabil** (fermez-la complètement puis rouvrez-la)
2. Allez dans **Révision** → **Tuteur** ou **Dictée**
3. Appuyez sur le **bouton microphone** 🎤
4. Le microphone devrait maintenant **s'ouvrir correctement** ✅

## Améliorations apportées au code

J'ai amélioré les hooks `use-speech.ts` et `use-chat-tutor.ts` pour:

- ✅ Vérifier le statut de la permission avant de demander
- ✅ Détecter si la permission a été refusée définitivement (`canAskAgain = false`)
- ✅ Afficher un **message clair** expliquant comment réactiver la permission
- ✅ Éviter de redemander inutilement si la permission est déjà refusée

## Message d'erreur

Si la permission est refusée, vous verrez maintenant ce message:

```
Permission microphone refusée.
Allez dans Réglages → Fisabil → Microphone pour l'activer.
```

Ce message vous guidera directement vers la solution! 💡
