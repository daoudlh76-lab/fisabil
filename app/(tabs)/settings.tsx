import { useSubscription } from '@/contexts/subscription-context';
import { useLanguage } from '@/hooks/use-language';
import { supabase } from '@/src/lib/supabase';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Constants from 'expo-constants';
import React, { useState, useEffect } from 'react';
import {
    Alert,
    Linking,
    Modal,
    Platform,
    ScrollView,
    StatusBar,
    StyleSheet,
    Switch,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { Colors } from "@/constants/colors";

export default function SettingsScreen() {
  const router = useRouter();
  const { subscription, isPremium, monthlyPackage, annualPackage } = useSubscription();
  const { language, setLanguage, availableLanguages, getLanguageName, t } = useLanguage();
  const appVersion = Constants.expoConfig?.version || '1.0.0';

  // ─── Prix & essai gratuit (même logique que app/(tabs)/subscription.tsx) ───
  const monthlyPrice = monthlyPackage?.product.priceString ?? '';
  const annualPrice = annualPackage?.product.priceString ?? '';
  const monthlyCost = monthlyPackage?.product.price ?? 0;
  const annualCost = annualPackage?.product.price ?? 0;
  const savingsPercent = monthlyCost > 0 ? Math.round((1 - annualCost / (monthlyCost * 12)) * 100) : 0;
  const trialDays = (() => {
    const intro = monthlyPackage?.product?.introPrice ?? annualPackage?.product?.introPrice;
    if (!intro || intro.price !== 0) return 7;
    if (intro.periodUnit === 'DAY') return intro.periodNumberOfUnits;
    if (intro.periodUnit === 'WEEK') return intro.periodNumberOfUnits * 7;
    if (intro.periodUnit === 'MONTH') return intro.periodNumberOfUnits * 30;
    return intro.periodNumberOfUnits;
  })();
  const [logoutModalVisible, setLogoutModalVisible] = useState(false);
  const [languageModalVisible, setLanguageModalVisible] = useState(false);
  const [resetModalVisible, setResetModalVisible] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  // États pour les données utilisateur
  const [userEmail, setUserEmail] = useState('');
  const [userName, setUserName] = useState('');
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);

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
      if (__DEV__) console.error('Erreur chargement données utilisateur:', error);
    }
  }

  async function loadPreferences() {
    try {
      const notifications = await AsyncStorage.getItem('@fisabil_notifications');
      if (notifications !== null) setNotificationsEnabled(notifications === 'true');
    } catch (error) {
      if (__DEV__) console.error('Erreur chargement préférences:', error);
    }
  }

  async function savePreference(key: string, value: boolean) {
    try {
      await AsyncStorage.setItem(key, value.toString());
    } catch (error) {
      if (__DEV__) console.error('Erreur sauvegarde préférence:', error);
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
      if (__DEV__) console.error('Erreur réinitialisation:', error);
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

        <View style={styles.profileCard}>
          <LinearGradient colors={[Colors.mid, Colors.logoGreen]} style={styles.profileAvatar}>
            {userName ? (
              <Text style={styles.profileAvatarInitial}>{userName.charAt(0).toUpperCase()}</Text>
            ) : (
              <MaterialCommunityIcons name="account" size={22} color={Colors.cream} />
            )}
          </LinearGradient>
          <View style={{ flex: 1 }}>
            <Text style={styles.profileName} numberOfLines={1}>{userName || t('settings.arabicLearner')}</Text>
            <Text style={styles.profileEmail} numberOfLines={1}>{userEmail}</Text>
          </View>
          <TouchableOpacity onPress={handleEditProfile}>
            <Text style={styles.profileEditButton}>{t('settings.editProfileButton')} ›</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ABONNEMENT */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('settings.subscription')}</Text>

        {isPremium ? (
          <LinearGradient colors={[Colors.deep, Colors.green]} style={styles.subCardPremium}>
            <View style={styles.subCardPremiumHeader}>
              <Text style={styles.subCardPremiumPlan}>
                {t('settings.premium')} · {subscription.plan === 'premium_monthly' ? t('subscription.monthly') : t('subscription.annual')}
              </Text>
              <View style={styles.subActiveBadge}>
                <Text style={styles.subActiveBadgeText}>{t('settings.active')}</Text>
              </View>
            </View>
            {subscription.expiryDate && (
              <Text style={styles.subCardPremiumExpiry}>
                {t('subscription.expiresOn')} {subscription.expiryDate.toLocaleDateString()}
              </Text>
            )}
            <TouchableOpacity style={styles.subManageButton} onPress={handleUpgrade}>
              <Text style={styles.subManageButtonText}>{t('subscription.managePlan')} →</Text>
            </TouchableOpacity>
          </LinearGradient>
        ) : (
          <LinearGradient colors={['#1a1a1a', '#2a2a2a']} style={styles.subCardFree}>
            <View style={styles.subPriceRow}>
              <View style={styles.subPriceBox}>
                <Text style={styles.subPriceLabel}>{t('subscription.monthly')}</Text>
                <Text style={styles.subPriceValue}>{monthlyPrice || '—'}</Text>
              </View>
              <View style={[styles.subPriceBox, styles.subPriceBoxAnnual]}>
                {savingsPercent > 0 && (
                  <View style={styles.subStarBadge}>
                    <Text style={styles.subStarBadgeText}>
                      ⭐ {t('subscription.saveAnnually', { amount: String(savingsPercent) })}
                    </Text>
                  </View>
                )}
                <Text style={styles.subPriceLabel}>{t('subscription.annual')}</Text>
                <Text style={styles.subPriceValue}>{annualPrice || '—'}</Text>
              </View>
            </View>
            <TouchableOpacity style={styles.subTrialButton} onPress={handleUpgrade}>
              <Text style={styles.subTrialButtonText}>
                {t('settings.startFreeTrial', { days: String(trialDays) })}
              </Text>
            </TouchableOpacity>
          </LinearGradient>
        )}
      </View>

      {/* STATISTIQUES */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('settings.statistics')}</Text>

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

      {/* PRÉFÉRENCES */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('settings.preferences')}</Text>
        <View style={styles.groupCard}>
          <TouchableOpacity style={styles.groupRow} onPress={() => setLanguageModalVisible(true)}>
            <View>
              <Text style={styles.groupRowLabel}>{t('settings.language')}</Text>
              <Text style={styles.groupRowDescription}>{getLanguageName(language)}</Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={22} color={Colors.muted} />
          </TouchableOpacity>

          <View style={styles.groupDivider} />

          <View style={styles.groupRow}>
            <View>
              <Text style={styles.groupRowLabel}>{t('settings.notifications')}</Text>
              <Text style={styles.groupRowDescription}>{t('settings.learningReminders')}</Text>
            </View>
            <Switch
              value={notificationsEnabled}
              onValueChange={handleToggleNotifications}
              trackColor={{ true: Colors.mid }}
            />
          </View>
        </View>
      </View>

      {/* AIDE */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('settings.helpSupport')}</Text>
        <View style={styles.groupCard}>
          <TouchableOpacity style={styles.groupRow} onPress={() => router.push('/(tabs)/settings/faq')}>
            <Text style={styles.groupRowLabel}>{t('settings.faq')}</Text>
            <MaterialCommunityIcons name="chevron-right" size={22} color={Colors.muted} />
          </TouchableOpacity>

          <View style={styles.groupDivider} />

          <TouchableOpacity style={styles.groupRow} onPress={handleContactSupport}>
            <Text style={styles.groupRowLabel}>{t('settings.contactUs')}</Text>
            <MaterialCommunityIcons name="chevron-right" size={22} color={Colors.muted} />
          </TouchableOpacity>

          <View style={styles.groupDivider} />

          <TouchableOpacity style={styles.groupRow} onPress={() => router.push('/(tabs)/settings/about')}>
            <View>
              <Text style={styles.groupRowLabel}>{t('settings.about')}</Text>
              <Text style={styles.groupRowDescription}>{appVersion}</Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={22} color={Colors.muted} />
          </TouchableOpacity>

          <View style={styles.groupDivider} />

          <TouchableOpacity style={styles.groupRow} onPress={() => router.push('/(tabs)/settings/privacy')}>
            <Text style={styles.groupRowLabel}>{t('settings.privacyPolicy')}</Text>
            <MaterialCommunityIcons name="chevron-right" size={22} color={Colors.muted} />
          </TouchableOpacity>
        </View>
      </View>

      {/* COMPTE */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('settings.account')}</Text>
        <View style={styles.groupCard}>
          <TouchableOpacity style={styles.groupRow} onPress={handleChangePassword}>
            <Text style={styles.groupRowLabel}>{t('settings.changePassword')}</Text>
            <MaterialCommunityIcons name="chevron-right" size={22} color={Colors.muted} />
          </TouchableOpacity>
        </View>
      </View>

      {/* ZONE DANGEREUSE */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('settings.dangerZone')}</Text>
        <View style={styles.groupCard}>
          <TouchableOpacity style={styles.groupRow} onPress={handleReset} disabled={isResetting}>
            <View>
              <Text style={[styles.groupRowLabel, { color: Colors.danger }]}>{t('settings.resetAll')}</Text>
              <Text style={styles.groupRowDescription}>{t('settings.resetDescription')}</Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={22} color={Colors.muted} />
          </TouchableOpacity>

          <View style={styles.groupDivider} />

          <TouchableOpacity style={styles.groupRow} onPress={() => router.push('/(tabs)/settings/delete-account')}>
            <View>
              <Text style={[styles.groupRowLabel, { color: Colors.danger }]}>{t('settings.deleteAccount')}</Text>
              <Text style={[styles.groupRowDescription, { color: Colors.danger }]}>{t('settings.deleteAccountDescription')}</Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={22} color={Colors.danger} />
          </TouchableOpacity>
        </View>
      </View>

      {/* BOUTON DÉCONNEXION */}
      <TouchableOpacity
        style={styles.logoutButton}
        onPress={handleLogout}
      >
        <MaterialCommunityIcons name="logout" size={20} color={Colors.danger} />
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
    backgroundColor: Colors.cream,
  },
  header: {
    backgroundColor: Colors.deep,
    paddingVertical: 20,
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight ?? 24) + 16 : 56,
  },
  title: {
    fontSize: 24,
    fontWeight: '900',
    color: Colors.cream,
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 16,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 14,
    padding: 12,
  },
  profileAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileAvatarInitial: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.cream,
  },
  profileName: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.cream,
  },
  profileEmail: {
    fontSize: 12,
    color: 'rgba(248,243,236,0.6)',
    marginTop: 2,
  },
  profileEditButton: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.accent,
  },
  section: {
    paddingHorizontal: 16,
    marginVertical: 16,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  subCardFree: {
    borderRadius: 16,
    padding: 16,
  },
  subPriceRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  subPriceBox: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
  },
  subPriceBoxAnnual: {
    borderWidth: 1,
    borderColor: 'rgba(201,168,76,0.4)',
  },
  subStarBadge: {
    marginBottom: 6,
  },
  subStarBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.accent,
  },
  subPriceLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.6)',
    marginBottom: 4,
  },
  subPriceValue: {
    fontSize: 17,
    fontWeight: '800',
    color: Colors.cream,
  },
  subTrialButton: {
    backgroundColor: Colors.accent,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  subTrialButtonText: {
    color: Colors.deep,
    fontSize: 15,
    fontWeight: '800',
  },
  subCardPremium: {
    borderRadius: 16,
    padding: 16,
  },
  subCardPremiumHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  subCardPremiumPlan: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.cream,
  },
  subActiveBadge: {
    backgroundColor: Colors.accent,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  subActiveBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.deep,
  },
  subCardPremiumExpiry: {
    fontSize: 12,
    color: 'rgba(248,243,236,0.6)',
    marginTop: 6,
  },
  subManageButton: {
    marginTop: 14,
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  subManageButtonText: {
    color: Colors.cream,
    fontSize: 14,
    fontWeight: '700',
  },
  groupCard: {
    backgroundColor: Colors.white,
    borderRadius: 12,
    overflow: 'hidden',
  },
  groupRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  groupRowLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
  },
  groupRowDescription: {
    fontSize: 12,
    color: Colors.muted,
    marginTop: 2,
  },
  groupDivider: {
    height: 1,
    backgroundColor: Colors.cream2,
    marginLeft: 14,
  },
  supportRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 12,
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
  logoutButton: {
    backgroundColor: Colors.white,
    marginHorizontal: 16,
    marginVertical: 20,
    paddingVertical: 14,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: Colors.cream2,
  },
  logoutButtonText: {
    color: Colors.danger,
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
    backgroundColor: Colors.white,
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
    color: Colors.white,
    fontSize: 14,
    fontWeight: '600',
  },
  languageModalContent: {
    backgroundColor: Colors.white,
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
    borderBottomColor: Colors.cream2,
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
  resetConfirmButton: {
    backgroundColor: Colors.danger,
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
