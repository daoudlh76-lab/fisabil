import { useLanguage } from "@/hooks/use-language";
import { useAuth } from "@/hooks/use-auth";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { Tabs, Redirect } from "expo-router";
import React from "react";

export default function TabsLayout() {
  const { t, language, setLanguage } = useLanguage();
  const { session, loading } = useAuth();

  // Si pas de session, afficher seulement la page login
  if (!loading && !session) {
    return (
      <Tabs
        screenOptions={{
          headerShown: true,
          tabBarStyle: { display: 'none' },
        }}
      >
        <Tabs.Screen
          name="login"
          options={{
            title: t("nav.login"),
            headerShown: true,
          }}
        />
        {/* Cacher tous les autres onglets */}
        <Tabs.Screen name="index" options={{ href: null }} />
        <Tabs.Screen name="tutor/index" options={{ href: null }} />
        <Tabs.Screen name="library/index" options={{ href: null }} />
        <Tabs.Screen name="library/[id]" options={{ href: null }} />
        <Tabs.Screen name="revision/index" options={{ href: null }} />
        <Tabs.Screen name="revision/dictation" options={{ href: null }} />
        <Tabs.Screen name="revision/vocab" options={{ href: null }} />
        <Tabs.Screen name="playlist" options={{ href: null }} />
        <Tabs.Screen name="settings" options={{ href: null }} />
        <Tabs.Screen name="explore" options={{ href: null }} />
      </Tabs>
    );
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: true,
        tabBarActiveTintColor: "#2E7D32",
        // headerRight supprimé (bouton globe)
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
        }}
      />

      {/* Cacher les anciennes pages dictation et vocab (maintenant dans revision/index) */}
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
        }}
      />

      {/* Tuteur = tutor/index.tsx (avant-dernière position) */}
      <Tabs.Screen
        name="tutor/index"
        options={{
          title: t("nav.tutor"),
          tabBarIcon: ({ color }) => (
            <Ionicons name="chatbubbles" size={24} color={color} />
          ),
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
        }}
      />

      {/* Cacher login quand connecté */}
      <Tabs.Screen
        name="login"
        options={{
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