
import React, { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useRealtimeTutor } from "@/hooks/use-realtime-tutor";
import { useLanguage } from "@/hooks/use-language";
import { useSpeechNative } from "@/hooks/use-speech-native";


export default function TutorPage() {
  const { language, t } = useLanguage();
  const {
    isConnected,
    isSpeaking,
    transcript,
    messages,
    error,
    userTexts,
    connect,
    disconnect,
    sendTextMessage,
    interrupt,
    clearMessages,
  } = useRealtimeTutor(language);

  // Reconnaissance vocale native
  const {
    isListening,
    transcript: voiceTranscript,
    error: voiceError,
    startListening,
    stopListening,
  } = useSpeechNative();

  const [inputText, setInputText] = useState("");
  const [connecting, setConnecting] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);

  // Scroll auto
  useEffect(() => {
    scrollViewRef.current?.scrollToEnd({ animated: true });
  }, [messages, transcript]);

  // Quand une transcription vocale est reçue, envoyer automatiquement
  useEffect(() => {
    if (voiceTranscript && isConnected && !isSpeaking) {
      setInputText(voiceTranscript);
      sendTextMessage(voiceTranscript);
    }
  }, [voiceTranscript, isConnected, isSpeaking, sendTextMessage]);

  const handleSendText = () => {
    if (inputText.trim()) {
      sendTextMessage(inputText.trim());
      setInputText("");
    }
  };

  const handleConnect = () => {
    if (isConnected) {
      disconnect();
    } else {
      setConnecting(true);
      connect();
      setConnecting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={styles.container}
    >
      {/* Info textes */}
      <View style={styles.infoBar}>
        <Text style={styles.infoText}>
          {"📚 "}{userTexts.length} {t("realtimeTutor.textsAvailable")}
        </Text>
        {isSpeaking && (
          <Pressable style={styles.interruptButton} onPress={interrupt}>
            <Text style={styles.interruptButtonText}>
              ⏸️ {t("realtimeTutor.interrupt")}
            </Text>
          </Pressable>
        )}
      </View>

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
            <Text style={styles.emptyStateEmoji}>{"🎙️"}</Text>
            <Text style={styles.emptyStateTitle}>
              {t("realtimeTutor.welcomeTitle")}
            </Text>
            <Text style={styles.emptyStateText}>
              {t("realtimeTutor.welcomeText")}
            </Text>
            <Text style={styles.emptyStateHint}>
              {t("realtimeTutor.pressToStart")}
            </Text>
            <Pressable
              style={[styles.startButton, connecting && styles.startButtonConnecting]}
              onPress={handleConnect}
              disabled={connecting}
            >
              {connecting ? (
                <ActivityIndicator size="large" color="#fff" />
              ) : (
                <>
                  <Text style={styles.startButtonIcon}>{"🎤"}</Text>
                  <Text style={styles.startButtonText}>{t("realtimeTutor.startConversation") || "Démarrer"}</Text>
                </>
              )}
            </Pressable>
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

        {/* Transcription en cours */}
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

        {/* Indicateur d'écoute */}
        {isListening && (
          <View style={styles.listeningIndicator}>
            <Text style={styles.listeningText}>{"🎤 " + t("realtimeTutor.youAreSpeaking")}</Text>
          </View>
        )}

        {error && (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{"⚠️ " + error}</Text>
          </View>
        )}
      </ScrollView>

      {/* Input Area (texte + micro) */}
      {isConnected && (
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            placeholder={t("realtimeTutor.inputPlaceholder")}
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
          <Pressable
            style={[styles.sendButton, isListening && styles.sendButtonDisabled, { marginLeft: 8 }]}
            onPress={isListening ? stopListening : startListening}
            disabled={isSpeaking}
          >
            <Text style={styles.sendButtonText}>{isListening ? "⏹️" : "🎤"}</Text>
          </Pressable>
        </View>
      )}

      {/* Hint + erreurs micro */}
      <Text style={styles.helpHint}>
        {isConnected 
          ? t("realtimeTutor.speakDirectly")
          : t("realtimeTutor.pressStartHint")}
      </Text>
      {voiceError && (
        <Text style={[styles.helpHint, { color: '#D32F2F' }]}>{"🎤 " + voiceError}</Text>
      )}

      {/* Clear Button */}
      {messages.length > 0 && (
        <Pressable style={styles.clearButton} onPress={clearMessages}>
          <Text style={styles.clearButtonText}>{t("tutor.clear")}</Text>
        </Pressable>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F5F5F5",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingTop: 50,
    backgroundColor: "#1B5E20",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#FFF",
  },
  headerSubtitle: {
    fontSize: 12,
    color: "#A5D6A7",
    marginTop: 2,
  },
  headerButtons: {
    flexDirection: "row",
    gap: 8,
  },
  connectButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "#4CAF50",
    justifyContent: "center",
    alignItems: "center",
  },
  disconnectButton: {
    backgroundColor: "#D32F2F",
  },
  connectingButton: {
    backgroundColor: "#FF9800",
  },
  connectButtonText: {
    fontSize: 20,
    color: "#FFF",
  },
  infoBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: "#E8F5E9",
  },
  infoText: {
    fontSize: 12,
    color: "#2E7D32",
  },
  interruptButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: "#FF9800",
    borderRadius: 16,
  },
  interruptButtonText: {
    fontSize: 12,
    color: "#FFF",
    fontWeight: "600",
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
    borderColor: "#4CAF50",
    borderWidth: 2,
    borderStyle: "dashed",
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
  typingIndicator: {
    color: "#4CAF50",
    fontWeight: "bold",
  },
  listeningIndicator: {
    alignItems: "center",
    paddingVertical: 12,
  },
  listeningText: {
    fontSize: 14,
    color: "#4CAF50",
    fontWeight: "600",
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
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#FFF",
    borderTopWidth: 1,
    borderTopColor: "#E0E0E0",
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
  helpHint: {
    fontSize: 11,
    color: "#666",
    textAlign: "center",
    paddingHorizontal: 16,
    paddingVertical: 8,
    fontStyle: "italic",
    backgroundColor: "#f5f5f5",
  },
  clearButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginHorizontal: 12,
    marginBottom: 12,
    backgroundColor: "#FFEBEE",
    borderRadius: 8,
    alignItems: "center",
  },
  clearButtonText: {
    color: "#D32F2F",
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
