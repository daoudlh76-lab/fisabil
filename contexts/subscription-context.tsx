import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type SubscriptionPlan = 'free' | 'premium_monthly' | 'premium_annual';
export type FeatureName = 'dictation' | 'vocab' | 'tutor' | 'scanner' | 'unlimited_messages';

export interface Subscription {
  plan: SubscriptionPlan;
  startDate: Date;
  expiryDate: Date | null;
  isActive: boolean;
  daysRemaining: number;
}

export interface PlanInfo {
  key: SubscriptionPlan;
  labelKey: string;
  price: number;
  currency: string;
  period: 'month' | 'year' | null;
  features: FeatureName[];
}

export interface Feature {
  name: FeatureName;
  labelKey: string;
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
    freeAllowed: true,
    premiumAllowed: true,
    freeLimit: 1,
  },
  {
    name: 'unlimited_messages',
    labelKey: 'settings.unlimitedMessages',
    freeAllowed: false,
    premiumAllowed: true,
  },
];

const PLANS: PlanInfo[] = [
  {
    key: 'free',
    labelKey: 'subscription.freePlan',
    price: 0,
    currency: '€',
    period: null,
    features: ['tutor', 'dictation', 'vocab', 'scanner'],
  },
  {
    key: 'premium_monthly',
    labelKey: 'subscription.monthlyPlan',
    price: 9.99,
    currency: '€',
    period: 'month',
    features: ['tutor', 'dictation', 'vocab', 'scanner', 'unlimited_messages'],
  },
  {
    key: 'premium_annual',
    labelKey: 'subscription.annualPlan',
    price: 99.99,
    currency: '€',
    period: 'year',
    features: ['tutor', 'dictation', 'vocab', 'scanner', 'unlimited_messages'],
  },
];

interface SubscriptionContextValue {
  subscription: Subscription;
  hasFeatureAccess: (featureName: FeatureName) => boolean;
  upgradeToPlan: (plan: SubscriptionPlan) => void;
  getFeatures: () => Feature[];
  getPlans: () => PlanInfo[];
  getCurrentPlanInfo: () => PlanInfo | undefined;
  isLoaded: boolean;
}

const SubscriptionContext = createContext<SubscriptionContextValue | undefined>(undefined);

export const SubscriptionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [subscription, setSubscription] = useState<Subscription>({
    plan: 'free',
    startDate: new Date(),
    expiryDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    isActive: true,
    daysRemaining: 7,
  });
  const [isLoaded, setIsLoaded] = useState(false);

  // Charger la subscription depuis AsyncStorage au démarrage
  useEffect(() => {
    const loadSubscription = async () => {
      try {
        console.log('🔄 Chargement subscription depuis AsyncStorage...');
        const stored = await AsyncStorage.getItem('subscription');
        if (stored) {
          const parsed = JSON.parse(stored);
          console.log('📦 Subscription chargée:', parsed);
          // Convertir les dates en objets Date
          setSubscription({
            ...parsed,
            startDate: new Date(parsed.startDate),
            expiryDate: parsed.expiryDate ? new Date(parsed.expiryDate) : null,
          });
        } else {
          console.log('ℹ️ Aucune subscription stockée, utilisation des valeurs par défaut');
        }
      } catch (error) {
        console.error('❌ Erreur chargement subscription:', error);
      } finally {
        setIsLoaded(true);
        console.log('✅ Subscription chargée, isLoaded = true');
      }
    };
    loadSubscription();
  }, []);

  // Sauvegarder la subscription dans AsyncStorage à chaque changement
  useEffect(() => {
    if (isLoaded) {
      const saveSubscription = async () => {
        try {
          console.log('💾 Sauvegarde subscription dans AsyncStorage:', {
            plan: subscription.plan,
            isActive: subscription.isActive,
            daysRemaining: subscription.daysRemaining,
          });
          await AsyncStorage.setItem('subscription', JSON.stringify(subscription));
          console.log('✅ Subscription sauvegardée');
        } catch (error) {
          console.error('❌ Erreur sauvegarde subscription:', error);
        }
      };
      saveSubscription();
    }
  }, [subscription, isLoaded]);

  // Calculer les jours restants
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

      if (subscription.plan === 'premium_monthly' || subscription.plan === 'premium_annual') {
        return feature.premiumAllowed;
      }
      return feature.freeAllowed && subscription.isActive;
    },
    [subscription]
  );

  const upgradeToPlan = useCallback((plan: SubscriptionPlan) => {
    console.log('🚀 upgradeToPlan called with:', plan);
    const now = new Date();
    let expiryDate: Date | null = null;

    if (plan === 'premium_monthly') {
      expiryDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    } else if (plan === 'premium_annual') {
      expiryDate = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
    }

    const newSubscription = {
      plan,
      startDate: now,
      expiryDate,
      isActive: true,
      daysRemaining: plan === 'premium_monthly' ? 30 : plan === 'premium_annual' ? 365 : 7,
    };

    console.log('💾 Setting new subscription:', newSubscription);
    setSubscription((prev) => ({
      ...prev,
      ...newSubscription,
    }));
  }, []);

  const getFeatures = useCallback(() => FEATURES, []);

  const getPlans = useCallback(() => PLANS, []);

  const getCurrentPlanInfo = useCallback((): PlanInfo | undefined => {
    return PLANS.find(p => p.key === subscription.plan);
  }, [subscription.plan]);

  const value: SubscriptionContextValue = {
    subscription,
    hasFeatureAccess,
    upgradeToPlan,
    getFeatures,
    getPlans,
    getCurrentPlanInfo,
    isLoaded,
  };

  return (
    <SubscriptionContext.Provider value={value}>
      {children}
    </SubscriptionContext.Provider>
  );
};

export const useSubscription = (): SubscriptionContextValue => {
  const context = useContext(SubscriptionContext);
  if (context === undefined) {
    throw new Error('useSubscription must be used within a SubscriptionProvider');
  }
  return context;
};
