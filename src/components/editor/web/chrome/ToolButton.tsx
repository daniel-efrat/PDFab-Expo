import React from 'react';
import { TouchableOpacity } from 'react-native';
import { theme } from '../../../../theme';
import { styles } from '../styles';

export function ToolButton({ icon: Icon, active, onPress }: { icon: any; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity style={[styles.toolBtn, active && styles.activeToolBtn]} onPress={onPress}>
      <Icon size={24} color={active ? theme.colors.white : theme.colors.textMuted} />
    </TouchableOpacity>
  );
}

/* ─── Styles ─── */
const neuBoxShadow = `6px 6px 12px ${theme.neu.colors.darkShadow}, -6px -6px 12px ${theme.neu.colors.lightShadow}`;
const neuBoxShadowPressed = theme.neu.shadowStyles.lightLayerInset.boxShadow;
