import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import React, { useMemo, useState } from "react";
import { Alert, ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { supabase } from "@/src/lib/supabase";
import { useDiacritics as useOldDiacritics } from "@/hooks/use-diacritics";
import { useDiacritics } from "@/hooks/use-diacritics-local";
import { useAudioPlaylistContext } from "@/contexts/audio-playlist-context";
import { useTextToSpeech } from "@/hooks/use-text-to-speech";
import { useLanguage } from "@/hooks/use-language";
import { useSubscription } from "@/contexts/subscription-context";
import { useDailyLimit } from "@/hooks/use-daily-limit";
import { performOcrWithFallback, isOcrConfigured } from "@/src/lib/google-vision-ocr";

const GREEN = "#2E7D32";
const BG = "transparent";

export default function ScannerScreen() {
  const { t } = useLanguage();
  const { subscription, hasFeatureAccess, isLoaded } = useSubscription();
  const scannerLimitRaw = useDailyLimit('scanner', 1);

  // Debug: Afficher le plan actuel
  React.useEffect(() => {
    console.log('📊 Plan actuel dans Scanner:', subscription.plan);
    console.log('📊 Subscription complète:', JSON.stringify(subscription, null, 2));
    console.log('📊 isLoaded:', isLoaded);
  }, [subscription.plan, isLoaded]);

  // Ignorer la limite pour les utilisateurs premium
  // IMPORTANT: Recalculer scannerLimit chaque fois que le plan change
  const scannerLimit = React.useMemo(() => {
    console.log('🔄 Recalcul de scannerLimit:', {
      isLoaded,
      plan: subscription.plan,
      hasRawLimit: !!scannerLimitRaw,
    });

    // Ne pas appliquer les limites tant que l'abonnement n'est pas chargé
    if (!isLoaded) {
      console.log('⏳ Abonnement pas encore chargé');
      return null;
    }

    // Les utilisateurs premium n'ont pas de limite
    if (subscription.plan === 'premium_monthly' || subscription.plan === 'premium_annual') {
      console.log('✨ Mode premium détecté, aucune limite');
      return null;
    }

    // Les utilisateurs gratuits ont des limites
    console.log('📊 Mode gratuit, limites appliquées');
    return scannerLimitRaw;
  }, [isLoaded, subscription.plan, scannerLimitRaw]);

  const [title, setTitle] = useState("");
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [ocrText, setOcrText] = useState("");
  const [reviewText, setReviewText] = useState("");
  const { addDiacritics: addDiacriticsOld, loading: diacriticsLoading } = useOldDiacritics();
  const { addDiacriticsToText } = useDiacritics();
  const [showDiacritics, setShowDiacritics] = useState(false);
  const [scannedTexts, setScannedTexts] = useState<string[]>([]);
  const [multiPageMode, setMultiPageMode] = useState(false);
  const { addTrack } = useAudioPlaylistContext();
  const { speakText, isSpeaking } = useTextToSpeech();
  const [ocrLoading, setOcrLoading] = useState(false);

  const canSave = useMemo(() => {
    return title.trim().length > 0 && reviewText.trim().length > 0;
  }, [title, reviewText]);

  async function pickFromGallery() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(t('scanner.permissionDenied'), t('scanner.galleryPermission'));
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 1,
    });
    if (result.canceled) return;
    const uri = result.assets?.[0]?.uri;
    if (!uri) return;
    setImageUri(uri);
    setOcrText("");
    setReviewText("");
  }

  async function takePhoto() {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(t('scanner.permissionDenied'), t('scanner.cameraPermission'));
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      quality: 1,
    });
    if (result.canceled) return;
    const uri = result.assets?.[0]?.uri;
    if (!uri) return;
    setImageUri(uri);
    setOcrText("");
    setReviewText("");
  }

  async function runOcr() {
    if (!imageUri) {
      Alert.alert(t('scanner.missingImage'), t('scanner.chooseImage'));
      return;
    }

    // Vérifier la limite quotidienne pour les utilisateurs gratuits
    // Les utilisateurs premium n'ont pas de limite (scannerLimit === null)
    if (isLoaded && subscription.plan === 'free' && scannerLimit) {
      if (!scannerLimit.canUse) {
        Alert.alert(
          t('scanner.limitReached'),
          t('scanner.limitReachedMessage', { limit: scannerLimit.limit }),
          [
            { text: t('settings.cancel'), style: 'cancel' },
            {
              text: t('settings.upgradeToPremium'),
              onPress: () => router.push('/(tabs)/settings'),
            },
          ]
        );
        return;
      }
    }

    setOcrLoading(true);

    try {
      // Vérifier si l'API est configurée
      if (!isOcrConfigured()) {
        // Fallback vers mock si pas de clé API
        console.warn('⚠️ Google Cloud Vision API non configurée, utilisation du mode démo');
        const mockText = "الحمد لله رب العالمين مرحبا بك في التطبيق";
        setOcrText(mockText);

        // Vérifier si le texte mock contient déjà des diacritiques
        const hasDiacritics = /[\u064B-\u0652]/.test(mockText);
        let finalText = mockText;
        if (!hasDiacritics) {
          finalText = addDiacriticsToText(mockText);
          setShowDiacritics(true);
        } else {
          setShowDiacritics(false);
          console.log('✅ Texte avec voyelles détecté, conservation des voyelles d\'origine');
        }

        setReviewText(finalText);
        await convertAndAddToPlaylist(finalText);

        // Incrémenter le compteur de scans pour les utilisateurs gratuits seulement
        if (isLoaded && subscription.plan === 'free' && scannerLimit) {
          await scannerLimit.incrementUsage();
        }

        if (multiPageMode) {
          Alert.alert(`✅ ${t('scanner.extractionOk')}`, t('scanner.textAdded'));
        } else {
          Alert.alert(`✅ ${t('scanner.extractionOk')}`, hasDiacritics ? t('scanner.textExtracted') : t('scanner.vowelsAdded'));
        }
        return;
      }

      // Effectuer l'OCR avec fallback automatique (Google Vision → OpenAI)
      const result = await performOcrWithFallback(imageUri);

      if (result.error) {
        if (result.error === 'NO_TEXT_DETECTED') {
          Alert.alert(t('scanner.error'), t('scanner.noTextDetected'));
        } else if (result.error === 'CONTENT_POLICY_VIOLATION') {
          Alert.alert(
            t('scanner.error'),
            "L'image n'a pas pu être traitée par OpenAI. Veuillez configurer Google Cloud Vision API pour résoudre ce problème, ou essayer une autre image."
          );
        } else if (result.error === 'NO_API_CONFIGURED') {
          Alert.alert(
            t('scanner.error'),
            "Aucune API OCR n'est configurée. Veuillez configurer Google Cloud Vision API ou OpenAI Vision dans les variables d'environnement."
          );
        } else {
          Alert.alert(t('scanner.error'), `OCR Error: ${result.error}`);
        }
        return;
      }

      if (!result.text.trim()) {
        Alert.alert(t('scanner.error'), t('scanner.noTextDetected'));
        return;
      }

      setOcrText(result.text);

      // Vérifier si le texte contient déjà des diacritiques (voyelles arabes)
      const hasDiacritics = /[\u064B-\u0652]/.test(result.text);

      let finalText = result.text;
      if (!hasDiacritics) {
        // Ajouter les diacritiques uniquement si le texte n'en a pas
        finalText = addDiacriticsToText(result.text);
        setShowDiacritics(true);
      } else {
        // Le texte a déjà des voyelles, les garder telles quelles
        setShowDiacritics(false);
        console.log('✅ Texte avec voyelles détecté, conservation des voyelles d\'origine');
      }

      setReviewText(finalText);

      // Convertir automatiquement en audio et ajouter à la playlist
      await convertAndAddToPlaylist(finalText);

      // Incrémenter le compteur de scans pour les utilisateurs gratuits seulement
      if (isLoaded && subscription.plan === 'free' && scannerLimit) {
        await scannerLimit.incrementUsage();
      }

      if (multiPageMode) {
        Alert.alert(`✅ ${t('scanner.extractionOk')}`, t('scanner.textAdded'));
      } else {
        Alert.alert(`✅ ${t('scanner.extractionOk')}`, t('scanner.vowelsAdded'));
      }
    } catch (error: any) {
      console.error('Erreur OCR:', error);
      Alert.alert(t('scanner.error'), error.message || 'OCR failed');
    } finally {
      setOcrLoading(false);
    }
  }

  async function convertAndAddToPlaylist(text: string) {
    try {
      // Générer un titre par défaut si pas de titre
      const trackTitle = title.trim() || `Texte du ${new Date().toLocaleDateString()}`;

      console.log('📝 Ajout à la playlist...', { trackTitle, textLength: text.length });

      // Ajouter à la playlist (sans fichier audio, on utilisera speakText pour la lecture)
      const newTrack = await addTrack(trackTitle, text, null);

      console.log('✅ Piste ajoutée à la playlist:', { id: newTrack.id, title: trackTitle });
    } catch (error) {
      console.error('❌ Erreur ajout playlist:', error);
      // Ne pas afficher d'erreur pour ne pas bloquer le workflow
    }
  }

  // Fonction pour lire le texte à voix haute
  async function readTextAloud() {
    if (reviewText.trim()) {
      await speakText(reviewText, 'ar-SA');
    }
  }

  function addScannedText() {
    if (!reviewText.trim()) {
      Alert.alert(t('scanner.error'), t('scanner.doOcr'));
      return;
    }
    setScannedTexts([...scannedTexts, reviewText.trim()]);
    setOcrText("");
    setReviewText("");
    setImageUri(null);
    setShowDiacritics(false);
    Alert.alert(`✅ ${t('scanner.pageAdded')}`, `${scannedTexts.length + 1} ${t('scanner.pagesScanned')}`);
  }

  function mergeScannedTexts() {
    if (scannedTexts.length === 0) {
      Alert.alert(t('scanner.error'), t('scanner.doOcr'));
      return;
    }
    const merged = scannedTexts.join("\n\n");
    setReviewText(merged);
    setScannedTexts([]);
    Alert.alert(`✅ ${t('scanner.mergeOk')}`, t('scanner.textsMerged'));
  }

  function removeScannedText(index: number) {
    setScannedTexts(scannedTexts.filter((_, i) => i !== index));
  }

  async function handleAddDiacritics() {
    if (!reviewText.trim()) {
      Alert.alert(t('scanner.error'), t('scanner.reviewEmpty'));
      return;
    }
    const result = addDiacriticsToText(reviewText);
    if (result) {
      setReviewText(result);
      setShowDiacritics(true);
      Alert.alert(`✅ ${t('scanner.vowelsAddedSuccess')}`, t('scanner.vowelsAddedText'));
    } else {
      Alert.alert(t('scanner.error'), t('scanner.saveError'));
    }
  }

  async function saveScan() {
    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;

      const userId = sessionData.session?.user?.id;
      if (!userId) {
        Alert.alert(t('scanner.notConnected'), t('scanner.loginRequired'));
        router.push("/(auth)/login");
        return;
      }

      const titleTrimmed = title.trim();
      const c = reviewText.trim();

      if (!titleTrimmed) {
        Alert.alert(t('scanner.missingTitle'), t('scanner.writeTitle'));
        return;
      }
      if (!c) {
        Alert.alert(t('scanner.emptyText'), t('scanner.doOcr'));
        return;
      }

      // La piste a déjà été ajoutée à la playlist lors de l'OCR (ligne 88/123)
      // Pas besoin de l'ajouter à nouveau ici pour éviter les doublons

      const { error } = await supabase.from("scans").insert([
        {
          user_id: userId,
          title: titleTrimmed,
          content: c,
        },
      ]);

      if (error) throw error;

      Alert.alert(t('scanner.saved'), t('scanner.savedSuccess'));
      setTitle("");
      setImageUri(null);
      setOcrText("");
      setReviewText("");
    } catch (e: any) {
      console.log("SAVE ERROR:", e);
      Alert.alert(t('scanner.error'), e?.message ?? t('scanner.saveError'));
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.header}>{t('scanner.title')}</Text>

      {/* Afficher le compteur de scans pour les utilisateurs gratuits seulement */}
      {isLoaded && subscription.plan === 'free' && scannerLimit && !scannerLimit.loading && (
        <View style={scannerLimit.canUse ? styles.limitBanner : styles.limitBannerWarning}>
          <Text style={styles.limitBannerText}>
            {scannerLimit.canUse
              ? t('scanner.scansRemaining', { remaining: scannerLimit.remaining, limit: scannerLimit.limit })
              : t('scanner.noScansLeft')}
          </Text>
          {!scannerLimit.canUse && (
            <Pressable
              style={styles.upgradeLinkButton}
              onPress={() => router.push('/(tabs)/settings')}
            >
              <Text style={styles.upgradeLinkText}>{t('settings.upgradeToPremium')}</Text>
            </Pressable>
          )}
        </View>
      )}

      <Text style={styles.label}>{t('scanner.titleInput')}</Text>
      <TextInput
        value={title}
        onChangeText={setTitle}
        placeholder={t('scanner.titlePlaceholder')}
        style={styles.input}
      />

      <Text style={[styles.label, { marginTop: 16 }]}>{t('scanner.scanMode')}</Text>
      <View style={styles.modeSelector}>
        <Pressable
          style={[styles.modeButton, !multiPageMode && styles.modeButtonActive]}
          onPress={() => setMultiPageMode(false)}
        >
          <Text style={[styles.modeButtonText, !multiPageMode && styles.modeButtonTextActive]}>📄 {t('scanner.singlePage')}</Text>
        </Pressable>
        <Pressable
          style={[styles.modeButton, multiPageMode && styles.modeButtonActive]}
          onPress={() => setMultiPageMode(true)}
        >
          <Text style={[styles.modeButtonText, multiPageMode && styles.modeButtonTextActive]}>📚 {t('scanner.multiplePages')}</Text>
        </Pressable>
      </View>

      <Text style={[styles.label, { marginTop: 16 }]}>{t('scanner.import')}</Text>

      <View style={styles.buttonRow}>
        <Pressable style={styles.boxButton} onPress={takePhoto}>
          <Text style={styles.boxIcon}>📷</Text>
          <Text style={styles.boxText}>{t('scanner.photo')}</Text>
        </Pressable>

        <Pressable style={styles.boxButton} onPress={pickFromGallery}>
          <Text style={styles.boxIcon}>🖼️</Text>
          <Text style={styles.boxText}>{t('scanner.gallery')}</Text>
        </Pressable>
      </View>

      <Text style={[styles.label, { marginTop: 16 }]}>{t('scanner.preview')}</Text>
      <View style={styles.preview}>
        {imageUri ? (
          <Image source={{ uri: imageUri }} style={styles.previewImg} />
        ) : (
          <Text style={styles.previewEmpty}>{t('scanner.previewEmpty')}</Text>
        )}
      </View>

      <Pressable 
        style={[styles.primaryButton, ocrLoading && { opacity: 0.7 }]} 
        onPress={runOcr}
        disabled={ocrLoading}
      >
        {ocrLoading ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <ActivityIndicator color="white" size="small" />
            <Text style={styles.primaryButtonText}>{t('scanner.ocrLoading')}</Text>
          </View>
        ) : (
          <Text style={styles.primaryButtonText}>{t('scanner.ocr')}</Text>
        )}
      </Pressable>

      {multiPageMode && scannedTexts.length > 0 && (
        <View style={styles.pagesContainer}>
          <Text style={[styles.label, { marginTop: 16 }]}>{t('scanner.scannedPages')} ({scannedTexts.length})</Text>
          <View style={styles.pagesList}>
            {scannedTexts.map((text, index) => (
              <View key={index} style={styles.pageCard}>
                <View style={styles.pageCardHeader}>
                  <Text style={styles.pageCardTitle}>📄 {t('scanner.page')} {index + 1}</Text>
                  <Text style={styles.pageCardPreview} numberOfLines={1}>
                    {text.substring(0, 30)}...
                  </Text>
                </View>
                <Pressable
                  style={styles.pageCardRemoveButton}
                  onPress={() => removeScannedText(index)}
                >
                  <Text style={styles.pageCardRemoveText}>❌ {t('scanner.remove')}</Text>
                </Pressable>
              </View>
            ))}
          </View>
          <Pressable style={styles.mergeButton} onPress={mergeScannedTexts}>
            <Text style={styles.mergeButtonText}>🔗 {t('scanner.mergePagesButton')}</Text>
          </Pressable>
        </View>
      )}

      {multiPageMode && (
        <Pressable style={styles.addButton} onPress={addScannedText}>
          <Text style={styles.addButtonText}>➕ {t('scanner.addThisPage')}</Text>
        </Pressable>
      )}

      <Text style={[styles.label, { marginTop: 16 }]}>{t('scanner.textDetected')}</Text>
      <View style={styles.card}>
        <Text style={styles.smallOk}>
          {ocrText ? t('scanner.ocrOk') : t('scanner.ocrEmpty')}
        </Text>
        {ocrText ? <Text style={styles.detected}>{ocrText}</Text> : null}
      </View>

      <Text style={[styles.label, { marginTop: 16 }]}>{t('scanner.review')}</Text>
      <TextInput
        value={reviewText}
        onChangeText={setReviewText}
        placeholder={t('scanner.reviewPlaceholder')}
        multiline
        style={styles.textarea}
      />

      <Pressable
        style={[styles.addVowelsButton, diacriticsLoading && { opacity: 0.5 }]}
        onPress={handleAddDiacritics}
        disabled={diacriticsLoading}
      >
        <Text style={styles.addVowelsButtonText}>
          {diacriticsLoading ? t('scanner.reanalyzing') : t('scanner.reanalyze')}
        </Text>
      </Pressable>

      {showDiacritics && (
        <View style={styles.vowelsInfo}>
          <Text style={styles.vowelsInfoText}>{t('scanner.reanalyzeDone')}</Text>
        </View>
      )}

      {showDiacritics && (
        <View style={styles.audioAddedInfo}>
          <Text style={styles.audioAddedText}>🎵 {t('playlist.trackAdded')}</Text>
        </View>
      )}

      <Pressable
        style={[styles.saveButton, !canSave && { opacity: 0.5 }]}
        onPress={saveScan}
        disabled={!canSave}
      >
        <Text style={styles.saveButtonText}>{t('scanner.save')}</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 18,
    paddingBottom: 40,
    backgroundColor: BG,
  },
  header: {
    fontSize: 22,
    fontWeight: "800",
    textAlign: "center",
    marginBottom: 14,
  },
  limitBanner: {
    backgroundColor: '#E8F5E9',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: GREEN,
  },
  limitBannerWarning: {
    backgroundColor: '#FFF3E0',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#FF9800',
  },
  limitBannerText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    textAlign: 'center',
  },
  upgradeLinkButton: {
    marginTop: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: GREEN,
    borderRadius: 6,
    alignSelf: 'center',
  },
  upgradeLinkText: {
    fontSize: 13,
    fontWeight: '600',
    color: 'white',
  },
  label: {
    fontSize: 14,
    fontWeight: "700",
    color: GREEN,
    marginBottom: 8,
  },
  input: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  buttonRow: {
    flexDirection: "row",
    gap: 12,
  },
  boxButton: {
    flex: 1,
    backgroundColor: "#EAF4EA",
    borderWidth: 2,
    borderColor: GREEN,
    borderStyle: "dashed",
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  boxIcon: {
    fontSize: 18,
    marginBottom: 6,
  },
  boxText: {
    fontSize: 16,
    fontWeight: "700",
    color: GREEN,
  },
  preview: {
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    height: 220,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  previewImg: {
    width: "100%",
    height: "100%",
    resizeMode: "cover",
  },
  previewEmpty: {
    color: "#6B7280",
  },
  primaryButton: {
    marginTop: 14,
    backgroundColor: GREEN,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
  },
  primaryButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "800",
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  smallOk: {
    color: "#111827",
    marginBottom: 8,
    fontWeight: "600",
  },
  detected: {
    color: "#111827",
    lineHeight: 20,
  },
  textarea: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 14,
    padding: 14,
    minHeight: 150,
    textAlignVertical: "top",
  },
  addVowelsButton: {
    marginTop: 14,
    backgroundColor: "#6366f1",
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
  },
  addVowelsButtonText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 14,
  },
  vowelsInfo: {
    backgroundColor: "#d4edda",
    borderWidth: 1,
    borderColor: "#c3e6cb",
    borderRadius: 12,
    padding: 12,
    marginTop: 10,
  },
  vowelsInfoText: {
    color: "#155724",
    fontWeight: "600",
    fontSize: 14,
  },
  audioConversionInfo: {
    backgroundColor: "#fff3cd",
    borderWidth: 1,
    borderColor: "#ffc107",
    borderRadius: 12,
    padding: 12,
    marginTop: 10,
  },
  audioConversionText: {
    color: "#856404",
    fontWeight: "600",
    fontSize: 14,
  },
  audioAddedInfo: {
    backgroundColor: "#d1ecf1",
    borderWidth: 1,
    borderColor: "#bee5eb",
    borderRadius: 12,
    padding: 12,
    marginTop: 10,
  },
  audioAddedText: {
    color: "#0c5460",
    fontWeight: "600",
    fontSize: 14,
  },
  saveButton: {
    marginTop: 16,
    backgroundColor: GREEN,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
  },
  saveButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "900",
  },
  modeSelector: {
    flexDirection: "row",
    gap: 10,
  },
  modeButton: {
    flex: 1,
    backgroundColor: "#E5E7EB",
    borderWidth: 2,
    borderColor: "#D1D5DB",
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  modeButtonActive: {
    backgroundColor: GREEN,
    borderColor: GREEN,
  },
  modeButtonText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#6B7280",
  },
  modeButtonTextActive: {
    color: "#fff",
  },
  pagesContainer: {
    marginTop: 16,
  },
  pagesList: {
    gap: 10,
  },
  pageCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  pageCardHeader: {
    flex: 1,
  },
  pageCardTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: GREEN,
    marginBottom: 4,
  },
  pageCardPreview: {
    fontSize: 12,
    color: "#6B7280",
  },
  pageCardRemoveButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "#FEE2E2",
    borderRadius: 8,
  },
  pageCardRemoveText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#DC2626",
  },
  mergeButton: {
    marginTop: 12,
    backgroundColor: "#3B82F6",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  mergeButtonText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 14,
  },
  addButton: {
    marginTop: 14,
    backgroundColor: "#8B5CF6",
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
  },
  addButtonText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 14,
  },
});
