import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";
import { supabase } from "@/src/lib/supabase";
import { useDiacritics } from "@/hooks/use-diacritics-local";
import { useLanguage } from "@/hooks/use-language";
import { extractVocabulary, isVocabExtractionConfigured, completeWordInfo, VocabItem, VerbItem, ParticleItem } from "@/src/lib/extract-vocabulary";

type ScanRow = {
  id: string;
  user_id: string;
  title: string;
  content: string;
  created_at: string;
};

type VocabItem = {
  mot_ar: string;
  traduction: string;
  singulier?: string | null;
  pluriel?: string | null;
  contraire?: string | null;
  remarque?: string | null;
};

type VerbItem = {
  verbe_ar: string;
  traduction: string;
  passe_3ms: string;
  present_3ms: string;
  imperatif: string;
  remarque?: string | null;
};

type ParticleItem = {
  particule_ar: string;
  type?: string | null;
  traduction: string;
  exemple?: string | null;
};

type ExtractResponse = {
  meta?: {
    ui_lang?: string;
    title?: string;
    source?: string;
    model?: string;
  };
  vocabulaire: VocabItem[];
  verbes: VerbItem[];
  particules: ParticleItem[];
};

export default function LibraryItemScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const id = useMemo(() => String(params.id ?? ""), [params.id]);

  const [loading, setLoading] = useState(true);
  const [scan, setScan] = useState<ScanRow | null>(null);

  const [editing, setEditing] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");

  // --- IA state
  const [aiLoading, setAiLoading] = useState(false);
  const [aiData, setAiData] = useState<ExtractResponse | null>(null);
  // --- Sections ouvertes/fermées
  const [showVocab, setShowVocab] = useState(false);
  const [showVerbs, setShowVerbs] = useState(false);
  const [showParticles, setShowParticles] = useState(false);
  // --- Diacritics
  const { addDiacriticsToWord } = useDiacritics();
  const { t, language } = useLanguage();
  // Langue UI
  const uiLang = language;

  // --- États pour l'édition de vocabulaire
  const [editingVocabIdx, setEditingVocabIdx] = useState<number | null>(null);
  const [editingVerbIdx, setEditingVerbIdx] = useState<number | null>(null);
  const [editingParticleIdx, setEditingParticleIdx] = useState<number | null>(null);
  const [editedItem, setEditedItem] = useState<any>(null);
  const [addingWord, setAddingWord] = useState(false);
  const [addingVerb, setAddingVerb] = useState(false);
  const [addingParticle, setAddingParticle] = useState(false);
  const [newWordInput, setNewWordInput] = useState('');
  const [completingWord, setCompletingWord] = useState(false);

  const canSave = useMemo(() => {
    if (!editing) return false;
    if (!newTitle.trim()) return false;
    if (!newContent.trim()) return false;
    return true;
  }, [editing, newTitle, newContent]);

  async function getUserIdOrThrow(): Promise<string> {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    const userId = data.session?.user?.id;
    if (!userId) throw new Error("Auth session missing");
    return userId;
  }

  async function loadScan() {
    try {
      setLoading(true);

      if (!id) {
        Alert.alert(t('libraryDetail.error'), t('libraryDetail.missingId'));
        router.back();
        return;
      }

      const userId = await getUserIdOrThrow();

      const { data, error } = await supabase
        .from("scans")
        .select("id,user_id,title,content,created_at")
        .eq("id", id)
        .eq("user_id", userId);

      if (error) {
        Alert.alert(t('libraryDetail.error'), error.message);
        return;
      }

      if (!data || data.length === 0) {
        Alert.alert(t('libraryDetail.notFound'), t('libraryDetail.notFoundText'));
        router.back();
        return;
      }

      const row = data[0] as ScanRow;

      setScan(row);
      setNewTitle(row.title ?? "");
      setNewContent(row.content ?? "");

      // ✅ Charge le cache IA si déjà présent
      try {
        const cacheKey = `ai_vocab_${row.id}_${uiLang}`;
        const { data: cached } = await supabase
          .from("ai_cache")
          .select("payload")
          .eq("key", cacheKey)
          .maybeSingle();

        if (cached?.payload) {
          setAiData(cached.payload as ExtractResponse);
        }
      } catch {
        // si table cache non créée, pas grave
      }
    } catch (e: any) {
      Alert.alert(t('libraryDetail.error'), e?.message ?? "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadScan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Générer automatiquement le vocabulaire quand le scan est chargé et qu'il n'y a pas de cache
  useEffect(() => {
    if (scan && !aiData && !aiLoading && !loading) {
      generateVocab();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scan, aiData, loading]);

  // Recharger le vocabulaire quand la langue change
  useEffect(() => {
    if (!scan || loading) return;
    
    // Si les données actuelles ne sont pas dans la bonne langue, régénérer
    if (aiData && aiData.meta?.ui_lang !== uiLang) {
      console.log(`🔄 Langue changée: ${aiData.meta?.ui_lang} -> ${uiLang}, régénération...`);
      generateVocab();
      return;
    }
    
    // Si pas de données, vérifier le cache ou régénérer
    if (!aiData) {
      // Recharger le cache pour la nouvelle langue
      async function reloadVocabForNewLanguage() {
        try {
          const cacheKey = `ai_vocab_${scan!.id}_${uiLang}`;
          const { data: cached } = await supabase
            .from("ai_cache")
            .select("payload")
            .eq("key", cacheKey)
            .maybeSingle();

          if (cached?.payload) {
            setAiData(cached.payload as ExtractResponse);
          } else {
            // Pas de cache pour cette langue, régénérer avec les données mock
            generateVocab();
          }
        } catch {
          // En cas d'erreur, régénérer avec les données mock
          generateVocab();
        }
      }

      reloadVocabForNewLanguage();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uiLang, aiData]);

  function startEdit() {
    if (!scan) return;
    setNewTitle(scan.title ?? "");
    setNewContent(scan.content ?? "");
    setEditing(true);
  }

  function cancelEdit() {
    if (!scan) return;
    setNewTitle(scan.title ?? "");
    setNewContent(scan.content ?? "");
    setEditing(false);
  }

  async function saveEdit() {
    try {
      if (!scan) return;

      const userId = await getUserIdOrThrow();

      const title = newTitle.trim();
      const content = newContent.trim();

      if (!title || !content) {
        Alert.alert(t('libraryDetail.error'), t('libraryDetail.titleRequired'));
        return;
      }

      const { data, error } = await supabase
        .from("scans")
        .update({ title, content })
        .eq("id", scan.id)
        .eq("user_id", userId)
        .select("id,user_id,title,content,created_at");

      if (error) {
        Alert.alert(t('libraryDetail.error'), error.message);
        return;
      }

      if (!data || data.length === 0) {
        Alert.alert(t('libraryDetail.error'), t('libraryDetail.noDataUpdated'));
        return;
      }

      const updated = data[0] as ScanRow;
      setScan(updated);
      setEditing(false);

      // 💡 Quand on modifie le texte, on invalide le résultat IA (optionnel)
      setAiData(null);

      Alert.alert(`✅ ${t('library.saved')}`, t('libraryDetail.savedSuccess'));
    } catch (e: any) {
      Alert.alert(t('libraryDetail.error'), e?.message ?? "Unknown error");
    }
  }

  async function deleteScan() {
    try {
      if (!scan) return;

      Alert.alert(t('libraryDetail.delete'), t('libraryDetail.deleteConfirm'), [
        { text: t('libraryDetail.cancel'), style: "cancel" },
        {
          text: t('libraryDetail.delete'),
          style: "destructive",
          onPress: async () => {
            try {
              const userId = await getUserIdOrThrow();

              const { error } = await supabase
                .from("scans")
                .delete()
                .eq("id", scan.id)
                .eq("user_id", userId);

              if (error) {
                Alert.alert(t('libraryDetail.error'), error.message);
                return;
              }

              Alert.alert(`✅ ${t('library.deleted')}`, t('libraryDetail.deletedSuccess'));
              router.replace("/(tabs)/library");
            } catch (e: any) {
              Alert.alert(t('libraryDetail.error'), e?.message ?? "Unknown error");
            }
          },
        },
      ]);
    } catch (e: any) {
      Alert.alert(t('libraryDetail.error'), e?.message ?? "Unknown error");
    }
  }

  // =============================
  // ✅ IA: Générer vocabulaire
  // =============================
  
  // Traductions mock par langue
  const mockTranslations: Record<string, {
    vocab: { book: string; school: string; student: string; mascSingular: string; femSingular: string };
    verbs: { write: string; read: string; regularVerb: string };
    particles: { preposition: string; inAt: string; from: string };
  }> = {
    fr: {
      vocab: { book: "livre", school: "école", student: "étudiant", mascSingular: "Nom masculin singulier", femSingular: "Nom féminin singulier" },
      verbs: { write: "écrire", read: "lire", regularVerb: "Verbe régulier" },
      particles: { preposition: "préposition", inAt: "dans", from: "de" },
    },
    en: {
      vocab: { book: "book", school: "school", student: "student", mascSingular: "Masculine singular noun", femSingular: "Feminine singular noun" },
      verbs: { write: "to write", read: "to read", regularVerb: "Regular verb" },
      particles: { preposition: "preposition", inAt: "in", from: "from" },
    },
    de: {
      vocab: { book: "Buch", school: "Schule", student: "Student", mascSingular: "Männliches Singularnomen", femSingular: "Weibliches Singularnomen" },
      verbs: { write: "schreiben", read: "lesen", regularVerb: "Regelmäßiges Verb" },
      particles: { preposition: "Präposition", inAt: "in", from: "von" },
    },
    es: {
      vocab: { book: "libro", school: "escuela", student: "estudiante", mascSingular: "Sustantivo masculino singular", femSingular: "Sustantivo femenino singular" },
      verbs: { write: "escribir", read: "leer", regularVerb: "Verbo regular" },
      particles: { preposition: "preposición", inAt: "en", from: "de" },
    },
    ru: {
      vocab: { book: "книга", school: "школа", student: "студент", mascSingular: "Мужской род единственного числа", femSingular: "Женский род единственного числа" },
      verbs: { write: "писать", read: "читать", regularVerb: "Правильный глагол" },
      particles: { preposition: "предлог", inAt: "в", from: "из" },
    },
  };

  // Mock data (utilisé si Edge Function n'est pas disponible)
  function getMockVocabData(): ExtractResponse {
    const tr = mockTranslations[uiLang] || mockTranslations.fr;
    return {
      meta: {
        ui_lang: uiLang,
        title: scan?.title ?? "Texte",
        source: "mock-extraction",
        model: "mock",
      },
      vocabulaire: [
        {
          mot_ar: "كِتَابٌ",
          traduction: tr.vocab.book,
          singulier: "كِتَابٌ",
          pluriel: "كُتُبٌ",
          contraire: null,
          remarque: tr.vocab.mascSingular,
        },
        {
          mot_ar: "مَدْرَسَةٌ",
          traduction: tr.vocab.school,
          singulier: "مَدْرَسَةٌ",
          pluriel: "مَدَارِسُ",
          contraire: null,
          remarque: tr.vocab.femSingular,
        },
        {
          mot_ar: "طَالِبٌ",
          traduction: tr.vocab.student,
          singulier: "طَالِبٌ",
          pluriel: "طُلَّابٌ",
          contraire: null,
          remarque: tr.vocab.mascSingular,
        },
      ],
      verbes: [
        {
          verbe_ar: "كَتَبَ",
          traduction: tr.verbs.write,
          passe_3ms: "كَتَبَ",
          present_3ms: "يَكْتُبُ",
          imperatif: "اُكْتُبْ",
          remarque: tr.verbs.regularVerb,
        },
        {
          verbe_ar: "قَرَأَ",
          traduction: tr.verbs.read,
          passe_3ms: "قَرَأَ",
          present_3ms: "يَقْرَأُ",
          imperatif: "اِقْرَأْ",
          remarque: tr.verbs.regularVerb,
        },
      ],
      particules: [
        {
          particule_ar: "فِي",
          type: tr.particles.preposition,
          traduction: tr.particles.inAt,
          exemple: "فِي الْبَيْتِ",
        },
        {
          particule_ar: "مِنْ",
          type: tr.particles.preposition,
          traduction: tr.particles.from,
          exemple: "مِنَ الْمَدْرَسَةِ",
        },
      ],
    };
  }

  async function generateVocab() {
    try {
      if (!scan) return;

      setAiLoading(true);

      // Utiliser l'extraction directe via OpenAI (côté client)
      let payload: ExtractResponse;
      
      if (isVocabExtractionConfigured()) {
        console.log('📡 Extraction du vocabulaire via OpenAI...');
        const result = await extractVocabulary(scan.content, uiLang, scan.title);
        
        if (result.error) {
          console.warn('⚠️ OpenAI extraction error:', result.error);
          console.log('📋 Utilisant mock data...');
          payload = getMockVocabData();
        } else {
          payload = result;
          console.log('✅ Vocabulaire extrait:', {
            vocab: result.vocabulaire.length,
            verbes: result.verbes.length,
            particules: result.particules.length,
          });
        }
      } else {
        console.warn('⚠️ OpenAI API non configurée');
        console.log('📋 Utilisant mock data...');
        payload = getMockVocabData();
      }

      setAiData(payload);

      // cache (optionnel)
      try {
        const cacheKey = `ai_vocab_${scan.id}_${uiLang}`;
        const userId = await getUserIdOrThrow();

        await supabase.from("ai_cache").upsert(
          {
            key: cacheKey,
            payload,
            scan_id: scan.id,
            user_id: userId,
          },
          { onConflict: "key" }
        );
      } catch {
        // ignore
      }
    } catch (e: any) {
      console.error("Erreur génération vocabulaire:", e?.message);
      // En cas d'erreur, utiliser mock data
      setAiData(getMockVocabData());
    } finally {
      setAiLoading(false);
    }
  }

  // Régénérer le vocabulaire (supprimer le cache et ré-extraire avec voyelles)
  async function regenerateVocab() {
    try {
      if (!scan) return;

      Alert.alert(
        t('libraryDetail.regenerateVocab'),
        t('libraryDetail.regenerateVocabConfirm'),
        [
          { text: t('libraryDetail.cancel'), style: 'cancel' },
          {
            text: t('libraryDetail.regenerate'),
            onPress: async () => {
              try {
                // Supprimer le cache existant
                const cacheKey = `ai_vocab_${scan.id}_${uiLang}`;
                await supabase.from('ai_cache').delete().eq('key', cacheKey);
                console.log('🗑️ Cache supprimé:', cacheKey);

                // Supprimer aussi les caches des autres langues
                const allLangs = ['fr', 'en', 'de', 'es', 'ru'];
                for (const lang of allLangs) {
                  if (lang !== uiLang) {
                    await supabase.from('ai_cache').delete().eq('key', `ai_vocab_${scan.id}_${lang}`);
                  }
                }

                // Réinitialiser l'état
                setAiData(null);

                // Régénérer
                await generateVocab();

                Alert.alert('✅', t('libraryDetail.regenerateSuccess'));
              } catch (e: any) {
                console.error('Erreur régénération:', e);
                Alert.alert(t('libraryDetail.error'), e?.message || 'Unknown error');
              }
            },
          },
        ]
      );
    } catch (e: any) {
      Alert.alert(t('libraryDetail.error'), e?.message || 'Unknown error');
    }
  }

  // Sauvegarder le cache AI après modification
  async function saveAiCache(newData: ExtractResponse) {
    if (!scan) return;
    try {
      const cacheKey = `ai_vocab_${scan.id}_${uiLang}`;
      await supabase.from('ai_cache').upsert(
        { key: cacheKey, payload: newData, updated_at: new Date().toISOString() },
        { onConflict: 'key' }
      );
      console.log('💾 Cache AI sauvegardé');
    } catch (e) {
      console.error('Erreur sauvegarde cache:', e);
    }
  }

  // Éditer un mot de vocabulaire
  function startEditVocab(idx: number) {
    if (!aiData?.vocabulaire?.[idx]) return;
    setEditingVocabIdx(idx);
    setEditedItem({ ...aiData.vocabulaire[idx] });
  }

  function saveEditVocab() {
    if (editingVocabIdx === null || !editedItem || !aiData) return;
    const newVocab = [...aiData.vocabulaire];
    newVocab[editingVocabIdx] = editedItem;
    const newData = { ...aiData, vocabulaire: newVocab };
    setAiData(newData);
    saveAiCache(newData);
    setEditingVocabIdx(null);
    setEditedItem(null);
  }

  function deleteVocab(idx: number) {
    if (!aiData) return;
    Alert.alert(t('libraryDetail.delete'), t('libraryDetail.deleteWordConfirm'), [
      { text: t('libraryDetail.cancel'), style: 'cancel' },
      {
        text: t('libraryDetail.delete'),
        style: 'destructive',
        onPress: () => {
          const newVocab = aiData.vocabulaire.filter((_, i) => i !== idx);
          const newData = { ...aiData, vocabulaire: newVocab };
          setAiData(newData);
          saveAiCache(newData);
        },
      },
    ]);
  }

  // Éditer un verbe
  function startEditVerb(idx: number) {
    if (!aiData?.verbes?.[idx]) return;
    setEditingVerbIdx(idx);
    setEditedItem({ ...aiData.verbes[idx] });
  }

  function saveEditVerb() {
    if (editingVerbIdx === null || !editedItem || !aiData) return;
    const newVerbs = [...aiData.verbes];
    newVerbs[editingVerbIdx] = editedItem;
    const newData = { ...aiData, verbes: newVerbs };
    setAiData(newData);
    saveAiCache(newData);
    setEditingVerbIdx(null);
    setEditedItem(null);
  }

  function deleteVerb(idx: number) {
    if (!aiData) return;
    Alert.alert(t('libraryDetail.delete'), t('libraryDetail.deleteWordConfirm'), [
      { text: t('libraryDetail.cancel'), style: 'cancel' },
      {
        text: t('libraryDetail.delete'),
        style: 'destructive',
        onPress: () => {
          const newVerbs = aiData.verbes.filter((_, i) => i !== idx);
          const newData = { ...aiData, verbes: newVerbs };
          setAiData(newData);
          saveAiCache(newData);
        },
      },
    ]);
  }

  // Éditer une particule
  function startEditParticle(idx: number) {
    if (!aiData?.particules?.[idx]) return;
    setEditingParticleIdx(idx);
    setEditedItem({ ...aiData.particules[idx] });
  }

  function saveEditParticle() {
    if (editingParticleIdx === null || !editedItem || !aiData) return;
    const newParticles = [...aiData.particules];
    newParticles[editingParticleIdx] = editedItem;
    const newData = { ...aiData, particules: newParticles };
    setAiData(newData);
    saveAiCache(newData);
    setEditingParticleIdx(null);
    setEditedItem(null);
  }

  function deleteParticle(idx: number) {
    if (!aiData) return;
    Alert.alert(t('libraryDetail.delete'), t('libraryDetail.deleteWordConfirm'), [
      { text: t('libraryDetail.cancel'), style: 'cancel' },
      {
        text: t('libraryDetail.delete'),
        style: 'destructive',
        onPress: () => {
          const newParticles = aiData.particules.filter((_, i) => i !== idx);
          const newData = { ...aiData, particules: newParticles };
          setAiData(newData);
          saveAiCache(newData);
        },
      },
    ]);
  }

  // Ajouter un nouveau mot avec complétion automatique
  async function addNewWord(type: 'word' | 'verb' | 'particle') {
    if (!newWordInput.trim() || !aiData) return;

    setCompletingWord(true);
    try {
      const completed = await completeWordInfo(newWordInput.trim(), type, uiLang);
      
      if (!completed) {
        Alert.alert(t('libraryDetail.error'), t('libraryDetail.completionError'));
        setCompletingWord(false);
        return;
      }

      let newData: ExtractResponse;
      
      if (type === 'word') {
        newData = { ...aiData, vocabulaire: [...aiData.vocabulaire, completed as VocabItem] };
      } else if (type === 'verb') {
        newData = { ...aiData, verbes: [...aiData.verbes, completed as VerbItem] };
      } else {
        newData = { ...aiData, particules: [...aiData.particules, completed as ParticleItem] };
      }

      setAiData(newData);
      saveAiCache(newData);
      setNewWordInput('');
      setAddingWord(false);
      setAddingVerb(false);
      setAddingParticle(false);
      Alert.alert('✅', t('libraryDetail.wordAdded'));
    } catch (e: any) {
      Alert.alert(t('libraryDetail.error'), e?.message || 'Unknown error');
    } finally {
      setCompletingWord(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
        <Text style={{ marginTop: 10 }}>{t('libraryDetail.loading')}</Text>
      </View>
    );
  }

  if (!scan) {
    return (
      <View style={styles.center}>
        <Text>{t('libraryDetail.textNotFound')}</Text>
        <Pressable style={styles.btnSecondary} onPress={() => router.back()}>
          <Text style={styles.btnSecondaryText}>{t('libraryDetail.back')}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Pressable style={styles.back} onPress={() => router.back()}>
        <Text style={styles.backText}>{t('libraryDetail.backLibrary')}</Text>
      </Pressable>

      <Text style={styles.title}>✏️ {editing ? t('libraryDetail.edit') : t('libraryDetail.details')}</Text>

      <Text style={styles.label}>{t('libraryDetail.title')}</Text>
      <TextInput
        style={[styles.input, !editing && styles.inputDisabled]}
        value={newTitle}
        onChangeText={setNewTitle}
        editable={editing}
        placeholder={t('libraryDetail.title')}
      />

      <Text style={styles.label}>{t('libraryDetail.text')}</Text>
      <TextInput
        style={[styles.textarea, !editing && styles.inputDisabled]}
        value={newContent}
        onChangeText={setNewContent}
        editable={editing}
        placeholder={t('libraryDetail.text')}
        multiline
        textAlignVertical="top"
      />

      <View style={styles.row}>
        {!editing ? (
          <>
            <Pressable style={styles.btnPrimary} onPress={startEdit}>
              <Text style={styles.btnPrimaryText}>{t('libraryDetail.edit')}</Text>
            </Pressable>

            <Pressable style={styles.btnDanger} onPress={deleteScan}>
              <Text style={styles.btnDangerText}>{t('libraryDetail.delete')}</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Pressable
              style={[styles.btnPrimary, !canSave && styles.btnDisabled]}
              onPress={saveEdit}
              disabled={!canSave}
            >
              <Text style={styles.btnPrimaryText}>{t('libraryDetail.save')}</Text>
            </Pressable>

            <Pressable style={styles.btnSecondary} onPress={cancelEdit}>
              <Text style={styles.btnSecondaryText}>{t('libraryDetail.cancel')}</Text>
            </Pressable>
          </>
        )}
      </View>

      {/* ============================= */}
      {/* ✅ SECTION IA */}
      {/* ============================= */}
      <View style={styles.block}>
        <Text style={styles.blockTitle}>{t('libraryDetail.vocabulary')}</Text>

        {aiLoading && (
          <View style={{ marginTop: 10, alignItems: 'center' }}>
            <ActivityIndicator />
            <Text style={{ marginTop: 8, color: "#666" }}>
              {t('libraryDetail.analyzing')}
            </Text>
          </View>
        )}

        {!!aiData && (
          <>
            {/* Boutons pour ouvrir les listes */}
            <View style={styles.vocabButtonsRow}>
              <Pressable
                style={[styles.vocabButton, showVocab && styles.vocabButtonActive]}
                onPress={() => setShowVocab(!showVocab)}
              >
                <Text style={[styles.vocabButtonText, showVocab && styles.vocabButtonTextActive]}>
                  {t('libraryDetail.words')} ({aiData.vocabulaire?.length || 0})
                </Text>
              </Pressable>

              <Pressable
                style={[styles.vocabButton, showVerbs && styles.vocabButtonActive]}
                onPress={() => setShowVerbs(!showVerbs)}
              >
                <Text style={[styles.vocabButtonText, showVerbs && styles.vocabButtonTextActive]}>
                  {t('libraryDetail.verbs')} ({aiData.verbes?.length || 0})
                </Text>
              </Pressable>

              <Pressable
                style={[styles.vocabButton, showParticles && styles.vocabButtonActive]}
                onPress={() => setShowParticles(!showParticles)}
              >
                <Text style={[styles.vocabButtonText, showParticles && styles.vocabButtonTextActive]}>
                  {t('libraryDetail.particles')} ({aiData.particules?.length || 0})
                </Text>
              </Pressable>
            </View>

            {/* Bouton régénérer pour forcer la ré-extraction avec voyelles */}
            <Pressable style={styles.regenerateButton} onPress={regenerateVocab}>
              <Text style={styles.regenerateButtonText}>
                🔄 {t('libraryDetail.regenerate')}
              </Text>
            </Pressable>

            {/* LISTE DES MOTS */}
            {showVocab && (
              <View style={styles.tableContainer}>
                <View style={styles.tableTitleRow}>
                  <Text style={styles.tableTitle}>{t('libraryDetail.wordsList')}</Text>
                  <Pressable style={styles.addButton} onPress={() => { setAddingWord(true); setNewWordInput(''); }}>
                    <Text style={styles.addButtonText}>+ {t('libraryDetail.addWord')}</Text>
                  </Pressable>
                </View>

                {/* Formulaire d'ajout de mot */}
                {addingWord && (
                  <View style={styles.addForm}>
                    <TextInput
                      style={styles.addInput}
                      placeholder={t('libraryDetail.enterArabicWord')}
                      value={newWordInput}
                      onChangeText={setNewWordInput}
                      textAlign="right"
                    />
                    <View style={styles.addFormButtons}>
                      <Pressable 
                        style={[styles.addFormBtn, styles.addFormBtnPrimary, completingWord && styles.btnDisabled]} 
                        onPress={() => addNewWord('word')}
                        disabled={completingWord}
                      >
                        {completingWord ? (
                          <ActivityIndicator size="small" color="#fff" />
                        ) : (
                          <Text style={styles.addFormBtnPrimaryText}>✨ {t('libraryDetail.autoComplete')}</Text>
                        )}
                      </Pressable>
                      <Pressable style={styles.addFormBtn} onPress={() => setAddingWord(false)}>
                        <Text style={styles.addFormBtnText}>{t('libraryDetail.cancel')}</Text>
                      </Pressable>
                    </View>
                  </View>
                )}

                <ScrollView horizontal showsHorizontalScrollIndicator={true}>
                  <View style={{ minWidth: 560 }}>
                    <View style={styles.tableHeader}>
                      <Text style={[styles.tableHeaderCell, { width: 110 }]}>{t('libraryDetail.word')}</Text>
                      <Text style={[styles.tableHeaderCell, { width: 110 }]}>{t('libraryDetail.translation')}</Text>
                      <Text style={[styles.tableHeaderCell, { width: 90 }]}>{t('libraryDetail.singular')}</Text>
                      <Text style={[styles.tableHeaderCell, { width: 90 }]}>{t('libraryDetail.plural')}</Text>
                      <Text style={[styles.tableHeaderCell, { width: 60 }]}></Text>
                    </View>
                    {aiData.vocabulaire?.length ? (
                      aiData.vocabulaire.map((v, idx) => (
                        editingVocabIdx === idx ? (
                          <View key={`v-edit-${idx}`} style={styles.editRow}>
                            <TextInput
                              style={[styles.editInput, styles.editInputArabic, { width: 110 }]}
                              value={editedItem?.mot_ar || ''}
                              onChangeText={(text) => setEditedItem({ ...editedItem, mot_ar: text })}
                              textAlign="right"
                            />
                            <TextInput
                              style={[styles.editInput, { width: 110 }]}
                              value={editedItem?.traduction || ''}
                              onChangeText={(text) => setEditedItem({ ...editedItem, traduction: text })}
                            />
                            <TextInput
                              style={[styles.editInput, styles.editInputArabic, { width: 90 }]}
                              value={editedItem?.singulier || ''}
                              onChangeText={(text) => setEditedItem({ ...editedItem, singulier: text })}
                              textAlign="right"
                            />
                            <TextInput
                              style={[styles.editInput, styles.editInputArabic, { width: 90 }]}
                              value={editedItem?.pluriel || ''}
                              onChangeText={(text) => setEditedItem({ ...editedItem, pluriel: text })}
                              textAlign="right"
                            />
                            <View style={styles.editActions}>
                              <Pressable onPress={saveEditVocab}><Text style={styles.saveBtn}>✓</Text></Pressable>
                              <Pressable onPress={() => { setEditingVocabIdx(null); setEditedItem(null); }}><Text style={styles.cancelBtn}>✕</Text></Pressable>
                            </View>
                          </View>
                        ) : (
                          <Pressable key={`v-${idx}`} style={[styles.tableRow, idx % 2 === 0 && styles.tableRowEven]} onPress={() => startEditVocab(idx)}>
                            <Text style={[styles.tableCell, styles.tableCellArabic, { width: 110 }]} numberOfLines={1}>
                              {addDiacriticsToWord(v.mot_ar)}
                            </Text>
                            <Text style={[styles.tableCell, { width: 110 }]} numberOfLines={2}>
                              {v.traduction}
                            </Text>
                            <Text style={[styles.tableCell, styles.tableCellArabic, { width: 90 }]} numberOfLines={1}>
                              {v.singulier ? addDiacriticsToWord(v.singulier) : "-"}
                            </Text>
                            <Text style={[styles.tableCell, styles.tableCellArabic, { width: 90 }]} numberOfLines={1}>
                              {v.pluriel ? addDiacriticsToWord(v.pluriel) : "-"}
                            </Text>
                            <View style={[styles.tableCell, { width: 60, flexDirection: 'row', justifyContent: 'center' }]}>
                              <Pressable onPress={() => startEditVocab(idx)}><Text style={styles.editBtn}>✏️</Text></Pressable>
                              <Pressable onPress={() => deleteVocab(idx)}><Text style={styles.deleteBtn}>🗑</Text></Pressable>
                            </View>
                          </Pressable>
                        )
                      ))
                    ) : (
                      <Text style={styles.emptyList}>{t('libraryDetail.noWords')}</Text>
                    )}
                  </View>
                </ScrollView>
              </View>
            )}

            {/* LISTE DES VERBES */}
            {showVerbs && (
              <View style={styles.tableContainer}>
                <View style={styles.tableTitleRow}>
                  <Text style={styles.tableTitle}>{t('libraryDetail.verbsList')}</Text>
                  <Pressable style={styles.addButton} onPress={() => { setAddingVerb(true); setNewWordInput(''); }}>
                    <Text style={styles.addButtonText}>+ {t('libraryDetail.addVerb')}</Text>
                  </Pressable>
                </View>

                {/* Formulaire d'ajout de verbe */}
                {addingVerb && (
                  <View style={styles.addForm}>
                    <TextInput
                      style={styles.addInput}
                      placeholder={t('libraryDetail.enterArabicVerb')}
                      value={newWordInput}
                      onChangeText={setNewWordInput}
                      textAlign="right"
                    />
                    <View style={styles.addFormButtons}>
                      <Pressable 
                        style={[styles.addFormBtn, styles.addFormBtnPrimary, completingWord && styles.btnDisabled]} 
                        onPress={() => addNewWord('verb')}
                        disabled={completingWord}
                      >
                        {completingWord ? (
                          <ActivityIndicator size="small" color="#fff" />
                        ) : (
                          <Text style={styles.addFormBtnPrimaryText}>✨ {t('libraryDetail.autoComplete')}</Text>
                        )}
                      </Pressable>
                      <Pressable style={styles.addFormBtn} onPress={() => setAddingVerb(false)}>
                        <Text style={styles.addFormBtnText}>{t('libraryDetail.cancel')}</Text>
                      </Pressable>
                    </View>
                  </View>
                )}

                <ScrollView horizontal showsHorizontalScrollIndicator={true}>
                  <View style={{ minWidth: 610 }}>
                    <View style={styles.tableHeader}>
                      <Text style={[styles.tableHeaderCell, { width: 95 }]}>{t('libraryDetail.verb')}</Text>
                      <Text style={[styles.tableHeaderCell, { width: 100 }]}>{t('libraryDetail.translation')}</Text>
                      <Text style={[styles.tableHeaderCell, { width: 85 }]}>{t('libraryDetail.past')}</Text>
                      <Text style={[styles.tableHeaderCell, { width: 85 }]}>{t('libraryDetail.present')}</Text>
                      <Text style={[styles.tableHeaderCell, { width: 85 }]}>{t('libraryDetail.imperative')}</Text>
                      <Text style={[styles.tableHeaderCell, { width: 60 }]}></Text>
                    </View>
                    {aiData.verbes?.length ? (
                      aiData.verbes.map((vb, idx) => (
                        editingVerbIdx === idx ? (
                          <View key={`vb-edit-${idx}`} style={styles.editRow}>
                            <TextInput
                              style={[styles.editInput, styles.editInputArabic, { width: 95 }]}
                              value={editedItem?.verbe_ar || ''}
                              onChangeText={(text) => setEditedItem({ ...editedItem, verbe_ar: text })}
                              textAlign="right"
                            />
                            <TextInput
                              style={[styles.editInput, { width: 100 }]}
                              value={editedItem?.traduction || ''}
                              onChangeText={(text) => setEditedItem({ ...editedItem, traduction: text })}
                            />
                            <TextInput
                              style={[styles.editInput, styles.editInputArabic, { width: 85 }]}
                              value={editedItem?.passe_3ms || ''}
                              onChangeText={(text) => setEditedItem({ ...editedItem, passe_3ms: text })}
                              textAlign="right"
                            />
                            <TextInput
                              style={[styles.editInput, styles.editInputArabic, { width: 85 }]}
                              value={editedItem?.present_3ms || ''}
                              onChangeText={(text) => setEditedItem({ ...editedItem, present_3ms: text })}
                              textAlign="right"
                            />
                            <TextInput
                              style={[styles.editInput, styles.editInputArabic, { width: 85 }]}
                              value={editedItem?.imperatif || ''}
                              onChangeText={(text) => setEditedItem({ ...editedItem, imperatif: text })}
                              textAlign="right"
                            />
                            <View style={styles.editActions}>
                              <Pressable onPress={saveEditVerb}><Text style={styles.saveBtn}>✓</Text></Pressable>
                              <Pressable onPress={() => { setEditingVerbIdx(null); setEditedItem(null); }}><Text style={styles.cancelBtn}>✕</Text></Pressable>
                            </View>
                          </View>
                        ) : (
                          <Pressable key={`vb-${idx}`} style={[styles.tableRow, idx % 2 === 0 && styles.tableRowEven]} onPress={() => startEditVerb(idx)}>
                            <Text style={[styles.tableCell, styles.tableCellArabic, { width: 95 }]} numberOfLines={1}>
                              {addDiacriticsToWord(vb.verbe_ar)}
                            </Text>
                            <Text style={[styles.tableCell, { width: 100 }]} numberOfLines={2}>
                              {vb.traduction}
                            </Text>
                            <Text style={[styles.tableCell, styles.tableCellArabic, { width: 85 }]} numberOfLines={1}>
                              {addDiacriticsToWord(vb.passe_3ms)}
                            </Text>
                            <Text style={[styles.tableCell, styles.tableCellArabic, { width: 85 }]} numberOfLines={1}>
                              {addDiacriticsToWord(vb.present_3ms)}
                            </Text>
                            <Text style={[styles.tableCell, styles.tableCellArabic, { width: 85 }]} numberOfLines={1}>
                              {addDiacriticsToWord(vb.imperatif)}
                            </Text>
                            <View style={[styles.tableCell, { width: 60, flexDirection: 'row', justifyContent: 'center' }]}>
                              <Pressable onPress={() => startEditVerb(idx)}><Text style={styles.editBtn}>✏️</Text></Pressable>
                              <Pressable onPress={() => deleteVerb(idx)}><Text style={styles.deleteBtn}>🗑</Text></Pressable>
                            </View>
                          </Pressable>
                        )
                      ))
                    ) : (
                      <Text style={styles.emptyList}>{t('libraryDetail.noVerbs')}</Text>
                    )}
                  </View>
                </ScrollView>
              </View>
            )}

            {/* LISTE DES PARTICULES */}
            {showParticles && (
              <View style={styles.tableContainer}>
                <View style={styles.tableTitleRow}>
                  <Text style={styles.tableTitle}>{t('libraryDetail.particlesList')}</Text>
                  <Pressable style={styles.addButton} onPress={() => { setAddingParticle(true); setNewWordInput(''); }}>
                    <Text style={styles.addButtonText}>+ {t('libraryDetail.addParticle')}</Text>
                  </Pressable>
                </View>

                {/* Formulaire d'ajout de particule */}
                {addingParticle && (
                  <View style={styles.addForm}>
                    <TextInput
                      style={styles.addInput}
                      placeholder={t('libraryDetail.enterArabicParticle')}
                      value={newWordInput}
                      onChangeText={setNewWordInput}
                      textAlign="right"
                    />
                    <View style={styles.addFormButtons}>
                      <Pressable 
                        style={[styles.addFormBtn, styles.addFormBtnPrimary, completingWord && styles.btnDisabled]} 
                        onPress={() => addNewWord('particle')}
                        disabled={completingWord}
                      >
                        {completingWord ? (
                          <ActivityIndicator size="small" color="#fff" />
                        ) : (
                          <Text style={styles.addFormBtnPrimaryText}>✨ {t('libraryDetail.autoComplete')}</Text>
                        )}
                      </Pressable>
                      <Pressable style={styles.addFormBtn} onPress={() => setAddingParticle(false)}>
                        <Text style={styles.addFormBtnText}>{t('libraryDetail.cancel')}</Text>
                      </Pressable>
                    </View>
                  </View>
                )}

                <ScrollView horizontal showsHorizontalScrollIndicator={true}>
                  <View style={{ minWidth: 560 }}>
                    <View style={styles.tableHeader}>
                      <Text style={[styles.tableHeaderCell, { width: 80 }]}>{t('libraryDetail.particle')}</Text>
                      <Text style={[styles.tableHeaderCell, { width: 100 }]}>{t('libraryDetail.translation')}</Text>
                      <Text style={[styles.tableHeaderCell, { width: 90 }]}>{t('libraryDetail.type')}</Text>
                      <Text style={[styles.tableHeaderCell, { width: 130 }]}>{t('libraryDetail.example')}</Text>
                      <Text style={[styles.tableHeaderCell, { width: 60 }]}></Text>
                    </View>
                    {aiData.particules?.length ? (
                      aiData.particules.map((p, idx) => (
                        editingParticleIdx === idx ? (
                          <View key={`p-edit-${idx}`} style={styles.editRow}>
                            <TextInput
                              style={[styles.editInput, styles.editInputArabic, { width: 80 }]}
                              value={editedItem?.particule_ar || ''}
                              onChangeText={(text) => setEditedItem({ ...editedItem, particule_ar: text })}
                              textAlign="right"
                            />
                            <TextInput
                              style={[styles.editInput, { width: 100 }]}
                              value={editedItem?.traduction || ''}
                              onChangeText={(text) => setEditedItem({ ...editedItem, traduction: text })}
                            />
                            <TextInput
                              style={[styles.editInput, { width: 90 }]}
                              value={editedItem?.type || ''}
                              onChangeText={(text) => setEditedItem({ ...editedItem, type: text })}
                            />
                            <TextInput
                              style={[styles.editInput, styles.editInputArabic, { width: 130 }]}
                              value={editedItem?.exemple || ''}
                              onChangeText={(text) => setEditedItem({ ...editedItem, exemple: text })}
                              textAlign="right"
                            />
                            <View style={styles.editActions}>
                              <Pressable onPress={saveEditParticle}><Text style={styles.saveBtn}>✓</Text></Pressable>
                              <Pressable onPress={() => { setEditingParticleIdx(null); setEditedItem(null); }}><Text style={styles.cancelBtn}>✕</Text></Pressable>
                            </View>
                          </View>
                        ) : (
                          <Pressable key={`p-${idx}`} style={[styles.tableRow, idx % 2 === 0 && styles.tableRowEven]} onPress={() => startEditParticle(idx)}>
                            <Text style={[styles.tableCell, styles.tableCellArabic, { width: 80 }]} numberOfLines={1}>
                              {addDiacriticsToWord(p.particule_ar)}
                            </Text>
                            <Text style={[styles.tableCell, { width: 100 }]} numberOfLines={2}>
                              {p.traduction}
                            </Text>
                            <Text style={[styles.tableCell, { width: 90 }]} numberOfLines={1}>
                              {p.type || "-"}
                            </Text>
                            <Text style={[styles.tableCell, styles.tableCellArabic, { width: 130 }]} numberOfLines={2}>
                              {p.exemple || "-"}
                            </Text>
                            <View style={[styles.tableCell, { width: 60, flexDirection: 'row', justifyContent: 'center' }]}>
                              <Pressable onPress={() => startEditParticle(idx)}><Text style={styles.editBtn}>✏️</Text></Pressable>
                              <Pressable onPress={() => deleteParticle(idx)}><Text style={styles.deleteBtn}>🗑</Text></Pressable>
                            </View>
                          </Pressable>
                        )
                      ))
                    ) : (
                      <Text style={styles.emptyList}>{t('libraryDetail.noParticles')}</Text>
                    )}
                  </View>
                </ScrollView>
              </View>
            )}
          </>
        )}
      </View>

      <Text style={styles.meta}>
        {t('libraryDetail.createdAt')} {new Date(scan.created_at).toLocaleString()}
      </Text>
    </ScrollView>
  );
}

// =============================
// Styles
// =============================
const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  container: {
    padding: 16,
    paddingBottom: 40,
    gap: 12,
  },
  back: {
    alignSelf: "flex-start",
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: "#e8f5e9",
  },
  backText: {
    color: "#1b5e20",
    fontWeight: "700",
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
    color: "#1b5e20",
    marginTop: 6,
  },
  label: {
    fontSize: 14,
    fontWeight: "700",
    color: "#1b5e20",
    marginTop: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: "#d0d0d0",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "white",
  },
  textarea: {
    borderWidth: 1,
    borderColor: "#d0d0d0",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: "white",
    minHeight: 180,
  },
  inputDisabled: {
    backgroundColor: "#f3f3f3",
    color: "#333",
  },
  row: {
    flexDirection: "row",
    gap: 10,
    marginTop: 8,
  },
  btnPrimary: {
    flex: 1,
    backgroundColor: "#2e7d32",
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
  },
  btnPrimaryText: {
    color: "white",
    fontWeight: "800",
    fontSize: 16,
  },
  btnSecondary: {
    flex: 1,
    backgroundColor: "#e0e0e0",
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
  },
  btnSecondaryText: {
    color: "#111",
    fontWeight: "800",
    fontSize: 16,
  },
  btnDanger: {
    flex: 1,
    backgroundColor: "#b71c1c",
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
  },
  btnDangerText: {
    color: "white",
    fontWeight: "800",
    fontSize: 16,
  },
  btnDisabled: {
    opacity: 0.5,
  },
  meta: {
    marginTop: 8,
    color: "#666",
    fontSize: 12,
  },
  block: {
    marginTop: 10,
    padding: 14,
    borderRadius: 14,
    backgroundColor: "#f6fbf6",
    borderWidth: 1,
    borderColor: "#dfeee0",
  },
  blockTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: "#1b5e20",
    marginBottom: 10,
  },
  subTitle: {
    marginTop: 14,
    marginBottom: 8,
    fontSize: 16,
    fontWeight: "900",
    color: "#1b5e20",
  },
  card: {
    backgroundColor: "white",
    borderWidth: 1,
    borderColor: "#e6e6e6",
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
  },
  cardMain: {
    fontSize: 15,
    fontWeight: "900",
    color: "#111",
  },
  cardMeta: {
    marginTop: 6,
    fontSize: 13,
    color: "#444",
  },
  // Styles pour les boutons de vocabulaire
  vocabButtonsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 12,
  },
  vocabButton: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: "#e8f5e9",
    borderWidth: 2,
    borderColor: "#c8e6c9",
  },
  vocabButtonActive: {
    backgroundColor: "#2e7d32",
    borderColor: "#1b5e20",
  },
  vocabButtonText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#1b5e20",
  },
  vocabButtonTextActive: {
    color: "white",
  },
  // Bouton régénérer vocabulaire
  regenerateButton: {
    marginTop: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: "#fff3e0",
    borderWidth: 2,
    borderColor: "#ffcc80",
    alignSelf: "flex-start",
  },
  regenerateButtonText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#e65100",
  },
  // Styles pour les tableaux
  tableContainer: {
    marginTop: 10,
    backgroundColor: "white",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e0e0e0",
    overflow: "hidden",
  },
  tableScrollContainer: {
    // Pour permettre le défilement horizontal
  },
  tableTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#1b5e20",
    padding: 12,
    backgroundColor: "#e8f5e9",
    borderBottomWidth: 1,
    borderBottomColor: "#c8e6c9",
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#f5f5f5",
    borderBottomWidth: 2,
    borderBottomColor: "#2e7d32",
    paddingVertical: 10,
    paddingHorizontal: 8,
    minWidth: "100%",
  },
  tableHeaderCell: {
    fontSize: 12,
    fontWeight: "800",
    color: "#1b5e20",
    textAlign: "center",
    flexShrink: 0,
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
    paddingVertical: 10,
    paddingHorizontal: 8,
    minWidth: "100%",
    alignItems: "center",
  },
  tableRowEven: {
    backgroundColor: "#fafafa",
  },
  tableCell: {
    fontSize: 13,
    color: "#333",
    textAlign: "center",
    paddingHorizontal: 4,
    flexShrink: 0,
  },
  tableCellArabic: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111",
    writingDirection: "rtl",
    textAlign: "right",
  },
  emptyList: {
    padding: 16,
    textAlign: "center",
    color: "#666",
    fontStyle: "italic",
  },
  // Styles pour édition et ajout
  tableTitleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 12,
    backgroundColor: "#e8f5e9",
    borderBottomWidth: 1,
    borderBottomColor: "#c8e6c9",
  },
  addButton: {
    backgroundColor: "#2e7d32",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  addButtonText: {
    color: "white",
    fontSize: 13,
    fontWeight: "700",
  },
  addForm: {
    padding: 12,
    backgroundColor: "#f5f5f5",
    borderBottomWidth: 1,
    borderBottomColor: "#e0e0e0",
  },
  addInput: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    padding: 10,
    fontSize: 16,
    backgroundColor: "white",
    marginBottom: 10,
  },
  addFormButtons: {
    flexDirection: "row",
    gap: 10,
  },
  addFormBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: "center",
    backgroundColor: "#e0e0e0",
  },
  addFormBtnPrimary: {
    backgroundColor: "#1976d2",
  },
  addFormBtnText: {
    fontWeight: "700",
    color: "#333",
  },
  addFormBtnPrimaryText: {
    fontWeight: "700",
    color: "white",
  },
  editRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
    paddingVertical: 6,
    paddingHorizontal: 4,
    backgroundColor: "#fffde7",
    alignItems: "center",
  },
  editInput: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 6,
    padding: 6,
    fontSize: 13,
    backgroundColor: "white",
    marginHorizontal: 2,
  },
  editInputArabic: {
    fontSize: 15,
    writingDirection: "rtl",
  },
  editActions: {
    flexDirection: "row",
    justifyContent: "center",
    width: 60,
    gap: 8,
  },
  saveBtn: {
    fontSize: 18,
    color: "#2e7d32",
    fontWeight: "bold",
  },
  cancelBtn: {
    fontSize: 18,
    color: "#d32f2f",
    fontWeight: "bold",
  },
  editBtn: {
    fontSize: 14,
    marginRight: 4,
  },
  deleteBtn: {
    fontSize: 14,
  },
});