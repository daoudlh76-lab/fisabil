import { useDictation } from '@/hooks/use-dictation';
import { useLanguage } from '@/hooks/use-language';
import { supabase } from '@/src/lib/supabase';
import { invokeEdge } from '@/src/lib/edge-ai';
import { useFocusEffect } from '@react-navigation/native';
import React, { useEffect, useState, useCallback } from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';

const DICTATIONS_PER_TEXT = 10;

// Fonction pour compter les mots arabes
function countArabicWords(text: string): number {
  return text.trim().split(/\s+/).filter(w => w.length > 0).length;
}

/**
 * Utilise GPT-4o-mini pour analyser le texte et créer 10 dictées cohérentes.
 * Chaque dictée est un extrait EXACT du texte (phrases consécutives).
 */
async function generateDictationsWithAI(
  title: string,
  content: string,
): Promise<string[]> {
  try {
    const data = await invokeEdge<{ message: string }>('tutor-chat-ai', {
      messages: [
        {
          role: 'system',
          content: `أنتَ مُساعِدٌ لِتَعليمِ العَرَبِيَّةِ. مُهِمَّتُكَ: تَقسيمُ النَّصِّ التالي إلى ${DICTATIONS_PER_TEXT} مَقاطِعَ لِلإِملاءِ.

القَواعِدُ الصارِمَةُ:
١. كُلُّ مَقطَعٍ يَجِبُ أَنْ يَكونَ نَصًّا حَرفِيًّا مِنَ النَّصِّ الأَصلِيِّ — لا تُغَيِّرْ أَيَّ كَلِمَةٍ
٢. المَقاطِعُ يَجِبُ أَنْ تَتَّبِعَ تَرتيبَ النَّصِّ الأَصلِيِّ
٣. كُلُّ مَقطَعٍ يَحتَوي عَلى ١٠-٢٠ كَلِمَةً
٤. المَقطَعُ يَجِبُ أَنْ يَبدَأَ وَيَنتَهِيَ عِندَ حُدودٍ طَبيعِيَّةٍ (بِدايَةُ جُملَةٍ / نِهايَةُ جُملَةٍ)
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

    // Extraire le JSON du contenu
    const jsonMatch = raw.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      __DEV__ && console.error('[DICTATION] No JSON array in response:', raw.substring(0, 200));
      return [];
    }

    const parsed = JSON.parse(jsonMatch[0]) as string[];
    if (__DEV__) console.log(`[DICTATION] ✅ GPT créé ${parsed.length} dictées pour "${title}"`);
    return parsed.filter(s => s && s.trim().length > 5);
  } catch (err) {
    __DEV__ && console.error('[DICTATION] AI generation error:', err);
    return [];
  }
}

/** Fallback: découper le texte en morceaux de ~15 mots consécutifs */
function splitTextFallback(text: string): string[] {
  const words = text.trim().split(/\s+/).filter(w => w.length > 0);
  const chunks: string[] = [];
  for (let i = 0; i < words.length; i += 15) {
    const chunk = words.slice(i, i + 15).join(' ');
    if (chunk.length > 5) chunks.push(chunk);
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

type ScanInfo = { id: string; title: string; content: string; wordCount: number };

export default function DictationScreen() {
  const [phase, setPhase] = useState<'select' | 'dictation'>('select');
  const [loadingScans, setLoadingScans] = useState(true);
  const [generatingDictation, setGeneratingDictation] = useState(false);
  const [dictationItems, setDictationItems] = useState<DictationItem[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [scanList, setScanList] = useState<ScanInfo[]>([]);
  const [selectedTitle, setSelectedTitle] = useState('');
  const { t } = useLanguage();
  const {
    isSpeaking,
    speakSentence,
    stop: stopSpeech,
  } = useDictation();

  // ─── PHASE 1 : Charger la liste des textes ───
  const loadScanList = useCallback(async () => {
    try {
      setLoadingScans(true);
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user?.id;
      if (!userId) {
        setScanList([]);
        setLoadingScans(false);
        return;
      }

      const { data: scans, error } = await supabase
        .from('scans')
        .select('id, title, content')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error || !scans) {
        __DEV__ && console.error('❌ Erreur chargement scans:', error);
        setScanList([]);
        setLoadingScans(false);
        return;
      }

      const validScans: ScanInfo[] = scans
        .filter((s: any) => s.content && s.content.trim().length > 10)
        .map((s: any) => ({
          id: s.id,
          title: s.title || 'Sans titre',
          content: s.content,
          wordCount: countArabicWords(s.content),
        }));

      setScanList(validScans);
    } catch (err) {
      __DEV__ && console.error('Erreur loadScanList:', err);
    } finally {
      setLoadingScans(false);
    }
  }, []);

  useEffect(() => {
    loadScanList();
  }, [loadScanList]);

  // Arrêter l'audio quand on quitte la page
  useFocusEffect(
    useCallback(() => {
      return () => {
        stopSpeech();
      };
    }, [stopSpeech])
  );

  // ─── PHASE 2 : Générer les dictées pour UN seul texte ───
  const handleSelectText = useCallback(async (scan: ScanInfo) => {
    setSelectedTitle(scan.title);
    setGeneratingDictation(true);
    setPhase('dictation');
    setCurrentIdx(0);
    setShowAnswer(false);

    if (__DEV__) console.log(`[DICTATION] Texte choisi: "${scan.title}" (${scan.wordCount} mots)`);

    let dictTexts = await generateDictationsWithAI(scan.title, scan.content);
    if (dictTexts.length === 0) {
      if (__DEV__) console.log('[DICTATION] Fallback: découpage mécanique');
      dictTexts = splitTextFallback(scan.content);
    }

    const items: DictationItem[] = dictTexts.map((text, idx) => {
      const wordCount = countArabicWords(text);
      let level: 'beginner' | 'intermediate' | 'advanced' = 'beginner';
      if (wordCount > 18) level = 'advanced';
      else if (wordCount > 12) level = 'intermediate';

      return {
        id: `dictation-${idx}-${Date.now()}`,
        text,
        level,
        wordCount,
        sourceTitle: scan.title,
      };
    });

    setDictationItems(items);
    setGeneratingDictation(false);
  }, []);

  // ─── Navigation dictée ───
  const current = dictationItems[currentIdx];

  const handleSpeak = () => {
    if (current?.text) {
      speakSentence(current.text);
    }
  };

  const handleNext = () => {
    if (currentIdx < dictationItems.length - 1) {
      setCurrentIdx(currentIdx + 1);
      setShowAnswer(false);
    } else {
      Alert.alert(t('revision.finished'), t('revision.allDictationsComplete'), [
        { text: 'OK', onPress: () => { setCurrentIdx(0); setShowAnswer(false); } },
      ]);
    }
  };

  const handleBackToList = () => {
    setPhase('select');
    setDictationItems([]);
    setCurrentIdx(0);
    setShowAnswer(false);
  };

  // ══════════════════════════════════════════════
  //  PHASE 1 : Écran de sélection du texte
  // ══════════════════════════════════════════════
  if (phase === 'select') {
    if (loadingScans) {
      return (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#2e7d32" />
          <Text style={styles.loadingText}>Chargement des textes…</Text>
        </View>
      );
    }

    if (scanList.length === 0) {
      return (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyTitle}>📝 {t('revision.noDictations')}</Text>
          <Text style={styles.emptyText}>{t('revision.scanTextFirst')}</Text>
          <TouchableOpacity style={styles.refreshButton} onPress={loadScanList}>
            <Text style={styles.refreshButtonText}>🔄 {t('revision.refresh')}</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <View style={styles.selectContainer}>
        <Text style={styles.selectTitle}>📖 Choisir un texte pour la dictée</Text>
        <Text style={styles.selectSubtitle}>
          Sélectionnez un texte. Les dictées seront créées uniquement à partir de ce texte.
        </Text>

        <FlatList
          data={scanList}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.selectList}
          renderItem={({ item, index }) => (
            <TouchableOpacity
              style={styles.selectCard}
              onPress={() => handleSelectText(item)}
              activeOpacity={0.7}
            >
              <View style={styles.selectCardHeader}>
                <Text style={styles.selectCardNumber}>{index + 1}</Text>
                <View style={styles.selectCardInfo}>
                  <Text style={styles.selectCardTitle} numberOfLines={2}>
                    {item.title}
                  </Text>
                  <Text style={styles.selectCardMeta}>
                    {item.wordCount} mots
                  </Text>
                </View>
                <Text style={styles.selectCardArrow}>▶</Text>
              </View>
              <Text style={styles.selectCardPreview} numberOfLines={2}>
                {item.content.substring(0, 120)}…
              </Text>
            </TouchableOpacity>
          )}
        />

        <TouchableOpacity style={styles.refreshFloating} onPress={loadScanList}>
          <Text style={styles.refreshFloatingText}>🔄</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ══════════════════════════════════════════════
  //  PHASE 2 : Écran de dictée
  // ══════════════════════════════════════════════
  if (generatingDictation) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2e7d32" />
        <Text style={styles.loadingText}>Analyse du texte en cours…</Text>
        <Text style={styles.loadingSubtext}>Création de {DICTATIONS_PER_TEXT} dictées pour :</Text>
        <Text style={styles.loadingTitle}>« {selectedTitle} »</Text>
      </View>
    );
  }

  if (dictationItems.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyTitle}>❌ Aucune dictée générée</Text>
        <Text style={styles.emptyText}>Une erreur est survenue lors de l'analyse du texte.</Text>
        <TouchableOpacity style={styles.refreshButton} onPress={handleBackToList}>
          <Text style={styles.refreshButtonText}>← Choisir un autre texte</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      {/* Bandeau : titre du texte + retour */}
      <TouchableOpacity style={styles.backBar} onPress={handleBackToList}>
        <Text style={styles.backArrow}>←</Text>
        <Text style={styles.backTitle} numberOfLines={1}>
          {selectedTitle}
        </Text>
        <Text style={styles.backChange}>Changer</Text>
      </TouchableOpacity>

      <View style={styles.card}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>{t('revision.dictation')}</Text>
          <Text style={styles.statsInline}>
            {currentIdx + 1} / {dictationItems.length}
          </Text>
        </View>

        <View style={styles.levelRow}>
          <View style={[styles.levelBadge, 
            current?.level === 'intermediate' && styles.levelIntermediate,
            current?.level === 'advanced' && styles.levelAdvanced
          ]}>
            <Text style={styles.levelText}>{current?.level}</Text>
          </View>
          <Text style={styles.wordCountText}>
            📝 {current?.wordCount} {t('revision.words')}
          </Text>
        </View>

        <View style={styles.instructionBox}>
          <Text style={styles.instructionIcon}>📝</Text>
          <Text style={styles.instruction}>
            Écoutez la dictée et écrivez-la sur une feuille de papier
          </Text>
          <Text style={styles.subInstruction}>
            💡 Astuce : Vous pouvez scanner votre feuille pour la corriger plus tard
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.speakButton, isSpeaking && styles.speaking]}
          onPress={handleSpeak}
          disabled={isSpeaking}
        >
          <Text style={styles.speakButtonText}>
            {isSpeaking ? `🔊 ${t('revision.listening')}...` : `🎧 ${t('revision.listen')}`}
          </Text>
        </TouchableOpacity>

        {showAnswer && (
          <View style={styles.answerBox}>
            <Text style={styles.answerLabel}>✅ Réponse correcte :</Text>
            <Text style={styles.answerText}>{current?.text}</Text>
            <Text style={styles.answerHint}>
              📸 Comparez avec votre feuille ou scannez-la pour vérification
            </Text>
          </View>
        )}

        <View style={styles.buttonRow}>
          <TouchableOpacity
            style={[styles.showAnswerButton, showAnswer && styles.showAnswerButtonDisabled]}
            onPress={() => setShowAnswer(true)}
            disabled={showAnswer}
          >
            <Text style={styles.showAnswerButtonText}>
              {showAnswer ? '✓ Réponse affichée' : '👁 Voir la réponse'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.nextButton} onPress={handleNext}>
            <Text style={styles.nextButtonText}>➡️ Suivant</Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  // ─── Sélection de texte ───
  selectContainer: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  selectTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#333',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 4,
  },
  selectSubtitle: {
    fontSize: 14,
    color: '#888',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  selectList: {
    paddingHorizontal: 16,
    paddingBottom: 80,
  },
  selectCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  selectCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  selectCardNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#2E7D32',
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
    textAlign: 'center',
    lineHeight: 28,
    marginRight: 12,
    overflow: 'hidden',
  },
  selectCardInfo: {
    flex: 1,
  },
  selectCardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  selectCardMeta: {
    fontSize: 12,
    color: '#999',
    marginTop: 2,
  },
  selectCardArrow: {
    fontSize: 16,
    color: '#2E7D32',
    marginLeft: 8,
  },
  selectCardPreview: {
    fontSize: 13,
    color: '#777',
    lineHeight: 20,
    textAlign: 'right',
    marginTop: 4,
  },
  refreshFloating: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#2E7D32',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  refreshFloatingText: {
    fontSize: 22,
  },

  // ─── Dictée ───
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    padding: 16,
  },
  backBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
    elevation: 1,
  },
  backArrow: {
    fontSize: 20,
    color: '#2E7D32',
    marginRight: 10,
    fontWeight: 'bold',
  },
  backTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: '#555',
  },
  backChange: {
    fontSize: 13,
    color: '#2E7D32',
    fontWeight: '600',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    padding: 20,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#666',
  },
  loadingSubtext: {
    marginTop: 8,
    fontSize: 14,
    color: '#999',
  },
  loadingTitle: {
    marginTop: 4,
    fontSize: 15,
    fontWeight: '600',
    color: '#2E7D32',
    textAlign: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    padding: 20,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
  },
  emptyText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 20,
  },
  refreshButton: {
    backgroundColor: '#2e7d32',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  refreshButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  card: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  statsInline: {
    fontSize: 15,
    fontWeight: '600',
    color: '#2E7D32',
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    overflow: 'hidden',
  },
  levelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  levelBadge: {
    backgroundColor: '#e3f2fd',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  levelIntermediate: {
    backgroundColor: '#fff3e0',
  },
  levelAdvanced: {
    backgroundColor: '#ffebee',
  },
  levelText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1976d2',
  },
  wordCountText: {
    fontSize: 14,
    color: '#666',
  },
  instructionBox: {
    backgroundColor: '#E3F2FD',
    padding: 20,
    borderRadius: 12,
    marginBottom: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2196F3',
  },
  instructionIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  instruction: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1976D2',
    textAlign: 'center',
    marginBottom: 8,
  },
  subInstruction: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    fontStyle: 'italic',
  },
  speakButton: {
    backgroundColor: '#4CAF50',
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
  answerBox: {
    backgroundColor: '#E8F5E9',
    padding: 20,
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 2,
    borderColor: '#4CAF50',
  },
  answerLabel: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#2E7D32',
    marginBottom: 12,
  },
  answerText: {
    fontSize: 20,
    color: '#1B5E20',
    textAlign: 'right',
    lineHeight: 32,
    marginBottom: 12,
    fontWeight: '500',
  },
  answerHint: {
    fontSize: 13,
    color: '#558B2F',
    textAlign: 'center',
    fontStyle: 'italic',
    marginTop: 8,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  showAnswerButton: {
    flex: 1,
    backgroundColor: '#1976d2',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  showAnswerButtonDisabled: {
    backgroundColor: '#90CAF9',
  },
  showAnswerButtonText: {
    color: 'white',
    fontSize: 15,
    fontWeight: '600',
  },
  nextButton: {
    flex: 1,
    backgroundColor: '#4CAF50',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  nextButtonText: {
    color: 'white',
    fontSize: 15,
    fontWeight: '600',
  },
});
