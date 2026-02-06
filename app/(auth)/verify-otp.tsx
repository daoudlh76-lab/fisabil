import { useLanguage } from "@/hooks/use-language";
import { supabase } from "@/src/lib/supabase";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Alert, Image, Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableWithoutFeedback, View } from "react-native";

export default function VerifyOtpScreen() {
  const { t } = useLanguage();
  const router = useRouter();
  const { email } = useLocalSearchParams<{ email: string }>();

  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  // Gérer la saisie du code OTP (single input, 8 caractères max, allow alphanumeric)
  const handleOtpChange = (value: string) => {
    // Accept all characters but trim whitespace
    const val = value.replace(/\s/g, '').slice(0, 8);
    setOtp(val);
    // Auto-verify only when exactly 8 chars
    if (val.length === 8) {
      verifyOtp(val);
    }
  };

  // No special backspace handling needed for single input

  // Vérifier le code OTP via Supabase native (email token)
  async function verifyOtp(code: string) {
    if (!code || code.length !== 8) {
      Alert.alert(t('auth.error'), t('auth.otpInvalid'));
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.verifyOtp({
        email: email!,
        token: code,
        type: 'recovery',
      });

      if (error) {
        Alert.alert(t('auth.error'), error.message || t('auth.otpExpired'));
        setLoading(false);
        setOtp("");
        return;
      }

      if (__DEV__) console.log('✅ Code OTP validé pour:', email);

      router.replace({
        pathname: '/(auth)/reset-password',
        params: {
          email: email!,
          verified: 'true',
          otp: code,
        },
      });
      setLoading(false);
    } catch (e: any) {
      Alert.alert(t('auth.error'), e?.message ?? t('auth.error'));
      setLoading(false);
      setOtp("");
    }
  }

  // Renvoyer le code via Supabase native
  async function resendCode() {
    setResending(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email!);

      if (error) {
        if (__DEV__) console.error('Erreur resetPasswordForEmail (resend):', error);
        Alert.alert(t('auth.error'), error.message || t('auth.otpSendError'));
        setResending(false);
        return;
      }

      Alert.alert(t('auth.otpResent'), t('auth.otpResentMessage'));
      setOtp("");
    } catch (e: any) {
      Alert.alert(t('auth.error'), e?.message ?? t('auth.error'));
    } finally {
      setResending(false);
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

          <Text style={styles.icon}>🔐</Text>

          <Text style={styles.title}>{t('auth.otpTitle')}</Text>

          <Text style={styles.description}>
            {t('auth.otpDescription')} {email}
          </Text>

          {/* Champ OTP unique (8 caractères) */}
          <View style={styles.otpContainer}>
            <TextInput
              style={[styles.otpInput, otp !== '' && styles.otpInputFilled, styles.otpSingle]}
              value={otp}
              onChangeText={handleOtpChange}
              keyboardType="default"
              maxLength={8}
              autoFocus
              editable={!loading}
              returnKeyType="done"
              textContentType="oneTimeCode"
              placeholder={t('auth.otpPlaceholder')}
            />
          </View>

          {loading && (
            <ActivityIndicator size="large" color="#2F6B3D" style={styles.loader} />
          )}

          <Pressable
            style={styles.resendButton}
            onPress={resendCode}
            disabled={resending || loading}
          >
            <Text style={styles.resendButtonText}>
              {resending ? t('auth.sending') : t('auth.resendCode')}
            </Text>
          </Pressable>

          <Pressable
            onPress={() => router.back()}
            style={styles.backButton}
          >
            <Text style={styles.backButtonText}>{t('auth.back')}</Text>
          </Pressable>
        </ScrollView>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "transparent",
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
    marginBottom: 32,
    color: "#666",
    lineHeight: 24,
  },
  otpContainer: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 12,
    marginBottom: 24,
  },
  otpInput: {
    width: 48,
    height: 56,
    borderWidth: 2,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    backgroundColor: "#FFF",
    textAlign: "center",
    fontSize: 24,
    fontWeight: "700",
    color: "#2F6B3D",
  },
  otpSingle: {
    width: 240,
    textAlign: 'left',
    paddingHorizontal: 12,
    fontSize: 20,
    letterSpacing: 6,
  },
  otpInputFilled: {
    borderColor: "#2F6B3D",
    backgroundColor: "#F0F9F1",
  },
  loader: {
    marginVertical: 16,
  },
  resendButton: {
    marginTop: 16,
    padding: 12,
  },
  resendButtonText: {
    textAlign: "center",
    color: "#2F6B3D",
    fontWeight: "600",
    fontSize: 14,
  },
  backButton: {
    marginTop: 24,
    padding: 8,
  },
  backButtonText: {
    textAlign: "center",
    color: "#666",
    textDecorationLine: "underline",
    fontWeight: "600",
  },
});
