import { useFocusEffect } from "@react-navigation/native";
import { useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
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
import { supabase } from "@/src/lib/supabase";
import { useLanguage } from "@/hooks/use-language";

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
  const { t } = useLanguage();
  const router = useRouter();

  const [scans, setScans] = useState<Scan[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [query, setQuery] = useState("");
  const [showNewFolderModal, setShowNewFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [newFolderIcon, setNewFolderIcon] = useState("📁");

  const loadFolders = useCallback(async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user?.id;
    if (!userId) return;

    const { data, error } = await supabase
      .from("folders")
      .select("id, name, color, icon")
      .eq("user_id", userId)
      .order("name", { ascending: true });

    if (!error && data) {
      setFolders(data as Folder[]);
    }
  }, []);

  const loadScans = useCallback(async () => {
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
    console.log(`📚 ${scansData.length} textes chargés depuis la DB`);
    console.log('📁 Répartition:', {
      withFolder: scansData.filter(s => s.folder_id !== null).length,
      withoutFolder: scansData.filter(s => s.folder_id === null).length
    });
    setScans(scansData);
  }, [router, t]);

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
      console.log('📚 Rechargement de la bibliothèque...');
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
      <ScrollView style={styles.scrollContainer} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
      <View style={styles.header}>
        <Text style={styles.title}>{t('library.title')}</Text>
        <TouchableOpacity
          style={styles.addFolderBtn}
          onPress={() => setShowNewFolderModal(true)}
        >
          <Text style={styles.addFolderText}>+ {t('library.newFolder')}</Text>
        </TouchableOpacity>
      </View>

      {/* Barre de recherche */}
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder={t('library.search')}
        style={styles.search}
        autoCapitalize="none"
        autoCorrect={false}
      />

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
            {unclassifiedScans.map((item) => (
              <Pressable
                key={item.id}
                style={styles.card}
                onPress={() => router.push(`/library/${item.id}`)}
              >
                <Text style={styles.cardTitle}>{item.title}</Text>
                <Text numberOfLines={2} style={styles.preview}>
                  {item.content}
                </Text>
              </Pressable>
            ))}
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
  container: { flex: 1, backgroundColor: "transparent" },
  scrollContainer: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 120 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  title: { fontSize: 22, fontWeight: "bold" },
  addFolderBtn: {
    backgroundColor: "#2E7D32",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  addFolderText: { color: "white", fontSize: 14, fontWeight: "600" },
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
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginBottom: 10,
    backgroundColor: "#F9FAFB",
  },
  count: { marginBottom: 10, color: "#666" },
  card: {
    backgroundColor: "#E8F5E9",
    padding: 14,
    borderRadius: 10,
    marginBottom: 12,
  },
  cardTitle: { fontSize: 16, fontWeight: "bold", marginBottom: 6 },
  preview: { color: "#333" },
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
    fontSize: 18,
    fontWeight: "bold",
    color: "#333",
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
    gap: 8,
  },
  folderCard: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#E8F5E9",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#C8E6C9",
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
    color: "#666",
    marginLeft: 8,
  },
  deleteFolderButton: {
    backgroundColor: "#FFEBEE",
    paddingHorizontal: 12,
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#FFCDD2",
    justifyContent: "center",
    alignItems: "center",
  },
  deleteFolderText: {
    fontSize: 20,
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