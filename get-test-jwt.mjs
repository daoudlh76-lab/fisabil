#!/usr/bin/env node

/**
 * Script pour obtenir un JWT de test depuis Supabase
 * Utilise les credentials depuis les arguments de ligne de commande
 * ⚠️ À SUPPRIMER après les tests
 */

import { createClient } from '@supabase/supabase-js';
import { writeFileSync } from 'fs';

const SUPABASE_URL = 'https://lluabltdmlprrwggwhlq.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxsdWFibHRkbWxwcnJ3Z2d3aGxxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgzMzYyMzEsImV4cCI6MjA4MzkxMjIzMX0.wNdCm0oncfFOiT0aLumPAkmn1asx_b2eRY6pLTJStvY';

const email = process.argv[2];
const password = process.argv[3];

if (!email || !password) {
  console.error('Usage: node get-test-jwt.mjs <email> <password>');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

console.log('🔐 Connexion à Supabase...\n');

try {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password: password.trim(),
  });

  if (error) {
    console.error('❌ Erreur de connexion:', error.message);
    process.exit(1);
  }

  if (!data.session) {
    console.error('❌ Aucune session créée');
    process.exit(1);
  }

  console.log('✅ Connexion réussie!\n');
  console.log('User ID:', data.user.id);
  console.log('Email:', data.user.email);
  console.log('\n🔑 JWT Token:');
  console.log(data.session.access_token);
  console.log('\n');

  // Sauvegarder dans un fichier temporaire
  const testData = {
    userId: data.user.id,
    email: data.user.email,
    jwt: data.session.access_token,
    timestamp: new Date().toISOString(),
  };
  writeFileSync('/tmp/fisabil-test-jwt.json', JSON.stringify(testData, null, 2));
  console.log('💾 JWT sauvegardé dans /tmp/fisabil-test-jwt.json\n');

  process.exit(0);
} catch (err) {
  console.error('❌ Erreur:', err.message);
  process.exit(1);
}
