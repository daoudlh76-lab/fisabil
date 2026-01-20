import { useState, useCallback, useEffect } from 'react';

export type CardDifficulty = 'easy' | 'medium' | 'hard' | 'forgotten';

export interface VocabCard {
  id: string;
  wordAr: string;
  wordFr: string;
  definition: string;
  difficulty: CardDifficulty;
  lastReviewed: Date | null;
  nextReview: Date;
  reviewCount: number;
}

export const useVocabCards = (initialCards: VocabCard[] = []) => {
  const [cards, setCards] = useState<VocabCard[]>(initialCards);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);

  // Synchroniser les cartes quand initialCards change (comparaison par contenu)
  useEffect(() => {
    if (initialCards.length > 0) {
      // Comparer le contenu pour détecter un vrai changement
      const hasChanged = initialCards.some((card, idx) =>
        !cards[idx] ||
        card.wordFr !== cards[idx].wordFr ||
        card.definition !== cards[idx].definition
      );
      if (hasChanged || cards.length !== initialCards.length) {
        setCards(initialCards);
        setCurrentIndex(0);
        setIsFlipped(false);
      }
    }
  }, [initialCards, cards]);

  const currentCard = cards[currentIndex];

  const updateDifficulty = useCallback(
    (difficulty: CardDifficulty) => {
      setCards((prev) => {
        const updated = [...prev];
        const now = new Date();
        const intervals: Record<CardDifficulty, number> = {
          easy: 30, // 30 jours
          medium: 7, // 7 jours
          hard: 3, // 3 jours
          forgotten: 1, // 1 jour
        };

        updated[currentIndex] = {
          ...updated[currentIndex],
          difficulty,
          lastReviewed: now,
          nextReview: new Date(now.getTime() + intervals[difficulty] * 24 * 60 * 60 * 1000),
          reviewCount: updated[currentIndex].reviewCount + 1,
        };
        return updated;
      });

      // Aller à la prochaine carte
      if (currentIndex < cards.length - 1) {
        setCurrentIndex(currentIndex + 1);
        setIsFlipped(false);
      }
    },
    [currentIndex, cards.length]
  );

  const getCardsToReview = useCallback(() => {
    const now = new Date();
    return cards.filter((card) => card.nextReview <= now);
  }, [cards]);

  const getStats = useCallback(() => {
    return {
      total: cards.length,
      toReview: getCardsToReview().length,
      easy: cards.filter((c) => c.difficulty === 'easy').length,
      hard: cards.filter((c) => c.difficulty === 'hard').length,
      forgotten: cards.filter((c) => c.difficulty === 'forgotten').length,
    };
  }, [cards, getCardsToReview]);

  return {
    cards,
    currentCard,
    currentIndex,
    isFlipped,
    setIsFlipped,
    updateDifficulty,
    getCardsToReview,
    getStats,
    setCurrentIndex,
  };
};
