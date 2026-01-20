#!/bin/bash
# Patch le manifest généré par EAS pour corriger le conflit appComponentFactory
set -e
MANIFEST="build/android/app/src/debug/AndroidManifest.xml"
if [ -f "$MANIFEST" ]; then
  echo "Patching $MANIFEST..."
  # Ajoute tools:replace="android:appComponentFactory" si absent
  FILES=(
    "node_modules/@react-native-async-storage/async-storage/android/src/main/AndroidManifest.xml"
    "node_modules/react-native-safe-area-context/android/src/main/AndroidManifest.xml"
    "node_modules/@react-native-voice/voice/android/src/main/AndroidManifest.xml"
  )
  for FILE in "${FILES[@]}"; do
    if [ -f "$FILE" ]; then
      echo "Patching $FILE..."
      # Supprime l'attribut package="..." de la balise <manifest>
      sed -i '' 's/ package="[^"]*"//' "$FILE"
    fi
  done
fi
