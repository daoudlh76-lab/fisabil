# Déploiement de la Privacy Policy

## 📋 Résumé

Ce document explique comment déployer la Privacy Policy pour l'application Fisabil dans **deux formats** :
1. **Page web publique** (OBLIGATOIRE pour App Store & Google Play)
2. **Écran in-app** (meilleure UX utilisateur)

---

## 🌐 1. Page Web Publique (OBLIGATOIRE)

### Fichier à déployer
- **Fichier source :** `privacy-policy.html`
- **URL cible :** `https://fisabil.fr/privacy` OU `https://fisabil.fr/privacy-policy`

### Méthodes de déploiement sur Hostinger

#### Option A : Via File Manager (recommandé)
1. Connectez-vous à Hostinger (https://hpanel.hostinger.com)
2. Allez dans **Files → File Manager**
3. Naviguez vers `public_html/` (racine du site)
4. Uploadez `privacy-policy.html`
5. Renommez-le en `privacy.html` OU créez un dossier `privacy/` et placez le fichier comme `index.html`
6. Vérifiez l'accès : `https://fisabil.fr/privacy`

#### Option B : Via FTP
1. Utilisez un client FTP (FileZilla, Cyberduck)
2. Connectez-vous avec les credentials Hostinger
3. Uploadez `privacy-policy.html` dans `/public_html/`
4. Renommez selon la structure d'URL souhaitée

#### Option C : Configuration .htaccess (URL propre)
Si vous voulez que `/privacy` pointe vers `privacy-policy.html` :

Ajoutez dans `/public_html/.htaccess` :
```apache
RewriteEngine On
RewriteRule ^privacy/?$ /privacy-policy.html [L]
```

### Configuration App Stores

#### App Store Connect (Apple)
1. Allez dans **App Information**
2. Section **Privacy Policy URL**
3. Entrez : `https://fisabil.fr/privacy`
4. Sauvegardez

#### Google Play Console
1. Allez dans **Store presence → App content**
2. Section **Privacy Policy**
3. Entrez : `https://fisabil.fr/privacy`
4. Sauvegardez

**⚠️ IMPORTANT :** Utilisez la **même URL exacte** pour les deux stores.

---

## 📱 2. Écran In-App (déjà implémenté)

### Fichiers créés
- **Écran :** `app/(tabs)/settings/privacy.tsx`
- **Traductions :** `constants/translations.ts` (FR, EN, AR)
- **Navigation :** Mise à jour dans `app/(tabs)/settings.tsx`

### Fonctionnalités
✅ Support multi-langue (FR, EN, AR)
✅ Mode sombre automatique
✅ Bouton "Ouvrir dans le navigateur" → `https://fisabil.fr/privacy`
✅ Contenu complet scrollable in-app
✅ Navigation depuis Settings → Privacy Policy

### Accès utilisateur
1. Ouvrir l'app Fisabil
2. Aller dans **Settings** (⚙️)
3. Cliquer sur **Privacy Policy**
4. Voir le contenu in-app OU cliquer sur "Open in browser"

---

## ✅ Checklist de déploiement

### Avant le déploiement
- [ ] Vérifier que `privacy-policy.html` s'affiche correctement en local
- [ ] Tester la responsivité mobile (viewport, tailles de police)
- [ ] Vérifier la date "Dernière mise à jour" (actuellement : 9 février 2026)

### Déploiement web
- [ ] Uploader `privacy-policy.html` sur Hostinger
- [ ] Configurer l'URL `/privacy` ou `/privacy-policy`
- [ ] Tester l'accès public : `https://fisabil.fr/privacy`
- [ ] Vérifier l'affichage mobile (responsive)
- [ ] Tester sur différents navigateurs (Safari, Chrome, Firefox)

### Configuration stores
- [ ] Ajouter l'URL dans App Store Connect
- [ ] Ajouter l'URL dans Google Play Console
- [ ] Vérifier que les deux stores acceptent l'URL (pas d'erreur 404)

### Test in-app
- [ ] Compiler l'app avec les nouveaux fichiers
- [ ] Tester la navigation : Settings → Privacy Policy
- [ ] Tester le bouton "Open in browser"
- [ ] Vérifier les traductions FR, EN, AR
- [ ] Tester en mode sombre et mode clair

---

## 🔄 Mises à jour futures

Si vous modifiez la Privacy Policy :

1. **Web :** Mettez à jour `privacy-policy.html` et re-uploadez sur Hostinger
2. **In-app :** Mettez à jour les traductions dans `constants/translations.ts`
3. **Date :** Changez "Dernière mise à jour" dans les deux formats
4. **Notification :** Envoyez un email aux utilisateurs si changement important

---

## 📞 Support

**Questions techniques :**
- Email : contact@fisabil.fr
- Hostinger Support : https://www.hostinger.com/support

**Conformité légale :**
- RGPD : https://www.cnil.fr/
- Apple App Store Review Guidelines : https://developer.apple.com/app-store/review/guidelines/
- Google Play Policy : https://support.google.com/googleplay/android-developer/topic/9858052

---

## 📝 Notes importantes

1. **URL publique obligatoire :** Les app stores EXIGENT une URL web publique (pas seulement in-app)
2. **Accessibilité :** La page web doit être accessible sans authentification
3. **Même URL :** Utilisez la même URL pour Apple et Google (évite la confusion)
4. **Responsive :** La page doit être mobile-friendly (déjà implémenté dans le HTML)
5. **HTTPS :** Hostinger fournit SSL gratuit, vérifiez que HTTPS fonctionne
6. **Cache :** Si vous modifiez la page, videz le cache navigateur pour voir les changements

---

**✨ Résumé : Les deux formats sont maintenant prêts !**
- ✅ Fichier HTML pour le web (`privacy-policy.html`)
- ✅ Écran mobile in-app (`app/(tabs)/settings/privacy.tsx`)
- ✅ Traductions multi-langue (FR, EN, AR)
- ✅ Navigation configurée dans Settings
