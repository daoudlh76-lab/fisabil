/**
 * OpenAI Text-to-Speech utility
 * Uses the tts-1 API for natural, high-quality voices.
 * Falls back to expo-speech (device TTS) if the API call fails.
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
import * as FileSystem from 'expo-file-system/legacy';
import * as Speech from 'expo-speech';

const OPENAI_API_KEY = process.env.EXPO_PUBLIC_OPENAI_API_KEY || '';

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
    // Stop OpenAI-based audio
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
  /** Force device TTS (expo-speech) instead of OpenAI API — FREE */
  forceDevice?: boolean;
}

/**
 * Speak text using OpenAI TTS.
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
    forceDevice = true,
  } = opts;

  // Stop anything currently playing and get our generation token
  await stopTTS();
  const myGeneration = generationId;

  if (!OPENAI_API_KEY || forceDevice) {
    if (!OPENAI_API_KEY) console.warn('[TTS] No OpenAI API key – falling back to device TTS');
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

    console.log(`🔊 OpenAI TTS: voice=${selectedVoice}, speed=${speed}, len=${text.length}`);
    const startTime = Date.now();

    const response = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'tts-1',
        input: text,
        voice: selectedVoice,
        speed,
        response_format: 'mp3',
      }),
    });

    // ── Check if cancelled while waiting for API ──
    if (myGeneration !== generationId) {
      console.log('[TTS] Cancelled (generation changed during API call)');
      onDone?.();
      return;
    }

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      console.error(`[TTS] OpenAI error ${response.status}:`, errText);
      if (myGeneration !== generationId) { onDone?.(); return; }
      return fallbackSpeak(text, gender, speed, language, onDone, onError);
    }

    // Read the audio response as a blob, convert to base64, save to a temp file
    const arrayBuffer = await response.arrayBuffer();

    // ── Check if cancelled while reading response ──
    if (myGeneration !== generationId) {
      console.log('[TTS] Cancelled (generation changed during response read)');
      onDone?.();
      return;
    }

    const base64 = arrayBufferToBase64(arrayBuffer);
    const tempFile = `${FileSystem.cacheDirectory}tts_${Date.now()}.mp3`;
    await FileSystem.writeAsStringAsync(tempFile, base64, {
      encoding: FileSystem.EncodingType.Base64,
    });

    // ── Check if cancelled while writing file ──
    if (myGeneration !== generationId) {
      console.log('[TTS] Cancelled (generation changed during file write)');
      FileSystem.deleteAsync(tempFile, { idempotent: true }).catch(() => {});
      onDone?.();
      return;
    }

    const elapsed = Date.now() - startTime;
    console.log(`🔊 OpenAI TTS audio ready (${elapsed}ms), playing...`);

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
    console.error('[TTS] OpenAI TTS error, falling back to device:', err);
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
  if (!OPENAI_API_KEY || !text) return null;
  const voice = voiceForGender(gender);
  const key = hashText(text, voice, speed);
  if (audioCache.has(key)) {
    console.log('[TTS] Cache hit for prefetch');
    return audioCache.get(key)!;
  }

  try {
    console.log(`[TTS] Prefetching audio (${text.length} chars)...`);
    const response = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model: 'tts-1', input: text, voice, speed, response_format: 'mp3' }),
    });
    if (!response.ok) return null;
    const arrayBuffer = await response.arrayBuffer();
    const base64 = arrayBufferToBase64(arrayBuffer);
    const tempFile = `${FileSystem.cacheDirectory}tts_pre_${Date.now()}.mp3`;
    await FileSystem.writeAsStringAsync(tempFile, base64, { encoding: FileSystem.EncodingType.Base64 });
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

// ─── Helpers ──────────────────────────────────────────────────────────────

/** Convert ArrayBuffer to base64 string */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  // React Native global btoa
  return btoa(binary);
}
