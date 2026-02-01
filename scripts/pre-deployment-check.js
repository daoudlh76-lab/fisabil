#!/usr/bin/env node

/**
 * Script de vérification pré-déploiement pour Fisabil
 * Vérifie que tous les éléments nécessaires sont en place avant le build de production
 */

const fs = require('fs');
const path = require('path');

const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const RESET = '\x1b[0m';

let hasErrors = false;
let hasWarnings = false;

function log(message, color = RESET) {
  console.log(`${color}${message}${RESET}`);
}

function success(message) {
  log(`✅ ${message}`, GREEN);
}

function error(message) {
  log(`❌ ${message}`, RED);
  hasErrors = true;
}

function warning(message) {
  log(`⚠️  ${message}`, YELLOW);
  hasWarnings = true;
}

function info(message) {
  log(`ℹ️  ${message}`, BLUE);
}

function checkFileExists(filePath, required = true) {
  const exists = fs.existsSync(filePath);
  if (exists) {
    success(`${filePath} trouvé`);
    return true;
  } else {
    if (required) {
      error(`${filePath} manquant`);
    } else {
      warning(`${filePath} manquant (optionnel)`);
    }
    return false;
  }
}

function checkAppJson() {
  info('\n📱 Vérification de app.json...');

  if (!checkFileExists('app.json')) return;

  const appJson = JSON.parse(fs.readFileSync('app.json', 'utf8'));
  const expo = appJson.expo;

  // Vérifier les champs requis
  const requiredFields = [
    'name',
    'slug',
    'version',
    'icon',
    'description',
    'privacy'
  ];

  requiredFields.forEach(field => {
    if (expo[field]) {
      success(`${field}: ${expo[field]}`);
    } else {
      error(`Champ manquant dans app.json: ${field}`);
    }
  });

  // Vérifier iOS
  if (expo.ios) {
    if (expo.ios.bundleIdentifier) {
      success(`iOS bundleIdentifier: ${expo.ios.bundleIdentifier}`);
    } else {
      error('iOS bundleIdentifier manquant');
    }

    if (expo.ios.buildNumber) {
      success(`iOS buildNumber: ${expo.ios.buildNumber}`);
    } else {
      warning('iOS buildNumber manquant (sera auto-incrémenté)');
    }

    // Vérifier permissions iOS
    const requiredPermissions = [
      'NSCameraUsageDescription',
      'NSMicrophoneUsageDescription',
      'NSSpeechRecognitionUsageDescription'
    ];

    requiredPermissions.forEach(perm => {
      if (expo.ios.infoPlist && expo.ios.infoPlist[perm]) {
        success(`Permission iOS: ${perm}`);
      } else {
        error(`Permission iOS manquante: ${perm}`);
      }
    });
  } else {
    error('Configuration iOS manquante dans app.json');
  }

  // Vérifier Android
  if (expo.android) {
    if (expo.android.package) {
      success(`Android package: ${expo.android.package}`);
    } else {
      error('Android package manquant');
    }

    if (expo.android.versionCode) {
      success(`Android versionCode: ${expo.android.versionCode}`);
    } else {
      warning('Android versionCode manquant (sera auto-incrémenté)');
    }

    // Vérifier permissions Android
    const requiredPermissions = [
      'android.permission.CAMERA',
      'android.permission.RECORD_AUDIO',
      'android.permission.INTERNET'
    ];

    requiredPermissions.forEach(perm => {
      if (expo.android.permissions && expo.android.permissions.includes(perm)) {
        success(`Permission Android: ${perm}`);
      } else {
        error(`Permission Android manquante: ${perm}`);
      }
    });
  } else {
    error('Configuration Android manquante dans app.json');
  }

  // Vérifier EAS project ID
  if (expo.extra && expo.extra.eas && expo.extra.eas.projectId) {
    success(`EAS Project ID: ${expo.extra.eas.projectId}`);
  } else {
    error('EAS Project ID manquant');
  }
}

function checkAssets() {
  info('\n🎨 Vérification des assets...');

  const requiredAssets = [
    'assets/logo.png',
    'assets/adaptive-icon.png',
    'assets/images/icon.png'
  ];

  requiredAssets.forEach(asset => checkFileExists(asset));

  // Vérifier la taille du logo
  if (fs.existsSync('assets/logo.png')) {
    const stats = fs.statSync('assets/logo.png');
    const sizeMB = stats.size / (1024 * 1024);
    if (sizeMB > 2) {
      warning(`Logo trop lourd: ${sizeMB.toFixed(2)}MB (recommandé < 1MB)`);
    } else {
      success(`Taille du logo OK: ${sizeMB.toFixed(2)}MB`);
    }
  }
}

function checkEasJson() {
  info('\n🔧 Vérification de eas.json...');

  if (!checkFileExists('eas.json')) return;

  const easJson = JSON.parse(fs.readFileSync('eas.json', 'utf8'));

  if (easJson.build && easJson.build.production) {
    success('Profile production configuré');

    if (easJson.build.production.autoIncrement) {
      success('Auto-increment activé');
    } else {
      warning('Auto-increment désactivé (versions manuelles)');
    }
  } else {
    error('Profile production manquant dans eas.json');
  }

  if (easJson.submit && easJson.submit.production) {
    success('Submit production configuré');
  } else {
    warning('Submit production non configuré (soumission manuelle nécessaire)');
  }
}

function checkEnvironmentVariables() {
  info('\n🔐 Vérification des variables d\'environnement...');

  checkFileExists('.env.example', false);
  checkFileExists('.env.production.example', false);

  if (checkFileExists('.env.production', false)) {
    const envContent = fs.readFileSync('.env.production', 'utf8');

    const requiredVars = [
      'EXPO_PUBLIC_SUPABASE_URL',
      'EXPO_PUBLIC_SUPABASE_ANON_KEY',
      'EXPO_PUBLIC_OPENAI_API_KEY'
    ];

    requiredVars.forEach(varName => {
      if (envContent.includes(varName)) {
        // Vérifier que ce n'est pas juste un placeholder
        const match = envContent.match(new RegExp(`${varName}=(.+)`));
        if (match && match[1] && !match[1].includes('your_') && !match[1].includes('example')) {
          success(`${varName} configuré`);
        } else {
          error(`${varName} semble être un placeholder`);
        }
      } else {
        error(`${varName} manquant dans .env.production`);
      }
    });
  } else {
    warning('.env.production non trouvé - build utilisera les variables par défaut');
  }
}

function checkDocumentation() {
  info('\n📄 Vérification de la documentation...');

  checkFileExists('PRIVACY_POLICY.md');
  checkFileExists('STORE_LISTING.md', false);
  checkFileExists('DEPLOYMENT_GUIDE.md', false);
  checkFileExists('README.md', false);
}

function checkGitIgnore() {
  info('\n🚫 Vérification de .gitignore...');

  if (!checkFileExists('.gitignore')) return;

  const gitignoreContent = fs.readFileSync('.gitignore', 'utf8');

  const sensitivePatterns = [
    '.env',
    '.env.production',
    'google-service-account.json',
    '*.keystore',
    '*.jks',
    '*.p12',
    '*.key'
  ];

  sensitivePatterns.forEach(pattern => {
    if (gitignoreContent.includes(pattern)) {
      success(`Pattern ignoré: ${pattern}`);
    } else {
      error(`Pattern manquant dans .gitignore: ${pattern}`);
    }
  });

  // Vérifier qu'il n'y a pas de fichiers sensibles commités
  const sensitiveFiles = [
    '.env.production',
    'google-service-account.json'
  ];

  sensitiveFiles.forEach(file => {
    if (fs.existsSync(file)) {
      warning(`Fichier sensible existe: ${file} - Assurez-vous qu'il n'est pas commité!`);
    }
  });
}

function checkPackageJson() {
  info('\n📦 Vérification de package.json...');

  if (!checkFileExists('package.json')) return;

  const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));

  if (packageJson.name) {
    success(`Nom du package: ${packageJson.name}`);
  }

  if (packageJson.version) {
    success(`Version: ${packageJson.version}`);
  }

  // Vérifier les dépendances critiques
  const criticalDeps = [
    'expo',
    'expo-router',
    'react-native',
    '@supabase/supabase-js',
    'expo-image-picker',
    'expo-av',
    'expo-speech'
  ];

  criticalDeps.forEach(dep => {
    if (packageJson.dependencies && packageJson.dependencies[dep]) {
      success(`Dépendance: ${dep}@${packageJson.dependencies[dep]}`);
    } else {
      error(`Dépendance manquante: ${dep}`);
    }
  });
}

function printSummary() {
  console.log('\n' + '='.repeat(60));
  console.log('📊 RÉSUMÉ DE LA VÉRIFICATION');
  console.log('='.repeat(60));

  if (!hasErrors && !hasWarnings) {
    success('\n✨ Tout est prêt pour le déploiement!');
    console.log('\nProchaines étapes:');
    console.log('1. eas build --platform all --profile production');
    console.log('2. eas submit --platform all --latest');
    console.log('3. Remplir les store listings (voir STORE_LISTING.md)');
    console.log('4. Soumettre pour review\n');
    return 0;
  } else if (hasErrors) {
    error('\n❌ Des erreurs critiques ont été détectées!');
    console.log('\nCorrigez les erreurs ci-dessus avant de continuer.');
    console.log('Consultez DEPLOYMENT_GUIDE.md pour plus de détails.\n');
    return 1;
  } else {
    warning('\n⚠️  Quelques avertissements détectés.');
    console.log('\nVous pouvez continuer, mais vérifiez les avertissements ci-dessus.');
    console.log('Consultez DEPLOYMENT_GUIDE.md pour plus de détails.\n');
    return 0;
  }
}

// Exécution principale
console.log('🚀 Vérification pré-déploiement de Fisabil\n');

checkAppJson();
checkAssets();
checkEasJson();
checkEnvironmentVariables();
checkDocumentation();
checkGitIgnore();
checkPackageJson();

const exitCode = printSummary();
process.exit(exitCode);
