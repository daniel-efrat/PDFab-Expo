import React from 'react';
import NeumorphicButton from '../../../NeumorphicButton';
import { styles } from '../styles';

export function ToolButton({ icon: Icon, active, onPress }: { icon: any; active: boolean; onPress: () => void }) {
  return (
    <NeumorphicButton radius={11} onPress={onPress} layerStyle={[styles.toolBtn, active && styles.activeToolBtn]}>
      <Icon size={20} color={active ? '#000' : 'rgba(255,255,255,0.4)'} />
    </NeumorphicButton>
  );
}

export function ToolButtonLite({ icon: Icon, active, onPress }: { icon: any; active: boolean; onPress: () => void }) {
  return (
    <NeumorphicButton radius={12} onPress={onPress} layerStyle={[styles.fillSignActionBtn, active && styles.fillSignActionBtnActive]}>
      <Icon size={24} color={active ? '#60a5fa' : 'rgba(255,255,255,0.82)'} />
    </NeumorphicButton>
  );
}
