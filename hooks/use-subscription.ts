/**
 * Hook d'abonnement synchronisé avec Supabase.
 *
 * Source de vérité : table `subscriptions` dans Supabase.
 * Cache local : AsyncStorage (pour l'affichage offline immédiat).
 *
 * Flux :
 *  1. Au mount → lire le cache local (affichage instantané)
 *  2. Dès que l'auth est prête → lire depuis Supabase (source de vérité)
 *  3. Toute mise à jour → écrire Supabase + cache local
 *  4. Si offline → utiliser le cache local en attendant
 */

import { supabase } from '@/src/lib/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useRef, useState } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────

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

// ─── Constants ────────────────────────────────────────────────────────────

const STORAGE_KEY = 'subscription';
const FREE_TRIAL_DAYS = 7;

const FEATURES: Feature[] = [
  { name: 'tutor', labelKey: 'settings.aiTutor', freeAllowed: true, premiumAllowed: true, freeLimit: 5 },
  { name: 'dictation', labelKey: 'settings.dictations', freeAllowed: true, premiumAllowed: true, freeLimit: 2 },
  { name: 'vocab', labelKey: 'settings.vocabCards', freeAllowed: true, premiumAllowed: true },
  { name: 'scanner', labelKey: 'settings.scannerFeature', freeAllowed: true, premiumAllowed: true, freeLimit: 1 },
  { name: 'unlimited_messages', labelKey: 'settings.unlimitedMessages', freeAllowed: false, premiumAllowed: true },
];

const PLANS: PlanInfo[] = [
  { key: 'free', labelKey: 'subscription.freePlan', price: 0, currency: '€', period: null, features: ['tutor', 'dictation', 'vocab', 'scanner'] },
  { key: 'premium_monthly', labelKey: 'subscription.monthlyPlan', price: 9.99, currency: '€', period: 'month', features: ['tutor', 'dictation', 'vocab', 'scanner', 'unlimited_messages'] },
  { key: 'premium_annual', labelKey: 'subscription.annualPlan', price: 99.99, currency: '€', period: 'year', features: ['tutor', 'dictation', 'vocab', 'scanner', 'unlimited_messages'] },
];

// ─── Helpers ──────────────────────────────────────────────────────────────

function computeDaysRemaining(expiryDate: Date | null): number {
  if (!expiryDate) return 0;
  return Math.max(0, Math.ceil((expiryDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
}

function makeDefaultSubscription(): Subscription {
  return {
    plan: 'free',
    startDate: new Date(),
    expiryDate: new Date(Date.now() + FREE_TRIAL_DAYS * 24 * 60 * 60 * 1000),
    isActive: true,
    daysRemaining: FREE_TRIAL_DAYS,
  };
}

/** Parse a Supabase row into a Subscription object */
function rowToSubscription(row: any): Subscription {
  const expiryDate = row.expiry_date ? new Date(row.expiry_date) : null;
  const daysRemaining = computeDaysRemaining(expiryDate);
  const isPremium = row.plan === 'premium_monthly' || row.plan === 'premium_annual';
  return {
    plan: row.plan as SubscriptionPlan,
    startDate: new Date(row.start_date),
    expiryDate,
    isActive: isPremium ? daysRemaining > 0 : row.is_active,
    daysRemaining,
  };
}

// ─── Hook ─────────────────────────────────────────────────────────────────

export const useSubscription = () => {
  const [subscription, setSubscription] = useState<Subscription>(makeDefaultSubscription());
  const [isLoaded, setIsLoaded] = useState(false);
  const isSyncing = useRef(false);

  // ═══ Save to local cache ═══
  const saveToLocal = useCallback(async (sub: Subscription) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({
        plan: sub.plan,
        startDate: sub.startDate.toISOString(),
        expiryDate: sub.expiryDate?.toISOString() ?? null,
        isActive: sub.isActive,
        daysRemaining: sub.daysRemaining,
      }));
    } catch (e) {
      console.error('[SUB] Error saving to local:', e);
    }
  }, []);

  // ═══ Step 1: Load from local cache (instant) ═══
  useEffect(() => {
    const loadLocal = async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          const expiryDate = parsed.expiryDate ? new Date(parsed.expiryDate) : null;
          const daysRemaining = computeDaysRemaining(expiryDate);
          const isPremium = parsed.plan === 'premium_monthly' || parsed.plan === 'premium_annual';
          setSubscription({
            plan: parsed.plan,
            startDate: new Date(parsed.startDate),
            expiryDate,
            isActive: isPremium ? daysRemaining > 0 : parsed.isActive,
            daysRemaining,
          });
        }
      } catch (e) {
        console.error('[SUB] Error loading local cache:', e);
      } finally {
        setIsLoaded(true);
      }
    };
    loadLocal();
  }, []);

  // ═══ Step 2: Sync from Supabase (source of truth) ═══
  useEffect(() => {
    if (!isLoaded) return;

    const syncFromCloud = async () => {
      try {
        const { data: session } = await supabase.auth.getSession();
        const userId = session.session?.user?.id;
        if (!userId) {
          console.log('[SUB] No user session, using local cache');
          return;
        }

        console.log('[SUB] Syncing subscription from Supabase...');
        const { data, error } = await supabase
          .from('subscriptions')
          .select('*')
          .eq('user_id', userId)
          .single();

        if (error && error.code === 'PGRST116') {
          // No row found → create default subscription in Supabase
          console.log('[SUB] No subscription found, creating default...');
          const defaultSub = makeDefaultSubscription();

          const { error: insertError } = await supabase
            .from('subscriptions')
            .insert({
              user_id: userId,
              plan: defaultSub.plan,
              start_date: defaultSub.startDate.toISOString(),
              expiry_date: defaultSub.expiryDate?.toISOString() ?? null,
              is_active: defaultSub.isActive,
            });

          if (insertError) {
            console.error('[SUB] Error creating subscription:', insertError.message);
          } else {
            console.log('[SUB] Default subscription created in Supabase');
            setSubscription(defaultSub);
            await saveToLocal(defaultSub);
          }
          return;
        }

        if (error) {
          console.error('[SUB] Supabase read error:', error.message);
          return; // Keep local cache
        }

        // Cloud data found → use it as source of truth
        const cloudSub = rowToSubscription(data);
        console.log('[SUB] Cloud subscription loaded:', cloudSub.plan, 'active:', cloudSub.isActive, 'days:', cloudSub.daysRemaining);
        setSubscription(cloudSub);
        await saveToLocal(cloudSub);
      } catch (e) {
        console.error('[SUB] Sync error (using local cache):', e);
      }
    };

    syncFromCloud();
  }, [isLoaded, saveToLocal]);

  // ═══ Save to Supabase + local ═══
  const saveToCloud = useCallback(async (newSub: Subscription) => {
    if (isSyncing.current) return;
    isSyncing.current = true;

    try {
      // Save locally first (instant UI update)
      setSubscription(newSub);
      await saveToLocal(newSub);

      // Then sync to cloud
      const { data: session } = await supabase.auth.getSession();
      const userId = session.session?.user?.id;
      if (!userId) {
        console.warn('[SUB] No user session, saved locally only');
        return;
      }

      const { error } = await supabase
        .from('subscriptions')
        .upsert({
          user_id: userId,
          plan: newSub.plan,
          start_date: newSub.startDate.toISOString(),
          expiry_date: newSub.expiryDate?.toISOString() ?? null,
          is_active: newSub.isActive,
        }, { onConflict: 'user_id' });

      if (error) {
        console.error('[SUB] Supabase write error:', error.message);
      } else {
        console.log('[SUB] ✅ Subscription synced to Supabase:', newSub.plan);
      }
    } catch (e) {
      console.error('[SUB] Cloud save error:', e);
    } finally {
      isSyncing.current = false;
    }
  }, [saveToLocal]);

  // ═══ Feature access check ═══
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

  // ═══ Upgrade to plan → writes to Supabase + local ═══
  const upgradeToPlan = useCallback((plan: SubscriptionPlan) => {
    console.log('🚀 upgradeToPlan called with:', plan);
    const now = new Date();
    let expiryDate: Date | null = null;
    let daysRemaining = FREE_TRIAL_DAYS;

    if (plan === 'premium_monthly') {
      expiryDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      daysRemaining = 30;
    } else if (plan === 'premium_annual') {
      expiryDate = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
      daysRemaining = 365;
    }

    const newSub: Subscription = {
      plan,
      startDate: now,
      expiryDate,
      isActive: true,
      daysRemaining,
    };

    console.log('💾 Saving subscription (cloud + local):', newSub);
    saveToCloud(newSub);
  }, [saveToCloud]);

  // ═══ Getters ═══
  const getFeatures = useCallback(() => FEATURES, []);
  const getPlans = useCallback(() => PLANS, []);
  const getCurrentPlanInfo = useCallback((): PlanInfo | undefined => {
    return PLANS.find(p => p.key === subscription.plan);
  }, [subscription.plan]);

  return {
    subscription,
    hasFeatureAccess,
    upgradeToPlan,
    getFeatures,
    getPlans,
    getCurrentPlanInfo,
    isLoaded,
  };
};
