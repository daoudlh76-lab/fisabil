#!/bin/bash

# Script de test automatique des Edge Functions Supabase
# ⚠️ À SUPPRIMER après les tests

set -e

# Couleurs pour les logs
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# URL du projet Supabase
SUPABASE_URL="https://lluabltdmlprrwggwhlq.supabase.co"

# Vérifier que le JWT existe
if [ ! -f /tmp/fisabil-test-jwt.json ]; then
  echo -e "${RED}❌ JWT non trouvé. Exécutez d'abord: node test-get-jwt.js${NC}"
  exit 1
fi

# Charger le JWT
JWT=$(cat /tmp/fisabil-test-jwt.json | grep -o '"jwt": "[^"]*' | cut -d'"' -f4)
USER_ID=$(cat /tmp/fisabil-test-jwt.json | grep -o '"userId": "[^"]*' | cut -d'"' -f4)

if [ -z "$JWT" ]; then
  echo -e "${RED}❌ JWT vide${NC}"
  exit 1
fi

echo -e "${BLUE}═══════════════════════════════════════════════${NC}"
echo -e "${BLUE}   TEST EDGE FUNCTIONS SUPABASE - FISABIL${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════${NC}"
echo -e "User ID: ${YELLOW}${USER_ID}${NC}"
echo -e "JWT: ${YELLOW}${JWT:0:30}...${NC}\n"

# Compteurs
TOTAL=0
SUCCESS=0
FAILED=0

# Fonction de test
test_function() {
  local NAME=$1
  local ENDPOINT=$2
  local BODY=$3

  TOTAL=$((TOTAL + 1))

  echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${YELLOW}TEST ${TOTAL}: ${NAME}${NC}"
  echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "Endpoint: ${SUPABASE_URL}/functions/v1/${ENDPOINT}"
  echo -e "Body: ${BODY}\n"

  # Exécuter la requête
  RESPONSE=$(curl -s -w "\nHTTP_STATUS:%{http_code}" \
    -X POST \
    "${SUPABASE_URL}/functions/v1/${ENDPOINT}" \
    -H "Authorization: Bearer ${JWT}" \
    -H "Content-Type: application/json" \
    -d "${BODY}")

  # Extraire le code HTTP
  HTTP_STATUS=$(echo "$RESPONSE" | grep "HTTP_STATUS:" | cut -d: -f2)
  BODY_RESPONSE=$(echo "$RESPONSE" | sed '/HTTP_STATUS:/d')

  # Vérifier le résultat
  if [ "$HTTP_STATUS" -eq 200 ]; then
    echo -e "${GREEN}✅ SUCCÈS${NC} (HTTP ${HTTP_STATUS})"
    SUCCESS=$((SUCCESS + 1))

    # Afficher un extrait de la réponse
    echo -e "\nRéponse (extrait):"
    echo "$BODY_RESPONSE" | head -c 500
    echo -e "\n..."
  else
    echo -e "${RED}❌ ÉCHEC${NC} (HTTP ${HTTP_STATUS})"
    FAILED=$((FAILED + 1))

    # Afficher l'erreur complète
    echo -e "\nErreur:"
    echo "$BODY_RESPONSE"
  fi
}

# ═══════════════════════════════════════════════════════════
# TESTS
# ═══════════════════════════════════════════════════════════

# 1. Test tutor-chat-ai
test_function \
  "Tutor Chat AI" \
  "tutor-chat-ai" \
  '{"messages":[{"role":"user","content":"مرحبا، كيف حالك؟"}],"language":"ar"}'

# 2. Test generate-dictation
test_function \
  "Generate Dictation" \
  "generate-dictation" \
  '{"difficulty":"intermediate","length":3}'

# 3. Test generate-exercises
test_function \
  "Generate Exercises" \
  "generate-exercises" \
  '{"vocabList":["كتاب","قلم","مدرسة"],"difficulty":"beginner","count":3}'

# 4. Test tts-generate
test_function \
  "TTS Generate" \
  "tts-generate" \
  '{"text":"مرحبا بك في فصبل","voice":"alloy","format":"mp3"}'

# 5. Test speech-to-text (avec audio base64 minimal - sera invalide mais teste l'auth)
test_function \
  "Speech to Text (Auth Check)" \
  "speech-to-text" \
  '{"audioBase64":"test","language":"ar"}'

# Note: extract-vocab nécessite un scan_id existant, donc on le teste séparément si besoin

# ═══════════════════════════════════════════════════════════
# RÉSUMÉ
# ═══════════════════════════════════════════════════════════

echo -e "\n\n${BLUE}═══════════════════════════════════════════════${NC}"
echo -e "${BLUE}              RÉSUMÉ DES TESTS${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════${NC}"
echo -e "Total:   ${TOTAL}"
echo -e "Succès:  ${GREEN}${SUCCESS}${NC}"
echo -e "Échecs:  ${RED}${FAILED}${NC}"

if [ $FAILED -eq 0 ]; then
  echo -e "\n${GREEN}🎉 TOUS LES TESTS SONT PASSÉS !${NC}\n"
  exit 0
else
  echo -e "\n${RED}⚠️  Certains tests ont échoué${NC}\n"
  exit 1
fi
