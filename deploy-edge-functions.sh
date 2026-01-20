#!/bin/bash

# Configuration
PROJECT_ID="lluabltdmlprrwggwhlq"
API_URL="https://api.supabase.com/v1/projects"

echo "📦 Déploiement des Edge Functions"
echo "=================================="

# Vérifier si on a besoin du access token
echo ""
echo "⚠️  Note: Tu dois avoir un access token Supabase"
echo "📍 Obtiens-le ici: https://supabase.com/dashboard/account/tokens"
echo ""
read -p "Colle ton Supabase Access Token: " ACCESS_TOKEN

if [ -z "$ACCESS_TOKEN" ]; then
  echo "❌ Access token vide. Annulation."
  exit 1
fi

# Fonction pour déployer une Edge Function
deploy_function() {
  local FUNC_NAME=$1
  local FUNC_PATH=$2
  
  echo ""
  echo "🚀 Déploiement de: $FUNC_NAME"
  
  # Compresser le répertoire de la fonction
  cd "$FUNC_PATH" || exit 1
  
  # Créer un bundle des fichiers
  tar -czf "${FUNC_NAME}.tar.gz" .
  
  # Créer la formule de déploiement
  curl -X POST \
    -H "Authorization: Bearer $ACCESS_TOKEN" \
    -H "Content-Type: application/octet-stream" \
    --data-binary "@${FUNC_NAME}.tar.gz" \
    "${API_URL}/${PROJECT_ID}/functions/${FUNC_NAME}/deploy" \
    2>&1
  
  rm "${FUNC_NAME}.tar.gz"
  
  echo ""
  echo "✅ $FUNC_NAME déployée"
}

# Déployer les deux fonctions
deploy_function "add-diacritics" "$(dirname "$0")/supabase/functions/add-diacritics"
deploy_function "extract-vocab" "$(dirname "$0")/supabase/functions/extract-vocab"

echo ""
echo "=================================="
echo "✅ Déploiement terminé!"
echo ""
echo "Teste dans l'app:"
echo "1. Ouvre l'app"
echo "2. Prends une photo ou choisis une image"
echo "3. Clique sur 'Faire l'OCR'"
echo "4. Clique sur '🔤 Ajouter voyelles' - tu devrais voir les diacritiques ajoutées"
