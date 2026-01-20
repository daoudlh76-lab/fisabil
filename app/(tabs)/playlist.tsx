import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Pressable,
  Alert,
  Modal,
  TextInput,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAudioPlaylistContext } from '@/contexts/audio-playlist-context';
import { useTextToSpeech } from '@/hooks/use-text-to-speech';
import { useLanguage } from '@/hooks/use-language';

const GREEN = '#2E7D32';

export default function PlaylistScreen() {
  const { t } = useLanguage();
  const {
    playlist,
    addTrack,
    removeTrack,
    selectTrack,
    togglePlayPause,
    nextTrack,
    previousTrack,
    toggleLooping,
    formatTime,
    loadPlaylist,
  } = useAudioPlaylistContext();

  const { speakText, isSpeaking, stopSpeaking } = useTextToSpeech();

  const [newTrackModalVisible, setNewTrackModalVisible] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newText, setNewText] = useState('');

  // Charger la playlist au montage
  useEffect(() => {
    loadPlaylist();
  }, [loadPlaylist]);

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
      await addTrack(newTitle, newText, null);

      setNewTitle('');
      setNewText('');
      setNewTrackModalVisible(false);

      Alert.alert(t('playlist.success'), t('playlist.trackAdded'));
    } catch (error) {
      Alert.alert(t('playlist.error'), t('playlist.addError'));
      console.error(error);
    }
  };

  // Fonction pour lire le texte de la piste actuelle
  const handlePlayPause = async () => {
    if (!currentTrack) return;
    
    if (isSpeaking) {
      await stopSpeaking();
    } else {
      await speakText(currentTrack.text, 'ar-SA');
    }
  };

  return (
    <View style={styles.container}>
      {/* HEADER */}
      <View style={styles.header}>
        <Text style={styles.title}>{t('playlist.title')}</Text>
        <Text style={styles.subtitle}>
          {playlist.tracks.length} {t('playlist.tracks')}
        </Text>
      </View>

      {playlist.tracks.length === 0 ? (
        <View style={styles.emptyState}>
          <MaterialCommunityIcons
            name="playlist-music"
            size={64}
            color="#ccc"
          />
          <Text style={styles.emptyStateText}>{t('playlist.noTracks')}</Text>
          <Text style={styles.emptyStateSubtext}>
            {t('playlist.createFromTexts')}
          </Text>
        </View>
      ) : (
        <ScrollView style={styles.content}>
          {/* LECTEUR ACTUEL */}
          {currentTrack && (
            <View style={styles.playerCard}>
              <View style={styles.playerHeader}>
                <MaterialCommunityIcons
                  name="music-circle"
                  size={48}
                  color={GREEN}
                />
                <View style={styles.playerInfo}>
                  <Text style={styles.playerTitle}>{currentTrack.title}</Text>
                  <Text style={styles.playerDuration}>
                    {formatTime(playlist.currentPosition)} /{' '}
                    {formatTime(currentTrack.duration)}
                  </Text>
                </View>
              </View>

              {/* BARRE DE PROGRESSION */}
              <View style={styles.progressContainer}>
                <View
                  style={[
                    styles.progressBar,
                    {
                      width: `${
                        currentTrack.duration > 0
                          ? (playlist.currentPosition /
                              currentTrack.duration) *
                            100
                          : 0
                      }%`,
                    },
                  ]}
                />
              </View>

              {/* CONTRÔLES DE LECTURE */}
              <View style={styles.controls}>
                <Pressable
                  style={styles.controlButton}
                  onPress={previousTrack}
                  disabled={playlist.currentTrackIndex === 0}
                >
                  <MaterialCommunityIcons
                    name="skip-previous"
                    size={32}
                    color={
                      playlist.currentTrackIndex === 0 ? '#ccc' : GREEN
                    }
                  />
                </Pressable>

                <Pressable
                  style={styles.playButton}
                  onPress={handlePlayPause}
                >
                  <MaterialCommunityIcons
                    name={isSpeaking ? 'pause' : 'play'}
                    size={40}
                    color="white"
                  />
                </Pressable>

                <Pressable
                  style={styles.controlButton}
                  onPress={nextTrack}
                  disabled={
                    playlist.currentTrackIndex ===
                    playlist.tracks.length - 1
                  }
                >
                  <MaterialCommunityIcons
                    name="skip-next"
                    size={32}
                    color={
                      playlist.currentTrackIndex ===
                      playlist.tracks.length - 1
                        ? '#ccc'
                        : GREEN
                    }
                  />
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
                    size={32}
                    color={playlist.isLooping ? GREEN : '#666'}
                  />
                </Pressable>
              </View>
            </View>
          )}

          {/* LISTE DES PISTES */}
          <View style={styles.tracksSection}>
            <Text style={styles.tracksTitle}>{t('playlist.tracksList')}</Text>

            {playlist.tracks.map((track, index) => (
              <Pressable
                key={track.id}
                style={[
                  styles.trackItem,
                  index === playlist.currentTrackIndex &&
                    styles.trackItemActive,
                ]}
                onPress={() => selectTrack(index)}
              >
                <View style={styles.trackNumber}>
                  {index === playlist.currentTrackIndex &&
                  playlist.isPlaying ? (
                    <MaterialCommunityIcons
                      name="music"
                      size={20}
                      color={GREEN}
                    />
                  ) : (
                    <Text style={styles.trackNumberText}>{index + 1}</Text>
                  )}
                </View>

                <View style={styles.trackInfo}>
                  <Text style={styles.trackName}>{track.title}</Text>
                  <Text style={styles.trackText} numberOfLines={1}>
                    {track.text}
                  </Text>
                  <Text style={styles.trackDate}>
                    {new Date(track.createdAt).toLocaleDateString()}
                  </Text>
                </View>

                <Pressable
                  style={styles.trackDelete}
                  onPress={() => {
                    Alert.alert(
                      t('playlist.delete'),
                      t('playlist.deleteConfirm'),
                      [
                        { text: t('playlist.cancel'), style: 'cancel' },
                        {
                          text: t('playlist.delete'),
                          style: 'destructive',
                          onPress: () => removeTrack(track.id),
                        },
                      ]
                    );
                  }}
                >
                  <MaterialCommunityIcons
                    name="trash-can-outline"
                    size={20}
                    color="#f44336"
                  />
                </Pressable>
              </Pressable>
            ))}
          </View>

          <View style={styles.spacer} />
        </ScrollView>
      )}

      {/* BOUTON AJOUTER */}
      <Pressable
        style={styles.addButton}
        onPress={() => setNewTrackModalVisible(true)}
      >
        <MaterialCommunityIcons name="plus" size={24} color="white" />
        <Text style={styles.addButtonText}>{t('playlist.newTrack')}</Text>
      </Pressable>

      {/* MODAL AJOUTER PISTE */}
      <Modal
        transparent
        visible={newTrackModalVisible}
        onRequestClose={() => setNewTrackModalVisible(false)}
        animationType="slide"
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    backgroundColor: GREEN,
    paddingVertical: 20,
    paddingHorizontal: 16,
    paddingTop: 40,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: 'white',
  },
  subtitle: {
    fontSize: 14,
    color: '#c8e6c9',
    marginTop: 4,
  },
  content: {
    flex: 1,
    padding: 16,
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
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  playerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
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
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  controlButton: {
    padding: 8,
  },
  playButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
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
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
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
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#e0e0e0',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
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
  },
  modalContent: {
    backgroundColor: 'white',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    marginTop: 'auto',
    maxHeight: '90%',
    paddingBottom: 20,
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
});
