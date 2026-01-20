#!/bin/bash
# Patch le AndroidManifest.xml généré pour corriger le conflit appComponentFactory
set -e

echo "Recherche et patch de tous les AndroidManifest.xml générés pour appComponentFactory dans build/android/app/..."

# Recherche tous les manifests dans build/android/app/ et ses sous-dossiers
find build/android/app/ -name AndroidManifest.xml | while read -r MANIFEST; do
  echo "Patching $MANIFEST..."
  # Ajoute xmlns:tools si absent
  if ! grep -q 'xmlns:tools=' "$MANIFEST"; then
    sed -i.bak 's|<manifest|<manifest xmlns:tools=\"http://schemas.android.com/tools\"|' "$MANIFEST"
  fi
  # Ajoute tools:replace sur <application> si absent
  if ! grep -q 'tools:replace=\"android:appComponentFactory\"' "$MANIFEST"; then
    sed -i.bak 's|<application|<application tools:replace=\"android:appComponentFactory\"|' "$MANIFEST"
  fi
  rm -f "$MANIFEST.bak"
done

echo "Patch appComponentFactory appliqué à tous les manifests dans build/android/app/. Relance le build si besoin."
