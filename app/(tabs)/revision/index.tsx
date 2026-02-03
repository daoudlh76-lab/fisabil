import { useDictation, PLAYBACK_SPEEDS } from '@/hooks/use-dictation';
import { useVocabCards, VocabCard } from '@/hooks/use-vocab-cards';
import { useDiacritics } from '@/hooks/use-diacritics-local';
import { useLanguage } from '@/hooks/use-language';
import { supabase } from '@/src/lib/supabase';
import { migrateExtractVocabResult, needsMigration } from '@/src/lib/migrate-vocab-data';
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
const MIN_WORDS_PER_DICTATION = 30;

// Fonction pour compter les mots arabes
function countArabicWords(text: string): number {
  return text.trim().split(/\s+/).filter(w => w.length > 0).length;
}

// Fonction pour extraire les phrases d'un texte
function extractSentences(text: string): string[] {
  const sentences = text
    .split(/[.،؟!؛\n]+/)
    .map(s => s.trim())
    .filter(s => s.length > 5);
  return sentences;
}

// Fonction pour créer une dictée d'au moins 30 mots
function createDictationFromSentences(sentences: string[], minWords: number): string {
  const shuffled = [...sentences].sort(() => Math.random() - 0.5);
  const selected: string[] = [];
  let wordCount = 0;
  
  for (const sentence of shuffled) {
    if (wordCount >= minWords) break;
    selected.push(sentence);
    wordCount += countArabicWords(sentence);
  }
  
  return selected.join(' ، ');
}

type DictationItem = {
  id: string;
  text: string;
  level: 'beginner' | 'intermediate' | 'advanced';
  wordCount: number;
};

const SAMPLE_DICTATIONS: DictationItem[] = [
  {
    id: '1',
    text: 'الحمد لله رب العالمين الرحمن الرحيم مالك يوم الدين إياك نعبد وإياك نستعين اهدنا الصراط المستقيم',
    level: 'beginner',
    wordCount: 19,
  },
];

export default function RevisionScreen() {
  const { t, language } = useLanguage();
  const [tab, setTab] = useState<'dictation' | 'vocab'>('dictation');
  const [currentDictIdx, setCurrentDictIdx] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [flipAnim] = useState(new Animated.Value(0));
  const [dictationItems, setDictationItems] = useState<DictationItem[]>(SAMPLE_DICTATIONS);
  const [loadingDictations, setLoadingDictations] = useState(true);
  const [vocabCards, setVocabCards] = useState<VocabCard[]>([]);
  const [loadingVocab, setLoadingVocab] = useState(true);

  // --- Charger le vocabulaire depuis le cache AI (ai_cache)
  const loadVocabulary = useCallback(async () => {
    try {
      setLoadingVocab(true);
      
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user?.id;
      
      console.log('🎴 Chargement vocabulaire pour user:', userId || 'NON CONNECTÉ');
      
      if (!userId) {
        console.log('⚠️ Pas de session, pas de vocabulaire');
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
        console.error('❌ Erreur chargement scans:', scansError);
        setVocabCards([]);
        setLoadingVocab(false);
        return;
      }

      console.log('📄 Scans trouvés:', scans?.length || 0);

      if (!scans || scans.length === 0) {
        setVocabCards([]);
        setLoadingVocab(false);
        return;
      }

      // Charger le vocabulaire depuis le cache AI pour chaque scan
      const allCards: VocabCard[] = [];
      let cardIndex = 0;

      for (const scan of scans) {
        // Chercher le cache de vocabulaire pour ce scan - priorité à la langue UI actuelle
        const cacheKeys = [
          `ai_vocab_${scan.id}_${language}`, // Langue actuelle en premier
          `ai_vocab_${scan.id}_fr`,
          `ai_vocab_${scan.id}_en`,
          `ai_vocab_${scan.id}_de`,
          `ai_vocab_${scan.id}_es`,
          `ai_vocab_${scan.id}_ru`,
        ];

        // Éliminer les doublons si la langue est déjà dans la liste
        const uniqueKeys = [...new Set(cacheKeys)];

        let vocabData = null;

        for (const cacheKey of uniqueKeys) {
          const { data: cached, error: cacheError } = await supabase
            .from('ai_cache')
            .select('payload')
            .eq('key', cacheKey)
            .maybeSingle();

          if (cacheError) {
            console.error('❌ Erreur cache:', cacheKey, cacheError);
            continue;
          }

          if (cached?.payload) {
            // Migrer automatiquement si nécessaire
            vocabData = needsMigration(cached.payload)
              ? migrateExtractVocabResult(cached.payload)
              : cached.payload;
            console.log('📦 Cache trouvé pour:', cacheKey, 'avec', {
              vocab: vocabData.vocabulaire?.length || 0,
              verbes: vocabData.verbes?.length || 0,
              particules: vocabData.particules?.length || 0,
            });
            break;
          }
        }

        if (!vocabData) {
          console.log('⚠️ Pas de cache vocabulaire pour scan:', scan.title, '- vous devez extraire le vocabulaire depuis la bibliothèque');
          continue;
        }

        // Ajouter les mots de vocabulaire (singulier)
        if (vocabData.vocabulaire && Array.isArray(vocabData.vocabulaire)) {
          for (const item of vocabData.vocabulaire) {
            if (item.singulier && item.traduction) {
              allCards.push({
                id: `vocab-${cardIndex++}`,
                scanId: scan.id, // UUID du scan
                wordAr: item.singulier,
                wordFr: item.traduction,
                definition: item.remarque || (item.pluriel ? `ج: ${item.pluriel}` : '') || '',
                difficulty: 'medium',
                lastReviewed: null,
                nextReview: new Date(),
                reviewCount: 0,
              });
            }
          }
        }

        // Ajouter les verbes (forme au passé)
        if (vocabData.verbes && Array.isArray(vocabData.verbes)) {
          for (const item of vocabData.verbes) {
            if (item.passe_3ms && item.traduction) {
              allCards.push({
                id: `verb-${cardIndex++}`,
                scanId: scan.id, // UUID du scan
                wordAr: item.passe_3ms,
                wordFr: item.traduction,
                definition: `${item.present_3ms || ''} / ${item.imperatif || ''}`.replace(/^\s*\/\s*$/, '').trim(),
                difficulty: 'medium',
                lastReviewed: null,
                nextReview: new Date(),
                reviewCount: 0,
              });
            }
          }
        }

        // Ajouter les particules
        if (vocabData.particules && Array.isArray(vocabData.particules)) {
          for (const item of vocabData.particules) {
            if (item.particule_ar && item.traduction) {
              allCards.push({
                id: `particle-${cardIndex++}`,
                scanId: scan.id, // UUID du scan
                wordAr: item.particule_ar,
                wordFr: item.traduction,
                definition: item.exemple || item.type || '',
                difficulty: 'easy',
                lastReviewed: null,
                nextReview: new Date(),
                reviewCount: 0,
              });
            }
          }
        }
      }

      // Mélanger les cartes
      const shuffled = allCards.sort(() => Math.random() - 0.5);
      
      console.log('✅ Vocabulaire chargé:', shuffled.length, 'cartes');
      setVocabCards(shuffled);
    } catch (error) {
      console.error('❌ Erreur:', error);
      setVocabCards([]);
    } finally {
      setLoadingVocab(false);
    }
  }, [language]);

  // --- Charger les dictées depuis Supabase
  const loadDictations = useCallback(async () => {
    try {
      setLoadingDictations(true);
      
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user?.id;
      
      console.log('🔐 User ID:', userId || 'NON CONNECTÉ');
      
      if (!userId) {
        console.log('⚠️ Pas de session, utilisation des exemples par défaut');
        setDictationItems(SAMPLE_DICTATIONS);
        setLoadingDictations(false);
        return;
      }

      // Charger tous les scans de l'utilisateur
      console.log('📚 Chargement des scans pour user:', userId);
      const { data: scans, error } = await supabase
        .from('scans')
        .select('id, title, content')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('❌ Erreur chargement scans:', error);
        setDictationItems(SAMPLE_DICTATIONS);
        setLoadingDictations(false);
        return;
      }

      console.log('📄 Scans trouvés:', scans?.length || 0);
      
      if (!scans || scans.length === 0) {
        console.log('⚠️ Aucun scan trouvé');
        setDictationItems(SAMPLE_DICTATIONS);
        setLoadingDictations(false);
        return;
      }

      // Extraire toutes les phrases de tous les textes
      const allSentences: string[] = [];
      
      for (const scan of scans) {
        if (scan.content) {
          console.log('📄 Scan:', scan.title, '- contenu:', scan.content.substring(0, 50) + '...');
          const sentences = extractSentences(scan.content);
          allSentences.push(...sentences);
        }
      }

      console.log('📝 Total phrases extraites:', allSentences.length);

      if (allSentences.length === 0) {
        setDictationItems(SAMPLE_DICTATIONS);
        setLoadingDictations(false);
        return;
      }

      // Créer plusieurs dictées aléatoires
      const numDictations = Math.min(5, Math.ceil(allSentences.length / 3));
      const items: DictationItem[] = [];
      
      for (let i = 0; i < numDictations; i++) {
        const dictationText = createDictationFromSentences(allSentences, MIN_WORDS_PER_DICTATION);
        const wordCount = countArabicWords(dictationText);
        
        let level: 'beginner' | 'intermediate' | 'advanced' = 'beginner';
        if (wordCount > 50) level = 'advanced';
        else if (wordCount > 35) level = 'intermediate';

        items.push({
          id: `dictation-${i}-${Date.now()}`,
          text: dictationText,
          level,
          wordCount,
        });
      }

      console.log('✅ Dictées créées:', items.length, 'avec', items[0]?.wordCount, 'mots');
      setDictationItems(items);
    } catch (error) {
      console.error('❌ Erreur:', error);
      setDictationItems(SAMPLE_DICTATIONS);
    } finally {
      setLoadingDictations(false);
    }
  }, []);

  useEffect(() => {
    loadDictations();
    loadVocabulary();
  }, [loadDictations, loadVocabulary]);

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
      console.log('🎧 Lecture dictée:', current.text.substring(0, 50) + '...');
      speakSentence(current.text);
    }
  };

  const handleRefreshDictations = () => {
    setCurrentDictIdx(0);
    setShowAnswer(false);
    loadDictations();
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
    <ScrollView contentContainerStyle={styles.container}>
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
        <View style={styles.card}>
          {loadingDictations ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={GREEN} />
              <Text style={styles.loadingText}>{t('revision.loadingDictations')}</Text>
            </View>
          ) : !current ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>{t('revision.noDictations')}</Text>
              <Pressable style={styles.refreshButton} onPress={handleRefreshDictations}>
                <Text style={styles.refreshButtonText}>🔄 {t('revision.refresh')}</Text>
              </Pressable>
            </View>
          ) : (
            <>
              <View style={styles.dictationHeader}>
                <View style={styles.levelBadge}>
                  <Text style={styles.levelText}>{t(`revision.${current.level}`)}</Text>
                </View>
                <Text style={styles.wordCountBadge}>
                  📝 {current.wordCount} {t('revision.words')}
                </Text>
                <Pressable style={styles.refreshSmall} onPress={handleRefreshDictations}>
                  <Text style={styles.refreshSmallText}>🔄</Text>
                </Pressable>
              </View>

              <View style={styles.instructionsContainer}>
                <Text style={styles.instruction}>
                  📝 {t('revision.listenCarefully')}
                </Text>
                <Text style={styles.instruction}>
                  ✍️ {t('revision.writeOnPaper')}
                </Text>
                <Text style={styles.instruction}>
                  👁️ {t('revision.checkYourAnswer')}
                </Text>
              </View>

              {/* Bouton principal de lecture */}
              <Pressable
                style={[styles.speakButton, isSpeaking && styles.speaking]}
                onPress={handleSpeak}
                disabled={isSpeaking || isPaused}
              >
                <Text style={styles.speakButtonText}>
                  🎧 {t('revision.listen')}
                </Text>
              </Pressable>

              {/* Contrôles audio avancés */}
              {(isSpeaking || isPaused) && (
                <View style={styles.audioControlsContainer}>
                  {/* Barre de progression */}
                  <View style={styles.progressBarContainer}>
                    <View style={[styles.progressBar, { width: `${progress}%` }]} />
                  </View>

                  {/* Boutons de contrôle */}
                  <View style={styles.audioControlsRow}>
                    {/* Retour 10s */}
                    <Pressable style={styles.controlButton} onPress={rewind10s}>
                      <Text style={styles.controlButtonText}>⏪ 10s</Text>
                    </Pressable>

                    {/* Retour 5s */}
                    <Pressable style={styles.controlButton} onPress={rewind5s}>
                      <Text style={styles.controlButtonText}>⏪ 5s</Text>
                    </Pressable>

                    {/* Play/Pause */}
                    <Pressable style={styles.playPauseButton} onPress={togglePlayPause}>
                      <Text style={styles.playPauseButtonText}>
                        {isSpeaking ? '⏸️' : '▶️'}
                      </Text>
                    </Pressable>

                    {/* Stop */}
                    <Pressable style={styles.controlButton} onPress={stop}>
                      <Text style={styles.controlButtonText}>⏹️</Text>
                    </Pressable>
                  </View>

                  {/* Sélecteur de vitesse */}
                  <View style={styles.speedControlContainer}>
                    <Text style={styles.speedLabel}>{t('revision.speed')}:</Text>
                    <View style={styles.speedButtonsRow}>
                      {PLAYBACK_SPEEDS.map((speed) => (
                        <Pressable
                          key={speed}
                          style={[
                            styles.speedButton,
                            playbackSpeed === speed && styles.speedButtonActive,
                          ]}
                          onPress={() => changeSpeed(speed)}
                        >
                          <Text
                            style={[
                              styles.speedButtonText,
                              playbackSpeed === speed && styles.speedButtonTextActive,
                            ]}
                          >
                            {speed}x
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>
                </View>
              )}

              <View style={styles.buttonRow}>
                <Pressable
                  style={styles.showAnswerButton}
                  onPress={() => setShowAnswer(!showAnswer)}
                >
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

                  <Pressable
                    style={styles.nextButton}
                    onPress={() => {
                      if (currentDictIdx < dictationItems.length - 1) {
                        setCurrentDictIdx(currentDictIdx + 1);
                        setShowAnswer(false);
                      } else {
                        Alert.alert(
                          t('revision.finished'),
                          t('revision.allDictationsComplete'),
                          [
                            {
                              text: 'OK',
                              onPress: () => {
                                setCurrentDictIdx(0);
                                setShowAnswer(false);
                                loadDictations();
                              },
                            },
                          ]
                        );
                      }
                    }}
                  >
                    <Text style={styles.nextButtonText}>
                      {currentDictIdx < dictationItems.length - 1 ? t('revision.next') : '🔄'}
                    </Text>
                  </Pressable>
                </View>
              )}

              <View style={styles.stats}>
                <Text style={styles.statsText}>
                  {currentDictIdx + 1} / {dictationItems.length}
                </Text>
              </View>
            </>
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
                  <Text style={styles.statValue}>{vocabStats.toReview}</Text>
                </View>
                <View style={styles.statBox}>
                  <Text style={styles.statLabel}>{t('revision.easyCards')}</Text>
                  <Text style={[styles.statValue, { color: '#4CAF50' }]}>
                    {vocabStats.easy}
                  </Text>
                </View>
                <View style={styles.statBox}>
                  <Text style={styles.statLabel}>{t('revision.hardCards')}</Text>
                  <Text style={[styles.statValue, { color: '#FF9800' }]}>
                    {vocabStats.hard}
                  </Text>
                </View>
              </View>

              {/* Compteur de cartes */}
              <Text style={styles.cardCounter}>
                {currentIndex + 1} / {vocabCards.length} {t('revision.cards')}
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
    padding: 20,
    justifyContent: 'center',
    alignItems: 'center',
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
