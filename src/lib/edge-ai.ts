import * as FileSystem from 'expo-file-system';
import { EncodingType } from 'expo-file-system';
import { supabase } from './supabase';

/**
 * Wrapper pour appeler une Edge Function Supabase côté client.
 * @param fnName Nom de la function (ex: 'tutor-chat-ai')
 * @param body Payload JSON
 * @returns data ou throw une erreur
 */
export async function invokeEdge<T = any>(fnName: string, body: any): Promise<T> {
  if (__DEV__) {
    console.log(`📡 [EdgeAI] invokeEdge('${fnName}') payload:`, body);
  }

  // Récupérer la session
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData?.session?.access_token;

  if (!accessToken) {
    throw new Error("No session or access token");
  }

  console.log("[EdgeAI] hasSession", !!accessToken, "fn", fnName);
  console.log("[EdgeAI] token startsWith", accessToken?.slice(0, 20));

  const { data, error } = await supabase.functions.invoke(fnName, {
    body,
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });

  if (__DEV__) {
    console.log(`📡 [EdgeAI] invokeEdge('${fnName}') response:`, data, error);
  }
  if (error) {
    const errMsg = `[EdgeAI] ${fnName} failed: status=${error.status || 'unknown'}, message=${error.message}`;
    console.error(errMsg, "url:", error.context?.url);
    throw new Error(errMsg);
  }
  return data as T;
}

/**
 * Convertit un audio base64 en fichier temporaire lisible par expo-av.
 * @param base64 Données audio (sans header)
 * @param format Format (ex: 'mp3', 'wav')
 * @returns uri du fichier temporaire
 */
export async function base64ToTempAudioFile(base64: string, format: string = 'mp3'): Promise<string> {
  const fileUri = `${FileSystem.cacheDirectory}edge-tts-${Date.now()}.${format}`;
  await FileSystem.writeAsStringAsync(fileUri, base64, { encoding: FileSystem.EncodingType.Base64 });
  return fileUri;
}

/**
 * Lit un fichier audio local (uri) et retourne le base64 (pour STT)
 * @param uri uri du fichier
 * @returns base64 string
 */
export async function fileUriToBase64(uri: string): Promise<string> {
  return FileSystem.readAsStringAsync(uri, { encoding: EncodingType.Base64 });
}
