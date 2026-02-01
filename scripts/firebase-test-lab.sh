#!/bin/bash

# Script pour lancer les tests Firebase Test Lab pour Fisabil
# Usage: ./scripts/firebase-test-lab.sh [APK_PATH]

set -e

# Couleurs pour les messages
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}🧪 Firebase Test Lab - Fisabil${NC}\n"

# Vérifier que gcloud est installé
if ! command -v gcloud &> /dev/null; then
    echo -e "${RED}❌ gcloud CLI n'est pas installé${NC}"
    echo "Installez-le avec: curl https://sdk.cloud.google.com | bash"
    exit 1
fi

# Vérifier l'authentification
if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" &> /dev/null; then
    echo -e "${YELLOW}⚠️  Vous devez vous authentifier${NC}"
    gcloud auth login
fi

# Récupérer le PROJECT_ID
PROJECT_ID=$(gcloud config get-value project 2>/dev/null)

if [ -z "$PROJECT_ID" ]; then
    echo -e "${YELLOW}⚠️  Aucun projet configuré${NC}"
    echo "Entrez votre PROJECT_ID Firebase:"
    read PROJECT_ID
    gcloud config set project $PROJECT_ID
fi

echo -e "${GREEN}📋 Projet: $PROJECT_ID${NC}\n"

# Chemin vers l'APK
APK_PATH=${1:-"./fisabil.apk"}

if [ ! -f "$APK_PATH" ]; then
    echo -e "${YELLOW}⚠️  APK non trouvé: $APK_PATH${NC}"
    echo "Téléchargement du dernier build depuis EAS..."

    if ! command -v eas &> /dev/null; then
        echo -e "${RED}❌ EAS CLI n'est pas installé${NC}"
        echo "Installez-le avec: npm install -g eas-cli"
        exit 1
    fi

    eas build:download --platform android --profile preview --output ./fisabil.apk
    APK_PATH="./fisabil.apk"
fi

echo -e "${GREEN}📦 APK trouvé: $APK_PATH${NC}\n"

# Configuration des tests
echo -e "${GREEN}🎯 Configuration des tests:${NC}"
echo "1. Test rapide (2 appareils, 5 min)"
echo "2. Test complet (4 appareils, 15 min)"
echo "3. Test personnalisé"
echo ""
echo -n "Choisissez une option (1-3): "
read TEST_OPTION

case $TEST_OPTION in
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
        echo -e "\n${YELLOW}📱 Appareils disponibles:${NC}"
        gcloud firebase test android models list | head -20
        echo ""
        echo -n "Entrez le modèle (ex: Pixel3): "
        read MODEL
        echo -n "Entrez la version Android (ex: 30): "
        read VERSION
        echo -n "Entrez la locale (ex: ar ou fr_FR): "
        read LOCALE
        echo -n "Timeout en minutes (ex: 10): "
        read TIMEOUT

        echo -e "\n${GREEN}🚀 Lancement du test personnalisé...${NC}\n"
        gcloud firebase test android run \
            --type robo \
            --app "$APK_PATH" \
            --device model=$MODEL,version=$VERSION,locale=$LOCALE,orientation=portrait \
            --timeout ${TIMEOUT}m
        ;;
    *)
        echo -e "${RED}❌ Option invalide${NC}"
        exit 1
        ;;
esac

echo -e "\n${GREEN}✅ Tests lancés avec succès!${NC}"
echo -e "${GREEN}📊 Résultats disponibles sur: https://console.firebase.google.com/project/$PROJECT_ID/testlab/histories${NC}"
