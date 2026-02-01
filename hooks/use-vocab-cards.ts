import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/src/lib/supabase';

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
    async (difficulty: CardDifficulty) => {
      const now = new Date();
      const intervals: Record<CardDifficulty, number> = {
        easy: 30, // 30 jours
        medium: 7, // 7 jours
        hard: 3, // 3 jours
        forgotten: 1, // 1 jour
      };

      const nextReviewDate = new Date(now.getTime() + intervals[difficulty] * 24 * 60 * 60 * 1000);
      const currentCard = cards[currentIndex];

      // Sauvegarder en base de données
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const userId = sessionData.session?.user?.id;

        if (userId && currentCard) {
          const { error } = await supabase
            .from('vocab_cards_progress')
            .upsert({
              user_id: userId,
              vocabulary_id: currentCard.id,
              difficulty,
              last_reviewed: now.toISOString(),
              next_review: nextReviewDate.toISOString(),
              review_count: currentCard.reviewCount + 1,
            }, {
              onConflict: 'user_id,vocabulary_id'
            });

          if (error) {
            console.error('❌ Erreur sauvegarde progression:', error);
          } else {
            console.log('✅ Progression sauvegardée:', difficulty);
          }
        }
      } catch (e) {
        console.error('❌ Erreur:', e);
      }

      // Mettre à jour l'état local
      setCards((prev) => {
        const updated = [...prev];
        updated[currentIndex] = {
          ...updated[currentIndex],
          difficulty,
          lastReviewed: now,
          nextReview: nextReviewDate,
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
    [currentIndex, cards]
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
