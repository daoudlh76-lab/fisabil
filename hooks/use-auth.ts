import { useEffect, useState } from 'react';
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
    const { data } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    return () => {
      data.subscription.unsubscribe();
    };
  }, []);

  // Protection des routes privées (désactivée pour laisser le layout gérer)
  // useEffect(() => {
  //   if (loading) return;
  //   const inLoginFlow = segments[0] === '(tabs)' && segments[1] === 'login';
  //   if (!session && !inLoginFlow) {
  //     router.replace('/(tabs)/login');
  //   } else if (session && inLoginFlow) {
  //     router.replace('/(tabs)');
  //   }
  // }, [session, loading, segments]);

  return {
    loading,
    session,
    isLoading: loading,
    isSignedIn: !!session,
  };
}
