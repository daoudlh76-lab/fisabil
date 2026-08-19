import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { supabase } from "@/src/lib/supabase";
import { useLanguage } from "@/hooks/use-language";
import { Colors } from "@/constants/colors";

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

export default function FolderDetailScreen() {
  const { t } = useLanguage();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [folder, setFolder] = useState<Folder | null>(null);
  const [scans, setScans] = useState<Scan[]>([]);
  const [query, setQuery] = useState("");

  const loadFolder = useCallback(async () => {
    if (!id) return;

    const { data, error } = await supabase
      .from("folders")
      .select("id, name, color, icon")
      .eq("id", id)
      .single();

    if (error) {
      Alert.alert(t('library.error'), error.message);
      return;
    }

    setFolder(data as Folder);
  }, [id, t]);

  const loadScans = useCallback(async () => {
    if (!id) return;

    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user?.id;
    if (!userId) return;

    const { data, error } = await supabase
      .from("scans")
      .select("id, title, content, created_at, folder_id")
      .eq("user_id", userId)
      .eq("folder_id", id)
      .order("created_at", { ascending: false });

    if (error) {
      Alert.alert(t('library.error'), error.message);
      return;
    }

    setScans((data ?? []) as Scan[]);
  }, [id, t]);

  useFocusEffect(
    useCallback(() => {
      loadFolder();
      loadScans();
    }, [loadFolder, loadScans])
  );

  const filteredScans = scans.filter((scan) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    const title = (scan.title ?? "").toLowerCase();
    const content = (scan.content ?? "").toLowerCase();
    return title.includes(q) || content.includes(q);
  });

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.push('/(tabs)/library')} style={styles.backBtn}>
          <Text style={styles.backText}>← {t('libraryDetail.back')}</Text>
        </Pressable>
      </View>

      {folder && (
        <View style={styles.folderInfo}>
          <Text style={styles.folderIcon}>{folder.icon}</Text>
          <Text style={styles.folderName}>{folder.name}</Text>
          <Text style={styles.folderCount}>({scans.length})</Text>
        </View>
      )}

      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder={t('library.search')}
        style={styles.search}
        autoCapitalize="none"
        autoCorrect={false}
      />

      <ScrollView style={styles.content}>
        {filteredScans.length > 0 ? (
          filteredScans.map((item) => (
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
          ))
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>
              {query.trim() ? t('library.noResults') : t('library.noTexts')}
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: Colors.cream,
  },
  header: {
    marginBottom: 12,
  },
  backBtn: {
    paddingVertical: 8,
  },
  backText: {
    fontSize: 16,
    color: "#2E7D32",
    fontWeight: "600",
  },
  folderInfo: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#E8F5E9",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 10,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#C8E6C9",
  },
  folderIcon: {
    fontSize: 28,
    marginRight: 12,
  },
  folderName: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#333",
    flex: 1,
  },
  folderCount: {
    fontSize: 16,
    color: "#666",
  },
  search: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginBottom: 16,
    backgroundColor: "#F9FAFB",
  },
  content: {
    flex: 1,
  },
  card: {
    backgroundColor: "#E8F5E9",
    padding: 14,
    borderRadius: 10,
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 6,
  },
  preview: {
    color: "#333",
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
