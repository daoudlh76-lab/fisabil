import { createClient } from 'jsr:@supabase/supabase-js@2';

// CORS headers for browser requests
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // 1. Create Supabase client with user's auth token
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const authHeader = req.headers.get('Authorization') || '';

    console.log('[Delete Account] Auth header present:', !!authHeader);
    console.log('[Delete Account] Auth header preview:', authHeader?.substring(0, 30) + '...');

    if (!authHeader) {
      console.error('[Delete Account] Missing Authorization header');
      return new Response(
        JSON.stringify({ error: 'Missing Authorization header' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: { Authorization: authHeader },
      },
    });

    // 2. Verify user authentication
    console.log('[Delete Account] Verifying JWT token...');
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      console.error('[Delete Account] Authentication failed:', {
        error: authError?.message,
        name: authError?.name,
        status: authError?.status,
        hasUser: !!user,
      });
      return new Response(
        JSON.stringify({
          error: 'Invalid JWT',
          details: authError?.message || 'User verification failed',
        }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const userId = user.id;
    console.log(`[Delete Account] Starting deletion for user: ${userId}`);

    // 3. Create admin client with service role key
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin = createClient(supabaseUrl, supabaseServiceRoleKey);

    // 4. Delete all user data from database tables
    // Run deletions in parallel for performance
    const deletionResults = await Promise.allSettled([
      admin.from('scans').delete().eq('user_id', userId),
      admin.from('ai_cache').delete().eq('user_id', userId),
      admin.from('vocab_cards_progress').delete().eq('user_id', userId),
      admin.from('vocabulary').delete().eq('user_id', userId),
      admin.from('audio_tracks').delete().eq('user_id', userId),
      admin.from('dictations').delete().eq('user_id', userId),
      admin.from('folders').delete().eq('user_id', userId),
      admin.from('subscriptions').delete().eq('user_id', userId),
      admin.from('store_transaction_log').delete().eq('user_id', userId),
      admin.from('receipt_verification_log').delete().eq('user_id', userId),
    ]);

    // Log any deletion errors (but continue to delete user)
    deletionResults.forEach((result, index) => {
      if (result.status === 'rejected') {
        console.error(`Table deletion ${index} failed:`, result.reason);
      }
    });

    console.log(`[Delete Account] Deleted data from ${deletionResults.length} tables`);

    // 5. Delete the auth user account (this is the critical step)
    const { error: deleteUserError } = await admin.auth.admin.deleteUser(userId);

    if (deleteUserError) {
      console.error('[Delete Account] Failed to delete user:', deleteUserError.message);
      return new Response(
        JSON.stringify({
          error: 'Failed to delete user account',
          details: deleteUserError.message,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    console.log(`[Delete Account] Successfully deleted user: ${userId}`);

    // 6. Return success
    return new Response(
      JSON.stringify({ ok: true, message: 'Account deleted successfully' }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    console.error('[Delete Account] Unexpected error:', error.message);
    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        details: error.message,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
