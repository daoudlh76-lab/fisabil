import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { supabase } from "@/src/lib/supabase";
import { useLanguage } from "@/hooks/use-language";
import { useAudioPlaylistContext } from '@/contexts/audio-playlist-context';
import { useTextToSpeech } from '@/hooks/use-text-to-speech';
import { Colors } from "@/constants/colors";

const GREEN = '#2E7D32';

type Folder = {
  id: string;
  name: string;
  color: string;
  icon: string;
};

export default function PlaylistFolderDetailScreen() {
  const { t } = useLanguage();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const {
    playlist,
    removeTrack,
    updateTrackFolder,
    loadPlaylist,
  } = useAudioPlaylistContext();

  const { speakText, isSpeaking, stopSpeaking } = useTextToSpeech();

  const [folder, setFolder] = useState<Folder | null>(null);
  const [query, setQuery] = useState("");
  const [selectedTrackId, setSelectedTrackId] = useState<string | null>(null);
  const [moveFolderModalVisible, setMoveFolderModalVisible] = useState(false);
  const [trackToMove, setTrackToMove] = useState<string | null>(null);
  const [targetFolderId, setTargetFolderId] = useState<string | null>(null);
  const [folders, setFolders] = useState<Folder[]>([]);

  const loadFolder = useCallback(async () => {
    if (!id) return;

    const { data, error } = await supabase
      .from("folders")
      .select("id, name, color, icon")
      .eq("id", id)
      .single();

    if (error) {
      Alert.alert(t('library.error'), error.message);
      return;
    }

    setFolder(data as Folder);
  }, [id, t]);

  const loadFolders = useCallback(async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user?.id;
    if (!userId) return;

    const { data, error } = await supabase
      .from("folders")
      .select("id, name, color, icon")
      .eq("user_id", userId)
      .order("name", { ascending: true });

    if (!error && data) {
      setFolders(data as Folder[]);
    }
  }, []);

  useEffect(() => {
    loadFolder();
    loadFolders();
    loadPlaylist();
  }, [loadFolder, loadFolders, loadPlaylist]);

  const folderTracks = playlist.tracks.filter((t) => t.folderId === id);

  const filteredTracks = folderTracks.filter((track) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    const title = (track.title ?? "").toLowerCase();
    const text = (track.text ?? "").toLowerCase();
    return title.includes(q) || text.includes(q);
  });

  const openMoveFolderModal = (trackId: string, currentFolderId: string | null) => {
    setTrackToMove(trackId);
    setTargetFolderId(currentFolderId);
    setMoveFolderModalVisible(true);
  };

  const handleMoveToFolder = async () => {
    if (trackToMove) {
      try {
        updateTrackFolder(trackToMove, targetFolderId);
        setMoveFolderModalVisible(false);
        setTrackToMove(null);
        setTargetFolderId(null);
        await loadPlaylist();
        Alert.alert('✅', t('libraryDetail.folderUpdated'));
      } catch (error) {
        __DEV__ && console.error('Error moving track to folder:', error);
        Alert.alert(t('playlist.error'), t('playlist.addError'));
      }
    }
  };

  const handlePlayTrack = async (track: any) => {
    if (isSpeaking) {
      await stopSpeaking();
    }
    await speakText(track.text, 'ar-SA');
  };

  const selectedTrack = selectedTrackId
    ? playlist.tracks.find((t) => t.id === selectedTrackId)
    : null;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.push('/(tabs)/playlist')} style={styles.backBtn}>
          <Text style={styles.backText}>← {t('libraryDetail.back')}</Text>
        </Pressable>
      </View>

      {folder && (
        <View style={styles.folderInfo}>
          <Text style={styles.folderIcon}>{folder.icon}</Text>
          <Text style={styles.folderName}>{folder.name}</Text>
          <Text style={styles.folderCount}>({folderTracks.length})</Text>
        </View>
      )}

      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder={t('library.search')}
        style={styles.search}
        autoCapitalize="none"
        autoCorrect={false}
      />

      <ScrollView style={styles.content}>
        {filteredTracks.length > 0 ? (
          filteredTracks.map((track) => (
            <Pressable
              key={track.id}
              style={styles.trackItem}
              onPress={() => setSelectedTrackId(track.id)}
            >
              <View style={styles.trackInfo}>
                <Text style={styles.trackTitle}>{track.title}</Text>
                <Text numberOfLines={1} style={styles.trackPreview}>
                  {track.text}
                </Text>
              </View>
              <Pressable
                style={styles.trackMenu}
                onPress={() => openMoveFolderModal(track.id, track.folderId || null)}
              >
                <MaterialCommunityIcons name="folder-edit" size={20} color="#666" />
              </Pressable>
              <Pressable
                style={styles.trackDelete}
                onPress={() => removeTrack(track.id)}
              >
                <MaterialCommunityIcons name="delete" size={20} color="#d32f2f" />
              </Pressable>
            </Pressable>
          ))
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>
              {query.trim() ? t('library.noResults') : t('playlist.noTracks')}
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Audio player - affiché seulement si une piste est sélectionnée */}
      {selectedTrack && (
        <View style={styles.playerCard}>
          <View style={styles.playerHeader}>
            <Pressable
              style={styles.closePlayer}
              onPress={() => setSelectedTrackId(null)}
            >
              <MaterialCommunityIcons name="close" size={24} color="#666" />
            </Pressable>
            <View style={styles.playerInfo}>
              <Text style={styles.playerTitle}>{selectedTrack.title}</Text>
            </View>
          </View>

          <View style={styles.controls}>
            <Pressable
              style={styles.playButton}
              onPress={() => handlePlayTrack(selectedTrack)}
            >
              <MaterialCommunityIcons
                name={isSpeaking ? "pause" : "play"}
                size={32}
                color="white"
              />
            </Pressable>
            <Pressable
              style={styles.controlButton}
              onPress={stopSpeaking}
            >
              <MaterialCommunityIcons name="stop" size={24} color={GREEN} />
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: Colors.cream,
  },
  header: {
    marginBottom: 12,
  },
  backBtn: {
    paddingVertical: 8,
  },
  backText: {
    fontSize: 16,
    color: GREEN,
    fontWeight: "600",
  },
  folderInfo: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#E8F5E9",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 10,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#C8E6C9",
  },
  folderIcon: {
    fontSize: 28,
    marginRight: 12,
  },
  folderName: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#333",
    flex: 1,
  },
  folderCount: {
    fontSize: 16,
    color: "#666",
  },
  search: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginBottom: 16,
    backgroundColor: "#F9FAFB",
  },
  content: {
    flex: 1,
  },
  trackItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  trackInfo: {
    flex: 1,
  },
  trackTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  trackPreview: {
    fontSize: 13,
    color: '#666',
  },
  trackMenu: {
    padding: 8,
    marginLeft: 8,
  },
  trackDelete: {
    padding: 8,
  },
  emptyState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 16,
    color: "#999",
    textAlign: "center",
  },
  playerCard: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'white',
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 5,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  playerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  closePlayer: {
    padding: 4,
    marginRight: 8,
  },
  playerInfo: {
    flex: 1,
  },
  playerTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  controls: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  controlButton: {
    padding: 6,
  },
  playButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: GREEN,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
