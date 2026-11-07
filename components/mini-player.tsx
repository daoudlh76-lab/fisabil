import { Colors } from "@/constants/colors";
import { useAudioPlaylistContext } from "@/contexts/audio-playlist-context";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { usePathname, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const TAB_BAR_BASE_HEIGHT = Platform.OS === "ios" ? 49 : 56;
const HIDDEN_KEY = "mini_player_hidden";
// Au-dessus de la barre de saisie du Tuteur (~118px) pour ne pas couvrir le bouton Envoyer
const SHOW_BUTTON_OFFSET = 132;

export function MiniPlayer() {
  const { playlist, togglePlayPause, nextTrack } = useAudioPlaylistContext();
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const [hidden, setHidden] = useState(false);
  const [isReady, setIsReady] = useState(false);

  // Choix masqué/affiché mémorisé sur le téléphone, chargé une fois au démarrage
  useEffect(() => {
    AsyncStorage.getItem(HIDDEN_KEY)
      .then((stored) => setHidden(stored === "true"))
      .catch(() => {})
      .finally(() => setIsReady(true));
  }, []);

  const updateHidden = (value: boolean) => {
    setHidden(value);
    AsyncStorage.setItem(HIDDEN_KEY, String(value)).catch(() => {});
  };

  const currentTrack = playlist.tracks[playlist.currentTrackIndex];

  if (!isReady || !currentTrack || pathname?.includes("playlist")) return null;

  // Lecteur masqué : petit bouton flottant pour le ré-afficher (la lecture continue)
  if (hidden) {
    return (
      <Pressable
        style={[styles.showButton, { bottom: insets.bottom + TAB_BAR_BASE_HEIGHT + SHOW_BUTTON_OFFSET }]}
        onPress={() => updateHidden(false)}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Afficher le lecteur"
      >
        <Ionicons name="musical-notes" size={22} color={Colors.accent} />
      </Pressable>
    );
  }

  const progress =
    currentTrack.duration > 0
      ? Math.min(playlist.currentPosition / currentTrack.duration, 1)
      : 0;

  return (
    <Pressable
      style={[styles.container, { bottom: insets.bottom + TAB_BAR_BASE_HEIGHT + 8 }]}
      onPress={() => router.push("/(tabs)/playlist")}
    >
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
      </View>
      <View style={styles.row}>
        <View style={styles.info}>
          <Text style={styles.title} numberOfLines={1}>
            {currentTrack.title}
          </Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {playlist.isPlaying ? "Lecture en cours" : "En pause"}
          </Text>
        </View>
        <Pressable style={styles.controlButton} onPress={togglePlayPause} hitSlop={10}>
          <Ionicons name={playlist.isPlaying ? "pause" : "play"} size={18} color={Colors.deep} />
        </Pressable>
        <Pressable style={styles.controlButton} onPress={nextTrack} hitSlop={10}>
          <Ionicons name="play-skip-forward" size={16} color={Colors.deep} />
        </Pressable>
        <Pressable
          style={styles.closeButton}
          onPress={() => updateHidden(true)}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Masquer le lecteur"
        >
          <Ionicons name="close" size={18} color={Colors.muted} />
        </Pressable>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    left: 12,
    right: 12,
    backgroundColor: Colors.cream,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 10,
    shadowColor: Colors.black,
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
    zIndex: 50,
  },
  progressTrack: {
    height: 3,
    backgroundColor: "rgba(13,35,24,0.12)",
    borderRadius: 2,
    marginBottom: 8,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: Colors.accent,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  info: { flex: 1 },
  title: { fontSize: 14, fontWeight: "700", color: Colors.deep },
  subtitle: { fontSize: 11, color: Colors.muted, marginTop: 1 },
  controlButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  closeButton: {
    width: 28,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  showButton: {
    position: "absolute",
    right: 16,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.deep,
    borderWidth: 1,
    borderColor: Colors.accent,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: Colors.black,
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
    zIndex: 50,
  },
});
