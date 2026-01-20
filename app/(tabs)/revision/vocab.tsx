import { useVocabCards, VocabCard } from '@/hooks/use-vocab-cards';
import { useLanguage } from '@/hooks/use-language';
import React, { useEffect, useMemo } from 'react';
import {
    Animated,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { useDiacritics } from '@/hooks/use-diacritics-local';

// Traductions des données de vocabulaire par langue
const VOCAB_TRANSLATIONS: Record<string, { wordFr: string; definition: string }[]> = {
  fr: [
    { wordFr: 'livre', definition: 'Objet avec des pages écrites ou imprimées' },
    { wordFr: 'porte', definition: 'Entrée ou sortie d\'une pièce' },
    { wordFr: 'fenêtre', definition: 'Ouverture dans un mur pour la lumière et l\'air' },
    { wordFr: 'école', definition: 'Lieu où on apprend' },
  ],
  en: [
    { wordFr: 'book', definition: 'Object with written or printed pages' },
    { wordFr: 'door', definition: 'Entrance or exit of a room' },
    { wordFr: 'window', definition: 'Opening in a wall for light and air' },
    { wordFr: 'school', definition: 'Place where one learns' },
  ],
  de: [
    { wordFr: 'Buch', definition: 'Objekt mit geschriebenen oder gedruckten Seiten' },
    { wordFr: 'Tür', definition: 'Ein- oder Ausgang eines Raumes' },
    { wordFr: 'Fenster', definition: 'Öffnung in einer Wand für Licht und Luft' },
    { wordFr: 'Schule', definition: 'Ort, an dem man lernt' },
  ],
  es: [
    { wordFr: 'libro', definition: 'Objeto con páginas escritas o impresas' },
    { wordFr: 'puerta', definition: 'Entrada o salida de una habitación' },
    { wordFr: 'ventana', definition: 'Abertura en una pared para luz y aire' },
    { wordFr: 'escuela', definition: 'Lugar donde se aprende' },
  ],
  ru: [
    { wordFr: 'книга', definition: 'Предмет с написанными или напечатанными страницами' },
    { wordFr: 'дверь', definition: 'Вход или выход из комнаты' },
    { wordFr: 'окно', definition: 'Отверстие в стене для света и воздуха' },
    { wordFr: 'школа', definition: 'Место, где учатся' },
  ],
  ms: [
    { wordFr: 'buku', definition: 'Objek dengan halaman bertulis atau bercetak' },
    { wordFr: 'pintu', definition: 'Masuk atau keluar dari bilik' },
    { wordFr: 'tingkap', definition: 'Bukaan di dinding untuk cahaya dan udara' },
    { wordFr: 'sekolah', definition: 'Tempat untuk belajar' },
  ],
};

export default function VocabCardsScreen() {
  const { t, language } = useLanguage();
  
  const SAMPLE_VOCAB: VocabCard[] = useMemo(() => {
    const tr = VOCAB_TRANSLATIONS[language] || VOCAB_TRANSLATIONS.fr;
    return [
      {
        id: '1',
        wordAr: 'كتاب',
        wordFr: tr[0].wordFr,
        definition: tr[0].definition,
        difficulty: 'medium',
        lastReviewed: null,
        nextReview: new Date(),
        reviewCount: 0,
      },
      {
        id: '2',
        wordAr: 'باب',
        wordFr: tr[1].wordFr,
        definition: tr[1].definition,
        difficulty: 'medium',
        lastReviewed: null,
        nextReview: new Date(),
        reviewCount: 0,
      },
      {
        id: '3',
        wordAr: 'نافذة',
        wordFr: tr[2].wordFr,
        definition: tr[2].definition,
        difficulty: 'medium',
        lastReviewed: null,
        nextReview: new Date(),
        reviewCount: 0,
      },
      {
        id: '4',
        wordAr: 'مدرسة',
        wordFr: tr[3].wordFr,
        definition: tr[3].definition,
        difficulty: 'easy',
        lastReviewed: null,
        nextReview: new Date(),
        reviewCount: 0,
      },
    ];
  }, [language]);

  const {
    currentCard,
    currentIndex,
    isFlipped,
    setIsFlipped,
    updateDifficulty,
    getStats,
  } = useVocabCards(SAMPLE_VOCAB);

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

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('revision.vocab')}</Text>
        <Text style={styles.progress}>
          {currentIndex + 1} / {SAMPLE_VOCAB.length}
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
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
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
});
