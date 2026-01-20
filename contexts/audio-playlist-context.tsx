import AsyncStorage from "@react-native-async-storage/async-storage";
import { Audio } from "expo-av";
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

export interface AudioTrack {
  id: string;
  title: string;
  text: string;
  duration: number;        // secondes
  createdAt: Date;
  uri: string | null;
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
  addTrack: (title: string, text: string, audioUri: string | null) => Promise<AudioTrack>;
  removeTrack: (trackId: string) => void;
  selectTrack: (index: number) => void;
  togglePlayPause: () => Promise<void>;
  nextTrack: () => void;
  previousTrack: () => void;
  toggleLooping: () => void;
  formatTime: (seconds: number) => string;
  loadPlaylist: () => Promise<void>;
}

const AudioPlaylistContext = createContext<AudioPlaylistContextType | undefined>(undefined);
const STORAGE_KEY = "@fisabil_playlist";

export function AudioPlaylistProvider({ children }: { children: ReactNode }) {
  const [playlist, setPlaylist] = useState<PlaylistState>({
    tracks: [],
    currentTrackIndex: 0,
    isPlaying: false,
    isLooping: false,
    currentPosition: 0,
  });

  const soundRef = useRef<Audio.Sound | null>(null);

  const savePlaylist = useCallback(async (tracks: AudioTrack[]) => {
    try {
      // Convertit Date -> string pour stocker
      const serializable = tracks.map((t) => ({
        ...t,
        createdAt: t.createdAt.toISOString(),
      }));
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(serializable));
    } catch (error) {
      console.error("Erreur sauvegarde playlist:", error);
    }
  }, []);

  const loadPlaylist = useCallback(async () => {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (stored) {
        const raw = JSON.parse(stored) as any[];
        const tracks: AudioTrack[] = raw.map((t) => ({
          ...t,
          createdAt: new Date(t.createdAt),
        }));
        setPlaylist((prev) => ({ ...prev, tracks }));
      }
    } catch (error) {
      console.error("Erreur chargement playlist:", error);
    }
  }, []);

  // Libère le son quand on quitte l’app / provider
  useEffect(() => {
    return () => {
      if (soundRef.current) {
        soundRef.current.unloadAsync().catch(() => {});
        soundRef.current = null;
      }
    };
  }, []);

  const loadCurrentTrackIntoPlayer = useCallback(async () => {
    const track = playlist.tracks[playlist.currentTrackIndex];
    if (!track?.uri) return;

    // Décharge l’ancien son
    if (soundRef.current) {
      await soundRef.current.unloadAsync();
      soundRef.current = null;
    }

    const { sound, status } = await Audio.Sound.createAsync(
      { uri: track.uri },
      {
        shouldPlay: false,
        isLooping: playlist.isLooping,
      }
    );

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

    // Suivre la position
    sound.setOnPlaybackStatusUpdate((st) => {
      if (!st.isLoaded) return;
      const posSec = Math.floor((st.positionMillis ?? 0) / 1000);
      setPlaylist((prev) => ({ ...prev, currentPosition: posSec, isPlaying: st.isPlaying }));
    });
  }, [playlist.tracks, playlist.currentTrackIndex, playlist.isLooping]);

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

      setPlaylist((prev) => {
        const newTracks = [...prev.tracks, newTrack];
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

  const selectTrack = useCallback((index: number) => {
    setPlaylist((prev) => ({
      ...prev,
      currentTrackIndex: index,
      currentPosition: 0,
      isPlaying: false,
    }));
  }, []);

  // Quand l’index change, on charge la nouvelle piste dans le player
  useEffect(() => {
    if (playlist.tracks.length === 0) return;
    loadCurrentTrackIntoPlayer().catch((e) => console.error("Load track error:", e));
  }, [playlist.currentTrackIndex, playlist.tracks.length, loadCurrentTrackIntoPlayer]);

  const togglePlayPause = useCallback(async () => {
    if (!playlist.tracks.length) return;

    const track = playlist.tracks[playlist.currentTrackIndex];
    if (!track?.uri) return;

    // Si pas chargé, charge d’abord
    if (!soundRef.current) {
      await loadCurrentTrackIntoPlayer();
    }
    if (!soundRef.current) return;

    if (playlist.isPlaying) {
      await soundRef.current.pauseAsync();
      setPlaylist((prev) => ({ ...prev, isPlaying: false }));
    } else {
      await soundRef.current.playAsync();
      setPlaylist((prev) => ({ ...prev, isPlaying: true }));
    }
  }, [playlist.tracks, playlist.currentTrackIndex, playlist.isPlaying, loadCurrentTrackIntoPlayer]);

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
    setPlaylist((prev) => ({ ...prev, isLooping: !prev.isLooping }));
    // applique au player si chargé
    if (soundRef.current) {
      soundRef.current.setIsLoopingAsync(!playlist.isLooping).catch(() => {});
    }
  }, [playlist.isLooping]);

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
    ]
  );

  return <AudioPlaylistContext.Provider value={value}>{children}</AudioPlaylistContext.Provider>;
}

export function useAudioPlaylistContext() {
  const context = useContext(AudioPlaylistContext);
  if (!context) throw new Error("useAudioPlaylistContext must be used within an AudioPlaylistProvider");
  return context;
}
