import { useLanguage } from '@/hooks/use-language';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import Constants from 'expo-constants';
import React from 'react';
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useColorScheme,
} from 'react-native';

export default function AboutScreen() {
  const { t } = useLanguage();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const appVersion = Constants.expoConfig?.version || '1.0.0';
  const platformName = Platform.OS === 'ios' ? 'iOS' : 'Android';

  return (
    <View style={[styles.container, isDark && styles.containerDark]}>
      <View style={styles.header}>
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
          {t('settings.about')}
        </Text>
        <View style={styles.backButton} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
      >
        <Text style={[styles.title, isDark && styles.titleDark]}>
          {t('settings.aboutAITitle')}
        </Text>

        <Text style={[styles.description, isDark && styles.descriptionDark]}>
          {t('settings.aboutAIDescription')}
        </Text>

        <View style={styles.divider} />

        <View style={styles.infoRow}>
          <Text style={[styles.infoLabel, isDark && styles.infoLabelDark]}>
            {t('settings.appVersion')}
          </Text>
          <Text style={[styles.infoValue, isDark && styles.infoValueDark]}>
            {appVersion}
          </Text>
        </View>

        <View style={styles.infoRow}>
          <Text style={[styles.infoLabel, isDark && styles.infoLabelDark]}>
            {t('settings.platform')}
          </Text>
          <Text style={[styles.infoValue, isDark && styles.infoValueDark]}>
            {platformName}
          </Text>
        </View>

        <View style={styles.footer}>
          <Text style={[styles.footerText, isDark && styles.footerTextDark]}>
            © 2026 Fisabil
          </Text>
          <Text style={[styles.footerText, isDark && styles.footerTextDark]}>
            contact@fisabil.fr
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
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 20,
    textAlign: 'center',
  },
  titleDark: {
    color: '#fff',
  },
  description: {
    fontSize: 16,
    lineHeight: 24,
    color: '#555',
    marginBottom: 30,
    textAlign: 'left',
  },
  descriptionDark: {
    color: '#ccc',
  },
  divider: {
    height: 1,
    backgroundColor: '#e0e0e0',
    marginVertical: 20,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  infoLabel: {
    fontSize: 15,
    color: '#666',
    fontWeight: '500',
  },
  infoLabelDark: {
    color: '#aaa',
  },
  infoValue: {
    fontSize: 15,
    color: '#333',
    fontWeight: '600',
  },
  infoValueDark: {
    color: '#fff',
  },
  footer: {
    marginTop: 40,
    alignItems: 'center',
    paddingVertical: 20,
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
