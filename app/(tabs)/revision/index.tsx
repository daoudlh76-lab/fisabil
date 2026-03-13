import { useDictation, PLAYBACK_SPEEDS } from '@/hooks/use-dictation';
import { useVocabCards, VocabCard } from '@/hooks/use-vocab-cards';
import { useDiacritics } from '@/hooks/use-diacritics-local';
import { useLanguage } from '@/hooks/use-language';
import { supabase } from '@/src/lib/supabase';
import { invokeEdge } from '@/src/lib/edge-ai';
import { migrateExtractVocabResult, needsMigration } from '@/src/lib/migrate-vocab-data';
import { getLocalVocab } from '@/src/lib/local-cache';
import { useSubscription } from '@/contexts/subscription-context';
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

export default function RevisionScreen() {
  const { t, language } = useLanguage();
  const { isPremium, isLoaded } = useSubscription();
  const router = useRouter();
  const [tab, setTab] = useState<'dictation' | 'vocab'>('dictation');
  const [dictPhase, setDictPhase] = useState<'select' | 'dictation'>('select');
  const [currentDictIdx, setCurrentDictIdx] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [flipAnim] = useState(new Animated.Value(0));
  const [dictationItems, setDictationItems] = useState<DictationItem[]>([]);
  const [loadingDictations, setLoadingDictations] = useState(false);
  const [loadingScans, setLoadingScans] = useState(true);
  const [scanChoices, setScanChoices] = useState<ScanChoice[]>([]);
  const [selectedTextTitle, setSelectedTextTitle] = useState('');
  const [vocabCards, setVocabCards] = useState<VocabCard[]>([]);
  const [loadingVocab, setLoadingVocab] = useState(true);

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
    setLoadingDictations(true);
    setDictPhase('dictation');
    setCurrentDictIdx(0);
    setShowAnswer(false);

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
  }, [loadScanChoices, loadVocabulary]);

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
    }
  };

  const handleBackToTextList = () => {
    setDictPhase('select');
    setDictationItems([]);
    setCurrentDictIdx(0);
    setShowAnswer(false);
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
    <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.container}>
      {/* Header */}
      <Text style={styles.header}>{t('revision.title')}</Text>

      {/* Tab Buttons */}
      <View style={styles.tabContainer}>
        <Pressable
          style={[styles.tabButton, tab === 'dictation' && styles.tabButtonActive]}
          onPress={() => setTab('dictation')}
        >
          <Text style={[styles.tabButtonText, tab === 'dictation' && styles.tabButtonTextActive]}>
            {t('revision.dictation')}
          </Text>
        </Pressable>
        <Pressable
          style={[styles.tabButton, tab === 'vocab' && styles.tabButtonActive]}
          onPress={() => setTab('vocab')}
        >
          <Text style={[styles.tabButtonText, tab === 'vocab' && styles.tabButtonTextActive]}>
            {t('revision.vocab')}
          </Text>
        </Pressable>
      </View>

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
          {/* ── Phase 1 : Choisir le texte ── */}
          {dictPhase === 'select' && (
            <View style={styles.card}>
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
                  <Text style={styles.pickTitle}>📖 Choisir un texte pour la dictée</Text>
                  <Text style={styles.pickSubtitle}>Les dictées seront créées à partir du texte choisi uniquement.</Text>
                  {scanChoices.map((scan, idx) => (
                    <Pressable
                      key={scan.id}
                      style={styles.pickCard}
                      onPress={() => handlePickText(scan)}
                    >
                      <View style={styles.pickCardRow}>
                        <View style={styles.pickCardNum}>
                          <Text style={styles.pickCardNumText}>{idx + 1}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.pickCardTitle} numberOfLines={1}>{scan.title}</Text>
                          <Text style={styles.pickCardMeta}>{scan.wordCount} mots</Text>
                        </View>
                        <Text style={{ color: GREEN, fontSize: 16 }}>▶</Text>
                      </View>
                      <Text style={styles.pickCardPreview} numberOfLines={2}>
                        {scan.content.substring(0, 100)}…
                      </Text>
                    </Pressable>
                  ))}
                  <Pressable style={[styles.refreshButton, { marginTop: 12, alignSelf: 'center' }]} onPress={loadScanChoices}>
                    <Text style={styles.refreshButtonText}>🔄 {t('revision.refresh')}</Text>
                  </Pressable>
                </>
              )}
            </View>
          )}

          {/* ── Phase 2 : Dictée (un seul texte) ── */}
          {dictPhase === 'dictation' && (
            <View style={styles.card}>
              {loadingDictations ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="large" color={GREEN} />
                  <Text style={styles.loadingText}>Analyse du texte en cours…</Text>
                  <Text style={{ fontSize: 14, color: GREEN, fontWeight: '600', marginTop: 6, textAlign: 'center' }}>« {selectedTextTitle} »</Text>
                </View>
              ) : !current ? (
                <View style={styles.emptyContainer}>
                  <Text style={styles.emptyText}>Aucune dictée générée.</Text>
                  <Pressable style={styles.refreshButton} onPress={handleBackToTextList}>
                    <Text style={styles.refreshButtonText}>← Choisir un autre texte</Text>
                  </Pressable>
                </View>
              ) : (
                <>
                  {/* Bandeau retour + titre */}
                  <Pressable style={styles.backBar} onPress={handleBackToTextList}>
                    <Text style={{ color: GREEN, fontWeight: 'bold', fontSize: 18 }}>←</Text>
                    <Text style={styles.backBarTitle} numberOfLines={1}>{selectedTextTitle}</Text>
                    <Text style={{ color: GREEN, fontSize: 13, fontWeight: '600' }}>Changer</Text>
                  </Pressable>

                  <View style={styles.dictationHeader}>
                    <View style={styles.levelBadge}>
                      <Text style={styles.levelText}>{t(`revision.${current.level}`)}</Text>
                    </View>
                    <Text style={styles.wordCountBadge}>
                      📝 {current.wordCount} {t('revision.words')}
                    </Text>
                    <Text style={styles.dictCounter}>
                      {currentDictIdx + 1}/{dictationItems.length}
                    </Text>
                  </View>

                  <View style={styles.instructionsContainer}>
                    <Text style={styles.instruction}>📝 {t('revision.listenCarefully')}</Text>
                    <Text style={styles.instruction}>✍️ {t('revision.writeOnPaper')}</Text>
                    <Text style={styles.instruction}>👁️ {t('revision.checkYourAnswer')}</Text>
                  </View>

                  <Pressable
                    style={[styles.speakButton, isSpeaking && styles.speaking]}
                    onPress={handleSpeak}
                    disabled={isSpeaking || isPaused}
                  >
                    <Text style={styles.speakButtonText}>🎧 {t('revision.listen')}</Text>
                  </Pressable>

                  {(isSpeaking || isPaused) && (
                    <View style={styles.audioControlsContainer}>
                      <View style={styles.progressBarContainer}>
                        <View style={[styles.progressBar, { width: `${progress}%` }]} />
                      </View>
                      <View style={styles.audioControlsRow}>
                        <Pressable style={styles.controlButton} onPress={rewind10s}>
                          <Text style={styles.controlButtonText}>⏪ 10s</Text>
                        </Pressable>
                        <Pressable style={styles.controlButton} onPress={rewind5s}>
                          <Text style={styles.controlButtonText}>⏪ 5s</Text>
                        </Pressable>
                        <Pressable style={styles.playPauseButton} onPress={togglePlayPause}>
                          <Text style={styles.playPauseButtonText}>{isSpeaking ? '⏸️' : '▶️'}</Text>
                        </Pressable>
                        <Pressable style={styles.controlButton} onPress={stop}>
                          <Text style={styles.controlButtonText}>⏹️</Text>
                        </Pressable>
                      </View>
                      <View style={styles.speedControlContainer}>
                        <Text style={styles.speedLabel}>{t('revision.speed')}:</Text>
                        <View style={styles.speedButtonsRow}>
                          {PLAYBACK_SPEEDS.map((speed) => (
                            <Pressable
                              key={speed}
                              style={[styles.speedButton, playbackSpeed === speed && styles.speedButtonActive]}
                              onPress={() => changeSpeed(speed)}
                            >
                              <Text style={[styles.speedButtonText, playbackSpeed === speed && styles.speedButtonTextActive]}>{speed}x</Text>
                            </Pressable>
                          ))}
                        </View>
                      </View>
                    </View>
                  )}

                  <View style={styles.buttonRow}>
                    <Pressable style={styles.showAnswerButton} onPress={() => setShowAnswer(!showAnswer)}>
                      <Text style={styles.showAnswerButtonText}>
                        {showAnswer ? '🔒 ' + t('revision.hideAnswer') : '👁️ ' + t('revision.showAnswer')}
                      </Text>
                    </Pressable>
                  </View>

                  {showAnswer && (
                    <View style={styles.answerCard}>
                      <View style={styles.answerHeader}>
                        <Text style={styles.answerHeaderText}>✅ {t('revision.correctAnswer')}</Text>
                      </View>
                      <Text style={styles.answerText}>{current.text}</Text>
                    </View>
                  )}

                  {/* Bouton Suivant toujours visible */}
                  <Pressable
                    style={styles.nextButtonMain}
                    onPress={() => {
                      if (currentDictIdx < dictationItems.length - 1) {
                        setCurrentDictIdx(currentDictIdx + 1);
                        setShowAnswer(false);
                      } else {
                        Alert.alert(t('revision.finished'), t('revision.allDictationsComplete'), [
                          { text: 'OK', onPress: () => { setCurrentDictIdx(0); setShowAnswer(false); } },
                        ]);
                      }
                    }}
                  >
                    <Text style={styles.nextButtonMainText}>
                      {currentDictIdx < dictationItems.length - 1
                        ? `➡️ ${t('revision.next')} (${currentDictIdx + 2}/${dictationItems.length})`
                        : '🔄 Terminé — Recommencer'}
                    </Text>
                  </Pressable>
                </>
              )}
            </View>
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
    backgroundColor: 'transparent',
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
  card: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
  },
  // ─── Sélection de texte ───
  pickTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  pickSubtitle: {
    fontSize: 13,
    color: '#888',
    marginBottom: 14,
  },
  pickCard: {
    backgroundColor: '#f9f9f9',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e8e8e8',
  },
  pickCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  pickCardNum: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: GREEN,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  pickCardNumText: {
    color: 'white',
    fontSize: 13,
    fontWeight: 'bold',
  },
  pickCardTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#333',
  },
  pickCardMeta: {
    fontSize: 11,
    color: '#999',
    marginTop: 1,
  },
  pickCardPreview: {
    fontSize: 13,
    color: '#777',
    textAlign: 'right',
    lineHeight: 20,
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
});
