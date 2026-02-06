# Options d'animation pour la navigation

Le fichier `app/(auth)/_layout.tsx` contrôle les animations de transition entre les écrans d'authentification.

## Problème actuel

Avec `backgroundColor: 'transparent'` et sans animation configurée, les deux écrans se superposent pendant la transition, créant un effet "brouillon".

## Solutions

### Option 1 : Animation Fade (Recommandé - appliqué)

```typescript
screenOptions={{
  headerShown: false,
  contentStyle: { backgroundColor: 'transparent' },
  animation: 'fade',
  animationDuration: 200, // 200ms = rapide et propre
}}
```

**Avantages** :
- ✅ Transition douce
- ✅ Pas de superposition visible
- ✅ Fonctionne bien avec fond transparent

### Option 2 : Animation Native (iOS/Android)

```typescript
screenOptions={{
  headerShown: false,
  contentStyle: { backgroundColor: 'transparent' },
  animation: Platform.OS === 'ios' ? 'ios' : 'slide_from_right',
  animationDuration: 300,
}}
```

**Avantages** :
- ✅ Animation native de chaque plateforme
- ✅ Familière pour les utilisateurs

**Inconvénient** :
- ⚠️ Peut montrer la superposition pendant le slide

### Option 3 : Pas d'animation

```typescript
screenOptions={{
  headerShown: false,
  contentStyle: { backgroundColor: 'transparent' },
  animation: 'none',
}}
```

**Avantages** :
- ✅ Instantané
- ✅ Aucune superposition

**Inconvénient** :
- ⚠️ Peut sembler brutal

### Option 4 : Fond opaque pendant la transition

```typescript
screenOptions={{
  headerShown: false,
  contentStyle: {
    backgroundColor: '#F7F8FA', // Opaque au lieu de transparent
  },
  animation: 'slide_from_right',
  animationDuration: 300,
}}
```

**Avantages** :
- ✅ Pas de superposition visible
- ✅ Animation fluide

**Inconvénient** :
- ⚠️ Perd l'image de fond pendant la transition

### Option 5 : Animation personnalisée

```typescript
screenOptions={{
  headerShown: false,
  contentStyle: { backgroundColor: 'transparent' },
  animation: 'fade_from_bottom',
  animationDuration: 250,
}}
```

**Autres animations disponibles** :
- `fade`
- `fade_from_bottom`
- `flip`
- `simple_push`
- `slide_from_bottom`
- `slide_from_left`
- `slide_from_right`
- `ios` (animation iOS native)
- `none`

## Configuration actuelle

J'ai appliqué **Option 1 (fade)** avec une durée de 200ms :

```typescript
animation: 'fade',
animationDuration: 200,
```

## Pour tester une autre animation

1. Ouvrez `app/(auth)/_layout.tsx`
2. Changez la valeur de `animation`
3. Ajustez `animationDuration` (en millisecondes)
4. Redémarrez l'app pour voir l'effet

## Recommandation

Pour une app professionnelle avec fond d'image transparent :
- **Développement** : `animation: 'fade'` avec `animationDuration: 200`
- **Production** : Tester avec vos utilisateurs et ajuster selon leurs préférences

Si vous voulez garder l'animation native mais éviter la superposition, utilisez **Option 4** avec un fond opaque.
