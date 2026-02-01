import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { router } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useLanguage } from '@/hooks/use-language';
import { useSubscription, PlanInfo } from '@/contexts/subscription-context';

export default function SubscriptionScreen() {
  const { t } = useLanguage();
  const { subscription, upgradeToPlan, getPlans, getCurrentPlanInfo } = useSubscription();
  const plans = getPlans();
  const currentPlan = getCurrentPlanInfo();

  const handleSelectPlan = (plan: PlanInfo) => {
    if (plan.key === 'free') {
      Alert.alert(
        t('subscription.alreadyFree'),
        t('subscription.alreadyFreeMessage')
      );
      return;
    }

    if (plan.key === subscription.plan) {
      Alert.alert(
        t('subscription.alreadySubscribed'),
        t('subscription.alreadySubscribedMessage')
      );
      return;
    }

    Alert.alert(
      t('subscription.confirmUpgrade'),
      t('subscription.confirmUpgradeMessage', {
        plan: t(plan.labelKey),
        price: plan.price.toFixed(2),
        currency: plan.currency,
        period: plan.period ? t(`subscription.per${plan.period.charAt(0).toUpperCase() + plan.period.slice(1)}`) : '',
      }),
      [
        {
          text: t('common.cancel'),
          style: 'cancel',
        },
        {
          text: t('common.confirm'),
          onPress: () => {
            upgradeToPlan(plan.key);
            Alert.alert(
              t('subscription.success'),
              t('subscription.successMessage'),
              [
                {
                  text: 'OK',
                  onPress: () => router.back(),
                },
              ]
            );
          },
        },
      ]
    );
  };

  const getPlanIcon = (planKey: string) => {
    switch (planKey) {
      case 'free':
        return '🆓';
      case 'premium_monthly':
        return '💎';
      case 'premium_annual':
        return '👑';
      default:
        return '📦';
    }
  };

  const getFeatureIcon = (feature: string) => {
    switch (feature) {
      case 'tutor':
        return 'robot';
      case 'dictation':
        return 'microphone';
      case 'vocab':
        return 'cards';
      case 'scanner':
        return 'camera';
      case 'unlimited_messages':
        return 'infinity';
      default:
        return 'check';
    }
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <MaterialCommunityIcons name="arrow-left" size={24} color="#2E7D32" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('subscription.choosePlan')}</Text>
      </View>

      {currentPlan && (
        <View style={styles.currentPlanCard}>
          <Text style={styles.currentPlanLabel}>{t('subscription.currentPlan')}</Text>
          <Text style={styles.currentPlanName}>
            {getPlanIcon(currentPlan.key)} {t(currentPlan.labelKey)}
          </Text>
          {currentPlan.price > 0 && (
            <Text style={styles.currentPlanPrice}>
              {currentPlan.price.toFixed(2)}{currentPlan.currency}/{t(`subscription.per${currentPlan.period?.charAt(0).toUpperCase()}${currentPlan.period?.slice(1)}`)}
            </Text>
          )}
        </View>
      )}

      <View style={styles.plansContainer}>
        {plans.map((plan) => {
          const isCurrentPlan = plan.key === subscription.plan;
          const isFree = plan.key === 'free';

          return (
            <TouchableOpacity
              key={plan.key}
              style={[
                styles.planCard,
                isCurrentPlan && styles.currentPlanHighlight,
                plan.key === 'premium_annual' && styles.bestValueCard,
              ]}
              onPress={() => handleSelectPlan(plan)}
              disabled={isCurrentPlan}
            >
              {plan.key === 'premium_annual' && (
                <View style={styles.bestValueBadge}>
                  <Text style={styles.bestValueText}>{t('subscription.bestValue')}</Text>
                </View>
              )}

              <View style={styles.planHeader}>
                <Text style={styles.planIcon}>{getPlanIcon(plan.key)}</Text>
                <Text style={styles.planName}>{t(plan.labelKey)}</Text>
              </View>

              <View style={styles.priceContainer}>
                {isFree ? (
                  <Text style={styles.freePrice}>{t('subscription.free')}</Text>
                ) : (
                  <>
                    <Text style={styles.price}>
                      {plan.price.toFixed(2)}{plan.currency}
                    </Text>
                    <Text style={styles.period}>
                      /{t(`subscription.per${plan.period?.charAt(0).toUpperCase()}${plan.period?.slice(1)}`)}
                    </Text>
                  </>
                )}
              </View>

              {plan.key === 'premium_annual' && (
                <Text style={styles.savingsText}>
                  {t('subscription.saveAnnually', { amount: '20' })}
                </Text>
              )}

              <View style={styles.featuresContainer}>
                {plan.features.map((featureName) => {
                  const feature = [
                    { name: 'tutor', labelKey: 'settings.aiTutor', freeLimit: 5 },
                    { name: 'dictation', labelKey: 'settings.dictations', freeLimit: 2 },
                    { name: 'vocab', labelKey: 'settings.vocabCards' },
                    { name: 'scanner', labelKey: 'settings.scannerFeature', freeLimit: 1 },
                    { name: 'unlimited_messages', labelKey: 'settings.unlimitedMessages' },
                  ].find(f => f.name === featureName);

                  if (!feature) return null;

                  return (
                    <View key={featureName} style={styles.featureRow}>
                      <MaterialCommunityIcons
                        name={getFeatureIcon(featureName)}
                        size={20}
                        color={isCurrentPlan ? '#2E7D32' : '#666'}
                      />
                      <Text style={[styles.featureText, isCurrentPlan && styles.currentFeatureText]}>
                        {t(feature.labelKey)}
                        {feature.freeLimit && isFree && ` (${feature.freeLimit}/${t('subscription.perDay')})`}
                      </Text>
                    </View>
                  );
                })}
              </View>

              {isCurrentPlan ? (
                <View style={styles.currentBadge}>
                  <Text style={styles.currentBadgeText}>{t('subscription.currentPlanBadge')}</Text>
                </View>
              ) : (
                <TouchableOpacity
                  style={[styles.selectButton, isFree && styles.freeButton]}
                  onPress={() => handleSelectPlan(plan)}
                >
                  <Text style={[styles.selectButtonText, isFree && styles.freeButtonText]}>
                    {isFree ? t('subscription.downgrade') : t('subscription.subscribe')}
                  </Text>
                </TouchableOpacity>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.infoSection}>
        <Text style={styles.infoTitle}>{t('subscription.whatYouGet')}</Text>
        <View style={styles.infoRow}>
          <MaterialCommunityIcons name="check-circle" size={20} color="#2E7D32" />
          <Text style={styles.infoText}>{t('subscription.benefit1')}</Text>
        </View>
        <View style={styles.infoRow}>
          <MaterialCommunityIcons name="check-circle" size={20} color="#2E7D32" />
          <Text style={styles.infoText}>{t('subscription.benefit2')}</Text>
        </View>
        <View style={styles.infoRow}>
          <MaterialCommunityIcons name="check-circle" size={20} color="#2E7D32" />
          <Text style={styles.infoText}>{t('subscription.benefit3')}</Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
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
  currentPlanCard: {
    backgroundColor: '#E8F5E9',
    margin: 16,
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#2E7D32',
  },
  currentPlanLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
  currentPlanName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#2E7D32',
    marginBottom: 4,
  },
  currentPlanPrice: {
    fontSize: 16,
    color: '#555',
  },
  plansContainer: {
    padding: 16,
    gap: 16,
  },
  planCard: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 20,
    borderWidth: 2,
    borderColor: '#E0E0E0',
    position: 'relative',
  },
  currentPlanHighlight: {
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
    fontSize: 32,
    marginRight: 12,
  },
  planName: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#333',
  },
  priceContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 8,
  },
  price: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#2E7D32',
  },
  period: {
    fontSize: 16,
    color: '#666',
    marginLeft: 4,
  },
  freePrice: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#666',
  },
  savingsText: {
    fontSize: 14,
    color: '#FFC107',
    fontWeight: '600',
    marginBottom: 12,
  },
  featuresContainer: {
    gap: 12,
    marginVertical: 16,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  featureText: {
    fontSize: 15,
    color: '#666',
  },
  currentFeatureText: {
    color: '#2E7D32',
    fontWeight: '500',
  },
  currentBadge: {
    backgroundColor: '#2E7D32',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  currentBadgeText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  selectButton: {
    backgroundColor: '#2E7D32',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  selectButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  freeButton: {
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  freeButtonText: {
    color: '#666',
  },
  infoSection: {
    backgroundColor: '#FFF',
    margin: 16,
    padding: 20,
    borderRadius: 12,
    gap: 12,
  },
  infoTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  infoText: {
    fontSize: 15,
    color: '#666',
    flex: 1,
  },
});
