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
        console.error('Auth check error:', error);
        setSession(null);
      } finally {
        setLoading(false);
      }
    };

    checkSession();

    // Écouter les changements d'auth
    const { data } = supabase.auth.onAuthStateChange((event, newSession) => {
      console.log('🔐 Auth state changed:', event, newSession ? 'has session' : 'no session');
      setSession(newSession);

      // Redirection immédiate lors du SIGNED_OUT
      if (event === 'SIGNED_OUT') {
        console.log('🔐 User signed out, redirecting to login...');
        router.replace('/(tabs)/login');
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

    console.log('🔐 Route check:', { session: !!session, currentRoute, isOnLoginPage });

    if (!session && !isOnLoginPage) {
      console.log('🔐 No session, redirecting to login...');
      router.replace('/(tabs)/login');
    } else if (session && isOnLoginPage) {
      console.log('🔐 Has session, redirecting to home...');
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
