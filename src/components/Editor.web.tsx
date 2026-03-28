import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, useWindowDimensions } from 'react-native';
import { useStore } from '../store/useStore';
import { ChevronLeft, Save, Download, Type, PenTool, MessageSquare, MousePointer2, ZoomIn, ZoomOut, Undo2, Redo2, Layers, Zap, Pen, Home, Highlighter } from 'lucide-react-native';
import * as pdfjs from 'pdfjs-dist';
import { PDFDocument as PDFLib } from 'pdf-lib';
import { Circle, Group, Image as KonvaImage, Label, Layer, Line, Rect, Stage, Tag, Text as KonvaText } from 'react-konva';
import type Konva from 'konva';

pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.mjs`;
import { db } from '../firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { savePdf } from '../lib/savePdf';

const SIDEBAR_WIDTH = 260;
const FONT_FAMILIES = ['Inter', 'Georgia', 'Helvetica', 'Courier New', 'Times New Roman', 'Verdana'];
const FONT_SIZES = [12, 14, 16, 18, 24, 32, 48];
const TOOL_COLORS = ['#111827', '#000000', '#ef4444', '#ec6400', '#f59e0b', '#10b981', '#2563eb', '#7c3aed'];

let _annId = 0;
const nextId = () => `ann_${Date.now()}_${++_annId}`;

interface EditorProps {
  setView: (view: any) => void;
}

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
          background: '#0a0a0a',
          borderTop: '1px solid rgba(255,255,255,0.1)',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
          zIndex: 100,
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
                  <Icon size={20} color={isActive ? '#ec6400' : 'rgba(255,255,255,0.5)'} />
                  <Text style={{
                    fontSize: 9, fontWeight: '600',
                    color: isActive ? '#ec6400' : 'rgba(255,255,255,0.4)',
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
          background: 'rgba(22,22,22,0.9)', borderRadius: 16, padding: '12px 10px',
          border: '1px solid rgba(255,255,255,0.1)', backdropFilter: 'blur(10px)',
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

function ContextualToolMenu({
  title,
  subtitle,
  visible,
  isMobile,
  children,
}: {
  title: string;
  subtitle?: string;
  visible: boolean;
  isMobile: boolean;
  children: React.ReactNode;
}) {
  if (!visible) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: isMobile ? 'auto' : 108,
        bottom: isMobile ? 92 : 'auto',
        left: isMobile ? 12 : '50%',
        right: isMobile ? 12 : 'auto',
        transform: isMobile ? 'none' : 'translateX(-50%)',
        zIndex: 120,
        minWidth: isMobile ? 'auto' : 360,
        maxWidth: isMobile ? 'none' : 420,
        padding: 16,
        borderRadius: 18,
        border: '1px solid rgba(255,255,255,0.1)',
        background: 'rgba(18,18,24,0.92)',
        backdropFilter: 'blur(18px)',
        boxShadow: '0 18px 40px rgba(0,0,0,0.35)',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 14 }}>
        <span style={{ color: '#fff', fontSize: 13, fontWeight: 700, letterSpacing: 0.3 }}>{title}</span>
        {subtitle && (
          <span style={{ color: 'rgba(255,255,255,0.55)', fontSize: 12, lineHeight: 1.4 }}>
            {subtitle}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

function TextToolControls({
  fontFamily,
  fontSize,
  color,
  onFontFamilyChange,
  onFontSizeChange,
  onColorChange,
}: {
  fontFamily: string;
  fontSize: number;
  color: string;
  onFontFamilyChange: (value: string) => void;
  onFontSizeChange: (value: number) => void;
  onColorChange: (value: string) => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 104px', gap: 12 }}>
        <ControlField label="Font">
          <select
            value={fontFamily}
            onChange={(event) => onFontFamilyChange(event.target.value)}
            style={controlSelectStyle}
          >
            {FONT_FAMILIES.map((family) => (
              <option key={family} value={family}>{family}</option>
            ))}
          </select>
        </ControlField>
        <ControlField label="Size">
          <select
            value={fontSize}
            onChange={(event) => onFontSizeChange(parseInt(event.target.value, 10))}
            style={controlSelectStyle}
          >
            {FONT_SIZES.map((size) => (
              <option key={size} value={size}>{size}px</option>
            ))}
          </select>
        </ControlField>
      </div>

      <ControlField label="Color">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', flex: 1 }}>
            {TOOL_COLORS.map((swatch) => (
              <button
                key={swatch}
                type="button"
                onClick={() => onColorChange(swatch)}
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 999,
                  border: color === swatch ? '2px solid #fff' : '2px solid rgba(255,255,255,0.18)',
                  background: swatch,
                  cursor: 'pointer',
                  boxShadow: color === swatch ? '0 0 0 2px rgba(99,102,241,0.5)' : 'none',
                }}
              />
            ))}
          </div>
          <input
            type="color"
            value={normalizeHexColor(color)}
            onChange={(event) => onColorChange(event.target.value)}
            style={{
              width: 38,
              height: 38,
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 10,
              background: 'transparent',
              cursor: 'pointer',
            }}
          />
        </div>
      </ControlField>

      <div
        style={{
          borderRadius: 14,
          border: '1px solid rgba(255,255,255,0.08)',
          background: 'rgba(255,255,255,0.04)',
          padding: '12px 14px',
        }}
      >
        <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 10, letterSpacing: 1.1, marginBottom: 8 }}>
          PREVIEW
        </div>
        <div style={{ color, fontFamily, fontSize, lineHeight: 1.2 }}>
          The quick brown fox
        </div>
      </div>
    </div>
  );
}

function ControlField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{ color: 'rgba(255,255,255,0.55)', fontSize: 11, fontWeight: 700, letterSpacing: 0.8 }}>
        {label.toUpperCase()}
      </span>
      {children}
    </label>
  );
}

const controlSelectStyle: React.CSSProperties = {
  width: '100%',
  height: 38,
  borderRadius: 10,
  border: '1px solid rgba(255,255,255,0.12)',
  background: 'rgba(255,255,255,0.06)',
  color: '#fff',
  padding: '0 12px',
  outline: 'none',
};

function normalizeHexColor(value: string) {
  if (/^#[0-9a-fA-F]{6}$/.test(value)) {
    return value;
  }
  return '#111827';
}

/* ─── Annotation Overlay ─── */
function AnnotationOverlay({
  pageIndex, pageWidth, pageHeight, activeTool, annotations,
  addAnnotation, updateAnnotation, removeAnnotation, selectedAnnotationId, setSelectedAnnotation,
  setActiveTool,
  penColor, penWidth, fontSize, fontFamily, user, onSignatureRequest,
}: any) {
  const stageRef = useRef<Konva.Stage | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Drawing state
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawPoints, setDrawPoints] = useState<{ x: number; y: number }[]>([]);

  // Text input state
  const [textInput, setTextInput] = useState<{ x: number; y: number; value: string; annotationId?: string } | null>(null);

  // Comment input state
  const [commentInput, setCommentInput] = useState<{ x: number; y: number; value: string } | null>(null);

  useEffect(() => {
    if (textInput) {
      window.requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [textInput]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!selectedAnnotationId || textInput || commentInput) return;
      if (event.key === 'Backspace' || event.key === 'Delete') {
        removeAnnotation(selectedAnnotationId);
        setSelectedAnnotation(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [commentInput, removeAnnotation, selectedAnnotationId, setSelectedAnnotation, textInput]);

  const getStagePosition = () => {
    const pointer = stageRef.current?.getPointerPosition();
    if (!pointer) return null;
    return {
      x: Math.max(0, Math.min(100, (pointer.x / pageWidth) * 100)),
      y: Math.max(0, Math.min(100, (pointer.y / pageHeight) * 100)),
    };
  };

  const handleStagePointerDown = (event: any) => {
    if (event.target !== event.target.getStage()) {
      return;
    }

    const pos = getStagePosition();
    if (!pos) return;

    if (activeTool === 'TEXT') {
      setTextInput({ x: pos.x, y: pos.y, value: '' });
      setSelectedAnnotation(null);
    } else if (activeTool === 'DRAW') {
      setIsDrawing(true);
      setDrawPoints([pos]);
    } else if (activeTool === 'SIGNATURE') {
      onSignatureRequest(pos.x, pos.y);
    } else if (activeTool === 'COMMENT') {
      setCommentInput({ x: pos.x, y: pos.y, value: '' });
      setSelectedAnnotation(null);
    } else if (activeTool === 'SELECT') {
      setSelectedAnnotation(null);
    }
  };

  const handleStagePointerMove = () => {
    if (!isDrawing) return;
    const pos = getStagePosition();
    if (!pos) return;
    setDrawPoints(prev => [...prev, pos]);
  };

  const handleStagePointerUp = () => {
    if (isDrawing && drawPoints.length > 1) {
      addAnnotation({
        id: nextId(),
        type: 'DRAW',
        pageIndex,
        data: { points: drawPoints, color: penColor, strokeWidth: penWidth },
      });
      setDrawPoints([]);
      setIsDrawing(false);
    }
  };

  const commitText = () => {
    if (textInput && textInput.value.trim()) {
      if (textInput.annotationId) {
        const existingAnnotation = annotations.find((annotation: any) => annotation.id === textInput.annotationId);
        updateAnnotation(textInput.annotationId, {
          data: {
            ...existingAnnotation?.data,
            text: textInput.value,
            x: textInput.x,
            y: textInput.y,
          },
        });
        setSelectedAnnotation(textInput.annotationId);
      } else {
        const annotationId = nextId();
        addAnnotation({
          id: annotationId,
          type: 'TEXT',
          pageIndex,
          data: { x: textInput.x, y: textInput.y, text: textInput.value, fontSize, color: penColor, fontFamily },
        });
        setSelectedAnnotation(annotationId);
      }
      setActiveTool('SELECT');
    }
    setTextInput(null);
  };

  const commitComment = () => {
    if (commentInput && commentInput.value.trim()) {
      addAnnotation({
        id: nextId(),
        type: 'COMMENT',
        pageIndex,
        data: {
          x: commentInput.x, y: commentInput.y,
          text: commentInput.value,
          author: user?.displayName || user?.email || 'You',
        },
      });
    }
    setCommentInput(null);
  };

  const drawingPoints = drawPoints.flatMap((point) => [
    (point.x / 100) * pageWidth,
    (point.y / 100) * pageHeight,
  ]);

  return (
    <div
      style={{
        position: 'absolute', inset: 0,
        cursor: activeTool === 'SELECT' ? 'default'
          : activeTool === 'DRAW' ? 'crosshair'
          : activeTool === 'TEXT' ? 'text'
          : 'pointer',
        zIndex: 10,
      }}
    >
      <Stage
        ref={(node) => {
          stageRef.current = node;
        }}
        width={pageWidth}
        height={pageHeight}
        onMouseDown={handleStagePointerDown}
        onMousemove={handleStagePointerMove}
        onMouseup={handleStagePointerUp}
        onMouseleave={handleStagePointerUp}
        onTouchStart={handleStagePointerDown}
        onTouchMove={handleStagePointerMove}
        onTouchEnd={handleStagePointerUp}
        style={{ width: pageWidth, height: pageHeight }}
      >
        <Layer>
          {annotations.map((annotation: any) => (
            <RenderedAnnotation
              key={annotation.id}
              annotation={annotation}
              pageWidth={pageWidth}
              pageHeight={pageHeight}
              isSelected={selectedAnnotationId === annotation.id}
              onSelect={() => {
                if (activeTool === 'SELECT') {
                  setSelectedAnnotation(annotation.id);
                }
              }}
              onDelete={() => {
                removeAnnotation(annotation.id);
                setSelectedAnnotation(null);
              }}
              onMove={(position: { x: number; y: number }) => {
                updateAnnotation(annotation.id, {
                  data: {
                    ...annotation.data,
                    x: position.x,
                    y: position.y,
                  },
                });
              }}
              onEditText={() => {
                if (annotation.type !== 'TEXT') return;
                setTextInput({
                  x: annotation.data.x,
                  y: annotation.data.y,
                  value: annotation.data.text || '',
                  annotationId: annotation.id,
                });
                setSelectedAnnotation(annotation.id);
              }}
            />
          ))}
          {isDrawing && drawingPoints.length > 2 && (
            <Line
              points={drawingPoints}
              stroke={penColor}
              strokeWidth={penWidth}
              lineCap="round"
              lineJoin="round"
              tension={0.15}
            />
          )}
        </Layer>
      </Stage>

      {/* Inline text input */}
      {textInput && (
        <div style={{
          position: 'absolute',
          left: `${(textInput.x / 100) * pageWidth}px`, top: `${(textInput.y / 100) * pageHeight}px`,
          transform: 'translate(-4px, -4px)',
        }}>
          <input
            ref={inputRef}
            value={textInput.value}
            onChange={(e) => setTextInput({ ...textInput, value: e.target.value })}
            onBlur={commitText}
            onKeyDown={(e) => { if (e.key === 'Enter') commitText(); }}
            placeholder="Type here..."
            style={{
              background: 'rgba(255,255,200,0.9)',
              border: '2px solid #f59e0b',
              borderRadius: 4,
              padding: '4px 8px',
              fontSize: fontSize,
              color: penColor,
              outline: 'none',
              minWidth: 120,
              fontFamily,
            }}
          />
        </div>
      )}

      {/* Inline comment input */}
      {commentInput && (
        <div style={{
          position: 'absolute',
          left: `${(commentInput.x / 100) * pageWidth}px`, top: `${(commentInput.y / 100) * pageHeight}px`,
          transform: 'translate(-12px, -12px)',
          zIndex: 20,
        }}>
          <div style={{
            background: '#1a1a2e',
            border: '1px solid rgba(255,255,255,0.2)',
            borderRadius: 12,
            padding: 12,
            width: 220,
            boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
          }}>
            <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 10, marginBottom: 8, fontWeight: 'bold', letterSpacing: 1 }}>
              ADD COMMENT
            </div>
            <textarea
              autoFocus
              value={commentInput.value}
              onChange={(e) => setCommentInput({ ...commentInput, value: e.target.value })}
              placeholder="Write a comment..."
              rows={3}
              style={{
                width: '100%',
                background: 'rgba(255,255,255,0.08)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 8,
                padding: 8,
                color: '#fff',
                fontSize: 13,
                resize: 'none',
                outline: 'none',
                fontFamily: 'inherit',
              }}
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setCommentInput(null)}
                style={{
                  background: 'rgba(255,255,255,0.1)',
                  border: 'none', borderRadius: 6, padding: '4px 12px',
                  color: '#fff', cursor: 'pointer', fontSize: 12,
                }}
              >Cancel</button>
              <button
                onClick={commitComment}
                style={{
                  background: '#6366f1',
                  border: 'none', borderRadius: 6, padding: '4px 12px',
                  color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 'bold',
                }}
              >Add</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function RenderedAnnotation({
  annotation,
  pageWidth,
  pageHeight,
  isSelected,
  onSelect,
  onDelete,
  onMove,
  onEditText,
}: any) {
  const { data, type } = annotation;
  const commonDragProps = activeDragProps(type, data, pageWidth, pageHeight, onMove);

  if (type === 'TEXT') {
    const x = (data.x / 100) * pageWidth;
    const y = (data.y / 100) * pageHeight;
    return (
      <Group
        x={x}
        y={y}
        onClick={(event) => {
          event.cancelBubble = true;
          onSelect();
        }}
        onTap={(event) => {
          event.cancelBubble = true;
          onSelect();
        }}
        onDblClick={(event) => {
          event.cancelBubble = true;
          onEditText();
        }}
        {...commonDragProps}
      >
        {isSelected && (
          <Rect
            x={-4}
            y={-4}
            width={Math.max(40, ((data.text || '').length || 1) * ((data.fontSize || 16) * 0.6)) + 8}
            height={(data.fontSize || 16) + 10}
            fill="rgba(99,102,241,0.12)"
            stroke="#6366f1"
            strokeWidth={1}
            cornerRadius={4}
          />
        )}
        <KonvaText
          text={data.text || ''}
          fontFamily={data.fontFamily || 'Inter'}
          fontSize={data.fontSize || 16}
          fill={data.color || '#000'}
          fontStyle="500"
        />
        {isSelected && <DeleteControl x={Math.max(48, ((data.text || '').length || 1) * ((data.fontSize || 16) * 0.6)) + 8} y={-12} onDelete={onDelete} />}
      </Group>
    );
  }

  if (type === 'DRAW') {
    const points = (data.points || []).flatMap((point: any) => [
      (point.x / 100) * pageWidth,
      (point.y / 100) * pageHeight,
    ]);
    if (points.length < 4) return null;
    return (
      <Group
        onClick={(event) => {
          event.cancelBubble = true;
          onSelect();
        }}
        onTap={(event) => {
          event.cancelBubble = true;
          onSelect();
        }}
      >
        {isSelected && (
          <Line
            points={points}
            stroke="rgba(99,102,241,0.35)"
            strokeWidth={(data.strokeWidth || 2) + 10}
            lineCap="round"
            lineJoin="round"
            tension={0.15}
          />
        )}
        <Line
          points={points}
          stroke={data.color || '#000'}
          strokeWidth={data.strokeWidth || 2}
          lineCap="round"
          lineJoin="round"
          tension={0.15}
        />
      </Group>
    );
  }

  if (type === 'SIGNATURE') {
    return <SignatureAnnotation annotation={annotation} pageWidth={pageWidth} pageHeight={pageHeight} isSelected={isSelected} onSelect={onSelect} onDelete={onDelete} onMove={onMove} />;
  }

  if (type === 'COMMENT') {
    return <CommentAnnotation annotation={annotation} pageWidth={pageWidth} pageHeight={pageHeight} isSelected={isSelected} onSelect={onSelect} onDelete={onDelete} onMove={onMove} />;
  }

  return null;
}

function activeDragProps(type: string, data: any, pageWidth: number, pageHeight: number, onMove: (position: { x: number; y: number }) => void) {
  if (!['TEXT', 'SIGNATURE', 'COMMENT'].includes(type)) {
    return {};
  }

  return {
    draggable: true,
    onDragEnd: (event: any) => {
      const x = Math.max(0, Math.min(100, (event.target.x() / pageWidth) * 100));
      const y = Math.max(0, Math.min(100, (event.target.y() / pageHeight) * 100));
      event.target.position({
        x: (x / 100) * pageWidth,
        y: (y / 100) * pageHeight,
      });
      onMove({ x, y });
    },
  };
}

function DeleteControl({ x, y, onDelete }: { x: number; y: number; onDelete: () => void }) {
  return (
    <Group
      x={x}
      y={y}
      onClick={(event) => {
        event.cancelBubble = true;
        onDelete();
      }}
      onTap={(event) => {
        event.cancelBubble = true;
        onDelete();
      }}
    >
      <Circle radius={10} fill="#ef4444" stroke="#fff" strokeWidth={2} />
      <KonvaText text="x" fontSize={11} fill="#fff" x={-3.5} y={-5.5} />
    </Group>
  );
}

function CommentAnnotation({ annotation, pageWidth, pageHeight, isSelected, onSelect, onDelete, onMove }: any) {
  const { data } = annotation;
  const x = (data.x / 100) * pageWidth;
  const y = (data.y / 100) * pageHeight;
  return (
    <Group
      x={x}
      y={y}
      onClick={(event) => {
        event.cancelBubble = true;
        onSelect();
      }}
      onTap={(event) => {
        event.cancelBubble = true;
        onSelect();
      }}
      {...activeDragProps('COMMENT', data, pageWidth, pageHeight, onMove)}
    >
      <Circle radius={14} fill={isSelected ? '#6366f1' : '#f59e0b'} stroke="#fff" strokeWidth={2} />
      <KonvaText text="?" fontSize={14} fill="#fff" x={-4} y={-7} />
      {(isSelected) && (
        <>
          <Label x={20} y={-12}>
            <Tag fill="#1a1a2e" stroke="rgba(255,255,255,0.15)" strokeWidth={1} cornerRadius={10} />
            <KonvaText
              text={`${data.author || 'Anonymous'}\n${data.text || ''}`}
              fill="#fff"
              fontSize={12}
              padding={12}
              width={200}
              lineHeight={1.35}
            />
          </Label>
          <DeleteControl x={122} y={-16} onDelete={onDelete} />
        </>
      )}
    </Group>
  );
}

function SignatureAnnotation({ annotation, pageWidth, pageHeight, isSelected, onSelect, onDelete, onMove }: any) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const { data } = annotation;
  const x = (data.x / 100) * pageWidth;
  const y = (data.y / 100) * pageHeight;

  useEffect(() => {
    if (!data.imageDataUrl) return;
    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.src = data.imageDataUrl;
    img.onload = () => setImage(img);
  }, [data.imageDataUrl]);

  return (
    <Group
      x={x}
      y={y}
      onClick={(event) => {
        event.cancelBubble = true;
        onSelect();
      }}
      onTap={(event) => {
        event.cancelBubble = true;
        onSelect();
      }}
      {...activeDragProps('SIGNATURE', data, pageWidth, pageHeight, onMove)}
    >
      {isSelected && (
        <Rect
          width={data.width || 200}
          height={data.height || 80}
          stroke="#6366f1"
          strokeWidth={2}
          cornerRadius={4}
        />
      )}
      {image && (
        <KonvaImage
          image={image}
          width={data.width || 200}
          height={data.height || 80}
        />
      )}
      {isSelected && <DeleteControl x={(data.width || 200) + 10} y={-10} onDelete={onDelete} />}
    </Group>
  );
}

/* ─── Signature Modal ─── */
function SignatureModal({ onConfirm, onCancel }: { onConfirm: (dataUrl: string) => void; onCancel: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawingRef = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const getPos = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };

    const down = (e: MouseEvent) => {
      isDrawingRef.current = true;
      const p = getPos(e);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
    };
    const move = (e: MouseEvent) => {
      if (!isDrawingRef.current) return;
      const p = getPos(e);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
    };
    const up = () => { isDrawingRef.current = false; };

    canvas.addEventListener('mousedown', down);
    canvas.addEventListener('mousemove', move);
    canvas.addEventListener('mouseup', up);
    canvas.addEventListener('mouseleave', up);

    return () => {
      canvas.removeEventListener('mousedown', down);
      canvas.removeEventListener('mousemove', move);
      canvas.removeEventListener('mouseup', up);
      canvas.removeEventListener('mouseleave', up);
    };
  }, []);

  const handleClear = () => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx || !canvasRef.current) return;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvasRef.current.width, canvasRef.current.height);
  };

  const handleConfirm = () => {
    if (!canvasRef.current) return;
    onConfirm(canvasRef.current.toDataURL('image/png'));
  };

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 100,
      backdropFilter: 'blur(8px)',
    }}>
      <div style={{
        background: '#1a1a2e',
        borderRadius: 20,
        padding: 24,
        border: '1px solid rgba(255,255,255,0.1)',
        boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
        width: 480,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <span style={{ color: '#fff', fontSize: 16, fontWeight: 'bold' }}>Draw Your Signature</span>
          <button onClick={onCancel} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.5)', fontSize: 20 }}>✕</button>
        </div>
        <canvas
          ref={canvasRef}
          width={432}
          height={160}
          style={{
            borderRadius: 12,
            border: '2px dashed rgba(255,255,255,0.15)',
            cursor: 'crosshair',
            display: 'block',
            width: '100%',
          }}
        />
        <div style={{ display: 'flex', gap: 10, marginTop: 16, justifyContent: 'flex-end' }}>
          <button onClick={handleClear} style={{
            background: 'rgba(255,255,255,0.08)',
            border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: 10, padding: '8px 20px',
            color: '#fff', cursor: 'pointer', fontSize: 13,
          }}>Clear</button>
          <button onClick={handleConfirm} style={{
            background: '#6366f1',
            border: 'none', borderRadius: 10, padding: '8px 24px',
            color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 'bold',
          }}>Confirm</button>
        </div>
      </div>
    </div>
  );
}

/* ─── PDF Page Canvas ─── */
function PdfPageCanvas({ pdf, pageIndex, containerWidth, containerHeight }: {
  pdf: any; pageIndex: number; containerWidth: number; containerHeight: number;
}) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);

  const renderIdRef = React.useRef(0);

  React.useEffect(() => {
    if (!pdf || !canvasRef.current) return;
    const currentRenderId = ++renderIdRef.current;

    const renderPage = async () => {
      try {
        const page = await pdf.getPage(pageIndex + 1);
        if (currentRenderId !== renderIdRef.current) return;
        const canvas = canvasRef.current;
        if (!canvas) return;

        const viewport = page.getViewport({ scale: 1 });
        const dpr = window.devicePixelRatio || 1;
        const cssScale = containerWidth / viewport.width;
        const renderScale = cssScale * dpr;
        const scaledViewport = page.getViewport({ scale: renderScale });

        // Set canvas buffer to high-res, CSS to display size
        canvas.width = scaledViewport.width;
        canvas.height = scaledViewport.height;
        canvas.style.width = `${containerWidth}px`;
        canvas.style.height = `${Math.round(containerWidth * (viewport.height / viewport.width))}px`;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        // Reset transform to prevent flipping
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        await page.render({ canvasContext: ctx, viewport: scaledViewport }).promise;
      } catch (err) {
        if (currentRenderId === renderIdRef.current) {
          console.error(`Error rendering page ${pageIndex + 1}:`, err);
        }
      }
    };

    renderPage();
    return () => { renderIdRef.current++; };
  }, [pdf, pageIndex, containerWidth, containerHeight]);

  return (
    <div style={{
      width: '100%', height: '100%',
      backgroundColor: '#fff', overflow: 'hidden',
    }}>
      <canvas ref={canvasRef} style={{ display: 'block' }} />  
    </div>
  );
}

/* ─── Toolbar Button ─── */
function ToolButton({ icon: Icon, active, onPress }: { icon: any; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity style={[styles.toolBtn, active && styles.activeToolBtn]} onPress={onPress}>
      <Icon size={24} color={active ? '#000' : 'rgba(255,255,255,0.4)'} />
    </TouchableOpacity>
  );
}

/* ─── Styles ─── */
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
    width: 40, height: 40,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  title: {
    color: '#fff', fontSize: 16, fontWeight: 'bold',
    maxWidth: 300,
  },
  subtitle: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 10, fontWeight: 'bold',
    letterSpacing: 1, marginTop: 2,
  },
  headerActions: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
  },
  actionBtn: {
    width: 40, height: 40,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  disabledBtn: { opacity: 0.3 },
  saveBtn: {
    width: 40, height: 40,
    backgroundColor: '#fff',
    borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  editorArea: {
    flex: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  pdfPage: {
    backgroundColor: '#fff',
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative' as any,
  },
  toolbar: {
    position: 'absolute',
    bottom: 40, left: 25, right: 25,
    height: 70,
    backgroundColor: 'rgba(22,22,22,0.9)',
    borderRadius: 35,
    flexDirection: 'row',
    alignItems: 'center', justifyContent: 'space-around',
    paddingHorizontal: 15,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  toolBtn: {
    width: 48, height: 48, borderRadius: 24,
    alignItems: 'center', justifyContent: 'center',
  },
  activeToolBtn: { backgroundColor: '#fff' },
  toolDivider: {
    width: 1, height: 30,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  exportBtn: {
    width: 48, height: 48,
    backgroundColor: '#fff',
    borderRadius: 24,
    alignItems: 'center', justifyContent: 'center',
  },
  quickAccess: {
    position: 'absolute', right: 25, top: 120, gap: 15,
  },
  quickBtn: {
    width: 50, height: 50,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 15,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  quickText: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 8, fontWeight: 'bold', marginTop: 2,
  },
});
