import React from 'react';
import { Pressable, StyleSheet, ViewStyle, StyleProp, Platform, View } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { theme } from '../theme';

interface NeumorphicButtonProps {
  children: React.ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  layerStyle?: StyleProp<ViewStyle>;
  radius?: number;
  disabled?: boolean;
}

export default function NeumorphicButton({
  children,
  onPress,
  style,
  layerStyle,
  radius = theme.radius.md,
  disabled = false,
}: NeumorphicButtonProps) {
  const isPressed = useSharedValue(0);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: withSpring(isPressed.value ? 0.95 : 1, { damping: 15, stiffness: 200 }) }],
    };
  });

  // Re-creating the neumorphic shadows internally to easily flip them based on the standard press state hook
  const handlePressIn = () => { if (!disabled) isPressed.value = 1; };
  const handlePressOut = () => { if (!disabled) isPressed.value = 0; };

  return (
    <Pressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled}
      style={[
        { opacity: disabled ? 0.5 : 1 },
        style,
      ]}
    >
      <Animated.View style={[animatedStyle]}>
        <InnerButtonView radius={radius} isPressed={isPressed} layerStyle={layerStyle}>
          {children}
        </InnerButtonView>
      </Animated.View>
    </Pressable>
  );
}

// Separate the view logic into an internal component to re-use Web box-shadows reactively or nest Views
// We just use a derived approach here for Native and Web
function InnerButtonView({ children, radius, isPressed, layerStyle }: any) {
  const baseStyle = { backgroundColor: theme.colors.surface, borderRadius: radius, flex: 1 };
  
  if (Platform.OS === 'web') {
    const webAnimatedStyle = useAnimatedStyle(() => {
      return {
        boxShadow: isPressed.value
          ? theme.neu.shadowStyles.lightLayerInset.boxShadow
          : `6px 6px 12px ${theme.neu.colors.darkShadow}, -6px -6px 12px ${theme.neu.colors.lightShadow}`,
      } as any;
    });

    return (
      <Animated.View style={[baseStyle, webAnimatedStyle]}>
        <View style={[{ padding: 12, alignItems: 'center', justifyContent: 'center', flex: 1 }, layerStyle]}>
          {children}
        </View>
      </Animated.View>
    );
  }

  // Native
  const darkLayerStyle = useAnimatedStyle(() => ({
    shadowColor: '#000',
    shadowOffset: { width: isPressed.value ? 0 : 5, height: isPressed.value ? 0 : 5 },
    shadowOpacity: isPressed.value ? 0 : 0.4,
    shadowRadius: isPressed.value ? 0 : 8,
    elevation: isPressed.value ? 0 : 8,
  }));

  const lightLayerStyle = useAnimatedStyle(() => ({
    shadowColor: '#fff',
    shadowOffset: { width: isPressed.value ? 0 : -3, height: isPressed.value ? 0 : -3 },
    shadowOpacity: isPressed.value ? 0 : 0.05,
    shadowRadius: isPressed.value ? 0 : 8,
  }));

  // Render stacked animated views for native
  return (
    <Animated.View style={[{ backgroundColor: theme.colors.surface, borderRadius: radius }, darkLayerStyle]}>
      <Animated.View style={[baseStyle, lightLayerStyle, layerStyle]}>
        <View style={[{ padding: 12, alignItems: 'center', justifyContent: 'center', flex: 1 }, layerStyle]}>
          {children}
        </View>
      </Animated.View>
    </Animated.View>
  );
}
