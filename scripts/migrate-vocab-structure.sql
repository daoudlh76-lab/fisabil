-- Migration script to update vocabulary structure
-- Removes mot_ar and verbe_ar columns (they are redundant with singulier and passe_3ms)

-- This migration updates the JSON structure in ai_data column of scans table
-- For vocabulaire: mot_ar → removed (use singulier instead)
-- For verbes: verbe_ar → removed (use passe_3ms instead)

-- Note: This is a Supabase/PostgreSQL migration
-- The ai_data column is JSONB type

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

-- Verification query (run this to check the results)
-- SELECT 
--   id, 
--   title,
--   ai_data->'vocabulaire'->0 as sample_vocab,
--   ai_data->'verbes'->0 as sample_verb
-- FROM scans
-- WHERE ai_data IS NOT NULL
-- LIMIT 5;
