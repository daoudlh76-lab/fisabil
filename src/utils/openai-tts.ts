/**
 * Text-to-Speech utility using Supabase Edge Function (tts-generate)
 * Falls back to expo-speech (device TTS) if the Edge Function fails.
 *
 * Voices:  alloy | echo | fable | onyx | nova | shimmer
 *   - alloy:   neutral, warm
 *   - nova:    female, warm and natural  ← recommended for female
 *   - onyx:    male, deep and authoritative  ← recommended for male
 *   - shimmer: female, gentle
 *   - echo:    male, natural
 *   - fable:   male, narrative style
 */

import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import * as Speech from 'expo-speech';
import { invokeEdge, base64ToTempAudioFile } from '@/src/lib/edge-ai';

export type TTSVoice = 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer';
export type TTSGender = 'male' | 'female';

/** Map gender preference to a voice name */
export function voiceForGender(gender: TTSGender): TTSVoice {
  return gender === 'female' ? 'nova' : 'onyx';
}

// ─── Audio player singleton + cancellation ────────────────────────────────
let currentSound: Audio.Sound | null = null;
/**
 * Generation counter: incremented every time stopTTS() is called.
 * Each speakWithOpenAI invocation captures the counter at start;
 * if it has changed by the time the API response arrives, the audio is discarded.
 */
let generationId = 0;

/** Stop any sound that is currently playing AND cancel in-flight requests */
export async function stopTTS(): Promise<void> {
  // Bump generation so any in-flight speakWithOpenAI calls are cancelled
  generationId++;
  try {
    // Stop Edge Function-based audio
    if (currentSound) {
      const s = currentSound;
      currentSound = null;
      await s.stopAsync().catch(() => {});
      await s.unloadAsync().catch(() => {});
    }
    // Also stop any expo-speech fallback that might be running
    await Speech.stop().catch(() => {});
  } catch (_) {
    /* swallow */
  }
}

export interface SpeakOptions {
  /** The text to speak */
  text: string;
  /** Voice gender preference (mapped to onyx / nova) */
  gender?: TTSGender;
  /** Override the voice directly */
  voice?: TTSVoice;
  /** Playback speed – 0.25 to 4.0 (default 1.0) */
  speed?: number;
  /** Called when playback finishes or errors */
  onDone?: () => void;
  /** Called on error */
  onError?: (err: unknown) => void;
  /** Language hint for expo-speech fallback */
  language?: string;
  /** Force device TTS (expo-speech) instead of Edge Function — FREE */
  forceDevice?: boolean;
}

/**
 * Speak text using Supabase Edge Function (tts-generate).
 * Returns a Promise that resolves when playback completes.
 * Falls back to expo-speech on failure.
 */
export async function speakWithOpenAI(opts: SpeakOptions): Promise<void> {
  const {
    text,
    gender = 'male',
    voice,
    speed = 1.0,
    onDone,
    onError,
    language = 'ar-SA',
    forceDevice = false,
  } = opts;

  // Stop anything currently playing and get our generation token
  await stopTTS();
  const myGeneration = generationId;

  if (forceDevice) {
    return fallbackSpeak(text, gender, speed, language, onDone, onError);
  }

  const selectedVoice = voice ?? voiceForGender(gender);

  try {
    // ── Check cache first (from prefetchTTS) ──
    const cacheKey = hashText(text, selectedVoice, speed);
    const cachedFile = audioCache.get(cacheKey);

    if (cachedFile) {
      console.log('[TTS] Playing from cache (instant)');
      audioCache.delete(cacheKey);

      if (myGeneration !== generationId) { onDone?.(); return; }

      await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true });
      const { sound } = await Audio.Sound.createAsync({ uri: cachedFile }, { shouldPlay: true });

      if (myGeneration !== generationId) {
        await sound.stopAsync().catch(() => {});
        await sound.unloadAsync().catch(() => {});
        FileSystem.deleteAsync(cachedFile, { idempotent: true }).catch(() => {});
        onDone?.();
        return;
      }

      currentSound = sound;
      return new Promise<void>((resolve) => {
        sound.setOnPlaybackStatusUpdate((status) => {
          if (!status.isLoaded) return;
          if (status.didJustFinish) {
            sound.unloadAsync().catch(() => {});
            if (currentSound === sound) currentSound = null;
            FileSystem.deleteAsync(cachedFile, { idempotent: true }).catch(() => {});
            onDone?.();
            resolve();
          }
        });
      });
    }

    console.log(`🔊 Edge Function TTS: voice=${selectedVoice}, speed=${speed}, len=${text.length}`);
    const startTime = Date.now();

    // Call Supabase Edge Function

    let data: any = null;
    let error: any = null;
    try {
      data = await invokeEdge('tts-generate', {
        text,
        voice: selectedVoice,
        format: 'mp3',
        speed,
      });
    } catch (err: any) {
      error = err;
    }

    // ── Check if cancelled while waiting for Edge Function ──
    if (myGeneration !== generationId) {
      console.log('[TTS] Cancelled (generation changed during Edge Function call)');
      onDone?.();
      return;
    }

    if (error || !data) {
      console.error('[TTS] Edge Function error:', error);
      if (myGeneration !== generationId) { onDone?.(); return; }
      return fallbackSpeak(text, gender, speed, language, onDone, onError);
    }

    // Edge Function returns: { audioBase64, format, size }

    const audioBase64 = data?.audioBase64;
    if (!audioBase64) {
      console.error('[TTS] No audio data returned');
      if (myGeneration !== generationId) { onDone?.(); return; }
      return fallbackSpeak(text, gender, speed, language, onDone, onError);
    }

    // ── Check if cancelled while processing response ──
    if (myGeneration !== generationId) {
      console.log('[TTS] Cancelled (generation changed during response processing)');
      onDone?.();
      return;
    }

    // Save base64 audio to temp file (via util commun)
    const tempFile = await base64ToTempAudioFile(audioBase64, 'mp3');

    // ── Check if cancelled while writing file ──
    if (myGeneration !== generationId) {
      console.log('[TTS] Cancelled (generation changed during file write)');
      FileSystem.deleteAsync(tempFile, { idempotent: true }).catch(() => {});
      onDone?.();
      return;
    }

    const elapsed = Date.now() - startTime;
    console.log(`🔊 TTS audio ready (${elapsed}ms), playing...`);

    // Configure audio mode for playback
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
    });

    // ── Final check before creating the sound ──
    if (myGeneration !== generationId) {
      console.log('[TTS] Cancelled (generation changed before playback)');
      FileSystem.deleteAsync(tempFile, { idempotent: true }).catch(() => {});
      onDone?.();
      return;
    }

    // Play the file
    const { sound } = await Audio.Sound.createAsync(
      { uri: tempFile },
      { shouldPlay: true }
    );

    // ── Check if cancelled while creating sound ──
    if (myGeneration !== generationId) {
      console.log('[TTS] Cancelled (generation changed after sound creation)');
      await sound.stopAsync().catch(() => {});
      await sound.unloadAsync().catch(() => {});
      FileSystem.deleteAsync(tempFile, { idempotent: true }).catch(() => {});
      onDone?.();
      return;
    }

    currentSound = sound;

    // Wait for playback to finish
    return new Promise<void>((resolve) => {
      sound.setOnPlaybackStatusUpdate((status) => {
        if (!status.isLoaded) return;
        if (status.didJustFinish) {
          sound.unloadAsync().catch(() => {});
          if (currentSound === sound) currentSound = null;
          // Clean up temp file (fire-and-forget)
          FileSystem.deleteAsync(tempFile, { idempotent: true }).catch(() => {});
          onDone?.();
          resolve();
        }
      });
    });
  } catch (err) {
    console.error('[TTS] Edge Function error, falling back to device:', err);
    if (myGeneration !== generationId) { onDone?.(); return; }
    return fallbackSpeak(text, gender, speed, language, onDone, onError);
  }
}

// ─── TTS Audio Cache for pre-fetching ─────────────────────────────────────
const audioCache = new Map<string, string>(); // text hash → file path

function hashText(text: string, voice: TTSVoice, speed: number): string {
  return `${voice}_${speed}_${text.substring(0, 80)}`;
}

/**
 * Pre-generate TTS audio and cache it (does NOT play).
 * Call this in the background while the student is answering.
 */
export async function prefetchTTS(text: string, gender: TTSGender = 'male', speed: number = 1.0): Promise<string | null> {
  if (!text) return null;
  const voice = voiceForGender(gender);
  const key = hashText(text, voice, speed);
  if (audioCache.has(key)) {
    console.log('[TTS] Cache hit for prefetch');
    return audioCache.get(key)!;
  }

  try {
    console.log(`[TTS] Prefetching audio (${text.length} chars)...`);

    const data = await invokeEdge('tts-generate', {
      text,
      voice,
      format: 'mp3',
      speed,
    });
    if (!data?.audioBase64) return null;
    const tempFile = await base64ToTempAudioFile(data.audioBase64, 'mp3');
    audioCache.set(key, tempFile);
    console.log('[TTS] Prefetch done, cached:', key.substring(0, 30));
    return tempFile;
  } catch (err) {
    console.error('[TTS] Prefetch error:', err);
    return null;
  }
}

/** Clear all cached audio files */
export function clearTTSCache(): void {
  for (const path of audioCache.values()) {
    FileSystem.deleteAsync(path, { idempotent: true }).catch(() => {});
  }
  audioCache.clear();
}

// ─── Fallback: expo-speech (device TTS) ───────────────────────────────────
function fallbackSpeak(
  text: string,
  gender: TTSGender,
  speed: number,
  language: string,
  onDone?: () => void,
  onError?: (err: unknown) => void,
): Promise<void> {
  console.log('[TTS] Using device fallback (expo-speech)');
  return new Promise<void>((resolve) => {
    const pitch = gender === 'female' ? 1.2 : 0.8;
    const rate = Math.max(0.1, Math.min(speed, 2.0)); // expo-speech clamps differently

    Speech.speak(text, {
      language,
      pitch,
      rate,
      onDone: () => {
        onDone?.();
        resolve();
      },
      onError: (err) => {
        console.error('[TTS] Fallback speech error:', err);
        onError?.(err);
        resolve();
      },
    });
  });
}
