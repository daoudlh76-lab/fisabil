#!/bin/bash

# Script de déploiement pour les Edge Functions Supabase
# Usage: ./deploy-functions.sh

set -e

echo "🚀 Deploiement des Supabase Edge Functions"
echo "==========================================="
echo ""

# Vérifier que supabase est installé
if ! command -v supabase &> /dev/null; then
    echo "❌ Supabase CLI n'est pas installé"
    echo ""
    echo "Installation via Homebrew (macOS):"
    echo "  brew install supabase/tap/supabase"
    echo ""
    echo "Ou voir: https://supabase.com/docs/guides/cli/getting-started"
    exit 1
fi

# Configuration
SUPABASE_URL="https://lluabltdmlprrwggwhlq.supabase.co"
FUNCTION_NAMES=("extract-vocab" "add-diacritics")

# Vérifier la connexion
echo "📋 Vérification de la connexion..."
if ! supabase projects list &>/dev/null; then
    echo "❌ Non connecté à Supabase"
    echo "Exécutez: supabase login"
    exit 1
fi

echo "✅ Connecté à Supabase"
echo ""

# Lier le projet (si pas déjà lié)
echo "🔗 Liaison du projet..."
if [ ! -f ".supabase/config.json" ]; then
    supabase link --project-ref lluabltdmlprrwggwhlq || true
fi

echo "✅ Projet lié"
echo ""

# Déployer chaque fonction
for func in "${FUNCTION_NAMES[@]}"; do
    echo "📤 Déploiement de: $func"
    if [ -d "supabase/functions/$func" ]; then
        supabase functions deploy "$func" && echo "✅ $func déployée" || echo "⚠️ $func: erreur"
    else
        echo "⚠️ Dossier supabase/functions/$func introuvable"
    fi
    echo ""
done

echo ""
echo "==========================================="
echo "✅ Déploiement terminé!"
echo ""
echo "Testé sur: $SUPABASE_URL"
echo ""
echo "Pour des tests supplémentaires:"
echo "  1. Ouvrir l'app Expo"
echo "  2. Cliquer sur 'Générer vocabulaire' ou 'Ajouter voyelles'"
echo "  3. Les données réelles d'IA apparaîtront (sinon mock data)"
