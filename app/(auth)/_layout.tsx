import { Stack } from "expo-router";
import { ImageBackground, StyleSheet } from "react-native";

export default function AuthLayout() {
  return (
    <ImageBackground
      source={require("@/assets/images/bg-mosque.png")}
      style={styles.background}
      resizeMode="cover"
    >
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: 'transparent' },
        }}
      >
        <Stack.Screen name="login" />
        <Stack.Screen name="forgot-password" />
        <Stack.Screen name="reset-password" />
        <Stack.Screen name="email-verification" />
      </Stack>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  background: {
    flex: 1,
    backgroundColor: "#F7F8FA",
  },
});
