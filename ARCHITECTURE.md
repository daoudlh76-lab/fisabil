# Architecture de stockage local/cloud - Fisabil

## Vue d'ensemble

L'application Fisabil utilise une architecture hybride local/cloud pour garantir:
- **Performance**: Accès rapide aux données en local
- **Fiabilité**: Fonctionnement hors ligne
- **Synchronisation**: Sauvegarde automatique dans le cloud
- **Multi-appareil**: Accès aux données depuis plusieurs téléphones

## Stratégie de stockage

### 🏠 LOCAL (AsyncStorage)

**Objectif**: Accès rapide + fonctionnement sans Internet

**Données stockées localement**:
- ✅ Scans OCR (textes scannés)
- ✅ Vocabulaire personnel (mots, traductions, exemples)
- ✅ Cartes de révision + historique de progression
- ✅ Dictées générées à partir des textes
- ✅ Playlists audio (métadonnées + URIs)
- ✅ Réglages utilisateur (niveau, langue, objectifs)
- ✅ Préférences vocales (genre de la voix du tuteur)
- ✅ Limites quotidiennes (compteurs d'utilisation)
- ✅ File d'attente hors ligne (actions à synchroniser)

**Avantages**:
- L'app reste fluide même sans réseau
- Démarrage instantané
- Pas de latence réseau

### ☁️ CLOUD (Supabase)

**Objectif**: Sauvegarde + multi-téléphone + abonnement

**Tables Supabase**:

#### 1. `auth.users`
- Comptes utilisateurs (email / Apple / Google)
- Géré automatiquement par Supabase Auth

#### 2. `public.scans`
- Textes scannés avec OCR
- Champs: id, user_id, title, content, image_url, folder_id
- RLS activé (Row Level Security)

#### 3. `public.vocabulary`
- Vocabulaire extrait des textes
- Champs: id, user_id, word, translation, root, contraire
- Index sur user_id et word

#### 4. `public.vocab_cards_progress`
- Progression des cartes de révision
- Système de répétition espacée
- Champs: vocabulary_id, difficulty, last_reviewed, next_review

#### 5. `public.folders`
- Dossiers pour organiser les contenus
- Champs: id, user_id, name, color, icon

#### 6. `public.dictations`
- Dictées générées à partir des textes
- Champs: id, user_id, title, text, audio_url, difficulty, completed, score

#### 7. `public.audio_tracks`
- Pistes audio des playlists
- Champs: id, user_id, title, text, audio_url, duration, folder_id, position

#### 8. `public.ai_cache`
- Cache des réponses de l'IA
- Champs: id, user_id, key, payload (JSONB), expires_at
- Permet d'éviter de re-générer du vocabulaire déjà extrait

**Avantages**:
- L'utilisateur ne perd jamais ses données
- Synchronisation multi-appareil
- Abonnement lié au compte
- Statistiques globales

## Hooks de synchronisation

### `useSyncManager`

Hook principal pour gérer la synchronisation local ↔ cloud.

**Fonctions principales**:
```typescript
const {
  syncState,           // État de la sync (idle, syncing, error, success)
  saveLocal,           // Sauvegarder localement
  loadLocal,           // Charger depuis le local
  saveCloud,           // Sauvegarder dans le cloud
  loadCloud,           // Charger depuis le cloud
  syncToCloud,         // Sync local → cloud
  syncFromCloud,       // Sync cloud → local
  syncAll,             // Sync complète
  saveWithSync,        // Sauvegarder avec sync auto
  loadWithFallback,    // Charger avec fallback local→cloud
} = useSyncManager();
```

**Surveillance de la connexion**:
- Détecte automatiquement quand la connexion revient
- Lance la synchronisation automatiquement
- Affiche l'état en temps réel (online/offline)

### `useOfflineQueue`

Hook pour gérer les actions effectuées hors ligne.

**Fonctions principales**:
```typescript
const {
  queue,               // Liste des actions en attente
  isProcessing,        // Indique si la queue est en cours de traitement
  isOnline,            // État de la connexion
  enqueue,             // Ajouter une action à la queue
  processQueue,        // Traiter toute la queue
  clearQueue,          // Vider la queue
  executeWithFallback, // Exécuter avec fallback offline
} = useOfflineQueue();
```

**Types d'actions supportées**:
- `insert`: Insérer de nouvelles données
- `update`: Mettre à jour des données existantes
- `delete`: Supprimer des données
- `upsert`: Insérer ou mettre à jour

**Mécanisme de retry**:
- Maximum 3 tentatives par action
- Après 3 échecs, l'action est abandonnée
- Les actions sont rejouées automatiquement quand la connexion revient

## Flux de synchronisation

### 1. Scan d'un nouveau texte

```
Utilisateur scanne un texte
    ↓
1. Sauvegarde immédiate en local (AsyncStorage)
    ↓
2. Si Internet disponible → Sync vers Supabase
    ↓
3. Si pas Internet → Ajouter à la queue
    ↓
4. Quand connexion revient → Traiter la queue
```

### 2. Changement de téléphone

```
Utilisateur se connecte sur nouveau téléphone
    ↓
1. Authentification Supabase
    ↓
2. Chargement automatique depuis le cloud
    ↓
3. Cache en local pour accès rapide
    ↓
4. L'utilisateur retrouve toutes ses données
```

### 3. Mode hors ligne

```
Utilisateur utilise l'app sans Internet
    ↓
1. Toutes les actions fonctionnent normalement
    ↓
2. Données sauvegardées en local
    ↓
3. Actions ajoutées à la queue
    ↓
4. Connexion rétablie → Sync automatique
```

## Structure des clés AsyncStorage

### Clés de données
- `@fisabil_playlist_${userId}`: Playlist audio
- `@fisabil_sync_${key}`: Données avec marqueur de sync
- `@fisabil_daily_${featureKey}`: Limites quotidiennes
- `subscription`: État de l'abonnement
- `language`: Langue de l'interface

### Clés de synchronisation
- `@fisabil_last_sync`: Date du dernier sync
- `@fisabil_offline_queue`: Queue des actions hors ligne

## Sécurité (Row Level Security)

Toutes les tables Supabase utilisent RLS (Row Level Security):
- Les utilisateurs ne peuvent accéder qu'à leurs propres données
- Impossible de voir les données d'autres utilisateurs
- Politiques SQL strictes sur SELECT, INSERT, UPDATE, DELETE

**Exemple de politique**:
```sql
CREATE POLICY "Users can view their own scans"
  ON public.scans
  FOR SELECT
  USING (auth.uid() = user_id);
```

## Migrations Supabase

Les migrations sont dans `/supabase/migrations/`:

1. `01_create_vocabulary_table.sql` - Table vocabulaire
2. `02_create_vocab_cards_progress.sql` - Progression des cartes
3. `03_create_folders_table.sql` - Dossiers
4. `04_add_folder_to_scans.sql` - Lien scans ↔ dossiers
5. `05_add_folder_to_dictations.sql` - Lien dictations ↔ dossiers
6. `06_create_scans_table.sql` - Table scans
7. `07_create_ai_cache_table.sql` - Cache IA
8. `08_create_dictations_table.sql` - Table dictations
9. `09_create_audio_playlists_table.sql` - Table pistes audio

**Comment appliquer les migrations**:
1. Aller dans Supabase Dashboard > SQL Editor
2. Copier-coller le contenu d'une migration
3. Exécuter
4. Répéter pour chaque migration dans l'ordre

## Bonnes pratiques

### ✅ À faire

1. **Toujours sauvegarder localement en premier**
   ```typescript
   await saveLocal('key', data);
   if (isOnline) {
     await saveCloud('table', data);
   }
   ```

2. **Utiliser saveWithSync pour les opérations critiques**
   ```typescript
   await saveWithSync('playlist', 'audio_tracks', tracks);
   ```

3. **Gérer les erreurs de sync**
   ```typescript
   if (syncState.status === 'error') {
     console.error('Sync failed:', syncState.error);
   }
   ```

4. **Utiliser la queue pour les actions hors ligne**
   ```typescript
   await executeWithFallback({
     type: 'insert',
     table: 'scans',
     data: newScan
   });
   ```

### ❌ À éviter

1. Ne pas sync à chaque frappe clavier
2. Ne pas bloquer l'UI pendant la sync
3. Ne pas ignorer les erreurs de sync
4. Ne pas stocker de données sensibles non chiffrées

## Diagramme de l'architecture

```
┌─────────────────────────────────────────┐
│           UTILISATEUR                    │
│  (Scanner, Vocabulaire, Révision, etc.) │
└───────────────┬─────────────────────────┘
                │
    ┌───────────▼──────────────┐
    │   React Native App       │
    │   (Expo + TypeScript)    │
    └───────────┬──────────────┘
                │
        ┌───────▼────────┐
        │   Hooks        │
        │  - useSyncManager
        │  - useOfflineQueue
        └───┬────────┬───┘
            │        │
  ┌─────────▼──┐  ┌─▼──────────┐
  │ AsyncStorage│  │  Supabase  │
  │   (Local)   │  │   (Cloud)  │
  └─────────────┘  └────────────┘
      📱              ☁️
   Téléphone       Serveur
```

## Exemple d'utilisation

### Sauvegarder un nouveau scan avec sync

```typescript
import { useSyncManager } from '@/hooks/use-sync-manager';
import { useOfflineQueue } from '@/hooks/use-offline-queue';

function ScanScreen() {
  const { saveWithSync } = useSyncManager();
  const { executeWithFallback } = useOfflineQueue();

  const handleNewScan = async (text: string) => {
    const scan = {
      id: Date.now().toString(),
      title: 'Nouveau scan',
      content: text,
      folder_id: null,
    };

    // Méthode 1: Avec sync automatique
    await saveWithSync('scans', 'scans', scan);

    // Méthode 2: Avec fallback offline
    await executeWithFallback({
      type: 'insert',
      table: 'scans',
      data: scan,
    });
  };

  return (/* ... */);
}
```

## Support et maintenance

- **Logs**: Tous les hooks logguent leurs actions dans la console
- **Debug**: Utiliser `console.log` pour suivre le flux
- **Monitoring**: Vérifier `syncState.status` et `syncState.error`
- **Tests**: Tester en mode avion pour vérifier le mode offline

## Évolutions futures

- [ ] Synchronisation incrémentale (uniquement les changements)
- [ ] Compression des données avant sync
- [ ] Synchronisation en background (Background Fetch)
- [ ] Résolution de conflits automatique
- [ ] Dashboard admin pour monitorer les syncs
- [ ] Logs de sync côté serveur
- [ ] Nettoyage automatique des anciens caches
