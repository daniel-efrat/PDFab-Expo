import React, { useState } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { useStore } from '../store/useStore';
import { ChevronLeft, FileText, ZoomIn, ZoomOut } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { theme } from '../theme';
import NeumorphicButton from './NeumorphicButton';
import NeumorphicView from './NeumorphicView';

interface ReflowProps {
  setView: (view: any) => void;
}

export default function Reflow({ setView }: ReflowProps) {
  const { currentDocument } = useStore();
  const [fontSize, setFontSize] = useState(16);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <NeumorphicButton radius={12} onPress={() => setView('editor')} layerStyle={styles.backButton}>
            <ChevronLeft size={24} color={theme.colors.text} />
          </NeumorphicButton>
          <View>
            <Text style={styles.title} numberOfLines={1}>{currentDocument?.title}</Text>
            <Text style={styles.subtitle}>REFLOWABLE TEXT MODE</Text>
          </View>
        </View>

        <NeumorphicView radius={12} style={styles.controls}>
          <NeumorphicButton radius={10} onPress={() => setFontSize((prev) => Math.max(12, prev - 2))} layerStyle={styles.controlBtn}>
            <ZoomOut size={18} color={theme.colors.text} />
          </NeumorphicButton>
          <View style={styles.fontSizeBadge}>
            <Text style={styles.fontSizeText}>{fontSize}</Text>
          </View>
          <NeumorphicButton radius={10} onPress={() => setFontSize((prev) => Math.min(32, prev + 2))} layerStyle={styles.controlBtn}>
            <ZoomIn size={18} color={theme.colors.text} />
          </NeumorphicButton>
        </NeumorphicView>
      </View>

      <NeumorphicView radius={28} style={styles.messageCard}>
        <FileText size={48} color={theme.colors.textSoft} />
        <Text style={styles.messageTitle}>Native preview is limited in Expo Go</Text>
        <Text style={[styles.messageBody, { fontSize }]}>
          Reflow text extraction depends on a browser-oriented PDF parser. Use the web build for full text reflow, or keep editing and exporting the PDF here in the simulator.
        </Text>
      </NeumorphicView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.bg,
    paddingHorizontal: 25,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 30,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 15,
    flex: 1,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: 'bold',
    maxWidth: 180,
  },
  subtitle: {
    color: theme.colors.textSoft,
    fontSize: 10,
    fontWeight: 'bold',
    letterSpacing: 1,
    marginTop: 2,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 5,
    gap: 5,
  },
  controlBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fontSizeBadge: {
    paddingHorizontal: 8,
  },
  fontSizeText: {
    color: theme.colors.text,
    fontSize: 12,
    fontWeight: 'bold',
  },
  messageCard: {
    flex: 1,
    padding: 28,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
  },
  messageTitle: {
    color: theme.colors.text,
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  messageBody: {
    color: theme.colors.textMuted,
    lineHeight: 26,
    textAlign: 'center',
  },
});
