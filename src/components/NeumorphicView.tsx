import React, { ReactNode } from 'react';
import { View, StyleSheet, ViewStyle, StyleProp, Platform, ViewProps } from 'react-native';
import { theme } from '../theme';

interface NeumorphicViewProps extends ViewProps {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  layerStyle?: StyleProp<ViewStyle>;
  radius?: number;
  pressed?: boolean;
}

export default function NeumorphicView({ 
  children, 
  style, 
  layerStyle, 
  radius = theme.radius.md, 
  pressed = false,
  ...rest 
}: NeumorphicViewProps) {
  
  // For Web we can use CSS string for inset and multiple shadows
  if (Platform.OS === 'web') {
    const webStyle = pressed
      ? { boxShadow: theme.neu.shadowStyles.lightLayerInset.boxShadow }
      : { boxShadow: `6px 6px 12px ${theme.neu.colors.darkShadow}, -6px -6px 12px ${theme.neu.colors.lightShadow}` };

    return (
      <View 
        {...rest}
        style={[{ backgroundColor: theme.colors.surface, borderRadius: radius }, webStyle as any, style]}
      >
        {children}
      </View>
    );
  }

  // For Native (iOS/Android), nest Views to get multiple shadows (approximated on Android with elevation)
  if (pressed) {
     return (
       <View 
         {...rest}
         style={[{ backgroundColor: theme.colors.surface, borderRadius: radius, overflow: 'hidden' }, style]}
       >
         {children}
       </View>
     );
  }

  return (
    <View 
      {...rest}
      style={[{ backgroundColor: theme.colors.surface, borderRadius: radius }, styles.darkLayer, style]}
    >
      <View style={[{ backgroundColor: theme.colors.surface, borderRadius: radius, flex: 1 }, styles.lightLayer, layerStyle]}>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  darkLayer: {
    shadowColor: '#000',
    shadowOffset: { width: 6, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 8,
  },
  lightLayer: {
    shadowColor: '#fff',
    shadowOffset: { width: -4, height: -4 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
  },
});
