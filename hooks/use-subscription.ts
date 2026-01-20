import { useCallback, useEffect, useState } from 'react';

export type SubscriptionPlan = 'free' | 'premium';
export type FeatureName = 'dictation' | 'vocab' | 'tutor' | 'scanner' | 'unlimited_messages';

export interface Subscription {
  plan: SubscriptionPlan;
  startDate: Date;
  expiryDate: Date | null;
  isActive: boolean;
  daysRemaining: number;
}

export interface Feature {
  name: FeatureName;
  labelKey: string; // Clé de traduction
  freeAllowed: boolean;
  premiumAllowed: boolean;
  freeLimit?: number;
}

const FEATURES: Feature[] = [
  {
    name: 'tutor',
    labelKey: 'settings.aiTutor',
    freeAllowed: true,
    premiumAllowed: true,
    freeLimit: 5,
  },
  {
    name: 'dictation',
    labelKey: 'settings.dictations',
    freeAllowed: true,
    premiumAllowed: true,
    freeLimit: 2,
  },
  {
    name: 'vocab',
    labelKey: 'settings.vocabCards',
    freeAllowed: true,
    premiumAllowed: true,
  },
  {
    name: 'scanner',
    labelKey: 'settings.scannerFeature',
    freeAllowed: false,
    premiumAllowed: true,
  },
  {
    name: 'unlimited_messages',
    labelKey: 'settings.unlimitedMessages',
    freeAllowed: false,
    premiumAllowed: true,
  },
];

export const useSubscription = () => {
  const [subscription, setSubscription] = useState<Subscription>({
    plan: 'free',
    startDate: new Date(),
    expiryDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    isActive: true,
    daysRemaining: 7,
  });

  useEffect(() => {
    if (subscription.expiryDate) {
      const now = new Date();
      const daysLeft = Math.ceil(
        (subscription.expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      );
      setSubscription((prev) => ({
        ...prev,
        daysRemaining: Math.max(0, daysLeft),
        isActive: daysLeft > 0,
      }));
    }
  }, [subscription.expiryDate]);

  const hasFeatureAccess = useCallback(
    (featureName: FeatureName): boolean => {
      const feature = FEATURES.find((f) => f.name === featureName);
      if (!feature) return false;

      if (subscription.plan === 'premium') {
        return feature.premiumAllowed;
      }
      return feature.freeAllowed && subscription.isActive;
    },
    [subscription]
  );

  const upgradeToPremium = useCallback(() => {
    setSubscription((prev) => ({
      ...prev,
      plan: 'premium',
      expiryDate: null,
    }));
  }, []);

  const getFeatures = useCallback(() => FEATURES, []);

  return {
    subscription,
    hasFeatureAccess,
    upgradeToPremium,
    getFeatures,
  };
};
