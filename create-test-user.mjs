#!/usr/bin/env node

/**
 * Crée un utilisateur de test temporaire et obtient son JWT
 * ⚠️ À SUPPRIMER après les tests
 */

import { createClient } from '@supabase/supabase-js';
import { writeFileSync } from 'fs';
import { randomBytes } from 'crypto';

const SUPABASE_URL = 'https://lluabltdmlprrwggwhlq.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxsdWFibHRkbWxwcnJ3Z2d3aGxxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgzMzYyMzEsImV4cCI6MjA4MzkxMjIzMX0.wNdCm0oncfFOiT0aLumPAkmn1asx_b2eRY6pLTJStvY';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Générer des credentials temporaires
const timestamp = Date.now();
const randomId = randomBytes(4).toString('hex');
const testEmail = `test-${timestamp}-${randomId}@fisabil-test.local`;
const testPassword = `TestPass${timestamp}!${randomId}`;

console.log('🔧 Création d\'un utilisateur de test temporaire...\n');
console.log('Email:', testEmail);
console.log('Password:', testPassword);
console.log('');

try {
  // Créer le compte
  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
    email: testEmail,
    password: testPassword,
  });

  if (signUpError) {
    console.error('❌ Erreur lors de la création:', signUpError.message);

    // Si l'erreur est "email confirmatioon required", on essaie de se connecter quand même
    if (signUpError.message.includes('confirmation')) {
      console.log('\n⚠️  Email confirmation requise, tentative de connexion...\n');

      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email: testEmail,
        password: testPassword,
      });

      if (signInError) {
        console.error('❌ Connexion impossible:', signInError.message);
        process.exit(1);
      }

      if (!signInData.session) {
        console.error('❌ Aucune session créée');
        process.exit(1);
      }

      console.log('✅ Connexion réussie malgré l\'email non confirmé!\n');
      console.log('User ID:', signInData.user.id);
      console.log('\n🔑 JWT Token:');
      console.log(signInData.session.access_token);

      // Sauvegarder
      const testData = {
        userId: signInData.user.id,
        email: testEmail,
        password: testPassword,
        jwt: signInData.session.access_token,
        timestamp: new Date().toISOString(),
      };
      writeFileSync('/tmp/fisabil-test-jwt.json', JSON.stringify(testData, null, 2));
      console.log('\n💾 JWT sauvegardé dans /tmp/fisabil-test-jwt.json\n');

      process.exit(0);
    }

    process.exit(1);
  }

  if (!signUpData.session) {
    console.log('⚠️  Compte créé mais session non disponible (email confirmation requise)');
    console.log('Tentative de connexion directe...\n');

    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
      email: testEmail,
      password: testPassword,
    });

    if (signInError) {
      console.error('❌ Connexion impossible:', signInError.message);
      console.error('Le compte a été créé mais nécessite peut-être une confirmation email.');
      process.exit(1);
    }

    if (!signInData.session) {
      console.error('❌ Aucune session créée');
      process.exit(1);
    }

    console.log('✅ Compte créé et connecté!\n');
    console.log('User ID:', signInData.user.id);
    console.log('\n🔑 JWT Token:');
    console.log(signInData.session.access_token);

    const testData = {
      userId: signInData.user.id,
      email: testEmail,
      password: testPassword,
      jwt: signInData.session.access_token,
      timestamp: new Date().toISOString(),
    };
    writeFileSync('/tmp/fisabil-test-jwt.json', JSON.stringify(testData, null, 2));
    console.log('\n💾 JWT sauvegardé dans /tmp/fisabil-test-jwt.json\n');

    process.exit(0);
  }

  // Session immédiatement disponible
  console.log('✅ Compte créé avec succès!\n');
  console.log('User ID:', signUpData.user.id);
  console.log('Email:', signUpData.user.email);
  console.log('\n🔑 JWT Token:');
  console.log(signUpData.session.access_token);

  const testData = {
    userId: signUpData.user.id,
    email: testEmail,
    password: testPassword,
    jwt: signUpData.session.access_token,
    timestamp: new Date().toISOString(),
  };
  writeFileSync('/tmp/fisabil-test-jwt.json', JSON.stringify(testData, null, 2));
  console.log('\n💾 JWT sauvegardé dans /tmp/fisabil-test-jwt.json\n');

  process.exit(0);
} catch (err) {
  console.error('❌ Erreur:', err.message);
  process.exit(1);
}
