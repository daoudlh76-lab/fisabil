#!/bin/bash

# Test script pour la Supabase Edge Function extract-vocab
# Usage: ./test-extract-vocab.sh <supabase-url> <auth-token>

SUPABASE_URL="${1:-https://lluabltdmlprrwggwhlq.supabase.co}"
AUTH_TOKEN="${2:-}"
FUNCTION_NAME="extract-vocab"

if [ -z "$AUTH_TOKEN" ]; then
  echo "❌ Error: Auth token required"
  echo "Usage: $0 <supabase-url> <auth-token>"
  exit 1
fi

# Test data (remplacer par un vrai scan_id)
SCAN_ID="test-scan-123"

echo "🧪 Testing Edge Function: $FUNCTION_NAME"
echo "URL: $SUPABASE_URL"
echo "---"

# Call the function
curl -X POST \
  "$SUPABASE_URL/functions/v1/$FUNCTION_NAME" \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"scan_id\": \"$SCAN_ID\",
    \"ui_lang\": \"fr\"
  }" \
  -w "\n\nStatus: %{http_code}\n"

echo ""
echo "✅ Test completed"
