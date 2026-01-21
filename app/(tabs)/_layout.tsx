import { useLanguage } from "@/hooks/use-language";
import { useAuth } from "@/hooks/use-auth";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { Tabs, useRouter, useSegments } from "expo-router";
import React, { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";

export default function TabsLayout() {
  const { t } = useLanguage();
  const { session, loading } = useAuth();
  const router = useRouter();
  const segments = useSegments();

  // Redirection basée sur l'état d'authentification
  useEffect(() => {
    if (loading) return;

    const currentRoute = segments[1]; // Le segment après "(tabs)"
    const isOnLoginPage = currentRoute === 'login';

    if (!session && !isOnLoginPage) {
      // Pas connecté et pas sur login -> rediriger vers login
      router.replace('/(tabs)/login');
    } else if (session && isOnLoginPage) {
      // Connecté mais sur login -> rediriger vers index
      router.replace('/(tabs)');
    }
  }, [session, loading, segments]);

  // Afficher un loader pendant la vérification de session
  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F7F8FA' }}>
        <ActivityIndicator size="large" color="#2E7D32" />
      </View>
    );
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: true,
        tabBarActiveTintColor: "#2E7D32",
        // Cacher la barre d'onglets si pas connecté
        tabBarStyle: session ? undefined : { display: 'none' },
      }}
    >
      {/* Scanner = index.tsx */}
      <Tabs.Screen
        name="index"
        options={{
          title: t("nav.scanner"),
          tabBarIcon: ({ color }) => (
            <Ionicons name="camera" size={24} color={color} />
          ),
          // Cacher cet onglet si pas connecté
          href: session ? '/(tabs)' : null,
        }}
      />

      {/* Bibliothèque = library/index.tsx */}
      <Tabs.Screen
        name="library/index"
        options={{
          title: t("nav.library"),
          tabBarIcon: ({ color }) => (
            <Ionicons name="library" size={24} color={color} />
          ),
          href: session ? '/(tabs)/library' : null,
        }}
      />

      {/* Cacher la page de détail library */}
      <Tabs.Screen
        name="library/[id]"
        options={{
          href: null,
        }}
      />

      {/* Révision (Dictées + Vocabulaire) = revision/index.tsx */}
      <Tabs.Screen
        name="revision/index"
        options={{
          title: t("nav.revision") || "Révision",
          tabBarIcon: ({ color }) => (
            <Ionicons name="book" size={24} color={color} />
          ),
          href: session ? '/(tabs)/revision' : null,
        }}
      />

      {/* Cacher les anciennes pages dictation et vocab */}
      <Tabs.Screen
        name="revision/dictation"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="revision/vocab"
        options={{
          href: null,
        }}
      />

      {/* Playlist Audio = playlist.tsx */}
      <Tabs.Screen
        name="playlist"
        options={{
          title: t("nav.playlist") || "Playlist",
          tabBarIcon: ({ color }) => (
            <MaterialCommunityIcons name="playlist-music" size={24} color={color} />
          ),
          href: session ? '/(tabs)/playlist' : null,
        }}
      />

      {/* Tuteur = tutor/index.tsx */}
      <Tabs.Screen
        name="tutor/index"
        options={{
          title: t("nav.tutor"),
          tabBarIcon: ({ color }) => (
            <Ionicons name="chatbubbles" size={24} color={color} />
          ),
          href: session ? '/(tabs)/tutor' : null,
        }}
      />

      {/* Paramètres = settings.tsx */}
      <Tabs.Screen
        name="settings"
        options={{
          title: t("nav.settings") || "Paramètres",
          tabBarIcon: ({ color }) => (
            <MaterialCommunityIcons name="cog" size={24} color={color} />
          ),
          href: session ? '/(tabs)/settings' : null,
        }}
      />

      {/* Page login - visible uniquement si pas connecté */}
      <Tabs.Screen
        name="login"
        options={{
          title: t("nav.login") || "Connexion",
          headerShown: false,
          href: session ? null : '/(tabs)/login',
        }}
      />

      {/* Cacher explore.tsx */}
      <Tabs.Screen
        name="explore"
        options={{
          href: null,
        }}
      />
    </Tabs>
  );
}
