#!/bin/bash
# Test de la Edge Function process-arabic-text
# Usage: bash scripts/test-process-arabic.sh

SUPABASE_URL="https://lluabltdmlprrwggwhlq.supabase.co"
ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxsdWFibHRkbWxwcnJ3Z2d3aGxxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgzMzYyMzEsImV4cCI6MjA4MzkxMjIzMX0.wNdCm0oncfFOiT0aLumPAkmn1asx_b2eRY6pLTJStvY"

echo "📧 Email du compte test :"
read -r EMAIL
echo "🔑 Mot de passe :"
read -rs PASSWORD
echo ""

# Step 1: Login
echo "🔐 Connexion..."
LOGIN_RESPONSE=$(curl -s -X POST "${SUPABASE_URL}/auth/v1/token?grant_type=password" \
  -H "apikey: ${ANON_KEY}" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"${EMAIL}\",\"password\":\"${PASSWORD}\"}")

ACCESS_TOKEN=$(echo "$LOGIN_RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('access_token',''))" 2>/dev/null)

if [ -z "$ACCESS_TOKEN" ]; then
  echo "❌ Login échoué :"
  echo "$LOGIN_RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$LOGIN_RESPONSE"
  exit 1
fi

echo "✅ Connecté ! Token: ${ACCESS_TOKEN:0:20}..."

# Step 2: Créer une petite image de test avec du texte arabe
echo ""
echo "🖼️  Génération d'une image de test..."

# Utilise Python pour créer une image PNG simple avec du texte arabe
IMAGE_BASE64=$(python3 << 'PYEOF'
import base64
import io

try:
    from PIL import Image, ImageDraw, ImageFont
    # Créer une image blanche avec texte arabe
    img = Image.new('RGB', (400, 200), color='white')
    draw = ImageDraw.Draw(img)

    # Texte arabe simple
    text = "ذهب الولد إلى المدرسة وقرأ كتابا جميلا"

    # Essayer une police arabe système
    font = None
    for path in [
        "/System/Library/Fonts/Supplemental/GeezaPro.ttc",
        "/System/Library/Fonts/GeezaPro.ttc",
        "/Library/Fonts/Arial Unicode.ttf",
    ]:
        try:
            font = ImageFont.truetype(path, 28)
            break
        except:
            pass

    if not font:
        font = ImageFont.load_default()

    draw.text((20, 80), text, fill='black', font=font)

    buf = io.BytesIO()
    img.save(buf, format='PNG')
    print(base64.b64encode(buf.getvalue()).decode())

except ImportError:
    # Fallback: image PNG minimale 1x1 blanc (won't have text but tests the pipeline)
    import struct, zlib

    def create_minimal_png():
        # Texte en arabe encodé dans une image SVG convertie... trop complexe
        # On utilise juste un PNG minimal pour tester le pipeline
        header = b'\x89PNG\r\n\x1a\n'

        # IHDR
        ihdr_data = struct.pack('>IIBBBBB', 1, 1, 8, 2, 0, 0, 0)
        ihdr_crc = zlib.crc32(b'IHDR' + ihdr_data) & 0xffffffff
        ihdr = struct.pack('>I', 13) + b'IHDR' + ihdr_data + struct.pack('>I', ihdr_crc)

        # IDAT
        raw = zlib.compress(b'\x00\xff\xff\xff')
        idat_crc = zlib.crc32(b'IDAT' + raw) & 0xffffffff
        idat = struct.pack('>I', len(raw)) + b'IDAT' + raw + struct.pack('>I', idat_crc)

        # IEND
        iend_crc = zlib.crc32(b'IEND') & 0xffffffff
        iend = struct.pack('>I', 0) + b'IEND' + struct.pack('>I', iend_crc)

        return header + ihdr + idat + iend

    print(base64.b64encode(create_minimal_png()).decode())
PYEOF
)

if [ -z "$IMAGE_BASE64" ]; then
  echo "❌ Impossible de générer l'image de test"
  exit 1
fi

echo "✅ Image générée (${#IMAGE_BASE64} chars base64)"

# Step 3: Appeler la fonction
echo ""
echo "🚀 Appel de process-arabic-text..."
echo ""

RESPONSE=$(curl -s -w "\n---HTTP_CODE:%{http_code}---" \
  -X POST "${SUPABASE_URL}/functions/v1/process-arabic-text" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{\"image_base64\":\"${IMAGE_BASE64}\",\"ui_lang\":\"fr\"}")

HTTP_CODE=$(echo "$RESPONSE" | grep -o 'HTTP_CODE:[0-9]*' | cut -d: -f2)
BODY=$(echo "$RESPONSE" | sed 's/---HTTP_CODE:[0-9]*---//')

echo "📡 Status: ${HTTP_CODE}"
echo ""

if [ "$HTTP_CODE" = "200" ]; then
  echo "✅ Succès !"
  echo ""
  echo "$BODY" | python3 -m json.tool 2>/dev/null || echo "$BODY"
else
  echo "❌ Erreur ${HTTP_CODE} :"
  echo "$BODY" | python3 -m json.tool 2>/dev/null || echo "$BODY"
fi
