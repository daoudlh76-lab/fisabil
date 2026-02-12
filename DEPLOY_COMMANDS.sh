#!/bin/bash

# 🚀 Commandes de redéploiement de l'Edge Function delete-account

echo "📦 Étape 1: Déployer l'Edge Function avec le nouveau config.toml"
npx supabase functions deploy delete-account

echo ""
echo "✅ Déploiement terminé!"
echo ""
echo "📋 Vérification du déploiement:"
npx supabase functions list

echo ""
echo "🧪 Pour tester manuellement (optionnel):"
echo "npx supabase functions logs delete-account --tail"
