import { useState, useCallback, useRef } from 'react';
import { Audio } from 'expo-audio';
import { Alert } from 'react-native';

export interface AudioTrack {
  id: string;
  title: string;
  text: string;
  duration: number;
  createdAt: Date;
  uri: string | null;
}

export interface PlaylistState {
  tracks: AudioTrack[];
  currentTrackIndex: number;
  isPlaying: boolean;
  isLooping: boolean;
  currentPosition: number;
}

export const useAudioPlaylist = () => {
  const [playlist, setPlaylist] = useState<PlaylistState>({
    tracks: [],
    currentTrackIndex: 0,
    isPlaying: false,
    isLooping: false,
    currentPosition: 0,
  });

  const soundRef = useRef<Audio.Sound | null>(null);

  const addTrack = useCallback(
    async (title: string, text: string, audioUri: string | null) => {
      const newTrack: AudioTrack = {
        id: Date.now().toString(),
        title,
        text,
        duration: 0,
        createdAt: new Date(),
        uri: audioUri,
      };

      setPlaylist((prev) => ({
        ...prev,
        tracks: [...prev.tracks, newTrack],
      }));

      return newTrack;
    },
    []
  );

  const removeTrack = useCallback((trackId: string) => {
    setPlaylist((prev) => {
      const newTracks = prev.tracks.filter((t) => t.id !== trackId);
      let newIndex = prev.currentTrackIndex;

      if (newTracks.length === 0) {
        newIndex = 0;
      } else if (prev.currentTrackIndex >= newTracks.length) {
        newIndex = newTracks.length - 1;
      }

      return {
        ...prev,
        tracks: newTracks,
        currentTrackIndex: newIndex,
        isPlaying: newTracks.length === 0 ? false : prev.isPlaying,
      };
    });
  }, []);

  const selectTrack = useCallback((index: number) => {
    setPlaylist((prev) => ({
      ...prev,
      currentTrackIndex: index,
      currentPosition: 0,
    }));
  }, []);

  const togglePlayPause = useCallback(async () => {
    if (!playlist.tracks.length) return;

    try {
      if (playlist.isPlaying) {
        if (soundRef.current) {
          await soundRef.current.pauseAsync();
        }
        setPlaylist((prev) => ({ ...prev, isPlaying: false }));
      } else {
        const currentTrack = playlist.tracks[playlist.currentTrackIndex];

        if (!soundRef.current) {
          const { sound } = await Audio.Sound.createAsync(
            { uri: currentTrack.uri },
            { shouldPlay: true }
          );
          soundRef.current = sound;

          const status = await sound.getStatusAsync();
          if (status.isLoaded) {
            setPlaylist((prev) => ({
              ...prev,
              tracks: prev.tracks.map((t, i) =>
                i === prev.currentTrackIndex
                  ? { ...t, duration: status.durationMillis || 0 }
                  : t
              ),
            }));
          }

          sound.setOnPlaybackStatusUpdate((status) => {
            if (status.isLoaded) {
              setPlaylist((prev) => ({
                ...prev,
                currentPosition: status.positionMillis || 0,
              }));

              if (status.didJustFinish && !status.isLooping) {
                if (playlist.isLooping) {
                  sound.replayAsync();
                } else {
                  if (
                    playlist.currentTrackIndex <
                    playlist.tracks.length - 1
                  ) {
                    selectTrack(playlist.currentTrackIndex + 1);
                  } else {
                    setPlaylist((prev) => ({
                      ...prev,
                      isPlaying: false,
                    }));
                  }
                }
              }
            }
          });
        } else {
          await soundRef.current.playAsync();
        }

        setPlaylist((prev) => ({ ...prev, isPlaying: true }));
      }
    } catch (error) {
      console.error('Erreur lecture audio:', error);
    }
  }, [playlist.tracks, playlist.currentTrackIndex, playlist.isLooping, selectTrack]);

  const nextTrack = useCallback(async () => {
    if (playlist.currentTrackIndex < playlist.tracks.length - 1) {
      if (soundRef.current) {
        try {
          await soundRef.current.stopAsync();
          await soundRef.current.unloadAsync();
          soundRef.current = null;
        } catch (error) {
          console.error('Erreur nettoyage son:', error);
        }
      }
      selectTrack(playlist.currentTrackIndex + 1);
      setTimeout(() => {
        if (playlist.isPlaying) {
          togglePlayPause();
        }
      }, 100);
    }
  }, [
    playlist.currentTrackIndex,
    playlist.tracks.length,
    playlist.isPlaying,
    selectTrack,
    togglePlayPause,
  ]);

  const previousTrack = useCallback(async () => {
    if (playlist.currentTrackIndex > 0) {
      if (soundRef.current) {
        try {
          await soundRef.current.stopAsync();
          await soundRef.current.unloadAsync();
          soundRef.current = null;
        } catch (error) {
          console.error('Erreur nettoyage son:', error);
        }
      }
      selectTrack(playlist.currentTrackIndex - 1);
      setTimeout(() => {
        if (playlist.isPlaying) {
          togglePlayPause();
        }
      }, 100);
    }
  }, [
    playlist.currentTrackIndex,
    playlist.isPlaying,
    selectTrack,
    togglePlayPause,
  ]);

  const toggleLooping = useCallback(() => {
    setPlaylist((prev) => ({
      ...prev,
      isLooping: !prev.isLooping,
    }));
  }, []);

  const formatTime = useCallback((milliseconds: number): string => {
    if (!milliseconds || isNaN(milliseconds)) return '0:00';
    const totalSeconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }, []);

  return {
    playlist,
    addTrack,
    removeTrack,
    selectTrack,
    togglePlayPause,
    nextTrack,
    previousTrack,
    toggleLooping,
    formatTime,
  };
};
