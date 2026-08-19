import * as ImagePicker from "expo-image-picker";
import * as Linking from "expo-linking";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
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
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAudioPlaylistContext } from "@/contexts/audio-playlist-context";
import { useSubscription } from "@/contexts/subscription-context";
import { useDiacritics as useOldDiacritics } from "@/hooks/use-diacritics";
import { useDiacritics } from "@/hooks/use-diacritics-local";
import { useLanguage } from "@/hooks/use-language";
import { useTextToSpeech } from "@/hooks/use-text-to-speech";

import { supabase } from "@/src/lib/supabase";
import { updateLocalScan, saveLocalVocab } from "@/src/lib/local-cache";
import { processArabicImage } from "@/src/lib/process-arabic-text";

const DARK = "#0D2318";
const DARK_MEDIUM = "#1A4A2E";
const ZONE_BG = "#060f0a";
const GOLD = "#C9A84C";
const CREAM = "#F8F3EC";
const MUTED = "#8A8A8A";

const SCAN_ZONE_HEIGHT = 240;

function ScannerScreen() {
  const { t, language } = useLanguage();
  const { isPremium, isLoaded } = useSubscription();
  const insets = useSafeAreaInsets();

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

  // États purement visuels (redesign) — n'affectent aucune logique métier
  const [sourceSelected, setSourceSelected] = useState<"device" | "gallery" | "pdf" | null>(null);
  const [editingText, setEditingText] = useState(false);
  const scanLineAnim = useRef(new Animated.Value(0)).current;

  const canSave = useMemo(() => {
    return title.trim().length > 0 && reviewText.trim().length > 0;
  }, [title, reviewText]);

  const phase: "capture" | "loading" | "result" = ocrLoading
    ? "loading"
    : reviewText.trim().length > 0
    ? "result"
    : "capture";

  useEffect(() => {
    if (phase !== "capture") return;
    scanLineAnim.setValue(0);
    const loop = Animated.loop(
      Animated.timing(scanLineAnim, {
        toValue: 1,
        duration: 2200,
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [phase]);

  async function openAppSettings() {
    if (Platform.OS === "ios") {
      await Linking.openURL("app-settings:");
    } else {
      await Linking.openSettings();
    }
  }

  async function pickFromGallery() {
    setSourceSelected("gallery");
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
    setSourceSelected("device");
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

  function pickPdf() {
    setSourceSelected("pdf");
    Alert.alert(t("scanner.sourcePdf"), t("scanner.pdfComingSoon"));
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
      setEditingText(false);
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
    setEditingText(false);

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

      setTitle("");
      setImageUri(null);
      setOcrText("");
      setReviewText("");
      setShowDiacritics(false);
      setScannedTexts([]);
      setLastTrackId(null);
      setLastGeminiVocab(null);
      setEditingText(false);
      setSourceSelected(null);

      if (scanId) {
        router.push(`/library/${scanId}`);
      }
    } catch (e: any) {
      __DEV__ && console.log("SAVE ERROR:", e);
      Alert.alert(t("scanner.error"), e?.message ?? t("scanner.saveError"));
    }
  }

  const vocabPreviewItems: { singulier: string; traduction: string }[] =
    lastGeminiVocab?.vocabulaire?.slice(0, 3) ?? [];

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <LinearGradient colors={[DARK, DARK_MEDIUM]} style={styles.headerLogo}>
          <Text style={styles.headerLogoIcon}>🧠</Text>
        </LinearGradient>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>{t("nav.scanner")}</Text>
          <Text style={styles.headerSubtitle}>{t("scanner.subtitle")}</Text>
        </View>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
      >
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            { backgroundColor: phase === "result" ? CREAM : DARK },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          {phase === "capture" && (
            <>
              {isLoaded && !isPremium && (
                <View style={styles.freeUserBanner}>
                  <Text style={styles.freeUserText}>{t("scanner.premiumRequired")}</Text>
                  <Pressable style={styles.upgradeLinkButton} onPress={() => router.push("/(tabs)/subscription")}>
                    <Text style={styles.upgradeLinkText}>{t("settings.upgradeToPremium")}</Text>
                  </Pressable>
                </View>
              )}

              <View style={styles.scanZone}>
                {imageUri ? (
                  <Image source={{ uri: imageUri }} style={styles.scanZoneImage} />
                ) : (
                  <>
                    <Text style={styles.scanZoneEmptyIcon}>📷</Text>
                    <Text style={styles.scanZoneEmptyText}>{t("scanner.previewEmpty")}</Text>
                  </>
                )}

                <View style={[styles.corner, styles.cornerTL]} />
                <View style={[styles.corner, styles.cornerTR]} />
                <View style={[styles.corner, styles.cornerBL]} />
                <View style={[styles.corner, styles.cornerBR]} />

                <Animated.View
                  style={[
                    styles.scanLine,
                    {
                      transform: [
                        {
                          translateY: scanLineAnim.interpolate({
                            inputRange: [0, 1],
                            outputRange: [8, SCAN_ZONE_HEIGHT - 10],
                          }),
                        },
                      ],
                    },
                  ]}
                />
              </View>

              <View style={styles.sheet}>
                <Text style={styles.sheetLabel}>{t("scanner.source")}</Text>
                <View style={styles.sourceRow}>
                  <Pressable
                    style={[styles.sourceButton, sourceSelected === "device" && styles.sourceButtonActive]}
                    onPress={takePhoto}
                  >
                    <Text
                      style={[
                        styles.sourceButtonText,
                        sourceSelected === "device" && styles.sourceButtonTextActive,
                      ]}
                    >
                      {t("scanner.sourceDevice")}
                    </Text>
                  </Pressable>
                  <Pressable
                    style={[styles.sourceButton, sourceSelected === "gallery" && styles.sourceButtonActive]}
                    onPress={pickFromGallery}
                  >
                    <Text
                      style={[
                        styles.sourceButtonText,
                        sourceSelected === "gallery" && styles.sourceButtonTextActive,
                      ]}
                    >
                      {t("scanner.gallery")}
                    </Text>
                  </Pressable>
                  <Pressable style={[styles.sourceButton, styles.sourceButtonMuted]} onPress={pickPdf}>
                    <Text style={styles.sourceButtonTextMuted}>{t("scanner.sourcePdf")}</Text>
                  </Pressable>
                </View>

                <Text style={[styles.sheetLabel, { marginTop: 18 }]}>{t("scanner.modeLabel")}</Text>
                <View style={styles.modeToggle}>
                  <Pressable
                    style={[styles.modeToggleOption, !multiPageMode && styles.modeToggleOptionActive]}
                    onPress={() => setMultiPageMode(false)}
                  >
                    <Text style={[styles.modeToggleText, !multiPageMode && styles.modeToggleTextActive]}>
                      {t("scanner.singlePage")}
                    </Text>
                  </Pressable>
                  <Pressable
                    style={[styles.modeToggleOption, multiPageMode && styles.modeToggleOptionActive]}
                    onPress={() => setMultiPageMode(true)}
                  >
                    <Text style={[styles.modeToggleText, multiPageMode && styles.modeToggleTextActive]}>
                      {t("scanner.multiplePages")}
                    </Text>
                  </Pressable>
                </View>

                {multiPageMode && scannedTexts.length > 0 && (
                  <View style={styles.pagesContainer}>
                    <Text style={[styles.sheetLabel, { marginTop: 18 }]}>
                      {t("scanner.scannedPages")} ({scannedTexts.length})
                    </Text>
                    <View style={styles.pagesList}>
                      {scannedTexts.map((text, index) => (
                        <View key={index} style={styles.pageCard}>
                          <View style={styles.pageCardHeader}>
                            <Text style={styles.pageCardTitle}>
                              {t("scanner.page")} {index + 1}
                            </Text>
                            <Text style={styles.pageCardPreview} numberOfLines={1}>
                              {text.substring(0, 30)}...
                            </Text>
                          </View>
                          <Pressable style={styles.pageCardRemoveButton} onPress={() => removeScannedText(index)}>
                            <Text style={styles.pageCardRemoveText}>{t("scanner.remove")}</Text>
                          </Pressable>
                        </View>
                      ))}
                    </View>
                    <Pressable style={styles.secondaryDarkButton} onPress={mergeScannedTexts}>
                      <Text style={styles.secondaryDarkButtonText}>{t("scanner.mergePagesButton")}</Text>
                    </Pressable>
                  </View>
                )}

                <Pressable
                  style={[styles.darkButton, { marginTop: 18 }, !imageUri && { opacity: 0.5 }]}
                  onPress={runOcr}
                  disabled={!imageUri}
                >
                  <Text style={styles.darkButtonText}>{t("scanner.analyzeButton")} →</Text>
                </Pressable>
              </View>
            </>
          )}

          {phase === "loading" && (
            <View style={styles.loadingWrap}>
              <View style={styles.stepRow}>
                <View style={[styles.stepIconWrap, styles.stepIconDone]}>
                  <Text style={styles.stepIconTextDone}>✓</Text>
                </View>
                <Text style={[styles.stepText, styles.stepTextDone]}>{t("scanner.stepReadText")}</Text>
              </View>

              <View style={styles.stepRow}>
                <View style={[styles.stepIconWrap, styles.stepIconActive]}>
                  <ActivityIndicator size="small" color={DARK} />
                </View>
                <Text style={[styles.stepText, styles.stepTextActive]}>{t("scanner.stepAddVowels")}</Text>
              </View>

              <View style={[styles.stepRow, { opacity: 0.4 }]}>
                <View style={styles.stepIconWrap}>
                  <Text style={styles.stepIconTextPending}>3</Text>
                </View>
                <Text style={styles.stepText}>{t("scanner.stepExtractVocab")}</Text>
              </View>
            </View>
          )}

          {phase === "result" && (
            <View style={styles.resultWrap}>
              <Text style={styles.resultLabel}>{t("scanner.titleInput")}</Text>
              <TextInput
                value={title}
                onChangeText={setTitle}
                placeholder={t("scanner.titlePlaceholder")}
                placeholderTextColor={MUTED}
                style={styles.titleInput}
              />

              <View style={styles.textCard}>
                <View style={styles.textCardHeader}>
                  <Text style={styles.textCardTitle}>{t("scanner.textDetected")}</Text>
                  <Pressable onPress={() => setEditingText((v) => !v)} hitSlop={8}>
                    <Text style={styles.correctButton}>✏️ {t("scanner.correctButton")}</Text>
                  </Pressable>
                </View>
                {editingText ? (
                  <TextInput
                    value={reviewText}
                    onChangeText={setReviewText}
                    multiline
                    style={styles.textCardEditable}
                  />
                ) : (
                  <Text style={styles.textCardContent}>{reviewText}</Text>
                )}
              </View>

              <Pressable
                style={[styles.reanalyzeLink, diacriticsLoading && { opacity: 0.5 }]}
                onPress={handleAddDiacritics}
                disabled={diacriticsLoading}
              >
                <Text style={styles.reanalyzeLinkText}>
                  {diacriticsLoading ? t("scanner.reanalyzing") : t("scanner.reanalyze")}
                </Text>
              </Pressable>

              {showDiacritics && (
                <View style={styles.vowelsInfo}>
                  <Text style={styles.vowelsInfoText}>{t("scanner.reanalyzeDone")}</Text>
                </View>
              )}

              {vocabPreviewItems.length > 0 && (
                <View style={styles.vocabCard}>
                  <Text style={styles.vocabCardTitle}>{t("scanner.vocabPreview")}</Text>
                  {vocabPreviewItems.map((v, i) => (
                    <View key={i} style={styles.vocabRow}>
                      <Text style={styles.vocabWord}>{v.singulier}</Text>
                      <Text style={styles.vocabTranslation}>{v.traduction}</Text>
                    </View>
                  ))}
                </View>
              )}

              {multiPageMode ? (
                <Pressable style={styles.darkButton} onPress={addScannedText}>
                  <Text style={styles.darkButtonText}>{t("scanner.addThisPage")}</Text>
                </Pressable>
              ) : (
                <Pressable
                  style={[styles.darkButton, !canSave && { opacity: 0.5 }]}
                  onPress={saveScan}
                  disabled={!canSave}
                >
                  <Text style={styles.darkButtonText}>{t("scanner.saveAndOpen")} →</Text>
                </Pressable>
              )}
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: DARK },

  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: DARK,
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  headerLogo: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  headerLogoIcon: { fontSize: 18 },
  headerTitle: { fontSize: 20, fontWeight: "900", color: CREAM },
  headerSubtitle: { fontSize: 12, color: "rgba(255,255,255,0.3)", marginTop: 2 },

  scrollContent: { flexGrow: 1, paddingBottom: 40 },

  freeUserBanner: {
    backgroundColor: "rgba(201,168,76,0.12)",
    padding: 14,
    borderRadius: 12,
    marginHorizontal: 16,
    marginTop: 16,
    borderLeftWidth: 4,
    borderLeftColor: GOLD,
  },
  freeUserText: { fontSize: 14, fontWeight: "700", color: CREAM, textAlign: "center" },
  upgradeLinkButton: { marginTop: 8, paddingVertical: 6, paddingHorizontal: 12, backgroundColor: GOLD, borderRadius: 6, alignSelf: "center" },
  upgradeLinkText: { fontSize: 13, fontWeight: "700", color: DARK },

  scanZone: {
    height: SCAN_ZONE_HEIGHT,
    backgroundColor: ZONE_BG,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(201,168,76,0.2)",
    marginHorizontal: 16,
    marginTop: 16,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    position: "relative",
  },
  scanZoneImage: { width: "100%", height: "100%", resizeMode: "cover" },
  scanZoneEmptyIcon: { fontSize: 34, marginBottom: 8, opacity: 0.35 },
  scanZoneEmptyText: { color: "rgba(248,243,236,0.35)", fontSize: 13 },
  corner: { position: "absolute", width: 22, height: 22, borderColor: GOLD },
  cornerTL: { top: 10, left: 10, borderTopWidth: 2, borderLeftWidth: 2, borderTopLeftRadius: 6 },
  cornerTR: { top: 10, right: 10, borderTopWidth: 2, borderRightWidth: 2, borderTopRightRadius: 6 },
  cornerBL: { bottom: 10, left: 10, borderBottomWidth: 2, borderLeftWidth: 2, borderBottomLeftRadius: 6 },
  cornerBR: { bottom: 10, right: 10, borderBottomWidth: 2, borderRightWidth: 2, borderBottomRightRadius: 6 },
  scanLine: {
    position: "absolute",
    left: 10,
    right: 10,
    height: 2,
    backgroundColor: GOLD,
    opacity: 0.85,
    shadowColor: GOLD,
    shadowOpacity: 0.9,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
  },

  sheet: {
    backgroundColor: CREAM,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    marginTop: 16,
    padding: 18,
    flex: 1,
  },
  sheetLabel: {
    fontSize: 11,
    fontWeight: "800",
    color: MUTED,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 10,
  },

  sourceRow: { flexDirection: "row", gap: 10 },
  sourceButton: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: "transparent",
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  sourceButtonActive: { borderColor: DARK_MEDIUM, backgroundColor: "#f0f7f2" },
  sourceButtonText: { fontSize: 13, fontWeight: "700", color: DARK },
  sourceButtonTextActive: { color: DARK_MEDIUM },
  sourceButtonMuted: { opacity: 0.55 },
  sourceButtonTextMuted: { fontSize: 13, fontWeight: "700", color: MUTED },

  modeToggle: {
    flexDirection: "row",
    backgroundColor: "rgba(0,0,0,0.06)",
    borderRadius: 12,
    padding: 4,
    gap: 4,
  },
  modeToggleOption: { flex: 1, paddingVertical: 10, borderRadius: 9, alignItems: "center" },
  modeToggleOptionActive: { backgroundColor: "#fff" },
  modeToggleText: { fontSize: 13, fontWeight: "700", color: MUTED },
  modeToggleTextActive: { color: DARK },

  pagesContainer: { marginTop: 4 },
  pagesList: { gap: 10 },
  pageCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  pageCardHeader: { flex: 1 },
  pageCardTitle: { fontSize: 14, fontWeight: "700", color: DARK, marginBottom: 4 },
  pageCardPreview: { fontSize: 12, color: MUTED },
  pageCardRemoveButton: { paddingHorizontal: 10, paddingVertical: 6, backgroundColor: "#FEECEA", borderRadius: 8 },
  pageCardRemoveText: { fontSize: 12, fontWeight: "700", color: "#C0392B" },

  secondaryDarkButton: {
    marginTop: 12,
    backgroundColor: "rgba(13,35,24,0.08)",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  secondaryDarkButtonText: { color: DARK, fontWeight: "800", fontSize: 14 },

  darkButton: {
    backgroundColor: DARK,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
  },
  darkButtonText: { color: GOLD, fontSize: 16, fontWeight: "800" },

  loadingWrap: { flex: 1, paddingHorizontal: 24, paddingTop: 60, gap: 24 },
  stepRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  stepIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  stepIconDone: { backgroundColor: GOLD },
  stepIconActive: { backgroundColor: "rgba(201,168,76,0.15)", borderWidth: 1.5, borderColor: GOLD },
  stepIconTextDone: { color: DARK, fontWeight: "900", fontSize: 15 },
  stepIconTextPending: { color: "rgba(255,255,255,0.4)", fontWeight: "700", fontSize: 13 },
  stepText: { fontSize: 15, fontWeight: "600", color: "rgba(255,255,255,0.4)" },
  stepTextDone: { color: GOLD, fontWeight: "700" },
  stepTextActive: { color: CREAM, fontWeight: "700" },

  resultWrap: { padding: 18, gap: 14 },
  resultLabel: {
    fontSize: 11,
    fontWeight: "800",
    color: MUTED,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: -6,
  },
  titleInput: {
    backgroundColor: "#f2f2f2",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: DARK,
    fontSize: 15,
  },

  textCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 14,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
    gap: 10,
  },
  textCardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  textCardTitle: { fontSize: 11, fontWeight: "800", color: MUTED, textTransform: "uppercase", letterSpacing: 0.5 },
  correctButton: { fontSize: 13, fontWeight: "700", color: DARK_MEDIUM },
  textCardContent: { color: "#1a1a1a", lineHeight: 26, fontSize: 16, textAlign: "right", writingDirection: "rtl" },
  textCardEditable: {
    color: "#1a1a1a",
    lineHeight: 26,
    fontSize: 16,
    textAlign: "right",
    writingDirection: "rtl",
    minHeight: 120,
    textAlignVertical: "top",
  },

  reanalyzeLink: { alignSelf: "flex-start" },
  reanalyzeLinkText: { fontSize: 13, fontWeight: "700", color: MUTED, textDecorationLine: "underline" },

  vowelsInfo: { backgroundColor: "#eaf5ec", borderRadius: 12, padding: 12 },
  vowelsInfoText: { color: DARK_MEDIUM, fontWeight: "600", fontSize: 13 },

  vocabCard: { backgroundColor: "#fff", borderRadius: 14, padding: 14, gap: 8 },
  vocabCardTitle: { fontSize: 11, fontWeight: "800", color: MUTED, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 },
  vocabRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  vocabWord: { fontSize: 16, fontWeight: "700", color: DARK, textAlign: "right", writingDirection: "rtl" },
  vocabTranslation: { fontSize: 13, color: MUTED },
});

export default ScannerScreen;
