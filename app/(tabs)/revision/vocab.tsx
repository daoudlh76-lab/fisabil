import { useVocabCards, VocabCard } from '@/hooks/use-vocab-cards';
import { useLanguage } from '@/hooks/use-language';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Animated,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { useDiacritics } from '@/hooks/use-diacritics-local';
import { supabase } from '@/src/lib/supabase';

export default function VocabCardsScreen() {
  const { t } = useLanguage();
  const [vocabCards, setVocabCards] = useState<VocabCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);

  // Charger le vocabulaire réel depuis la base de données
  useEffect(() => {
    loadUserVocabulary();
  }, []);

  const loadUserVocabulary = async () => {
    try {
      setLoading(true);

      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user?.id;

      if (!userId) {
        console.log('❌ Pas d\'utilisateur connecté');
        setLoading(false);
        return;
      }

      // Charger TOUT le vocabulaire de l'utilisateur ET sa progression
      const [{ data: vocab, error: vocabError }, { data: progress, error: progressError }] = await Promise.all([
        supabase
          .from('vocabulary')
          .select('id, word, translation, singulier, pluriel, contraire, racine')
          .eq('user_id', userId)
          .order('created_at', { ascending: false }),
        supabase
          .from('vocab_cards_progress')
          .select('vocabulary_id, difficulty, last_reviewed, next_review, review_count')
          .eq('user_id', userId)
      ]);

      if (vocabError) {
        console.error('❌ Erreur chargement vocabulaire:', vocabError);
        setLoading(false);
        return;
      }

      if (progressError) {
        console.warn('⚠️ Erreur chargement progression (table peut-être pas créée):', progressError);
      }

      if (!vocab || vocab.length === 0) {
        console.log('ℹ️ Aucun vocabulaire trouvé');
        setLoading(false);
        return;
      }

      console.log(`✅ ${vocab.length} mots chargés`);
      console.log(`✅ ${progress?.length || 0} progressions chargées`);

      // Créer un map de la progression par vocabulary_id
      const progressMap = new Map(
        (progress || []).map(p => [p.vocabulary_id, p])
      );

      // Transformer le vocabulaire en cartes avec progression
      const cards: VocabCard[] = vocab.map((v) => {
        const prog = progressMap.get(v.id);
        return {
          id: v.id.toString(),
          wordAr: v.word,
          wordFr: v.translation,
          definition: v.translation,
          singulier: v.singulier,
          pluriel: v.pluriel,
          contraire: v.contraire,
          racine: v.racine,
          difficulty: prog?.difficulty || 'medium',
          lastReviewed: prog?.last_reviewed ? new Date(prog.last_reviewed) : null,
          nextReview: prog?.next_review ? new Date(prog.next_review) : new Date(),
          reviewCount: prog?.review_count || 0,
        };
      });

      setVocabCards(cards);
      setLoading(false);
    } catch (e) {
      console.error('❌ Erreur:', e);
      setLoading(false);
    }
  };

  // Filtrer les cartes à réviser (uniquement celles dont nextReview <= maintenant)
  const cardsToShow = showAll
    ? vocabCards
    : vocabCards.filter(card => card.nextReview <= new Date());

  const {
    currentCard,
    currentIndex,
    isFlipped,
    setIsFlipped,
    updateDifficulty,
    getStats,
  } = useVocabCards(cardsToShow);

  const stats = getStats();
  const flipAnim = React.useRef(new Animated.Value(0)).current;
  const { addDiacriticsToWord } = useDiacritics();

  useEffect(() => {
    Animated.timing(flipAnim, {
      toValue: isFlipped ? 1 : 0,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [isFlipped, flipAnim]);

  // Afficher un loader pendant le chargement
  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.emptyCard}>
          <ActivityIndicator size="large" color="#2E7D32" />
          <Text style={styles.emptyText}>{t('libraryDetail.loading')}</Text>
        </View>
      </View>
    );
  }

  if (!currentCard) {
    return (
      <View style={styles.container}>
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>{t('revision.congrats')}</Text>
          <Text style={styles.emptyText}>
            {t('revision.noCardsToday')}
          </Text>
        </View>
      </View>
    );
  }

  const frontRotate = flipAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '180deg'],
  });

  const backRotate = flipAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['180deg', '360deg'],
  });

  const cardsToReviewCount = vocabCards.filter(card => card.nextReview <= new Date()).length;

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>{t('revision.vocab')}</Text>
          <TouchableOpacity
            style={styles.toggleButton}
            onPress={() => setShowAll(!showAll)}
          >
            <Text style={styles.toggleButtonText}>
              {showAll ? `${t('revision.toReview')} (${cardsToReviewCount})` : `${t('libraryDetail.all')} (${vocabCards.length})`}
            </Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.progress}>
          {currentIndex + 1} / {cardsToShow.length}
        </Text>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statBox}>
          <Text style={styles.statLabel}>{t('revision.toReview')}</Text>
          <Text style={styles.statValue}>{stats.toReview}</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statLabel}>{t('revision.easyCards')}</Text>
          <Text style={[styles.statValue, { color: '#4CAF50' }]}>
            {stats.easy}
          </Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statLabel}>{t('revision.hardCards')}</Text>
          <Text style={[styles.statValue, { color: '#FF9800' }]}>
            {stats.hard}
          </Text>
        </View>
      </View>

      <TouchableOpacity
        style={styles.cardContainer}
        onPress={() => setIsFlipped(!isFlipped)}
        activeOpacity={0.8}
      >
        <Animated.View
          style={[
            styles.card,
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
            styles.card,
            styles.cardBack,
            { transform: [{ rotateY: backRotate }] },
          ]}
        >
          <Text style={styles.cardWordBack}>{currentCard.wordFr}</Text>
          <Text style={styles.cardDefinition}>{currentCard.definition}</Text>

          {/* Formes : Singulier et Pluriel */}
          {(currentCard.singulier || currentCard.pluriel) && (
            <View style={styles.formsContainer}>
              {currentCard.singulier && (
                <Text style={styles.formText}>
                  {t('statistics.singular')}: {currentCard.singulier}
                </Text>
              )}
              {currentCard.pluriel && (
                <Text style={styles.formText}>
                  {t('statistics.plural')}: {currentCard.pluriel}
                </Text>
              )}
            </View>
          )}

          {/* Contraire */}
          {currentCard.contraire && (
            <Text style={styles.contraireText}>
              {t('statistics.opposite')}: {currentCard.contraire}
            </Text>
          )}

          {/* Racine */}
          {currentCard.racine && (
            <Text style={styles.racineText}>
              {t('statistics.root')}: {currentCard.racine}
            </Text>
          )}
        </Animated.View>
      </TouchableOpacity>

      <View style={styles.buttonContainer}>
        <TouchableOpacity
          style={[styles.button, styles.buttonForgotten]}
          onPress={() => updateDifficulty('forgotten')}
        >
          <Text style={styles.buttonText}>{t('revision.forgotten')}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, styles.buttonHard]}
          onPress={() => updateDifficulty('hard')}
        >
          <Text style={styles.buttonText}>{t('revision.hardBtn')}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, styles.buttonMedium]}
          onPress={() => updateDifficulty('medium')}
        >
          <Text style={styles.buttonText}>{t('revision.mediumBtn')}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, styles.buttonEasy]}
          onPress={() => updateDifficulty('easy')}
        >
          <Text style={styles.buttonText}>{t('revision.easyBtn')}</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    padding: 16,
  },
  header: {
    marginBottom: 20,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  toggleButton: {
    backgroundColor: '#2E7D32',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  toggleButtonText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
  },
  progress: {
    fontSize: 14,
    color: '#999',
    marginTop: 4,
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
  card: {
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
    backgroundColor: '#1976d2',
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
  formsContainer: {
    marginTop: 12,
    gap: 6,
  },
  formText: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.95)',
    textAlign: 'center',
    fontStyle: 'italic',
  },
  contraireText: {
    fontSize: 14,
    color: 'rgba(255,255,255,1)',
    textAlign: 'center',
    fontWeight: '600',
    marginTop: 8,
  },
  racineText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.8)',
    textAlign: 'center',
    marginTop: 6,
    fontStyle: 'italic',
  },
});
