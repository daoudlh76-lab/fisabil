import { useFocusEffect, useRouter } from "expo-router";
import { useState, useCallback } from "react";
import { Alert, Image, Pressable, StyleSheet, Text, TextInput, View, KeyboardAvoidingView, ScrollView, Platform } from "react-native";
import { supabase } from "@/src/lib/supabase";
import { useLanguage } from "@/hooks/use-language";
import { useVoicePreference, Gender } from "@/contexts/voice-preference-context";

export default function LoginScreen() {
  const { t } = useLanguage();
  const { setGender, gender } = useVoicePreference();
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false); // false = connexion par défaut
  const [selectedGender, setSelectedGender] = useState<Gender>("male");
  const [showPassword, setShowPassword] = useState(false);

  // Réinitialiser le formulaire quand on arrive sur la page
  useFocusEffect(
    useCallback(() => {
      setEmail("");
      setPassword("");
      setLoading(false);
      setSelectedGender("male"); // Réinitialiser aussi le genre sélectionné
    }, [])
  );

  async function onLogin() {
    if (!email || !password) {
      Alert.alert(t('auth.error'), t('auth.invalidEmail'));
      return;
    }

    setLoading(true);
    console.log('🔐 Tentative de connexion avec:', email);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });

      if (error) {
        console.log('🔐 Login error:', error);
        console.log('🔐 Error status:', error.status);
        console.log('🔐 Error code:', (error as any).code);
        console.log('🔐 Error message complet:', JSON.stringify(error));

        // Message d'erreur plus clair selon le type d'erreur
        let errorMessage = error.message;

        if (error.message.includes('Invalid login credentials')) {
          // L'erreur "Invalid login credentials" peut signifier :
          // 1. Mauvais email/mot de passe
          // 2. Email non vérifié
          // On ne peut pas faire la différence côté client pour des raisons de sécurité
          errorMessage = t('auth.invalidCredentials');
        } else if (error.message.includes('Email not confirmed')) {
          errorMessage = t('auth.emailNotConfirmed');
        }

        Alert.alert(t('auth.error'), errorMessage);
        setLoading(false);
        return;
      }

      console.log('✅ Login successful:', data.user?.email);
      console.log('✅ User ID:', data.user?.id);
      console.log('✅ Email confirmed:', data.user?.email_confirmed_at);
      // ✅ Redirection automatique via le hook useAuth
      // (pas besoin de router.replace ici)
    } catch (e: any) {
      console.error('🔐 Login exception:', e);
      Alert.alert(t('auth.error'), e?.message ?? t('auth.error'));
      setLoading(false);
    }
  }

  async function onSignUp() {
    if (!email || !password) {
      Alert.alert(t('auth.error'), t('auth.invalidEmail'));
      return;
    }

    if (password.length < 6) {
      Alert.alert(t('auth.error'), t('auth.shortPassword'));
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
      });

      if (error) {
        Alert.alert(t('auth.error'), error.message);
        setLoading(false);
        return;
      }

      // Sauvegarder la préférence de genre pour la voix
      await setGender(selectedGender);
      console.log('✅ Préférence de genre sauvegardée:', selectedGender);

      setLoading(false);

      // Rediriger vers l'écran de vérification email
      router.replace('/(tabs)/email-verification');
    } catch (e: any) {
      Alert.alert(t('auth.error'), e?.message ?? t('auth.error'));
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={0}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Image source={require("@/assets/logo.png")} style={styles.logo} resizeMode="contain" />

        <Text style={styles.title}>{isSignUp ? t('auth.signUp') : t('auth.signIn')}</Text>

        <TextInput
          style={styles.input}
          placeholder={t('auth.emailPlaceholder')}
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
          editable={!loading}
        />

        <View style={styles.passwordContainer}>
          <TextInput
            style={styles.passwordInput}
            placeholder={t('auth.passwordPlaceholder')}
            secureTextEntry={!showPassword}
            value={password}
            onChangeText={setPassword}
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

        {/* Sélection du genre (uniquement lors de l'inscription) */}
        {isSignUp && (
          <View style={styles.genderContainer}>
            <Text style={styles.genderLabel}>{t('auth.selectGender')}</Text>
            <View style={styles.genderButtons}>
              <Pressable
                style={[
                  styles.genderButton,
                  selectedGender === 'male' && styles.genderButtonActive,
                ]}
                onPress={() => setSelectedGender('male')}
                disabled={loading}
              >
                <Text style={[
                  styles.genderText,
                  selectedGender === 'male' && styles.genderTextActive,
                ]}>
                  {t('auth.male')}
                </Text>
              </Pressable>
              <Pressable
                style={[
                  styles.genderButton,
                  selectedGender === 'female' && styles.genderButtonActive,
                ]}
                onPress={() => setSelectedGender('female')}
                disabled={loading}
              >
                <Text style={[
                  styles.genderText,
                  selectedGender === 'female' && styles.genderTextActive,
                ]}>
                  {t('auth.female')}
                </Text>
              </Pressable>
            </View>
            <Text style={styles.genderHint}>{t('auth.genderHint')}</Text>
          </View>
        )}

        <Pressable
          style={[styles.button, loading && { opacity: 0.6 }]}
          onPress={isSignUp ? onSignUp : onLogin}
          disabled={loading}
        >
          <Text style={styles.buttonText}>
            {loading ? t('auth.loading') : isSignUp ? t('auth.signUp') : t('auth.signIn')}
          </Text>
        </Pressable>

        {/* Bouton "Mot de passe oublié" uniquement en mode connexion */}
        {!isSignUp && (
          <Pressable
            onPress={() => router.push('/(tabs)/forgot-password')}
            disabled={loading}
            style={styles.forgotPasswordButton}
          >
            <Text style={styles.forgotPasswordText}>
              {t('auth.forgotPassword')}
            </Text>
          </Pressable>
        )}

        <Pressable
          onPress={() => {
            setIsSignUp(!isSignUp);
            setEmail("");
            setPassword("");
          }}
          disabled={loading}
        >
          <Text style={styles.toggleText}>
            {isSignUp ? t('auth.toggleLogin') : t('auth.toggle')}
          </Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "transparent" },
  scrollContent: { flexGrow: 1, padding: 24, justifyContent: "center" },
  logo: { width: 140, height: 140, alignSelf: "center", marginBottom: 18 },
  title: { fontSize: 26, fontWeight: "800", textAlign: "center", marginBottom: 18, color: "#2F6B3D" },
  input: { borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 12, padding: 12, marginTop: 10, backgroundColor: "#FFF" },
  passwordContainer: { position: "relative", marginTop: 10 },
  passwordInput: { borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 12, padding: 12, paddingRight: 50, backgroundColor: "#FFF" },
  eyeButton: { position: "absolute", right: 12, top: 12, padding: 4 },
  eyeIcon: { fontSize: 20 },
  button: { backgroundColor: "#2F6B3D", padding: 16, borderRadius: 16, marginTop: 24, alignItems: "center" },
  buttonText: { color: "#FFF", fontWeight: "800", fontSize: 16 },
  toggleText: { textAlign: "center", marginTop: 16, color: "#2F6B3D", textDecorationLine: "underline", fontWeight: "600" },
  genderContainer: { marginTop: 20 },
  genderLabel: { fontSize: 14, fontWeight: "600", color: "#333", marginBottom: 10, textAlign: "center" },
  genderButtons: { flexDirection: "row", justifyContent: "center", gap: 16 },
  genderButton: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#E5E7EB",
    backgroundColor: "#FFF",
    alignItems: "center"
  },
  genderButtonActive: { borderColor: "#2F6B3D", backgroundColor: "#E8F5E9" },
  genderText: { fontSize: 16, fontWeight: "600", color: "#666" },
  genderTextActive: { color: "#2F6B3D" },
  genderHint: { fontSize: 12, color: "#999", textAlign: "center", marginTop: 8, fontStyle: "italic" },
  forgotPasswordButton: { marginTop: 12, padding: 8 },
  forgotPasswordText: { textAlign: "center", color: "#2F6B3D", fontSize: 14, fontWeight: "600" },
});
