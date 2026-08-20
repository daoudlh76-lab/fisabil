
import { useChatTutor } from "@/hooks/use-chat-tutor";
import { useLanguage } from "@/hooks/use-language";
import { supabase } from "@/src/lib/supabase";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { useRouter } from "expo-router";
import { useSubscription } from "@/contexts/subscription-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Animated,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";
import { Colors } from "@/constants/colors";

// Détection légère (rendu uniquement) pour distinguer les bulles de récitation arabe
function isArabicMessage(text: string): boolean {
  return /[؀-ۿ]/.test(text);
}

// Une bulle "question" (générée par askPreparedQuestion) se distingue d'une bulle
// "correction" (générée par evaluateAnswer) par son préfixe fixe "السؤال N/Total: ..."
function isQuestionMessage(text: string): boolean {
  const stripped = text.replace(/[ً-ٰٟ]/g, "").trim();
  return stripped.startsWith("السؤال");
}

export default function TutorPage() {
  const { language, t } = useLanguage();
  const { isPremium, isLoaded } = useSubscription();
  const [selectedTextId, setSelectedTextId] = useState<string | undefined>(undefined);
  const [searchQuery, setSearchQuery] = useState("");
  // Garde-fou : évite de déclencher prepareNow() deux fois pour le même texte
  const preparedForRef = useRef<Set<string>>(new Set());

  const {
    isConnected,
    isListening,
    isTranscribing,
    isSpeaking,
    isPaused,
    transcript,
    userTranscript,
    liveTranscript,
    messages,
    error,
    userTexts,
    questionCount,
    connect,
    disconnect,
    sendTextMessage,
    interrupt,
    togglePause,
    clearMessages,
    startListening,
    stopListening,
    loadUserTexts,
    preparedCount,
    prepareNow,
    startDialogue,
  } = useChatTutor(language, selectedTextId);

  const [inputText, setInputText] = useState("");
  const [connecting, setConnecting] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);

  // Pulsation décorative du point "En ligne" dans le header
  const pulseAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 0.3, duration: 900, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 900, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulseAnim]);

  // Ondes dorées de l'indicateur "Oustaze lit la question…"
  const waveAnim1 = useRef(new Animated.Value(0.4)).current;
  const waveAnim2 = useRef(new Animated.Value(0.4)).current;
  const waveAnim3 = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    if (!isSpeaking) return;
    const makeLoop = (anim: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(anim, { toValue: 1, duration: 350, useNativeDriver: false }),
          Animated.timing(anim, { toValue: 0.4, duration: 350, useNativeDriver: false }),
        ])
      );
    const loops = [makeLoop(waveAnim1, 0), makeLoop(waveAnim2, 120), makeLoop(waveAnim3, 240)];
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [isSpeaking, waveAnim1, waveAnim2, waveAnim3]);

  // Pulsation verte du cercle micro pendant l'écoute
  const micPulseAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!isListening) {
      micPulseAnim.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(micPulseAnim, { toValue: 1.15, duration: 500, useNativeDriver: true }),
        Animated.timing(micPulseAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [isListening, micPulseAnim]);

  // Recharger les textes à chaque fois que l'utilisateur revient sur cette page
  // + arrêter l'audio quand on quitte la page
  useFocusEffect(
    useCallback(() => {
      __DEV__ && console.log('📚 [PAGE] Rechargement des textes du tuteur...');
      loadUserTexts();

      return () => {
        // Full disconnect when leaving the tutor page (stops TTS, speech recognition, and all async flows)
        disconnect();
      };
    }, [loadUserTexts, disconnect])
  );

  // Filtrer les textes par recherche
  const filteredTexts = useMemo(() => {
    if (!searchQuery.trim()) return userTexts;
    const query = searchQuery.trim().toLowerCase();
    return userTexts.filter(t =>
      t.title.toLowerCase().includes(query) ||
      t.content.toLowerCase().includes(query)
    );
  }, [userTexts, searchQuery]);

  // Log userTexts à chaque changement
  useEffect(() => {
    __DEV__ && console.log('📚 [PAGE] userTexts mis à jour:', userTexts.length);
    if (userTexts.length > 0) {
      __DEV__ && console.log('📚 [PAGE] Premier texte:', userTexts[0]?.title);
    }
  }, [userTexts]);

  // Prépare silencieusement les questions IA pour un texte, une seule fois par texte
  const triggerPrepare = useCallback((textId: string) => {
    if (preparedForRef.current.has(textId)) return;
    preparedForRef.current.add(textId);
    prepareNow(textId);
  }, [prepareNow]);

  // Sélectionne automatiquement le texte le plus récent tant qu'aucune sélection n'existe,
  // et lance la préparation IA en arrière-plan dès qu'un texte est sélectionné
  useEffect(() => {
    if (!selectedTextId && userTexts.length > 0) {
      setSelectedTextId(userTexts[0].id);
      return;
    }
    if (selectedTextId) triggerPrepare(selectedTextId);
  }, [selectedTextId, userTexts, triggerPrepare]);

  // Scroll auto
  useEffect(() => {
    scrollViewRef.current?.scrollToEnd({ animated: true });
  }, [messages, transcript, userTranscript]);

  const handleSendText = () => {
    if (inputText.trim()) {
      sendTextMessage(inputText.trim());
      setInputText("");
    }
  };

  const router = useRouter();

  const handleConnect = async () => {
    if (isLoaded && !isPremium) {
      Alert.alert(
        t('realtimeTutor.premiumRequired'),
        t('realtimeTutor.premiumRequiredMessage'),
        [
          { text: t('settings.cancel'), style: 'cancel' },
          { text: t('settings.upgradeToPremium'), onPress: () => router.push('/(tabs)/subscription') },
        ]
      );
      return;
    }
    if (isConnected) {
      disconnect();
    } else {
      setConnecting(true);
      await connect();
      setConnecting(false);
    }
  };

  const selectedText = userTexts.find((ut) => ut.id === selectedTextId);
  const totalQuestions = questionCount + preparedCount(selectedTextId);
  const dotColor = isSpeaking ? Colors.accent : "#4CAF50";
  const subtitleColor = isSpeaking ? Colors.accent : isListening ? "#4CAF50" : "rgba(248,243,236,0.6)";

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={[styles.container, { backgroundColor: isConnected ? Colors.deep : Colors.cream }]}
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <LinearGradient colors={[Colors.deep, Colors.green]} style={styles.headerAvatar}>
            <Text style={styles.headerAvatarIcon}>🧠</Text>
          </LinearGradient>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Oustaze</Text>
            <View style={styles.headerSubtitleRow}>
              {isConnected && (
                <Animated.View style={[styles.onlineDot, { backgroundColor: dotColor, opacity: pulseAnim }]} />
              )}
              <Text style={[styles.headerSubtitle, { color: subtitleColor }]}>
                {isSpeaking ? t("realtimeTutor.statusSpeaking") :
                 isListening ? t("realtimeTutor.statusListening") :
                 isTranscribing ? t("realtimeTutor.statusTranscribing") :
                 isConnected ? t("realtimeTutor.statusReady") :
                 t("realtimeTutor.statusOffline")}
              </Text>
            </View>
          </View>
        </View>

        {!isConnected && messages.length === 0 && userTexts.length > 0 && (
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder={t('library.search')}
            placeholderTextColor="rgba(248,243,236,0.5)"
            style={styles.headerSearch}
            autoCapitalize="none"
            autoCorrect={false}
          />
        )}

        {isConnected && selectedText && (
          <View style={styles.activeTextChip}>
            <Text style={styles.activeTextChipTitle} numberOfLines={1}>{selectedText.title}</Text>
            {totalQuestions > 0 && (
              <Text style={styles.activeTextChipCount}>
                {t('realtimeTutor.questionOf', { n: questionCount, total: totalQuestions })}
              </Text>
            )}
          </View>
        )}
      </View>

      {/* Bandeau abonnement requis */}
      {isLoaded && !isPremium && (
        <View style={styles.trialExpiredBanner}>
          <Text style={styles.trialExpiredText}>{t('realtimeTutor.premiumRequired')}</Text>
          <Pressable style={styles.upgradeBtn} onPress={() => router.push('/(tabs)/subscription')}>
            <Text style={styles.upgradeBtnText}>{t('settings.upgradeToPremium')}</Text>
          </Pressable>
        </View>
      )}

      {isSpeaking && (
        <View style={styles.speakingIndicator}>
          <View style={styles.waveBars}>
            <Animated.View style={[styles.waveBar, { height: waveAnim1.interpolate({ inputRange: [0, 1], outputRange: [6, 20] }) }]} />
            <Animated.View style={[styles.waveBar, { height: waveAnim2.interpolate({ inputRange: [0, 1], outputRange: [6, 20] }) }]} />
            <Animated.View style={[styles.waveBar, { height: waveAnim3.interpolate({ inputRange: [0, 1], outputRange: [6, 20] }) }]} />
          </View>
          <Text style={styles.speakingIndicatorText}>{t('realtimeTutor.readingQuestion')}</Text>
        </View>
      )}

      {isListening && (
        <View style={styles.listeningTranscript}>
          <Text style={styles.listeningTranscriptText}>
            {liveTranscript || "…"}
          </Text>
        </View>
      )}

      {/* Messages */}
      <ScrollView
        ref={scrollViewRef}
        style={styles.messagesContainer}
        contentContainerStyle={styles.messagesContent}
        onContentSizeChange={() =>
          scrollViewRef.current?.scrollToEnd({ animated: true })
        }
      >
        {!isConnected && messages.length === 0 && (
          <View style={styles.emptyState}>
            {userTexts.length > 0 ? (
              <>
                <ScrollView
                  style={styles.textList}
                  contentContainerStyle={styles.textListContent}
                  nestedScrollEnabled={true}
                >
                  {filteredTexts.map((text) => {
                    const selected = selectedTextId === text.id;
                    const wordCount = text.content ? text.content.trim().split(/\s+/).filter(Boolean).length : 0;
                    return (
                      <Pressable
                        key={text.id}
                        style={[styles.textCard, selected && styles.textCardSelected]}
                        onPress={() => setSelectedTextId(text.id)}
                      >
                        <LinearGradient colors={[Colors.deep, Colors.mid]} style={styles.textCardIcon}>
                          <Ionicons name="document-text-outline" size={18} color={Colors.cream} />
                        </LinearGradient>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.textCardTitle} numberOfLines={1}>{text.title}</Text>
                          <Text style={styles.textCardSubtitle}>
                            {t('realtimeTutor.wordsCount', { count: wordCount })}
                          </Text>
                        </View>
                        <Text style={styles.textCardChevron}>›</Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>

                <Pressable
                  style={[styles.startWithTextButton, (!selectedTextId || connecting) && { opacity: 0.6 }]}
                  disabled={!selectedTextId || connecting}
                  onPress={async () => {
                    if (selectedTextId) triggerPrepare(selectedTextId);
                    await handleConnect();
                  }}
                >
                  {connecting ? (
                    <ActivityIndicator color={Colors.accent} />
                  ) : (
                    <Text style={styles.startWithTextButtonText} numberOfLines={1}>
                      {t('realtimeTutor.startWithText', {
                        title: userTexts.find(ut => ut.id === selectedTextId)?.title ?? '',
                      })}
                    </Text>
                  )}
                </Pressable>
                <Text style={styles.startHint}>{t('realtimeTutor.autoStartHint')}</Text>
              </>
            ) : (
              <>
                <Text style={styles.emptyStateTitle}>
                  {t("realtimeTutor.welcomeTitle")}
                </Text>
                <Text style={styles.emptyStateText}>
                  {t("realtimeTutor.welcomeText")}
                </Text>
              </>
            )}
          </View>
        )}

        {messages.map((message) => {
          const isUser = message.role === "user";
          const isArabic = !isUser && isArabicMessage(message.text);
          const isQuestion = isArabic && isQuestionMessage(message.text);
          return (
            <View
              key={message.id}
              style={[
                styles.messageWrapper,
                isUser ? styles.userMessageWrapper : styles.tutorMessageWrapper,
              ]}
            >
              {isQuestion ? (
                <LinearGradient
                  colors={[Colors.deep, Colors.green]}
                  style={[styles.messageBubble, styles.arabicMessage]}
                >
                  <Text style={styles.arabicMessageText}>{message.text}</Text>
                </LinearGradient>
              ) : isArabic ? (
                <View style={[styles.messageBubble, styles.correctionMessage]}>
                  <Text style={styles.correctionMessageText}>{message.text}</Text>
                </View>
              ) : (
                <View
                  style={[
                    styles.messageBubble,
                    isUser ? styles.userMessage : styles.tutorMessage,
                  ]}
                >
                  <Text
                    style={[
                      styles.messageText,
                      isUser ? styles.userMessageText : styles.tutorMessageText,
                    ]}
                  >
                    {message.text}
                  </Text>
                </View>
              )}
            </View>
          );
        })}

        {/* Ce que l'utilisateur est en train de dire */}
        {userTranscript && (
          <View style={[styles.messageWrapper, styles.userMessageWrapper]}>
            <View style={[styles.messageBubble, styles.userMessage, styles.transcriptBubble]}>
              <Text style={styles.userTranscriptText}>
                {userTranscript}
                <Text style={styles.typingIndicator}>{" ..."}</Text>
              </Text>
            </View>
          </View>
        )}

        {/* Transcription du tuteur en cours */}
        {transcript && (
          <View style={[styles.messageWrapper, styles.tutorMessageWrapper]}>
            <View style={[styles.messageBubble, styles.tutorMessage, styles.transcriptBubble]}>
              <Text style={styles.transcriptText}>
                {transcript}
                <Text style={styles.typingIndicator}>{" ..."}</Text>
              </Text>
            </View>
          </View>
        )}

        {error && (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{"⚠️ " + error}</Text>
          </View>
        )}
      </ScrollView>

      {/* Barre de saisie — toujours visible, se connecte automatiquement au premier usage */}
      <View style={[styles.bottomControls, isConnected && styles.bottomControlsDark]}>
        <View style={styles.inputBar}>
          <Animated.View style={{ transform: [{ scale: micPulseAnim }] }}>
            <Pressable
              style={[
                styles.micCircle,
                isListening && styles.micCircleActive,
                isTranscribing && styles.micCircleTranscribing,
                isPaused && styles.micCirclePaused,
                isSpeaking && styles.micCircleDisabled,
              ]}
              onPress={async () => {
                if (!isConnected) {
                  setConnecting(true);
                  await handleConnect();
                  setConnecting(false);
                  return;
                }
                if (isPaused) {
                  togglePause();
                } else if (isListening) {
                  stopListening();
                } else if (!isSpeaking && !isTranscribing) {
                  startListening();
                }
              }}
              disabled={connecting || isSpeaking || isTranscribing}
            >
              <Ionicons
                name={isListening ? "stop" : isPaused ? "play" : "mic"}
                size={18}
                color={Colors.cream}
              />
            </Pressable>
          </Animated.View>

          <TextInput
            style={[styles.input, isConnected && styles.inputDark]}
            placeholder={t("realtimeTutor.inputPlaceholder") || "Ou tapez votre message..."}
            placeholderTextColor={isConnected ? "rgba(248,243,236,0.4)" : Colors.muted}
            value={inputText}
            onChangeText={setInputText}
            multiline
          />

          <Pressable
            style={[styles.sendButton, !inputText.trim() && styles.sendButtonDisabled]}
            onPress={async () => {
              if (!isConnected) {
                setConnecting(true);
                await handleConnect();
                setConnecting(false);
              }
              handleSendText();
            }}
            disabled={!inputText.trim()}
          >
            <Ionicons name="send" size={18} color={Colors.accent} />
          </Pressable>
        </View>
      </View>

      {/* Boutons d'action en bas */}
      <View style={styles.actionBar}>
        {isConnected && (
          <Pressable style={styles.disconnectButton} onPress={disconnect}>
            <Text style={styles.disconnectButtonText}>Déconnecter</Text>
          </Pressable>
        )}
        {messages.length > 0 && (
          <Pressable style={styles.clearButton} onPress={clearMessages}>
            <Text style={styles.clearButtonText}>{t("tutor.clear")}</Text>
          </Pressable>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.cream,
  },
  header: {
    backgroundColor: Colors.deep,
    paddingHorizontal: 16,
    paddingTop: Platform.OS === "android" ? 24 : 56,
    paddingBottom: 16,
    gap: 12,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  headerSearch: {
    backgroundColor: "rgba(255,255,255,0.12)",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: Colors.cream,
    fontSize: 14,
  },
  headerAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
  },
  headerAvatarIcon: {
    fontSize: 20,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: Colors.cream,
  },
  headerSubtitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 2,
  },
  onlineDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: "#4CAF50",
  },
  headerSubtitle: {
    fontSize: 12,
    color: "rgba(248,243,236,0.6)",
  },
  trialExpiredBanner: {
    backgroundColor: "#FFEBEE",
    padding: 14,
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: "#D32F2F",
    alignItems: "center",
  },
  trialExpiredText: { fontSize: 14, fontWeight: "700", color: "#D32F2F", textAlign: "center" },
  upgradeBtn: { marginTop: 8, paddingVertical: 6, paddingHorizontal: 12, backgroundColor: "#2E7D32", borderRadius: 6 },
  upgradeBtnText: { fontSize: 13, fontWeight: "600", color: Colors.white },
  activeTextChip: {
    marginTop: 12,
    alignSelf: "flex-start",
    backgroundColor: "rgba(201,168,76,0.12)",
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    maxWidth: "100%",
  },
  activeTextChipTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: Colors.accent,
    flexShrink: 1,
  },
  activeTextChipCount: {
    fontSize: 12,
    fontWeight: "600",
    color: "rgba(201,168,76,0.7)",
  },
  speakingIndicator: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 10,
  },
  waveBars: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    height: 20,
  },
  waveBar: {
    width: 4,
    borderRadius: 2,
    backgroundColor: Colors.accent,
  },
  speakingIndicatorText: {
    fontSize: 13,
    fontWeight: "600",
    color: Colors.accent,
  },
  listeningTranscript: {
    marginHorizontal: 16,
    marginTop: 4,
    marginBottom: 8,
    backgroundColor: "rgba(106,191,75,0.08)",
    borderWidth: 1,
    borderColor: "rgba(106,191,75,0.2)",
    borderRadius: 12,
    padding: 14,
    minHeight: 50,
    justifyContent: "center",
  },
  listeningTranscriptText: {
    fontSize: 16,
    fontStyle: "italic",
    color: "rgba(248,243,236,0.5)",
    textAlign: "right",
    writingDirection: "rtl",
  },
  correctionMessage: {
    backgroundColor: "rgba(106,191,75,0.15)",
    borderWidth: 1,
    borderColor: "rgba(106,191,75,0.3)",
  },
  correctionMessageText: {
    fontSize: 16,
    lineHeight: 26,
    color: Colors.cream,
    textAlign: "right",
    writingDirection: "rtl",
  },
  messagesContainer: {
    flex: 1,
  },
  messagesContent: {
    paddingVertical: 16,
    paddingHorizontal: 12,
  },
  emptyState: {
    alignItems: "center",
    paddingTop: 20,
  },
  emptyStateTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 8,
  },
  emptyStateText: {
    fontSize: 14,
    color: "#666",
    textAlign: "center",
    marginBottom: 12,
    paddingHorizontal: 24,
  },
  messageWrapper: {
    marginVertical: 8,
    flexDirection: "row",
  },
  userMessageWrapper: {
    justifyContent: "flex-end",
  },
  tutorMessageWrapper: {
    justifyContent: "flex-start",
  },
  messageBubble: {
    maxWidth: "85%",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
  },
  userMessage: {
    backgroundColor: "rgba(255,255,255,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
  },
  tutorMessage: {
    backgroundColor: Colors.white,
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 1,
  },
  arabicMessage: {
    borderWidth: 1,
    borderColor: "rgba(201,168,76,0.25)",
  },
  arabicMessageText: {
    fontSize: 17,
    lineHeight: 28,
    color: Colors.accent,
    textAlign: "right",
    writingDirection: "rtl",
  },
  transcriptBubble: {
    borderWidth: 2,
    borderStyle: "dashed",
    opacity: 0.8,
  },
  messageText: {
    fontSize: 16,
    lineHeight: 22,
  },
  userMessageText: {
    color: Colors.white,
  },
  tutorMessageText: {
    color: "#333",
  },
  transcriptText: {
    fontSize: 16,
    color: "#666",
    fontStyle: "italic",
  },
  userTranscriptText: {
    fontSize: 16,
    color: Colors.white,
    fontStyle: "italic",
  },
  typingIndicator: {
    color: "#4CAF50",
    fontWeight: "bold",
  },
  errorContainer: {
    padding: 12,
    backgroundColor: "#FFEBEE",
    borderRadius: 8,
    marginVertical: 8,
  },
  errorText: {
    color: "#D32F2F",
    fontSize: 12,
  },
  bottomControls: {
    backgroundColor: Colors.white,
    borderTopWidth: 1,
    borderTopColor: Colors.cream2,
    padding: 12,
  },
  bottomControlsDark: {
    backgroundColor: Colors.deep,
    borderTopColor: "rgba(255,255,255,0.1)",
  },
  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
  },
  micCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.deep,
    justifyContent: "center",
    alignItems: "center",
  },
  micCircleActive: {
    backgroundColor: "#4CAF50",
  },
  micCircleTranscribing: {
    backgroundColor: "#9C27B0",
  },
  micCirclePaused: {
    backgroundColor: "#9E9E9E",
  },
  micCircleDisabled: {
    opacity: 0.35,
  },
  micCircleIcon: {
    fontSize: 18,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 100,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: Colors.cream,
    borderRadius: 20,
    fontSize: 14,
  },
  inputDark: {
    backgroundColor: "rgba(255,255,255,0.08)",
    color: Colors.cream,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.deep,
    justifyContent: "center",
    alignItems: "center",
  },
  sendButtonDisabled: {
    backgroundColor: "#BDBDBD",
  },
  sendButtonText: {
    fontSize: 18,
  },
  actionBar: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "transparent",
  },
  disconnectButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: "#FFEBEE",
    borderRadius: 8,
  },
  disconnectButtonText: {
    color: "#D32F2F",
    fontSize: 12,
    fontWeight: "600",
  },
  clearButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: "#F5F5F5",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E0E0E0",
  },
  clearButtonText: {
    color: "#666",
    fontSize: 12,
    fontWeight: "600",
  },
  textList: {
    maxHeight: 360,
    width: "100%",
  },
  textListContent: {
    gap: 10,
    paddingHorizontal: 16,
  },
  textCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: Colors.white,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1.5,
    borderColor: "transparent",
    shadowColor: Colors.black,
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  textCardSelected: {
    borderColor: Colors.green,
    backgroundColor: "#f0f7f2",
  },
  textCardIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  textCardTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: Colors.text,
    marginBottom: 2,
  },
  textCardSubtitle: {
    fontSize: 12,
    color: Colors.muted,
  },
  textCardChevron: {
    fontSize: 20,
    color: Colors.muted,
  },
  startWithTextButton: {
    marginTop: 16,
    marginHorizontal: 16,
    backgroundColor: Colors.deep,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
  },
  startWithTextButtonText: {
    color: Colors.accent,
    fontSize: 16,
    fontWeight: "800",
  },
  startHint: {
    marginTop: 10,
    marginHorizontal: 24,
    fontSize: 12,
    color: Colors.muted,
    textAlign: "center",
  },
});
