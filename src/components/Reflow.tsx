import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useStore } from '../store/useStore';
import { ChevronLeft, FileText, ZoomIn, ZoomOut } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

interface ReflowProps {
  setView: (view: any) => void;
}

export default function Reflow({ setView }: ReflowProps) {
  const { currentDocument } = useStore();
  const [fontSize, setFontSize] = useState(16);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <TouchableOpacity onPress={() => setView('editor')} style={styles.backButton}>
            <ChevronLeft size={24} color="#fff" />
          </TouchableOpacity>
          <View>
            <Text style={styles.title} numberOfLines={1}>{currentDocument?.title}</Text>
            <Text style={styles.subtitle}>REFLOWABLE TEXT MODE</Text>
          </View>
        </View>

        <View style={styles.controls}>
          <TouchableOpacity onPress={() => setFontSize((prev) => Math.max(12, prev - 2))} style={styles.controlBtn}>
            <ZoomOut size={18} color="#fff" />
          </TouchableOpacity>
          <View style={styles.fontSizeBadge}>
            <Text style={styles.fontSizeText}>{fontSize}</Text>
          </View>
          <TouchableOpacity onPress={() => setFontSize((prev) => Math.min(32, prev + 2))} style={styles.controlBtn}>
            <ZoomIn size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.messageCard}>
        <FileText size={48} color="rgba(255,255,255,0.15)" />
        <Text style={styles.messageTitle}>Native preview is limited in Expo Go</Text>
        <Text style={[styles.messageBody, { fontSize }]}>
          Reflow text extraction depends on a browser-oriented PDF parser. Use the web build for full text reflow, or keep editing and exporting the PDF here in the simulator.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
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
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    maxWidth: 180,
  },
  subtitle: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 10,
    fontWeight: 'bold',
    letterSpacing: 1,
    marginTop: 2,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
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
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  messageCard: {
    flex: 1,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    padding: 28,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
  },
  messageTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  messageBody: {
    color: 'rgba(255,255,255,0.6)',
    lineHeight: 26,
    textAlign: 'center',
  },
});
