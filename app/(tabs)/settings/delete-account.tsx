import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useColorScheme,
} from 'react-native';

import { useLanguage } from '@/hooks/use-language';
import { supabase } from '@/src/lib/supabase';

export default function DeleteAccountScreen() {
  const { t } = useLanguage();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const [confirmText, setConfirmText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);

  const showError = (message?: string) => {
    Alert.alert(
      t('settings.deletionError') || t('settings.error') || 'Error',
      message || 'Une erreur est survenue'
    );
  };

  const handleDeleteAccount = async () => {
    if (isDeleting) return;

    if (!acknowledged) {
      Alert.alert(
        t('settings.error') || 'Error',
        t('settings.deleteAccountConfirm') || 'Veuillez confirmer.'
      );
      return;
    }

    if (confirmText.trim().toUpperCase() !== 'DELETE') {
      Alert.alert(
        t('settings.error') || 'Error',
        t('settings.typeDeleteToConfirm') || 'Tapez DELETE pour confirmer.'
      );
      return;
    }

    Alert.alert(
      t('settings.confirmDeletion') || 'Confirm',
      t('settings.confirmDeletionMessage') ||
        'Êtes-vous sûr de vouloir supprimer votre compte ?',
      [
        { text: t('settings.cancel') || 'Cancel', style: 'cancel' },
        {
          text: t('settings.deleteAccountButton') || 'Delete',
          style: 'destructive',
          onPress: executeAccountDeletion,
        },
      ]
    );
  };

  const executeAccountDeletion = async () => {
    setIsDeleting(true);

    try {
      // 1) Récupère une session valide
      const { data: sessionData, error: sessionError } =
        await supabase.auth.getSession();

      if (sessionError) {
        __DEV__ && console.error('❌ getSession error:', sessionError);
        throw new Error('Impossible de récupérer la session. Reconnecte-toi.');
      }

      const accessToken = sessionData?.session?.access_token;
      const userId = sessionData?.session?.user?.id;

      __DEV__ && console.log('🔐 Session check:', {
        hasSession: !!sessionData?.session,
        hasToken: !!accessToken,
        tokenLength: accessToken?.length,
        userId,
      });

      if (!accessToken) {
        throw new Error('Session introuvable. Déconnecte-toi puis reconnecte-toi.');
      }

      // 2) Appel Edge Function via fetch direct
      const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
      const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

      if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
        throw new Error(
          'Variables manquantes: EXPO_PUBLIC_SUPABASE_URL ou EXPO_PUBLIC_SUPABASE_ANON_KEY'
        );
      }

      const url = `${SUPABASE_URL}/functions/v1/delete-account`;

      __DEV__ && console.log('🔥 Calling delete-account:', url);
      __DEV__ && console.log('📤 Token prefix:', accessToken.slice(0, 20) + '...');

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`, // ✅ IMPORTANT
          apikey: SUPABASE_ANON_KEY, // ✅ IMPORTANT
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });

      const text = await res.text();
      let json: any = null;
      try {
        json = JSON.parse(text);
      } catch {}

      __DEV__ && console.log('📥 Response:', { status: res.status, body: json ?? text });

      if (!res.ok) {
        const msg =
          json?.error ||
          json?.details ||
          json?.message ||
          text ||
          `HTTP ${res.status}`;
        throw new Error(msg);
      }

      __DEV__ && console.log('✅ Account deleted:', json);

      // 3) Sign out (même si le user est déjà supprimé, ça ne doit pas casser)
      await supabase.auth.signOut();

      Alert.alert(
        t('settings.accountDeleted') || 'Account deleted',
        t('settings.accountDeletedMessage') ||
          'Votre compte a été supprimé avec succès.'
      );
    } catch (e: any) {
      __DEV__ && console.error('❌ Account deletion error:', e);
      showError(e?.message || String(e));
      setIsDeleting(false);
    }
  };

  return (
    <View style={[styles.container, isDark && styles.containerDark]}>
      {/* Header */}
      <View style={[styles.header, isDark && styles.headerDark]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
          disabled={isDeleting}
        >
          <MaterialCommunityIcons
            name="chevron-left"
            size={28}
            color={isDark ? '#fff' : '#333'}
          />
        </TouchableOpacity>

        <Text style={[styles.headerTitle, isDark && styles.headerTitleDark]}>
          {t('settings.deleteAccount') || 'Supprimer mon compte'}
        </Text>

        <View style={styles.backButton} />
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        {/* Warning Banner */}
        <View style={styles.warningBanner}>
          <MaterialCommunityIcons name="alert-circle" size={40} color="#FF5722" />
          <Text style={styles.warningTitle}>
            {t('settings.deleteAccountWarning') ||
              '⚠️ Attention : action irréversible'}
          </Text>
        </View>

        {/* Info Section */}
        <View style={[styles.infoBox, isDark && styles.infoBoxDark]}>
          <Text style={[styles.infoTitle, isDark && styles.infoTitleDark]}>
            {t('settings.deleteAccountTitle') || 'Suppression du compte'}
          </Text>
          <Text style={[styles.infoText, isDark && styles.infoTextDark]}>
            {t('settings.deleteAccountInfo') ||
              'Toutes vos données seront supprimées définitivement.'}
          </Text>
        </View>

        {/* Acknowledgment Checkbox */}
        <TouchableOpacity
          style={[styles.checkboxRow, isDark && styles.checkboxRowDark]}
          onPress={() => setAcknowledged((v) => !v)}
          disabled={isDeleting}
        >
          <View
            style={[
              styles.checkbox,
              acknowledged && styles.checkboxChecked,
              isDark && acknowledged && styles.checkboxCheckedDark,
            ]}
          >
            {acknowledged && (
              <MaterialCommunityIcons name="check" size={20} color="#fff" />
            )}
          </View>

          <Text style={[styles.checkboxText, isDark && styles.checkboxTextDark]}>
            {t('settings.deleteAccountConfirm') ||
              "Je comprends que cette action est irréversible"}
          </Text>
        </TouchableOpacity>

        {/* Confirmation Input */}
        <View style={styles.confirmSection}>
          <Text style={[styles.confirmLabel, isDark && styles.confirmLabelDark]}>
            {t('settings.typeDeleteToConfirm') || 'Tapez DELETE pour confirmer'}
          </Text>
          <TextInput
            style={[styles.confirmInput, isDark && styles.confirmInputDark]}
            value={confirmText}
            onChangeText={setConfirmText}
            placeholder="DELETE"
            placeholderTextColor={isDark ? '#666' : '#999'}
            autoCapitalize="characters"
            autoCorrect={false}
            editable={!isDeleting}
          />
        </View>

        {/* Delete Button */}
        <TouchableOpacity
          style={[styles.deleteButton, isDeleting && styles.deleteButtonDisabled]}
          onPress={handleDeleteAccount}
          disabled={isDeleting}
        >
          {isDeleting ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <MaterialCommunityIcons
              name="delete-forever"
              size={20}
              color="#fff"
              style={styles.deleteButtonIcon}
            />
          )}

          <Text style={styles.deleteButtonText}>
            {isDeleting
              ? t('settings.deletionInProgress') || 'Suppression en cours...'
              : t('settings.deleteAccountButton') || 'Supprimer mon compte'}
          </Text>
        </TouchableOpacity>

        {/* Support Contact */}
        <View style={[styles.supportBox, isDark && styles.supportBoxDark]}>
          <MaterialCommunityIcons
            name="help-circle-outline"
            size={24}
            color="#1976d2"
          />
          <Text style={[styles.supportText, isDark && styles.supportTextDark]}>
            {t('settings.contactText') || 'Besoin d’aide ? contact@fisabil.fr'}
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  containerDark: { backgroundColor: '#1a1a1a' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Platform.OS === 'ios' ? 50 : 20,
    paddingBottom: 16,
    paddingHorizontal: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  headerDark: { backgroundColor: '#2a2a2a', borderBottomColor: '#333' },

  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },

  headerTitle: { fontSize: 18, fontWeight: '600', color: '#333' },
  headerTitleDark: { color: '#fff' },

  scrollView: { flex: 1 },
  content: { padding: 20 },

  warningBanner: {
    backgroundColor: '#FFEBEE',
    padding: 20,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: 2,
    borderColor: '#FF5722',
  },
  warningTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FF5722',
    marginTop: 10,
    textAlign: 'center',
  },

  infoBox: {
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 12,
    marginBottom: 20,
    borderLeftWidth: 4,
    borderLeftColor: '#FF9800',
  },
  infoBoxDark: { backgroundColor: '#2a2a2a' },

  infoTitle: { fontSize: 18, fontWeight: '700', color: '#333', marginBottom: 12 },
  infoTitleDark: { color: '#fff' },

  infoText: { fontSize: 15, color: '#555', lineHeight: 24 },
  infoTextDark: { color: '#ccc' },

  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    marginBottom: 20,
  },
  checkboxRowDark: { backgroundColor: '#2a2a2a' },

  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#999',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    marginTop: 2,
  },
  checkboxChecked: { backgroundColor: '#4CAF50', borderColor: '#4CAF50' },
  checkboxCheckedDark: { backgroundColor: '#4CAF50', borderColor: '#4CAF50' },

  checkboxText: { flex: 1, fontSize: 14, color: '#333', lineHeight: 20 },
  checkboxTextDark: { color: '#ccc' },

  confirmSection: { marginBottom: 30 },

  confirmLabel: { fontSize: 14, fontWeight: '600', color: '#333', marginBottom: 10 },
  confirmLabelDark: { color: '#ccc' },

  confirmInput: {
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    paddingVertical: 14,
    paddingHorizontal: 16,
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  confirmInputDark: {
    backgroundColor: '#2a2a2a',
    borderColor: '#444',
    color: '#fff',
  },

  deleteButton: {
    backgroundColor: '#FF5722',
    paddingVertical: 16,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  deleteButtonDisabled: { backgroundColor: '#999' },

  deleteButtonIcon: { marginRight: 8 },
  deleteButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  supportBox: {
    backgroundColor: '#E3F2FD',
    padding: 16,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  supportBoxDark: { backgroundColor: '#1a2a3a' },

  supportText: { flex: 1, fontSize: 13, color: '#1976d2', marginLeft: 12, lineHeight: 20 },
  supportTextDark: { color: '#64B5F6' },
});