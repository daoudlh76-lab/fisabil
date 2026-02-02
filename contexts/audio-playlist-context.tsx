import AsyncStorage from "@react-native-async-storage/async-storage";
import { Audio } from "expo-av";
import * as Speech from 'expo-speech';
import React, {
    createContext,
    ReactNode,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import { supabase } from "@/src/lib/supabase";
import { useVoicePreference } from '@/contexts/voice-preference-context';

export interface AudioTrack {
  id: string;
  title: string;
  text: string;
  duration: number;        // secondes
  createdAt: Date;
  uri: string | null;
  folderId?: string | null; // Dossier dans lequel est rangé l'audio
}

export interface PlaylistState {
  tracks: AudioTrack[];
  currentTrackIndex: number;
  isPlaying: boolean;
  isLooping: boolean;
  currentPosition: number; // secondes
}

interface AudioPlaylistContextType {
  playlist: PlaylistState;
  addTrack: (title: string, text: string, audioUri: string | null, folderId?: string | null) => Promise<AudioTrack>;
  removeTrack: (trackId: string) => void;
  selectTrack: (index: number) => void;
  togglePlayPause: () => Promise<void>;
  nextTrack: () => void;
  previousTrack: () => void;
  toggleLooping: () => void;
  formatTime: (seconds: number) => string;
  loadPlaylist: () => Promise<void>;
  updateTrackFolder: (trackId: string, folderId: string | null) => void;
}

const AudioPlaylistContext = createContext<AudioPlaylistContextType | undefined>(undefined);

// Fonction pour obtenir la clé de stockage spécifique à l'utilisateur
async function getStorageKey(): Promise<string> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id;
    return userId ? `@fisabil_playlist_${userId}` : "@fisabil_playlist_guest";
  } catch (error) {
    console.error("Erreur récupération user_id:", error);
    return "@fisabil_playlist_guest";
  }
}

export function AudioPlaylistProvider({ children }: { children: ReactNode }) {
  const { gender } = useVoicePreference();

  const [playlist, setPlaylist] = useState<PlaylistState>({
    tracks: [],
    currentTrackIndex: 0,
    isPlaying: false,
    isLooping: false,
    currentPosition: 0,
  });

  const soundRef = useRef<Audio.Sound | null>(null);
  const speechIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const savePlaylist = useCallback(async (tracks: AudioTrack[]) => {
    try {
      const storageKey = await getStorageKey();
      // Convertit Date -> string pour stocker
      const serializable = tracks.map((t) => ({
        ...t,
        createdAt: t.createdAt.toISOString(),
      }));
      await AsyncStorage.setItem(storageKey, JSON.stringify(serializable));
    } catch (error) {
      console.error("Erreur sauvegarde playlist:", error);
    }
  }, []);

  const loadPlaylist = useCallback(async () => {
    try {
      const storageKey = await getStorageKey();
      const stored = await AsyncStorage.getItem(storageKey);
      if (stored) {
        const raw = JSON.parse(stored) as any[];
        const tracks: AudioTrack[] = raw.map((t) => ({
          ...t,
          createdAt: new Date(t.createdAt),
        }));
        setPlaylist((prev) => ({ ...prev, tracks }));
      } else {
        // Aucune playlist pour cet utilisateur, vider la playlist
        setPlaylist((prev) => ({ ...prev, tracks: [] }));
      }
    } catch (error) {
      console.error("Erreur chargement playlist:", error);
    }
  }, []);

  // Recharger la playlist quand l'utilisateur change
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      // Quand l'utilisateur se connecte/déconnecte, recharger la playlist
      loadPlaylist();
    });

    // Charger la playlist au montage
    loadPlaylist();

    return () => {
      subscription.unsubscribe();
    };
  }, [loadPlaylist]);

  // Libère le son et arrête la synthèse vocale quand on quitte l'app / provider
  useEffect(() => {
    return () => {
      if (soundRef.current) {
        soundRef.current.unloadAsync().catch(() => {});
        soundRef.current = null;
      }
      if (speechIntervalRef.current) {
        clearInterval(speechIntervalRef.current);
        speechIntervalRef.current = null;
      }
      Speech.stop().catch(() => {});
    };
  }, []);

  const loadCurrentTrackIntoPlayer = useCallback(async () => {
    try {
      console.log('🔄 loadCurrentTrackIntoPlayer called');
      const track = playlist.tracks[playlist.currentTrackIndex];
      console.log('🎵 Loading track:', {
        title: track?.title,
        hasUri: !!track?.uri,
        uri: track?.uri?.substring(0, 50),
      });

      if (!track?.uri) {
        console.warn('⚠️ No track URI to load');
        return;
      }

      // Décharge l'ancien son
      if (soundRef.current) {
        console.log('🗑️ Unloading previous sound');
        await soundRef.current.unloadAsync();
        soundRef.current = null;
      }

      // Récupérer l'état actuel de isLooping
      const currentLooping = playlist.isLooping;

      console.log('📡 Creating audio with URI:', track.uri.substring(0, 80));
      const { sound, status } = await Audio.Sound.createAsync(
        { uri: track.uri },
        {
          shouldPlay: false,
          isLooping: currentLooping,
        }
      );
      console.log('✅ Audio created successfully');

      soundRef.current = sound;

      // Durée (ms -> sec)
      const durSec = status.isLoaded && status.durationMillis
        ? Math.floor(status.durationMillis / 1000)
        : 0;

      setPlaylist((prev) => ({
        ...prev,
        currentPosition: 0,
        isPlaying: false,
        tracks: prev.tracks.map((t, idx) =>
          idx === prev.currentTrackIndex ? { ...t, duration: durSec } : t
        ),
      }));

      // Suivre la position et détecter la fin de la piste
      sound.setOnPlaybackStatusUpdate((st) => {
        if (!st.isLoaded) return;
        const posSec = Math.floor((st.positionMillis ?? 0) / 1000);
        setPlaylist((prev) => ({ ...prev, currentPosition: posSec, isPlaying: st.isPlaying }));

        // Si la piste est terminée et qu'on ne boucle pas sur la même piste
        if (st.didJustFinish && !st.isLooping) {
          // Passer à la piste suivante automatiquement
          setPlaylist((prev) => {
            if (prev.tracks.length === 0) return prev;
            const nextIndex = prev.currentTrackIndex + 1;

            // Si on est à la dernière piste, revenir au début ou arrêter
            if (nextIndex >= prev.tracks.length) {
              return { ...prev, currentTrackIndex: 0, currentPosition: 0, isPlaying: false };
            }

            // Passer à la piste suivante
            return { ...prev, currentTrackIndex: nextIndex, currentPosition: 0, isPlaying: true };
          });
        }
      });
    } catch (error) {
      console.error('❌ Error in loadCurrentTrackIntoPlayer:', error);
      soundRef.current = null;
    }
  }, [playlist.tracks, playlist.currentTrackIndex, playlist.isLooping]);

  const addTrack = useCallback(
    async (title: string, text: string, audioUri: string | null, folderId?: string | null) => {
      const newTrack: AudioTrack = {
        id: Date.now().toString(),
        title,
        text,
        duration: 0,
        createdAt: new Date(),
        uri: audioUri,
        folderId: folderId || null,
      };

      console.log('🎵 addTrack appelé:', { id: newTrack.id, title, textLength: text.length, uri: audioUri });

      setPlaylist((prev) => {
        const newTracks = [...prev.tracks, newTrack];
        console.log('💾 Sauvegarde playlist avec', newTracks.length, 'pistes');
        savePlaylist(newTracks);
        return { ...prev, tracks: newTracks };
      });

      return newTrack;
    },
    [savePlaylist]
  );

  const removeTrack = useCallback(
    (trackId: string) => {
      setPlaylist((prev) => {
        const newTracks = prev.tracks.filter((t) => t.id !== trackId);

        let newIndex = prev.currentTrackIndex;
        if (newTracks.length === 0) newIndex = 0;
        else if (newIndex >= newTracks.length) newIndex = newTracks.length - 1;

        savePlaylist(newTracks);

        return {
          ...prev,
          tracks: newTracks,
          currentTrackIndex: newIndex,
          isPlaying: newTracks.length === 0 ? false : prev.isPlaying,
        };
      });
    },
    [savePlaylist]
  );

  const updateTrackFolder = useCallback(
    (trackId: string, folderId: string | null) => {
      setPlaylist((prev) => {
        const newTracks = prev.tracks.map((t) =>
          t.id === trackId ? { ...t, folderId } : t
        );
        savePlaylist(newTracks);
        return { ...prev, tracks: newTracks };
      });
    },
    [savePlaylist]
  );

  const selectTrack = useCallback((index: number) => {
    setPlaylist((prev) => ({
      ...prev,
      currentTrackIndex: index,
      currentPosition: 0,
      isPlaying: false,
    }));
  }, []);

  // Quand l'index change, on charge la nouvelle piste dans le player
  useEffect(() => {
    if (playlist.tracks.length === 0) return;

    loadCurrentTrackIntoPlayer().catch((e) => console.error("Load track error:", e));
  }, [playlist.currentTrackIndex, loadCurrentTrackIntoPlayer]);

  const togglePlayPause = useCallback(async () => {
    try {
      console.log('🎵 togglePlayPause called');
      console.log('📊 Playlist state:', {
        tracksCount: playlist.tracks.length,
        currentIndex: playlist.currentTrackIndex,
        isPlaying: playlist.isPlaying,
        hasSoundRef: !!soundRef.current,
      });

      if (!playlist.tracks.length) {
        console.warn('⚠️ No tracks in playlist');
        return;
      }

      const track = playlist.tracks[playlist.currentTrackIndex];
      console.log('🎵 Current track:', {
        title: track?.title,
        hasUri: !!track?.uri,
        hasText: !!track?.text,
      });

      if (!track) {
        console.warn('⚠️ No track found');
        return;
      }

      // CAS 1: Piste avec fichier audio (uri)
      if (track.uri) {
        // Si pas chargé, charge d'abord
        if (!soundRef.current) {
          console.log('🔄 Loading track into player...');
          await loadCurrentTrackIntoPlayer();
        }

        if (!soundRef.current) {
          console.error('❌ Failed to load sound');
          return;
        }

        if (playlist.isPlaying) {
          console.log('⏸️ Pausing audio file...');
          await soundRef.current.pauseAsync();
          setPlaylist((prev) => ({ ...prev, isPlaying: false }));
          console.log('✅ Paused');
        } else {
          console.log('▶️ Playing audio file...');
          await soundRef.current.playAsync();
          setPlaylist((prev) => ({ ...prev, isPlaying: true }));
          console.log('✅ Playing');
        }
      }
      // CAS 2: Piste sans fichier audio - utiliser la synthèse vocale
      else if (track.text) {
        if (playlist.isPlaying) {
          // Arrêter la synthèse vocale
          console.log('⏸️ Stopping speech...');
          await Speech.stop();
          if (speechIntervalRef.current) {
            clearInterval(speechIntervalRef.current);
            speechIntervalRef.current = null;
          }
          setPlaylist((prev) => ({ ...prev, isPlaying: false }));
          console.log('✅ Speech stopped');
        } else {
          // Démarrer la synthèse vocale
          console.log('▶️ Starting speech...');
          await Speech.stop(); // Arrêter d'abord toute lecture en cours

          // Voix féminine: pitch plus élevé (1.2), voix masculine: pitch plus bas (0.8)
          const pitch = gender === 'female' ? 1.2 : 0.8;
          console.log(`🔊 Using ${gender === 'female' ? 'female' : 'male'} voice (pitch: ${pitch})`);

          setPlaylist((prev) => ({ ...prev, isPlaying: true, currentPosition: 0 }));

          // Estimer la durée (environ 150 mots par minute pour l'arabe)
          const wordCount = track.text.split(/\s+/).length;
          const estimatedDurationSec = Math.ceil((wordCount / 150) * 60);

          // Mettre à jour la durée estimée
          setPlaylist((prev) => ({
            ...prev,
            tracks: prev.tracks.map((t, idx) =>
              idx === prev.currentTrackIndex ? { ...t, duration: estimatedDurationSec } : t
            ),
          }));

          // Simuler la progression
          let position = 0;
          speechIntervalRef.current = setInterval(() => {
            position += 1;
            setPlaylist((prev) => {
              if (position >= estimatedDurationSec || !prev.isPlaying) {
                if (speechIntervalRef.current) {
                  clearInterval(speechIntervalRef.current);
                  speechIntervalRef.current = null;
                }
                return { ...prev, currentPosition: estimatedDurationSec, isPlaying: false };
              }
              return { ...prev, currentPosition: position };
            });
          }, 1000);

          await Speech.speak(track.text, {
            language: 'ar-SA',
            pitch,
            rate: 0.85,
            onDone: () => {
              console.log('🔊 Speech finished');
              if (speechIntervalRef.current) {
                clearInterval(speechIntervalRef.current);
                speechIntervalRef.current = null;
              }
              setPlaylist((prev) => ({ ...prev, isPlaying: false, currentPosition: 0 }));

              // Passer à la piste suivante si looping activé
              if (playlist.isLooping && playlist.tracks.length > 1) {
                const nextIndex = (playlist.currentTrackIndex + 1) % playlist.tracks.length;
                setPlaylist((prev) => ({
                  ...prev,
                  currentTrackIndex: nextIndex,
                  currentPosition: 0,
                  isPlaying: true
                }));
              }
            },
            onError: (err) => {
              console.error('❌ Speech error:', err);
              if (speechIntervalRef.current) {
                clearInterval(speechIntervalRef.current);
                speechIntervalRef.current = null;
              }
              setPlaylist((prev) => ({ ...prev, isPlaying: false }));
            },
          });

          console.log('✅ Speech started');
        }
      } else {
        console.warn('⚠️ Track has no URI and no text');
        return;
      }
    } catch (error) {
      console.error('❌ Error in togglePlayPause:', error);
      setPlaylist((prev) => ({ ...prev, isPlaying: false }));
    }
  }, [playlist.tracks, playlist.currentTrackIndex, playlist.isPlaying, playlist.isLooping, gender, loadCurrentTrackIntoPlayer]);

  const nextTrack = useCallback(() => {
    setPlaylist((prev) => {
      if (prev.tracks.length === 0) return prev;
      let nextIndex = prev.currentTrackIndex + 1;
      if (nextIndex >= prev.tracks.length) nextIndex = prev.isLooping ? 0 : prev.tracks.length - 1;
      return { ...prev, currentTrackIndex: nextIndex, currentPosition: 0, isPlaying: false };
    });
  }, []);

  const previousTrack = useCallback(() => {
    setPlaylist((prev) => {
      if (prev.tracks.length === 0) return prev;
      let prevIndex = prev.currentTrackIndex - 1;
      if (prevIndex < 0) prevIndex = prev.isLooping ? prev.tracks.length - 1 : 0;
      return { ...prev, currentTrackIndex: prevIndex, currentPosition: 0, isPlaying: false };
    });
  }, []);

  const toggleLooping = useCallback(() => {
    setPlaylist((prev) => {
      const newLooping = !prev.isLooping;
      // Applique immédiatement au player si chargé
      if (soundRef.current) {
        soundRef.current.setIsLoopingAsync(newLooping).catch(() => {});
      }
      return { ...prev, isLooping: newLooping };
    });
  }, []);

  const formatTime = useCallback((seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  }, []);

  const value = useMemo<AudioPlaylistContextType>(
    () => ({
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
      updateTrackFolder,
    }),
    [
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
      updateTrackFolder,
    ]
  );

  return <AudioPlaylistContext.Provider value={value}>{children}</AudioPlaylistContext.Provider>;
}

export function useAudioPlaylistContext() {
  const context = useContext(AudioPlaylistContext);
  if (!context) throw new Error("useAudioPlaylistContext must be used within an AudioPlaylistProvider");
  return context;
}
