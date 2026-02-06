import { useAudioPlaylistContext } from '@/contexts/audio-playlist-context';
import { useLanguage } from '@/hooks/use-language';
import { supabase } from '@/src/lib/supabase';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
    Alert,
    Modal,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';

const GREEN = '#2E7D32';

type Folder = {
  id: string;
  name: string;
  color: string;
  icon: string;
};

export default function PlaylistScreen() {
  const { t } = useLanguage();
  const router = useRouter();
  const {
    playlist,
    addTrack,
    removeTrack,
    selectTrack,
    togglePlayPause,
    stopPlayback,
    nextTrack,
    previousTrack,
    toggleLooping,
    formatTime,
    loadPlaylist,
    updateTrackFolder,
  } = useAudioPlaylistContext();

  const [newTrackModalVisible, setNewTrackModalVisible] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newText, setNewText] = useState('');
  const [newTrackFolder, setNewTrackFolder] = useState<string | null>(null);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [query, setQuery] = useState('');

  // Modal pour déplacer une piste vers un dossier
  const [moveFolderModalVisible, setMoveFolderModalVisible] = useState(false);
  const [trackToMove, setTrackToMove] = useState<string | null>(null);
  const [targetFolderId, setTargetFolderId] = useState<string | null>(null);

  // Modal pour créer un nouveau dossier
  const [showNewFolderModal, setShowNewFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderIcon, setNewFolderIcon] = useState('📁');

  // Charger la playlist et les dossiers au montage
  useEffect(() => {
    loadPlaylist();
    loadFolders();
  }, [loadPlaylist]);

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

  const createFolder = useCallback(async () => {
    if (!newFolderName.trim()) {
      Alert.alert(t('library.error'), t('library.folderNameRequired'));
      return;
    }

    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user?.id;
    if (!userId) return;

    const { error } = await supabase
      .from("folders")
      .insert({
        user_id: userId,
        name: newFolderName.trim(),
        icon: newFolderIcon,
        color: '#E8F5E9',
      });

    if (error) {
      Alert.alert(t('library.error'), error.message);
      return;
    }

    setShowNewFolderModal(false);
    setNewFolderName('');
    setNewFolderIcon('📁');
    await loadFolders();
    Alert.alert('✅', t('library.folderCreated') || 'Dossier créé avec succès!');
  }, [newFolderName, newFolderIcon, t, loadFolders]);

  const deleteFolder = useCallback(async (folderId: string, folderName: string) => {
    Alert.alert(
      t('library.deleteFolder'),
      t('library.deleteFolderConfirm', { name: folderName }),
      [
        {
          text: t('common.cancel'),
          style: 'cancel',
        },
        {
          text: t('common.confirm'),
          style: 'destructive',
          onPress: async () => {
            const { data: sessionData } = await supabase.auth.getSession();
            const userId = sessionData.session?.user?.id;
            if (!userId) return;

            // Déplacer les pistes de ce dossier vers "non classées"
            const tracksInFolder = playlist.tracks.filter(t => t.folderId === folderId);
            for (const track of tracksInFolder) {
              await updateTrackFolder(track.id, null);
            }

            // Supprimer le dossier
            const { error } = await supabase
              .from('folders')
              .delete()
              .eq('id', folderId)
              .eq('user_id', userId);

            if (error) {
              Alert.alert(t('library.error'), error.message);
              return;
            }

            Alert.alert(t('library.success'), t('library.folderDeleted'));
            await loadFolders();
            await loadPlaylist();
          },
        },
      ]
    );
  }, [t, playlist.tracks, updateTrackFolder, loadFolders, loadPlaylist]);

  const currentTrack =
    playlist.tracks.length > 0
      ? playlist.tracks[playlist.currentTrackIndex]
      : null;

  const handleAddTrack = async () => {
    if (!newTitle.trim() || !newText.trim()) {
      Alert.alert(t('playlist.error'), t('playlist.fillTitleAndText'));
      return;
    }

    try {
      // Ajouter la piste sans fichier audio (on utilisera speakText pour la lecture)
      await addTrack(newTitle, newText, null, newTrackFolder);

      setNewTitle('');
      setNewText('');
      setNewTrackFolder(null);
      setNewTrackModalVisible(false);

      Alert.alert(t('playlist.success'), t('playlist.trackAdded'));
    } catch (error) {
      Alert.alert(t('playlist.error'), t('playlist.addError'));
      console.error(error);
    }
  };

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

        // Recharger la playlist pour s'assurer que l'affichage est à jour
        await loadPlaylist();

        Alert.alert('✅', t('libraryDetail.folderUpdated'));
      } catch (error) {
        console.error('Error moving track to folder:', error);
        Alert.alert(t('playlist.error'), t('playlist.addError'));
      }
    }
  };

  // Fonction pour sélectionner une piste et lancer la lecture
  const handleSelectTrack = (trackId: string) => {
    const trackIndex = playlist.tracks.findIndex((t) => t.id === trackId);
    if (trackIndex !== -1) {
      selectTrack(trackIndex);
    }
  };

  // Pistes non classées
  const unclassifiedTracks = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    const unclassified = playlist.tracks.filter((t) => !t.folderId);

    if (!q) return unclassified;

    return unclassified.filter((t) => {
      const title = (t.title ?? "").toLowerCase();
      const text = (t.text ?? "").toLowerCase();
      return title.includes(q) || text.includes(q);
    });
  }, [query, playlist.tracks]);

  // Compter les pistes par dossier
  const getFolderCount = useCallback((folderId: string) => {
    return playlist.tracks.filter((t) => t.folderId === folderId).length;
  }, [playlist.tracks]);

  // Obtenir les pistes d'un dossier
  const getFolderTracks = useCallback((folderId: string) => {
    const q = query.trim().toLowerCase();
    const folderTracks = playlist.tracks.filter((t) => t.folderId === folderId);

    if (!q) return folderTracks;

    return folderTracks.filter((t) => {
      const title = (t.title ?? "").toLowerCase();
      const text = (t.text ?? "").toLowerCase();
      return title.includes(q) || text.includes(q);
    });
  }, [query, playlist.tracks]);

  return (
    <View style={styles.container}>
      {/* HEADER */}
      <View style={styles.header}>
        <Text style={styles.title}>{t('playlist.title')}</Text>
        <Pressable
          style={styles.createFolderButton}
          onPress={() => setShowNewFolderModal(true)}
        >
          <MaterialCommunityIcons name="folder-plus" size={24} color={GREEN} />
        </Pressable>
      </View>

      {/* BARRE DE RECHERCHE */}
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder={t('library.search')}
        style={styles.search}
        autoCapitalize="none"
        autoCorrect={false}
      />

      <ScrollView
        style={styles.content}
        contentContainerStyle={currentTrack ? styles.contentWithPlayer : undefined}
        keyboardShouldPersistTaps="handled"
      >
        {/* Dossiers créés */}
        {folders.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('library.myFolders')}</Text>
            {folders.map((folder) => {
              const folderTracks = getFolderTracks(folder.id);
              if (query.trim() && folderTracks.length === 0) return null;

              return (
                <View key={folder.id} style={styles.folderCardContainer}>
                  <Pressable
                    style={styles.folderCard}
                    onPress={() => router.push(`/playlist/folder/${folder.id}`)}
                  >
                    <Text style={styles.folderIcon}>{folder.icon}</Text>
                    <Text style={styles.folderName}>{folder.name}</Text>
                    <Text style={styles.folderCount}>({getFolderCount(folder.id)})</Text>
                  </Pressable>
                  <Pressable
                    style={styles.deleteFolderButton}
                    onPress={() => deleteFolder(folder.id, folder.name)}
                  >
                    <Text style={styles.deleteFolderText}>🗑️</Text>
                  </Pressable>
                </View>
              );
            })}
          </View>
        )}

        {/* Pistes non classées */}
        {unclassifiedTracks.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('library.unclassified')}</Text>
            {unclassifiedTracks.map((track) => (
              <Pressable
                key={track.id}
                style={styles.trackItem}
                onPress={() => handleSelectTrack(track.id)}
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
            ))}
          </View>
        )}

        {/* Message si aucun résultat */}
        {unclassifiedTracks.length === 0 && folders.every(f => getFolderTracks(f.id).length === 0) && (
          <View style={styles.emptyState}>
            <MaterialCommunityIcons
              name="playlist-music"
              size={64}
              color="#ccc"
            />
            <Text style={styles.emptyStateText}>
              {query.trim() ? t('library.noResults') : t('playlist.noTracks')}
            </Text>
            <Text style={styles.emptyStateSubtext}>
              {t('playlist.createFromTexts')}
            </Text>
          </View>
        )}
      </ScrollView>

      {/* LECTEUR AUDIO (affiché uniquement si currentTrack existe) */}
      {currentTrack && (
        <View style={styles.playerCard}>
          <View style={styles.playerHeader}>
            <MaterialCommunityIcons
              name="music-circle"
              size={40}
              color={GREEN}
            />
            <View style={styles.playerInfo}>
              <Text style={styles.playerTitle}>{currentTrack.title}</Text>
              <Text style={styles.playerDuration}>
                {formatTime(playlist.currentPosition)} / {formatTime(currentTrack.duration)}
              </Text>
            </View>
            <Pressable onPress={() => selectTrack(0)}>
              <MaterialCommunityIcons name="close" size={24} color="#666" />
            </Pressable>
          </View>

          {/* BARRE DE PROGRESSION */}
          <View style={styles.progressContainer}>
            <View
              style={[
                styles.progressBar,
                {
                  width: currentTrack.duration > 0
                    ? `${(playlist.currentPosition / currentTrack.duration) * 100}%`
                    : '0%',
                },
              ]}
            />
          </View>

          {/* CONTRÔLES DE LECTURE */}
          <View style={styles.controls}>
            <Pressable
              style={styles.controlButton}
              onPress={previousTrack}
            >
              <MaterialCommunityIcons name="skip-previous" size={32} color={GREEN} />
            </Pressable>

            <Pressable
              style={styles.playButton}
              onPress={togglePlayPause}
            >
              <MaterialCommunityIcons
                name={playlist.isPlaying ? 'pause' : 'play'}
                size={32}
                color="white"
              />
            </Pressable>

            <Pressable
              style={styles.controlButton}
              onPress={stopPlayback}
            >
              <MaterialCommunityIcons name="stop" size={32} color={GREEN} />
            </Pressable>

            <Pressable
              style={styles.controlButton}
              onPress={nextTrack}
            >
              <MaterialCommunityIcons name="skip-next" size={32} color={GREEN} />
            </Pressable>

            <Pressable
              style={[
                styles.controlButton,
                playlist.isLooping && styles.controlButtonActive,
              ]}
              onPress={toggleLooping}
            >
              <MaterialCommunityIcons
                name="repeat"
                size={28}
                color={playlist.isLooping ? GREEN : '#999'}
              />
            </Pressable>
          </View>
        </View>
      )}

      {/* Modal d'ajout de piste */}
      <Modal
        visible={newTrackModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setNewTrackModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('playlist.newTrackModal')}</Text>
              <Pressable onPress={() => setNewTrackModalVisible(false)}>
                <MaterialCommunityIcons name="close" size={24} color="#333" />
              </Pressable>
            </View>

            <ScrollView style={styles.modalBody}>
              <Text style={styles.inputLabel}>{t('playlist.titleInput')}</Text>
              <TextInput
                style={styles.input}
                placeholder={t('playlist.titlePlaceholder')}
                value={newTitle}
                onChangeText={setNewTitle}
                placeholderTextColor="#ccc"
              />

              <Text style={styles.inputLabel}>{t('playlist.textToConvert')}</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder={t('playlist.textPlaceholder')}
                value={newText}
                onChangeText={setNewText}
                multiline
                numberOfLines={6}
                placeholderTextColor="#ccc"
                textAlignVertical="top"
              />

              <Text style={styles.inputLabel}>{t('library.folderName')} ({t('libraryDetail.optional')})</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.folderPickerScroll}
              >
                <TouchableOpacity
                  style={[
                    styles.folderPickerChip,
                    newTrackFolder === null && styles.folderPickerChipSelected
                  ]}
                  onPress={() => setNewTrackFolder(null)}
                >
                  <Text style={styles.folderPickerText}>{t('library.noFolder')}</Text>
                </TouchableOpacity>
                {folders.map((folder) => (
                  <TouchableOpacity
                    key={folder.id}
                    style={[
                      styles.folderPickerChip,
                      newTrackFolder === folder.id && styles.folderPickerChipSelected
                    ]}
                    onPress={() => setNewTrackFolder(folder.id)}
                  >
                    <Text style={styles.folderPickerIcon}>{folder.icon}</Text>
                    <Text style={styles.folderPickerText}>{folder.name}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <View style={styles.infoBox}>
                <MaterialCommunityIcons
                  name="information"
                  size={20}
                  color="#1976d2"
                />
                <Text style={styles.infoText}>
                  {t('playlist.convertInfo')}
                </Text>
              </View>
            </ScrollView>

            <View style={styles.modalFooter}>
              <Pressable
                style={styles.modalCancelButton}
                onPress={() => setNewTrackModalVisible(false)}
              >
                <Text style={styles.modalCancelText}>{t('playlist.cancel')}</Text>
              </Pressable>

              <Pressable
                style={styles.modalConfirmButton}
                onPress={handleAddTrack}
              >
                <MaterialCommunityIcons
                  name="music-note"
                  size={20}
                  color="white"
                />
                <Text style={styles.modalConfirmText}>
                  {t('playlist.createTrack')}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal pour créer un nouveau dossier */}
      <Modal
        visible={showNewFolderModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowNewFolderModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>📁 {t('library.createFolder')}</Text>
              <Pressable onPress={() => setShowNewFolderModal(false)}>
                <MaterialCommunityIcons name="close" size={24} color="#333" />
              </Pressable>
            </View>

            <View style={styles.modalBody}>
              <Text style={styles.inputLabel}>{t('library.folderName')}</Text>
              <TextInput
                style={styles.input}
                placeholder={t('library.folderNamePlaceholder')}
                value={newFolderName}
                onChangeText={setNewFolderName}
                placeholderTextColor="#ccc"
              />

              <Text style={styles.inputLabel}>{t('library.folderIcon')}</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.iconPickerScroll}
              >
                {['📁', '📚', '📖', '🕌', '📿', '☪️', '🤲', '📝', '✨', '💎'].map((icon) => (
                  <Pressable
                    key={icon}
                    style={[
                      styles.iconChip,
                      newFolderIcon === icon && styles.iconChipSelected
                    ]}
                    onPress={() => setNewFolderIcon(icon)}
                  >
                    <Text style={styles.iconText}>{icon}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>

            <View style={styles.modalFooter}>
              <Pressable
                style={styles.modalCancelButton}
                onPress={() => setShowNewFolderModal(false)}
              >
                <Text style={styles.modalCancelText}>{t('playlist.cancel')}</Text>
              </Pressable>

              <Pressable
                style={styles.modalConfirmButton}
                onPress={createFolder}
              >
                <MaterialCommunityIcons name="folder-plus" size={20} color="white" />
                <Text style={styles.modalConfirmText}>{t('library.createFolder')}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal pour déplacer une piste vers un dossier */}
      <Modal
        visible={moveFolderModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setMoveFolderModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>📁 {t('libraryDetail.folder')}</Text>
              <Pressable onPress={() => {
                setMoveFolderModalVisible(false);
                setTrackToMove(null);
                setTargetFolderId(null);
              }}>
                <MaterialCommunityIcons name="close" size={24} color="#333" />
              </Pressable>
            </View>

            <View style={styles.modalBody}>
              <Text style={styles.inputLabel}>{t('libraryDetail.selectFolder')}</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.modalFolderScroll}
              >
                <Pressable
                  style={[
                    styles.folderPickerChip,
                    targetFolderId === null && styles.folderPickerChipSelected
                  ]}
                  onPress={() => setTargetFolderId(null)}
                >
                  <Text style={styles.folderPickerText}>{t('library.noFolder')}</Text>
                </Pressable>
                {folders.map((folder) => (
                  <Pressable
                    key={folder.id}
                    style={[
                      styles.folderPickerChip,
                      targetFolderId === folder.id && styles.folderPickerChipSelected
                    ]}
                    onPress={() => setTargetFolderId(folder.id)}
                  >
                    <Text style={styles.folderPickerIcon}>{folder.icon}</Text>
                    <Text style={styles.folderPickerText}>{folder.name}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>

            <View style={styles.modalFooter}>
              <Pressable
                style={styles.modalCancelButton}
                onPress={() => {
                  setMoveFolderModalVisible(false);
                  setTrackToMove(null);
                  setTargetFolderId(null);
                }}
              >
                <Text style={styles.modalCancelText}>{t('playlist.cancel')}</Text>
              </Pressable>

              <Pressable
                style={styles.modalConfirmButton}
                onPress={handleMoveToFolder}
              >
                <MaterialCommunityIcons name="folder-check" size={20} color="white" />
                <Text style={styles.modalConfirmText}>{t('libraryDetail.updateFolder')}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  header: {
    backgroundColor: 'transparent',
    paddingVertical: 12,
    paddingHorizontal: 16,
    paddingTop: 40,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  createFolderButton: {
    padding: 8,
  },
  subtitle: {
    fontSize: 12,
    color: '#999',
    marginTop: 2,
  },
  content: {
    flex: 1,
    padding: 12,
  },
  contentWithPlayer: {
    paddingBottom: 180, // Espace pour le lecteur en bas
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyStateText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginTop: 16,
  },
  emptyStateSubtext: {
    fontSize: 14,
    color: '#999',
    marginTop: 8,
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
  playerInfo: {
    flex: 1,
    marginLeft: 12,
  },
  playerTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  playerDuration: {
    fontSize: 12,
    color: '#999',
    marginTop: 4,
  },
  progressContainer: {
    height: 4,
    backgroundColor: '#e0e0e0',
    borderRadius: 2,
    marginBottom: 16,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    backgroundColor: GREEN,
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
  controlButtonActive: {
    backgroundColor: '#c8e6c9',
  },
  tracksSection: {
    marginBottom: 20,
  },
  tracksTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#666',
    marginBottom: 10,
  },
  trackItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  trackItemActive: {
    backgroundColor: '#f1f8e9',
    borderLeftWidth: 4,
    borderLeftColor: GREEN,
  },
  trackNumber: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#e0e0e0',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  trackNumberText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  trackInfo: {
    flex: 1,
  },
  trackName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  trackText: {
    fontSize: 12,
    color: '#999',
    marginTop: 2,
  },
  trackDate: {
    fontSize: 11,
    color: '#bbb',
    marginTop: 2,
  },
  trackDelete: {
    padding: 8,
  },
  spacer: {
    height: 20,
  },
  addButton: {
    backgroundColor: GREEN,
    marginHorizontal: 16,
    marginVertical: 16,
    paddingVertical: 14,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  addButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    zIndex: 1000,
  },
  modalContent: {
    backgroundColor: 'white',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    marginTop: 'auto',
    maxHeight: '90%',
    paddingBottom: 20,
    paddingTop: 12,
    paddingHorizontal: 16,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  modalBody: {
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#333',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  infoBox: {
    flexDirection: 'row',
    backgroundColor: '#e3f2fd',
    borderRadius: 8,
    padding: 12,
    alignItems: 'flex-start',
    gap: 8,
  },
  infoText: {
    flex: 1,
    fontSize: 12,
    color: '#1976d2',
  },
  modalFooter: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  modalCancelButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#f5f5f5',
    alignItems: 'center',
  },
  modalCancelText: {
    color: '#333',
    fontSize: 14,
    fontWeight: '600',
  },
  modalConfirmButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: GREEN,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  modalConfirmText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  foldersScroll: {
    backgroundColor: 'transparent',
    paddingVertical: 8,
    paddingLeft: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  foldersContainer: {
    paddingRight: 16,
  },
  folderChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    marginRight: 6,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  folderChipSelected: {
    backgroundColor: '#E8F5E9',
    borderColor: GREEN,
  },
  folderIcon: {
    fontSize: 16,
    marginRight: 4,
  },
  folderName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
  },
  folderPickerScroll: {
    marginBottom: 16,
  },
  folderPickerChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  folderPickerChipSelected: {
    backgroundColor: '#E8F5E9',
    borderColor: GREEN,
  },
  folderPickerIcon: {
    fontSize: 16,
    marginRight: 6,
  },
  folderPickerText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
  },
  trackActions: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  trackActionButton: {
    padding: 8,
  },
  search: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginHorizontal: 16,
    marginBottom: 16,
    backgroundColor: '#F9FAFB',
  },
  section: {
    marginBottom: 24,
    paddingHorizontal: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
  },
  folderSection: {
    marginBottom: 16,
  },
  folderCardContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 8,
  },
  folderCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#C8E6C9',
  },
  folderHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    marginBottom: 8,
  },
  folderCount: {
    fontSize: 14,
    color: '#666',
    marginLeft: 8,
  },
  deleteFolderButton: {
    backgroundColor: '#FFEBEE',
    paddingHorizontal: 12,
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#FFCDD2',
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteFolderText: {
    fontSize: 20,
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
  folderText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
  },
  modalFolderScroll: {
    marginBottom: 16,
  },
  iconPickerScroll: {
    marginBottom: 16,
  },
  iconChip: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#F5F5F5',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  iconChipSelected: {
    backgroundColor: '#E8F5E9',
    borderColor: GREEN,
  },
  iconText: {
    fontSize: 24,
  },
});
