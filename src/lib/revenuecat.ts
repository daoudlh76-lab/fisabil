/**
 * RevenueCat Service Layer
 *
 * Handles all interactions with RevenueCat SDK for in-app purchases.
 * Source of truth for entitlements — replaces custom receipt verification.
 *
 * Setup:
 *  1. Create a RevenueCat account at https://app.revenuecat.com
 *  2. Add your App Store / Play Store apps
 *  3. Create products & offerings in the RevenueCat dashboard
 *  4. Set EXPO_PUBLIC_REVENUECAT_API_KEY in .env (or platform-specific: EXPO_PUBLIC_REVENUECAT_APPLE_KEY / EXPO_PUBLIC_REVENUECAT_GOOGLE_KEY)
 */

import { Platform } from 'react-native';
import Purchases, {
  type CustomerInfo,
  type PurchasesOfferings,
  type PurchasesPackage,
  LOG_LEVEL,
  type PurchasesEntitlementInfo,
} from 'react-native-purchases';

// ─── Configuration ────────────────────────────────────────────────────────

// Clés par plateforme (prioritaires) ou clé générique (fallback)
const GENERIC_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_API_KEY ?? '';
const APPLE_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_APPLE_KEY || GENERIC_API_KEY;
const GOOGLE_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_GOOGLE_KEY || GENERIC_API_KEY;

/** RevenueCat entitlement identifier (must match dashboard — case-sensitive!) */
export const ENTITLEMENT_ID = 'Premium';

/** RevenueCat product identifiers (must match App Store Connect / Google Play Console) */
export const PRODUCT_IDS = {
  monthly: 'fisabil_premium_monthly',
  annual: 'fisabil_premium_annual',
} as const;

// ─── Types ────────────────────────────────────────────────────────────────

export interface SubscriptionStatus {
  isPremium: boolean;
  plan: 'free' | 'premium_monthly' | 'premium_annual';
  expiresDate: Date | null;
  isActive: boolean;
  willRenew: boolean;
  store: 'apple' | 'google' | 'stripe' | 'promotional' | null;
  productId: string | null;
  originalPurchaseDate: Date | null;
}

// ─── Initialization ──────────────────────────────────────────────────────

let isConfigured = false;

/**
 * Initialize RevenueCat SDK. Call once at app startup.
 * Must be called before any other RevenueCat function.
 * @returns true if SDK was configured successfully, false otherwise.
 */
export async function initRevenueCat(): Promise<boolean> {
  if (isConfigured) {
    if (__DEV__) console.log('💰 [RC] Already configured, skipping init');
    return true;
  }

  const apiKey = Platform.OS === 'ios' ? APPLE_API_KEY : GOOGLE_API_KEY;

  if (!apiKey) {
    __DEV__ && console.warn('⚠️ [RC] No API key found for platform:', Platform.OS,
      '\n  → Set EXPO_PUBLIC_REVENUECAT_API_KEY (or EXPO_PUBLIC_REVENUECAT_APPLE_KEY / EXPO_PUBLIC_REVENUECAT_GOOGLE_KEY) in .env');
    return false;
  }

  try {
    if (__DEV__) {
      __DEV__ && console.log('💰 [RC] Configuring with key:', apiKey.substring(0, 8) + '...', 'platform:', Platform.OS);
    }

    // CRITICAL: Check if native module is available BEFORE calling configure
    // In Expo Go or preview mode, native modules are not available
    // Use try-catch because even accessing Purchases.configure can throw in some environments
    let canConfigure = false;
    try {
      canConfigure = Purchases && typeof Purchases.configure === 'function';
    } catch (e) {
      canConfigure = false;
    }

    if (!canConfigure) {
      if (__DEV__) {
        __DEV__ && console.warn('💰 [RC] ⚠️ Native module not available (Expo Go or preview mode)');
        __DEV__ && console.warn('💰 [RC] → To use RevenueCat, create a development build: npx expo run:ios');
      }
      return false;
    }

    // CRITICAL: configure() must be called BEFORE any other Purchases method
    Purchases.configure({ apiKey });
    isConfigured = true;

    // Now it's safe to set log level AFTER configuration
    if (__DEV__ && Purchases.setLogLevel) {
      try {
        Purchases.setLogLevel(LOG_LEVEL.DEBUG);
      } catch (e) {
        // Ignore setLogLevel errors (may not be available in all environments)
        if (__DEV__) console.warn('💰 [RC] Could not set log level:', e);
      }
    }

    if (__DEV__) console.log('💰 [RC] ✅ Successfully configured for', Platform.OS);
    return true;
  } catch (error: any) {
    // Check if error is related to native module not being available
    const isNativeModuleError = error?.message?.includes('Native module') ||
                                 error?.message?.includes('RNPurchases') ||
                                 error?.message?.includes('not found');

    if (isNativeModuleError) {
      if (__DEV__) {
        __DEV__ && console.warn('💰 [RC] ⚠️ Native module not available (Expo Go or preview mode)');
        __DEV__ && console.warn('💰 [RC] → To use RevenueCat, create a development build: npx expo run:ios');
      }
    } else {
      if (__DEV__) console.error('💰 [RC] ❌ Configuration error:', error);
    }
    return false;
  }
}

// ─── User Management ─────────────────────────────────────────────────────

/**
 * Login a user to RevenueCat (associates purchases with Supabase user ID).
 * Call after successful authentication.
 */
export async function loginRevenueCat(userId: string): Promise<CustomerInfo> {
  if (!isConfigured) {
    if (__DEV__) console.warn('💰 [RC] ⚠️ Cannot login: SDK not configured');
    throw new Error('RevenueCat not configured');
  }
  try {
    const { customerInfo } = await Purchases.logIn(userId);
    if (__DEV__) console.log('💰 [RC] ✅ Logged in user:', userId);
    return customerInfo;
  } catch (error) {
    if (__DEV__) console.error('💰 [RC] ❌ Login error:', error);
    throw error;
  }
}

/**
 * Logout from RevenueCat. Call when user signs out.
 * Creates a new anonymous user in RevenueCat.
 */
export async function logoutRevenueCat(): Promise<CustomerInfo> {
  if (!isConfigured) {
    if (__DEV__) console.warn('💰 [RC] ⚠️ Cannot logout: SDK not configured');
    throw new Error('RevenueCat not configured');
  }
  try {
    const customerInfo = await Purchases.logOut();
    if (__DEV__) console.log('💰 [RC] ✅ Logged out');
    return customerInfo;
  } catch (error) {
    if (__DEV__) console.error('💰 [RC] ❌ Logout error:', error);
    throw error;
  }
}

// ─── Offerings & Products ────────────────────────────────────────────────

/**
 * Fetch available offerings (products/prices) from RevenueCat.
 * Returns configured offerings from the RevenueCat dashboard.
 */
export async function getOfferings(): Promise<PurchasesOfferings | null> {
  if (!isConfigured) {
    if (__DEV__) console.warn('💰 [RC] ⚠️ Cannot get offerings: SDK not configured');
    return null;
  }
  try {
    const offerings = await Purchases.getOfferings();

    if (__DEV__) {
      __DEV__ && console.log('💰 [RC] Offerings fetched:', {
        hasCurrentOffering: !!offerings.current,
        packagesCount: offerings.current?.availablePackages.length ?? 0,
      });
    }

    return offerings;
  } catch (error) {
    if (__DEV__) console.error('💰 [RC] ❌ Error fetching offerings:', error);
    return null;
  }
}

// ─── Purchases ───────────────────────────────────────────────────────────

/**
 * Purchase a specific package from an offering.
 * Handles the full store purchase flow (payment sheet, validation, etc.).
 */
export async function purchasePackage(
  pkg: PurchasesPackage
): Promise<{ customerInfo: CustomerInfo; productId: string }> {
  if (!isConfigured) {
    throw new Error('RevenueCat not configured');
  }
  try {
    if (__DEV__) console.log('💰 [RC] Purchasing package:', pkg.identifier);

    const { customerInfo } = await Purchases.purchasePackage(pkg);

    if (__DEV__) console.log('💰 [RC] ✅ Purchase successful');

    return {
      customerInfo,
      productId: pkg.product.identifier,
    };
  } catch (error: any) {
    // User cancelled — not an error
    if (error.userCancelled) {
      if (__DEV__) console.log('💰 [RC] Purchase cancelled by user');
      throw { userCancelled: true, message: 'Purchase cancelled' };
    }
    if (__DEV__) console.error('💰 [RC] ❌ Purchase error:', error);
    throw error;
  }
}

/**
 * Restore previous purchases (e.g., after reinstall or new device).
 * Queries the store for existing entitlements.
 */
export async function restorePurchases(): Promise<CustomerInfo> {
  if (!isConfigured) {
    throw new Error('RevenueCat not configured');
  }
  try {
    if (__DEV__) console.log('💰 [RC] Restoring purchases...');
    const customerInfo = await Purchases.restorePurchases();
    if (__DEV__) console.log('💰 [RC] ✅ Purchases restored');
    return customerInfo;
  } catch (error) {
    if (__DEV__) console.error('💰 [RC] ❌ Restore error:', error);
    throw error;
  }
}

// ─── Subscription Status ─────────────────────────────────────────────────

/**
 * Get current subscription status from RevenueCat.
 */
export async function getSubscriptionStatus(): Promise<SubscriptionStatus> {
  if (!isConfigured) {
    if (__DEV__) console.warn('💰 [RC] ⚠️ Cannot get status: SDK not configured');
    return {
      isPremium: false,
      plan: 'free',
      expiresDate: null,
      isActive: false,
      willRenew: false,
      store: null,
      productId: null,
      originalPurchaseDate: null,
    };
  }
  try {
    const customerInfo = await Purchases.getCustomerInfo();
    return parseCustomerInfo(customerInfo);
  } catch (error) {
    if (__DEV__) console.error('💰 [RC] ❌ Error getting status:', error);
    return {
      isPremium: false,
      plan: 'free',
      expiresDate: null,
      isActive: false,
      willRenew: false,
      store: null,
      productId: null,
      originalPurchaseDate: null,
    };
  }
}

/**
 * Parse RevenueCat CustomerInfo into our SubscriptionStatus.
 */
export function parseCustomerInfo(info: CustomerInfo): SubscriptionStatus {
  if (__DEV__) {
    __DEV__ && console.log('💰 [RC] parseCustomerInfo debug:', JSON.stringify({
      activeEntitlements: Object.keys(info.entitlements.active),
      allEntitlements: Object.keys(info.entitlements.all),
      activeSubscriptions: info.activeSubscriptions,
      lookingFor: ENTITLEMENT_ID,
    }, null, 2));
  }

  const entitlement = info.entitlements.active[ENTITLEMENT_ID];

  if (!entitlement) {
    return {
      isPremium: false,
      plan: 'free',
      expiresDate: null,
      isActive: false,
      willRenew: false,
      store: null,
      productId: null,
      originalPurchaseDate: null,
    };
  }

  // Determine plan based on product ID
  const productId = entitlement.productIdentifier;
  let plan: 'premium_monthly' | 'premium_annual' = 'premium_monthly';
  if (productId.includes('annual') || productId.includes('yearly')) {
    plan = 'premium_annual';
  }

  // Map store name
  const storeMap: Record<string, 'apple' | 'google' | 'stripe' | 'promotional'> = {
    APP_STORE: 'apple',
    PLAY_STORE: 'google',
    STRIPE: 'stripe',
    PROMOTIONAL: 'promotional',
  };

  return {
    isPremium: true,
    plan,
    expiresDate: entitlement.expirationDate ? new Date(entitlement.expirationDate) : null,
    isActive: entitlement.isActive,
    willRenew: !entitlement.willRenew ? false : entitlement.willRenew,
    store: storeMap[entitlement.store] ?? null,
    productId,
    originalPurchaseDate: entitlement.originalPurchaseDate
      ? new Date(entitlement.originalPurchaseDate)
      : null,
  };
}

// ─── Listeners ───────────────────────────────────────────────────────────

/**
 * Listen for real-time changes in customer info (e.g., subscription renewal, cancellation).
 * Returns an unsubscribe function.
 */
export function addCustomerInfoListener(
  callback: (info: CustomerInfo) => void
): () => void {
  if (!isConfigured) {
    if (__DEV__) console.warn('💰 [RC] ⚠️ Cannot add listener: SDK not configured');
    return () => {}; // no-op unsubscribe
  }
  Purchases.addCustomerInfoUpdateListener(callback);
  if (__DEV__) console.log('💰 [RC] Customer info listener added');
  return () => {
    Purchases.removeCustomerInfoUpdateListener(callback);
    if (__DEV__) console.log('💰 [RC] Customer info listener removed');
  };
}
