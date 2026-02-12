import { useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '@/src/lib/supabase';

export type CardDifficulty = 'easy' | 'medium' | 'hard' | 'forgotten';

export interface VocabCard {
  id: string;
  scanId?: string; // UUID du scan d'origine
  wordAr: string;
  wordFr: string;
  definition: string;
  singulier?: string | null;
  pluriel?: string | null;
  contraire?: string | null;
  racine?: string | null;
  difficulty: CardDifficulty;
  lastReviewed: Date | null;
  nextReview: Date;
  reviewCount: number;
}

export const useVocabCards = (initialCards: VocabCard[] = []) => {
  const [cards, setCards] = useState<VocabCard[]>(initialCards);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  // Garder une ref de la dernière initialCards appliquée
  // pour ne synchroniser que lors d'un vrai rechargement externe
  const lastAppliedRef = useRef<VocabCard[]>(initialCards);

  useEffect(() => {
    // Ne synchroniser que si initialCards est un NOUVEAU tableau
    // (rechargement depuis loadVocabulary), pas quand on retire des cartes localement
    if (initialCards !== lastAppliedRef.current && initialCards.length > 0) {
      lastAppliedRef.current = initialCards;
      setCards(initialCards);
      setCurrentIndex(0);
      setIsFlipped(false);
    }
  }, [initialCards]);

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

        if (userId && currentCard && currentCard.scanId) {
          const { error } = await supabase
            .from('vocab_cards_progress')
            .upsert({
              user_id: userId,
              scan_id: currentCard.scanId,
              word_ar: currentCard.wordAr,
              difficulty,
              last_reviewed: now.toISOString(),
              next_review: nextReviewDate.toISOString(),
              review_count: currentCard.reviewCount + 1,
            }, {
              onConflict: 'user_id,scan_id,word_ar'
            });

          if (error) {
            console.error('❌ Erreur sauvegarde progression:', error);
          } else {
            console.log('✅ Progression sauvegardée:', { scanId: currentCard.scanId, word: currentCard.wordAr, difficulty });
          }
        } else if (!currentCard?.scanId) {
          console.warn('⚠️ Impossible de sauvegarder: scanId manquant pour', currentCard?.wordAr);
        }
      } catch (e) {
        console.error('❌ Erreur:', e);
      }

      // Mettre à jour l'état local — retirer la carte révisée du deck
      setCards((prev) => {
        const updated = prev.filter((_, idx) => idx !== currentIndex);
        return updated;
      });

      // Ajuster l'index si nécessaire
      setCurrentIndex((prevIdx) => {
        // Si on a retiré la dernière carte du tableau, reculer d'un cran
        const remaining = cards.length - 1;
        if (remaining === 0) return 0;
        return prevIdx >= remaining ? remaining - 1 : prevIdx;
      });
      setIsFlipped(false);
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
