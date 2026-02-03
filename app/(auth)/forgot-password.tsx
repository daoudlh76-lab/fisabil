import { useRouter } from "expo-router";
import { useState } from "react";
import { Alert, Image, Pressable, StyleSheet, Text, TextInput, View, ActivityIndicator } from "react-native";
import { supabase } from "@/src/lib/supabase";
import { useLanguage } from "@/hooks/use-language";

export default function ForgotPasswordScreen() {
  const { t } = useLanguage();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  async function handleResetPassword() {
    if (!email) {
      Alert.alert(t('auth.error'), t('auth.invalidEmail'));
      return;
    }

    setLoading(true);
    try {
      // Utiliser un deep link pour rediriger vers l'app mobile
      // Le lien dans l'email ouvrira l'app à /reset-password avec le token
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: 'fisabil://reset-password',
      });

      if (error) {
        Alert.alert(t('auth.error'), error.message);
        setLoading(false);
        return;
      }

      setEmailSent(true);
      setLoading(false);
    } catch (e: any) {
      Alert.alert(t('auth.error'), e?.message ?? t('auth.error'));
      setLoading(false);
    }
  }

  if (emailSent) {
    return (
      <View style={styles.container}>
        <Image source={require("@/assets/logo.png")} style={styles.logo} resizeMode="contain" />

        <View style={styles.iconContainer}>
          <Text style={styles.icon}>✉️</Text>
        </View>

        <Text style={styles.title}>{t('auth.resetEmailSent')}</Text>

        <Text style={styles.message}>{t('auth.resetEmailMessage')}</Text>

        <Pressable
          style={styles.button}
          onPress={() => router.replace('/(auth)/login')}
        >
          <Text style={styles.buttonText}>{t('auth.backToLogin')}</Text>
        </Pressable>

        <Text style={styles.hint}>{t('auth.checkSpam')}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Image source={require("@/assets/logo.png")} style={styles.logo} resizeMode="contain" />

      <Text style={styles.title}>{t('auth.forgotPasswordTitle')}</Text>

      <Text style={styles.description}>{t('auth.forgotPasswordDescription')}</Text>

      <TextInput
        style={styles.input}
        placeholder={t('auth.emailPlaceholder')}
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
        editable={!loading}
      />

      <Pressable
        style={[styles.button, loading && { opacity: 0.6 }]}
        onPress={handleResetPassword}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#FFF" />
        ) : (
          <Text style={styles.buttonText}>{t('auth.sendResetLink')}</Text>
        )}
      </Pressable>

      <Pressable
        onPress={() => router.back()}
        style={styles.backButton}
      >
        <Text style={styles.backButtonText}>{t('auth.backToLogin')}</Text>
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
  description: {
    fontSize: 16,
    textAlign: "center",
    marginBottom: 24,
    color: "#666",
    lineHeight: 24,
  },
  message: {
    fontSize: 16,
    textAlign: "center",
    marginBottom: 32,
    color: "#666",
    lineHeight: 24,
  },
  input: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    backgroundColor: "#FFF",
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
  backButton: {
    marginTop: 16,
    padding: 8,
  },
  backButtonText: {
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
