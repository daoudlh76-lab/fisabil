import { createClient } from "@supabase/supabase-js";
import "react-native-url-polyfill/auto";

let AsyncStorage: any = null;

// Déterminer si on est en React Native (non-web)
const isReactNative = typeof navigator !== 'undefined' && navigator.product === 'ReactNative';

if (isReactNative) {
  try {
    AsyncStorage = require("@react-native-async-storage/async-storage").default;
  } catch (e) {
    console.warn("AsyncStorage not available");
    AsyncStorage = null;
  }
}

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || "";

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error("Missing Supabase configuration. Please set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in .env.local");
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage || undefined,
    persistSession: AsyncStorage ? true : false,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});