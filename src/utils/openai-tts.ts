/**
 * Text-to-Speech utility using expo-speech (local device TTS).
 * No cloud API calls — instant, free, and offline-capable.
 */

import * as Speech from 'expo-speech';

export type TTSVoice = 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer';
export type TTSGender = 'male' | 'female';

/** Map gender preference to a voice name (kept for API compatibility) */
export function voiceForGender(gender: TTSGender): TTSVoice {
  return gender === 'female' ? 'nova' : 'onyx';
}

/** Stop any speech that is currently playing */
export async function stopTTS(): Promise<void> {
  try {
    await Speech.stop();
  } catch (_) {
    /* swallow */
  }
}

export interface SpeakOptions {
  /** The text to speak */
  text: string;
  /** Voice gender preference (mapped to pitch) */
  gender?: TTSGender;
  /** Override the voice directly (ignored for local TTS) */
  voice?: TTSVoice;
  /** Playback speed – 0.1 to 2.0 (default 1.0) */
  speed?: number;
  /** Called when playback finishes or errors */
  onDone?: () => void;
  /** Called on error */
  onError?: (err: unknown) => void;
  /** Language hint for expo-speech */
  language?: string;
  /** Kept for API compatibility (always local now) */
  forceDevice?: boolean;
}

/**
 * Speak text using expo-speech (local device TTS).
 * Returns a Promise that resolves when playback completes.
 */
export async function speakWithOpenAI(opts: SpeakOptions): Promise<void> {
  const {
    text,
    gender = 'male',
    speed = 1.0,
    onDone,
    onError,
    language = 'ar-SA',
  } = opts;

  // Stop anything currently playing
  await stopTTS();

  const pitch = gender === 'female' ? 1.5 : 0.5;
  const rate = Math.max(0.1, Math.min(speed, 2.0));

  console.log(`🔊 Local TTS: gender=${gender}, pitch=${pitch}, rate=${rate}, lang=${language}, len=${text.length}`);

  return new Promise<void>((resolve) => {
    Speech.speak(text, {
      language,
      pitch,
      rate,
      onDone: () => {
        onDone?.();
        resolve();
      },
      onError: (err) => {
        console.error('[TTS] Speech error:', err);
        onError?.(err);
        resolve();
      },
    });
  });
}

/** No-op: prefetching is not needed for local TTS */
export async function prefetchTTS(_text: string, _gender: TTSGender = 'male', _speed: number = 1.0): Promise<string | null> {
  return null;
}

/** No-op: no cache for local TTS */
export function clearTTSCache(): void {}
