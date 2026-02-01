#!/bin/bash

# Script pour lancer les tests Firebase Test Lab
# Usage: ./launch-firebase-test.sh

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}🧪 Firebase Test Lab - Fisabil${NC}\n"

# Ajouter gcloud au PATH
export PATH=$PATH:$HOME/google-cloud-sdk/bin

# Vérifier gcloud
if ! command -v gcloud &> /dev/null; then
    echo -e "${RED}❌ gcloud n'est pas installé correctement${NC}"
    exit 1
fi

echo -e "${GREEN}✓ gcloud CLI version: $(gcloud version | head -1)${NC}\n"

# Vérifier l'authentification
if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" &> /dev/null || [ -z "$(gcloud auth list --filter=status:ACTIVE --format='value(account)')" ]; then
    echo -e "${YELLOW}⚠️  Authentification requise${NC}"
    echo "Ouverture du navigateur pour l'authentification..."
    gcloud auth login
fi

ACTIVE_ACCOUNT=$(gcloud auth list --filter=status:ACTIVE --format="value(account)")
echo -e "${GREEN}✓ Authentifié en tant que: $ACTIVE_ACCOUNT${NC}\n"

# Configurer le projet
PROJECT_ID=$(gcloud config get-value project 2>/dev/null)

if [ -z "$PROJECT_ID" ] || [ "$PROJECT_ID" == "(unset)" ]; then
    echo -e "${YELLOW}⚠️  Aucun projet configuré${NC}"
    echo "Entrez votre PROJECT_ID Firebase (ou créez-en un sur https://console.firebase.google.com/):"
    read PROJECT_ID
    gcloud config set project $PROJECT_ID
fi

echo -e "${GREEN}✓ Projet: $PROJECT_ID${NC}\n"

# Vérifier l'APK
APK_PATH="/Users/daoudlh/fisabil/fisabil.apk"

if [ ! -f "$APK_PATH" ]; then
    echo -e "${RED}❌ APK non trouvé: $APK_PATH${NC}"
    exit 1
fi

echo -e "${GREEN}✓ APK trouvé: $APK_PATH ($(du -h "$APK_PATH" | cut -f1))${NC}\n"

# Menu de choix
echo -e "${GREEN}🎯 Type de test:${NC}"
echo "1. Test rapide (2 appareils: Pixel2 ar + Pixel3 fr, 5 min)"
echo "2. Test complet (4 appareils variés, 15 min)"
echo "3. Test unique appareil (configuration manuelle)"
echo ""
echo -n "Choix (1-3): "
read CHOICE

case $CHOICE in
    1)
        echo -e "\n${GREEN}🚀 Lancement du test rapide...${NC}\n"
        gcloud firebase test android run \
            --type robo \
            --app "$APK_PATH" \
            --device model=Pixel2,version=30,locale=ar,orientation=portrait \
            --device model=Pixel3,version=29,locale=fr_FR,orientation=portrait \
            --timeout 5m
        ;;
    2)
        echo -e "\n${GREEN}🚀 Lancement du test complet...${NC}\n"
        gcloud firebase test android run \
            --type robo \
            --app "$APK_PATH" \
            --device model=Pixel2,version=30,locale=ar,orientation=portrait \
            --device model=Pixel3,version=29,locale=fr_FR,orientation=portrait \
            --device model=Pixel4,version=31,locale=ar,orientation=portrait \
            --device model=OnePlus7,version=30,locale=fr_FR,orientation=portrait \
            --timeout 15m
        ;;
    3)
        echo -e "\n${YELLOW}📋 Appareils disponibles (top 10):${NC}"
        gcloud firebase test android models list | head -15
        echo ""
        echo -n "Modèle (ex: Pixel3): "
        read MODEL
        echo -n "Version Android (ex: 30): "
        read VERSION
        echo -n "Locale (ar ou fr_FR): "
        read LOCALE
        echo -n "Timeout en minutes (ex: 10): "
        read TIMEOUT

        echo -e "\n${GREEN}🚀 Lancement du test...${NC}\n"
        gcloud firebase test android run \
            --type robo \
            --app "$APK_PATH" \
            --device model=$MODEL,version=$VERSION,locale=$LOCALE,orientation=portrait \
            --timeout ${TIMEOUT}m
        ;;
    *)
        echo -e "${RED}❌ Choix invalide${NC}"
        exit 1
        ;;
esac

echo -e "\n${GREEN}✅ Tests lancés avec succès!${NC}"
echo -e "${GREEN}📊 Résultats disponibles sur: https://console.firebase.google.com/project/$PROJECT_ID/testlab/histories${NC}"
