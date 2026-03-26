import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Dimensions } from 'react-native';
import { useStore } from '../store/useStore';
import { ChevronLeft, Type, ZoomIn, ZoomOut, FileText } from 'lucide-react-native';
import * as pdfjs from 'pdfjs-dist';

// Configure PDF.js worker
if (typeof window !== 'undefined' && 'pdfjsLib' in window) {
  (pdfjs as any).GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;
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
          <TouchableOpacity onPress={() => setView('editor')} style={styles.backButton}>
            <ChevronLeft size={24} color="#fff" />
          </TouchableOpacity>
          <View>
            <Text style={styles.title} numberOfLines={1}>{currentDocument?.title}</Text>
            <Text style={styles.subtitle}>REFLOWABLE TEXT MODE</Text>
          </View>
        </View>
        
        <View style={styles.controls}>
          <TouchableOpacity onPress={() => setFontSize(prev => Math.max(12, prev - 2))} style={styles.controlBtn}>
            <ZoomOut size={18} color="#fff" />
          </TouchableOpacity>
          <View style={styles.fontSizeBadge}>
            <Text style={styles.fontSizeText}>{fontSize}</Text>
          </View>
          <TouchableOpacity onPress={() => setFontSize(prev => Math.min(32, prev + 2))} style={styles.controlBtn}>
            <ZoomIn size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {loading ? (
          <View style={styles.loading}>
            <ActivityIndicator color="#fff" />
            <Text style={styles.loadingText}>EXTRACTING TEXT...</Text>
          </View>
        ) : error ? (
          <View style={styles.error}>
            <FileText size={48} color="rgba(255,255,255,0.1)" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : (
          pages.map((page, i) => (
            <View key={i} style={styles.page}>
              <View style={styles.pageHeader}>
                <Text style={styles.pageNumber}>PAGE {i + 1}</Text>
                <View style={styles.pageLine} />
              </View>
              <Text style={[styles.text, { fontSize }]}>{page}</Text>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
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
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    maxWidth: width * 0.4,
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
    color: 'rgba(255,255,255,0.4)',
    fontSize: 10,
    fontWeight: 'bold',
    letterSpacing: 2,
    marginTop: 15,
  },
  error: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 100,
  },
  errorText: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 20,
    maxWidth: 250,
  },
  page: {
    marginBottom: 40,
  },
  pageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 15,
    marginBottom: 20,
  },
  pageNumber: {
    color: 'rgba(255,255,255,0.2)',
    fontSize: 10,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  pageLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  text: {
    color: '#fff',
    lineHeight: 28,
    textAlign: 'justify',
  },
});
