/**
 * Subscription Context — powered by RevenueCat
 *
 * Wraps useRevenueCat hook and exposes a backward-compatible API
 * so existing screens (settings, scanner, tutor, etc.) keep working.
 *
 * Source of truth: RevenueCat SDK → synced to Supabase.
 */

import React, { createContext, useCallback, useContext } from 'react';
import type { PurchasesPackage, PurchasesOfferings } from 'react-native-purchases';
import { useRevenueCat, type FeatureName, type Feature } from '@/hooks/use-revenuecat';

// ─── Re-export types for backward compatibility ──────────────────────────

export type SubscriptionPlan = 'free' | 'premium_monthly' | 'premium_annual';
export type { FeatureName, Feature };

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

// ─── Static plan definitions (used for UI display when RC offerings unavailable) ──

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

// ─── Context interface ───────────────────────────────────────────────────

interface SubscriptionContextValue {
  /** Backward-compatible subscription object */
  subscription: Subscription;
  /** Check if user has access to a feature */
  hasFeatureAccess: (featureName: FeatureName) => boolean;
  /** Get feature definitions */
  getFeatures: () => Feature[];
  /** Get static plan definitions */
  getPlans: () => PlanInfo[];
  /** Get current plan info */
  getCurrentPlanInfo: () => PlanInfo | undefined;
  /** Whether RevenueCat is ready */
  isLoaded: boolean;

  // ─── RevenueCat-specific ────────────────────────────────────────────
  /** Whether user has premium */
  isPremium: boolean;
  /** RevenueCat offerings */
  offerings: PurchasesOfferings | null;
  /** Monthly package shortcut */
  monthlyPackage: PurchasesPackage | null;
  /** Annual package shortcut */
  annualPackage: PurchasesPackage | null;
  /** Purchase a RevenueCat package */
  purchase: (pkg: PurchasesPackage) => Promise<boolean>;
  /** Restore previous purchases */
  restore: () => Promise<boolean>;
  /** Refresh subscription status */
  refreshStatus: () => Promise<void>;
  /** Whether a purchase/restore is in progress */
  isProcessing: boolean;
  /** Last error message */
  error: string | null;
}

const SubscriptionContext = createContext<SubscriptionContextValue | undefined>(undefined);

// ─── Helper ──────────────────────────────────────────────────────────────

function computeDaysRemaining(expiryDate: Date | null): number {
  if (!expiryDate) return 0;
  return Math.max(0, Math.ceil((expiryDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
}

// ─── Provider ────────────────────────────────────────────────────────────

export const SubscriptionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const rc = useRevenueCat();

  // Build backward-compatible Subscription object from RevenueCat status
  const subscription: Subscription = {
    plan: rc.status.plan,
    startDate: rc.status.originalPurchaseDate ?? new Date(),
    expiryDate: rc.status.expiresDate,
    isActive: rc.status.isPremium || rc.status.plan === 'free',
    daysRemaining: computeDaysRemaining(rc.status.expiresDate),
  };

  const getPlans = useCallback(() => PLANS, []);

  const getCurrentPlanInfo = useCallback((): PlanInfo | undefined => {
    return PLANS.find(p => p.key === rc.status.plan);
  }, [rc.status.plan]);

  const value: SubscriptionContextValue = {
    // Backward-compatible
    subscription,
    hasFeatureAccess: rc.hasFeatureAccess,
    getFeatures: rc.getFeatures,
    getPlans,
    getCurrentPlanInfo,
    isLoaded: rc.isReady,

    // RevenueCat-specific
    isPremium: rc.isPremium,
    offerings: rc.offerings,
    monthlyPackage: rc.monthlyPackage,
    annualPackage: rc.annualPackage,
    purchase: rc.purchase,
    restore: rc.restore,
    refreshStatus: rc.refreshStatus,
    isProcessing: rc.isProcessing,
    error: rc.error,
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
