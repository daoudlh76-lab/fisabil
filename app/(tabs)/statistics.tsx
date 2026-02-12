import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useLanguage } from '@/hooks/use-language';
import { supabase } from '@/src/lib/supabase';
import { useFocusEffect } from '@react-navigation/native';
import { migrateExtractVocabResult, needsMigration } from '@/src/lib/migrate-vocab-data';

type Tab = 'vocabulary' | 'verbs' | 'particles';

type VocabItem = {
  word: string;
  translation: string;
  root?: string;
  singulier?: string;
  pluriel?: string;
  contraire?: string;
};

export default function StatisticsScreen() {
  const { t } = useLanguage();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>('vocabulary');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);

  const [vocabulary, setVocabulary] = useState<VocabItem[]>([]);
  const [verbs, setVerbs] = useState<VocabItem[]>([]);
  const [particles, setParticles] = useState<VocabItem[]>([]);

  // Charger les données depuis la base de données
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user?.id;
      if (!userId) return;

      // Charger le cache AI qui contient le vocabulaire
      const { data: cacheData, error } = await supabase
        .from('ai_cache')
        .select('key, payload')
        .eq('user_id', userId)
        .like('key', 'ai_vocab_%');

      if (error) {
        console.error('Erreur chargement vocabulaire:', error);
        return;
      }

      // Compiler tout le vocabulaire, verbes et particules depuis tous les caches
      const allVocab: VocabItem[] = [];
      const allVerbs: VocabItem[] = [];
      const allParticles: VocabItem[] = [];

      if (cacheData) {
        for (const cache of cacheData) {
          try {
            // Migrer automatiquement si nécessaire
            const rawData = cache.payload as any;
            const data = needsMigration(rawData) ? migrateExtractVocabResult(rawData) : rawData;

            // Ajouter le vocabulaire (mapper les propriétés correctement)
            if (data.vocabulaire && Array.isArray(data.vocabulaire)) {
              const vocabItems = data.vocabulaire.map((item: any) => ({
                word: item.singulier || item.word,
                translation: item.traduction || item.translation,
                root: item.racine || item.root,
                singulier: item.singulier,
                pluriel: item.pluriel,
                contraire: item.contraire,
              }));
              allVocab.push(...vocabItems);
            }

            // Ajouter les verbes
            if (data.verbes && Array.isArray(data.verbes)) {
              const verbItems = data.verbes.map((item: any) => ({
                word: item.passe_3ms || item.word,
                translation: item.traduction || item.translation,
                root: item.passe_3ms || item.root,
              }));
              allVerbs.push(...verbItems);
            }

            // Ajouter les particules
            if (data.particules && Array.isArray(data.particules)) {
              const particleItems = data.particules.map((item: any) => ({
                word: item.particule_ar || item.word,
                translation: item.traduction || item.translation,
                root: item.type || item.root,
              }));
              allParticles.push(...particleItems);
            }
          } catch (e) {
            console.error('Erreur parsing cache:', e);
          }
        }
      }

      // Éliminer les doublons (basé sur le mot arabe SANS diacritiques pour éviter les faux doublons)
      const stripDiacritics = (w: string) => w.replace(/[\u064B-\u0652]/g, '').trim();
      const uniqueVocab = Array.from(
        new Map(allVocab.map(item => [stripDiacritics(item.word), item])).values()
      );
      const uniqueVerbs = Array.from(
        new Map(allVerbs.map(item => [stripDiacritics(item.word), item])).values()
      );
      const uniqueParticles = Array.from(
        new Map(allParticles.map(item => [stripDiacritics(item.word), item])).values()
      );

      // Trier par ordre alphabétique arabe
      setVocabulary(uniqueVocab.sort((a, b) => a.word.localeCompare(b.word, 'ar')));
      setVerbs(uniqueVerbs.sort((a, b) => a.word.localeCompare(b.word, 'ar')));
      setParticles(uniqueParticles.sort((a, b) => a.word.localeCompare(b.word, 'ar')));

    } catch (error) {
      console.error('Erreur chargement statistiques:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  // Filtrer selon la recherche
  const getFilteredData = () => {
    const q = query.trim().toLowerCase();
    let data: VocabItem[] = [];

    switch (activeTab) {
      case 'vocabulary':
        data = vocabulary;
        break;
      case 'verbs':
        data = verbs;
        break;
      case 'particles':
        data = particles;
        break;
    }

    if (!q) return data;

    return data.filter(
      (item) =>
        item.word.toLowerCase().includes(q) ||
        item.translation.toLowerCase().includes(q) ||
        (item.root && item.root.toLowerCase().includes(q))
    );
  };

  const filteredData = getFilteredData();

  const getTotalCount = () => {
    return vocabulary.length + verbs.length + particles.length;
  };

  return (
    <View style={styles.container}>
      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <MaterialCommunityIcons name="arrow-left" size={24} color="white" />
        </TouchableOpacity>
        <Text style={styles.title}>{t('settings.statistics')}</Text>
      </View>

      <ScrollView style={styles.scrollContainer} contentContainerStyle={styles.scrollContent}>
      {/* RÉSUMÉ */}
      <View style={styles.summary}>
        {/* Première ligne : Mots totaux et Vocabulaire */}
        <View style={styles.summaryRow}>
          <View style={styles.summaryCard}>
            <MaterialCommunityIcons name="book-alphabet" size={32} color="#2E7D32" />
            <Text style={styles.summaryCount}>{getTotalCount()}</Text>
            <Text style={styles.summaryLabel}>{t('statistics.totalWords')}</Text>
          </View>

          <View style={styles.summaryCard}>
            <MaterialCommunityIcons name="book-open-variant" size={32} color="#1976d2" />
            <Text style={styles.summaryCount}>{vocabulary.length}</Text>
            <Text style={styles.summaryLabel}>{t('statistics.vocabulary')}</Text>
          </View>
        </View>

        {/* Deuxième ligne : Verbes et Particules */}
        <View style={styles.summaryRow}>
          <View style={styles.summaryCard}>
            <MaterialCommunityIcons name="run-fast" size={32} color="#FF9800" />
            <Text style={styles.summaryCount}>{verbs.length}</Text>
            <Text style={styles.summaryLabel}>{t('statistics.verbs')}</Text>
          </View>

          <View style={styles.summaryCard}>
            <MaterialCommunityIcons name="star-four-points" size={32} color="#9C27B0" />
            <Text style={styles.summaryCount}>{particles.length}</Text>
            <Text style={styles.summaryLabel}>{t('statistics.particles')}</Text>
          </View>
        </View>
      </View>

      {/* TABS */}
      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'vocabulary' && styles.tabActive]}
          onPress={() => setActiveTab('vocabulary')}
        >
          <Text style={[styles.tabText, activeTab === 'vocabulary' && styles.tabTextActive]}>
            {t('statistics.vocabulary')} ({vocabulary.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tab, activeTab === 'verbs' && styles.tabActive]}
          onPress={() => setActiveTab('verbs')}
        >
          <Text style={[styles.tabText, activeTab === 'verbs' && styles.tabTextActive]}>
            {t('statistics.verbs')} ({verbs.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tab, activeTab === 'particles' && styles.tabActive]}
          onPress={() => setActiveTab('particles')}
        >
          <Text style={[styles.tabText, activeTab === 'particles' && styles.tabTextActive]}>
            {t('statistics.particles')} ({particles.length})
          </Text>
        </TouchableOpacity>
      </View>

      {/* BARRE DE RECHERCHE */}
      <View style={styles.searchContainer}>
        <MaterialCommunityIcons name="magnify" size={20} color="#999" />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={t('library.search')}
          style={styles.searchInput}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {query.length > 0 && (
          <TouchableOpacity onPress={() => setQuery('')}>
            <MaterialCommunityIcons name="close-circle" size={20} color="#999" />
          </TouchableOpacity>
        )}
      </View>

      {/* LISTE */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#2E7D32" />
          <Text style={styles.loadingText}>{t('statistics.loading')}</Text>
        </View>
      ) : (
        <View style={styles.list}>
          {filteredData.length > 0 ? (
            filteredData.map((item, index) => (
              <View key={`${item.word}-${index}`} style={styles.wordCard}>
                <View style={styles.wordHeader}>
                  <Text style={styles.arabicWord}>{item.word}</Text>
                  {item.root && (
                    <Text style={styles.root}>
                      {t('statistics.root')}: {item.root}
                    </Text>
                  )}
                </View>
                <Text style={styles.translation}>{item.translation}</Text>

                {/* Singulier, Pluriel et Contraire */}
                {(item.singulier || item.pluriel || item.contraire) && (
                  <View style={styles.formsRow}>
                    {item.singulier && (
                      <Text style={styles.formText}>
                        {t('statistics.singular')}: {item.singulier}
                      </Text>
                    )}
                    {item.pluriel && (
                      <Text style={styles.formText}>
                        {t('statistics.plural')}: {item.pluriel}
                      </Text>
                    )}
                    {item.contraire && (
                      <Text style={styles.contraire}>
                        {t('statistics.opposite')}: {item.contraire}
                      </Text>
                    )}
                  </View>
                )}
              </View>
            ))
          ) : (
            <View style={styles.emptyState}>
              <MaterialCommunityIcons name="book-off-outline" size={64} color="#ccc" />
              <Text style={styles.emptyText}>
                {query.trim() ? t('library.noResults') : t('statistics.noWords')}
              </Text>
            </View>
          )}
        </View>
      )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  scrollContainer: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 120,
  },
  header: {
    backgroundColor: '#2E7D32',
    paddingVertical: 16,
    paddingHorizontal: 16,
    paddingTop: 50,
    flexDirection: 'row',
    alignItems: 'center',
  },
  backBtn: {
    marginRight: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: 'white',
  },
  summary: {
    padding: 16,
    gap: 12,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: 12,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
    aspectRatio: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  summaryCardWide: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    minHeight: 120,
  },
  summaryCount: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 8,
  },
  summaryLabel: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
    textAlign: 'center',
  },
  tabs: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 8,
    marginBottom: 12,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: 'white',
    borderRadius: 8,
    alignItems: 'center',
  },
  tabActive: {
    backgroundColor: '#2E7D32',
  },
  tabText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
  },
  tabTextActive: {
    color: 'white',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    marginHorizontal: 16,
    marginBottom: 12,
    paddingHorizontal: 12,
    borderRadius: 8,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 14,
  },
  list: {
    paddingHorizontal: 16,
  },
  wordCard: {
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 14,
    marginBottom: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#2E7D32',
  },
  wordHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  arabicWord: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    flex: 1,
  },
  root: {
    fontSize: 12,
    color: '#999',
    fontStyle: 'italic',
  },
  translation: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  formsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 6,
    marginBottom: 4,
  },
  formText: {
    fontSize: 13,
    color: '#1976d2',
    fontStyle: 'italic',
  },
  contraire: {
    fontSize: 13,
    color: '#FF9800',
    fontWeight: '600',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#666',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 16,
    color: '#999',
    marginTop: 16,
    textAlign: 'center',
  },
});
