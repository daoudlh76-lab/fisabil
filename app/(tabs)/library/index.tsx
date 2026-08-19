import { useFocusEffect } from "@react-navigation/native";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
    Alert,
    Modal,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "@/src/lib/supabase";
import { useLanguage } from "@/hooks/use-language";
import { useAudioPlaylistContext } from "@/contexts/audio-playlist-context";
import { getLocalScans, saveLocalScans, getLocalFolders, saveLocalFolders, getLocalVocab } from "@/src/lib/local-cache";

function formatRelativeDate(dateStr: string, t: (path: string, vars?: Record<string, string | number>) => string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((startOfDay(now) - startOfDay(date)) / 86400000);

  if (diffDays <= 0) return t('library.dateToday');
  if (diffDays === 1) return t('library.dateYesterday');
  return t('library.dateDaysAgo', { count: diffDays });
}

type Scan = {
  id: string;
  title: string;
  content: string;
  created_at: string;
  folder_id: string | null;
};

type Folder = {
  id: string;
  name: string;
  color: string;
  icon: string;
};

export default function LibraryScreen() {
  const { t, language } = useLanguage();
  const router = useRouter();
  const { playlist } = useAudioPlaylistContext();
  const insets = useSafeAreaInsets();

  const [scans, setScans] = useState<Scan[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [query, setQuery] = useState("");
  const [showNewFolderModal, setShowNewFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [newFolderIcon, setNewFolderIcon] = useState("📁");
  const [wordCounts, setWordCounts] = useState<Record<string, number>>({});

  const loadFolders = useCallback(async () => {
    // Charger d'abord depuis le cache local (affichage instantané)
    const cached = await getLocalFolders();
    if (cached.length > 0) {
      setFolders(cached);
    }

    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user?.id;
    if (!userId) return;

    const { data, error } = await supabase
      .from("folders")
      .select("id, name, color, icon")
      .eq("user_id", userId)
      .order("name", { ascending: true });

    if (!error && data) {
      const foldersData = data as Folder[];
      setFolders(foldersData);
      saveLocalFolders(foldersData);
    }
  }, []);

  const loadScans = useCallback(async () => {
    // Charger d'abord depuis le cache local (affichage instantané)
    const cached = await getLocalScans();
    if (cached.length > 0) {
      setScans(cached);
    }

    const { data: sessionData, error: sErr } = await supabase.auth.getSession();
    if (sErr) {
      Alert.alert(t('library.error'), sErr.message);
      return;
    }

    const userId = sessionData.session?.user?.id;
    if (!userId) {
      Alert.alert(t('auth.title'), t('scanner.loginRequired'));
      router.replace("/login");
      return;
    }

    const { data, error } = await supabase
      .from("scans")
      .select("id,title,content,created_at,folder_id")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) {
      Alert.alert(t('library.error'), error.message);
      return;
    }

    const scansData = (data ?? []) as Scan[];
    __DEV__ && console.log(`📚 ${scansData.length} textes chargés depuis la DB`);
    __DEV__ && console.log('📁 Répartition:', {
      withFolder: scansData.filter(s => s.folder_id !== null).length,
      withoutFolder: scansData.filter(s => s.folder_id === null).length
    });
    setScans(scansData);
    saveLocalScans(scansData);
  }, [router, t]);

  useEffect(() => {
    let cancelled = false;

    async function loadWordCounts() {
      const entries = await Promise.all(
        scans.map(async (s) => {
          const vocab = await getLocalVocab(s.id, language);
          const count = vocab?.vocabulaire?.filter((v: any) => !v._deleted)?.length ?? null;
          return [s.id, count] as const;
        })
      );
      if (cancelled) return;
      const map: Record<string, number> = {};
      for (const [id, count] of entries) {
        if (count) map[id] = count;
      }
      setWordCounts(map);
    }

    if (scans.length > 0) loadWordCounts();

    return () => {
      cancelled = true;
    };
  }, [scans, language]);

  const deleteFolder = useCallback(async (folderId: string, folderName: string) => {
    Alert.alert(
      t('library.deleteFolder'),
      t('library.deleteFolderConfirm', { name: folderName }),
      [
        {
          text: t('common.cancel'),
          style: 'cancel',
        },
        {
          text: t('common.confirm'),
          style: 'destructive',
          onPress: async () => {
            const { data: sessionData } = await supabase.auth.getSession();
            const userId = sessionData.session?.user?.id;
            if (!userId) return;

            // Réinitialiser folder_id pour tous les scans de ce dossier
            await supabase
              .from('scans')
              .update({ folder_id: null })
              .eq('user_id', userId)
              .eq('folder_id', folderId);

            // Supprimer le dossier
            const { error } = await supabase
              .from('folders')
              .delete()
              .eq('id', folderId)
              .eq('user_id', userId);

            if (error) {
              Alert.alert(t('library.error'), error.message);
              return;
            }

            Alert.alert(t('library.success'), t('library.folderDeleted'));
            await loadFolders();
            await loadScans();
          },
        },
      ]
    );
  }, [t, loadFolders, loadScans]);

  const createFolder = useCallback(async () => {
    if (!newFolderName.trim()) {
      Alert.alert(t('library.error'), t('library.folderNameRequired'));
      return;
    }

    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user?.id;
    if (!userId) return;

    const { error } = await supabase
      .from("folders")
      .insert({
        user_id: userId,
        name: newFolderName.trim(),
        icon: newFolderIcon,
        color: '#2E7D32'
      });

    if (error) {
      Alert.alert(t('library.error'), error.message);
      return;
    }

    setNewFolderName("");
    setNewFolderIcon("📁");
    setShowNewFolderModal(false);
    loadFolders();
  }, [newFolderName, newFolderIcon, loadFolders, t]);

  // ✅ Recharge quand tu reviens sur l'écran
  useFocusEffect(
    useCallback(() => {
      __DEV__ && console.log('📚 Rechargement de la bibliothèque...');
      loadFolders();
      loadScans();
    }, [loadFolders, loadScans])
  );

  // Textes non classés (sans folder_id)
  const unclassifiedScans = useMemo(() => {
    const q = query.trim().toLowerCase();
    const unclassified = scans.filter((s) => s.folder_id === null);

    if (!q) return unclassified;

    return unclassified.filter((s) => {
      const t = (s.title ?? "").toLowerCase();
      const c = (s.content ?? "").toLowerCase();
      return t.includes(q) || c.includes(q);
    });
  }, [query, scans]);

  // Compter les textes par dossier
  const getFolderCount = useCallback((folderId: string) => {
    return scans.filter((s) => s.folder_id === folderId).length;
  }, [scans]);

  // Obtenir les textes d'un dossier
  const getFolderScans = useCallback((folderId: string) => {
    const q = query.trim().toLowerCase();
    const folderScans = scans.filter((s) => s.folder_id === folderId);

    if (!q) return folderScans;

    return folderScans.filter((s) => {
      const t = (s.title ?? "").toLowerCase();
      const c = (s.content ?? "").toLowerCase();
      return t.includes(q) || c.includes(q);
    });
  }, [query, scans]);

  const EMOJI_OPTIONS = ["📁", "📖", "📚", "🕌", "☪️", "📿", "✨", "🌙", "⭐", "💚"];

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <View style={styles.headerTopRow}>
          <Text style={styles.title}>{t('library.title')}</Text>
          <Pressable
            style={styles.addFolderCircle}
            onPress={() => setShowNewFolderModal(true)}
            hitSlop={8}
          >
            <Text style={styles.addFolderCircleIcon}>+</Text>
          </Pressable>
        </View>

        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={t('library.search')}
          placeholderTextColor="rgba(248,243,236,0.5)"
          style={styles.search}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      <ScrollView style={styles.scrollContainer} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
      <View>
        {/* Dossiers créés par l'apprenant */}
        {folders.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('library.myFolders')}</Text>
            {folders.map((folder) => {
              const folderScans = getFolderScans(folder.id);
              if (query.trim() && folderScans.length === 0) return null;

              return (
                <View key={folder.id} style={styles.folderCardContainer}>
                  <Pressable
                    style={styles.folderCard}
                    onPress={() => router.push(`/library/folder/${folder.id}`)}
                  >
                    <Text style={styles.folderIcon}>{folder.icon}</Text>
                    <Text style={styles.folderName}>{folder.name}</Text>
                    <Text style={styles.folderCount}>({getFolderCount(folder.id)})</Text>
                    <Text style={styles.folderArrow}>›</Text>
                  </Pressable>
                  <Pressable
                    style={styles.deleteFolderButton}
                    onPress={() => deleteFolder(folder.id, folder.name)}
                  >
                    <Text style={styles.deleteFolderText}>🗑️</Text>
                  </Pressable>
                </View>
              );
            })}
          </View>
        )}

        {/* Textes non classés */}
        {unclassifiedScans.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('library.unclassified')}</Text>
            {unclassifiedScans.map((item) => {
              const wordCount = wordCounts[item.id];
              const hasAudio = playlist.tracks.some((tr) => tr.scanId === item.id);
              return (
                <Pressable
                  key={item.id}
                  style={styles.card}
                  onPress={() => router.push(`/library/${item.id}`)}
                >
                  <Text style={styles.cardTitle}>{item.title}</Text>
                  <View style={styles.cardMetaRow}>
                    {wordCount ? (
                      <>
                        <Text style={styles.cardMetaText}>{wordCount} {t('library.wordsCount')}</Text>
                        <Text style={styles.cardMetaDot}>·</Text>
                      </>
                    ) : null}
                    <Text style={styles.cardMetaText}>{formatRelativeDate(item.created_at, t)}</Text>
                    {hasAudio && (
                      <>
                        <Text style={styles.cardMetaDot}>·</Text>
                        <Text style={styles.cardMetaBadge}>{t('library.audioBadge')}</Text>
                      </>
                    )}
                  </View>
                  <Text numberOfLines={2} style={styles.preview}>
                    {item.content}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}

        {/* Message si aucun résultat */}
        {unclassifiedScans.length === 0 && folders.every(f => getFolderScans(f.id).length === 0) && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>
              {query.trim() ? t('library.noResults') : t('library.noTexts')}
            </Text>
          </View>
        )}
      </View>
      </ScrollView>

      {/* Modal de création de dossier */}
      <Modal
        visible={showNewFolderModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowNewFolderModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{t('library.createFolder')}</Text>

            <Text style={styles.label}>{t('library.folderName')}</Text>
            <TextInput
              value={newFolderName}
              onChangeText={setNewFolderName}
              placeholder={t('library.folderNamePlaceholder')}
              style={styles.input}
              autoFocus
            />

            <Text style={styles.label}>{t('library.folderIcon')}</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.emojiScroll}
            >
              {EMOJI_OPTIONS.map((emoji) => (
                <TouchableOpacity
                  key={emoji}
                  style={[
                    styles.emojiBtn,
                    newFolderIcon === emoji && styles.emojiBtnSelected
                  ]}
                  onPress={() => setNewFolderIcon(emoji)}
                >
                  <Text style={styles.emojiText}>{emoji}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => {
                  setShowNewFolderModal(false);
                  setNewFolderName("");
                  setNewFolderIcon("📁");
                }}
              >
                <Text style={styles.cancelBtnText}>{t('libraryDetail.cancel')}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.createBtn}
                onPress={createFolder}
              >
                <Text style={styles.createBtnText}>{t('library.createFolder')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8F3EC" },
  scrollContainer: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 120 },
  header: {
    backgroundColor: "#0D2318",
    paddingTop: 12,
    paddingBottom: 16,
    paddingHorizontal: 16,
    gap: 12,
  },
  headerTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  title: { fontSize: 22, fontWeight: "900", color: "#F8F3EC" },
  addFolderCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#C9A84C",
    justifyContent: "center",
    alignItems: "center",
  },
  addFolderCircleIcon: {
    fontSize: 22,
    fontWeight: "900",
    color: "#0D2318",
    lineHeight: 24,
  },
  foldersScroll: { marginBottom: 12 },
  foldersContainer: { paddingRight: 16 },
  folderChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F5F5F5",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8,
    borderWidth: 2,
    borderColor: "transparent",
  },
  folderChipSelected: {
    backgroundColor: "#E8F5E9",
    borderColor: "#2E7D32",
  },
  folderIcon: { fontSize: 18, marginRight: 6 },
  folderName: { fontSize: 14, fontWeight: "600", color: "#333" },
  search: {
    backgroundColor: "rgba(255,255,255,0.12)",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    color: "#F8F3EC",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
  },
  count: { marginBottom: 10, color: "#666" },
  card: {
    backgroundColor: "white",
    padding: 14,
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 1,
  },
  cardTitle: { fontSize: 16, fontWeight: "bold", marginBottom: 4, color: "#1a1a1a" },
  cardMetaRow: { flexDirection: "row", alignItems: "center", marginBottom: 6 },
  cardMetaText: { fontSize: 12, color: "#8A8A8A" },
  cardMetaDot: { fontSize: 12, color: "#8A8A8A", marginHorizontal: 6 },
  cardMetaBadge: { fontSize: 12, color: "#2E7D32", fontWeight: "700" },
  preview: { color: "#8A8A8A", textAlign: "right", writingDirection: "rtl" },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    backgroundColor: "white",
    borderRadius: 16,
    padding: 24,
    width: "85%",
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 20,
    textAlign: "center",
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
    marginBottom: 8,
    marginTop: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: "#F9FAFB",
  },
  emojiScroll: {
    marginTop: 8,
    marginBottom: 12,
  },
  emojiBtn: {
    width: 50,
    height: 50,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 25,
    backgroundColor: "#F5F5F5",
    marginRight: 8,
    borderWidth: 2,
    borderColor: "transparent",
  },
  emojiBtnSelected: {
    backgroundColor: "#E8F5E9",
    borderColor: "#2E7D32",
  },
  emojiText: {
    fontSize: 24,
  },
  modalButtons: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 24,
    gap: 12,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: "#F5F5F5",
    alignItems: "center",
  },
  cancelBtnText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#666",
  },
  createBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: "#2E7D32",
    alignItems: "center",
  },
  createBtnText: {
    fontSize: 16,
    fontWeight: "600",
    color: "white",
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: "800",
    color: "#8A8A8A",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 12,
    marginTop: 8,
  },
  folderSection: {
    marginBottom: 16,
  },
  folderCardContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
    gap: 4,
  },
  folderCard: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "white",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 1,
  },
  folderHeader: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F5F5F5",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    marginBottom: 8,
  },
  folderCount: {
    fontSize: 14,
    color: "#8A8A8A",
    marginLeft: 8,
  },
  folderArrow: {
    fontSize: 20,
    color: "#8A8A8A",
    marginLeft: "auto",
    paddingLeft: 8,
  },
  deleteFolderButton: {
    paddingHorizontal: 10,
    paddingVertical: 10,
    justifyContent: "center",
    alignItems: "center",
    opacity: 0.5,
  },
  deleteFolderText: {
    fontSize: 16,
  },
  emptyState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 16,
    color: "#999",
    textAlign: "center",
  },
});