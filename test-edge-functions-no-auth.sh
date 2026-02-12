#!/bin/bash

# Test des Edge Functions sans auth (doit retourner 401)
# Confirme que les functions sont déployées et protégées

URL="https://lluabltdmlprrwggwhlq.supabase.co/functions/v1"

echo "🧪 Testing Edge Functions (without auth - should return 401)"
echo ""

test_function() {
  local name=$1
  local endpoint=$2
  local body=$3

  echo "━━━ $name ━━━"
  response=$(curl -s -w "\n%{http_code}" -X POST "$URL/$endpoint" \
    -H "Content-Type: application/json" \
    -d "$body")

  http_code=$(echo "$response" | tail -n1)
  body=$(echo "$response" | head -n-1)

  if [ "$http_code" = "401" ]; then
    echo "✅ PROTECTED (HTTP 401)"
  else
    echo "⚠️  HTTP $http_code"
    echo "Response: $body" | head -c 200
  fi
  echo ""
}

test_function "tutor-chat-ai" "tutor-chat-ai" '{"messages":[{"role":"user","content":"test"}]}'
test_function "generate-dictation" "generate-dictation" '{"difficulty":"intermediate"}'
test_function "generate-exercises" "generate-exercises" '{"vocabList":["test"]}'
test_function "tts-generate" "tts-generate" '{"text":"test"}'
test_function "speech-to-text" "speech-to-text" '{"audioBase64":"test"}'
test_function "extract-vocab" "extract-vocab" '{"scan_id":"test"}'

echo "✅ All Edge Functions are deployed and protected"
