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
  const [reviewedStats, setReviewedStats] = useState<Record<CardDifficulty, number>>({
    easy: 0, medium: 0, hard: 0, forgotten: 0,
  });
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
      setReviewedStats({ easy: 0, medium: 0, hard: 0, forgotten: 0 });
    }
  }, [initialCards]);

  const currentCard = cards[currentIndex];
  const isSavingRef = useRef(false);

  const updateDifficulty = useCallback(
    async (difficulty: CardDifficulty) => {
      // Guard anti-double-tap
      if (isSavingRef.current) return;
      isSavingRef.current = true;

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
              vocabulary_id: null,
              scan_id: currentCard.scanId || null,
              word_ar: currentCard.wordAr,
              difficulty,
              last_reviewed: now.toISOString(),
              next_review: nextReviewDate.toISOString(),
              review_count: currentCard.reviewCount + 1,
            }, {
              onConflict: 'user_id,word_ar'
            });

          if (error) {
            __DEV__ && console.error('❌ Erreur sauvegarde progression:', error);
          } else {
            __DEV__ && console.log('✅ Progression sauvegardée:', { word: currentCard.wordAr, difficulty });
          }
        }
      } catch (e) {
        __DEV__ && console.error('❌ Erreur:', e);
      }

      // Comptabiliser la carte révisée
      setReviewedStats((prev) => ({
        ...prev,
        [difficulty]: prev[difficulty] + 1,
      }));

      // Mettre à jour l'état local — retirer la carte révisée du deck
      setCards((prev) => {
        const updated = prev.filter((_, idx) => idx !== currentIndex);
        // Ajuster l'index dans le même setState pour éviter les stale closures
        setCurrentIndex((prevIdx) => {
          if (updated.length === 0) return 0;
          return prevIdx >= updated.length ? updated.length - 1 : prevIdx;
        });
        return updated;
      });
      setIsFlipped(false);
      isSavingRef.current = false;
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
      easy: reviewedStats.easy,
      medium: reviewedStats.medium,
      hard: reviewedStats.hard,
      forgotten: reviewedStats.forgotten,
    };
  }, [cards, getCardsToReview, reviewedStats]);

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
