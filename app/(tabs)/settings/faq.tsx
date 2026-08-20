import { Colors } from '@/constants/colors';
import { useLanguage } from '@/hooks/use-language';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const QUESTION_KEYS = ['1', '2', '3', '4', '5'] as const;

export default function FaqScreen() {
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const rotateAnims = useRef(QUESTION_KEYS.map(() => new Animated.Value(0))).current;

  const toggle = (index: number) => {
    const isOpening = expandedIndex !== index;

    Animated.timing(rotateAnims[index], {
      toValue: isOpening ? 1 : 0,
      duration: 200,
      useNativeDriver: true,
    }).start();

    if (expandedIndex !== null && expandedIndex !== index) {
      Animated.timing(rotateAnims[expandedIndex], {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }

    setExpandedIndex(isOpening ? index : null);
  };

  return (
    <View style={{ flex: 1, backgroundColor: Colors.cream }}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={styles.backButton}>
          <MaterialCommunityIcons name="chevron-left" size={26} color={Colors.cream} />
        </Pressable>
        <Text style={styles.headerTitle}>{t('faq.title')}</Text>
        <View style={styles.backButton} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {QUESTION_KEYS.map((key, index) => {
          const isOpen = expandedIndex === index;
          const rotate = rotateAnims[index].interpolate({
            inputRange: [0, 1],
            outputRange: ['0deg', '90deg'],
          });

          return (
            <Pressable key={key} style={styles.card} onPress={() => toggle(index)}>
              <View style={styles.cardHeader}>
                <Text style={styles.question}>{t(`faq.q${key}`)}</Text>
                <Animated.View style={{ transform: [{ rotate }] }}>
                  <MaterialCommunityIcons name="chevron-right" size={22} color={Colors.muted} />
                </Animated.View>
              </View>
              {isOpen && <Text style={styles.answer}>{t(`faq.a${key}`)}</Text>}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.deep,
    paddingHorizontal: 8,
    paddingBottom: 16,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '800',
    color: Colors.cream,
  },
  content: {
    padding: 16,
    gap: 10,
  },
  card: {
    backgroundColor: Colors.white,
    borderRadius: 14,
    padding: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  question: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: Colors.text,
  },
  answer: {
    marginTop: 12,
    fontSize: 14,
    lineHeight: 21,
    color: Colors.muted,
  },
});
