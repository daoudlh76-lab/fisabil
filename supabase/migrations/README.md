# Migrations Supabase - Fisabil

## Comment appliquer une migration

### Option 1: Via le Dashboard Supabase (Recommandé)

1. Allez sur [https://supabase.com/dashboard](https://supabase.com/dashboard)
2. Sélectionnez votre projet **Fisabil**
3. Dans le menu de gauche, cliquez sur **SQL Editor**
4. Cliquez sur **New query**
5. Copiez-collez le contenu du fichier de migration (ex: `create_vocab_cards_progress.sql`)
6. Cliquez sur **Run** (ou appuyez sur `Ctrl/Cmd + Enter`)
7. Vérifiez que le message indique "Success. No rows returned"

### Option 2: Via Supabase CLI

```bash
# Installer Supabase CLI (une seule fois)
npm install -g supabase

# Se connecter à Supabase
supabase login

# Appliquer la migration
supabase db push --db-url "postgresql://[YOUR_DB_URL]"
```

---

## Migrations disponibles

⚠️ **IMPORTANT**: Les migrations doivent être appliquées dans l'ordre (01, 02, etc.)

### 1. `01_create_vocabulary_table.sql`

**But**: Créer la table `vocabulary` pour stocker le vocabulaire arabe extrait des textes scannés.

**À appliquer**: ✅ **OUI** - Cette migration est REQUISE. Elle doit être appliquée EN PREMIER.

**Ce que cette migration fait**:
- Crée la table `vocabulary` avec les colonnes:
  - `id`: Identifiant unique
  - `user_id`: Référence vers l'utilisateur
  - `word`: Mot arabe avec diacritiques
  - `translation`: Traduction du mot
  - `created_at`, `updated_at`: Dates de création/modification

- Active Row Level Security (RLS)
- Crée des index pour améliorer les performances
- Crée des politiques pour que chaque utilisateur ne puisse voir que son propre vocabulaire

**Impact**: Aucun impact sur les données existantes. Cette migration crée simplement une nouvelle table.

---

### 2. `02_create_vocab_cards_progress.sql`

**But**: Créer la table pour sauvegarder la progression des cartes de révision de vocabulaire avec système de répétition espacée.

**À appliquer**: ✅ **OUI** - Cette migration est REQUISE pour que le système de révision de vocabulaire fonctionne correctement.

**Dépendance**: ⚠️ Requiert que `01_create_vocabulary_table.sql` soit appliquée d'abord.

**Ce que cette migration fait**:
- Crée la table `vocab_cards_progress` avec les colonnes:
  - `id`: Identifiant unique
  - `user_id`: Référence vers l'utilisateur
  - `vocabulary_id`: Référence vers le mot de vocabulaire
  - `difficulty`: Difficulté de la carte (easy, medium, hard, forgotten)
  - `last_reviewed`: Date de la dernière révision
  - `next_review`: Date de la prochaine révision
  - `review_count`: Nombre de révisions effectuées
  - `created_at`, `updated_at`: Dates de création/modification

- Active Row Level Security (RLS) pour la sécurité
- Crée des index pour améliorer les performances
- Crée des politiques pour que chaque utilisateur ne puisse voir que sa propre progression
- Ajoute un trigger pour mettre à jour automatiquement `updated_at`

**Impact**: Aucun impact sur les données existantes. Cette migration crée simplement une nouvelle table.

---

### 3. `03_create_folders_table.sql`

**But**: Créer la table `folders` pour organiser les textes scannés en dossiers/catégories (Coran, Hadith, Grammaire, etc.).

**À appliquer**: ✅ **OUI** - Cette migration est REQUISE pour activer la fonctionnalité d'organisation par dossiers dans la bibliothèque.

**Ce que cette migration fait**:
- Crée la table `folders` avec les colonnes:
  - `id`: Identifiant unique
  - `user_id`: Référence vers l'utilisateur
  - `name`: Nom du dossier
  - `color`: Couleur du dossier (hexadécimal, défaut: #2E7D32)
  - `icon`: Emoji représentant le dossier (défaut: 📁)
  - `created_at`, `updated_at`: Dates de création/modification

- Active Row Level Security (RLS)
- Crée des index pour améliorer les performances
- Crée des politiques pour que chaque utilisateur ne puisse voir/modifier que ses propres dossiers
- Ajoute un trigger pour mettre à jour automatiquement `updated_at`

**Impact**: Aucun impact sur les données existantes. Cette migration crée simplement une nouvelle table.

---

### 4. `04_add_folder_to_scans.sql`

**But**: Ajouter une colonne `folder_id` à la table `scans` pour permettre de ranger les textes dans des dossiers.

**À appliquer**: ✅ **OUI** - Cette migration est REQUISE pour relier les textes aux dossiers.

**Dépendance**: ⚠️ Requiert que `03_create_folders_table.sql` soit appliquée d'abord.

**Ce que cette migration fait**:
- Ajoute la colonne `folder_id` (nullable) à la table `scans`:
  - Référence vers la table `folders`
  - `ON DELETE SET NULL`: si un dossier est supprimé, les textes restent mais sans dossier
  - NULL = texte sans dossier

- Crée des index pour optimiser les requêtes par dossier
- Crée un index composite pour filtrer par utilisateur ET dossier

**Impact**:
- Aucun impact sur les textes existants (la colonne est nullable)
- Les textes existants resteront "sans dossier" jusqu'à ce que l'utilisateur les range

---

### 5. `05_add_folder_to_dictations.sql`

**But**: Ajouter une colonne `folder_id` à la table `dictations` pour permettre d'organiser les audios/dictées dans des dossiers.

**À appliquer**: ✅ **OUI** - Cette migration est REQUISE pour relier les audios de la playlist aux dossiers.

**Dépendance**: ⚠️ Requiert que `03_create_folders_table.sql` soit appliquée d'abord.

**Ce que cette migration fait**:
- Ajoute la colonne `folder_id` (nullable) à la table `dictations`:
  - Référence vers la table `folders`
  - `ON DELETE SET NULL`: si un dossier est supprimé, les dictées restent mais sans dossier
  - NULL = dictée sans dossier

- Crée des index pour optimiser les requêtes par dossier
- Crée un index composite pour filtrer par utilisateur ET dossier

**Impact**:
- Aucun impact sur les dictées existantes (la colonne est nullable)
- Les dictées existantes resteront "sans dossier" jusqu'à ce que l'utilisateur les range

---

## Vérification après migrations

Pour vérifier que les migrations ont bien été appliquées, exécutez cette requête SQL dans le SQL Editor:

```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('vocabulary', 'vocab_cards_progress', 'folders')
ORDER BY table_name;
```

Si les tables existent, vous devriez voir:
```
table_name
-------------------
folders
vocab_cards_progress
vocabulary
```

Pour vérifier que les colonnes `folder_id` ont été ajoutées:

```sql
-- Vérifier folder_id dans scans
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'scans'
  AND column_name = 'folder_id';

-- Vérifier folder_id dans dictations
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'dictations'
  AND column_name = 'folder_id';
```

Devrait retourner pour chaque table:
```
column_name | data_type | is_nullable
------------+-----------+-------------
folder_id   | uuid      | YES
```

---

## Rollback (en cas de problème)

Si vous devez annuler les migrations:

### Rollback de 05_add_folder_to_dictations.sql
```sql
ALTER TABLE public.dictations DROP COLUMN IF EXISTS folder_id CASCADE;
```
⚠️ **ATTENTION**: Cela supprimera toutes les associations entre dictées et dossiers.

### Rollback de 04_add_folder_to_scans.sql
```sql
ALTER TABLE public.scans DROP COLUMN IF EXISTS folder_id CASCADE;
```
⚠️ **ATTENTION**: Cela supprimera toutes les associations entre textes et dossiers.

### Rollback de 03_create_folders_table.sql
```sql
DROP TABLE IF EXISTS public.folders CASCADE;
DROP FUNCTION IF EXISTS update_folders_updated_at() CASCADE;
```
⚠️ **ATTENTION**: Cela supprimera tous les dossiers créés par les utilisateurs.

### Rollback de 02_create_vocab_cards_progress.sql
```sql
DROP TABLE IF EXISTS public.vocab_cards_progress CASCADE;
DROP FUNCTION IF EXISTS update_vocab_cards_progress_updated_at() CASCADE;
```
⚠️ **ATTENTION**: Le rollback supprimera toutes les données de progression des cartes de révision.

### Rollback de 01_create_vocabulary_table.sql
```sql
DROP TABLE IF EXISTS public.vocabulary CASCADE;
DROP FUNCTION IF EXISTS update_vocabulary_updated_at() CASCADE;
```
⚠️ **ATTENTION**: Cela supprimera tout le vocabulaire extrait.
