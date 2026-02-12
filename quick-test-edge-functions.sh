#!/bin/bash

# Script de test rapide des Edge Functions
# Utilise un JWT factice pour vérifier que les functions sont bien déployées et protégées

set -e

BLUE='\033[0;34m'
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

SUPABASE_URL="https://lluabltdmlprrwggwhlq.supabase.co"

echo -e "${BLUE}═══════════════════════════════════════════════${NC}"
echo -e "${BLUE}   TEST EDGE FUNCTIONS - VÉRIFICATION DÉPLOIEMENT${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════${NC}\n"

echo -e "${YELLOW}📋 Ce script vérifie que les Edge Functions sont:${NC}"
echo -e "  ✓ Déployées correctement"
echo -e "  ✓ Protégées par authentification"
echo -e "  ✓ Accessibles via HTTPS\n"

test_function() {
  local NAME=$1
  local ENDPOINT=$2

  echo -e "${BLUE}━━━ Test: ${NAME} ━━━${NC}"

  # Test sans auth (devrait retourner 401)
  HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
    -X POST \
    "${SUPABASE_URL}/functions/v1/${ENDPOINT}" \
    -H "Content-Type: application/json" \
    -d '{}')

  if [ "$HTTP_STATUS" -eq 401 ]; then
    echo -e "${GREEN}✅ DÉPLOYÉE & PROTÉGÉE${NC} (HTTP 401 - Auth requise)"
  elif [ "$HTTP_STATUS" -eq 404 ]; then
    echo -e "${RED}❌ NON DÉPLOYÉE${NC} (HTTP 404 - Fonction introuvable)"
  elif [ "$HTTP_STATUS" -eq 200 ]; then
    echo -e "${YELLOW}⚠️  DÉPLOYÉE MAIS NON PROTÉGÉE${NC} (HTTP 200 - Auth manquante!)"
  else
    echo -e "${YELLOW}⚠️  STATUT INATTENDU${NC} (HTTP ${HTTP_STATUS})"
  fi

  echo ""
}

# Tester toutes les Edge Functions
test_function "TTS Generate" "tts-generate"
test_function "Speech to Text" "speech-to-text"
test_function "Tutor Chat AI" "tutor-chat-ai"
test_function "Generate Dictation" "generate-dictation"
test_function "Generate Exercises" "generate-exercises"
test_function "Extract Vocab" "extract-vocab"

echo -e "${BLUE}═══════════════════════════════════════════════${NC}"
echo -e "${GREEN}✅ VÉRIFICATION TERMINÉE${NC}\n"

echo -e "${YELLOW}📝 Note:${NC} Pour tester avec authentification réelle:"
echo -e "   1. Lancez l'app: ${BLUE}npx expo start${NC}"
echo -e "   2. Connectez-vous dans le simulateur"
echo -e "   3. Récupérez le JWT dans les logs Metro"
echo -e "   4. Voir: ${BLUE}INSTRUCTIONS_TEST_EDGE_FUNCTIONS.md${NC}\n"
