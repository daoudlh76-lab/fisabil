import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';

import { ErrorBoundary } from '@/components/ErrorBoundary';
import { AudioPlaylistProvider } from '@/contexts/audio-playlist-context';
import { SubscriptionProvider } from '@/contexts/subscription-context';
import { VoicePreferenceProvider } from '@/contexts/voice-preference-context';
import { useAuth } from '@/hooks/use-auth';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { LanguageProvider } from '@/hooks/use-language';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, ImageBackground, StyleSheet, View } from 'react-native';

// Empêcher le splash screen de se cacher automatiquement
SplashScreen.preventAutoHideAsync();

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const { isLoading } = useAuth();
  const [splashHidden, setSplashHidden] = useState(false);

  // Cacher le splash screen natif dès que le layout React est monté
  // pour laisser voir l'écran de chargement avec la mosquée
  useEffect(() => {
    SplashScreen.hideAsync().then(() => setSplashHidden(true));
  }, []);

  // Thème personnalisé avec fond transparent
  const customTheme = {
    ...(colorScheme === 'dark' ? DarkTheme : DefaultTheme),
    colors: {
      ...(colorScheme === 'dark' ? DarkTheme.colors : DefaultTheme.colors),
      background: 'transparent',
      card: 'rgba(255,255,255,0.95)',
    },
  };

  if (isLoading) {
    return (
      <ImageBackground
        source={require('@/assets/images/bg-mosque.png')}
        style={styles.background}
        resizeMode="cover"
      >
        <View style={styles.loadingContainer}>
          <Image
            source={require('@/assets/logo.png')}
            style={styles.loadingLogo}
            resizeMode="contain"
          />
          <ActivityIndicator size="large" color="#2E7D32" />
        </View>
      </ImageBackground>
    );
  }

  return (
    <ErrorBoundary>
    <ImageBackground
      source={require('@/assets/images/bg-mosque.png')}
      style={styles.background}
      resizeMode="cover"
    >
      <SubscriptionProvider>
        <VoicePreferenceProvider>
          <AudioPlaylistProvider>
            <LanguageProvider>
              <ThemeProvider value={customTheme}>
                <Stack screenOptions={{
                  contentStyle: { backgroundColor: 'transparent' },
                  animation: 'slide_from_right',
                }}>
                  <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                  <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
                </Stack>
                <StatusBar style="auto" />
              </ThemeProvider>
            </LanguageProvider>
          </AudioPlaylistProvider>
        </VoicePreferenceProvider>
      </SubscriptionProvider>
    </ImageBackground>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  background: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.7)',
  },
  loadingLogo: {
    width: 140,
    height: 140,
    marginBottom: 24,
  },
});
