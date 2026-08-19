import { useLanguage } from "@/hooks/use-language";
import { supabase } from "@/src/lib/supabase";
import { useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Alert, Image, Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableWithoutFeedback } from "react-native";
// Edge Function will handle OTP generation and email sending

export default function ForgotPasswordScreen() {
  const { t } = useLanguage();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleResetPassword() {
    if (!email) {
      Alert.alert(t('auth.error'), t('auth.invalidEmail'));
      return;
    }

    setLoading(true);

    // Normaliser l'email (trim + lowercase)
    const normalizedEmail = email.trim().toLowerCase();

    try {

      if (__DEV__) console.log('Demande envoi OTP via Supabase pour:', normalizedEmail);

      try {
        // Use resetPasswordForEmail to trigger Supabase's password reset email
        // (legacy/deprecated deep-link flow can be customized server-side to send a code instead of a magic link)
        const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail);

        if (error) {
          if (__DEV__) console.error('Erreur resetPasswordForEmail:', error);
          Alert.alert(t('auth.error'), error.message || 'Impossible d\'envoyer le code pour le moment.');
          setLoading(false);
          return;
        }

        if (__DEV__) console.log('Supabase reset email envoyé');
        router.push({ pathname: '/(auth)/verify-otp', params: { email: normalizedEmail } });
        setLoading(false);
        return;
      } catch (e: any) {
        if (__DEV__) console.error('Exception resetPasswordForEmail:', e);
        Alert.alert(t('auth.error'), t('auth.otpSendError'));
        setLoading(false);
        return;
      }
    } catch (e: any) {
      if (__DEV__) console.error('Exception handleResetPassword:', e);
      Alert.alert(t('auth.error'), e?.message ?? t('auth.error'));
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <Image source={require("@/assets/logo.png")} style={styles.logo} resizeMode="contain" />

          <Text style={styles.title}>{t('auth.forgotPasswordTitle')}</Text>

          <Text style={styles.description}>{t('auth.forgotPasswordDescription')}</Text>

          <TextInput
            style={styles.input}
            placeholder={t('auth.emailPlaceholder')}
            placeholderTextColor="rgba(255,255,255,0.4)"
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
              <ActivityIndicator color="#0D2318" />
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
        </ScrollView>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0D2318",
  },
  scrollContent: {
    flexGrow: 1,
    padding: 24,
    justifyContent: "center",
  },
  logo: {
    width: 100,
    height: 100,
    alignSelf: "center",
    marginBottom: 24,
  },
  title: {
    fontSize: 26,
    fontWeight: "800",
    textAlign: "center",
    marginBottom: 16,
    color: "#F8F3EC",
  },
  description: {
    fontSize: 16,
    textAlign: "center",
    marginBottom: 24,
    color: "rgba(255,255,255,0.6)",
    lineHeight: 24,
  },
  input: {
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    backgroundColor: "rgba(255,255,255,0.1)",
    color: "#F8F3EC",
  },
  button: {
    backgroundColor: "#C9A84C",
    padding: 16,
    borderRadius: 16,
    alignItems: "center",
  },
  buttonText: {
    color: "#0D2318",
    fontWeight: "800",
    fontSize: 16,
  },
  backButton: {
    marginTop: 16,
    padding: 8,
  },
  backButtonText: {
    textAlign: "center",
    color: "rgba(255,255,255,0.5)",
    textDecorationLine: "underline",
    fontWeight: "600",
  },
});
