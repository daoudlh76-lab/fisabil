import { useFocusEffect } from "@react-navigation/native";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import {
    Alert,
    FlatList,
    Pressable,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";
import { supabase } from "@/src/lib/supabase";
import { useLanguage } from "@/hooks/use-language";

type Scan = {
  id: string;
  title: string;
  content: string;
  created_at: string;
};

export default function LibraryScreen() {
  const { t } = useLanguage();
  const router = useRouter();
  const { refresh } = useLocalSearchParams<{ refresh?: string }>();

  const [scans, setScans] = useState<Scan[]>([]);
  const [query, setQuery] = useState("");

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
      .select("id,title,content,created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) {
      Alert.alert(t('library.error'), error.message);
      return;
    }

    setScans((data ?? []) as Scan[]);
  }, [router]);

  // ✅ Recharge quand tu reviens sur l’écran + quand refresh change
  useFocusEffect(
    useCallback(() => {
      loadScans();
    }, [loadScans, refresh])
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return scans;

    return scans.filter((s) => {
      const t = (s.title ?? "").toLowerCase();
      const c = (s.content ?? "").toLowerCase();
      return t.includes(q) || c.includes(q);
    });
  }, [query, scans]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t('library.title')}</Text>

      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder={t('library.search')}
        style={styles.search}
        autoCapitalize="none"
        autoCorrect={false}
      />

      <Text style={styles.count}>{filtered.length} {t('library.textsCount')}</Text>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => (
          <Pressable
            style={styles.card}
            onPress={() => router.push(`/library/${item.id}`)}
          >
            <Text style={styles.cardTitle}>{item.title}</Text>
            <Text numberOfLines={2} style={styles.preview}>
              {item.content}
            </Text>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: "#fff" },
  title: { fontSize: 22, fontWeight: "bold", marginBottom: 12 },
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
});