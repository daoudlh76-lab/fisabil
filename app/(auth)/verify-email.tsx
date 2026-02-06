import { useRouter, useLocalSearchParams } from "expo-router";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { useLanguage } from "@/hooks/use-language";

export default function VerifyEmailScreen() {
  const { t } = useLanguage();
  const router = useRouter();
  const { email } = useLocalSearchParams<{ email: string }>();

  return (
    <View style={styles.container}>
      <Image source={require("@/assets/logo.png")} style={styles.logo} resizeMode="contain" />

      <Text style={styles.icon}>📧</Text>

      <Text style={styles.title}>{t('auth.emailSentTitle')}</Text>

      <Text style={styles.description}>
        {t('auth.emailSentTo')}
      </Text>

      <Text style={styles.email}>{email}</Text>

      <View style={styles.instructionsContainer}>
        <Text style={styles.instructionTitle}>{t('auth.instructions')}</Text>
        <Text style={styles.instruction}>1. {t('auth.step1VerifyEmail')}</Text>
        <Text style={styles.instruction}>2. {t('auth.step2ClickLink')}</Text>
        <Text style={styles.instruction}>3. {t('auth.step3AutoOpen')}</Text>
        <Text style={styles.instruction}>4. {t('auth.step4NewPassword')}</Text>
      </View>

      <Text style={styles.hint}>
        {t('auth.linkExpiry')}
      </Text>

      <Pressable
        style={styles.button}
        onPress={() => router.replace('/(auth)/login')}
      >
        <Text style={styles.buttonText}>{t('auth.backToLoginButton')}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    backgroundColor: "transparent",
    justifyContent: "center",
  },
  logo: {
    width: 100,
    height: 100,
    alignSelf: "center",
    marginBottom: 24,
  },
  icon: {
    fontSize: 64,
    textAlign: "center",
    marginBottom: 16,
  },
  title: {
    fontSize: 26,
    fontWeight: "800",
    textAlign: "center",
    marginBottom: 16,
    color: "#2F6B3D",
  },
  description: {
    fontSize: 16,
    textAlign: "center",
    marginBottom: 8,
    color: "#666",
  },
  email: {
    fontSize: 16,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 32,
    color: "#2F6B3D",
  },
  instructionsContainer: {
    backgroundColor: "#F0F9F1",
    padding: 20,
    borderRadius: 12,
    marginBottom: 24,
    borderLeftWidth: 4,
    borderLeftColor: "#2F6B3D",
  },
  instructionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#2F6B3D",
    marginBottom: 12,
  },
  instruction: {
    fontSize: 14,
    color: "#333",
    marginBottom: 8,
    lineHeight: 20,
  },
  hint: {
    fontSize: 12,
    textAlign: "center",
    color: "#999",
    marginBottom: 24,
    fontStyle: "italic",
    lineHeight: 18,
  },
  button: {
    backgroundColor: "#2F6B3D",
    padding: 16,
    borderRadius: 16,
    alignItems: "center",
  },
  buttonText: {
    color: "#FFF",
    fontWeight: "800",
    fontSize: 16,
  },
});
