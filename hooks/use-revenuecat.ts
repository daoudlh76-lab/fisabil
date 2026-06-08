/**
 * useRevenueCat Hook
 *
 * Manages RevenueCat lifecycle, purchases, and Supabase sync.
 * This is the single source of truth for subscription state in the app.
 *
 * Flow:
 *  1. Init RevenueCat SDK on mount
 *  2. Login RC user when Supabase auth is available
 *  3. Fetch offerings (products/prices) from the store
 *  4. Handle purchase/restore and sync result to Supabase
 *  5. Listen for real-time changes (renewal, cancellation, etc.)
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';
import type { PurchasesPackage, PurchasesOfferings } from 'react-native-purchases';
import { supabase } from '@/src/lib/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  initRevenueCat,
  loginRevenueCat,
  logoutRevenueCat,
  getOfferings,
  purchasePackage,
  restorePurchases,
  getSubscriptionStatus,
  parseCustomerInfo,
  addCustomerInfoListener,
  type SubscriptionStatus,
  ENTITLEMENT_ID,
} from '@/src/lib/revenuecat';

// ─── Types ────────────────────────────────────────────────────────────────

export type SubscriptionPlan = 'free' | 'premium_monthly' | 'premium_annual';
export type FeatureName = 'dictation' | 'vocab' | 'tutor' | 'scanner' | 'unlimited_messages';

export interface Feature {
  name: FeatureName;
  labelKey: string;
  freeAllowed: boolean;
  premiumAllowed: boolean;
}

export interface RevenueCatState {
  /** Current subscription status */
  status: SubscriptionStatus;
  /** Available offerings/packages from RevenueCat */
  offerings: PurchasesOfferings | null;
  /** Monthly package (shortcut) */
  monthlyPackage: PurchasesPackage | null;
  /** Annual package (shortcut) */
  annualPackage: PurchasesPackage | null;
  /** Whether RevenueCat has been initialized */
  isReady: boolean;
  /** Whether a purchase/restore is in progress */
  isProcessing: boolean;
  /** Last error message */
  error: string | null;
}

// ─── Constants ────────────────────────────────────────────────────────────

const CACHE_KEY = '@fisabil_rc_status';

const FEATURES: Feature[] = [
  { name: 'tutor', labelKey: 'settings.aiTutor', freeAllowed: false, premiumAllowed: true },
  { name: 'dictation', labelKey: 'settings.dictations', freeAllowed: false, premiumAllowed: true },
  { name: 'vocab', labelKey: 'settings.vocabCards', freeAllowed: true, premiumAllowed: true },
  { name: 'scanner', labelKey: 'settings.scannerFeature', freeAllowed: false, premiumAllowed: true },
  { name: 'unlimited_messages', labelKey: 'settings.unlimitedMessages', freeAllowed: false, premiumAllowed: true },
];

// ─── Defaults ─────────────────────────────────────────────────────────────

const DEFAULT_STATUS: SubscriptionStatus = {
  isPremium: false,
  plan: 'free',
  expiresDate: null,
  isActive: false,
  willRenew: false,
  store: null,
  productId: null,
  originalPurchaseDate: null,
};

// ─── Hook ─────────────────────────────────────────────────────────────────

export function useRevenueCat() {
  const [state, setState] = useState<RevenueCatState>({
    status: DEFAULT_STATUS,
    offerings: null,
    monthlyPackage: null,
    annualPackage: null,
    isReady: false,
    isProcessing: false,
    error: null,
  });

  const initDone = useRef(false);

  // ═══ Cache helpers ═══
  const saveStatusToCache = useCallback(async (status: SubscriptionStatus) => {
    try {
      await AsyncStorage.setItem(CACHE_KEY, JSON.stringify({
        ...status,
        expiresDate: status.expiresDate?.toISOString() ?? null,
        originalPurchaseDate: status.originalPurchaseDate?.toISOString() ?? null,
      }));
    } catch (e) {
      if (__DEV__) console.error('💰 [RC Hook] Cache save error:', e);
    }
  }, []);

  const loadStatusFromCache = useCallback(async (): Promise<SubscriptionStatus | null> => {
    try {
      const cached = await AsyncStorage.getItem(CACHE_KEY);
      if (!cached) return null;
      const parsed = JSON.parse(cached);
      return {
        ...parsed,
        expiresDate: parsed.expiresDate ? new Date(parsed.expiresDate) : null,
        originalPurchaseDate: parsed.originalPurchaseDate ? new Date(parsed.originalPurchaseDate) : null,
      };
    } catch {
      return null;
    }
  }, []);

  // ═══ Sync to Supabase ═══
  const syncToSupabase = useCallback(async (status: SubscriptionStatus) => {
    try {
      const { data: session } = await supabase.auth.getSession();
      const userId = session.session?.user?.id;
      if (!userId) return;

      if (status.isPremium) {
        // Use the activate_store_subscription RPC for proper server-side activation
        // Function expects individual p_* parameters (NOT a payload object)
        if (__DEV__) {
          __DEV__ && console.log('💰 [RC Hook] Calling activate_store_subscription with:', {
            p_user_id: userId,
            p_plan: status.plan,
            p_store_provider: status.store ?? 'apple',
            p_product_id: status.productId ?? '',
            p_transaction_id: '',
            p_original_transaction_id: '',
            p_expires_date: status.expiresDate?.toISOString() ?? null,
            p_auto_renew: status.willRenew,
          });
        }

        const { error } = await supabase.rpc('activate_store_subscription', {
          p_user_id: userId,
          p_plan: status.plan,
          p_store_provider: status.store ?? 'apple',
          p_product_id: status.productId ?? '',
          p_transaction_id: '', // RC handles transaction IDs internally
          p_original_transaction_id: '', // RC handles transaction IDs internally
          p_expires_date: status.expiresDate?.toISOString() ?? null,
          p_environment: 'production',
          p_auto_renew: status.willRenew,
        });

        if (error) {
          if (__DEV__) console.error('💰 [RC Hook] Supabase sync error:', error.message);
          // Fallback: direct upsert if RPC fails (e.g. function doesn't exist yet)
          await supabase.from('subscriptions').upsert({
            user_id: userId,
            plan: status.plan,
            start_date: status.originalPurchaseDate?.toISOString() ?? new Date().toISOString(),
            expiry_date: status.expiresDate?.toISOString() ?? null,
            is_active: true,
            store_provider: status.store,
            store_product_id: status.productId,
            auto_renew: status.willRenew,
          }, { onConflict: 'user_id' });
        } else {
          if (__DEV__) console.log('💰 [RC Hook] ✅ Premium synced to Supabase');
        }
      }
    } catch (e) {
      if (__DEV__) console.error('💰 [RC Hook] syncToSupabase error:', e);
    }
  }, []);

  // ═══ Supabase fallback: vérifie is_active si RC ne confirme pas le premium ═══
  const checkSupabasePremium = useCallback(async (): Promise<SubscriptionStatus | null> => {
    try {
      const { data: session } = await supabase.auth.getSession();
      const userId = session.session?.user?.id;
      if (!userId) return null;

      const { data, error } = await supabase
        .from('subscriptions')
        .select('is_active, plan, expiry_date, auto_renew, store_provider, store_product_id, start_date')
        .eq('user_id', userId)
        .single();

      if (error || !data || !data.is_active) return null;

      // Vérifier que l'abonnement n'est pas expiré (null = permanent)
      if (data.expiry_date && new Date(data.expiry_date) <= new Date()) return null;

      if (__DEV__) console.log('💰 [RC Hook] 🔄 Supabase fallback: is_active=true, plan:', data.plan);

      return {
        isPremium: true,
        plan: (data.plan === 'premium_monthly' || data.plan === 'premium_annual') ? data.plan : 'premium_monthly',
        expiresDate: data.expiry_date ? new Date(data.expiry_date) : null,
        isActive: true,
        willRenew: data.auto_renew ?? false,
        store: data.store_provider ?? null,
        productId: data.store_product_id ?? null,
        originalPurchaseDate: data.start_date ? new Date(data.start_date) : null,
      };
    } catch (e) {
      if (__DEV__) console.warn('💰 [RC Hook] Supabase fallback error:', e);
      return null;
    }
  }, []);

  // ═══ RC en source principale, Supabase en fallback ═══
  const getStatusWithFallback = useCallback(async (): Promise<SubscriptionStatus> => {
    const rcStatus = await getSubscriptionStatus();
    if (rcStatus.isPremium) return rcStatus;

    const supabaseStatus = await checkSupabasePremium();
    if (supabaseStatus) {
      if (__DEV__) console.log('💰 [RC Hook] ✅ Premium confirmé via fallback Supabase');
      return supabaseStatus;
    }

    return rcStatus;
  }, [checkSupabasePremium]);

  // ═══ Initialize RevenueCat + load initial data ═══
  useEffect(() => {
    if (initDone.current) return;
    initDone.current = true;

    const init = async () => {
      try {
        // 1. Load cached status first (instant display for FREE users only)
        // Security: never trust cached isPremium before RC confirms
        const cached = await loadStatusFromCache();
        if (cached && !cached.isPremium) {
          setState(prev => ({ ...prev, status: cached }));
        }

        // 2. Initialize RevenueCat SDK
        const configured = await initRevenueCat();

        if (!configured) {
          setState(prev => ({
            ...prev,
            status: DEFAULT_STATUS,
            isReady: true,
          }));
          return;
        }

        // 3. Login with Supabase user ID
        const { data: session } = await supabase.auth.getSession();
        const userId = session.session?.user?.id;
        if (userId) {
          try {
            await loginRevenueCat(userId);
          } catch (e: any) {
            if (__DEV__) console.warn('💰 [RC Hook] Login error:', e?.message ?? e);
          }
        }

        // 4. Fetch offerings (products/prices)
        const offerings = await getOfferings();
        const monthly = offerings?.current?.availablePackages.find(
          (p: PurchasesPackage) => p.packageType === 'MONTHLY' || p.product.identifier.includes('monthly')
        ) ?? null;
        const annual = offerings?.current?.availablePackages.find(
          (p: PurchasesPackage) => p.packageType === 'ANNUAL' || p.product.identifier.includes('annual') || p.product.identifier.includes('yearly')
        ) ?? null;

        // 5. Get current subscription status (RC first, Supabase fallback)
        const status = await getStatusWithFallback();

        setState(prev => ({
          ...prev,
          status,
          offerings,
          monthlyPackage: monthly,
          annualPackage: annual,
          isReady: true,
        }));

        await saveStatusToCache(status);
        await syncToSupabase(status);

        if (__DEV__) console.log('💰 [RC Hook] ✅ Fully initialized, plan:', status.plan);
      } catch (error) {
        if (__DEV__) console.error('💰 [RC Hook] ❌ Init error:', error);
        setState(prev => ({
          ...prev,
          isReady: true,
          error: 'Failed to initialize purchases',
        }));
      }
    };

    init();
  }, [loadStatusFromCache, saveStatusToCache, syncToSupabase, getStatusWithFallback]);

  // ═══ Listen for real-time customer info updates ═══
  useEffect(() => {
    if (!state.isReady) return;

    const unsubscribe = addCustomerInfoListener(async (info) => {
      const rcStatus = parseCustomerInfo(info);
      let status = rcStatus;
      if (!rcStatus.isPremium) {
        const supabaseStatus = await checkSupabasePremium();
        if (supabaseStatus) {
          if (__DEV__) console.log('💰 [RC Hook] Temps-réel: RC gratuit, Supabase fallback confirme premium');
          status = supabaseStatus;
        }
      }
      if (__DEV__) console.log('💰 [RC Hook] Customer info updated:', status.plan);

      setState(prev => ({ ...prev, status }));
      await saveStatusToCache(status);
      await syncToSupabase(status);
    });

    return unsubscribe;
  }, [state.isReady, saveStatusToCache, syncToSupabase, checkSupabasePremium]);

  // ═══ Listen for auth changes (login/logout) ═══
  useEffect(() => {
    const { data: { subscription: authSub } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'SIGNED_IN' && session?.user?.id) {
          try {
            await loginRevenueCat(session.user.id);
            const status = await getStatusWithFallback();
            setState(prev => ({ ...prev, status }));
            await saveStatusToCache(status);
          } catch (e) {
            if (__DEV__) console.error('💰 [RC Hook] Auth change login error:', e);
          }
        } else if (event === 'SIGNED_OUT') {
          try {
            await logoutRevenueCat();
            setState(prev => ({ ...prev, status: DEFAULT_STATUS }));
            await AsyncStorage.removeItem(CACHE_KEY);
          } catch (e) {
            if (__DEV__) console.error('💰 [RC Hook] Auth change logout error:', e);
          }
        }
      }
    );

    return () => authSub.unsubscribe();
  }, [saveStatusToCache, getStatusWithFallback]);

  // ═══ Purchase a package ═══
  const purchase = useCallback(async (pkg: PurchasesPackage): Promise<boolean> => {
    setState(prev => ({ ...prev, isProcessing: true, error: null }));

    try {
      const { customerInfo } = await purchasePackage(pkg);
      const status = parseCustomerInfo(customerInfo);

      setState(prev => ({ ...prev, status, isProcessing: false }));
      await saveStatusToCache(status);
      await syncToSupabase(status);

      return status.isPremium;
    } catch (error: any) {
      const message = error.userCancelled ? null : (error.message || 'Purchase failed');
      setState(prev => ({
        ...prev,
        isProcessing: false,
        error: message,
      }));
      return false;
    }
  }, [saveStatusToCache, syncToSupabase]);

  // ═══ Restore purchases ═══
  const restore = useCallback(async (): Promise<boolean> => {
    setState(prev => ({ ...prev, isProcessing: true, error: null }));

    try {
      const customerInfo = await restorePurchases();
      const status = parseCustomerInfo(customerInfo);

      setState(prev => ({ ...prev, status, isProcessing: false }));
      await saveStatusToCache(status);
      await syncToSupabase(status);

      return status.isPremium;
    } catch (error: any) {
      setState(prev => ({
        ...prev,
        isProcessing: false,
        error: error.message || 'Restore failed',
      }));
      return false;
    }
  }, [saveStatusToCache, syncToSupabase]);

  // ═══ Refresh status ═══
  const refreshStatus = useCallback(async () => {
    try {
      const status = await getStatusWithFallback();
      setState(prev => ({ ...prev, status }));
      await saveStatusToCache(status);
      await syncToSupabase(status);
    } catch (e) {
      if (__DEV__) console.error('💰 [RC Hook] Refresh error:', e);
    }
  }, [saveStatusToCache, syncToSupabase, getStatusWithFallback]);

  // ═══ Feature access check ═══
  const hasFeatureAccess = useCallback(
    (featureName: FeatureName): boolean => {
      const feature = FEATURES.find((f) => f.name === featureName);
      if (!feature) return false;
      if (state.status.isPremium) return feature.premiumAllowed;
      return feature.freeAllowed;
    },
    [state.status.isPremium]
  );

  // ═══ Getters ═══
  const getFeaturesList = useCallback(() => FEATURES, []);

  // ═══ Trial eligibility (store intro offer) ═══
  const isTrialEligible = useMemo(() => {
    const monthly = state.monthlyPackage;
    const annual = state.annualPackage;
    return !!(
      (monthly?.product?.introPrice && monthly.product.introPrice.price === 0) ||
      (annual?.product?.introPrice && annual.product.introPrice.price === 0)
    );
  }, [state.monthlyPackage, state.annualPackage]);

  return {
    // State
    status: state.status,
    offerings: state.offerings,
    monthlyPackage: state.monthlyPackage,
    annualPackage: state.annualPackage,
    isReady: state.isReady,
    isProcessing: state.isProcessing,
    error: state.error,

    // Derived
    isPremium: state.status.isPremium,
    plan: state.status.plan,
    isTrialEligible,

    // Actions
    purchase,
    restore,
    refreshStatus,
    hasFeatureAccess,
    getFeatures: getFeaturesList,
  };
}
