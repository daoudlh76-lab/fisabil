#!/bin/bash

# Script de nettoyage des fichiers de test temporaires
# À exécuter après avoir terminé les tests des Edge Functions

set -e

YELLOW='\033[1;33m'
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${YELLOW}🧹 Nettoyage des fichiers de test temporaires...${NC}\n"

# Liste des fichiers à supprimer
FILES=(
  "test-get-jwt.js"
  "get-test-jwt.mjs"
  "create-test-user.mjs"
  "test-edge-functions.sh"
  "quick-test-edge-functions.sh"
  "cleanup-test-files.sh"
  "/tmp/fisabil-test-jwt.json"
)

DELETED=0
NOT_FOUND=0

for FILE in "${FILES[@]}"; do
  if [ -f "$FILE" ]; then
    rm -f "$FILE"
    echo -e "${GREEN}✅ Supprimé:${NC} $FILE"
    DELETED=$((DELETED + 1))
  else
    echo -e "${YELLOW}⊘  Non trouvé:${NC} $FILE"
    NOT_FOUND=$((NOT_FOUND + 1))
  fi
done

echo -e "\n${GREEN}═══════════════════════════════════════════${NC}"
echo -e "Fichiers supprimés: ${GREEN}${DELETED}${NC}"
echo -e "Fichiers non trouvés: ${YELLOW}${NOT_FOUND}${NC}"
echo -e "${GREEN}═══════════════════════════════════════════${NC}\n"

echo -e "${YELLOW}📝 Note:${NC} Les fichiers suivants sont conservés (documentation):"
echo -e "  • ${GREEN}RAPPORT_TEST_EDGE_FUNCTIONS.md${NC}"
echo -e "  • ${GREEN}INSTRUCTIONS_TEST_EDGE_FUNCTIONS.md${NC}"
echo -e "  • ${GREEN}MIGRATION_GUIDE.md${NC}"
echo -e "  • ${GREEN}DEPLOYMENT_COMMANDS.md${NC}"
echo -e "  • ${GREEN}MIGRATION_COMPLETE_REPORT.md${NC}\n"

echo -e "${YELLOW}⚠️  Action manuelle requise:${NC}"
echo -e "  Dans ${GREEN}src/lib/supabase.ts${NC}, le log JWT est commenté."
echo -e "  Il peut être supprimé définitivement si vous le souhaitez.\n"

echo -e "${GREEN}✅ Nettoyage terminé !${NC}\n"
