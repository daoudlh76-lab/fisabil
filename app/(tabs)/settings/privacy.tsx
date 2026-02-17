import { useLanguage } from '@/hooks/use-language';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React from 'react';
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useColorScheme,
  Linking,
  Alert,
} from 'react-native';

export default function PrivacyPolicyScreen() {
  const { t } = useLanguage();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const openWebVersion = async () => {
    const url = 'https://fisabil.fr/privacy';
    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      } else {
        Alert.alert(
          t('settings.error') || 'Error',
          'Cannot open browser'
        );
      }
    } catch (error) {
      __DEV__ && console.error('Error opening URL:', error);
      Alert.alert(
        t('settings.error') || 'Error',
        'Cannot open browser'
      );
    }
  };

  return (
    <View style={[styles.container, isDark && styles.containerDark]}>
      <View style={[styles.header, isDark && styles.headerDark]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <MaterialCommunityIcons
            name="chevron-left"
            size={28}
            color={isDark ? '#fff' : '#333'}
          />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, isDark && styles.headerTitleDark]}>
          {t('settings.privacyPolicy')}
        </Text>
        <View style={styles.backButton} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
      >
        {/* Button to open web version */}
        <TouchableOpacity
          style={[styles.webButton, isDark && styles.webButtonDark]}
          onPress={openWebVersion}
        >
          <MaterialCommunityIcons
            name="open-in-new"
            size={20}
            color="#667eea"
            style={styles.webButtonIcon}
          />
          <Text style={styles.webButtonText}>
            {t('settings.openInBrowser')}
          </Text>
        </TouchableOpacity>

        <Text style={[styles.lastUpdated, isDark && styles.lastUpdatedDark]}>
          {t('settings.lastUpdated')}: 9 {t('common.february') || 'février'} 2026
        </Text>

        <View style={[styles.intro, isDark && styles.introDark]}>
          <Text style={[styles.introText, isDark && styles.introTextDark]}>
            {t('settings.privacyIntro')}
          </Text>
        </View>

        {/* Data Collection */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, isDark && styles.sectionTitleDark]}>
            📊 {t('settings.dataCollection')}
          </Text>
          <Text style={[styles.sectionText, isDark && styles.sectionTextDark]}>
            {t('settings.dataCollectionText')}
          </Text>
        </View>

        {/* Data Usage */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, isDark && styles.sectionTitleDark]}>
            🎯 {t('settings.dataUsage')}
          </Text>
          <Text style={[styles.sectionText, isDark && styles.sectionTextDark]}>
            {t('settings.dataUsageText')}
          </Text>
        </View>

        {/* AI Disclosure */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, isDark && styles.sectionTitleDark]}>
            🤖 {t('settings.aiDisclosure')}
          </Text>
          <Text style={[styles.sectionText, isDark && styles.sectionTextDark]}>
            {t('settings.aiDisclosureText')}
          </Text>
        </View>

        {/* Data Sharing */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, isDark && styles.sectionTitleDark]}>
            🔗 {t('settings.dataSharing')}
          </Text>
          <Text style={[styles.sectionText, isDark && styles.sectionTextDark]}>
            {t('settings.dataSharingText')}
          </Text>
        </View>

        {/* Data Security */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, isDark && styles.sectionTitleDark]}>
            🔐 {t('settings.dataSecurity')}
          </Text>
          <Text style={[styles.sectionText, isDark && styles.sectionTextDark]}>
            {t('settings.dataSecurityText')}
          </Text>
        </View>

        {/* Your Rights */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, isDark && styles.sectionTitleDark]}>
            ⚖️ {t('settings.yourRights')}
          </Text>
          <Text style={[styles.sectionText, isDark && styles.sectionTextDark]}>
            {t('settings.yourRightsText')}
          </Text>
        </View>

        {/* Data Retention */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, isDark && styles.sectionTitleDark]}>
            ⏳ {t('settings.dataRetention')}
          </Text>
          <Text style={[styles.sectionText, isDark && styles.sectionTextDark]}>
            {t('settings.dataRetentionText')}
          </Text>
        </View>

        {/* Cookies and Tracking */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, isDark && styles.sectionTitleDark]}>
            🍪 {t('settings.cookiesTracking')}
          </Text>
          <Text style={[styles.sectionText, isDark && styles.sectionTextDark]}>
            {t('settings.cookiesTrackingText')}
          </Text>
        </View>

        {/* Children's Privacy */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, isDark && styles.sectionTitleDark]}>
            👶 {t('settings.childrenPrivacy')}
          </Text>
          <Text style={[styles.sectionText, isDark && styles.sectionTextDark]}>
            {t('settings.childrenPrivacyText')}
          </Text>
        </View>

        {/* Policy Changes */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, isDark && styles.sectionTitleDark]}>
            🔄 {t('settings.policyChanges')}
          </Text>
          <Text style={[styles.sectionText, isDark && styles.sectionTextDark]}>
            {t('settings.policyChangesText')}
          </Text>
        </View>

        {/* Contact */}
        <View style={[styles.contactBox, isDark && styles.contactBoxDark]}>
          <Text style={[styles.sectionTitle, isDark && styles.sectionTitleDark]}>
            📧 {t('settings.contact')}
          </Text>
          <Text style={[styles.contactText, isDark && styles.contactTextDark]}>
            {t('settings.contactText')}
          </Text>
        </View>

        <View style={styles.footer}>
          <Text style={[styles.footerText, isDark && styles.footerTextDark]}>
            © 2026 Fisabil
          </Text>
          <Text style={[styles.footerText, isDark && styles.footerTextDark]}>
            www.fisabil.fr
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  containerDark: {
    backgroundColor: '#1a1a1a',
  },
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
  headerDark: {
    backgroundColor: '#2a2a2a',
    borderBottomColor: '#333',
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  headerTitleDark: {
    color: '#fff',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 20,
  },
  webButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f0f4ff',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 10,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#667eea',
  },
  webButtonDark: {
    backgroundColor: '#2a2a4a',
    borderColor: '#667eea',
  },
  webButtonIcon: {
    marginRight: 8,
  },
  webButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#667eea',
  },
  lastUpdated: {
    fontSize: 13,
    color: '#999',
    textAlign: 'center',
    marginBottom: 20,
  },
  lastUpdatedDark: {
    color: '#666',
  },
  intro: {
    backgroundColor: '#f0f4ff',
    padding: 16,
    borderRadius: 10,
    borderLeftWidth: 4,
    borderLeftColor: '#667eea',
    marginBottom: 20,
  },
  introDark: {
    backgroundColor: '#2a2a4a',
  },
  introText: {
    fontSize: 15,
    color: '#333',
    lineHeight: 22,
  },
  introTextDark: {
    color: '#ccc',
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#333',
    marginBottom: 10,
  },
  sectionTitleDark: {
    color: '#fff',
  },
  sectionText: {
    fontSize: 15,
    color: '#555',
    lineHeight: 24,
  },
  sectionTextDark: {
    color: '#ccc',
  },
  contactBox: {
    backgroundColor: '#f9f9f9',
    padding: 16,
    borderRadius: 10,
    marginTop: 10,
    marginBottom: 30,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  contactBoxDark: {
    backgroundColor: '#2a2a2a',
    borderColor: '#333',
  },
  contactText: {
    fontSize: 15,
    color: '#555',
    lineHeight: 24,
  },
  contactTextDark: {
    color: '#ccc',
  },
  footer: {
    alignItems: 'center',
    paddingVertical: 20,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    marginTop: 20,
  },
  footerText: {
    fontSize: 14,
    color: '#999',
    marginVertical: 4,
  },
  footerTextDark: {
    color: '#666',
  },
});
