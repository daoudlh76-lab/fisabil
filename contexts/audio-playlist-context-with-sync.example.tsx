/**
 * EXEMPLE: Adaptation du contexte audio-playlist pour utiliser la synchronisation
 *
 * Ce fichier montre comment adapter audio-playlist-context.tsx pour utiliser
 * le système de synchronisation local/cloud.
 *
 * Ne pas utiliser directement - c'est un exemple de référence.
 */

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
import { supabase } from "@/src/lib/supabase";
import { useSyncManager } from "@/hooks/use-sync-manager";
import { useOfflineQueue } from "@/hooks/use-offline-queue";

export interface AudioTrack {
  id: string;
  title: string;
  text: string;
  duration: number;
  createdAt: Date;
  uri: string | null;
  folderId?: string | null;
}

export interface PlaylistState {
  tracks: AudioTrack[];
  currentTrackIndex: number;
  isPlaying: boolean;
  isLooping: boolean;
  currentPosition: number;
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
  syncState: any; // État de la synchronisation
}

const AudioPlaylistContext = createContext<AudioPlaylistContextType | undefined>(undefined);

export function AudioPlaylistProviderWithSync({ children }: { children: ReactNode }) {
  const [playlist, setPlaylist] = useState<PlaylistState>({
    tracks: [],
    currentTrackIndex: 0,
    isPlaying: false,
    isLooping: false,
    currentPosition: 0,
  });

  const soundRef = useRef<Audio.Sound | null>(null);

  // NOUVEAU: Utiliser les hooks de synchronisation
  const { saveWithSync, loadWithFallback, syncState } = useSyncManager();
  const { executeWithFallback } = useOfflineQueue();

  // Transformer les données pour Supabase
  const transformToCloud = useCallback((tracks: AudioTrack[]) => {
    return tracks.map((track, index) => ({
      id: track.id,
      title: track.title,
      text: track.text,
      audio_url: track.uri,
      duration: track.duration,
      folder_id: track.folderId || null,
      position: index,
      created_at: track.createdAt.toISOString(),
    }));
  }, []);

  // Transformer les données depuis Supabase
  const transformFromCloud = useCallback((cloudData: any[]) => {
    return cloudData
      .sort((a, b) => a.position - b.position)
      .map((item) => ({
        id: item.id,
        title: item.title,
        text: item.text,
        uri: item.audio_url,
        duration: item.duration,
        folderId: item.folder_id,
        createdAt: new Date(item.created_at),
      }));
  }, []);

  // MODIFIÉ: Sauvegarder avec sync automatique
  const savePlaylist = useCallback(
    async (tracks: AudioTrack[]) => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const userId = session?.user?.id;
        const localKey = userId ? `playlist_${userId}` : 'playlist_guest';

        // Sauvegarder avec sync automatique
        await saveWithSync(
          localKey,
          'audio_tracks',
          tracks,
          transformToCloud
        );

        console.log('✅ Playlist sauvegardée et synchronisée');
      } catch (error) {
        console.error("Erreur sauvegarde playlist:", error);
      }
    },
    [saveWithSync, transformToCloud]
  );

  // MODIFIÉ: Charger avec fallback local → cloud
  const loadPlaylist = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      const localKey = userId ? `playlist_${userId}` : 'playlist_guest';

      // Charger avec fallback automatique
      const data = await loadWithFallback(
        localKey,
        'audio_tracks',
        transformFromCloud
      );

      if (data && Array.isArray(data)) {
        setPlaylist((prev) => ({ ...prev, tracks: data }));
        console.log('✅ Playlist chargée:', data.length, 'pistes');
      } else {
        setPlaylist((prev) => ({ ...prev, tracks: [] }));
      }
    } catch (error) {
      console.error("Erreur chargement playlist:", error);
    }
  }, [loadWithFallback, transformFromCloud]);

  // Recharger au changement d'utilisateur
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      loadPlaylist();
    });

    loadPlaylist();

    return () => {
      subscription.unsubscribe();
    };
  }, [loadPlaylist]);

  // MODIFIÉ: Ajouter une piste avec sync
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

      const newTracks = [...playlist.tracks, newTrack];

      // Sauvegarder localement d'abord
      setPlaylist((prev) => ({ ...prev, tracks: newTracks }));

      // Puis sync avec le cloud (avec fallback offline)
      await executeWithFallback({
        type: 'upsert',
        table: 'audio_tracks',
        data: transformToCloud([newTrack])[0],
      });

      // Sauvegarder la playlist complète
      await savePlaylist(newTracks);

      console.log('✅ Piste ajoutée et synchronisée');
      return newTrack;
    },
    [playlist.tracks, savePlaylist, executeWithFallback, transformToCloud]
  );

  // MODIFIÉ: Supprimer une piste avec sync
  const removeTrack = useCallback(
    async (trackId: string) => {
      const newTracks = playlist.tracks.filter((t) => t.id !== trackId);

      let newIndex = playlist.currentTrackIndex;
      if (newTracks.length === 0) newIndex = 0;
      else if (newIndex >= newTracks.length) newIndex = newTracks.length - 1;

      setPlaylist((prev) => ({
        ...prev,
        tracks: newTracks,
        currentTrackIndex: newIndex,
        isPlaying: newTracks.length === 0 ? false : prev.isPlaying,
      }));

      // Supprimer du cloud (avec fallback offline)
      await executeWithFallback({
        type: 'delete',
        table: 'audio_tracks',
        id: trackId,
      });

      // Sauvegarder la nouvelle playlist
      await savePlaylist(newTracks);

      console.log('✅ Piste supprimée et synchronisée');
    },
    [playlist.tracks, playlist.currentTrackIndex, savePlaylist, executeWithFallback]
  );

  // MODIFIÉ: Mettre à jour le dossier d'une piste avec sync
  const updateTrackFolder = useCallback(
    async (trackId: string, folderId: string | null) => {
      const newTracks = playlist.tracks.map((t) =>
        t.id === trackId ? { ...t, folderId } : t
      );

      setPlaylist((prev) => ({ ...prev, tracks: newTracks }));

      // Mettre à jour dans le cloud (avec fallback offline)
      await executeWithFallback({
        type: 'update',
        table: 'audio_tracks',
        id: trackId,
        data: { folder_id: folderId },
      });

      // Sauvegarder la nouvelle playlist
      await savePlaylist(newTracks);

      console.log('✅ Dossier mis à jour et synchronisé');
    },
    [playlist.tracks, savePlaylist, executeWithFallback]
  );

  // Les autres fonctions restent identiques
  const selectTrack = useCallback((index: number) => {
    setPlaylist((prev) => ({
      ...prev,
      currentTrackIndex: index,
      currentPosition: 0,
      isPlaying: false,
    }));
  }, []);

  const togglePlayPause = useCallback(async () => {
    if (!playlist.tracks.length) return;

    const track = playlist.tracks[playlist.currentTrackIndex];
    if (!track?.uri) return;

    if (!soundRef.current) {
      // Charger le son...
    }
    if (!soundRef.current) return;

    if (playlist.isPlaying) {
      await soundRef.current.pauseAsync();
      setPlaylist((prev) => ({ ...prev, isPlaying: false }));
    } else {
      await soundRef.current.playAsync();
      setPlaylist((prev) => ({ ...prev, isPlaying: true }));
    }
  }, [playlist.tracks, playlist.currentTrackIndex, playlist.isPlaying]);

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
      syncState, // NOUVEAU: Exposer l'état de sync
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
      syncState,
    ]
  );

  return <AudioPlaylistContext.Provider value={value}>{children}</AudioPlaylistContext.Provider>;
}

export function useAudioPlaylistContextWithSync() {
  const context = useContext(AudioPlaylistContext);
  if (!context) throw new Error("useAudioPlaylistContextWithSync must be used within AudioPlaylistProviderWithSync");
  return context;
}
