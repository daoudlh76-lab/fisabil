import React, { useEffect, useRef } from 'react';
import { View, Pressable, StyleSheet, Animated, Image, ActivityIndicator } from 'react-native';

interface AnimatedLogoButtonProps {
  onPress: () => void;
  disabled?: boolean;
  connecting?: boolean;
  size?: number;
}

export default function AnimatedLogoButton({
  onPress,
  disabled = false,
  connecting = false,
  size = 160,
}: AnimatedLogoButtonProps) {
  const shimmerAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // Animation de faisceau lumineux qui traverse le logo
    const shimmerAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmerAnim, {
          toValue: 1,
          duration: 2000,
          useNativeDriver: true,
        }),
        Animated.timing(shimmerAnim, {
          toValue: 0,
          duration: 0,
          useNativeDriver: true,
        }),
      ])
    );

    // Animation de pulsation subtile
    const pulseAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.05,
          duration: 1500,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1500,
          useNativeDriver: true,
        }),
      ])
    );

    if (!disabled && !connecting) {
      shimmerAnimation.start();
      pulseAnimation.start();
    }

    return () => {
      shimmerAnimation.stop();
      pulseAnimation.stop();
    };
  }, [disabled, connecting, shimmerAnim, pulseAnim]);

  // Position du faisceau lumineux (de gauche à droite)
  const shimmerTranslateX = shimmerAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-size * 2, size * 2],
  });

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || connecting}
      style={({ pressed }) => [
        styles.container,
        { width: size, height: size },
        pressed && !disabled && !connecting && styles.pressed,
      ]}
    >
      <Animated.View
        style={[
          styles.logoContainer,
          {
            transform: [{ scale: pulseAnim }],
          },
        ]}
      >
        {/* Logo avec fond masqué */}
        <View style={[styles.logoWrapper, { width: size, height: size }]}>
          <Image
            source={require('@/assets/logo.png')}
            style={[
              styles.logo,
              { width: size, height: size },
              connecting && styles.logoConnecting,
            ]}
            resizeMode="contain"
          />
        </View>

        {/* Overlay de faisceau lumineux */}
        {!connecting && (
          <Animated.View
            style={[
              styles.shimmerOverlay,
              {
                width: size * 0.5,
                height: size * 1.2,
                transform: [{ translateX: shimmerTranslateX }, { rotate: '15deg' }],
              },
            ]}
          />
        )}

        {/* Cercle de glow autour du logo */}
        <View style={[styles.glowCircle, { width: size, height: size }]} />

        {/* Indicateur de chargement */}
        {connecting && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color="#FFF" />
          </View>
        )}
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 1000,
    overflow: 'visible',
    backgroundColor: 'transparent',
  },
  pressed: {
    opacity: 0.8,
    transform: [{ scale: 0.95 }],
  },
  logoContainer: {
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
    height: '100%',
    overflow: 'hidden',
    borderRadius: 1000,
    backgroundColor: 'transparent',
  },
  logoWrapper: {
    borderRadius: 1000,
    overflow: 'hidden',
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
  },
  logo: {
    backgroundColor: 'transparent',
  },
  logoConnecting: {
    opacity: 0.6,
  },
  shimmerOverlay: {
    position: 'absolute',
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    shadowColor: '#FFF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 20,
    elevation: 5,
  },
  glowCircle: {
    position: 'absolute',
    borderRadius: 1000,
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: 'rgba(46, 125, 50, 0.2)',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderRadius: 1000,
  },
});
