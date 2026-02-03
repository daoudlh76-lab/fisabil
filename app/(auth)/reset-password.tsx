import { useRouter } from "expo-router";
import { useState, useEffect } from "react";
import { Alert, Image, Pressable, StyleSheet, Text, TextInput, View, ActivityIndicator } from "react-native";
import { supabase } from "@/src/lib/supabase";
import { useLanguage } from "@/hooks/use-language";

export default function ResetPasswordScreen() {
  const { t } = useLanguage();
  const router = useRouter();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Pas besoin de vérifier la session ici
  // L'utilisateur peut accéder à cette page avec un token de récupération
  // qui est différent d'une session normale

  async function handleResetPassword() {
    if (!newPassword || !confirmPassword) {
      Alert.alert(t('auth.error'), "Veuillez remplir tous les champs");
      return;
    }

    if (newPassword.length < 6) {
      Alert.alert(t('auth.error'), t('auth.shortPassword'));
      return;
    }

    if (newPassword !== confirmPassword) {
      Alert.alert(t('auth.error'), "Les mots de passe ne correspondent pas");
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) {
        Alert.alert(t('auth.error'), error.message);
        setLoading(false);
        return;
      }

      Alert.alert(
        "Succès",
        "Votre mot de passe a été réinitialisé avec succès",
        [
          {
            text: "OK",
            onPress: () => router.replace('/(auth)/login'),
          },
        ]
      );
      setLoading(false);
    } catch (e: any) {
      Alert.alert(t('auth.error'), e?.message ?? t('auth.error'));
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <Image source={require("@/assets/logo.png")} style={styles.logo} resizeMode="contain" />

      <Text style={styles.title}>Nouveau mot de passe</Text>

      <Text style={styles.description}>
        Entrez votre nouveau mot de passe (minimum 6 caractères)
      </Text>

      <View style={styles.passwordContainer}>
        <TextInput
          style={styles.passwordInput}
          placeholder="Nouveau mot de passe"
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
          placeholder="Confirmer le mot de passe"
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
          <Text style={styles.buttonText}>Réinitialiser le mot de passe</Text>
        )}
      </Pressable>

      <Pressable
        onPress={() => router.replace('/(auth)/login')}
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
