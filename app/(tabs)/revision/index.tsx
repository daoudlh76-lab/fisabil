import { useDictation, PLAYBACK_SPEEDS } from '@/hooks/use-dictation';
import { useVocabCards, VocabCard } from '@/hooks/use-vocab-cards';
import { useDiacritics } from '@/hooks/use-diacritics-local';
import { useLanguage } from '@/hooks/use-language';
import { supabase } from '@/src/lib/supabase';
import { invokeEdge } from '@/src/lib/edge-ai';
import { migrateExtractVocabResult, needsMigration } from '@/src/lib/migrate-vocab-data';
import { getLocalVocab } from '@/src/lib/local-cache';
import { useSubscription } from '@/contexts/subscription-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Animated,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const GREEN = '#2E7D32';
const BLUE = '#1976d2';
const DICTATIONS_PER_TEXT = 5;

// Fonction pour compter les mots arabes
function countArabicWords(text: string): number {
  return text.trim().split(/\s+/).filter(w => w.length > 0).length;
}

/**
 * Utilise GPT-4o-mini pour analyser UN seul texte et créer des dictées cohérentes.
 */
async function generateDictationsWithAI(title: string, content: string): Promise<string[]> {
  try {
    const data = await invokeEdge<{ message: string }>('tutor-chat-ai', {
      messages: [
        {
          role: 'system',
          content: `أنتَ مُساعِدٌ لِتَعليمِ العَرَبِيَّةِ. مُهِمَّتُكَ: تَقسيمُ النَّصِّ التالي إلى ${DICTATIONS_PER_TEXT} مَقاطِعَ لِلإِملاءِ.

القَواعِدُ الصارِمَةُ:
١. كُلُّ مَقطَعٍ يَجِبُ أَنْ يَكونَ نَصًّا حَرفِيًّا مِنَ النَّصِّ الأَصلِيِّ — لا تُغَيِّرْ أَيَّ كَلِمَةٍ
٢. المَقاطِعُ يَجِبُ أَنْ تَتَّبِعَ تَرتيبَ النَّصِّ الأَصلِيِّ
٣. كُلُّ مَقطَعٍ يَحتَوي عَلى ٣٠-٥٠ كَلِمَةً
٤. المَقطَعُ يَجِبُ أَنْ يَبدَأَ وَيَنتَهِيَ عِندَ حُدودٍ طَبيعِيَّةٍ
٥. لا تَتَخَطَّ أَيَّ جُزءٍ مِنَ النَّصِّ — غَطِّ النَّصَّ كامِلاً بالتَّرتيبِ

أَجِبْ فَقَط بِصيغَةِ JSON:
["مقطع ١", "مقطع ٢", ...]`,
        },
        {
          role: 'user',
          content: `النَّصُّ "${title}":\n${content}`,
        },
      ],
      max_tokens: 2000,
      temperature: 0.1,
      language: 'ar',
    });

    const raw = data.message ?? '';
    const jsonMatch = raw.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];
    const parsed = JSON.parse(jsonMatch[0]) as string[];
    return parsed.filter(s => s && s.trim().length > 5);
  } catch {
    return [];
  }
}

function splitTextFallback(text: string): string[] {
  const words = text.trim().split(/\s+/).filter(w => w.length > 0);
  const chunks: string[] = [];
  for (let i = 0; i < words.length; i += 30) {
    const chunk = words.slice(i, i + 30).join(' ');
    if (countArabicWords(chunk) >= 10) chunks.push(chunk);
  }
  return chunks.slice(0, DICTATIONS_PER_TEXT);
}

type DictationItem = {
  id: string;
  text: string;
  level: 'beginner' | 'intermediate' | 'advanced';
  wordCount: number;
  sourceTitle: string;
};

type ScanChoice = { id: string; title: string; content: string; wordCount: number };

type DictStats = {
  totalCompleted: number;
  level: number;
  progressInLevel: number;
  streak: number;
  perScanCounts: Map<string, number>;
};

const SEGMENTS_PER_LEVEL = 10;

// Nombre de jours consécutifs (jusqu'à aujourd'hui ou hier) avec au moins une dictée complétée
function computeStreak(daysDesc: string[]): number {
  if (daysDesc.length === 0) return 0;
  const oneDay = 86400000;
  const todayStr = new Date().toISOString().slice(0, 10);
  let cursor = new Date(todayStr);

  if (daysDesc[0] !== todayStr) {
    const yesterdayStr = new Date(cursor.getTime() - oneDay).toISOString().slice(0, 10);
    if (daysDesc[0] !== yesterdayStr) return 0;
    cursor = new Date(yesterdayStr);
  }

  let streak = 0;
  for (const day of daysDesc) {
    const expected = cursor.toISOString().slice(0, 10);
    if (day === expected) {
      streak++;
      cursor = new Date(cursor.getTime() - oneDay);
    } else {
      break;
    }
  }
  return streak;
}

export default function RevisionScreen() {
  const { t, language } = useLanguage();
  const { isPremium, isLoaded } = useSubscription();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<'dictation' | 'vocab'>('dictation');
  const [dictPhase, setDictPhase] = useState<'idle' | 'select' | 'dictation'>('idle');
  const [currentDictIdx, setCurrentDictIdx] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [hasListenedOnce, setHasListenedOnce] = useState(false);
  const [flipAnim] = useState(new Animated.Value(0));
  const [dictationItems, setDictationItems] = useState<DictationItem[]>([]);
  const [loadingDictations, setLoadingDictations] = useState(false);
  const [loadingScans, setLoadingScans] = useState(true);
  const [scanChoices, setScanChoices] = useState<ScanChoice[]>([]);
  const [selectedTextTitle, setSelectedTextTitle] = useState('');
  const [selectedScan, setSelectedScan] = useState<ScanChoice | null>(null);
  const [vocabCards, setVocabCards] = useState<VocabCard[]>([]);
  const [loadingVocab, setLoadingVocab] = useState(true);
  const [dictStats, setDictStats] = useState<DictStats>({
    totalCompleted: 0,
    level: 1,
    progressInLevel: 0,
    streak: 0,
    perScanCounts: new Map(),
  });

  // --- Charger le vocabulaire depuis le cache AI (ai_cache)
  const loadVocabulary = useCallback(async () => {
    try {
      setLoadingVocab(true);
      
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user?.id;
      
      __DEV__ && console.log('🎴 Chargement vocabulaire pour user:', userId || 'NON CONNECTÉ');
      
      if (!userId) {
        __DEV__ && console.log('⚠️ Pas de session, pas de vocabulaire');
        setVocabCards([]);
        setLoadingVocab(false);
        return;
      }

      // D'abord, récupérer les IDs des scans de l'utilisateur
      const { data: scans, error: scansError } = await supabase
        .from('scans')
        .select('id, title')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (scansError) {
        __DEV__ && console.error('❌ Erreur chargement scans:', scansError);
        setVocabCards([]);
        setLoadingVocab(false);
        return;
      }

      __DEV__ && console.log('📄 Scans trouvés:', scans?.length || 0);

      if (!scans || scans.length === 0) {
        setVocabCards([]);
        setLoadingVocab(false);
        return;
      }

      // Charger le vocabulaire depuis le cache AI pour chaque scan
      const allCards: VocabCard[] = [];
      let cardIndex = 0;

      // Charger la progression sauvegardée pour cet utilisateur
      const { data: progressRows } = await supabase
        .from('vocab_cards_progress')
        .select('scan_id, word_ar, difficulty, last_reviewed, next_review, review_count')
        .eq('user_id', userId);

      // Indexer la progression par word_ar (contrainte unique = user_id + word_ar)
      const progressMap = new Map<string, {
        difficulty: VocabCard['difficulty'];
        lastReviewed: string | null;
        nextReview: string;
        reviewCount: number;
      }>();
      if (progressRows) {
        for (const row of progressRows) {
          progressMap.set(row.word_ar, {
            difficulty: row.difficulty as VocabCard['difficulty'],
            lastReviewed: row.last_reviewed,
            nextReview: row.next_review,
            reviewCount: row.review_count,
          });
        }
      }
      __DEV__ && console.log('📊 Progression chargée:', progressMap.size, 'entrées');

      for (const scan of scans) {
        // Chercher le cache de vocabulaire — cache local prioritaire (contient les _deleted)
        const langs = [...new Set([language, 'fr', 'en', 'de', 'es', 'ru'])];

        let vocabData = null;

        // 1. Essayer le cache local d'abord (contient les suppressions)
        for (const lang of langs) {
          const localData = await getLocalVocab(scan.id, lang);
          if (localData) {
            vocabData = needsMigration(localData)
              ? migrateExtractVocabResult(localData)
              : localData;
            __DEV__ && console.log('📱 Cache local trouvé pour:', scan.id, lang);
            break;
          }
        }

        // 2. Fallback sur Supabase si pas de cache local
        if (!vocabData) {
          for (const lang of langs) {
            const cacheKey = `ai_vocab_${scan.id}_${lang}`;
            const { data: cached, error: cacheError } = await supabase
              .from('ai_cache')
              .select('payload')
              .eq('key', cacheKey)
              .maybeSingle();

            if (cacheError) {
              __DEV__ && console.error('❌ Erreur cache:', cacheKey, cacheError);
              continue;
            }

            if (cached?.payload) {
              vocabData = needsMigration(cached.payload)
                ? migrateExtractVocabResult(cached.payload)
                : cached.payload;
              __DEV__ && console.log('☁️ Cache Supabase trouvé pour:', cacheKey);
              break;
            }
          }
        }

        if (!vocabData) {
          __DEV__ && console.log('⚠️ Pas de cache vocabulaire pour scan:', scan.title, '- vous devez extraire le vocabulaire depuis la bibliothèque');
          continue;
        }

        // Ajouter les mots de vocabulaire (singulier) — exclure les supprimés
        if (vocabData.vocabulaire && Array.isArray(vocabData.vocabulaire)) {
          for (const item of vocabData.vocabulaire) {
            if ((item as any)._deleted) continue;
            if (item.singulier && item.traduction) {
              const prog = progressMap.get(item.singulier);
              allCards.push({
                id: `vocab-${cardIndex++}`,
                scanId: scan.id,
                wordAr: item.singulier,
                wordFr: item.traduction,
                definition: '',
                difficulty: prog?.difficulty || 'medium',
                lastReviewed: prog?.lastReviewed ? new Date(prog.lastReviewed) : null,
                nextReview: prog?.nextReview ? new Date(prog.nextReview) : new Date(),
                reviewCount: prog?.reviewCount || 0,
              });
            }
          }
        }

        // Ajouter les verbes (forme au passé) — exclure les supprimés
        if (vocabData.verbes && Array.isArray(vocabData.verbes)) {
          for (const item of vocabData.verbes) {
            if ((item as any)._deleted) continue;
            if (item.passe_3ms && item.traduction) {
              const prog = progressMap.get(item.passe_3ms);
              allCards.push({
                id: `verb-${cardIndex++}`,
                scanId: scan.id,
                wordAr: item.passe_3ms,
                wordFr: item.traduction,
                definition: '',
                difficulty: prog?.difficulty || 'medium',
                lastReviewed: prog?.lastReviewed ? new Date(prog.lastReviewed) : null,
                nextReview: prog?.nextReview ? new Date(prog.nextReview) : new Date(),
                reviewCount: prog?.reviewCount || 0,
              });
            }
          }
        }

        // Ajouter les particules — exclure les supprimés
        if (vocabData.particules && Array.isArray(vocabData.particules)) {
          for (const item of vocabData.particules) {
            if ((item as any)._deleted) continue;
            if (item.particule_ar && item.traduction) {
              const prog = progressMap.get(item.particule_ar);
              allCards.push({
                id: `particle-${cardIndex++}`,
                scanId: scan.id,
                wordAr: item.particule_ar,
                wordFr: item.traduction,
                definition: item.exemple || item.type || '',
                difficulty: prog?.difficulty || 'easy',
                lastReviewed: prog?.lastReviewed ? new Date(prog.lastReviewed) : null,
                nextReview: prog?.nextReview ? new Date(prog.nextReview) : new Date(),
                reviewCount: prog?.reviewCount || 0,
              });
            }
          }
        }
      }

      // Filtrer : ne garder que les cartes dont la date de révision est passée
      const now = new Date();
      const dueCards = allCards.filter((card) => card.nextReview <= now);

      // Dédoublonner par mot arabe SANS diacritiques : garder la carte avec le plus de révisions
      const seen = new Map<string, VocabCard>();
      for (const card of dueCards) {
        const key = card.wordAr.replace(/[\u064B-\u0652]/g, '').trim();
        const existing = seen.get(key);
        if (!existing || card.reviewCount > existing.reviewCount) {
          seen.set(key, card);
        }
      }
      const uniqueCards = Array.from(seen.values());
      
      // Mélanger les cartes dues
      const shuffled = uniqueCards.sort(() => Math.random() - 0.5);
      
      __DEV__ && console.log('✅ Vocabulaire chargé:', allCards.length, 'total,', dueCards.length, 'dues,', uniqueCards.length, 'uniques');
      setVocabCards(shuffled);
    } catch (error) {
      __DEV__ && console.error('❌ Erreur:', error);
      setVocabCards([]);
    } finally {
      setLoadingVocab(false);
    }
  }, [language]);

  // --- Charger la liste des textes disponibles
  const loadScanChoices = useCallback(async () => {
    try {
      setLoadingScans(true);
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user?.id;
      if (!userId) { setScanChoices([]); setLoadingScans(false); return; }

      const { data: scans, error } = await supabase
        .from('scans')
        .select('id, title, content')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error || !scans) { setScanChoices([]); setLoadingScans(false); return; }

      const valid: ScanChoice[] = scans
        .filter((s: any) => s.content && s.content.trim().length > 10)
        .map((s: any) => ({
          id: s.id,
          title: s.title || 'Sans titre',
          content: s.content,
          wordCount: countArabicWords(s.content),
        }));
      setScanChoices(valid);
    } catch (err) {
      __DEV__ && console.error('Erreur loadScanChoices:', err);
    } finally {
      setLoadingScans(false);
    }
  }, []);

  // --- Charger les statistiques de dictée (segments complétés, streak, pratique par texte)
  const loadDictationStats = useCallback(async () => {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user?.id;
      if (!userId) return;

      const { data: rows, error } = await supabase
        .from('dictations')
        .select('scan_id, created_at')
        .eq('user_id', userId)
        .eq('completed', true);

      if (error || !rows) {
        __DEV__ && console.error('Erreur loadDictationStats:', error);
        return;
      }

      const totalCompleted = rows.length;
      const level = Math.floor(totalCompleted / SEGMENTS_PER_LEVEL) + 1;
      const progressInLevel = (totalCompleted % SEGMENTS_PER_LEVEL) / SEGMENTS_PER_LEVEL;

      const perScanCounts = new Map<string, number>();
      for (const row of rows) {
        if (!row.scan_id) continue;
        perScanCounts.set(row.scan_id, (perScanCounts.get(row.scan_id) || 0) + 1);
      }

      const daysSet = new Set<string>();
      for (const row of rows) {
        daysSet.add(new Date(row.created_at).toISOString().slice(0, 10));
      }
      const daysDesc = Array.from(daysSet).sort((a, b) => (a < b ? 1 : -1));
      const streak = computeStreak(daysDesc);

      setDictStats({ totalCompleted, level, progressInLevel, streak, perScanCounts });
    } catch (err) {
      __DEV__ && console.error('Erreur loadDictationStats:', err);
    }
  }, []);

  // --- Enregistrer la complétion d'un segment de dictée (appelée à l'étape Correction)
  const recordDictationCompletion = useCallback(async (scan: ScanChoice, segmentText: string, level: string) => {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user?.id;
      if (!userId) return;

      const { error } = await supabase.from('dictations').insert({
        user_id: userId,
        scan_id: scan.id,
        title: scan.title,
        text: segmentText,
        difficulty: level,
        completed: true,
      });

      if (error) {
        __DEV__ && console.error('Erreur recordDictationCompletion:', error);
        return;
      }

      loadDictationStats();
    } catch (err) {
      __DEV__ && console.error('Erreur recordDictationCompletion:', err);
    }
  }, [loadDictationStats]);

  // --- Générer les dictées pour UN seul texte choisi
  const handlePickText = useCallback(async (scan: ScanChoice) => {
    if (isLoaded && !isPremium) {
      Alert.alert(
        t('revision.premiumRequired'),
        t('revision.premiumRequiredMessage'),
        [
          { text: t('settings.cancel'), style: 'cancel' },
          { text: t('settings.upgradeToPremium'), onPress: () => router.push('/(tabs)/subscription') },
        ]
      );
      return;
    }
    setSelectedTextTitle(scan.title);
    setSelectedScan(scan);
    setLoadingDictations(true);
    setDictPhase('dictation');
    setCurrentDictIdx(0);
    setShowAnswer(false);
    setHasListenedOnce(false);

    let dictTexts = await generateDictationsWithAI(scan.title, scan.content);
    if (dictTexts.length === 0) dictTexts = splitTextFallback(scan.content);

    const items: DictationItem[] = dictTexts.map((text, idx) => {
      const wc = countArabicWords(text);
      let level: 'beginner' | 'intermediate' | 'advanced' = 'beginner';
      if (wc > 45) level = 'advanced';
      else if (wc > 35) level = 'intermediate';
      return { id: `d-${idx}-${Date.now()}`, text, level, wordCount: wc, sourceTitle: scan.title };
    });

    setDictationItems(items);
    setLoadingDictations(false);
  }, []);

  useEffect(() => {
    loadScanChoices();
    loadVocabulary();
    loadDictationStats();
  }, [loadScanChoices, loadVocabulary, loadDictationStats]);

  // --- Dictation
  const {
    isSpeaking,
    isPaused,
    currentText,
    setCurrentText,
    speakSentence,
    togglePlayPause,
    stop,
    rewind5s,
    rewind10s,
    changeSpeed,
    playbackSpeed,
    progress,
    submitDictation,
    dictations,
  } = useDictation();

  // --- Vocab (utilise le vocabulaire chargé depuis Supabase)
  const {
    cards: remainingCards,
    currentCard,
    currentIndex,
    isFlipped,
    setIsFlipped,
    updateDifficulty,
    getStats,
  } = useVocabCards(vocabCards);

  const { addDiacriticsToWord } = useDiacritics();
  const vocabStats = getStats();

  useEffect(() => {
    Animated.timing(flipAnim, {
      toValue: isFlipped ? 1 : 0,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [isFlipped, flipAnim]);

  // --- Dictation Handlers
  const current = dictationItems[currentDictIdx];

  const handleSpeak = () => {
    if (current && current.text) {
      __DEV__ && console.log('🎧 Lecture dictée:', current.text.substring(0, 50) + '...');
      speakSentence(current.text);
      setHasListenedOnce(true);
    }
  };

  const handleBackToTextList = () => {
    setDictPhase('select');
    setDictationItems([]);
    setCurrentDictIdx(0);
    setShowAnswer(false);
    setHasListenedOnce(false);
  };

  // --- Vocab Animations
  const frontRotate = flipAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '180deg'],
  });

  const backRotate = flipAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['180deg', '360deg'],
  });

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={[styles.container, { paddingTop: insets.top + 16 }]}>
      {/* Header + tabs partagés — uniquement pour l'onglet Vocabulaire, chaque phase de la Dictée a désormais son propre header */}
      {tab === 'vocab' && (
        <>
          <Text style={styles.header}>{t('revision.title')}</Text>

          <View style={styles.tabContainer}>
            <Pressable
              style={styles.tabButton}
              onPress={() => setTab('dictation')}
            >
              <Text style={styles.tabButtonText}>
                {t('revision.dictation')}
              </Text>
            </Pressable>
            <Pressable
              style={[styles.tabButton, styles.tabButtonActive]}
              onPress={() => setTab('vocab')}
            >
              <Text style={[styles.tabButtonText, styles.tabButtonTextActive]}>
                {t('revision.vocab')}
              </Text>
            </Pressable>
          </View>
        </>
      )}

      {/* Dictation Tab */}
      {tab === 'dictation' && (
        <View>
          {/* Bandeau abonnement requis */}
          {isLoaded && !isPremium && (
            <View style={styles.trialExpiredBanner}>
              <Text style={styles.trialExpiredText}>{t('revision.premiumRequired')}</Text>
              <Pressable style={styles.upgradeBtn} onPress={() => router.push('/(tabs)/subscription')}>
                <Text style={styles.upgradeBtnText}>{t('settings.upgradeToPremium')}</Text>
              </Pressable>
            </View>
          )}
          {/* ── Phase 0 : Accueil Révision ── */}
          {dictPhase === 'idle' && (
            <View>
              <LinearGradient
                colors={['#0D2318', '#1A4A2E']}
                start={{ x: 0, y: 0 }}
                end={{ x: 0.6, y: 1 }}
                style={styles.idleHeader}
              >
                <Text style={styles.idleHeaderTitle}>{t('revision.title')}</Text>
                {dictStats.streak > 0 && (
                  <View style={styles.streakBadge}>
                    <Text style={styles.streakBadgeText}>🔥 {t('revision.streakDays', { count: dictStats.streak })}</Text>
                  </View>
                )}

                <View style={styles.idlePillTabs}>
                  <Pressable
                    style={[styles.idlePillTab, styles.idlePillTabActive]}
                    onPress={() => setTab('dictation')}
                  >
                    <Text style={[styles.idlePillTabText, styles.idlePillTabTextActive]}>
                      {t('revision.dictation')}
                    </Text>
                  </Pressable>
                  <Pressable
                    style={styles.idlePillTab}
                    onPress={() => setTab('vocab')}
                  >
                    <Text style={styles.idlePillTabText}>
                      {t('revision.vocab')}
                    </Text>
                  </Pressable>
                </View>
              </LinearGradient>

              <LinearGradient colors={['#0D2318', '#1F5C38']} style={styles.xpCard}>
                <Text style={styles.xpCardCount}>{dictStats.totalCompleted}</Text>
                <Text style={styles.xpCardLabel}>{t('revision.segmentsCompleted')}</Text>
                <View style={styles.xpProgressTrack}>
                  <View style={[styles.xpProgressFill, { width: `${dictStats.progressInLevel * 100}%` }]} />
                </View>
                <View style={styles.xpLevelBadge}>
                  <Text style={styles.xpLevelBadgeText}>{t('revision.level', { n: dictStats.level })}</Text>
                </View>
              </LinearGradient>

              <Pressable style={styles.startDictationButton} onPress={() => setDictPhase('select')}>
                <Text style={styles.startDictationButtonText}>🎧 {t('revision.startDictation')} →</Text>
              </Pressable>

              <View style={styles.modeCardsRow}>
                <Pressable style={styles.modeCard} onPress={() => setDictPhase('select')}>
                  <Text style={styles.modeCardTitle}>{t('revision.dictation')}</Text>
                  <Text style={styles.modeCardCount}>{t('revision.dictationsAvailable', { count: scanChoices.length })}</Text>
                </Pressable>
                <Pressable style={styles.modeCard} onPress={() => setTab('vocab')}>
                  <Text style={styles.modeCardTitle}>{t('revision.vocab')}</Text>
                  <Text style={styles.modeCardCount}>{t('revision.flashcardsAvailable', { count: vocabCards.length })}</Text>
                </Pressable>
              </View>
            </View>
          )}

          {/* ── Phase 1 : Choisir le texte ── */}
          {dictPhase === 'select' && (
            <View>
              <View style={styles.selectHeader}>
                <View style={styles.selectHeaderRow}>
                  <Pressable onPress={() => setDictPhase('idle')} hitSlop={10}>
                    <Text style={styles.selectBackArrow}>←</Text>
                  </Pressable>
                  <Text style={styles.selectHeaderTitle}>{t('revision.chooseTextTitle')}</Text>
                </View>
                <Text style={styles.selectHeaderSubtitle}>{t('revision.chooseTextSubtitle')}</Text>
              </View>

              {loadingScans ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="large" color={GREEN} />
                  <Text style={styles.loadingText}>Chargement des textes…</Text>
                </View>
              ) : scanChoices.length === 0 ? (
                <View style={styles.emptyContainer}>
                  <Text style={styles.emptyText}>{t('revision.noDictations')}</Text>
                  <Text style={[styles.emptyText, { fontSize: 13, marginTop: 4 }]}>{t('revision.scanTextFirst')}</Text>
                  <Pressable style={styles.refreshButton} onPress={loadScanChoices}>
                    <Text style={styles.refreshButtonText}>🔄 {t('revision.refresh')}</Text>
                  </Pressable>
                </View>
              ) : (
                <>
                  {scanChoices.map((scan) => {
                    const segments = Math.max(1, Math.ceil(scan.wordCount / 30));
                    const practiceCount = dictStats.perScanCounts.get(scan.id) || 0;
                    return (
                      <Pressable
                        key={scan.id}
                        style={styles.textCard}
                        onPress={() => handlePickText(scan)}
                      >
                        <LinearGradient colors={['#0D2318', '#2D6A45']} style={styles.textCardIcon}>
                          <Text style={styles.textCardIconText}>📖</Text>
                        </LinearGradient>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.textCardTitle} numberOfLines={1}>{scan.title}</Text>
                          <Text style={styles.textCardMeta}>
                            {t('revision.segmentsCount', { count: segments })} · {t('revision.wordsEach')}
                          </Text>
                          {practiceCount > 0 ? (
                            <View style={[styles.practiceBadge, styles.practiceBadgeDone]}>
                              <Text style={styles.practiceBadgeDoneText}>✅ {t('revision.alreadyPracticed', { count: practiceCount })}</Text>
                            </View>
                          ) : (
                            <View style={[styles.practiceBadge, styles.practiceBadgeNew]}>
                              <Text style={styles.practiceBadgeNewText}>🆕 {t('revision.newBadge')}</Text>
                            </View>
                          )}
                        </View>
                        <Text style={styles.textCardArrow}>›</Text>
                      </Pressable>
                    );
                  })}
                  <Pressable style={[styles.refreshButton, { marginTop: 12, alignSelf: 'center' }]} onPress={loadScanChoices}>
                    <Text style={styles.refreshButtonText}>🔄 {t('revision.refresh')}</Text>
                  </Pressable>
                </>
              )}
            </View>
          )}

          {/* ── Phase 2 : Dictée (un seul texte) ── */}
          {dictPhase === 'dictation' && (
            loadingDictations ? (
              <View style={styles.card}>
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="large" color={GREEN} />
                  <Text style={styles.loadingText}>Analyse du texte en cours…</Text>
                  <Text style={{ fontSize: 14, color: GREEN, fontWeight: '600', marginTop: 6, textAlign: 'center' }}>« {selectedTextTitle} »</Text>
                </View>
              </View>
            ) : !current ? (
              <View style={styles.card}>
                <View style={styles.emptyContainer}>
                  <Text style={styles.emptyText}>Aucune dictée générée.</Text>
                  <Pressable style={styles.refreshButton} onPress={handleBackToTextList}>
                    <Text style={styles.refreshButtonText}>← Choisir un autre texte</Text>
                  </Pressable>
                </View>
              </View>
            ) : !showAnswer ? (
              /* ── Étape C : Dictée en cours ── */
              <View style={styles.dictatingScreen}>
                <Pressable style={styles.dictatingBackBar} onPress={handleBackToTextList} hitSlop={10}>
                  <Text style={styles.dictatingBackArrow}>←</Text>
                  <Text style={styles.dictatingBackTitle} numberOfLines={1}>{selectedTextTitle}</Text>
                </Pressable>

                <View style={styles.segmentPillRow}>
                  <View style={styles.segmentPill}>
                    <Text style={styles.segmentPillText}>
                      {t('revision.segmentOf', { current: currentDictIdx + 1, total: dictationItems.length })}
                    </Text>
                  </View>
                </View>
                <View style={styles.dictatingProgressTrack}>
                  <View style={[styles.dictatingProgressFill, { width: `${((currentDictIdx + 1) / dictationItems.length) * 100}%` }]} />
                </View>

                <View style={styles.instructionsColumn}>
                  <View style={styles.instructionRow}>
                    <View style={[styles.instructionCircle, isSpeaking && styles.instructionCircleActive]}>
                      <Text style={styles.instructionIcon}>🎧</Text>
                    </View>
                    <Text style={[styles.instructionLabel, isSpeaking && styles.instructionLabelActive]}>
                      {t('revision.listenCarefully')}
                    </Text>
                  </View>
                  <View style={styles.instructionRow}>
                    <View style={[styles.instructionCircle, hasListenedOnce && styles.instructionCircleActive]}>
                      <Text style={styles.instructionIcon}>✍️</Text>
                    </View>
                    <Text style={[styles.instructionLabel, hasListenedOnce && styles.instructionLabelActive]}>
                      {t('revision.writeOnSheet')}
                    </Text>
                  </View>
                  <View style={styles.instructionRow}>
                    <View style={styles.instructionCircle}>
                      <Text style={styles.instructionIcon}>👁️</Text>
                    </View>
                    <Text style={styles.instructionLabel}>
                      {t('revision.checkYourAnswerStep')}
                    </Text>
                  </View>
                </View>

                <View style={styles.audioCard}>
                  <Pressable
                    style={[styles.listenSegmentButton, isSpeaking && styles.speaking]}
                    onPress={handleSpeak}
                    disabled={isSpeaking || isPaused}
                  >
                    <Text style={styles.listenSegmentButtonText}>{t('revision.listenSegment')}</Text>
                  </Pressable>

                  {(isSpeaking || isPaused) && (
                    <View style={styles.audioControlsContainerDark}>
                      <View style={styles.progressBarContainerDark}>
                        <View style={[styles.progressBarDark, { width: `${progress}%` }]} />
                      </View>
                      <View style={styles.audioControlsRow}>
                        <Pressable style={styles.controlButtonDark} onPress={rewind10s}>
                          <Text style={styles.controlButtonDarkText}>⏪ 10s</Text>
                        </Pressable>
                        <Pressable style={styles.controlButtonDark} onPress={rewind5s}>
                          <Text style={styles.controlButtonDarkText}>⏪ 5s</Text>
                        </Pressable>
                        <Pressable style={styles.playPauseButtonDark} onPress={togglePlayPause}>
                          <Text style={styles.playPauseButtonText}>{isSpeaking ? '⏸️' : '▶️'}</Text>
                        </Pressable>
                        <Pressable style={styles.controlButtonDark} onPress={stop}>
                          <Text style={styles.controlButtonDarkText}>⏹️</Text>
                        </Pressable>
                      </View>
                      <View style={styles.speedControlContainer}>
                        <Text style={styles.speedLabelDark}>{t('revision.speed')}:</Text>
                        <View style={styles.speedButtonsRow}>
                          {PLAYBACK_SPEEDS.map((speed) => (
                            <Pressable
                              key={speed}
                              style={[styles.speedButtonDark, playbackSpeed === speed && styles.speedButtonActiveDark]}
                              onPress={() => changeSpeed(speed)}
                            >
                              <Text style={[styles.speedButtonDarkText, playbackSpeed === speed && styles.speedButtonActiveDarkText]}>{speed}x</Text>
                            </Pressable>
                          ))}
                        </View>
                      </View>
                    </View>
                  )}

                  <Text style={styles.replayHint}>{t('revision.replayAsNeeded')}</Text>
                </View>

                <Pressable style={styles.viewCorrectionButton} onPress={() => setShowAnswer(true)}>
                  <Text style={styles.viewCorrectionButtonText}>👁️ {t('revision.viewCorrection')}</Text>
                </Pressable>
              </View>
            ) : (
              /* ── Étape D : Correction ── */
              <View style={styles.dictatingScreen}>
                <Pressable style={styles.dictatingBackBar} onPress={handleBackToTextList} hitSlop={10}>
                  <Text style={styles.dictatingBackArrow}>←</Text>
                  <Text style={styles.dictatingBackTitle} numberOfLines={1}>{selectedTextTitle}</Text>
                </Pressable>

                <View style={styles.segmentPillRow}>
                  <View style={styles.segmentPill}>
                    <Text style={styles.segmentPillText}>
                      {t('revision.segmentOf', { current: currentDictIdx + 1, total: dictationItems.length })}
                    </Text>
                  </View>
                </View>
                <View style={styles.dictatingProgressTrack}>
                  <View style={[styles.dictatingProgressFill, { width: `${((currentDictIdx + 1) / dictationItems.length) * 100}%` }]} />
                </View>

                <View style={styles.heardCard}>
                  <Text style={styles.heardCardLabel}>{t('revision.whatYouHeard')}</Text>
                  <Text style={styles.heardCardText}>{current.text}</Text>
                </View>

                <LinearGradient colors={['#0a2e18', '#1a4a2e']} style={styles.correctionCard}>
                  <View style={styles.correctionHeader}>
                    <View style={styles.correctionCheckCircle}>
                      <Text style={styles.correctionCheckIcon}>✓</Text>
                    </View>
                    <Text style={styles.correctionHeaderText}>{t('revision.correctText')}</Text>
                  </View>
                  <Text style={styles.correctionText}>{current.text}</Text>
                </LinearGradient>

                <Pressable
                  style={styles.nextSegmentButton}
                  onPress={() => {
                    if (selectedScan) recordDictationCompletion(selectedScan, current.text, current.level);
                    if (currentDictIdx < dictationItems.length - 1) {
                      setCurrentDictIdx(currentDictIdx + 1);
                      setShowAnswer(false);
                      setHasListenedOnce(false);
                    } else {
                      Alert.alert(t('revision.finished'), t('revision.allDictationsComplete'), [
                        {
                          text: 'OK', onPress: () => {
                            setCurrentDictIdx(0);
                            setShowAnswer(false);
                            setHasListenedOnce(false);
                            setDictPhase('idle');
                          }
                        },
                      ]);
                    }
                  }}
                >
                  <Text style={styles.nextSegmentButtonText}>
                    {currentDictIdx < dictationItems.length - 1
                      ? `${t('revision.nextSegment')} → (${currentDictIdx + 2}/${dictationItems.length})`
                      : `🔄 ${t('revision.finished')}`}
                  </Text>
                </Pressable>

                <Pressable style={styles.replaySegmentButton} onPress={handleSpeak}>
                  <Text style={styles.replaySegmentButtonText}>{t('revision.replaySegment')}</Text>
                </Pressable>
              </View>
            )
          )}
        </View>
      )}

      {/* Vocab Tab */}
      {tab === 'vocab' && (
        <View>
          {loadingVocab ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={GREEN} />
              <Text style={styles.loadingText}>{t('revision.loadingVocab')}</Text>
            </View>
          ) : vocabCards.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>📚 {t('revision.noVocab')}</Text>
              <Text style={styles.emptyText}>
                {t('revision.extractVocabFirst')}
              </Text>
              <Text style={[styles.emptyText, { marginTop: 8, fontSize: 13 }]}>
                {t('nav.library')} → {t('libraryDetail.words')} → 🔄
              </Text>
              <Pressable style={styles.refreshButton} onPress={loadVocabulary}>
                <Text style={styles.refreshButtonText}>🔄 {t('revision.refresh')}</Text>
              </Pressable>
            </View>
          ) : !currentCard ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>{t('revision.congrats')}</Text>
              <Text style={styles.emptyText}>
                {t('revision.noCardsToday')}
              </Text>
              <Pressable style={styles.refreshButton} onPress={loadVocabulary}>
                <Text style={styles.refreshButtonText}>🔄 {t('revision.refresh')}</Text>
              </Pressable>
            </View>
          ) : (
            <>
              <View style={styles.statsRow}>
                <View style={styles.statBox}>
                  <Text style={styles.statLabel}>{t('revision.toReview')}</Text>
                  <Text style={styles.statValue}>{remainingCards.length}</Text>
                </View>
                <View style={styles.statBox}>
                  <Text style={styles.statLabel}>{t('revision.easyCards')}</Text>
                  <Text style={[styles.statValue, { color: '#4CAF50' }]}>
                    {vocabStats.easy}
                  </Text>
                </View>
                <View style={styles.statBox}>
                  <Text style={styles.statLabel}>{t('revision.mediumBtn')}</Text>
                  <Text style={[styles.statValue, { color: '#2196F3' }]}>
                    {vocabStats.medium}
                  </Text>
                </View>
                <View style={styles.statBox}>
                  <Text style={styles.statLabel}>{t('revision.hardCards')}</Text>
                  <Text style={[styles.statValue, { color: '#FF9800' }]}>
                    {vocabStats.hard}
                  </Text>
                </View>
                <View style={styles.statBox}>
                  <Text style={styles.statLabel}>{t('revision.forgotten')}</Text>
                  <Text style={[styles.statValue, { color: '#F44336' }]}>
                    {vocabStats.forgotten}
                  </Text>
                </View>
              </View>

              {/* Compteur de cartes */}
              <Text style={styles.cardCounter}>
                {vocabCards.length - remainingCards.length} / {vocabCards.length} {t('revision.cards')}
              </Text>

              <Pressable
                style={styles.cardContainer}
                onPress={() => setIsFlipped(!isFlipped)}
                activeOpacity={0.8}
              >
                <Animated.View
                  style={[
                    styles.cardFlip,
                    styles.cardFront,
                    { transform: [{ rotateY: frontRotate }] },
                  ]}
                >
                  <Text style={styles.cardWord}>
                    {addDiacriticsToWord(currentCard.wordAr)}
                  </Text>
                  <Text style={styles.cardHint}>{t('revision.tapToSee')}</Text>
                </Animated.View>

                <Animated.View
                  style={[
                    styles.cardFlip,
                    styles.cardBack,
                    { transform: [{ rotateY: backRotate }] },
                  ]}
                >
                  <Text style={styles.cardWordBack}>{currentCard.wordFr}</Text>
                  <Text style={styles.cardDefinition}>{currentCard.definition}</Text>
                </Animated.View>
              </Pressable>

              <View style={styles.buttonContainer}>
                <Pressable
                  style={[styles.button, styles.buttonForgotten]}
                  onPress={() => updateDifficulty('forgotten')}
                >
                  <Text style={styles.buttonText}>{t('revision.forgotten')}</Text>
                </Pressable>

                <Pressable
                  style={[styles.button, styles.buttonHard]}
                  onPress={() => updateDifficulty('hard')}
                >
                  <Text style={styles.buttonText}>{t('revision.hardBtn')}</Text>
                </Pressable>

                <Pressable
                  style={[styles.button, styles.buttonMedium]}
                  onPress={() => updateDifficulty('medium')}
                >
                  <Text style={styles.buttonText}>{t('revision.mediumBtn')}</Text>
                </Pressable>

                <Pressable
                  style={[styles.button, styles.buttonEasy]}
                  onPress={() => updateDifficulty('easy')}
                >
                  <Text style={styles.buttonText}>{t('revision.easyBtn')}</Text>
                </Pressable>
              </View>
            </>
          )}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    paddingBottom: 40,
    backgroundColor: '#0D2318',
  },
  trialExpiredBanner: {
    backgroundColor: '#FFEBEE',
    padding: 14,
    borderRadius: 8,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#D32F2F',
    alignItems: 'center',
  },
  trialExpiredText: { fontSize: 14, fontWeight: '700', color: '#D32F2F', textAlign: 'center' },
  upgradeBtn: { marginTop: 8, paddingVertical: 6, paddingHorizontal: 12, backgroundColor: GREEN, borderRadius: 6 },
  upgradeBtnText: { fontSize: 13, fontWeight: '600', color: 'white' },
  header: {
    fontSize: 24,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 16,
  },
  tabContainer: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 20,
  },
  tabButton: {
    flex: 1,
    backgroundColor: '#E5E7EB',
    borderWidth: 2,
    borderColor: '#D1D5DB',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  tabButtonActive: {
    backgroundColor: GREEN,
    borderColor: GREEN,
  },
  tabButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#6B7280',
  },
  tabButtonTextActive: {
    color: '#fff',
  },
  // ─── Écran Accueil (dictPhase === 'idle') ───
  idleHeader: {
    borderRadius: 20,
    padding: 20,
    alignItems: 'center',
    marginBottom: 16,
  },
  idleHeaderTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#F8F3EC',
  },
  streakBadge: {
    marginTop: 8,
    backgroundColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
  },
  streakBadgeText: {
    color: '#C9A84C',
    fontWeight: '700',
    fontSize: 13,
  },
  idlePillTabs: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 18,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 14,
    padding: 4,
    width: '100%',
  },
  idlePillTab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  idlePillTabActive: {
    backgroundColor: 'rgba(255,255,255,0.92)',
  },
  idlePillTabText: {
    fontSize: 13,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.7)',
  },
  idlePillTabTextActive: {
    color: '#0D2318',
  },
  xpCard: {
    borderRadius: 18,
    padding: 20,
    alignItems: 'center',
    marginBottom: 16,
  },
  xpCardCount: {
    fontSize: 34,
    fontWeight: '800',
    color: '#F8F3EC',
  },
  xpCardLabel: {
    fontSize: 13,
    color: 'rgba(248,243,236,0.7)',
    marginTop: 2,
    marginBottom: 14,
  },
  xpProgressTrack: {
    width: '100%',
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.15)',
    overflow: 'hidden',
  },
  xpProgressFill: {
    height: '100%',
    borderRadius: 4,
    backgroundColor: '#C9A84C',
  },
  xpLevelBadge: {
    marginTop: 12,
    backgroundColor: 'rgba(201,168,76,0.18)',
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 20,
  },
  xpLevelBadgeText: {
    color: '#C9A84C',
    fontWeight: '700',
    fontSize: 13,
  },
  startDictationButton: {
    backgroundColor: '#0D2318',
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    marginBottom: 16,
  },
  startDictationButtonText: {
    color: '#C9A84C',
    fontSize: 16,
    fontWeight: '800',
  },
  modeCardsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  modeCard: {
    flex: 1,
    backgroundColor: 'white',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E0D5',
  },
  modeCardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0D2318',
  },
  modeCardCount: {
    fontSize: 12,
    color: '#888',
    marginTop: 4,
  },
  card: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
  },
  // ─── Sélection de texte ───
  // ─── Écran Sélection texte (dictPhase === 'select') ───
  selectHeader: {
    backgroundColor: '#0D2318',
    borderRadius: 18,
    padding: 18,
    marginBottom: 16,
  },
  selectHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  selectBackArrow: {
    color: '#F8F3EC',
    fontSize: 22,
    fontWeight: '700',
  },
  selectHeaderTitle: {
    fontSize: 19,
    fontWeight: '800',
    color: '#F8F3EC',
  },
  selectHeaderSubtitle: {
    fontSize: 13,
    color: 'rgba(248,243,236,0.7)',
    marginTop: 8,
  },
  textCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E5E0D5',
    gap: 12,
  },
  textCardIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  textCardIconText: {
    fontSize: 20,
  },
  textCardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#333',
  },
  textCardMeta: {
    fontSize: 12,
    color: '#999',
    marginTop: 2,
    marginBottom: 6,
  },
  practiceBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 10,
  },
  practiceBadgeDone: {
    backgroundColor: '#E8F5E9',
  },
  practiceBadgeDoneText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#2E7D32',
  },
  practiceBadgeNew: {
    backgroundColor: '#FFF3E0',
  },
  practiceBadgeNewText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#E65100',
  },
  textCardArrow: {
    fontSize: 22,
    color: '#0D2318',
    fontWeight: '700',
  },
  // ─── Bandeau retour ───
  backBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0f8f0',
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
    gap: 8,
  },
  backBarTitle: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: '#555',
  },
  dictCounter: {
    fontSize: 13,
    fontWeight: '600',
    color: GREEN,
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    overflow: 'hidden',
  },
  levelBadge: {
    backgroundColor: '#e3f2fd',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    alignSelf: 'flex-start',
    marginBottom: 16,
  },
  levelText: {
    fontSize: 12,
    fontWeight: '600',
    color: BLUE,
  },
  instructionsContainer: {
    backgroundColor: '#E3F2FD',
    padding: 16,
    borderRadius: 8,
    marginBottom: 16,
    gap: 8,
  },
  instruction: {
    fontSize: 15,
    color: '#1976d2',
    textAlign: 'center',
    fontWeight: '500',
  },
  speakButton: {
    backgroundColor: GREEN,
    paddingVertical: 14,
    borderRadius: 8,
    marginBottom: 16,
    alignItems: 'center',
  },
  speaking: {
    backgroundColor: '#FFC107',
    opacity: 0.8,
  },
  speakButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
  },
  showAnswerButton: {
    backgroundColor: GREEN,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginHorizontal: 20,
  },
  showAnswerButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  answerCard: {
    backgroundColor: '#E8F5E9',
    borderRadius: 8,
    padding: 16,
    marginTop: 16,
    borderWidth: 2,
    borderColor: '#4CAF50',
  },
  answerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  answerHeaderText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#2E7D32',
  },
  answerText: {
    fontSize: 20,
    textAlign: 'right',
    color: '#1B5E20',
    lineHeight: 32,
    fontWeight: '500',
    marginBottom: 16,
  },
  nextButton: {
    backgroundColor: GREEN,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  nextButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  nextButtonMain: {
    backgroundColor: '#1976d2',
    paddingVertical: 16,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 16,
  },
  nextButtonMainText: {
    color: 'white',
    fontSize: 17,
    fontWeight: '700',
  },
  stats: {
    marginTop: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#eee',
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  statsText: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  statBox: {
    flex: 1,
    backgroundColor: 'white',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 12,
    color: '#999',
    marginBottom: 4,
  },
  statValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  cardContainer: {
    height: 300,
    marginBottom: 20,
  },
  cardFlip: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    backgroundColor: 'white',
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 30,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'visible' as any,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
    backfaceVisibility: 'hidden',
  },
  cardFront: {
    backgroundColor: BLUE,
  },
  cardBack: {
    backgroundColor: '#4CAF50',
  },
  cardWord: {
    fontSize: 48,
    fontWeight: 'bold',
    color: 'white',
    lineHeight: 80,
    marginBottom: 16,
    textAlign: 'center',
  },
  cardWordBack: {
    fontSize: 36,
    fontWeight: '600',
    color: 'white',
    marginBottom: 12,
    textAlign: 'center',
  },
  cardDefinition: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.9)',
    textAlign: 'center',
    lineHeight: 20,
  },
  cardHint: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
  },
  buttonContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'space-between',
  },
  button: {
    width: '48%',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 8,
  },
  buttonForgotten: {
    backgroundColor: '#f44336',
  },
  buttonHard: {
    backgroundColor: '#FF9800',
  },
  buttonMedium: {
    backgroundColor: '#FFC107',
  },
  buttonEasy: {
    backgroundColor: '#4CAF50',
  },
  buttonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  emptyCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 40,
    alignItems: 'center',
    marginTop: 40,
  },
  emptyTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 12,
    color: '#4CAF50',
  },
  emptyText: {
    fontSize: 16,
    color: '#999',
    textAlign: 'center',
  },
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dictationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  wordCountBadge: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  refreshButton: {
    backgroundColor: GREEN,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 16,
  },
  refreshButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  refreshSmall: {
    padding: 8,
  },
  refreshSmallText: {
    fontSize: 20,
  },
  // Audio Controls Styles
  audioControlsContainer: {
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  progressBarContainer: {
    height: 6,
    backgroundColor: '#ddd',
    borderRadius: 3,
    marginBottom: 16,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    backgroundColor: GREEN,
    borderRadius: 3,
  },
  audioControlsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  controlButton: {
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  controlButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  playPauseButton: {
    backgroundColor: GREEN,
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  playPauseButtonText: {
    fontSize: 24,
  },
  speedControlContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  speedLabel: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  speedButtonsRow: {
    flexDirection: 'row',
    gap: 6,
  },
  speedButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
  },
  speedButtonActive: {
    backgroundColor: GREEN,
    borderColor: GREEN,
  },
  speedButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
  },
  speedButtonTextActive: {
    color: '#fff',
  },
  cardCounter: {
    textAlign: 'center',
    fontSize: 14,
    color: '#666',
    marginBottom: 12,
    fontWeight: '500',
  },
  // ─── Écran Dictée en cours (dictPhase === 'dictation' && !showAnswer) ───
  dictatingScreen: {
    backgroundColor: '#0D2318',
    borderRadius: 20,
    padding: 18,
  },
  dictatingBackBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
  },
  dictatingBackArrow: {
    color: '#F8F3EC',
    fontSize: 20,
    fontWeight: '700',
  },
  dictatingBackTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(248,243,236,0.85)',
  },
  segmentPillRow: {
    alignItems: 'center',
    marginBottom: 10,
  },
  segmentPill: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 20,
  },
  segmentPillText: {
    color: '#C9A84C',
    fontSize: 13,
    fontWeight: '700',
  },
  dictatingProgressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.15)',
    overflow: 'hidden',
    marginBottom: 22,
  },
  dictatingProgressFill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: '#C9A84C',
  },
  instructionsColumn: {
    gap: 14,
    marginBottom: 20,
  },
  instructionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  instructionCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  instructionCircleActive: {
    backgroundColor: 'rgba(201,168,76,0.2)',
  },
  instructionIcon: {
    fontSize: 18,
  },
  instructionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(248,243,236,0.5)',
  },
  instructionLabelActive: {
    color: '#C9A84C',
  },
  audioCard: {
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  listenSegmentButton: {
    backgroundColor: '#C9A84C',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  listenSegmentButtonText: {
    color: '#0D2318',
    fontSize: 15,
    fontWeight: '800',
  },
  audioControlsContainerDark: {
    marginTop: 14,
  },
  progressBarContainerDark: {
    height: 6,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 3,
    marginBottom: 14,
    overflow: 'hidden',
  },
  progressBarDark: {
    height: '100%',
    backgroundColor: '#C9A84C',
    borderRadius: 3,
  },
  controlButtonDark: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  controlButtonDarkText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#F8F3EC',
  },
  playPauseButtonDark: {
    backgroundColor: '#C9A84C',
    width: 52,
    height: 52,
    borderRadius: 26,
    justifyContent: 'center',
    alignItems: 'center',
  },
  speedLabelDark: {
    fontSize: 13,
    color: 'rgba(248,243,236,0.6)',
    fontWeight: '500',
  },
  speedButtonDark: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  speedButtonActiveDark: {
    backgroundColor: '#C9A84C',
    borderColor: '#C9A84C',
  },
  speedButtonDarkText: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(248,243,236,0.7)',
  },
  speedButtonActiveDarkText: {
    color: '#0D2318',
  },
  replayHint: {
    fontSize: 12,
    color: 'rgba(248,243,236,0.5)',
    textAlign: 'center',
    marginTop: 14,
  },
  viewCorrectionButton: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  viewCorrectionButtonText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 14,
    fontWeight: '700',
  },
  // ─── Écran Correction (dictPhase === 'dictation' && showAnswer) ───
  heardCard: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
  },
  heardCardLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: 'rgba(248,243,236,0.5)',
    marginBottom: 6,
  },
  heardCardText: {
    fontSize: 16,
    color: 'rgba(248,243,236,0.6)',
    fontStyle: 'italic',
    textAlign: 'right',
    writingDirection: 'rtl',
    lineHeight: 26,
  },
  correctionCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(106,191,75,0.2)',
    padding: 16,
    marginBottom: 16,
  },
  correctionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  correctionCheckCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#4CAF50',
    justifyContent: 'center',
    alignItems: 'center',
  },
  correctionCheckIcon: {
    color: 'white',
    fontSize: 13,
    fontWeight: '900',
  },
  correctionHeaderText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#F8F3EC',
  },
  correctionText: {
    fontSize: 20,
    color: 'white',
    textAlign: 'right',
    writingDirection: 'rtl',
    lineHeight: 34,
    fontWeight: '500',
  },
  nextSegmentButton: {
    backgroundColor: '#C9A84C',
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    marginBottom: 10,
  },
  nextSegmentButtonText: {
    color: '#0D2318',
    fontSize: 16,
    fontWeight: '800',
  },
  replaySegmentButton: {
    backgroundColor: 'rgba(255,255,255,0.07)',
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: 'center',
  },
  replaySegmentButtonText: {
    color: 'rgba(248,243,236,0.75)',
    fontSize: 14,
    fontWeight: '600',
  },
});
