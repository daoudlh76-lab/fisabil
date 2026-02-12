import { useSubscription } from '@/contexts/subscription-context';
import { useLanguage } from '@/hooks/use-language';
import { supabase } from '@/src/lib/supabase';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import React, { useState, useEffect } from 'react';
import {
    Alert,
    Linking,
    Modal,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';

export default function SettingsScreen() {
  const router = useRouter();
  const { subscription, getFeatures, getCurrentPlanInfo } = useSubscription();
  const { language, setLanguage, availableLanguages, getLanguageName, t } = useLanguage();
  const currentPlan = getCurrentPlanInfo();
  const features = getFeatures();
  const [logoutModalVisible, setLogoutModalVisible] = useState(false);
  const [languageModalVisible, setLanguageModalVisible] = useState(false);
  const [resetModalVisible, setResetModalVisible] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  // États pour les données utilisateur
  const [userEmail, setUserEmail] = useState('');
  const [userName, setUserName] = useState('');
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [darkModeEnabled, setDarkModeEnabled] = useState(false);

  // États pour les modals d'édition
  const [changePasswordModalVisible, setChangePasswordModalVisible] = useState(false);
  const [editProfileModalVisible, setEditProfileModalVisible] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [editedUserName, setEditedUserName] = useState('');

  // Charger les données utilisateur au montage
  useEffect(() => {
    loadUserData();
    loadPreferences();
  }, []);

  async function loadUserData() {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        setUserEmail(session.user.email || '');
        // Charger le nom d'utilisateur depuis les métadonnées ou AsyncStorage
        const storedName = await AsyncStorage.getItem('@fisabil_user_name');
        setUserName(storedName || t('settings.arabicLearner'));
        setEditedUserName(storedName || '');
      }
    } catch (error) {
      console.error('Erreur chargement données utilisateur:', error);
    }
  }

  async function loadPreferences() {
    try {
      const notifications = await AsyncStorage.getItem('@fisabil_notifications');
      const darkMode = await AsyncStorage.getItem('@fisabil_dark_mode');
      if (notifications !== null) setNotificationsEnabled(notifications === 'true');
      if (darkMode !== null) setDarkModeEnabled(darkMode === 'true');
    } catch (error) {
      console.error('Erreur chargement préférences:', error);
    }
  }

  async function savePreference(key: string, value: boolean) {
    try {
      await AsyncStorage.setItem(key, value.toString());
    } catch (error) {
      console.error('Erreur sauvegarde préférence:', error);
    }
  }

  const handleUpgrade = () => {
    router.push('/(tabs)/subscription');
  };

  const handleContactSupport = () => {
    Linking.openURL(`mailto:contact@fisabil.fr?subject=${encodeURIComponent(t('settings.emailSubject'))}`);
  };

  const handleLogout = () => {
    setLogoutModalVisible(true);
  };

  const confirmLogout = async () => {
    setLogoutModalVisible(false);
    try {
      await supabase.auth.signOut();
      // La redirection vers login est automatique via useAuth dans _layout.tsx
    } catch (error) {
      Alert.alert(t('settings.error'), t('settings.logoutError'));
    }
  };

  const handleReset = () => {
    setResetModalVisible(true);
  };

  const confirmReset = async () => {
    setResetModalVisible(false);
    setIsResetting(true);
    try {
      // 1. Récupérer l'ID de l'utilisateur actuel
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;

      if (userId) {
        // 2. Supprimer toutes les données Supabase de l'utilisateur
        await Promise.all([
          // Supprimer tous les scans (textes)
          supabase.from('scans').delete().eq('user_id', userId),
          // Supprimer tout le cache AI
          supabase.from('ai_cache').delete().eq('user_id', userId),
          // Supprimer toutes les cartes de vocabulaire et leur progression
          supabase.from('vocab_cards_progress').delete().eq('user_id', userId),
          supabase.from('vocabulary').delete().eq('user_id', userId),
          // Supprimer toutes les pistes audio de la playlist
          supabase.from('audio_tracks').delete().eq('user_id', userId),
          // Supprimer toutes les dictées
          supabase.from('dictations').delete().eq('user_id', userId),
          // Supprimer tous les dossiers
          supabase.from('folders').delete().eq('user_id', userId),
        ]);
      }

      // 3. Supprimer toutes les données locales (AsyncStorage)
      await AsyncStorage.clear();

      // 4. Déconnecter l'utilisateur
      await supabase.auth.signOut();

      // 5. Afficher le message de succès
      Alert.alert(
        t('settings.resetSuccess'),
        t('settings.resetSuccessMessage')
      );
    } catch (error) {
      console.error('Erreur réinitialisation:', error);
      Alert.alert(t('settings.error'), String(error));
    } finally {
      setIsResetting(false);
    }
  };

  const handleToggleNotifications = async (value: boolean) => {
    setNotificationsEnabled(value);
    await savePreference('@fisabil_notifications', value);
    if (value) {
      Alert.alert(
        '✅',
        t('settings.notificationsEnabled') || 'Notifications activées'
      );
    }
  };

  const handleToggleDarkMode = async (value: boolean) => {
    setDarkModeEnabled(value);
    await savePreference('@fisabil_dark_mode', value);
    Alert.alert(
      'ℹ️',
      t('settings.darkModeComingSoon') || 'Le mode sombre sera disponible dans une prochaine mise à jour'
    );
  };

  const handleEditProfile = () => {
    setEditProfileModalVisible(true);
  };

  const confirmEditProfile = async () => {
    try {
      if (editedUserName.trim()) {
        await AsyncStorage.setItem('@fisabil_user_name', editedUserName.trim());
        setUserName(editedUserName.trim());
        setEditProfileModalVisible(false);
        Alert.alert('✅', t('settings.profileUpdated') || 'Profil mis à jour avec succès');
      }
    } catch (error) {
      Alert.alert(t('settings.error'), String(error));
    }
  };

  const handleChangePassword = () => {
    setChangePasswordModalVisible(true);
  };

  const confirmChangePassword = async () => {
    try {
      if (!currentPassword || !newPassword || !confirmPassword) {
        Alert.alert(t('settings.error'), t('settings.fillAllFields') || 'Veuillez remplir tous les champs');
        return;
      }

      if (newPassword !== confirmPassword) {
        Alert.alert(t('settings.error'), t('settings.passwordMismatch') || 'Les mots de passe ne correspondent pas');
        return;
      }

      if (newPassword.length < 6) {
        Alert.alert(t('settings.error'), t('auth.shortPassword') || 'Le mot de passe doit contenir au moins 6 caractères');
        return;
      }

      const { error } = await supabase.auth.updateUser({
        password: newPassword
      });

      if (error) throw error;

      setChangePasswordModalVisible(false);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      Alert.alert('✅', t('settings.passwordChanged') || 'Mot de passe modifié avec succès');
    } catch (error: any) {
      Alert.alert(t('settings.error'), error?.message || String(error));
    }
  };

  return (
    <ScrollView style={styles.container}>
      {/* HEADER */}
      <View style={styles.header}>
        <Text style={styles.title}>{t('settings.title')}</Text>
      </View>

      {/* LANGUE */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('settings.language')}</Text>
        <TouchableOpacity 
          style={styles.settingRow}
          onPress={() => setLanguageModalVisible(true)}
        >
          <View>
            <Text style={styles.settingLabel}>{getLanguageName(language)}</Text>
            <Text style={styles.settingDescription}>
              {t('settings.selectLanguage')}
            </Text>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={24} color="#999" />
        </TouchableOpacity>
      </View>

      {/* ABONNEMENT ACTUEL */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>📋 {t('settings.subscription')}</Text>

        <View
          style={[
            styles.subscriptionCard,
            subscription.plan === 'premium' && styles.premiumCard,
          ]}
        >
          <View style={styles.planHeader}>
            <Text style={styles.planName}>
              {subscription.plan === 'free'
                ? `🆓 ${t('settings.free')}`
                : subscription.plan === 'premium_monthly'
                ? `💎 ${t('settings.premium')} (${t('subscription.monthly')})`
                : `👑 ${t('settings.premium')} (${t('subscription.annual')})`}
            </Text>
            {currentPlan && currentPlan.price > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>
                  {currentPlan.price.toFixed(2)}{currentPlan.currency}/{currentPlan.period === 'month' ? t('subscription.mo') : t('subscription.yr')}
                </Text>
              </View>
            )}
          </View>

          {subscription.plan === 'free' && (
            <>
              <Text style={styles.planDescription}>
                {t('settings.trialDescription')}
              </Text>
              <View style={styles.timerBox}>
                <MaterialCommunityIcons
                  name="clock-outline"
                  size={24}
                  color="#FF9800"
                />
                <Text style={styles.timerText}>
                  {subscription.daysRemaining} {t('settings.daysRemaining')}
                </Text>
              </View>

              <TouchableOpacity
                style={styles.upgradeButton}
                onPress={handleUpgrade}
              >
                <Text style={styles.upgradeButtonText}>
                  🚀 {t('settings.upgradeToPremium')}
                </Text>
              </TouchableOpacity>
            </>
          )}

          {(subscription.plan === 'premium_monthly' || subscription.plan === 'premium_annual') && (
            <>
              <Text style={styles.planDescription}>
                {t('settings.unlimitedAccess')}
              </Text>
              <View style={styles.premiumBadge}>
                <MaterialCommunityIcons
                  name="check-circle"
                  size={20}
                  color="#4CAF50"
                />
                <Text style={styles.premiumText}>
                  {subscription.plan === 'premium_annual' ? t('settings.activeForever') : t('settings.activeSubscription')}
                </Text>
              </View>
              <TouchableOpacity
                style={[styles.upgradeButton, { backgroundColor: '#666' }]}
                onPress={handleUpgrade}
              >
                <Text style={styles.upgradeButtonText}>
                  {t('subscription.managePlan')}
                </Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>

      {/* COMPARAISON DES FONCTIONNALITÉS */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>🎯 {t('settings.features')}</Text>

        {features.map((feature) => {
          const hasAccess =
            subscription.plan === 'premium_monthly' || subscription.plan === 'premium_annual'
              ? feature.premiumAllowed
              : feature.freeAllowed;

          return (
            <View key={feature.name} style={styles.featureRow}>
              <View style={styles.featureInfo}>
                <Text style={styles.featureName}>{t(feature.labelKey)}</Text>
                {feature.freeLimit && subscription.plan === 'free' && (
                  <Text style={styles.featureLimit}>
                    {t('settings.limitedTo')} {feature.freeLimit}{t('settings.perDay')}
                  </Text>
                )}
              </View>
              <View
                style={[
                  styles.featureStatus,
                  hasAccess ? styles.statusActive : styles.statusInactive,
                ]}
              >
                <MaterialCommunityIcons
                  name={hasAccess ? 'check-circle' : 'lock'}
                  size={20}
                  color={hasAccess ? '#4CAF50' : '#999'}
                />
              </View>
            </View>
          );
        })}
      </View>

      {/* TABLEAU COMPARATIF */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>📊 {t('settings.comparison')}</Text>

        <View style={styles.comparisonTable}>
          <View style={styles.comparisonRow}>
            <Text style={styles.comparisonLabel}>{t('settings.feature')}</Text>
            <Text style={styles.comparisonCell}>{t('settings.free')}</Text>
            <Text style={styles.comparisonCell}>{t('settings.premium')}</Text>
          </View>

          <View style={styles.divider} />

          <View style={styles.comparisonRow}>
            <Text style={styles.comparisonLabel}>{t('settings.duration')}</Text>
            <Text style={styles.comparisonCell}>7 {t('settings.days')}</Text>
            <Text style={styles.comparisonCell}>{t('settings.unlimited')}</Text>
          </View>

          <View style={styles.comparisonRow}>
            <Text style={styles.comparisonLabel}>{t('settings.aiTutor')}</Text>
            <Text style={styles.comparisonCell}>5{t('settings.perDay')}</Text>
            <Text style={styles.comparisonCell}>{t('settings.unlimited')}</Text>
          </View>

          <View style={styles.comparisonRow}>
            <Text style={styles.comparisonLabel}>{t('settings.dictations')}</Text>
            <Text style={styles.comparisonCell}>2{t('settings.perDay')}</Text>
            <Text style={styles.comparisonCell}>{t('settings.unlimited')}</Text>
          </View>

          <View style={styles.comparisonRow}>
            <Text style={styles.comparisonLabel}>{t('settings.vocabCards')}</Text>
            <Text style={styles.comparisonCell}>✅</Text>
            <Text style={styles.comparisonCell}>✅</Text>
          </View>

          <View style={styles.comparisonRow}>
            <Text style={styles.comparisonLabel}>{t('settings.scannerFeature')}</Text>
            <Text style={styles.comparisonCell}>❌</Text>
            <Text style={styles.comparisonCell}>✅</Text>
          </View>

          <View style={styles.comparisonRow}>
            <Text style={styles.comparisonLabel}>{t('settings.support')}</Text>
            <Text style={styles.comparisonCell}>{t('settings.byEmail')}</Text>
            <Text style={styles.comparisonCell}>{t('settings.priority')}</Text>
          </View>
        </View>
      </View>

      {/* STATISTIQUES */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>📊 {t('settings.statistics')}</Text>

        <TouchableOpacity
          style={styles.supportRow}
          onPress={() => router.push('/(tabs)/statistics')}
        >
          <View style={styles.supportIcon}>
            <MaterialCommunityIcons
              name="chart-box-outline"
              size={24}
              color="#2E7D32"
            />
          </View>
          <View style={styles.supportInfo}>
            <Text style={styles.supportLabel}>{t('statistics.myDictionary')}</Text>
            <Text style={styles.supportEmail}>{t('statistics.viewProgress')}</Text>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={24} color="#999" />
        </TouchableOpacity>
      </View>

      {/* AUTRES PARAMÈTRES */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>🔧 {t('settings.other')}</Text>

        <View style={styles.settingRow}>
          <View>
            <Text style={styles.settingLabel}>{t('settings.notifications')}</Text>
            <Text style={styles.settingDescription}>
              {t('settings.learningReminders')}
            </Text>
          </View>
          <Switch
            value={notificationsEnabled}
            onValueChange={handleToggleNotifications}
          />
        </View>

        <View style={styles.settingRow}>
          <View>
            <Text style={styles.settingLabel}>{t('settings.darkMode')}</Text>
            <Text style={styles.settingDescription}>
              {darkModeEnabled ? t('settings.enabled') : t('settings.disabled')}
            </Text>
          </View>
          <Switch
            value={darkModeEnabled}
            onValueChange={handleToggleDarkMode}
          />
        </View>

        <TouchableOpacity
          style={styles.settingRow}
          onPress={() => router.push('/(tabs)/settings/about')}
        >
          <View>
            <Text style={styles.settingLabel}>{t('settings.about')}</Text>
            <Text style={styles.settingDescription}>v1.0.0</Text>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={24} color="#999" />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.settingRow}
          onPress={() => router.push('/(tabs)/settings/privacy')}
        >
          <View>
            <Text style={styles.settingLabel}>{t('settings.privacyPolicy')}</Text>
            <Text style={styles.settingDescription}>{t('settings.readMore')}</Text>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={24} color="#999" />
        </TouchableOpacity>
      </View>

      {/* SECTION AIDE */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>❓ {t('settings.helpSupport')}</Text>

        <TouchableOpacity
          style={styles.supportRow}
          onPress={handleContactSupport}
        >
          <View style={styles.supportIcon}>
            <MaterialCommunityIcons
              name="email-outline"
              size={24}
              color="#1976d2"
            />
          </View>
          <View style={styles.supportInfo}>
            <Text style={styles.supportLabel}>{t('settings.contactUs')}</Text>
            <Text style={styles.supportEmail}>contact@fisabil.fr</Text>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={24} color="#999" />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.supportRow}
          onPress={() =>
            Alert.alert(
              t('settings.faq'),
              t('settings.faqContent')
            )
          }
        >
          <View style={styles.supportIcon}>
            <MaterialCommunityIcons
              name="help-circle-outline"
              size={24}
              color="#FF9800"
            />
          </View>
          <View style={styles.supportInfo}>
            <Text style={styles.supportLabel}>{t('settings.faq')}</Text>
            <Text style={styles.supportEmail}>{t('settings.faqFull')}</Text>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={24} color="#999" />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.supportRow}
          onPress={() =>
            Alert.alert(
              `📱 ${t('settings.followUsTitle')}`,
              t('settings.followUsContent')
            )
          }
        >
          <View style={styles.supportIcon}>
            <MaterialCommunityIcons
              name="share"
              size={24}
              color="#4CAF50"
            />
          </View>
          <View style={styles.supportInfo}>
            <Text style={styles.supportLabel}>{t('settings.socialMedia')}</Text>
            <Text style={styles.supportEmail}>{t('settings.followUs')}</Text>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={24} color="#999" />
        </TouchableOpacity>
      </View>

      {/* SECTION COMPTE */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('settings.account')}</Text>

        <TouchableOpacity style={styles.accountRow}>
          <View>
            <Text style={styles.accountLabel}>{t('settings.username')}</Text>
            <Text style={styles.accountValue}>{userName || t('settings.arabicLearner')}</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity style={styles.accountRow}>
          <View>
            <Text style={styles.accountLabel}>{t('settings.email')}</Text>
            <Text style={styles.accountValue}>{userEmail || 'user@example.com'}</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.accountRow}
          onPress={handleEditProfile}
        >
          <View>
            <Text style={styles.accountLabel}>{t('settings.editProfile')}</Text>
            <Text style={styles.accountValue}>{t('settings.changeInfo')}</Text>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={24} color="#999" />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.accountRow}
          onPress={handleChangePassword}
        >
          <View>
            <Text style={styles.accountLabel}>{t('settings.changePassword')}</Text>
            <Text style={styles.accountValue}>{t('settings.secureAccount')}</Text>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={24} color="#999" />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.accountRow}
          onPress={() => router.push('/(tabs)/settings/delete-account')}
        >
          <View>
            <Text style={[styles.accountLabel, { color: '#FF5722' }]}>{t('settings.deleteAccount')}</Text>
            <Text style={[styles.accountValue, { color: '#FF5722' }]}>{t('settings.deleteAccountDescription')}</Text>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={24} color="#FF5722" />
        </TouchableOpacity>
      </View>

      {/* SECTION RÉINITIALISATION */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>🔄 {t('settings.reset')}</Text>

        <TouchableOpacity
          style={styles.resetRow}
          onPress={handleReset}
          disabled={isResetting}
        >
          <View style={styles.resetIcon}>
            <MaterialCommunityIcons
              name="refresh"
              size={24}
              color="#FF5722"
            />
          </View>
          <View style={styles.resetInfo}>
            <Text style={styles.resetLabel}>{t('settings.resetAll')}</Text>
            <Text style={styles.resetDescription}>{t('settings.resetDescription')}</Text>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={24} color="#999" />
        </TouchableOpacity>
      </View>

      {/* BOUTON DÉCONNEXION */}
      <TouchableOpacity
        style={styles.logoutButton}
        onPress={handleLogout}
      >
        <MaterialCommunityIcons name="logout" size={20} color="white" />
        <Text style={styles.logoutButtonText}>{t('settings.logout')}</Text>
      </TouchableOpacity>

      <View style={styles.spacer} />

      {/* MODAL DE CONFIRMATION DÉCONNEXION */}
      <Modal
        transparent
        visible={logoutModalVisible}
        onRequestClose={() => setLogoutModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalIcon}>
              <MaterialCommunityIcons
                name="logout"
                size={40}
                color="#f44336"
              />
            </View>

            <Text style={styles.modalTitle}>{t('settings.logout')}</Text>
            <Text style={styles.modalDescription}>
              {t('settings.logoutConfirm')}
            </Text>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => setLogoutModalVisible(false)}
              >
                <Text style={styles.modalCancelText}>{t('settings.cancel')}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalConfirmButton}
                onPress={confirmLogout}
              >
                <Text style={styles.modalConfirmText}>{t('settings.logout')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* MODAL DE RÉINITIALISATION */}
      <Modal
        transparent
        visible={resetModalVisible}
        onRequestClose={() => setResetModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalIcon}>
              <MaterialCommunityIcons
                name="refresh"
                size={40}
                color="#FF5722"
              />
            </View>

            <Text style={styles.modalTitle}>{t('settings.resetConfirmTitle')}</Text>
            <Text style={styles.modalDescription}>
              {t('settings.resetConfirmMessage')}
            </Text>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => setResetModalVisible(false)}
              >
                <Text style={styles.modalCancelText}>{t('settings.cancel')}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalConfirmButton, styles.resetConfirmButton]}
                onPress={confirmReset}
              >
                <Text style={styles.modalConfirmText}>{t('settings.resetAll')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* MODAL DE SÉLECTION DE LANGUE */}
      <Modal
        transparent
        visible={languageModalVisible}
        onRequestClose={() => setLanguageModalVisible(false)}
        animationType="slide"
      >
        <View style={styles.modalOverlay}>
          <View style={styles.languageModalContent}>
            <View style={styles.languageModalHeader}>
              <Text style={styles.languageModalTitle}>
                {t('settings.selectLanguage')}
              </Text>
              <TouchableOpacity onPress={() => setLanguageModalVisible(false)}>
                <MaterialCommunityIcons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>

            <View style={styles.languageList}>
              {availableLanguages.map((lang) => (
                <TouchableOpacity
                  key={lang}
                  style={[
                    styles.languageItem,
                    language === lang && styles.languageItemActive,
                  ]}
                  onPress={async () => {
                    await setLanguage(lang);
                    setLanguageModalVisible(false);
                  }}
                >
                  <Text
                    style={[
                      styles.languageItemText,
                      language === lang && styles.languageItemTextActive,
                    ]}
                  >
                    {getLanguageName(lang)}
                  </Text>
                  {language === lang && (
                    <MaterialCommunityIcons
                      name="check-circle"
                      size={24}
                      color="#4CAF50"
                    />
                  )}
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
      </Modal>

      {/* MODAL D'ÉDITION DU PROFIL */}
      <Modal
        transparent
        visible={editProfileModalVisible}
        onRequestClose={() => setEditProfileModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalIcon}>
              <MaterialCommunityIcons
                name="account-edit"
                size={40}
                color="#1976d2"
              />
            </View>

            <Text style={styles.modalTitle}>{t('settings.editProfile')}</Text>
            <Text style={styles.modalDescription}>
              {t('settings.enterNewName') || 'Entrez votre nouveau nom'}
            </Text>

            <TextInput
              style={styles.modalInput}
              value={editedUserName}
              onChangeText={setEditedUserName}
              placeholder={t('settings.username')}
              autoCapitalize="words"
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => {
                  setEditProfileModalVisible(false);
                  setEditedUserName(userName);
                }}
              >
                <Text style={styles.modalCancelText}>{t('settings.cancel')}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalConfirmButton, styles.modalConfirmButtonPrimary]}
                onPress={confirmEditProfile}
              >
                <Text style={styles.modalConfirmText}>{t('settings.save') || 'Enregistrer'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* MODAL DE CHANGEMENT DE MOT DE PASSE */}
      <Modal
        transparent
        visible={changePasswordModalVisible}
        onRequestClose={() => setChangePasswordModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalIcon}>
              <MaterialCommunityIcons
                name="lock-reset"
                size={40}
                color="#FF9800"
              />
            </View>

            <Text style={styles.modalTitle}>{t('settings.changePassword')}</Text>
            <Text style={styles.modalDescription}>
              {t('settings.enterPasswords') || 'Entrez votre nouveau mot de passe'}
            </Text>

            <TextInput
              style={styles.modalInput}
              value={currentPassword}
              onChangeText={setCurrentPassword}
              placeholder={t('settings.currentPassword') || 'Mot de passe actuel'}
              secureTextEntry
              autoCapitalize="none"
            />

            <TextInput
              style={styles.modalInput}
              value={newPassword}
              onChangeText={setNewPassword}
              placeholder={t('settings.newPassword') || 'Nouveau mot de passe'}
              secureTextEntry
              autoCapitalize="none"
            />

            <TextInput
              style={styles.modalInput}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              placeholder={t('settings.confirmNewPassword') || 'Confirmer le mot de passe'}
              secureTextEntry
              autoCapitalize="none"
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => {
                  setChangePasswordModalVisible(false);
                  setCurrentPassword('');
                  setNewPassword('');
                  setConfirmPassword('');
                }}
              >
                <Text style={styles.modalCancelText}>{t('settings.cancel')}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalConfirmButton, styles.modalConfirmButtonWarning]}
                onPress={confirmChangePassword}
              >
                <Text style={styles.modalConfirmText}>{t('settings.change') || 'Modifier'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  header: {
    backgroundColor: '#1976d2',
    paddingVertical: 20,
    paddingHorizontal: 16,
    paddingTop: 40,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: 'white',
  },
  section: {
    paddingHorizontal: 16,
    marginVertical: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  subscriptionCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#FF9800',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  premiumCard: {
    borderLeftColor: '#FFD700',
    backgroundColor: '#fffbf0',
  },
  planHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  planName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  badge: {
    backgroundColor: '#FF9800',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
  },
  planDescription: {
    fontSize: 14,
    color: '#666',
    marginBottom: 12,
  },
  timerBox: {
    flexDirection: 'row',
    backgroundColor: '#FFF3E0',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 12,
  },
  timerText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FF9800',
    marginLeft: 8,
  },
  upgradeButton: {
    backgroundColor: '#1976d2',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  upgradeButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  premiumBadge: {
    flexDirection: 'row',
    backgroundColor: '#E8F5E9',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  premiumText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4CAF50',
    marginLeft: 8,
  },
  featureRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'white',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  featureInfo: {
    flex: 1,
  },
  featureName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  featureLimit: {
    fontSize: 12,
    color: '#FF9800',
    marginTop: 2,
  },
  featureStatus: {
    padding: 8,
  },
  statusActive: {
    backgroundColor: '#E8F5E9',
    borderRadius: 8,
  },
  statusInactive: {
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
  },
  comparisonTable: {
    backgroundColor: 'white',
    borderRadius: 12,
    overflow: 'hidden',
  },
  comparisonRow: {
    flexDirection: 'row',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  comparisonLabel: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
    color: '#333',
  },
  comparisonCell: {
    flex: 1,
    fontSize: 13,
    color: '#666',
    textAlign: 'center',
  },
  divider: {
    height: 1,
    backgroundColor: '#eee',
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'white',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  settingLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  settingDescription: {
    fontSize: 12,
    color: '#999',
    marginTop: 2,
  },
  supportRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  supportIcon: {
    width: 45,
    height: 45,
    borderRadius: 12,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  supportInfo: {
    flex: 1,
  },
  supportLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  supportEmail: {
    fontSize: 12,
    color: '#999',
    marginTop: 2,
  },
  accountRow: {
    backgroundColor: 'white',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  accountLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  accountValue: {
    fontSize: 13,
    color: '#1976d2',
    marginTop: 4,
  },
  logoutButton: {
    backgroundColor: '#f44336',
    marginHorizontal: 16,
    marginVertical: 20,
    paddingVertical: 14,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  logoutButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  spacer: {
    height: 20,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: 'white',
    borderRadius: 16,
    paddingVertical: 24,
    paddingHorizontal: 20,
    width: '85%',
    alignItems: 'center',
  },
  modalIcon: {
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  modalDescription: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 20,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  modalCancelButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#f0f0f0',
    alignItems: 'center',
  },
  modalCancelText: {
    color: '#333',
    fontSize: 14,
    fontWeight: '600',
  },
  modalConfirmButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#f44336',
    alignItems: 'center',
  },
  modalConfirmText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  languageModalContent: {
    backgroundColor: 'white',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    marginTop: 'auto',
    width: '100%',
    maxHeight: '80%',
    paddingBottom: 40,
  },
  languageModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  languageModalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  languageList: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  languageItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 12,
    marginBottom: 8,
    borderRadius: 8,
    backgroundColor: '#f5f5f5',
  },
  languageItemActive: {
    backgroundColor: '#E8F5E9',
  },
  languageItemText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
  },
  languageItemTextActive: {
    fontSize: 16,
    fontWeight: '600',
    color: '#4CAF50',
  },
  // Reset styles
  resetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#FF5722',
  },
  resetIcon: {
    width: 45,
    height: 45,
    borderRadius: 12,
    backgroundColor: '#FBE9E7',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  resetInfo: {
    flex: 1,
  },
  resetLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FF5722',
  },
  resetDescription: {
    fontSize: 12,
    color: '#999',
    marginTop: 2,
  },
  resetConfirmButton: {
    backgroundColor: '#FF5722',
  },
  // Styles pour les inputs des modals
  modalInput: {
    width: '100%',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginBottom: 12,
    fontSize: 14,
    backgroundColor: '#F9FAFB',
  },
  modalConfirmButtonPrimary: {
    backgroundColor: '#1976d2',
  },
  modalConfirmButtonWarning: {
    backgroundColor: '#FF9800',
  },
});
