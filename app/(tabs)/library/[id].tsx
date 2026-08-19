import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import React, { useEffect, useMemo, useState, useCallback } from "react";
import {
    ActivityIndicator,
    Alert,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
    KeyboardAvoidingView,
    Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "@/src/lib/supabase";
import { useDiacritics } from "@/hooks/use-diacritics-local";
import { useLanguage } from "@/hooks/use-language";
import { useAudioPlaylistContext } from "@/contexts/audio-playlist-context";
import { extractVocabularyFromText, VocabItem, VerbItem, ParticleItem } from "@/src/lib/extract-vocabulary";
import { invokeEdge } from "@/src/lib/edge-ai";
import { migrateExtractVocabResult, needsMigration } from "@/src/lib/migrate-vocab-data";
import { updateLocalScan, deleteLocalScan, getLocalVocab, saveLocalVocab } from "@/src/lib/local-cache";

type ScanRow = {
  id: string;
  user_id: string;
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

// Incrémenter cette version quand le prompt d'extraction change
// pour invalider les caches obsolètes (ex: traductions en mauvaise langue)
const VOCAB_PROMPT_VERSION = 2;

type ExtractResponse = {
  meta?: {
    ui_lang?: string;
    title?: string;
    source?: string;
    model?: string;
    prompt_version?: number;
  };
  vocabulaire: VocabItem[];
  verbes: VerbItem[];
  particules: ParticleItem[];
};

export default function LibraryItemScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const insets = useSafeAreaInsets();
  const id = useMemo(() => String(params.id ?? ""), [params.id]);

  const [loading, setLoading] = useState(true);
  const [scan, setScan] = useState<ScanRow | null>(null);

  const [editing, setEditing] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");

  const [folders, setFolders] = useState<Folder[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);

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
  const { updateTracksByScanId, updateTrackFolder, playlist } = useAudioPlaylistContext();
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
  // --- Carte ouverte par onglet (une seule à la fois par catégorie)
  const [expandedIndex, setExpandedIndex] = useState<Record<'mots' | 'verbes' | 'particules', string | null>>({
    mots: null,
    verbes: null,
    particules: null,
  });

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

  async function loadFolders() {
    try {
      const userId = await getUserIdOrThrow();

      const { data, error } = await supabase
        .from("folders")
        .select("id, name, color, icon")
        .eq("user_id", userId)
        .order("name", { ascending: true });

      if (!error && data) {
        setFolders(data as Folder[]);
      }
    } catch (e) {
      __DEV__ && console.error("Erreur chargement dossiers:", e);
    }
  }

  async function loadScan() {
    try {
      setLoading(true);
      // Réinitialiser l'ancien vocabulaire au changement de texte
      setAiData(null);

      if (!id) {
        Alert.alert(t('libraryDetail.error'), t('libraryDetail.missingId'));
        router.back();
        return;
      }

      const userId = await getUserIdOrThrow();

      const { data, error } = await supabase
        .from("scans")
        .select("id,user_id,title,content,created_at,folder_id")
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
      setSelectedFolderId(row.folder_id ?? null);

      // Sauvegarder dans le cache local
      updateLocalScan(row);

      // ✅ Charge le cache IA — local prioritaire (contient les suppressions)
      // Le vocabulaire extrait est TOUJOURS chargé, quelle que soit la version du prompt
      try {
        // 1. Essayer le cache local (instantané, contient les _deleted)
        const localVocab = await getLocalVocab(row.id, uiLang);
        if (localVocab) {
          const localData = localVocab as ExtractResponse;
          const migratedData = needsMigration(localData) ? migrateExtractVocabResult(localData) : localData;
          setAiData(migratedData);
          __DEV__ && console.log('📱 Vocabulaire chargé depuis le cache local');
        } else {
          // 2. Pas de cache local → fallback sur Supabase (premier chargement / nouvel appareil)
          const cacheKey = `ai_vocab_${row.id}_${uiLang}`;
          const { data: cached } = await supabase
            .from("ai_cache")
            .select("payload")
            .eq("key", cacheKey)
            .maybeSingle();

          if (cached?.payload) {
            const data = cached.payload as ExtractResponse;
            const migratedData = needsMigration(data) ? migrateExtractVocabResult(data) : data;
            setAiData(migratedData);
            // Synchroniser vers le cache local
            saveLocalVocab(row.id, uiLang, migratedData);
            __DEV__ && console.log('☁️ Vocabulaire chargé depuis Supabase (pas de cache local)');
          }
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

  // Recharger les dossiers chaque fois que l'écran devient actif
  useFocusEffect(
    useCallback(() => {
      loadFolders();
    }, [])
  );

  // Recharger le cache vocabulaire quand la langue change (sans ré-extraire)
  useEffect(() => {
    if (!scan || loading) return;

    // Si les données actuelles ne sont pas dans la bonne langue, chercher dans le cache
    if (aiData && aiData.meta?.ui_lang !== uiLang) {
      __DEV__ && console.log(`🔄 Langue changée: ${aiData.meta?.ui_lang} -> ${uiLang}, recherche du cache...`);
      setAiData(null); // Reset pour recharger le cache
    }

    // Si pas de données, vérifier le cache (mais ne PAS ré-extraire automatiquement)
    if (!aiData) {
      async function reloadVocabFromCache() {
        try {
          const cacheKey = `ai_vocab_${scan!.id}_${uiLang}`;
          const { data: cached } = await supabase
            .from("ai_cache")
            .select("payload")
            .eq("key", cacheKey)
            .maybeSingle();

          if (cached?.payload) {
            const data = cached.payload as ExtractResponse;
            if ((data.meta?.prompt_version || 0) < VOCAB_PROMPT_VERSION) {
              __DEV__ && console.log('📋 Cache obsolète — appuyez sur "Extraire" pour régénérer');
            } else {
              const migratedData = needsMigration(data) ? migrateExtractVocabResult(data) : data;
              setAiData(migratedData);
            }
          } else {
            __DEV__ && console.log('📋 Pas de vocabulaire extrait — appuyez sur "Extraire" pour lancer l\'extraction');
          }
        } catch {
          // Cache non disponible
        }
      }

      reloadVocabFromCache();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uiLang, aiData, scan, loading]);

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

  async function updateFolder(folderId: string | null) {
    try {
      if (!scan) return;
      if (folderId === scan.folder_id) return; // Already in this folder

      const userId = await getUserIdOrThrow();

      __DEV__ && console.log('📁 updateFolder:', { scanId: scan.id, newFolderId: folderId, currentFolderId: scan.folder_id });

      const { data, error } = await supabase
        .from("scans")
        .update({ folder_id: folderId })
        .eq("id", scan.id)
        .eq("user_id", userId)
        .select("id,user_id,title,content,created_at,folder_id");

      __DEV__ && console.log('📁 updateFolder result:', { data, error });

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
      setSelectedFolderId(updated.folder_id);

      // Mettre à jour le cache local
      updateLocalScan(updated);

      // Mettre à jour le dossier de la piste audio associée
      const linkedTrack = playlist.tracks.find(tr => tr.scanId === scan.id);
      if (linkedTrack) {
        updateTrackFolder(linkedTrack.id, folderId);
      }

      const folderName = folderId ? folders.find(f => f.id === folderId)?.name : t('library.noFolder');
      Alert.alert('✅', `${t('libraryDetail.folderUpdated')}: ${folderName}`);
    } catch (e: any) {
      __DEV__ && console.error('📁 updateFolder error:', e);
      Alert.alert(t('libraryDetail.error'), e?.message ?? "Unknown error");
    }
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
        .update({ title, content, folder_id: selectedFolderId })
        .eq("id", scan.id)
        .eq("user_id", userId)
        .select("id,user_id,title,content,created_at,folder_id");

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

      // Mettre à jour le cache local
      updateLocalScan(updated);

      // Synchroniser le texte modifié avec les pistes audio liées
      updateTracksByScanId(scan.id, updated.title, updated.content, scan.title);

      // �💡 Quand on modifie le texte, on invalide le résultat IA (optionnel)
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

              // Supprimer du cache local
              deleteLocalScan(scan.id);

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
          traduction: tr.vocab.book,
          singulier: "كِتَابٌ",
          pluriel: "كُتُبٌ",
          contraire: null,
          remarque: tr.vocab.mascSingular,
        },
        {
          traduction: tr.vocab.school,
          singulier: "مَدْرَسَةٌ",
          pluriel: "مَدَارِسُ",
          contraire: null,
          remarque: tr.vocab.femSingular,
        },
        {
          traduction: tr.vocab.student,
          singulier: "طَالِبٌ",
          pluriel: "طُلَّابٌ",
          contraire: null,
          remarque: tr.vocab.mascSingular,
        },
      ],
      verbes: [
        {
          traduction: tr.verbs.write,
          passe_3ms: "كَتَبَ",
          present_3ms: "يَكْتُبُ",
          imperatif: "اُكْتُبْ",
          remarque: tr.verbs.regularVerb,
        },
        {
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

      // Utiliser l'extraction via Edge Function (sécurisée)
      let payload: ExtractResponse;

      __DEV__ && console.log('📡 Extraction du vocabulaire via Edge Function...');
      const result = await extractVocabularyFromText(scan.id, uiLang);

      if (!result) {
        __DEV__ && console.warn('⚠️ Edge Function extraction failed');
        __DEV__ && console.log('📋 Utilisant mock data...');
        payload = getMockVocabData();
      } else {
        payload = result;
        __DEV__ && console.log('✅ Vocabulaire extrait:', {
          vocab: result.vocabulaire.length,
          verbes: result.verbes.length,
          particules: result.particules.length,
        });
      }

      // Ajouter la version du prompt au meta
      if (payload.meta) {
        payload.meta.prompt_version = VOCAB_PROMPT_VERSION;
      } else {
        payload.meta = { ui_lang: uiLang, source: 'openai-client', model: 'gpt-4o', prompt_version: VOCAB_PROMPT_VERSION };
      }

      setAiData(payload);

      // cache (Supabase + local)
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
      // Sauvegarder aussi en local
      saveLocalVocab(scan.id, uiLang, payload);
    } catch (e: any) {
      __DEV__ && console.error("Erreur génération vocabulaire:", e?.message);
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
                __DEV__ && console.log('🗑️ Cache supprimé:', cacheKey);

                // Supprimer aussi les caches des autres langues
                const allLangs = ['fr', 'en', 'de', 'es', 'ru', 'ms', 'ar'];
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
                __DEV__ && console.error('Erreur régénération:', e);
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
    // Sauvegarder en local TOUJOURS en premier (garantit la persistance des suppressions)
    saveLocalVocab(scan.id, uiLang, newData);
    try {
      const cacheKey = `ai_vocab_${scan.id}_${uiLang}`;
      await supabase.from('ai_cache').upsert(
        { key: cacheKey, payload: newData, updated_at: new Date().toISOString() },
        { onConflict: 'key' }
      );
      __DEV__ && console.log('💾 Cache AI sauvegardé (local + Supabase)');
    } catch (e) {
      __DEV__ && console.error('Erreur sauvegarde cache Supabase:', e);
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
        onPress: async () => {
          const word = aiData.vocabulaire[idx];
          const newVocab = [...aiData.vocabulaire];
          newVocab[idx] = { ...word, _deleted: true } as any;
          const newData = { ...aiData, vocabulaire: newVocab };
          setAiData(newData);
          saveAiCache(newData);
          // Supprimer la progression de la carte
          if (scan && word.singulier) {
            await supabase.from('vocab_cards_progress').delete()
              .eq('word_ar', word.singulier)
              .eq('scan_id', scan.id).catch(() => {});
          }
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
        onPress: async () => {
          const verb = aiData.verbes[idx];
          const newVerbs = [...aiData.verbes];
          newVerbs[idx] = { ...verb, _deleted: true } as any;
          const newData = { ...aiData, verbes: newVerbs };
          setAiData(newData);
          saveAiCache(newData);
          if (scan && verb.passe_3ms) {
            await supabase.from('vocab_cards_progress').delete()
              .eq('word_ar', verb.passe_3ms)
              .eq('scan_id', scan.id).catch(() => {});
          }
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
        onPress: async () => {
          const particle = aiData.particules[idx];
          const newParticles = [...aiData.particules];
          newParticles[idx] = { ...particle, _deleted: true } as any;
          const newData = { ...aiData, particules: newParticles };
          setAiData(newData);
          saveAiCache(newData);
          if (scan && particle.particule_ar) {
            await supabase.from('vocab_cards_progress').delete()
              .eq('word_ar', particle.particule_ar)
              .eq('scan_id', scan.id).catch(() => {});
          }
        },
      },
    ]);
  }

  // Fonction pour normaliser un mot arabe (supprimer les diacritiques pour comparaison)
  function normalizeArabic(text: string): string {
    // Supprimer les diacritiques arabes (tashkeel) pour la comparaison
    return text?.replace(/[\u064B-\u0652]/g, '').trim() || '';
  }

  // Vérifier si un mot existe déjà
  function isDuplicate(type: 'word' | 'verb' | 'particle', wordAr: string): boolean {
    if (!aiData) return false;
    const normalized = normalizeArabic(wordAr);

    if (type === 'word') {
      return aiData.vocabulaire.some(v => normalizeArabic(v.singulier) === normalized);
    } else if (type === 'verb') {
      return aiData.verbes.some(v =>
        normalizeArabic(v.passe_3ms) === normalized
      );
    } else {
      return aiData.particules.some(p => normalizeArabic(p.particule_ar) === normalized);
    }
  }

  // Ajouter un nouveau mot avec auto-complétion IA
  async function addNewWord() {
    if (!newWordInput.trim() || !aiData) return;

    setCompletingWord(true);
    try {
      // Appel à l'Edge Function pour analyser le mot
      const result = await invokeEdge<{ type: 'word' | 'verb' | 'particle'; data: any }>('complete-word', {
        word: newWordInput.trim(),
        ui_lang: uiLang,
      });

      const { type, data: completed } = result;

      // Vérifier les doublons avec le mot arabe retourné par l'IA
      const completedWord = type === 'word'
        ? completed.singulier
        : type === 'verb'
          ? completed.passe_3ms
          : completed.particule_ar;

      if (isDuplicate(type, completedWord)) {
        Alert.alert('⚠️', t('libraryDetail.duplicateWord'));
        setCompletingWord(false);
        return;
      }

      // Placer dans la bonne catégorie
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

      const typeLabel = type === 'word' ? t('libraryDetail.words')
        : type === 'verb' ? t('libraryDetail.verbs')
        : t('libraryDetail.particles');
      Alert.alert('✅', `${completedWord} → ${typeLabel}`);
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
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: '#0D2318' }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <ScrollView style={{ backgroundColor: '#F8F3EC' }} contentContainerStyle={styles.pageContainer} keyboardShouldPersistTaps="handled">
      <View style={[styles.zoneTop, { paddingTop: insets.top + 16 }]}>
        <Text style={styles.titleOnDark}>{editing ? t('libraryDetail.edit') : t('libraryDetail.details')}</Text>

      <Text style={styles.labelOnDark}>{t('libraryDetail.title')}</Text>
      <TextInput
        style={[styles.input, !editing && styles.inputDisabled]}
        value={newTitle}
        onChangeText={setNewTitle}
        editable={editing}
        placeholder={t('libraryDetail.title')}
      />

      <Text style={styles.labelOnDark}>{t('libraryDetail.text')}</Text>
      <TextInput
        style={[styles.textarea, !editing && styles.inputDisabled]}
        value={newContent}
        onChangeText={setNewContent}
        editable={editing}
        placeholder={t('libraryDetail.text')}
        multiline
        textAlignVertical="top"
      />

      {/* Sélection du dossier - Toujours visible */}
      {!editing && (
        <View style={styles.folderSection}>
          <Text style={styles.labelOnDark}>📁 {t('libraryDetail.folder')}</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.folderScroll}
          >
            <Pressable
              style={[
                styles.folderChip,
                selectedFolderId === null && styles.folderChipSelected
              ]}
              onPress={() => {
                setSelectedFolderId(null);
                updateFolder(null);
              }}
            >
              <Text style={styles.folderText}>{t('library.noFolder')}</Text>
            </Pressable>
            {folders.map((folder) => (
              <Pressable
                key={folder.id}
                style={[
                  styles.folderChip,
                  selectedFolderId === folder.id && styles.folderChipSelected
                ]}
                onPress={() => {
                  setSelectedFolderId(folder.id);
                  updateFolder(folder.id);
                }}
              >
                <Text style={styles.folderIcon}>{folder.icon}</Text>
                <Text style={styles.folderText}>{folder.name}</Text>
              </Pressable>
            ))}
          </ScrollView>
          {folders.length === 0 && (
            <Text style={styles.noFoldersText}>
              {t('library.noFolders')}
            </Text>
          )}
        </View>
      )}

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
      </View>

      <View style={styles.zoneBottom}>
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

        {/* État vide : vocabulaire pas encore extrait */}
        {!aiData && !aiLoading && (
          <View style={styles.emptyVocab}>
            <View style={styles.emptyVocabIconCircle}>
              <Text style={styles.emptyVocabIcon}>✨</Text>
            </View>
            <Text style={styles.emptyVocabTitle}>{t('libraryDetail.emptyVocabTitle')}</Text>
            <Text style={styles.emptyVocabSubtitle}>{t('libraryDetail.emptyVocabSubtitle')}</Text>
            <Pressable style={styles.extractButton} onPress={generateVocab}>
              <Text style={styles.extractButtonText}>
                ✨ {t('libraryDetail.extractVocab')}
              </Text>
            </Pressable>
            <Text style={styles.emptyVocabHint}>{t('libraryDetail.emptyVocabHint')}</Text>
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
                  {t('libraryDetail.words')} ({aiData.vocabulaire?.filter((v: any) => !v._deleted)?.length || 0})
                </Text>
              </Pressable>

              <Pressable
                style={[styles.vocabButton, showVerbs && styles.vocabButtonActive]}
                onPress={() => setShowVerbs(!showVerbs)}
              >
                <Text style={[styles.vocabButtonText, showVerbs && styles.vocabButtonTextActive]}>
                  {t('libraryDetail.verbs')} ({aiData.verbes?.filter((v: any) => !v._deleted)?.length || 0})
                </Text>
              </Pressable>

              <Pressable
                style={[styles.vocabButton, showParticles && styles.vocabButtonActive]}
                onPress={() => setShowParticles(!showParticles)}
              >
                <Text style={[styles.vocabButtonText, showParticles && styles.vocabButtonTextActive]}>
                  {t('libraryDetail.particles')} ({aiData.particules?.filter((v: any) => !v._deleted)?.length || 0})
                </Text>
              </Pressable>
            </View>

            {/* Bouton régénérer pour forcer la ré-extraction */}
            <Pressable style={styles.regenerateButton} onPress={regenerateVocab}>
              <Text style={styles.regenerateButtonText}>
                ⚠️ {t('libraryDetail.regenerate')}
              </Text>
            </Pressable>

            {/* LISTE DES MOTS */}
            {showVocab && (
              <View style={styles.vocabSection}>
                <Text style={styles.vocabSectionTitle}>{t('libraryDetail.wordsList')}</Text>

                {aiData.vocabulaire?.filter((v: any) => !v._deleted)?.length ? (
                  aiData.vocabulaire.map((v: any, idx) => {
                    if (v._deleted) return null;
                    const cardKey = `mots-${idx}`;
                    const isExpanded = expandedIndex.mots === cardKey;

                    if (editingVocabIdx === idx) {
                      return (
                        <View key={`v-edit-${idx}`} style={styles.editCard}>
                          <View style={styles.editField}>
                            <Text style={styles.editFieldLabel}>{t('libraryDetail.translation')}</Text>
                            <TextInput
                              style={[styles.editInput, styles.editInputFull]}
                              value={editedItem?.traduction || ''}
                              onChangeText={(text) => setEditedItem({ ...editedItem, traduction: text })}
                            />
                          </View>
                          <View style={styles.editField}>
                            <Text style={styles.editFieldLabel}>{t('libraryDetail.singular')}</Text>
                            <TextInput
                              style={[styles.editInput, styles.editInputArabic, styles.editInputFull]}
                              value={editedItem?.singulier || ''}
                              onChangeText={(text) => setEditedItem({ ...editedItem, singulier: text })}
                              textAlign="right"
                            />
                          </View>
                          <View style={styles.editField}>
                            <Text style={styles.editFieldLabel}>{t('libraryDetail.plural')}</Text>
                            <TextInput
                              style={[styles.editInput, styles.editInputArabic, styles.editInputFull]}
                              value={editedItem?.pluriel || ''}
                              onChangeText={(text) => setEditedItem({ ...editedItem, pluriel: text })}
                              textAlign="right"
                            />
                          </View>
                          <View style={styles.editField}>
                            <Text style={styles.editFieldLabel}>{t('libraryDetail.opposite')}</Text>
                            <TextInput
                              style={[styles.editInput, styles.editInputArabic, styles.editInputFull]}
                              value={editedItem?.contraire || ''}
                              onChangeText={(text) => setEditedItem({ ...editedItem, contraire: text })}
                              textAlign="right"
                            />
                          </View>
                          <View style={styles.editActionsRow}>
                            <Pressable onPress={saveEditVocab}><Text style={styles.saveBtn}>✓</Text></Pressable>
                            <Pressable onPress={() => { setEditingVocabIdx(null); setEditedItem(null); }}><Text style={styles.cancelBtn}>✕</Text></Pressable>
                          </View>
                        </View>
                      );
                    }

                    return (
                      <Pressable
                        key={`v-${idx}`}
                        style={styles.wordCard}
                        onPress={() => setExpandedIndex((prev) => ({ ...prev, mots: isExpanded ? null : cardKey }))}
                      >
                        <View style={styles.wordCardHeader}>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.wordCardArabic}>{v.singulier ? addDiacriticsToWord(v.singulier) : "-"}</Text>
                            <Text style={styles.wordCardTranslation}>{v.traduction}</Text>
                          </View>
                          <View style={styles.wordCardActions}>
                            <Pressable onPress={() => startEditVocab(idx)}><Text style={styles.editBtn}>✏️</Text></Pressable>
                            <Pressable onPress={() => deleteVocab(idx)}><Text style={styles.deleteBtn}>🗑</Text></Pressable>
                          </View>
                        </View>
                        {isExpanded && (
                          <View style={styles.wordCardGrid}>
                            <View style={styles.wordCardGridCol}>
                              <Text style={styles.wordCardGridLabel}>{t('libraryDetail.singular')}</Text>
                              <Text style={styles.wordCardGridValue}>{v.singulier ? addDiacriticsToWord(v.singulier) : "-"}</Text>
                            </View>
                            <View style={styles.wordCardGridCol}>
                              <Text style={styles.wordCardGridLabel}>{t('libraryDetail.plural')}</Text>
                              <Text style={styles.wordCardGridValue}>{v.pluriel ? addDiacriticsToWord(v.pluriel) : "-"}</Text>
                            </View>
                          </View>
                        )}
                      </Pressable>
                    );
                  })
                ) : (
                  <Text style={styles.emptyList}>{t('libraryDetail.noWords')}</Text>
                )}

                <Pressable style={styles.addCardButton} onPress={() => { setAddingWord(true); setNewWordInput(''); }}>
                  <Text style={styles.addCardButtonText}>+ {t('libraryDetail.addWord')}</Text>
                </Pressable>

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
                        onPress={() => addNewWord()}
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
              </View>
            )}

            {/* LISTE DES VERBES */}
            {showVerbs && (
              <View style={styles.vocabSection}>
                <Text style={styles.vocabSectionTitle}>{t('libraryDetail.verbsList')}</Text>

                {aiData.verbes?.filter((v: any) => !v._deleted)?.length ? (
                  aiData.verbes.map((vb: any, idx) => {
                    if (vb._deleted) return null;
                    const cardKey = `verbes-${idx}`;
                    const isExpanded = expandedIndex.verbes === cardKey;

                    if (editingVerbIdx === idx) {
                      return (
                        <View key={`vb-edit-${idx}`} style={styles.editCard}>
                          <View style={styles.editField}>
                            <Text style={styles.editFieldLabel}>{t('libraryDetail.translation')}</Text>
                            <TextInput
                              style={[styles.editInput, styles.editInputFull]}
                              value={editedItem?.traduction || ''}
                              onChangeText={(text) => setEditedItem({ ...editedItem, traduction: text })}
                            />
                          </View>
                          <View style={styles.editField}>
                            <Text style={styles.editFieldLabel}>{t('libraryDetail.past')}</Text>
                            <TextInput
                              style={[styles.editInput, styles.editInputArabic, styles.editInputFull]}
                              value={editedItem?.passe_3ms || ''}
                              onChangeText={(text) => setEditedItem({ ...editedItem, passe_3ms: text })}
                              textAlign="right"
                            />
                          </View>
                          <View style={styles.editField}>
                            <Text style={styles.editFieldLabel}>{t('libraryDetail.present')}</Text>
                            <TextInput
                              style={[styles.editInput, styles.editInputArabic, styles.editInputFull]}
                              value={editedItem?.present_3ms || ''}
                              onChangeText={(text) => setEditedItem({ ...editedItem, present_3ms: text })}
                              textAlign="right"
                            />
                          </View>
                          <View style={styles.editField}>
                            <Text style={styles.editFieldLabel}>{t('libraryDetail.imperative')}</Text>
                            <TextInput
                              style={[styles.editInput, styles.editInputArabic, styles.editInputFull]}
                              value={editedItem?.imperatif || ''}
                              onChangeText={(text) => setEditedItem({ ...editedItem, imperatif: text })}
                              textAlign="right"
                            />
                          </View>
                          <View style={styles.editActionsRow}>
                            <Pressable onPress={saveEditVerb}><Text style={styles.saveBtn}>✓</Text></Pressable>
                            <Pressable onPress={() => { setEditingVerbIdx(null); setEditedItem(null); }}><Text style={styles.cancelBtn}>✕</Text></Pressable>
                          </View>
                        </View>
                      );
                    }

                    return (
                      <Pressable
                        key={`vb-${idx}`}
                        style={styles.wordCard}
                        onPress={() => setExpandedIndex((prev) => ({ ...prev, verbes: isExpanded ? null : cardKey }))}
                      >
                        <View style={styles.wordCardHeader}>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.wordCardArabic}>{addDiacriticsToWord(vb.passe_3ms)}</Text>
                            <Text style={styles.wordCardTranslation}>{vb.traduction}</Text>
                          </View>
                          <View style={styles.wordCardActions}>
                            <Pressable onPress={() => startEditVerb(idx)}><Text style={styles.editBtn}>✏️</Text></Pressable>
                            <Pressable onPress={() => deleteVerb(idx)}><Text style={styles.deleteBtn}>🗑</Text></Pressable>
                          </View>
                        </View>
                        {isExpanded && (
                          <View style={styles.wordCardGrid}>
                            <View style={styles.wordCardGridCol}>
                              <Text style={styles.wordCardGridLabel}>{t('libraryDetail.past')}</Text>
                              <Text style={styles.wordCardGridValue}>{addDiacriticsToWord(vb.passe_3ms)}</Text>
                            </View>
                            <View style={styles.wordCardGridCol}>
                              <Text style={styles.wordCardGridLabel}>{t('libraryDetail.present')}</Text>
                              <Text style={styles.wordCardGridValue}>{addDiacriticsToWord(vb.present_3ms)}</Text>
                            </View>
                            <View style={[styles.wordCardGridCol, styles.wordCardGridColImperative]}>
                              <Text style={styles.wordCardGridLabel}>{t('libraryDetail.imperative')}</Text>
                              <Text style={styles.wordCardGridValue}>{addDiacriticsToWord(vb.imperatif)}</Text>
                            </View>
                          </View>
                        )}
                      </Pressable>
                    );
                  })
                ) : (
                  <Text style={styles.emptyList}>{t('libraryDetail.noVerbs')}</Text>
                )}

                <Pressable style={styles.addCardButton} onPress={() => { setAddingVerb(true); setNewWordInput(''); }}>
                  <Text style={styles.addCardButtonText}>+ {t('libraryDetail.addVerb')}</Text>
                </Pressable>

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
                        onPress={() => addNewWord()}
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
              </View>
            )}

            {/* LISTE DES PARTICULES */}
            {showParticles && (
              <View style={styles.vocabSection}>
                <Text style={styles.vocabSectionTitle}>{t('libraryDetail.particlesList')}</Text>

                {aiData.particules?.filter((v: any) => !v._deleted)?.length ? (
                  aiData.particules.map((p: any, idx) => {
                    if (p._deleted) return null;
                    const cardKey = `particules-${idx}`;
                    const isExpanded = expandedIndex.particules === cardKey;

                    if (editingParticleIdx === idx) {
                      return (
                        <View key={`p-edit-${idx}`} style={styles.editCard}>
                          <View style={styles.editField}>
                            <Text style={styles.editFieldLabel}>{t('libraryDetail.particle')}</Text>
                            <TextInput
                              style={[styles.editInput, styles.editInputArabic, styles.editInputFull]}
                              value={editedItem?.particule_ar || ''}
                              onChangeText={(text) => setEditedItem({ ...editedItem, particule_ar: text })}
                              textAlign="right"
                            />
                          </View>
                          <View style={styles.editField}>
                            <Text style={styles.editFieldLabel}>{t('libraryDetail.translation')}</Text>
                            <TextInput
                              style={[styles.editInput, styles.editInputFull]}
                              value={editedItem?.traduction || ''}
                              onChangeText={(text) => setEditedItem({ ...editedItem, traduction: text })}
                            />
                          </View>
                          <View style={styles.editField}>
                            <Text style={styles.editFieldLabel}>{t('libraryDetail.type')}</Text>
                            <TextInput
                              style={[styles.editInput, styles.editInputFull]}
                              value={editedItem?.type || ''}
                              onChangeText={(text) => setEditedItem({ ...editedItem, type: text })}
                            />
                          </View>
                          <View style={styles.editField}>
                            <Text style={styles.editFieldLabel}>{t('libraryDetail.example')}</Text>
                            <TextInput
                              style={[styles.editInput, styles.editInputArabic, styles.editInputFull]}
                              value={editedItem?.exemple || ''}
                              onChangeText={(text) => setEditedItem({ ...editedItem, exemple: text })}
                              textAlign="right"
                            />
                          </View>
                          <View style={styles.editActionsRow}>
                            <Pressable onPress={saveEditParticle}><Text style={styles.saveBtn}>✓</Text></Pressable>
                            <Pressable onPress={() => { setEditingParticleIdx(null); setEditedItem(null); }}><Text style={styles.cancelBtn}>✕</Text></Pressable>
                          </View>
                        </View>
                      );
                    }

                    return (
                      <Pressable
                        key={`p-${idx}`}
                        style={styles.wordCard}
                        onPress={() => setExpandedIndex((prev) => ({ ...prev, particules: isExpanded ? null : cardKey }))}
                      >
                        <View style={styles.wordCardHeader}>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.wordCardArabic}>{addDiacriticsToWord(p.particule_ar)}</Text>
                            <Text style={styles.wordCardTranslation}>{p.traduction}</Text>
                          </View>
                          <View style={styles.wordCardActions}>
                            <Pressable onPress={() => startEditParticle(idx)}><Text style={styles.editBtn}>✏️</Text></Pressable>
                            <Pressable onPress={() => deleteParticle(idx)}><Text style={styles.deleteBtn}>🗑</Text></Pressable>
                          </View>
                        </View>
                        {isExpanded && !!p.exemple && (
                          <View style={styles.particleExampleBox}>
                            <Text style={styles.wordCardGridLabel}>{t('libraryDetail.exampleUsage')}</Text>
                            <Text style={styles.particleExampleValue}>{p.exemple}</Text>
                          </View>
                        )}
                      </Pressable>
                    );
                  })
                ) : (
                  <Text style={styles.emptyList}>{t('libraryDetail.noParticles')}</Text>
                )}

                <Pressable style={styles.addCardButton} onPress={() => { setAddingParticle(true); setNewWordInput(''); }}>
                  <Text style={styles.addCardButtonText}>+ {t('libraryDetail.addParticle')}</Text>
                </Pressable>

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
                        onPress={() => addNewWord()}
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
              </View>
            )}
          </>
        )}
      </View>

      <Text style={styles.meta}>
        {t('libraryDetail.createdAt')} {new Date(scan.created_at).toLocaleString()}
      </Text>
      </View>
      </ScrollView>
    </KeyboardAvoidingView>
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
  pageContainer: {
    paddingBottom: 40,
    backgroundColor: '#F8F3EC',
  },
  zoneTop: {
    backgroundColor: '#0D2318',
    padding: 16,
    paddingBottom: 20,
    gap: 12,
  },
  zoneBottom: {
    backgroundColor: '#F8F3EC',
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
  titleOnDark: {
    fontSize: 22,
    fontWeight: "800",
    color: "#F8F3EC",
    marginTop: 6,
  },
  labelOnDark: {
    fontSize: 14,
    fontWeight: "700",
    color: "#C9A84C",
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
  // Bouton extraire vocabulaire (première fois)
  emptyVocab: {
    alignItems: "center",
    paddingVertical: 20,
    paddingHorizontal: 10,
  },
  emptyVocabIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#0D2318",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  emptyVocabIcon: {
    fontSize: 28,
  },
  emptyVocabTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: "#0D2318",
    textAlign: "center",
  },
  emptyVocabSubtitle: {
    fontSize: 14,
    color: "#666",
    textAlign: "center",
    marginTop: 6,
    lineHeight: 20,
    maxWidth: 280,
  },
  emptyVocabHint: {
    fontSize: 12,
    color: "#999",
    textAlign: "center",
    marginTop: 10,
  },
  extractButton: {
    marginTop: 18,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    backgroundColor: "#0D2318",
    alignItems: "center",
  },
  extractButtonText: {
    fontSize: 15,
    fontWeight: "800",
    color: "#C9A84C",
  },
  // Bouton régénérer vocabulaire
  regenerateButton: {
    marginTop: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: "#FEF0EE",
    borderWidth: 1,
    borderColor: "rgba(192,57,43,0.15)",
    alignSelf: "flex-start",
  },
  regenerateButtonText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#C0392B",
  },
  // Styles pour les tableaux
  vocabSection: {
    marginTop: 10,
  },
  vocabSectionTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#0D2318",
    paddingVertical: 10,
  },
  emptyList: {
    padding: 16,
    textAlign: "center",
    color: "#666",
    fontStyle: "italic",
  },
  // Cartes de vocabulaire (mots / verbes / particules)
  wordCard: {
    backgroundColor: "white",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E0D5",
    padding: 14,
    marginBottom: 10,
  },
  wordCardHeader: {
    flexDirection: "row",
    alignItems: "center",
  },
  wordCardArabic: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111",
    writingDirection: "rtl",
    textAlign: "right",
  },
  wordCardTranslation: {
    fontSize: 13,
    color: "#666",
    marginTop: 2,
  },
  wordCardActions: {
    flexDirection: "row",
    gap: 12,
    marginLeft: 10,
  },
  wordCardGrid: {
    flexDirection: "row",
    gap: 10,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#F0EBE0",
  },
  wordCardGridCol: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: "#FAFAFA",
  },
  wordCardGridColImperative: {
    backgroundColor: "#E8F5E9",
  },
  wordCardGridLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#888",
    marginBottom: 4,
  },
  wordCardGridValue: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111",
    writingDirection: "rtl",
    textAlign: "center",
  },
  particleExampleBox: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#F0EBE0",
  },
  particleExampleValue: {
    fontSize: 15,
    color: "#111",
    writingDirection: "rtl",
    textAlign: "right",
    marginTop: 4,
  },
  // Styles pour édition et ajout
  addCardButton: {
    marginTop: 4,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: "#0D2318",
    alignItems: "center",
  },
  addCardButtonText: {
    color: "#0D2318",
    fontSize: 14,
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
  editCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#F0E0A8",
    backgroundColor: "#FFFDE7",
    padding: 14,
    marginBottom: 10,
  },
  editField: {
    marginBottom: 10,
  },
  editFieldLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#666",
    marginBottom: 4,
  },
  editInput: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 6,
    padding: 6,
    fontSize: 13,
    backgroundColor: "white",
  },
  editInputFull: {
    width: "100%",
  },
  editInputArabic: {
    fontSize: 15,
    writingDirection: "rtl",
  },
  editActionsRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 16,
    marginTop: 4,
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
  // Styles pour la section dossier
  folderSection: {
    marginTop: 12,
  },
  folderScroll: {
    marginTop: 8,
    marginBottom: 12,
  },
  folderChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F5F5F5",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    marginRight: 6,
    borderWidth: 1.5,
    borderColor: "transparent",
  },
  folderChipSelected: {
    backgroundColor: "#E8F5E9",
    borderColor: "#2E7D32",
  },
  folderIcon: {
    fontSize: 16,
    marginRight: 4,
  },
  folderText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#333",
  },
  btnUpdateFolder: {
    backgroundColor: "#1976d2",
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    alignSelf: "flex-start",
    marginTop: 4,
  },
  btnUpdateFolderText: {
    color: "white",
    fontSize: 14,
    fontWeight: "700",
  },
  noFoldersText: {
    marginTop: 8,
    fontSize: 13,
    color: "#999",
    fontStyle: "italic",
  },
});