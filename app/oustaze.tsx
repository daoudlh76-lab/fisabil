import { useChatTutor } from '@/hooks/use-chat-tutor';
import React, { useEffect } from 'react';
import { Button, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

export default function OustazeTestPage() {
  const {
    connect,
    loadUserTexts,
    userTexts,
    messages,
    isConnected,
    startDialogue,
    preparedCount,
    prepareNow,
    clearMessages,
  } = useChatTutor('fr');

  useEffect(() => {
    // preload texts and prepare questions
    loadUserTexts();
  }, [loadUserTexts]);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>OUSTAZE DEBUG</Text>

      <View style={styles.banner}>
        <Text style={styles.bannerText}>Debug build — prepared total: {preparedCount()}</Text>
      </View>

      <View style={styles.row}>
        <Button title={isConnected ? 'Connected' : 'Connect'} onPress={() => connect()} />
        <Button title="Clear" onPress={() => clearMessages()} />
      </View>

      <Text style={styles.sub}>Loaded texts:</Text>
      {userTexts.length === 0 && <Text style={styles.note}>(No texts found — scan a text first)</Text>}
      {userTexts.map(t => (
        <View key={t.id} style={styles.textCard}>
          <View style={styles.cardHeader}>
            <Text style={styles.textTitle}>{t.title}</Text>
            <View style={[styles.indicator, preparedCount(t.id) > 0 ? styles.indicatorReady : styles.indicatorEmpty]} />
          </View>
          <Text style={styles.count}>Questions préparées: {preparedCount(t.id)}</Text>
            <View style={styles.row}>
              <Button title="Start Dialogue" onPress={() => startDialogue(t.id)} />
              <Pressable style={styles.prepareBtn} onPress={() => prepareNow(t.id)}>
                <Text style={styles.prepareBtnText}>Préparer maintenant</Text>
              </Pressable>
            </View>
        </View>
      ))}

      <Text style={styles.sub}>Messages (latest):</Text>
      {messages.slice(-20).map(m => (
        <View key={m.id} style={styles.msg}>
          <Text style={{ fontWeight: m.role === 'assistant' ? '700' : '400' }}>{m.role}</Text>
          <Text>{m.text}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16 },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 12 },
  banner: { padding: 12, backgroundColor: '#FEF3F2', borderRadius: 8, marginVertical: 8 },
  bannerText: { color: '#B91C1C', fontWeight: '700' },
  sub: { fontSize: 16, fontWeight: '600', marginTop: 12 },
  row: { flexDirection: 'row', gap: 8, marginVertical: 8 },
  textCard: { padding: 8, borderWidth: 1, borderColor: '#eee', borderRadius: 8, marginTop: 8 },
  textTitle: { fontSize: 14, fontWeight: '700' },
  msg: { padding: 8, borderBottomWidth: 1, borderColor: '#f2f2f2' },
  note: { color: '#666' },
  count: { fontSize: 12, color: '#666', marginTop: 4 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  indicator: { width: 12, height: 12, borderRadius: 6, marginLeft: 8 },
  indicatorReady: { backgroundColor: '#2F6B3D' },
  indicatorEmpty: { backgroundColor: '#D1D5DB' },
  prepareBtn: { marginLeft: 8, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: '#F3F4F6', borderRadius: 8 },
  prepareBtnText: { fontSize: 12, color: '#111', fontWeight: '600' },
});
// Removed duplicate test component; file now exports `OustazeTestPage` only.
