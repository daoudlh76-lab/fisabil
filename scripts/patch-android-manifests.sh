#!/bin/bash
# Patch AndroidManifest.xml in node_modules to remove deprecated package attribute for AGP 8+

set -e

echo "Patching AndroidManifest.xml for AGP 8+ compatibility..."

# List of modules to patch
MODULES=(
  "@react-native-async-storage/async-storage"
  "@react-native-voice/voice"
)

for MODULE in "${MODULES[@]}"; do
  MANIFEST="node_modules/$MODULE/android/src/main/AndroidManifest.xml"
  if [ -f "$MANIFEST" ]; then
    echo "  - Patching $MANIFEST"
    # Remove any line containing package="..."
    sed -i.bak '/package="[^"]*"/d' "$MANIFEST"
  fi
done

echo "Patch terminé. Relance le build EAS."
