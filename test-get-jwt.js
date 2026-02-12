#!/usr/bin/env node

/**
 * Script temporaire pour récupérer le JWT Supabase
 * À SUPPRIMER après les tests
 */

const { createClient } = require('@supabase/supabase-js');
const readline = require('readline');

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('❌ Variables d\'environnement manquantes');
  console.error('Assurez-vous que EXPO_PUBLIC_SUPABASE_URL et EXPO_PUBLIC_SUPABASE_ANON_KEY sont définis');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.log('🔐 Connexion à Supabase pour obtenir un JWT de test\n');

rl.question('Email: ', (email) => {
  rl.question('Password: ', async (password) => {
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

      console.log('\n✅ Connexion réussie!\n');
      console.log('User ID:', data.user.id);
      console.log('\nJWT Token (à utiliser dans les tests):');
      console.log(data.session.access_token);
      console.log('\n');

      // Sauvegarder dans un fichier temporaire pour les tests
      const fs = require('fs');
      const testData = {
        userId: data.user.id,
        jwt: data.session.access_token,
        timestamp: new Date().toISOString(),
      };
      fs.writeFileSync('/tmp/fisabil-test-jwt.json', JSON.stringify(testData, null, 2));
      console.log('💾 JWT sauvegardé dans /tmp/fisabil-test-jwt.json\n');

      process.exit(0);
    } catch (err) {
      console.error('❌ Erreur:', err.message);
      process.exit(1);
    }
  });
});
