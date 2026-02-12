import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, ActivityIndicator, Linking, Platform } from 'react-native';
import { router } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useLanguage } from '@/hooks/use-language';
import { useSubscription } from '@/contexts/subscription-context';

export default function SubscriptionScreen() {
  const { t } = useLanguage();
  const {
    subscription,
    isPremium,
    monthlyPackage,
    annualPackage,
    purchase,
    restore,
    isProcessing,
    isLoaded,
    error,
    getCurrentPlanInfo,
  } = useSubscription();

  const currentPlan = getCurrentPlanInfo();

  // ─── Purchase handler ──────────────────────────────────────────────
  const handlePurchase = async (type: 'monthly' | 'annual') => {
    const pkg = type === 'monthly' ? monthlyPackage : annualPackage;

    if (!pkg) {
      Alert.alert(
        t('subscription.error') || 'Error',
        t('subscription.productsUnavailable') || 'Products not available. Please try again later.'
      );
      return;
    }

    const success = await purchase(pkg);
    if (success) {
      Alert.alert(
        t('subscription.purchaseSuccess') || '✅ Success',
        t('subscription.successMessage'),
        [{ text: 'OK', onPress: () => router.back() }]
      );
    }
  };

  // ─── Restore handler ──────────────────────────────────────────────
  const handleRestore = async () => {
    const restored = await restore();
    if (restored) {
      Alert.alert(
        t('subscription.restoreSuccess') || '✅ Restored',
        t('subscription.successMessage')
      );
    } else {
      Alert.alert(
        t('subscription.restoreNone') || 'No purchases found',
        t('subscription.restoreNoneMessage') || 'No previous purchases were found for this account.'
      );
    }
  };

  // ─── Manage subscription (deep link to store) ─────────────────────
  const handleManageSubscription = () => {
    if (Platform.OS === 'ios') {
      Linking.openURL('https://apps.apple.com/account/subscriptions');
    } else {
      Linking.openURL('https://play.google.com/store/account/subscriptions');
    }
  };

  // ─── Price helpers ─────────────────────────────────────────────────
  const monthlyPrice = monthlyPackage?.product.priceString ?? '9.99€';
  const annualPrice = annualPackage?.product.priceString ?? '99.99€';

  // Calculate savings percentage
  const monthlyCost = monthlyPackage?.product.price ?? 9.99;
  const annualCost = annualPackage?.product.price ?? 99.99;
  const savingsPercent = Math.round((1 - annualCost / (monthlyCost * 12)) * 100);

  if (!isLoaded) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color="#2E7D32" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <MaterialCommunityIcons name="arrow-left" size={24} color="#2E7D32" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('subscription.choosePlan')}</Text>
      </View>

      {/* Current plan info */}
      {isPremium && (
        <View style={styles.premiumBanner}>
          <Text style={styles.premiumBannerIcon}>👑</Text>
          <Text style={styles.premiumBannerTitle}>{t('subscription.premiumActive') || 'Premium Active'}</Text>
          {subscription.expiryDate && (
            <Text style={styles.premiumBannerExpiry}>
              {t('subscription.expiresOn') || 'Expires'}: {subscription.expiryDate.toLocaleDateString()}
            </Text>
          )}
          <TouchableOpacity style={styles.manageButton} onPress={handleManageSubscription}>
            <Text style={styles.manageButtonText}>{t('subscription.manageSubscription') || 'Manage Subscription'}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Error message */}
      {error && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>⚠️ {error}</Text>
        </View>
      )}

      {/* Free plan card */}
      {!isPremium && (
        <View style={styles.freePlanCard}>
          <View style={styles.planHeader}>
            <Text style={styles.planIcon}>🆓</Text>
            <View>
              <Text style={styles.planName}>{t('subscription.freePlan')}</Text>
              <Text style={styles.planPrice}>{t('subscription.free')}</Text>
            </View>
          </View>
          <View style={styles.featuresList}>
            <FeatureRow icon="robot" text={`${t('settings.aiTutor')} (5/${t('subscription.perDay')})`} />
            <FeatureRow icon="microphone" text={`${t('settings.dictations')} (2/${t('subscription.perDay')})`} />
            <FeatureRow icon="camera" text={`${t('settings.scannerFeature')} (1/${t('subscription.perDay')})`} />
            <FeatureRow icon="cards" text={t('settings.vocabCards')} />
          </View>
          <View style={styles.currentBadge}>
            <Text style={styles.currentBadgeText}>{t('subscription.currentPlanBadge')}</Text>
          </View>
        </View>
      )}

      {/* Premium plans */}
      <Text style={styles.sectionTitle}>
        {isPremium ? t('subscription.changePlan') || 'Change Plan' : t('subscription.unlockAll') || '🔓 Unlock Everything'}
      </Text>

      {/* Monthly card */}
      <TouchableOpacity
        style={[styles.planCard, subscription.plan === 'premium_monthly' && styles.activePlanCard]}
        onPress={() => handlePurchase('monthly')}
        disabled={isProcessing || subscription.plan === 'premium_monthly'}
      >
        <View style={styles.planHeader}>
          <Text style={styles.planIcon}>💎</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.planName}>{t('subscription.monthlyPlan')}</Text>
            <Text style={styles.planPrice}>{monthlyPrice}/{t('subscription.mo')}</Text>
          </View>
          {subscription.plan === 'premium_monthly' && (
            <View style={styles.activeBadge}>
              <Text style={styles.activeBadgeText}>✓</Text>
            </View>
          )}
        </View>
        <View style={styles.featuresList}>
          <FeatureRow icon="infinity" text={t('subscription.benefit1')} green />
          <FeatureRow icon="camera" text={t('subscription.benefit2')} green />
          <FeatureRow icon="headset" text={t('subscription.benefit3')} green />
        </View>
        {subscription.plan !== 'premium_monthly' && (
          <View style={styles.subscribeButton}>
            {isProcessing ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Text style={styles.subscribeButtonText}>{t('subscription.subscribe')}</Text>
            )}
          </View>
        )}
      </TouchableOpacity>

      {/* Annual card */}
      <TouchableOpacity
        style={[styles.planCard, styles.bestValueCard, subscription.plan === 'premium_annual' && styles.activePlanCard]}
        onPress={() => handlePurchase('annual')}
        disabled={isProcessing || subscription.plan === 'premium_annual'}
      >
        <View style={styles.bestValueBadge}>
          <Text style={styles.bestValueText}>{t('subscription.bestValue')}</Text>
        </View>
        <View style={styles.planHeader}>
          <Text style={styles.planIcon}>👑</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.planName}>{t('subscription.annualPlan')}</Text>
            <Text style={styles.planPrice}>{annualPrice}/{t('subscription.yr')}</Text>
          </View>
          {subscription.plan === 'premium_annual' && (
            <View style={styles.activeBadge}>
              <Text style={styles.activeBadgeText}>✓</Text>
            </View>
          )}
        </View>
        {savingsPercent > 0 && (
          <Text style={styles.savingsText}>
            {t('subscription.saveAnnually', { amount: String(savingsPercent) })}
          </Text>
        )}
        <View style={styles.featuresList}>
          <FeatureRow icon="infinity" text={t('subscription.benefit1')} green />
          <FeatureRow icon="camera" text={t('subscription.benefit2')} green />
          <FeatureRow icon="headset" text={t('subscription.benefit3')} green />
        </View>
        {subscription.plan !== 'premium_annual' && (
          <View style={styles.subscribeButton}>
            {isProcessing ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Text style={styles.subscribeButtonText}>{t('subscription.subscribe')}</Text>
            )}
          </View>
        )}
      </TouchableOpacity>

      {/* Restore purchases */}
      <TouchableOpacity
        style={styles.restoreButton}
        onPress={handleRestore}
        disabled={isProcessing}
      >
        <Text style={styles.restoreButtonText}>
          {t('subscription.restorePurchases') || 'Restore Purchases'}
        </Text>
      </TouchableOpacity>

      {/* Legal text (required by App Store) */}
      <View style={styles.legalSection}>
        <Text style={styles.legalText}>
          {t('subscription.legalAutoRenew') ||
            'Payment will be charged to your iTunes/Google Play account at confirmation of purchase. Subscription automatically renews unless auto-renew is turned off at least 24 hours before the end of the current period.'}
        </Text>
        <View style={styles.legalLinks}>
          <TouchableOpacity onPress={() => Linking.openURL('https://fisabil.app/terms')}>
            <Text style={styles.legalLink}>{t('subscription.termsOfUse') || 'Terms of Use'}</Text>
          </TouchableOpacity>
          <Text style={styles.legalSeparator}>|</Text>
          <TouchableOpacity onPress={() => Linking.openURL('https://fisabil.app/privacy')}>
            <Text style={styles.legalLink}>{t('subscription.privacyPolicy') || 'Privacy Policy'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
}

// ─── Feature Row Component ───────────────────────────────────────────────

function FeatureRow({ icon, text, green }: { icon: string; text: string; green?: boolean }) {
  return (
    <View style={styles.featureRow}>
      <MaterialCommunityIcons
        name={icon as any}
        size={20}
        color={green ? '#2E7D32' : '#666'}
      />
      <Text style={[styles.featureText, green && styles.greenFeatureText]}>{text}</Text>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  backButton: {
    padding: 8,
    marginRight: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#2E7D32',
  },
  premiumBanner: {
    backgroundColor: '#E8F5E9',
    margin: 16,
    padding: 20,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#2E7D32',
    alignItems: 'center',
  },
  premiumBannerIcon: {
    fontSize: 48,
    marginBottom: 8,
  },
  premiumBannerTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#2E7D32',
    marginBottom: 4,
  },
  premiumBannerExpiry: {
    fontSize: 14,
    color: '#555',
    marginBottom: 12,
  },
  manageButton: {
    backgroundColor: '#2E7D32',
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 8,
  },
  manageButtonText: {
    color: '#FFF',
    fontWeight: '600',
    fontSize: 14,
  },
  errorBanner: {
    backgroundColor: '#FFEBEE',
    margin: 16,
    marginTop: 0,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#EF9A9A',
  },
  errorText: {
    color: '#C62828',
    fontSize: 14,
  },
  freePlanCard: {
    backgroundColor: '#FFF',
    margin: 16,
    marginBottom: 8,
    borderRadius: 16,
    padding: 20,
    borderWidth: 2,
    borderColor: '#E0E0E0',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 12,
  },
  planCard: {
    backgroundColor: '#FFF',
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 16,
    padding: 20,
    borderWidth: 2,
    borderColor: '#E0E0E0',
    position: 'relative',
  },
  activePlanCard: {
    borderColor: '#2E7D32',
    backgroundColor: '#F1F8F4',
  },
  bestValueCard: {
    borderColor: '#FFC107',
    borderWidth: 3,
  },
  bestValueBadge: {
    position: 'absolute',
    top: -12,
    right: 20,
    backgroundColor: '#FFC107',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    zIndex: 1,
  },
  bestValueText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  planHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  planIcon: {
    fontSize: 36,
    marginRight: 12,
  },
  planName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  planPrice: {
    fontSize: 16,
    color: '#2E7D32',
    fontWeight: '600',
    marginTop: 2,
  },
  savingsText: {
    fontSize: 14,
    color: '#FFC107',
    fontWeight: '600',
    marginBottom: 8,
  },
  featuresList: {
    gap: 10,
    marginVertical: 12,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  featureText: {
    fontSize: 15,
    color: '#666',
    flex: 1,
  },
  greenFeatureText: {
    color: '#2E7D32',
    fontWeight: '500',
  },
  currentBadge: {
    backgroundColor: '#E0E0E0',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  currentBadgeText: {
    color: '#666',
    fontSize: 15,
    fontWeight: '600',
  },
  activeBadge: {
    backgroundColor: '#2E7D32',
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  activeBadgeText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  subscribeButton: {
    backgroundColor: '#2E7D32',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  subscribeButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  restoreButton: {
    alignItems: 'center',
    paddingVertical: 16,
    marginTop: 4,
  },
  restoreButtonText: {
    color: '#2E7D32',
    fontSize: 15,
    textDecorationLine: 'underline',
  },
  legalSection: {
    paddingHorizontal: 24,
    paddingBottom: 40,
    alignItems: 'center',
  },
  legalText: {
    fontSize: 11,
    color: '#999',
    textAlign: 'center',
    lineHeight: 16,
    marginBottom: 8,
  },
  legalLinks: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  legalLink: {
    fontSize: 12,
    color: '#2E7D32',
    textDecorationLine: 'underline',
  },
  legalSeparator: {
    fontSize: 12,
    color: '#999',
  },
});
