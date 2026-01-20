import { useDictation } from '@/hooks/use-dictation';
import { useLanguage } from '@/hooks/use-language';
import { supabase } from '@/src/lib/supabase';
import React, { useEffect, useState, useCallback } from 'react';
import {
    ActivityIndicator,
    Alert,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';

const MIN_WORDS_PER_DICTATION = 30;

// Fonction pour compter les mots arabes
function countArabicWords(text: string): number {
  return text.trim().split(/\s+/).filter(w => w.length > 0).length;
}

// Fonction pour extraire les phrases d'un texte
function extractSentences(text: string): string[] {
  // Séparer par les points, points d'interrogation, points d'exclamation arabes et latins
  const sentences = text
    .split(/[.،؟!؛\n]+/)
    .map(s => s.trim())
    .filter(s => s.length > 5); // Garder les phrases de plus de 5 caractères
  return sentences;
}

// Fonction pour créer une dictée d'au moins 30 mots
function createDictationFromSentences(sentences: string[], minWords: number): { text: string; sentences: string[] } {
  const shuffled = [...sentences].sort(() => Math.random() - 0.5);
  const selected: string[] = [];
  let wordCount = 0;
  
  for (const sentence of shuffled) {
    if (wordCount >= minWords) break;
    selected.push(sentence);
    wordCount += countArabicWords(sentence);
  }
  
  return {
    text: selected.join(' ، '),
    sentences: selected,
  };
}

type DictationItem = {
  id: string;
  text: string;
  level: 'beginner' | 'intermediate' | 'advanced';
  wordCount: number;
  sourceTitle: string;
};

export default function DictationScreen() {
  console.log('🎯 DictationScreen MOUNTED');
  const [loading, setLoading] = useState(true);
  const [dictationItems, setDictationItems] = useState<DictationItem[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const { t } = useLanguage();
  const {
    isSpeaking,
    currentText,
    setCurrentText,
    speakSentence,
    submitDictation,
    dictations,
  } = useDictation();

  // Charger les textes depuis la bibliothèque
  const loadDictations = useCallback(async () => {
    console.log('🚀 loadDictations APPELÉ');
    try {
      setLoading(true);
      
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user?.id;
      
      console.log('🔐 User ID:', userId || 'NON CONNECTÉ');
      
      if (!userId) {
        // Utiliser des exemples par défaut si pas connecté
        console.log('⚠️ Pas de session, utilisation des exemples par défaut');
        setDictationItems([
          {
            id: 'sample-1',
            text: 'الحمد لله رب العالمين الرحمن الرحيم مالك يوم الدين إياك نعبد وإياك نستعين اهدنا الصراط المستقيم صراط الذين أنعمت عليهم غير المغضوب عليهم ولا الضالين',
            level: 'beginner',
            wordCount: 29,
            sourceTitle: 'Exemple - Al-Fatiha',
          },
        ]);
        setLoading(false);
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
        setLoading(false);
        return;
      }

      console.log('📄 Scans trouvés:', scans?.length || 0);
      if (scans && scans.length > 0) {
        console.log('📄 Premier scan:', {
          id: scans[0].id,
          title: scans[0].title,
          hasContent: !!scans[0].content,
          contentLength: scans[0].content?.length || 0,
          contentPreview: scans[0].content?.substring(0, 100) || 'VIDE',
        });
      }

      if (!scans || scans.length === 0) {
        setDictationItems([]);
        setLoading(false);
        return;
      }

      // Extraire toutes les phrases de tous les textes
      const allSentences: { sentence: string; sourceTitle: string }[] = [];
      
      for (const scan of scans) {
        if (scan.content) {
          const sentences = extractSentences(scan.content);
          sentences.forEach(sentence => {
            allSentences.push({
              sentence,
              sourceTitle: scan.title || 'Sans titre',
            });
          });
        }
      }

      if (allSentences.length === 0) {
        setDictationItems([]);
        setLoading(false);
        return;
      }

      // Créer plusieurs dictées aléatoires
      const numDictations = Math.min(5, Math.ceil(allSentences.length / 5));
      const items: DictationItem[] = [];
      
      for (let i = 0; i < numDictations; i++) {
        // Mélanger les phrases pour chaque dictée
        const shuffledSentences = allSentences.map(s => s.sentence).sort(() => Math.random() - 0.5);
        const dictation = createDictationFromSentences(shuffledSentences, MIN_WORDS_PER_DICTATION);
        
        const wordCount = countArabicWords(dictation.text);
        let level: 'beginner' | 'intermediate' | 'advanced' = 'beginner';
        if (wordCount > 50) level = 'advanced';
        else if (wordCount > 35) level = 'intermediate';

        items.push({
          id: `dictation-${i}-${Date.now()}`,
          text: dictation.text,
          level,
          wordCount,
          sourceTitle: 'Textes mélangés',
        });
      }

      setDictationItems(items);
    } catch (error) {
      console.error('Erreur:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDictations();
  }, [loadDictations]);

  const current = dictationItems[currentIdx];

  // Debug: afficher l'état actuel
  useEffect(() => {
    if (current) {
      console.log('📝 Dictée actuelle:', {
        id: current.id,
        wordCount: current.wordCount,
        textPreview: current.text.substring(0, 100) + '...',
      });
    }
  }, [current]);

  const handleSpeak = () => {
    if (current && current.text) {
      console.log('🎧 Bouton écouter pressé, texte:', current.text.substring(0, 50));
      speakSentence(current.text);
    } else {
      console.error('❌ Pas de texte à lire');
    }
  };

  const handleSubmit = () => {
    if (!currentText.trim()) {
      Alert.alert(t('playlist.error'), t('revision.writeHere'));
      return;
    }

    if (!current) return;

    const result = submitDictation(current.id, current.text);

    if (result.isCorrect) {
      Alert.alert(t('revision.perfect'), t('revision.dictationCorrect'), [
        {
          text: t('revision.next'),
          onPress: () => {
            if (currentIdx < dictationItems.length - 1) {
              setCurrentIdx(currentIdx + 1);
              setCurrentText('');
            } else {
              Alert.alert(t('revision.finished'), t('revision.allDictationsComplete'));
              setCurrentIdx(0);
              loadDictations(); // Recharger de nouvelles dictées
            }
          },
        },
      ]);
    } else {
      const errorMsg = result.errors
        .slice(0, 3)
        .map((e) => `${t('revision.position')} ${e.position}: "${e.expected}" ${t('revision.vs')} "${e.got}"`)
        .join('\n');

      Alert.alert(
        `❌ ${result.errors.length} ${t('revision.errors')}`,
        `${errorMsg}\n\n${t('revision.tryAgain')}!`
      );
    }
  };

  const handleRefresh = () => {
    setCurrentIdx(0);
    setCurrentText('');
    loadDictations();
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2e7d32" />
        <Text style={styles.loadingText}>{t('revision.loadingDictations')}</Text>
      </View>
    );
  }

  if (dictationItems.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyTitle}>📝 {t('revision.noDictations')}</Text>
        <Text style={styles.emptyText}>{t('revision.scanTextFirst')}</Text>
        <TouchableOpacity style={styles.refreshButton} onPress={handleRefresh}>
          <Text style={styles.refreshButtonText}>🔄 {t('revision.refresh')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.card}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>{t('revision.dictation')}</Text>
          <TouchableOpacity style={styles.refreshSmall} onPress={handleRefresh}>
            <Text style={styles.refreshSmallText}>🔄</Text>
          </TouchableOpacity>
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

        <Text style={styles.instruction}>
          {t('revision.listenAndWrite')}
        </Text>

        <TouchableOpacity
          style={[styles.speakButton, isSpeaking && styles.speaking]}
          onPress={handleSpeak}
          disabled={isSpeaking}
        >
          <Text style={styles.speakButtonText}>
            {isSpeaking ? `🔊 ${t('revision.listening')}...` : `🎧 ${t('revision.listen')}`}
          </Text>
        </TouchableOpacity>

        <TextInput
          style={styles.input}
          placeholder={t('revision.writeHere')}
          value={currentText}
          onChangeText={setCurrentText}
          placeholderTextColor="#999"
          multiline
          textAlign="right"
        />

        <View style={styles.buttonRow}>
          <TouchableOpacity style={styles.submitButton} onPress={handleSubmit}>
            <Text style={styles.submitButtonText}>✓ {t('revision.check')}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.skipButton}
            onPress={() => {
              setCurrentText('');
              Alert.alert(t('revision.answer'), `${t('revision.phraseWas')}\n\n${current?.text}`);
            }}
          >
            <Text style={styles.skipButtonText}>👁 {t('revision.showAnswer')}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.stats}>
          <Text style={styles.statsText}>
            📖 {currentIdx + 1} / {dictationItems.length}
          </Text>
          <Text style={styles.statsText}>
            ✅ {dictations.filter((d) => d.isCorrect).length} {t('revision.correctCount')}
          </Text>
        </View>
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#666',
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
  refreshSmall: {
    padding: 8,
  },
  refreshSmallText: {
    fontSize: 20,
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
  instruction: {
    fontSize: 16,
    color: '#666',
    marginBottom: 16,
    textAlign: 'center',
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
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 18,
    marginBottom: 16,
    minHeight: 120,
    textAlignVertical: 'top',
    backgroundColor: '#fafafa',
    writingDirection: 'rtl',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
  },
  submitButton: {
    flex: 1,
    backgroundColor: '#1976d2',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  submitButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  skipButton: {
    flex: 1,
    backgroundColor: '#f0f0f0',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  skipButtonText: {
    color: '#333',
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
});
