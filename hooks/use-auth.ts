import { useEffect, useState, useCallback } from 'react';
import { useRouter, useSegments } from 'expo-router';
import { supabase } from '@/src/lib/supabase';
import type { Session } from '@supabase/supabase-js';

export function useAuth() {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    // Vérifier la session initiale
    const checkSession = async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;
        setSession(data?.session ?? null);
      } catch (error) {
        __DEV__ && console.error('Auth check error:', error);
        setSession(null);
      } finally {
        setLoading(false);
      }
    };

    checkSession();

    // Écouter les changements d'auth
    const { data } = supabase.auth.onAuthStateChange((event, newSession) => {
      __DEV__ && console.log('🔐 Auth state changed:', event, newSession ? 'has session' : 'no session');
      setSession(newSession);

      // Redirection immédiate lors du SIGNED_OUT
      if (event === 'SIGNED_OUT') {
        __DEV__ && console.log('🔐 User signed out, redirecting to login...');
        router.replace('/(auth)/login');
      }
    });

    return () => {
      data.subscription.unsubscribe();
    };
  }, [router]);

  // Protection des routes - rediriger si pas de session
  useEffect(() => {
    if (loading) return;

    const currentRoute = segments[1];
    const isOnLoginPage = currentRoute === 'login';
    const isOnEmailVerificationPage = currentRoute === 'email-verification';
    const isOnForgotPasswordPage = currentRoute === 'forgot-password';
    const isOnVerifyOtpPage = currentRoute === 'verify-otp';
    const isOnVerifyEmailPage = currentRoute === 'verify-email';
    const isOnResetPasswordPage = currentRoute === 'reset-password';

    __DEV__ && console.log('🔐 Route check:', {
      session: !!session,
      emailConfirmed: session?.user?.email_confirmed_at,
      currentRoute,
      isOnLoginPage,
      isOnEmailVerificationPage,
      isOnForgotPasswordPage,
      isOnVerifyOtpPage,
      isOnVerifyEmailPage,
      isOnResetPasswordPage
    });

    // Cas 1: Pas de session et pas sur login -> rediriger vers login
    // SAUF si on est dans le flux de réinitialisation de mot de passe (forgot-password, verify-otp, verify-email, reset-password)
    if (!session && !isOnLoginPage && !isOnEmailVerificationPage && !isOnForgotPasswordPage && !isOnVerifyOtpPage && !isOnVerifyEmailPage && !isOnResetPasswordPage) {
      __DEV__ && console.log('🔐 No session, redirecting to login...');
      router.replace('/(auth)/login');
    }
    // Cas 2: Session non vérifiée et pas sur page de vérification -> rediriger vers vérification
    else if (session && !session.user.email_confirmed_at && !isOnEmailVerificationPage && !isOnResetPasswordPage) {
      __DEV__ && console.log('🔐 Email not confirmed, redirecting to email verification...');
      router.replace('/(auth)/email-verification');
    }
    // Cas 3: Session vérifiée et sur login, vérification ou mot de passe oublié -> rediriger vers home
    else if (session && session.user.email_confirmed_at && (isOnLoginPage || isOnEmailVerificationPage || isOnForgotPasswordPage)) {
      __DEV__ && console.log('🔐 Email confirmed, redirecting to home...');
      router.replace('/(tabs)');
    }
  }, [session, loading, segments, router]);

  return {
    loading,
    session,
    isLoading: loading,
    isSignedIn: !!session,
  };
}
