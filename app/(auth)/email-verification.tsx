import { useRouter } from "expo-router";
import { useState } from "react";
import { Alert, Image, Pressable, StyleSheet, Text, View, ActivityIndicator } from "react-native";
import { supabase } from "@/src/lib/supabase";
import { useLanguage } from "@/hooks/use-language";

export default function EmailVerificationScreen() {
  const { t } = useLanguage();
  const router = useRouter();
  const [resending, setResending] = useState(false);

  async function resendVerificationEmail() {
    setResending(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();

      if (!user?.email) {
        Alert.alert(t('auth.error'), t('emailVerification.noEmail'));
        setResending(false);
        return;
      }

      // Resend email via Supabase
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: user.email,
      });

      if (error) {
        Alert.alert(t('auth.error'), error.message);
      } else {
        Alert.alert(t('auth.success'), t('emailVerification.emailResent'));
      }
    } catch (e: any) {
      Alert.alert(t('auth.error'), e?.message ?? t('auth.error'));
    } finally {
      setResending(false);
    }
  }

  async function goToLogin() {
    // Déconnecter l'utilisateur avant de retourner à la page de login
    await supabase.auth.signOut();
    router.replace('/(auth)/login');
  }

  return (
    <View style={styles.container}>
      <Image source={require("@/assets/logo.png")} style={styles.logo} resizeMode="contain" />

      <View style={styles.iconContainer}>
        <Text style={styles.icon}>📧</Text>
      </View>

      <Text style={styles.title}>{t('emailVerification.title')}</Text>

      <Text style={styles.message}>{t('emailVerification.message')}</Text>

      <View style={styles.steps}>
        <View style={styles.step}>
          <Text style={styles.stepNumber}>1</Text>
          <Text style={styles.stepText}>{t('emailVerification.step1')}</Text>
        </View>

        <View style={styles.step}>
          <Text style={styles.stepNumber}>2</Text>
          <Text style={styles.stepText}>{t('emailVerification.step2')}</Text>
        </View>

        <View style={styles.step}>
          <Text style={styles.stepNumber}>3</Text>
          <Text style={styles.stepText}>{t('emailVerification.step3')}</Text>
        </View>
      </View>

      <Pressable
        style={[styles.button, resending && { opacity: 0.6 }]}
        onPress={resendVerificationEmail}
        disabled={resending}
      >
        {resending ? (
          <ActivityIndicator color="#FFF" />
        ) : (
          <Text style={styles.buttonText}>{t('emailVerification.resendButton')}</Text>
        )}
      </Pressable>

      <Pressable onPress={goToLogin} style={styles.loginLink}>
        <Text style={styles.loginLinkText}>{t('emailVerification.backToLogin')}</Text>
      </Pressable>

      <Text style={styles.hint}>{t('emailVerification.hint')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    backgroundColor: "#F8F3EC",
    justifyContent: "center",
  },
  logo: {
    width: 100,
    height: 100,
    alignSelf: "center",
    marginBottom: 24,
  },
  iconContainer: {
    alignSelf: "center",
    marginBottom: 24,
  },
  icon: {
    fontSize: 64,
  },
  title: {
    fontSize: 26,
    fontWeight: "800",
    textAlign: "center",
    marginBottom: 16,
    color: "#2F6B3D",
  },
  message: {
    fontSize: 16,
    textAlign: "center",
    marginBottom: 32,
    color: "#666",
    lineHeight: 24,
  },
  steps: {
    marginBottom: 32,
    gap: 16,
  },
  step: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  stepNumber: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#2F6B3D",
    color: "#FFF",
    fontSize: 16,
    fontWeight: "700",
    textAlign: "center",
    lineHeight: 32,
  },
  stepText: {
    flex: 1,
    fontSize: 14,
    color: "#333",
  },
  button: {
    backgroundColor: "#2F6B3D",
    padding: 16,
    borderRadius: 16,
    marginTop: 8,
    alignItems: "center",
  },
  buttonText: {
    color: "#FFF",
    fontWeight: "800",
    fontSize: 16,
  },
  loginLink: {
    marginTop: 16,
    padding: 8,
  },
  loginLinkText: {
    textAlign: "center",
    color: "#2F6B3D",
    textDecorationLine: "underline",
    fontWeight: "600",
  },
  hint: {
    fontSize: 12,
    textAlign: "center",
    color: "#999",
    marginTop: 24,
    fontStyle: "italic",
  },
});
