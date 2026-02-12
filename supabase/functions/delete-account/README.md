# Delete Account Edge Function

**Purpose:** Server-side account deletion (REQUIRED by Apple App Store)

This Edge Function handles complete account deletion including:
- All user data from 10 database tables
- Auth user account deletion via admin API

## Deployment

```bash
# Deploy the function
supabase functions deploy delete-account

# Verify deployment
supabase functions list
```

## Environment Variables Required

The function uses these environment variables (automatically available in Supabase):
- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_ANON_KEY` - Public anon key
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key (admin privileges)

**IMPORTANT:** Never expose `SUPABASE_SERVICE_ROLE_KEY` to the client. It's only used server-side.

## Testing

### 1. Get a test user JWT token

Login to your app or use Supabase Dashboard to get a valid JWT token.

Alternatively, create a test user:
```bash
# In your app or via Supabase Dashboard
# Create user: test@example.com / password123
```

### 2. Test the function with curl

```bash
# Replace with your project URL and JWT token
curl -i --location --request POST \
  'https://lluabltdmlprrwggwhlq.supabase.co/functions/v1/delete-account' \
  --header 'Authorization: Bearer YOUR_JWT_TOKEN_HERE' \
  --header 'Content-Type: application/json' \
  --data '{}'
```

### Expected Response

**Success (200):**
```json
{
  "ok": true,
  "message": "Account deleted successfully"
}
```

**Unauthorized (401):**
```json
{
  "error": "Unauthorized - Invalid or missing authentication"
}
```

**Server Error (500):**
```json
{
  "error": "Failed to delete user account",
  "details": "..."
}
```

### 3. Test from the app

1. Create a test account in the app
2. Login with that account
3. Go to Settings → Delete my account
4. Follow the deletion flow:
   - Read warning
   - Check acknowledgment
   - Type "DELETE"
   - Confirm in dialog
5. Account should be deleted and user logged out

## How It Works

1. **Authentication:**
   - Receives user's JWT token via Authorization header
   - Validates token and extracts user ID

2. **Data Deletion:**
   - Creates admin client with service role key
   - Deletes user data from all tables in parallel:
     - scans, ai_cache, vocab_cards_progress, vocabulary
     - audio_tracks, dictations, folders, subscriptions
     - store_transaction_log, receipt_verification_log

3. **Account Deletion:**
   - Uses admin API: `admin.auth.admin.deleteUser(userId)`
   - This permanently removes the user from Supabase Auth

4. **Response:**
   - Returns `{ ok: true }` on success
   - Client then signs out and redirects to login

## Security

- ✅ User authentication required (JWT token)
- ✅ Server-side deletion with admin privileges
- ✅ Service role key never exposed to client
- ✅ CORS headers for browser requests
- ✅ Error handling with appropriate status codes

## Apple App Store Compliance

This implementation meets Apple's requirements:
- ✅ Account deletion entirely in-app (no email required)
- ✅ Server-side execution with proper authentication
- ✅ Complete data removal from all tables
- ✅ Permanent auth account deletion
- ✅ User confirmation before deletion

## Logs

View function logs:
```bash
supabase functions logs delete-account

# Or in Supabase Dashboard:
# Edge Functions → delete-account → Logs
```

## Troubleshooting

**Error: "Unauthorized"**
- Check that Authorization header contains valid JWT token
- Verify token hasn't expired
- Ensure user is logged in

**Error: "Failed to delete user account"**
- Check Supabase service role key is set correctly
- Verify user ID exists in auth.users table
- Check function logs for detailed error

**Tables not being deleted**
- Check table names match exactly
- Verify foreign key constraints allow deletion
- Review function logs for specific table errors
