# Migration du vocabulaire - Suppression des colonnes redondantes

## Contexte

La structure du vocabulaire a été simplifiée pour retirer les colonnes redondantes :
- **Vocabulaire** : `mot_ar` a été retiré (le `singulier` est maintenant la référence principale)
- **Verbes** : `verbe_ar` a été retiré (le `passe_3ms` est maintenant la référence principale)

## Migration automatique côté client

Le code client applique automatiquement la migration en mémoire grâce au module `src/lib/migrate-vocab-data.ts`.

Cela signifie que **même avec les anciennes données**, l'application fonctionnera correctement en convertissant automatiquement l'ancienne structure vers la nouvelle.

## Migration SQL (optionnelle mais recommandée)

Pour nettoyer définitivement la base de données et retirer les colonnes `mot_ar` et `verbe_ar` des données stockées, exécutez le script SQL suivant dans Supabase.

### Étapes

1. Ouvrez le **SQL Editor** dans votre tableau de bord Supabase
2. Copiez le contenu du fichier `migrate-vocab-structure.sql`
3. Exécutez le script
4. Vérifiez les résultats avec la requête de vérification fournie

### Script SQL

```sql
-- Migration script to update vocabulary structure
-- Removes mot_ar and verbe_ar columns (they are redundant with singulier and passe_3ms)

-- Step 1: Update vocabulaire items (remove mot_ar, keep singulier)
UPDATE scans
SET ai_data = jsonb_set(
  ai_data,
  '{vocabulaire}',
  (
    SELECT jsonb_agg(
      vocab_item - 'mot_ar'
    )
    FROM jsonb_array_elements(ai_data->'vocabulaire') AS vocab_item
  )
)
WHERE ai_data ? 'vocabulaire'
  AND jsonb_array_length(ai_data->'vocabulaire') > 0;

-- Step 2: Update verbes items (remove verbe_ar, keep passe_3ms)
UPDATE scans
SET ai_data = jsonb_set(
  ai_data,
  '{verbes}',
  (
    SELECT jsonb_agg(
      verb_item - 'verbe_ar'
    )
    FROM jsonb_array_elements(ai_data->'verbes') AS verb_item
  )
)
WHERE ai_data ? 'verbes'
  AND jsonb_array_length(ai_data->'verbes') > 0;

-- Verification query
SELECT
  id,
  title,
  ai_data->'vocabulaire'->0 as sample_vocab,
  ai_data->'verbes'->0 as sample_verb
FROM scans
WHERE ai_data IS NOT NULL
LIMIT 5;
```

### Vérification

Après avoir exécuté le script, vérifiez que :
- Les objets `vocabulaire` n'ont plus de champ `mot_ar`
- Les objets `verbes` n'ont plus de champ `verbe_ar`
- Les champs `singulier` et `passe_3ms` sont toujours présents

### Rollback (en cas de problème)

Si vous devez annuler la migration, vous ne pourrez pas restaurer automatiquement `mot_ar` et `verbe_ar` car ces données ont été supprimées. Vous devrez soit :
1. Restaurer depuis une sauvegarde
2. Régénérer le vocabulaire pour tous les scans

**Recommandation** : Avant d'exécuter la migration SQL, faites une sauvegarde de votre base de données Supabase.

## Impact

### Avantages
- ✅ Structure simplifiée et plus cohérente
- ✅ Moins de redondance dans la base de données
- ✅ Économie d'espace de stockage
- ✅ Interface utilisateur plus épurée

### Compatibilité
- ✅ Rétrocompatibilité assurée par la migration automatique côté client
- ✅ Les anciennes données continuent de fonctionner
- ✅ Les nouvelles extractions utilisent automatiquement la nouvelle structure

## Questions fréquentes

### Dois-je exécuter la migration SQL immédiatement ?
Non, l'application fonctionne parfaitement avec l'ancienne structure grâce à la migration automatique côté client. La migration SQL est recommandée mais pas obligatoire.

### Que se passe-t-il si je n'exécute pas la migration SQL ?
Rien de grave. L'application continuera de fonctionner normalement, mais votre base de données contiendra des colonnes redondantes qui prennent de l'espace inutilement.

### Puis-je exécuter la migration SQL plus tard ?
Oui, vous pouvez l'exécuter à tout moment. Cependant, plus vous attendez, plus il y aura de données à migrer.

### La migration SQL affecte-t-elle les extractions en cours ?
Non, la migration n'affecte que les données déjà stockées dans `scans.ai_data`. Les nouvelles extractions utiliseront automatiquement la nouvelle structure.
