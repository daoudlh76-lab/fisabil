import { useLanguage } from "@/hooks/use-language";
import { useAuth } from "@/hooks/use-auth";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import React from "react";
import { ActivityIndicator, View } from "react-native";

export default function TabsLayout() {
  const { t } = useLanguage();
  const { session, loading } = useAuth();

  // Afficher un loader pendant la vérification de session
  // La redirection est gérée par useAuth
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
        // Barre d'onglets opaque
        tabBarStyle: session ? {
          backgroundColor: '#FFFFFF',
          borderTopColor: 'rgba(0, 0, 0, 0.1)',
        } : { display: 'none' },
        // En-tête opaque
        headerStyle: {
          backgroundColor: '#FFFFFF',
        },
        headerTransparent: false,
        // Animation de transition entre les pages
        animation: 'shift',
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

      {/* Cacher le dossier library/folder */}
      <Tabs.Screen
        name="library/folder/[id]"
        options={{
          href: null,
        }}
      />

      {/* Révision (Dictées + Vocabulaire) = revision/index.tsx */}
      <Tabs.Screen
        name="revision/index"
        options={{
          title: t("nav.revision"),
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
          title: t("nav.playlist"),
          tabBarIcon: ({ color }) => (
            <MaterialCommunityIcons name="playlist-music" size={24} color={color} />
          ),
          href: session ? '/(tabs)/playlist' : null,
        }}
      />

      {/* Cacher le dossier playlist/folder */}
      <Tabs.Screen
        name="playlist/folder/[id]"
        options={{
          href: null,
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
          title: t("nav.settings"),
          tabBarIcon: ({ color }) => (
            <MaterialCommunityIcons name="cog" size={24} color={color} />
          ),
          href: session ? '/(tabs)/settings' : null,
        }}
      />

      {/* Sous-routes de Settings - cachées de la barre */}
      <Tabs.Screen
        name="settings/about"
        options={{
          title: t("settings.about"),
          href: null,
        }}
      />
      <Tabs.Screen
        name="settings/privacy"
        options={{
          title: t("settings.privacyPolicy"),
          href: null,
        }}
      />
      <Tabs.Screen
        name="settings/delete-account"
        options={{
          title: t("settings.deleteAccount"),
          href: null,
        }}
      />

      {/* Statistiques - cachée de la barre */}
      <Tabs.Screen
        name="statistics"
        options={{
          title: t("settings.statistics"),
          href: null,
        }}
      />

      {/* Abonnement - cachée de la barre */}
      <Tabs.Screen
        name="subscription"
        options={{
          title: t("settings.subscription"),
          href: null,
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
