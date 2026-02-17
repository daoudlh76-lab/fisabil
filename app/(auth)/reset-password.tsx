import { useLanguage } from "@/hooks/use-language";
import { supabase } from "@/src/lib/supabase";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Image, Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableWithoutFeedback, View } from "react-native";

export default function ResetPasswordScreen() {
  const { t } = useLanguage();
  const router = useRouter();
  const { email, verified, otp } = useLocalSearchParams<{ email?: string; verified?: string; otp?: string }>();

  // ...existing state declarations...
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Vérifier qu'on a bien l'email et que l'OTP est vérifié OU qu'une session existe
  useEffect(() => {
    const checkAccess = async () => {
      __DEV__ && console.log('🔍 Reset Password - Paramètres reçus:', { email, verified, otp });

      // Normaliser verified (accepte 'true' ou true)
      const verifiedFlag = verified === 'true' || verified === true || verified === '1' || verified === 1;

      // Si on vient du flux OTP avec verified=true
      if (verifiedFlag && email) {
        __DEV__ && console.log('✅ Flux OTP validé - accès autorisé');
        return; // OK, on peut continuer
      }

      __DEV__ && console.log('⚠️ Flux OTP non détecté, vérification de la session...');

      // Sinon, vérifier qu'une session existe (flux magic link classique)
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        __DEV__ && console.log('❌ Aucune session - redirection vers forgot-password');
        Alert.alert(
          t('auth.error'),
          "Accès non autorisé. Veuillez recommencer le processus.",
          [{ text: "OK", onPress: () => router.replace('/(auth)/forgot-password') }]
        );
      } else {
        __DEV__ && console.log('✅ Session trouvée - accès autorisé');
      }
    };
    checkAccess();
  }, [email, verified, otp]);

  async function handleResetPassword() {
    if (!newPassword || !confirmPassword) {
      Alert.alert(t('auth.error'), t('auth.fillAllFields'));
      return;
    }

    if (newPassword.length < 6) {
      Alert.alert(t('auth.error'), t('auth.shortPassword'));
      return;
    }

    if (newPassword !== confirmPassword) {
      Alert.alert(t('auth.error'), t('auth.passwordsDoNotMatch'));
      return;
    }

    setLoading(true);
    try {
      // Normaliser verified (accepte 'true' ou true)
      const verifiedFlag = verified === 'true' || verified === true || verified === '1' || verified === 1;

      if (verifiedFlag && email) {
        // Flux OTP natif Supabase : l'utilisateur doit avoir une session après vérification
        const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });

        if (updateError) {
          Alert.alert(t('auth.error'), updateError.message || t('auth.resetButton'));
          setLoading(false);
          return;
        }

        Alert.alert(
          t('auth.resetSuccess'),
          t('auth.resetSuccessMessage'),
          [{ text: 'OK', onPress: () => router.replace('/(auth)/login') }]
        );
        setLoading(false);
        return;
      } else {
        // Flux classique (magic link) : utiliser updateUser
        const { error } = await supabase.auth.updateUser({
          password: newPassword,
        });

        if (error) {
          Alert.alert(t('auth.error'), error.message);
          setLoading(false);
          return;
        }

        Alert.alert(
          t('auth.resetSuccess'),
          t('auth.resetSuccessMessage'),
          [
            {
              text: "OK",
              onPress: () => router.replace('/(auth)/login'),
            },
          ]
        );
        setLoading(false);
      }
    } catch (e: any) {
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

          <Text style={styles.title}>{t('auth.newPasswordTitle')}</Text>

          <Text style={styles.description}>
            {t('auth.newPasswordDescription')}
          </Text>

          <View style={styles.passwordContainer}>
            <TextInput
              style={styles.passwordInput}
              placeholder={t('auth.newPasswordPlaceholder')}
              secureTextEntry={!showPassword}
              value={newPassword}
              onChangeText={setNewPassword}
              editable={!loading}
            />
            <Pressable
              style={styles.eyeButton}
              onPress={() => setShowPassword(!showPassword)}
              disabled={loading}
            >
              <Text style={styles.eyeIcon}>{showPassword ? "👁️" : "👁️‍🗨️"}</Text>
            </Pressable>
          </View>

          <View style={styles.passwordContainer}>
            <TextInput
              style={styles.passwordInput}
              placeholder={t('auth.confirmPasswordPlaceholder')}
              secureTextEntry={!showConfirmPassword}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              editable={!loading}
            />
            <Pressable
              style={styles.eyeButton}
              onPress={() => setShowConfirmPassword(!showConfirmPassword)}
              disabled={loading}
            >
              <Text style={styles.eyeIcon}>{showConfirmPassword ? "👁️" : "👁️‍🗨️"}</Text>
            </Pressable>
          </View>

          <Pressable
            style={[styles.button, loading && { opacity: 0.6 }]}
            onPress={handleResetPassword}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Text style={styles.buttonText}>{t('auth.resetButton')}</Text>
            )}
          </Pressable>

          <Pressable
            onPress={() => router.replace('/(auth)/login')}
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
  passwordContainer: {
    position: "relative",
    marginBottom: 16,
  },
  passwordInput: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    padding: 12,
    paddingRight: 50,
    backgroundColor: "#FFF",
  },
  eyeButton: {
    position: "absolute",
    right: 12,
    top: 12,
    padding: 4,
  },
  eyeIcon: {
    fontSize: 20,
  },
  button: {
    backgroundColor: "#2F6B3D",
    padding: 16,
    borderRadius: 16,
    alignItems: "center",
    marginTop: 8,
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
});
