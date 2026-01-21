import { useFocusEffect } from "expo-router";
import { useState, useCallback } from "react";
import { Alert, Image, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { supabase } from "@/src/lib/supabase";
import { useLanguage } from "@/hooks/use-language";
import { useVoicePreference, Gender } from "@/contexts/voice-preference-context";

export default function LoginScreen() {
  const { t } = useLanguage();
  const { setGender } = useVoicePreference();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [selectedGender, setSelectedGender] = useState<Gender>("male");

  // Réinitialiser le formulaire en mode inscription quand on arrive sur la page
  useFocusEffect(
    useCallback(() => {
      setIsSignUp(true);
      setEmail("");
      setPassword("");
      setLoading(false);
    }, [])
  );

  async function onLogin() {
    if (!email || !password) {
      Alert.alert(t('auth.error'), t('auth.invalidEmail'));
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });

      if (error) {
        Alert.alert(t('auth.error'), error.message);
        setLoading(false);
        return;
      }

      // ✅ Redirection automatique via le hook useAuth
      // (pas besoin de router.replace ici)
    } catch (e: any) {
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

      Alert.alert(t('auth.success'), t('auth.accountCreated'));
      setIsSignUp(false);
      setPassword("");
    } catch (e: any) {
      Alert.alert(t('auth.error'), e?.message ?? t('auth.error'));
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
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

      <TextInput
        style={styles.input}
        placeholder={t('auth.passwordPlaceholder')}
        secureTextEntry
        value={password}
        onChangeText={setPassword}
        editable={!loading}
      />

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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, backgroundColor: "#F7F8FA", justifyContent: "center" },
  logo: { width: 140, height: 140, alignSelf: "center", marginBottom: 18 },
  title: { fontSize: 26, fontWeight: "800", textAlign: "center", marginBottom: 18, color: "#2F6B3D" },
  input: { borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 12, padding: 12, marginTop: 10, backgroundColor: "#FFF" },
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
});
