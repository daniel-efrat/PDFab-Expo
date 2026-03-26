import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Dimensions } from 'react-native';
import { useStore } from '../store/useStore';
import { ChevronLeft, Save, Download, Type, Highlighter, PenTool, MessageSquare, MousePointer2, Undo2, Redo2, FileText, Layers, Zap } from 'lucide-react-native';
import { PDFDocument as PDFLib } from 'pdf-lib';
import { db } from '../firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { Svg, Path, Text as SvgText } from 'react-native-svg';
import { savePdf } from '../lib/savePdf';

const { width, height } = Dimensions.get('window');

interface EditorProps {
  setView: (view: any) => void;
}

export default function Editor({ setView }: EditorProps) {
  const {
    user,
    currentDocument,
    activeTool,
    setActiveTool,
    annotations,
    undo,
    redo,
    canUndo,
    canRedo,
  } = useStore();
  const [currentPage, setCurrentPage] = useState(0);
  const [saving, setSaving] = useState(false);

  const pageCount = Math.max(currentDocument?.totalPages || 1, 1);

  const handleSave = async () => {
    if (!currentDocument || !user) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, 'documents', currentDocument.id), {
        annotations,
        updatedAt: new Date().toISOString(),
      });
    } catch (err) {
      console.error('Save error:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleExport = async () => {
    if (!currentDocument?.fileUrl) return;
    try {
      const response = await fetch(currentDocument.fileUrl);
      const existingPdfBytes = await response.arrayBuffer();
      const pdfDoc = await PDFLib.load(existingPdfBytes);
      const pdfBytes = await pdfDoc.save();
      await savePdf(pdfBytes, currentDocument.title);
    } catch (err) {
      console.error('Export error:', err);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <TouchableOpacity onPress={() => setView('dashboard')} style={styles.backButton}>
            <ChevronLeft size={24} color="#fff" />
          </TouchableOpacity>
          <View>
            <Text style={styles.title} numberOfLines={1}>{currentDocument?.title}</Text>
            <Text style={styles.subtitle}>PAGE {currentPage + 1} OF {pageCount}</Text>
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

      <View style={styles.editorArea}>
        <ScrollView
          horizontal
          pagingEnabled
          onMomentumScrollEnd={(e) => {
            const page = Math.round(e.nativeEvent.contentOffset.x / width);
            setCurrentPage(page);
          }}
        >
          {Array.from({ length: pageCount }).map((_, i) => (
            <View key={i} style={styles.pageWrapper}>
              <View style={[styles.pdfPage, { width: width * 0.9, height: height * 0.6 }]}>
                <View style={styles.pdfPlaceholder}>
                  <FileText size={64} color="rgba(255,255,255,0.05)" />
                  <Text style={styles.placeholderText}>PAGE {i + 1}</Text>
                  <Text style={styles.nativeHint}>Preview rendering is simplified in Expo Go on native.</Text>
                </View>

                <Svg style={StyleSheet.absoluteFill}>
                  {annotations.filter((a) => a.pageIndex === i).map((ann, idx) => (
                    <AnnotationItem key={`ann-${idx}`} annotation={ann} />
                  ))}
                </Svg>
              </View>
            </View>
          ))}
        </ScrollView>
      </View>

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

function ToolButton({ icon: Icon, active, onPress }: { icon: any; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity style={[styles.toolBtn, active && styles.activeToolBtn]} onPress={onPress}>
      <Icon size={24} color={active ? '#000' : 'rgba(255,255,255,0.4)'} />
    </TouchableOpacity>
  );
}

function AnnotationItem({ annotation }: { annotation: any; key?: string }) {
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
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 20,
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
    maxWidth: width * 0.5,
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
    gap: 8,
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
    opacity: 0.4,
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
  },
  pageWrapper: {
    width,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pdfPage: {
    backgroundColor: '#111',
    borderRadius: 24,
    overflow: 'hidden',
  },
  pdfPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  placeholderText: {
    color: '#fff',
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  nativeHint: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 12,
    textAlign: 'center',
    maxWidth: 220,
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 20,
    marginBottom: 16,
    padding: 8,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 20,
    gap: 8,
  },
  toolBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeToolBtn: {
    backgroundColor: '#fff',
  },
  toolDivider: {
    flex: 1,
  },
  exportBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  quickAccess: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  quickBtn: {
    flex: 1,
    height: 52,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.05)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  quickText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
});
