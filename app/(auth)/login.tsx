import { useLanguage } from "@/hooks/use-language";
import { supabase } from "@/src/lib/supabase";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

// ✅ RevenueCat
import { initRevenueCat, loginRevenueCat } from "@/src/lib/revenuecat";

export default function LoginScreen() {
  const { t } = useLanguage();
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useFocusEffect(
    useCallback(() => {
      setEmail("");
      setPassword("");
      setLoading(false);
    }, [])
  );

  async function onLogin() {
    if (!email || !password) {
      Alert.alert(t("auth.error"), t("auth.invalidEmail"));
      return;
    }

    setLoading(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        let errorMessage = error.message;

        if (error.message.includes("Invalid login credentials")) {
          errorMessage = t("auth.invalidCredentials");
        } else if (error.message.includes("Email not confirmed")) {
          errorMessage = t("auth.emailNotConfirmed");
        }

        Alert.alert(t("auth.error"), errorMessage);
        return;
      }

      const userId = data.user?.id;

      // ✅ 1) Init RevenueCat
      const rcOk = await initRevenueCat();

      // ✅ 2) Lier RevenueCat au user Supabase (IMPORTANT)
      if (rcOk && userId) {
        try {
          await loginRevenueCat(userId);
          if (__DEV__) console.log("💰 [RC] Linked to Supabase user:", userId);
        } catch (e) {
          // On ne bloque pas le login si RC a un souci, mais on log
          if (__DEV__) console.warn("💰 [RC] Could not login user:", e);
        }
      } else {
        if (__DEV__) console.log("💰 [RC] Skipped login (rcOk:", rcOk, "userId:", userId, ")");
      }

      // Redirection automatique via hook auth (ton app le gère déjà)
    } catch (e: any) {
      Alert.alert(t("auth.error"), e?.message ?? t("auth.error"));
    } finally {
      setLoading(false);
    }
  }

  async function onSignUp() {
    if (!email || !password) {
      Alert.alert(t("auth.error"), t("auth.invalidEmail"));
      return;
    }

    if (password.length < 6) {
      Alert.alert(t("auth.error"), t("auth.shortPassword"));
      return;
    }

    setLoading(true);

    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
      });

      if (error) {
        Alert.alert(t("auth.error"), error.message);
        return;
      }

      router.replace("/(auth)/email-verification");
    } catch (e: any) {
      Alert.alert(t("auth.error"), e?.message ?? t("auth.error"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <Image
          source={require("@/assets/logo.png")}
          style={styles.logo}
          resizeMode="contain"
        />

        <Text style={styles.title}>
          {isSignUp ? t("auth.signUp") : t("auth.signIn")}
        </Text>

        <TextInput
          style={styles.input}
          placeholder={t("auth.emailPlaceholder")}
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />

        <View style={styles.passwordContainer}>
          <TextInput
            style={styles.passwordInput}
            placeholder={t("auth.passwordPlaceholder")}
            secureTextEntry={!showPassword}
            value={password}
            onChangeText={setPassword}
          />
          <Pressable
            style={styles.eyeButton}
            onPress={() => setShowPassword(!showPassword)}
          >
            <Text style={styles.eyeIcon}>{showPassword ? "👁️" : "👁️‍🗨️"}</Text>
          </Pressable>
        </View>

        <Pressable
          style={[styles.button, loading && { opacity: 0.6 }]}
          onPress={isSignUp ? onSignUp : onLogin}
          disabled={loading}
        >
          <Text style={styles.buttonText}>
            {loading
              ? t("auth.loading")
              : isSignUp
              ? t("auth.signUp")
              : t("auth.signIn")}
          </Text>
        </Pressable>

        {!isSignUp && (
          <Pressable
            onPress={() => router.push("/(auth)/forgot-password")}
            disabled={loading}
            style={styles.forgotPasswordButton}
          >
            <Text style={styles.forgotPasswordText}>
              {t("auth.forgotPassword")}
            </Text>
          </Pressable>
        )}

        <Pressable onPress={() => setIsSignUp(!isSignUp)} disabled={loading}>
          <Text style={styles.toggleText}>
            {isSignUp ? t("auth.toggleLogin") : t("auth.toggle")}
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
  title: {
    fontSize: 26,
    fontWeight: "800",
    textAlign: "center",
    marginBottom: 18,
    color: "#2F6B3D",
  },
  input: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    padding: 12,
    marginTop: 10,
    backgroundColor: "#FFF",
  },
  passwordContainer: { position: "relative", marginTop: 10 },
  passwordInput: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    padding: 12,
    paddingRight: 50,
    backgroundColor: "#FFF",
  },
  eyeButton: { position: "absolute", right: 12, top: 12 },
  eyeIcon: { fontSize: 20 },
  button: {
    backgroundColor: "#2F6B3D",
    padding: 16,
    borderRadius: 16,
    marginTop: 24,
    alignItems: "center",
  },
  buttonText: { color: "#FFF", fontWeight: "800", fontSize: 16 },
  toggleText: {
    textAlign: "center",
    marginTop: 16,
    color: "#2F6B3D",
    textDecorationLine: "underline",
    fontWeight: "600",
  },
  forgotPasswordButton: { marginTop: 12, padding: 8 },
  forgotPasswordText: { textAlign: "center", color: "#2F6B3D", fontSize: 14, fontWeight: "600" },
});