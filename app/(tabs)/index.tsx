import * as ImagePicker from "expo-image-picker";
import * as Linking from "expo-linking";
import { router } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { useAudioPlaylistContext } from "@/contexts/audio-playlist-context";
import { useSubscription } from "@/contexts/subscription-context";
import { useDiacritics as useOldDiacritics } from "@/hooks/use-diacritics";
import { useDiacritics } from "@/hooks/use-diacritics-local";
import { useLanguage } from "@/hooks/use-language";
import { useTextToSpeech } from "@/hooks/use-text-to-speech";

import { supabase } from "@/src/lib/supabase";
import { updateLocalScan, saveLocalVocab } from "@/src/lib/local-cache";
import { processArabicImage } from "@/src/lib/process-arabic-text";

const GREEN = "#2E7D32";
const BG = "transparent";

function ScannerScreen() {
  const { t, language } = useLanguage();
  const { isPremium, isLoaded } = useSubscription();

  const [title, setTitle] = useState("");
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [ocrText, setOcrText] = useState("");
  const [reviewText, setReviewText] = useState("");

  const { loading: diacriticsLoading } = useOldDiacritics();
  const { addDiacriticsToText } = useDiacritics();

  const [showDiacritics, setShowDiacritics] = useState(false);
  const [scannedTexts, setScannedTexts] = useState<string[]>([]);
  const [multiPageMode, setMultiPageMode] = useState(false);

  const { addTrack, updateTrackScanId, updateTrackContent } = useAudioPlaylistContext();
  const { speakText } = useTextToSpeech();

  const [ocrLoading, setOcrLoading] = useState(false);

  // On garde l'ID de la piste audio créée (single page ou merge)
  const [lastTrackId, setLastTrackId] = useState<string | null>(null);
  // Résultat Gemini (vocab extrait lors du scan) pour sauvegarder avec le scan
  const [lastGeminiVocab, setLastGeminiVocab] = useState<any>(null);

  const canSave = useMemo(() => {
    return title.trim().length > 0 && reviewText.trim().length > 0;
  }, [title, reviewText]);

  async function openAppSettings() {
    if (Platform.OS === "ios") {
      await Linking.openURL("app-settings:");
    } else {
      await Linking.openSettings();
    }
  }

  async function pickFromGallery() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      if (!perm.canAskAgain) {
        Alert.alert(
          t("scanner.permissionDenied"),
          t("scanner.galleryPermission"),
          [
            { text: t("common.cancel"), style: "cancel" },
            { text: t("scanner.openSettings") || "Réglages", onPress: openAppSettings },
          ]
        );
      } else {
        Alert.alert(t("scanner.permissionDenied"), t("scanner.galleryPermission"));
      }
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.7,
    });
    if (result.canceled) return;

    const uri = result.assets?.[0]?.uri;
    if (!uri) return;

    setImageUri(uri);
    setOcrText("");
    setReviewText("");
    setShowDiacritics(false);
  }

  async function takePhoto() {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      if (!perm.canAskAgain) {
        Alert.alert(
          t("scanner.permissionDenied"),
          t("scanner.cameraPermission"),
          [
            { text: t("common.cancel"), style: "cancel" },
            { text: t("scanner.openSettings") || "Réglages", onPress: openAppSettings },
          ]
        );
      } else {
        Alert.alert(t("scanner.permissionDenied"), t("scanner.cameraPermission"));
      }
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      quality: 0.7,
    });
    if (result.canceled) return;

    const uri = result.assets?.[0]?.uri;
    if (!uri) return;

    setImageUri(uri);
    setOcrText("");
    setReviewText("");
    setShowDiacritics(false);
  }

  async function runOcr() {
    if (!imageUri) {
      Alert.alert(t("scanner.missingImage"), t("scanner.chooseImage"));
      return;
    }

    // Free user: bloquer le scan
    if (isLoaded && !isPremium) {
      Alert.alert(
        t("scanner.premiumRequired"),
        t("scanner.premiumRequiredMessage"),
        [
          { text: t("settings.cancel"), style: "cancel" },
          {
            text: t("settings.upgradeToPremium"),
            onPress: () => router.push("/(tabs)/subscription"),
          },
        ]
      );
      return;
    }

    setOcrLoading(true);

    try {
      // Pipeline Gemini 2.0 Flash : OCR + vocalisation + extraction vocab en un seul appel
      let usedGemini = false;
      let finalText = "";

      try {
        const result = await processArabicImage(imageUri, language);

        if (result.full_text_vocalized?.trim()) {
          finalText = result.full_text_vocalized;
          usedGemini = true;

          // Sauvegarder le vocab extrait pour le cacher lors du save
          setLastGeminiVocab({
            vocabulaire: result.vocabulaire || [],
            verbes: result.verbes || [],
            particules: result.particules || [],
          });
        }
      } catch (geminiError: any) {
        __DEV__ && console.warn("⚠️ Gemini OCR failed:", geminiError?.message);
      }

      if (!usedGemini) {
        Alert.alert(t("scanner.error"), t("scanner.noTextDetected"));
        return;
      }

      if (!finalText.trim()) {
        Alert.alert(t("scanner.error"), t("scanner.noTextDetected"));
        return;
      }

      setOcrText(finalText);
      setReviewText(finalText);
      if (usedGemini) setShowDiacritics(true);

      // ✅ Multi-page: on n'ajoute PAS à la playlist tout de suite
      if (multiPageMode) {
        Alert.alert(`✅ ${t("scanner.extractionOk")}`, t("scanner.textAdded"));
      } else {
        await convertAndAddToPlaylist(finalText);
        Alert.alert(`✅ ${t("scanner.extractionOk")}`, t("scanner.vowelsAdded"));
      }
    } catch (error: any) {
      __DEV__ && console.error("Erreur OCR:", error);
      Alert.alert(t("scanner.error"), error.message || "OCR failed");
    } finally {
      setOcrLoading(false);
    }
  }

  async function convertAndAddToPlaylist(text: string) {
    try {
      const trackTitle = title.trim() || `Texte du ${new Date().toLocaleDateString()}`;

      const newTrack = await addTrack(trackTitle, text, null);
      setLastTrackId(newTrack.id);
    } catch (error) {
      __DEV__ && console.error("❌ Erreur ajout playlist:", error);
    }
  }

  async function readTextAloud() {
    if (reviewText.trim()) {
      await speakText(reviewText, "ar-SA", { forceDevice: true });
    }
  }

  function addScannedText() {
    if (!reviewText.trim()) {
      Alert.alert(t("scanner.error"), t("scanner.doOcr"));
      return;
    }
    setScannedTexts((prev) => [...prev, reviewText.trim()]);
    setOcrText("");
    setReviewText("");
    setImageUri(null);
    setShowDiacritics(false);

    Alert.alert(`✅ ${t("scanner.pageAdded")}`, `${scannedTexts.length + 1} ${t("scanner.pagesScanned")}`);
  }

  async function mergeScannedTexts() {
    if (scannedTexts.length === 0) {
      Alert.alert(t("scanner.error"), t("scanner.doOcr"));
      return;
    }

    const merged = scannedTexts.join("\n\n");
    setReviewText(merged);
    setScannedTexts([]);

    // ✅ Crée une seule piste audio pour le texte fusionné
    await convertAndAddToPlaylist(merged);

    Alert.alert(`✅ ${t("scanner.mergeOk")}`, t("scanner.textsMerged"));
  }

  function removeScannedText(index: number) {
    setScannedTexts(scannedTexts.filter((_, i) => i !== index));
  }

  async function handleAddDiacritics() {
    if (!reviewText.trim()) {
      Alert.alert(t("scanner.error"), t("scanner.reviewEmpty"));
      return;
    }
    const result = addDiacriticsToText(reviewText);
    if (result) {
      setReviewText(result);
      setShowDiacritics(true);
      Alert.alert(`✅ ${t("scanner.vowelsAddedSuccess")}`, t("scanner.vowelsAddedText"));
    } else {
      Alert.alert(t("scanner.error"), t("scanner.saveError"));
    }
  }

  async function saveScan() {
    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;

      const userId = sessionData.session?.user?.id;
      if (!userId) {
        Alert.alert(t("scanner.notConnected"), t("scanner.loginRequired"));
        router.push("/(auth)/login");
        return;
      }

      const titleTrimmed = title.trim();
      const c = reviewText.trim();

      if (!titleTrimmed) {
        Alert.alert(t("scanner.missingTitle"), t("scanner.writeTitle"));
        return;
      }
      if (!c) {
        Alert.alert(t("scanner.emptyText"), t("scanner.doOcr"));
        return;
      }

      // Si on est en multi-page et qu’on n’a pas encore créé une piste (cas rare), on la crée ici
      if (!lastTrackId) {
        await convertAndAddToPlaylist(c);
      }

      const { data, error } = await supabase
        .from("scans")
        .insert([{ user_id: userId, title: titleTrimmed, content: c }])
        .select("id");

      if (error) throw error;

      // Mettre à jour le titre/texte de la piste
      if (lastTrackId) {
        updateTrackContent(lastTrackId, titleTrimmed, c);
      }

      // Lier la piste au scan
      const scanId = data?.[0]?.id;
      if (scanId && lastTrackId) {
        updateTrackScanId(lastTrackId, scanId);
      }

      // Sauvegarder dans le cache local
      if (scanId) {
        updateLocalScan({
          id: scanId,
          user_id: userId,
          title: titleTrimmed,
          content: c,
          created_at: new Date().toISOString(),
          folder_id: null,
        });

        // Pré-cacher le vocabulaire extrait par Gemini lors du scan
        if (lastGeminiVocab) {
          const vocabPayload = {
            meta: { ui_lang: language, title: titleTrimmed, source: 'gemini', model: 'gemini-2.0-flash', prompt_version: 2 },
            ...lastGeminiVocab,
          };
          saveLocalVocab(scanId, language, vocabPayload);
          // Cache Supabase aussi
          try {
            await supabase.from("ai_cache").upsert(
              { key: `ai_vocab_${scanId}_${language}`, payload: vocabPayload, scan_id: scanId, user_id: userId },
              { onConflict: "key" }
            );
          } catch { /* ignore */ }
        }
      }

      Alert.alert(t("scanner.saved"), t("scanner.savedSuccess"));

      setTitle("");
      setImageUri(null);
      setOcrText("");
      setReviewText("");
      setShowDiacritics(false);
      setScannedTexts([]);
      setLastTrackId(null);
      setLastGeminiVocab(null);
    } catch (e: any) {
      __DEV__ && console.log("SAVE ERROR:", e);
      Alert.alert(t("scanner.error"), e?.message ?? t("scanner.saveError"));
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.header}>{t("scanner.title")}</Text>

        {/* Free user : bandeau abonnement requis */}
        {isLoaded && !isPremium && (
          <View style={styles.freeUserBanner}>
            <Text style={styles.freeUserText}>{t("scanner.premiumRequired")}</Text>
            <Pressable style={styles.upgradeLinkButton} onPress={() => router.push("/(tabs)/subscription")}>
              <Text style={styles.upgradeLinkText}>{t("settings.upgradeToPremium")}</Text>
            </Pressable>
          </View>
        )}

        <Text style={styles.label}>{t("scanner.titleInput")}</Text>
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder={t("scanner.titlePlaceholder")}
          style={styles.input}
        />

        <Text style={[styles.label, { marginTop: 16 }]}>{t("scanner.scanMode")}</Text>
        <View style={styles.modeSelector}>
          <Pressable
            style={[styles.modeButton, !multiPageMode && styles.modeButtonActive]}
            onPress={() => setMultiPageMode(false)}
          >
            <Text style={[styles.modeButtonText, !multiPageMode && styles.modeButtonTextActive]}>
              📄 {t("scanner.singlePage")}
            </Text>
          </Pressable>
          <Pressable
            style={[styles.modeButton, multiPageMode && styles.modeButtonActive]}
            onPress={() => setMultiPageMode(true)}
          >
            <Text style={[styles.modeButtonText, multiPageMode && styles.modeButtonTextActive]}>
              📚 {t("scanner.multiplePages")}
            </Text>
          </Pressable>
        </View>

        <Text style={[styles.label, { marginTop: 16 }]}>{t("scanner.import")}</Text>

        <View style={styles.buttonRow}>
          <Pressable style={styles.boxButton} onPress={takePhoto}>
            <Text style={styles.boxIcon}>📷</Text>
            <Text style={styles.boxText}>{t("scanner.photo")}</Text>
          </Pressable>

          <Pressable style={styles.boxButton} onPress={pickFromGallery}>
            <Text style={styles.boxIcon}>🖼️</Text>
            <Text style={styles.boxText}>{t("scanner.gallery")}</Text>
          </Pressable>
        </View>

        <Text style={[styles.label, { marginTop: 16 }]}>{t("scanner.preview")}</Text>
        <View style={styles.preview}>
          {imageUri ? (
            <Image source={{ uri: imageUri }} style={styles.previewImg} />
          ) : (
            <Text style={styles.previewEmpty}>{t("scanner.previewEmpty")}</Text>
          )}
        </View>

        <Pressable style={[styles.primaryButton, ocrLoading && { opacity: 0.7 }]} onPress={runOcr} disabled={ocrLoading}>
          {ocrLoading ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <ActivityIndicator color="white" size="small" />
              <Text style={styles.primaryButtonText}>{t("scanner.ocrLoading")}</Text>
            </View>
          ) : (
            <Text style={styles.primaryButtonText}>{t("scanner.ocr")}</Text>
          )}
        </Pressable>

        {multiPageMode && scannedTexts.length > 0 && (
          <View style={styles.pagesContainer}>
            <Text style={[styles.label, { marginTop: 16 }]}>
              {t("scanner.scannedPages")} ({scannedTexts.length})
            </Text>
            <View style={styles.pagesList}>
              {scannedTexts.map((text, index) => (
                <View key={index} style={styles.pageCard}>
                  <View style={styles.pageCardHeader}>
                    <Text style={styles.pageCardTitle}>
                      📄 {t("scanner.page")} {index + 1}
                    </Text>
                    <Text style={styles.pageCardPreview} numberOfLines={1}>
                      {text.substring(0, 30)}...
                    </Text>
                  </View>
                  <Pressable style={styles.pageCardRemoveButton} onPress={() => removeScannedText(index)}>
                    <Text style={styles.pageCardRemoveText}>❌ {t("scanner.remove")}</Text>
                  </Pressable>
                </View>
              ))}
            </View>
            <Pressable style={styles.mergeButton} onPress={mergeScannedTexts}>
              <Text style={styles.mergeButtonText}>🔗 {t("scanner.mergePagesButton")}</Text>
            </Pressable>
          </View>
        )}

        {multiPageMode && (
          <Pressable style={styles.addButton} onPress={addScannedText}>
            <Text style={styles.addButtonText}>➕ {t("scanner.addThisPage")}</Text>
          </Pressable>
        )}

        <Text style={[styles.label, { marginTop: 16 }]}>{t("scanner.textDetected")}</Text>
        <View style={styles.card}>
          <Text style={styles.smallOk}>{ocrText ? t("scanner.ocrOk") : t("scanner.ocrEmpty")}</Text>
          {ocrText ? <Text style={styles.detected}>{ocrText}</Text> : null}
        </View>

        <Text style={[styles.label, { marginTop: 16 }]}>{t("scanner.review")}</Text>
        <TextInput
          value={reviewText}
          onChangeText={setReviewText}
          placeholder={t("scanner.reviewPlaceholder")}
          multiline
          style={styles.textarea}
        />

        <Pressable style={[styles.addVowelsButton, diacriticsLoading && { opacity: 0.5 }]} onPress={handleAddDiacritics} disabled={diacriticsLoading}>
          <Text style={styles.addVowelsButtonText}>
            {diacriticsLoading ? t("scanner.reanalyzing") : t("scanner.reanalyze")}
          </Text>
        </Pressable>

        {showDiacritics && (
          <View style={styles.vowelsInfo}>
            <Text style={styles.vowelsInfoText}>{t("scanner.reanalyzeDone")}</Text>
          </View>
        )}

        <Pressable style={[styles.saveButton, !canSave && { opacity: 0.5 }]} onPress={saveScan} disabled={!canSave}>
          <Text style={styles.saveButtonText}>{t("scanner.save")}</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 18, paddingBottom: 40, backgroundColor: BG },
  header: { fontSize: 22, fontWeight: "800", textAlign: "center", marginBottom: 14 },

  freeUserBanner: {
    backgroundColor: "#FFF3E0",
    padding: 14,
    borderRadius: 8,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: "#FF9800",
  },
  freeUserText: { fontSize: 14, fontWeight: "700", color: "#E65100", textAlign: "center" },
  upgradeLinkButton: { marginTop: 8, paddingVertical: 6, paddingHorizontal: 12, backgroundColor: GREEN, borderRadius: 6, alignSelf: "center" },
  upgradeLinkText: { fontSize: 13, fontWeight: "600", color: "white" },

  label: { fontSize: 14, fontWeight: "700", color: GREEN, marginBottom: 8 },
  input: { backgroundColor: "#fff", borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12 },

  buttonRow: { flexDirection: "row", gap: 12 },
  boxButton: { flex: 1, backgroundColor: "#EAF4EA", borderWidth: 2, borderColor: GREEN, borderStyle: "dashed", borderRadius: 14, paddingVertical: 18, alignItems: "center", justifyContent: "center" },
  boxIcon: { fontSize: 18, marginBottom: 6 },
  boxText: { fontSize: 16, fontWeight: "700", color: GREEN },

  preview: { backgroundColor: "#fff", borderRadius: 14, borderWidth: 1, borderColor: "#E5E7EB", height: 220, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  previewImg: { width: "100%", height: "100%", resizeMode: "cover" },
  previewEmpty: { color: "#6B7280" },

  primaryButton: { marginTop: 14, backgroundColor: GREEN, borderRadius: 14, paddingVertical: 16, alignItems: "center" },
  primaryButtonText: { color: "#fff", fontSize: 16, fontWeight: "800" },

  card: { backgroundColor: "#fff", borderRadius: 14, padding: 14, borderWidth: 1, borderColor: "#E5E7EB" },
  smallOk: { color: "#111827", marginBottom: 8, fontWeight: "600" },
  detected: { color: "#111827", lineHeight: 20 },

  textarea: { backgroundColor: "#fff", borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 14, padding: 14, minHeight: 150, textAlignVertical: "top" },

  addVowelsButton: { marginTop: 14, backgroundColor: "#6366f1", borderRadius: 14, paddingVertical: 14, alignItems: "center" },
  addVowelsButtonText: { color: "#fff", fontWeight: "800", fontSize: 14 },

  vowelsInfo: { backgroundColor: "#d4edda", borderWidth: 1, borderColor: "#c3e6cb", borderRadius: 12, padding: 12, marginTop: 10 },
  vowelsInfoText: { color: "#155724", fontWeight: "600", fontSize: 14 },

  saveButton: { marginTop: 16, backgroundColor: GREEN, borderRadius: 14, paddingVertical: 16, alignItems: "center" },
  saveButtonText: { color: "#fff", fontSize: 16, fontWeight: "900" },

  modeSelector: { flexDirection: "row", gap: 10 },
  modeButton: { flex: 1, backgroundColor: "#E5E7EB", borderWidth: 2, borderColor: "#D1D5DB", borderRadius: 12, paddingVertical: 12, alignItems: "center" },
  modeButtonActive: { backgroundColor: GREEN, borderColor: GREEN },
  modeButtonText: { fontSize: 14, fontWeight: "700", color: "#6B7280" },
  modeButtonTextActive: { color: "#fff" },

  pagesContainer: { marginTop: 16 },
  pagesList: { gap: 10 },

  pageCard: { backgroundColor: "#fff", borderRadius: 12, padding: 12, borderWidth: 1, borderColor: "#E5E7EB", flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  pageCardHeader: { flex: 1 },
  pageCardTitle: { fontSize: 14, fontWeight: "700", color: GREEN, marginBottom: 4 },
  pageCardPreview: { fontSize: 12, color: "#6B7280" },
  pageCardRemoveButton: { paddingHorizontal: 10, paddingVertical: 6, backgroundColor: "#FEE2E2", borderRadius: 8 },
  pageCardRemoveText: { fontSize: 12, fontWeight: "600", color: "#DC2626" },

  mergeButton: { marginTop: 12, backgroundColor: "#3B82F6", borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  mergeButtonText: { color: "#fff", fontWeight: "800", fontSize: 14 },

  addButton: { marginTop: 14, backgroundColor: "#8B5CF6", borderRadius: 14, paddingVertical: 14, alignItems: "center" },
  addButtonText: { color: "#fff", fontWeight: "800", fontSize: 14 },
});

export default ScannerScreen;