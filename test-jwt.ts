/**
 * Script de test pour vérifier le JWT Supabase
 * Usage: npx ts-node test-jwt.ts
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

async function testJWT() {
  console.log('🔍 Testing JWT validation...');
  console.log('📡 Supabase URL:', SUPABASE_URL);

  // Simuler un JWT qui arrive côté serveur
  const testToken = 'eyJhbGciOiJFUzI1NiIs...'; // Remplacer par le vrai token du client

  const supabase = createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || '', {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase.auth.getUser(testToken);

  if (error) {
    console.error('❌ JWT invalide:', error.message);
    console.error('   Code:', error.code);
  } else {
    console.log('✅ JWT valide!');
    console.log('   User ID:', data.user.id);
    console.log('   Email:', data.user.email);
  }
}

testJWT().catch(console.error);
