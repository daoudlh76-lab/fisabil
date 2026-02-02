
import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TextInput,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useRealtimeTutor } from "@/hooks/use-realtime-tutor";
import { useLanguage } from "@/hooks/use-language";
import AnimatedLogoButton from "@/components/AnimatedLogoButton";
import { useFocusEffect } from "@react-navigation/native";

export default function TutorPage() {
  const { language, t } = useLanguage();
  const {
    isConnected,
    isListening,
    isTranscribing,
    isSpeaking,
    isPaused,
    transcript,
    userTranscript,
    messages,
    error,
    userTexts,
    connect,
    disconnect,
    sendTextMessage,
    interrupt,
    togglePause,
    clearMessages,
    startListening,
    stopListening,
    loadUserTexts,
  } = useRealtimeTutor(language);

  const [inputText, setInputText] = useState("");
  const [connecting, setConnecting] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);

  // Recharger les textes à chaque fois que l'utilisateur revient sur cette page
  useFocusEffect(
    useCallback(() => {
      console.log('📚 [PAGE] Rechargement des textes du tuteur...');
      console.log('📚 [PAGE] userTexts actuels:', userTexts.length);
      loadUserTexts().then((texts) => {
        console.log('📚 [PAGE] Textes rechargés:', texts?.length || 0);
      });
    }, [loadUserTexts, userTexts])
  );

  // Log userTexts à chaque changement
  useEffect(() => {
    console.log('📚 [PAGE] userTexts mis à jour:', userTexts.length);
    if (userTexts.length > 0) {
      console.log('📚 [PAGE] Premier texte:', userTexts[0]?.title);
    }
  }, [userTexts]);

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

  const handleConnect = async () => {
    if (isConnected) {
      disconnect();
    } else {
      setConnecting(true);
      await connect();
      setConnecting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={styles.container}
    >
      {/* Barre d'info avec contrôles */}
      <View style={styles.infoBar}>
        <Text style={styles.infoText}>
          {"📚 "}{userTexts.length} {t("realtimeTutor.textsAvailable")}
        </Text>
        <View style={styles.controlsRow}>
          {isConnected && (
            <Pressable
              style={[styles.controlButton, isPaused ? styles.resumeButton : styles.pauseButton]}
              onPress={togglePause}
            >
              <Text style={styles.controlButtonText}>
                {isPaused ? "▶️ Reprendre" : "⏸️ Pause"}
              </Text>
            </Pressable>
          )}
          {isSpeaking && (
            <Pressable style={styles.interruptButton} onPress={interrupt}>
              <Text style={styles.interruptButtonText}>
                ⏹️ {t("realtimeTutor.interrupt")}
              </Text>
            </Pressable>
          )}
        </View>
      </View>

      {/* Indicateur d'état en haut */}
      {isConnected && (
        <View style={[
          styles.statusBar,
          isTranscribing ? styles.statusTranscribing :
          isListening ? styles.statusListening :
          isSpeaking ? styles.statusSpeaking :
          isPaused ? styles.statusPaused : styles.statusReady
        ]}>
          <Text style={styles.statusText}>
            {isPaused ? "⏸️ En pause" :
             isTranscribing ? "📝 Transcription..." :
             isListening ? "🎤 Parlez en arabe..." :
             isSpeaking ? "🔊 Le tuteur parle..." :
             "✅ Prêt à écouter"}
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
            <Text style={styles.emptyStateTitle}>
              {t("realtimeTutor.welcomeTitle")}
            </Text>
            <Text style={styles.emptyStateText}>
              {t("realtimeTutor.welcomeText")}
            </Text>
            <Text style={styles.emptyStateHint}>
              {t("realtimeTutor.pressToStart")}
            </Text>
            <AnimatedLogoButton
              onPress={handleConnect}
              disabled={connecting}
              connecting={connecting}
              size={180}
            />
          </View>
        )}

        {messages.map((message) => (
          <View
            key={message.id}
            style={[
              styles.messageWrapper,
              message.role === "user"
                ? styles.userMessageWrapper
                : styles.tutorMessageWrapper,
            ]}
          >
            <View
              style={[
                styles.messageBubble,
                message.role === "user"
                  ? styles.userMessage
                  : styles.tutorMessage,
              ]}
            >
              <Text
                style={[
                  styles.messageText,
                  message.role === "user"
                    ? styles.userMessageText
                    : styles.tutorMessageText,
                ]}
              >
                {message.text}
              </Text>
            </View>
          </View>
        ))}

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

      {/* Boutons de contrôle quand connecté */}
      {isConnected && (
        <View style={styles.bottomControls}>
          {/* Bouton micro principal - pour démarrer/arrêter l'enregistrement */}
          <Pressable
            style={[
              styles.mainMicButton,
              isListening && styles.mainMicButtonActive,
              isTranscribing && styles.mainMicButtonTranscribing,
              isPaused && styles.mainMicButtonPaused,
            ]}
            onPress={() => {
              if (isPaused) {
                togglePause();
              } else if (isListening) {
                // Arrêter l'enregistrement et transcrire
                stopListening();
              } else if (!isSpeaking && !isTranscribing) {
                startListening();
              }
            }}
            disabled={isSpeaking || isTranscribing}
          >
            <Text style={styles.mainMicButtonText}>
              {isPaused ? "Reprendre" : isTranscribing ? "Transcription..." : isListening ? "Arrêter" : "Parler"}
            </Text>
          </Pressable>

          {/* Zone de texte fallback */}
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.input}
              placeholder={t("realtimeTutor.inputPlaceholder") || "Ou tapez votre message..."}
              placeholderTextColor="#999"
              value={inputText}
              onChangeText={setInputText}
              multiline
            />
            <Pressable
              style={[styles.sendButton, !inputText.trim() && styles.sendButtonDisabled]}
              onPress={handleSendText}
              disabled={!inputText.trim()}
            >
              <Text style={styles.sendButtonText}>{"📤"}</Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* Boutons d'action en bas */}
      <View style={styles.actionBar}>
        {isConnected && (
          <Pressable style={styles.disconnectButton} onPress={disconnect}>
            <Text style={styles.disconnectButtonText}>🔴 Déconnecter</Text>
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
    backgroundColor: "transparent",
  },
  infoBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: "transparent",
  },
  infoText: {
    fontSize: 12,
    color: "#2E7D32",
  },
  controlsRow: {
    flexDirection: "row",
    gap: 8,
  },
  controlButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  pauseButton: {
    backgroundColor: "#FF9800",
  },
  resumeButton: {
    backgroundColor: "#4CAF50",
  },
  controlButtonText: {
    fontSize: 12,
    color: "#FFF",
    fontWeight: "600",
  },
  interruptButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: "#D32F2F",
    borderRadius: 16,
  },
  interruptButtonText: {
    fontSize: 12,
    color: "#FFF",
    fontWeight: "600",
  },
  statusBar: {
    paddingVertical: 10,
    alignItems: "center",
  },
  statusListening: {
    backgroundColor: "#E3F2FD",
  },
  statusTranscribing: {
    backgroundColor: "#F3E5F5",
  },
  statusSpeaking: {
    backgroundColor: "#FFF3E0",
  },
  statusPaused: {
    backgroundColor: "#FFEBEE",
  },
  statusReady: {
    backgroundColor: "#E8F5E9",
  },
  statusText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
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
    justifyContent: "center",
    paddingVertical: 60,
  },
  emptyStateEmoji: {
    fontSize: 64,
    marginBottom: 16,
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
  emptyStateHint: {
    fontSize: 12,
    color: "#4CAF50",
    fontWeight: "600",
    paddingHorizontal: 16,
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
    backgroundColor: "#2E7D32",
  },
  tutorMessage: {
    backgroundColor: "#FFF",
    borderWidth: 1,
    borderColor: "#E0E0E0",
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
    color: "#FFF",
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
    color: "#FFF",
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
    backgroundColor: "#FFF",
    borderTopWidth: 1,
    borderTopColor: "#E0E0E0",
    padding: 12,
  },
  mainMicButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#4CAF50",
    paddingVertical: 16,
    borderRadius: 30,
    marginBottom: 12,
    gap: 8,
  },
  mainMicButtonActive: {
    backgroundColor: "#1976D2",
  },
  mainMicButtonTranscribing: {
    backgroundColor: "#9C27B0",
  },
  mainMicButtonPaused: {
    backgroundColor: "#9E9E9E",
  },
  mainMicButtonIcon: {
    fontSize: 24,
  },
  mainMicButtonText: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#FFF",
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 100,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: "#F5F5F5",
    borderRadius: 20,
    fontSize: 14,
    marginRight: 8,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#2E7D32",
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
  startButton: {
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: "#4CAF50",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 30,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  startButtonConnecting: {
    backgroundColor: "#FF9800",
  },
  startButtonIcon: {
    fontSize: 48,
    marginBottom: 8,
  },
  startButtonText: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#FFF",
    textAlign: "center",
  },
});
