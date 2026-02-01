import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth } from '@/hooks/use-auth';
import { LanguageProvider } from '@/hooks/use-language';
import { AudioPlaylistProvider } from '@/contexts/audio-playlist-context';
import { VoicePreferenceProvider } from '@/contexts/voice-preference-context';
import { SubscriptionProvider } from '@/contexts/subscription-context';
import { ActivityIndicator, View, ImageBackground, StyleSheet } from 'react-native';

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const { isLoading } = useAuth();

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
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.7)' }}>
          <ActivityIndicator size="large" />
        </View>
      </ImageBackground>
    );
  }

  return (
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
                <Stack screenOptions={{ contentStyle: { backgroundColor: 'transparent' } }}>
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
  );
}

const styles = StyleSheet.create({
  background: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
});
