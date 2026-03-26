import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Dimensions, PanResponder, Animated } from 'react-native';
import { useStore } from '../store/useStore';
import { ChevronLeft, Save, Download, Type, Highlighter, PenTool, MessageSquare, MousePointer2, ZoomIn, ZoomOut, Undo2, Redo2, FileText, Layers, Settings, Trash2, Share, Zap } from 'lucide-react-native';
import * as pdfjs from 'pdfjs-dist';
import { PDFDocument as PDFLib, rgb } from 'pdf-lib';

// Set up PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;
import { db, storage } from '../firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { Svg, Path, Rect, Text as SvgText, G } from 'react-native-svg';
import { savePdf } from '../lib/savePdf';

const { width, height } = Dimensions.get('window');

interface EditorProps {
  setView: (view: any) => void;
}

export default function Editor({ setView }: EditorProps) {
  const { user, currentDocument, activeTool, setActiveTool, annotations, setAnnotations, undo, redo, canUndo, canRedo } = useStore();
  const [pdf, setPdf] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [currentPage, setCurrentPage] = useState(0);
  const [saving, setSaving] = useState(false);
  const [showTools, setShowTools] = useState(true);

  useEffect(() => {
    if (!currentDocument) return;

    const loadPdf = async () => {
      try {
        const loadingTask = pdfjs.getDocument(currentDocument.fileUrl);
        const pdfDoc = await loadingTask.promise;
        setPdf(pdfDoc);
        setAnnotations(currentDocument.annotations || []);
      } catch (err) {
        console.error('PDF load error:', err);
      } finally {
        setLoading(false);
      }
    };

    loadPdf();
  }, [currentDocument]);

  const handleSave = async () => {
    if (!currentDocument || !user) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, 'documents', currentDocument.id), {
        annotations,
        updatedAt: new Date().toISOString()
      });
    } catch (err) {
      console.error('Save error:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleExport = async () => {
    if (!currentDocument) return;
    try {
      const response = await fetch(currentDocument.fileUrl);
      const existingPdfBytes = await response.arrayBuffer();
      const pdfDoc = await PDFLib.load(existingPdfBytes);
      
      // In a real app, we'd loop through annotations and draw them on the PDF
      // For this demo, we'll just re-save the original
      const pdfBytes = await pdfDoc.save();
      await savePdf(pdfBytes, currentDocument.title);
    } catch (err) {
      console.error('Export error:', err);
    }
  };

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color="#fff" size="large" />
        <Text style={styles.loadingText}>LOADING DOCUMENT...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <TouchableOpacity onPress={() => setView('dashboard')} style={styles.backButton}>
            <ChevronLeft size={24} color="#fff" />
          </TouchableOpacity>
          <View>
            <Text style={styles.title} numberOfLines={1}>{currentDocument?.title}</Text>
            <Text style={styles.subtitle}>PAGE {currentPage + 1} OF {pdf?.numPages}</Text>
          </View>
        </View>

        <View style={styles.headerActions}>
          <TouchableOpacity onPress={undo} disabled={!canUndo} style={[styles.actionBtn, !canUndo && styles.disabledBtn]}>
            <Undo2 size={20} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity onPress={redo} disabled={!canRedo} style={[styles.actionBtn, !canRedo && styles.disabledBtn]}>
            <Redo2 size={20} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity onPress={handleSave} disabled={saving} style={styles.saveBtn}>
            {saving ? <ActivityIndicator size="small" color="#000" /> : <Save size={20} color="#000" />}
          </TouchableOpacity>
        </View>
      </View>

      {/* Main Content */}
      <View style={styles.editorArea}>
        <ScrollView 
          horizontal 
          pagingEnabled 
          onMomentumScrollEnd={(e) => {
            const page = Math.round(e.nativeEvent.contentOffset.x / width);
            setCurrentPage(page);
          }}
        >
          {Array.from({ length: pdf?.numPages || 0 }).map((_, i) => (
            <View key={i} style={styles.pageWrapper}>
              <View style={[styles.pdfPage, { width: width * 0.9, height: height * 0.6 }]}>
                {/* PDF Content Placeholder */}
                <View style={styles.pdfPlaceholder}>
                  <FileText size={64} color="rgba(255,255,255,0.05)" />
                  <Text style={styles.placeholderText}>PAGE {i + 1}</Text>
                </View>

                {/* Annotation Layer */}
                <Svg style={StyleSheet.absoluteFill}>
                  {annotations.filter(a => a.pageIndex === i).map((ann, idx) => (
                    <AnnotationItem key={`ann-${idx}`} annotation={ann} />
                  ))}
                </Svg>
              </View>
            </View>
          ))}
        </ScrollView>
      </View>

      {/* Toolbar */}
      <View style={styles.toolbar}>
        <ToolButton icon={MousePointer2} active={activeTool === 'SELECT'} onPress={() => setActiveTool('SELECT')} />
        <ToolButton icon={Type} active={activeTool === 'TEXT'} onPress={() => setActiveTool('TEXT')} />
        <ToolButton icon={Highlighter} active={activeTool === 'HIGHLIGHT'} onPress={() => setActiveTool('HIGHLIGHT')} />
        <ToolButton icon={PenTool} active={activeTool === 'DRAW'} onPress={() => setActiveTool('DRAW')} />
        <ToolButton icon={MessageSquare} active={activeTool === 'COMMENT'} onPress={() => setActiveTool('COMMENT')} />
        <View style={styles.toolDivider} />
        <TouchableOpacity style={styles.exportBtn} onPress={handleExport}>
          <Download size={20} color="#000" />
        </TouchableOpacity>
      </View>

      {/* Quick Access */}
      <View style={styles.quickAccess}>
        <TouchableOpacity style={styles.quickBtn} onPress={() => setView('reflow')}>
          <Layers size={18} color="#fff" />
          <Text style={styles.quickText}>REFLOW</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.quickBtn} onPress={() => setView('transcription')}>
          <Zap size={18} color="#fff" />
          <Text style={styles.quickText}>AI</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function ToolButton({ icon: Icon, active, onPress }: { icon: any, active: boolean, onPress: () => void }) {
  return (
    <TouchableOpacity 
      style={[styles.toolBtn, active && styles.activeToolBtn]} 
      onPress={onPress}
    >
      <Icon size={24} color={active ? '#000' : 'rgba(255,255,255,0.4)'} />
    </TouchableOpacity>
  );
}

function AnnotationItem({ annotation }: { annotation: any, key?: string }) {
  if (annotation.type === 'text') {
    return (
      <SvgText
        x={annotation.x}
        y={annotation.y}
        fill={annotation.color || '#000'}
        fontSize={annotation.fontSize || 16}
      >
        {annotation.text}
      </SvgText>
    );
  }
  if (annotation.type === 'draw') {
    return (
      <Path
        d={annotation.path}
        stroke={annotation.color || '#000'}
        strokeWidth={annotation.strokeWidth || 2}
        fill="none"
      />
    );
  }
  return null;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
    paddingTop: 60,
  },
  loading: {
    flex: 1,
    backgroundColor: '#0a0a0a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 10,
    fontWeight: 'bold',
    letterSpacing: 2,
    marginTop: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 25,
    marginBottom: 20,
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
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  actionBtn: {
    width: 40,
    height: 40,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabledBtn: {
    opacity: 0.3,
  },
  saveBtn: {
    width: 40,
    height: 40,
    backgroundColor: '#fff',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editorArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pageWrapper: {
    width: width,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pdfPage: {
    backgroundColor: '#fff',
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
    overflow: 'hidden',
  },
  pdfPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#111',
  },
  placeholderText: {
    color: 'rgba(255,255,255,0.1)',
    fontSize: 12,
    fontWeight: 'bold',
    marginTop: 10,
  },
  toolbar: {
    position: 'absolute',
    bottom: 40,
    left: 25,
    right: 25,
    height: 70,
    backgroundColor: 'rgba(22,22,22,0.9)',
    borderRadius: 35,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 15,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  toolBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeToolBtn: {
    backgroundColor: '#fff',
  },
  toolDivider: {
    width: 1,
    height: 30,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  exportBtn: {
    width: 48,
    height: 48,
    backgroundColor: '#fff',
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickAccess: {
    position: 'absolute',
    right: 25,
    top: 120,
    gap: 15,
  },
  quickBtn: {
    width: 50,
    height: 50,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  quickText: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 8,
    fontWeight: 'bold',
    marginTop: 2,
  },
});
