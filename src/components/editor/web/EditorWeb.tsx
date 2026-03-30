import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, useWindowDimensions } from 'react-native';
import { useStore } from '../../../store/useStore';
import { ChevronLeft, Save, Download, Type, PenTool, MessageSquare, MousePointer2, ZoomIn, ZoomOut, Undo2, Redo2, Layers, Zap, Pen, Home, Highlighter } from 'lucide-react-native';
import * as pdfjs from 'pdfjs-dist';
import { PDFDocument as PDFLib } from 'pdf-lib';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../../../firebase';
import { savePdf } from '../../../lib/savePdf';
import { theme } from '../../../theme';
import { AnnotationOverlay } from './AnnotationOverlay';
import { PdfPageCanvas } from './PdfPageCanvas';
import { SignatureModal } from './SignatureModal';
import { ToolButton } from './chrome/ToolButton';
import { SIDEBAR_WIDTH } from './constants';
import { styles } from './styles';
import { ContextualToolMenu, TextToolControls } from './text/TextToolPanel';
import type { EditorProps } from './types';
import { nextId } from './utils';

pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.mjs`;

export default function Editor({ setView }: EditorProps) {
  const {
    user, currentDocument, activeTool, setActiveTool,
    annotations, setAnnotations, addAnnotation, updateAnnotation, removeAnnotation,
    undo, redo, canUndo, canRedo,
    penColor, setPenColor, penWidth, fontSize, setFontSize, fontFamily, setFontFamily,
    selectedAnnotationId, setSelectedAnnotation,
  } = useStore();

  const { width: winWidth } = useWindowDimensions();
  const [pdf, setPdf] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [zoom, setZoom] = useState(0.6);
  const [currentPage, setCurrentPage] = useState(0);
  const [saving, setSaving] = useState(false);
  const [pageAspectRatios, setPageAspectRatios] = useState<number[]>([]);

  // Signature modal
  const [showSigModal, setShowSigModal] = useState(false);
  const [sigPageIndex, setSigPageIndex] = useState(0);
  const [sigPosition, setSigPosition] = useState({ x: 0, y: 0 });

  useEffect(() => {
    if (!currentDocument) return;
    const loadPdf = async () => {
      try {
        const loadingTask = pdfjs.getDocument(currentDocument.fileUrl);
        const pdfDoc = await loadingTask.promise;
        setPdf(pdfDoc);
        setAnnotations(currentDocument.annotations || []);

        // Read aspect ratio of each page
        const ratios: number[] = [];
        for (let i = 1; i <= pdfDoc.numPages; i++) {
          const page = await pdfDoc.getPage(i);
          const vp = page.getViewport({ scale: 1 });
          ratios.push(vp.height / vp.width); // height-to-width ratio
        }
        setPageAspectRatios(ratios);
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

  const isMobile = winWidth < 768;
  const availableWidth = isMobile ? winWidth : winWidth - SIDEBAR_WIDTH;
  const selectedAnnotation = annotations.find((annotation) => annotation.id === selectedAnnotationId) || null;
  const selectedTextAnnotation = selectedAnnotation?.type === 'TEXT' ? selectedAnnotation : null;
  const showTextControls = activeTool === 'TEXT' || selectedTextAnnotation?.type === 'TEXT';
  const activeFontFamily = selectedTextAnnotation?.data?.fontFamily || fontFamily;
  const activeFontSize = selectedTextAnnotation?.data?.fontSize || fontSize;
  const activeTextColor = selectedTextAnnotation?.data?.color || penColor;

  const updateTextStyle = (updates: Record<string, any>) => {
    if (selectedTextAnnotation) {
      updateAnnotation(selectedTextAnnotation.id, {
        data: {
          ...selectedTextAnnotation.data,
          ...updates,
        },
      });
    }

    if (typeof updates.color === 'string') setPenColor(updates.color);
    if (typeof updates.fontSize === 'number') setFontSize(updates.fontSize);
    if (typeof updates.fontFamily === 'string') setFontFamily(updates.fontFamily);
  };

  // zoom controls the % of container width the page occupies
  const getPageDimensions = (pageIndex: number) => {
    const aspectRatio = pageAspectRatios[pageIndex] || (297 / 210); // fallback to A4
    const pageW = availableWidth * zoom;
    const pageH = pageW * aspectRatio;
    return { pageW, pageH };
  };

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

      {/* Pages */}
      <View style={styles.editorArea}>
        <div style={{
          width: '100%', height: '100%',
          overflow: 'auto',
          WebkitOverflowScrolling: 'touch',
        } as React.CSSProperties}>
          <div style={{
            display: 'inline-flex', flexDirection: 'column',
            paddingTop: 20, paddingBottom: isMobile ? 130 : 20,
            minWidth: '100%',
            minHeight: '100%',
          }}>
            {Array.from({ length: pdf?.numPages || 0 }).map((_, i) => {
              const { pageW, pageH } = getPageDimensions(i);
              return (
                <div key={i} style={{ marginBottom: 20, marginLeft: 'auto', marginRight: 'auto' }}>
                  <View style={[styles.pdfPage, { width: pageW, height: pageH }]}>
                    <PdfPageCanvas pdf={pdf} pageIndex={i} containerWidth={pageW} containerHeight={pageH} />
                    <AnnotationOverlay
                      pageIndex={i}
                      pageWidth={pageW}
                      pageHeight={pageH}
                      activeTool={activeTool}
                      annotations={annotations.filter(a => a.pageIndex === i)}
                      addAnnotation={addAnnotation}
                      updateAnnotation={updateAnnotation}
                      removeAnnotation={removeAnnotation}
                      selectedAnnotationId={selectedAnnotationId}
                      setSelectedAnnotation={setSelectedAnnotation}
                      setActiveTool={setActiveTool}
                      penColor={penColor}
                      penWidth={penWidth}
                      fontSize={fontSize}
                      fontFamily={fontFamily}
                      user={user}
                      onSignatureRequest={(x, y) => {
                        setSigPageIndex(i);
                        setSigPosition({ x, y });
                        setShowSigModal(true);
                      }}
                    />
                  </View>
                </div>
              );
            })}
          </div>
        </div>
      </View>

      <ContextualToolMenu
        title={selectedTextAnnotation ? 'Text Selection' : 'Text Tool'}
        subtitle={selectedTextAnnotation ? 'Update the selected text object.' : 'Choose defaults for the next text annotation.'}
        visible={showTextControls}
        isMobile={isMobile}
      >
        <TextToolControls
          fontFamily={activeFontFamily}
          fontSize={activeFontSize}
          color={activeTextColor}
          onFontFamilyChange={(value) => updateTextStyle({ fontFamily: value })}
          onFontSizeChange={(value) => updateTextStyle({ fontSize: value })}
          onColorChange={(value) => updateTextStyle({ color: value })}
        />
      </ContextualToolMenu>

      {/* ─── MOBILE BOTTOM TOOLBAR ─── */}
      {isMobile && (
        <div style={{
          position: 'fixed', bottom: 0, left: 0, right: 0,
          background: theme.colors.surface,
          borderTop: 'none',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
          zIndex: 100,
          boxShadow: `0 -6px 14px ${theme.neu.colors.darkShadow}`,
        } as React.CSSProperties}>
          {/* Zoom strip */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '6px 16px',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
          }}>
            <TouchableOpacity onPress={() => setZoom(Math.max(0.3, zoom - 0.1))}>
              <ZoomOut size={16} color="rgba(255,255,255,0.5)" />
            </TouchableOpacity>
            <input type="range" min="0.3" max="3" step="0.01" value={zoom}
              onChange={(e) => setZoom(parseFloat(e.target.value))}
              style={{
                flex: 1, height: 3, appearance: 'none' as any,
                WebkitAppearance: 'none', background: 'rgba(255,255,255,0.15)',
                borderRadius: 2, outline: 'none',
              }}
            />
            <TouchableOpacity onPress={() => setZoom(Math.min(3, zoom + 0.1))}>
              <ZoomIn size={16} color="rgba(255,255,255,0.5)" />
            </TouchableOpacity>
            <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10, fontWeight: 'bold', minWidth: 32, textAlign: 'center' }}>
              {Math.round(zoom * 100)}%
            </span>
          </div>
          {/* Tool buttons */}
          <div style={{
            display: 'flex', justifyContent: 'space-around', alignItems: 'center',
            padding: '8px 4px',
          }}>
            {[
              { id: 'home', icon: Home, label: 'Home', action: () => setView('dashboard') },
              { id: 'TEXT', icon: Type, label: 'Text' },
              { id: 'DRAW', icon: PenTool, label: 'Draw' },
              { id: 'HIGHLIGHT', icon: Highlighter, label: 'Highlight' },
              { id: 'SIGNATURE', icon: Pen, label: 'Fill & Sign' },
              { id: 'COMMENT', icon: MessageSquare, label: 'Comment' },
            ].map((tool) => {
              const isActive = tool.id !== 'home' && activeTool === tool.id;
              const Icon = tool.icon;
              return (
                <TouchableOpacity
                  key={tool.id}
                  onPress={tool.action || (() => setActiveTool(tool.id as any))}
                  style={{ alignItems: 'center', gap: 2, paddingHorizontal: 4 } as any}
                >
                  <Icon size={20} color={isActive ? theme.colors.accentStrong : theme.colors.textMuted} />
                  <Text style={{
                    fontSize: 9, fontWeight: '600',
                    color: isActive ? theme.colors.accentStrong : theme.colors.textSoft,
                  } as any}>{tool.label}</Text>
                </TouchableOpacity>
              );
            })}
          </div>
        </div>
      )}

      {/* ─── DESKTOP FLOATING TOOLBAR ─── */}
      {!isMobile && (
        <View style={styles.toolbar}>
          <ToolButton icon={MousePointer2} active={activeTool === 'SELECT'} onPress={() => setActiveTool('SELECT')} />
          <ToolButton icon={Type} active={activeTool === 'TEXT'} onPress={() => setActiveTool('TEXT')} />
          <ToolButton icon={Pen} active={activeTool === 'SIGNATURE'} onPress={() => setActiveTool('SIGNATURE')} />
          <ToolButton icon={PenTool} active={activeTool === 'DRAW'} onPress={() => setActiveTool('DRAW')} />
          <ToolButton icon={MessageSquare} active={activeTool === 'COMMENT'} onPress={() => setActiveTool('COMMENT')} />
          <View style={styles.toolDivider} />
          <TouchableOpacity style={styles.exportBtn} onPress={handleExport}>
            <Download size={20} color="#000" />
          </TouchableOpacity>
        </View>
      )}

      {/* ─── DESKTOP ZOOM SLIDER ─── */}
      {!isMobile && (
        <div style={{
          position: 'fixed', bottom: 120, right: 30,
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
          background: theme.colors.surface, borderRadius: 16, padding: '12px 10px',
          boxShadow: `6px 6px 12px ${theme.neu.colors.darkShadow}, -6px -6px 12px ${theme.neu.colors.lightShadow}`,
        }}>
          <ZoomIn size={16} color="#fff" />
          <input type="range" min="0.3" max="3" step="0.01" value={zoom}
            onChange={(e) => setZoom(parseFloat(e.target.value))}
            style={{
              writingMode: 'vertical-lr' as any, direction: 'rtl',
              width: 4, height: 120, appearance: 'none' as any,
              WebkitAppearance: 'none', background: 'rgba(255,255,255,0.15)',
              borderRadius: 2, outline: 'none', cursor: 'pointer',
            }}
          />
          <ZoomOut size={16} color="#fff" />
          <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 10, fontWeight: 'bold' }}>
            {Math.round(zoom * 100)}%
          </span>
        </div>
      )}

      {/* ─── DESKTOP QUICK ACCESS ─── */}
      {!isMobile && (
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
      )}

      {/* Signature Modal */}
      {showSigModal && (
        <SignatureModal
          onConfirm={(dataUrl) => {
            addAnnotation({
              id: nextId(),
              type: 'SIGNATURE',
              pageIndex: sigPageIndex,
              data: { x: sigPosition.x, y: sigPosition.y, imageDataUrl: dataUrl, width: 200, height: 80 },
            });
            setShowSigModal(false);
          }}
          onCancel={() => setShowSigModal(false)}
        />
      )}
    </View>
  );
}
