import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Dimensions, Platform } from 'react-native';
import { useStore } from '../store/useStore';
import { ChevronLeft, Type, ZoomIn, ZoomOut, FileText } from 'lucide-react-native';
import * as pdfjs from 'pdfjs-dist';
import { theme } from '../theme';
import NeumorphicButton from './NeumorphicButton';
import NeumorphicView from './NeumorphicView';

// Configure PDF.js worker
if (typeof window !== 'undefined' && 'pdfjsLib' in window) {
  (pdfjs as any).GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.mjs`;
}

const { width } = Dimensions.get('window');

interface ReflowProps {
  setView: (view: any) => void;
}

export default function Reflow({ setView }: ReflowProps) {
  const { currentDocument } = useStore();
  const [pages, setPages] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [fontSize, setFontSize] = useState(16);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!currentDocument) return;

    const extractText = async () => {
      try {
        const loadingTask = pdfjs.getDocument(currentDocument.fileUrl);
        const pdf = await loadingTask.promise;
        const extractedPages: string[] = [];

        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();
          const pageText = textContent.items.map((item: any) => item.str).join(' ');
          extractedPages.push(pageText);
        }

        if (extractedPages.every(p => !p.trim())) {
          setError('No extractable text found in this PDF.');
        } else {
          setPages(extractedPages);
        }
      } catch (err) {
        console.error('Text extraction error:', err);
        setError('Failed to extract text from PDF.');
      } finally {
        setLoading(false);
      }
    };

    extractText();
  }, [currentDocument]);

  return (
    <View style={styles.container}>
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
          <NeumorphicButton radius={10} onPress={() => setFontSize(prev => Math.max(12, prev - 2))} layerStyle={styles.controlBtn}>
            <ZoomOut size={18} color={theme.colors.text} />
          </NeumorphicButton>
          <View style={styles.fontSizeBadge}>
            <Text style={styles.fontSizeText}>{fontSize}</Text>
          </View>
          <NeumorphicButton radius={10} onPress={() => setFontSize(prev => Math.min(32, prev + 2))} layerStyle={styles.controlBtn}>
            <ZoomIn size={18} color={theme.colors.text} />
          </NeumorphicButton>
        </NeumorphicView>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {loading ? (
          <View style={styles.loading}>
            <ActivityIndicator color={theme.colors.text} />
            <Text style={styles.loadingText}>EXTRACTING TEXT...</Text>
          </View>
        ) : error ? (
          <View style={styles.errorContainer}>
            <FileText size={48} color={theme.colors.textSoft} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : (
          pages.map((page, i) => (
            <NeumorphicView key={i} radius={18} style={styles.page}>
              <View style={styles.pageHeader}>
                <Text style={styles.pageNumber}>PAGE {i + 1}</Text>
                <View style={styles.pageLine} />
              </View>
              <Text style={[styles.text, { fontSize }]}>{page}</Text>
            </NeumorphicView>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const neuShadow = Platform.OS === 'web'
  ? { boxShadow: `6px 6px 12px ${theme.neu.colors.darkShadow}, -6px -6px 12px ${theme.neu.colors.lightShadow}` } as any
  : {
      shadowColor: '#000',
      shadowOffset: { width: 5, height: 5 },
      shadowOpacity: 0.45,
      shadowRadius: 10,
      elevation: 8,
    };

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.bg,
    paddingTop: 60,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 25,
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
    maxWidth: width * 0.4,
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
  scrollContent: {
    paddingHorizontal: 25,
    paddingBottom: 60,
  },
  loading: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 100,
  },
  loadingText: {
    color: theme.colors.textSoft,
    fontSize: 10,
    fontWeight: 'bold',
    letterSpacing: 2,
    marginTop: 15,
  },
  errorContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 100,
  },
  errorText: {
    color: theme.colors.textMuted,
    fontSize: 14,
    textAlign: 'center',
    marginTop: 20,
    maxWidth: 250,
  },
  page: {
    marginBottom: 30,
    padding: 24,
  },
  pageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 15,
    marginBottom: 20,
  },
  pageNumber: {
    color: theme.colors.textSoft,
    fontSize: 10,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  pageLine: {
    flex: 1,
    height: 1,
    backgroundColor: theme.colors.border,
  },
  text: {
    color: theme.colors.text,
    lineHeight: 28,
    textAlign: 'justify',
  },
});
