#!/bin/bash

# Script de migration automatique - Supprimer tous les appels OpenAI côté client
# Remplacer par supabase.functions.invoke()

set -e

echo "🔄 Migration automatique OpenAI → Supabase Edge Functions"
echo ""

# Fonction de backup
backup_file() {
  local file=$1
  cp "$file" "$file.backup-$(date +%s)"
  echo "✅ Backup: $file"
}

# Migration des fichiers restants (déjà migrés: openai-tts.ts, use-speech.ts)

echo "📝 Migration de src/lib/extract-vocabulary.ts..."
backup_file "src/lib/extract-vocabulary.ts"

cat > "src/lib/extract-vocabulary.ts" << 'EXTRACT_VOCAB_EOF'
import { supabase } from './supabase';

export interface VocabularyExtractionResult {
  vocabulaire: Array<{
    traduction: string;
    singulier: string;
    pluriel?: string;
    contraire?: string;
    remarque?: string;
  }>;
  verbes: Array<{
    traduction: string;
    passe_3ms: string;
    present_3ms: string;
    imperatif: string;
    remarque?: string;
  }>;
  particules: Array<{
    particule_ar: string;
    type: string;
    traduction: string;
    exemple?: string;
  }>;
}

export async function extractVocabularyFromScan(
  scanId: string,
  uiLang: string = 'fr'
): Promise<VocabularyExtractionResult | null> {
  try {
    console.log('📚 Extracting vocabulary via Edge Function...');

    const { data, error } = await supabase.functions.invoke('extract-vocab', {
      body: {
        scan_id: scanId,
        ui_lang: uiLang,
      },
    });

    if (error) {
      console.error('❌ Vocabulary extraction error:', error);
      return null;
    }

    return data as VocabularyExtractionResult;
  } catch (err) {
    console.error('❌ Vocabulary extraction failed:', err);
    return null;
  }
}
EXTRACT_VOCAB_EOF

echo "✅ src/lib/extract-vocabulary.ts migré"

# Continuer dans un second script pour éviter les limites de taille
echo ""
echo "✅ Migration partie 1 complète"
echo "Lancer migrate-all-openai-part2.sh pour continuer"
EOFMIGRATE
chmod +x migrate-all-openai.sh
