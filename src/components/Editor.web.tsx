import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Dimensions, Modal, TextInput } from 'react-native';
import { useStore } from '../store/useStore';
import { ChevronLeft, Save, Download, Type, PenTool, MessageSquare, MousePointer2, ZoomIn, ZoomOut, Undo2, Redo2, FileText, Layers, Zap, Pen, X, Check, Trash2 } from 'lucide-react-native';
import * as pdfjs from 'pdfjs-dist';
import { PDFDocument as PDFLib } from 'pdf-lib';

pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.mjs`;
import { db } from '../firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { savePdf } from '../lib/savePdf';

const { width, height } = Dimensions.get('window');

let _annId = 0;
const nextId = () => `ann_${Date.now()}_${++_annId}`;

interface EditorProps {
  setView: (view: any) => void;
}

export default function Editor({ setView }: EditorProps) {
  const {
    user, currentDocument, activeTool, setActiveTool,
    annotations, setAnnotations, addAnnotation, removeAnnotation,
    undo, redo, canUndo, canRedo,
    penColor, penWidth, fontSize,
    selectedAnnotationId, setSelectedAnnotation,
  } = useStore();

  const [pdf, setPdf] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [currentPage, setCurrentPage] = useState(0);
  const [saving, setSaving] = useState(false);

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

  const pageW = width * 0.6 * zoom;
  const pageH = height * 0.75 * zoom;

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
        <ScrollView
          showsVerticalScrollIndicator={true}
          contentContainerStyle={{ alignItems: 'center', paddingVertical: 20 }}
          onScroll={(e) => {
            const offsetY = e.nativeEvent.contentOffset.y;
            const pgH = pageH + 20;
            const page = Math.round(offsetY / pgH);
            setCurrentPage(Math.min(page, (pdf?.numPages || 1) - 1));
          }}
          scrollEventThrottle={100}
        >
          {Array.from({ length: pdf?.numPages || 0 }).map((_, i) => (
            <View key={i} style={{ marginBottom: 20, alignItems: 'center' }}>
              <View style={[styles.pdfPage, { width: pageW, height: pageH }]}>
                <PdfPageCanvas pdf={pdf} pageIndex={i} containerWidth={pageW} containerHeight={pageH} />
                <AnnotationOverlay
                  pageIndex={i}
                  pageWidth={pageW}
                  pageHeight={pageH}
                  activeTool={activeTool}
                  annotations={annotations.filter(a => a.pageIndex === i)}
                  addAnnotation={addAnnotation}
                  removeAnnotation={removeAnnotation}
                  selectedAnnotationId={selectedAnnotationId}
                  setSelectedAnnotation={setSelectedAnnotation}
                  penColor={penColor}
                  penWidth={penWidth}
                  fontSize={fontSize}
                  user={user}
                  onSignatureRequest={(x, y) => {
                    setSigPageIndex(i);
                    setSigPosition({ x, y });
                    setShowSigModal(true);
                  }}
                />
              </View>
            </View>
          ))}
        </ScrollView>
      </View>

      {/* Toolbar */}
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

      {/* Zoom Slider */}
      <div style={{
        position: 'fixed', bottom: 120, right: 30,
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
        background: 'rgba(22,22,22,0.9)', borderRadius: 16, padding: '12px 10px',
        border: '1px solid rgba(255,255,255,0.1)', backdropFilter: 'blur(10px)',
      }}>
        <ZoomIn size={16} color="#fff" />
        <input type="range" min="0.5" max="3" step="0.1" value={zoom}
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

/* ─── Annotation Overlay ─── */
function AnnotationOverlay({
  pageIndex, pageWidth, pageHeight, activeTool, annotations,
  addAnnotation, removeAnnotation, selectedAnnotationId, setSelectedAnnotation,
  penColor, penWidth, fontSize, user, onSignatureRequest,
}: any) {
  const overlayRef = useRef<HTMLDivElement>(null);

  // Drawing state
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawPoints, setDrawPoints] = useState<{ x: number; y: number }[]>([]);

  // Text input state
  const [textInput, setTextInput] = useState<{ x: number; y: number; value: string } | null>(null);

  // Comment input state
  const [commentInput, setCommentInput] = useState<{ x: number; y: number; value: string } | null>(null);

  const getPos = (e: React.MouseEvent) => {
    const rect = overlayRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: ((e.clientX - rect.left) / rect.width) * 100,
      y: ((e.clientY - rect.top) / rect.height) * 100,
    };
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    const pos = getPos(e);

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

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDrawing) return;
    const pos = getPos(e);
    setDrawPoints(prev => [...prev, pos]);
  };

  const handleMouseUp = () => {
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
      addAnnotation({
        id: nextId(),
        type: 'TEXT',
        pageIndex,
        data: { x: textInput.x, y: textInput.y, text: textInput.value, fontSize, color: penColor },
      });
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

  const pointsToSvgPath = (pts: { x: number; y: number }[]) => {
    if (pts.length < 2) return '';
    return pts.map((p, i) =>
      `${i === 0 ? 'M' : 'L'} ${(p.x / 100) * pageWidth} ${(p.y / 100) * pageHeight}`
    ).join(' ');
  };

  return (
    <div
      ref={overlayRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      style={{
        position: 'absolute', inset: 0,
        cursor: activeTool === 'SELECT' ? 'default'
          : activeTool === 'DRAW' ? 'crosshair'
          : activeTool === 'TEXT' ? 'text'
          : 'pointer',
        zIndex: 10,
      }}
    >
      {/* Render existing annotations */}
      {annotations.map((ann: any) => (
        <RenderedAnnotation
          key={ann.id}
          annotation={ann}
          pageWidth={pageWidth}
          pageHeight={pageHeight}
          isSelected={selectedAnnotationId === ann.id}
          onSelect={() => {
            if (activeTool === 'SELECT') setSelectedAnnotation(ann.id);
          }}
          onDelete={() => removeAnnotation(ann.id)}
        />
      ))}

      {/* Active drawing stroke */}
      {isDrawing && drawPoints.length > 1 && (
        <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
          <path
            d={pointsToSvgPath(drawPoints)}
            stroke={penColor}
            strokeWidth={penWidth}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}

      {/* Inline text input */}
      {textInput && (
        <div style={{
          position: 'absolute',
          left: `${textInput.x}%`, top: `${textInput.y}%`,
          transform: 'translate(-4px, -4px)',
        }}>
          <input
            autoFocus
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
              fontFamily: 'inherit',
            }}
          />
        </div>
      )}

      {/* Inline comment input */}
      {commentInput && (
        <div style={{
          position: 'absolute',
          left: `${commentInput.x}%`, top: `${commentInput.y}%`,
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

/* ─── Rendered Annotation ─── */
function RenderedAnnotation({ annotation, pageWidth, pageHeight, isSelected, onSelect, onDelete }: any) {
  const { data, type } = annotation;
  const baseStyle: React.CSSProperties = {
    position: 'absolute',
    left: `${data.x}%`,
    top: `${data.y}%`,
    cursor: 'pointer',
  };

  if (type === 'TEXT') {
    return (
      <div
        onClick={(e) => { e.stopPropagation(); onSelect(); }}
        style={{
          ...baseStyle,
          color: data.color || '#000',
          fontSize: data.fontSize || 16,
          fontWeight: 500,
          userSelect: 'none',
          padding: '2px 4px',
          outline: isSelected ? '2px solid #6366f1' : 'none',
          borderRadius: 3,
          background: isSelected ? 'rgba(99,102,241,0.1)' : 'transparent',
        }}
      >
        {data.text}
        {isSelected && <DeleteBadge onDelete={onDelete} />}
      </div>
    );
  }

  if (type === 'DRAW') {
    const pts = data.points || [];
    if (pts.length < 2) return null;
    const pathD = pts.map((p: any, i: number) =>
      `${i === 0 ? 'M' : 'L'} ${(p.x / 100) * pageWidth} ${(p.y / 100) * pageHeight}`
    ).join(' ');
    return (
      <svg
        onClick={(e) => { e.stopPropagation(); onSelect(); }}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'all' }}
      >
        {isSelected && (
          <path d={pathD} stroke="rgba(99,102,241,0.4)" strokeWidth={(data.strokeWidth || 2) + 8} fill="none" />
        )}
        <path
          d={pathD}
          stroke={data.color || '#000'}
          strokeWidth={data.strokeWidth || 2}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  if (type === 'SIGNATURE') {
    return (
      <div
        onClick={(e) => { e.stopPropagation(); onSelect(); }}
        style={{
          ...baseStyle,
          outline: isSelected ? '2px solid #6366f1' : 'none',
          borderRadius: 4,
        }}
      >
        <img
          src={data.imageDataUrl}
          alt="Signature"
          style={{ width: data.width || 200, height: data.height || 80, pointerEvents: 'none' }}
          draggable={false}
        />
        {isSelected && <DeleteBadge onDelete={onDelete} />}
      </div>
    );
  }

  if (type === 'COMMENT') {
    return <CommentPin data={data} isSelected={isSelected} onSelect={onSelect} onDelete={onDelete} />;
  }

  return null;
}

/* ─── Comment Pin ─── */
function CommentPin({ data, isSelected, onSelect, onDelete }: any) {
  const [hovered, setHovered] = useState(false);
  const show = isSelected || hovered;

  return (
    <div
      style={{ position: 'absolute', left: `${data.x}%`, top: `${data.y}%`, transform: 'translate(-12px, -12px)', zIndex: 15 }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Pin */}
      <div
        onClick={(e) => { e.stopPropagation(); onSelect(); }}
        style={{
          width: 28, height: 28,
          borderRadius: 14,
          background: isSelected ? '#6366f1' : '#f59e0b',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer',
          boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
          border: '2px solid #fff',
          transition: 'transform 0.15s',
          transform: show ? 'scale(1.15)' : 'scale(1)',
        }}
      >
        <span style={{ color: '#fff', fontSize: 14, fontWeight: 'bold' }}>💬</span>
      </div>

      {/* Popover */}
      {show && (
        <div style={{
          position: 'absolute', left: 36, top: -8,
          background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.15)',
          borderRadius: 10, padding: 12, width: 200,
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          zIndex: 20,
        }}>
          <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10, fontWeight: 'bold', marginBottom: 4 }}>
            {data.author || 'Anonymous'}
          </div>
          <div style={{ color: '#fff', fontSize: 13, lineHeight: '1.4' }}>
            {data.text}
          </div>
          {isSelected && (
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              style={{
                marginTop: 8, background: 'rgba(239,68,68,0.2)',
                border: '1px solid rgba(239,68,68,0.4)', borderRadius: 6,
                padding: '3px 10px', color: '#ef4444', cursor: 'pointer',
                fontSize: 11, fontWeight: 'bold',
              }}
            >Delete</button>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Delete Badge ─── */
function DeleteBadge({ onDelete }: { onDelete: () => void }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onDelete(); }}
      style={{
        position: 'absolute', top: -10, right: -10,
        width: 22, height: 22, borderRadius: 11,
        background: '#ef4444', border: '2px solid #fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer', padding: 0,
        boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
      }}
    >
      <span style={{ color: '#fff', fontSize: 12, lineHeight: 1 }}>×</span>
    </button>
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

  React.useEffect(() => {
    if (!pdf || !canvasRef.current) return;
    let cancelled = false;

    const renderPage = async () => {
      try {
        const page = await pdf.getPage(pageIndex + 1);
        if (cancelled) return;
        const canvas = canvasRef.current;
        if (!canvas) return;

        const viewport = page.getViewport({ scale: 1 });
        const scaleX = containerWidth / viewport.width;
        const scaleY = containerHeight / viewport.height;
        const scale = Math.min(scaleX, scaleY);
        const scaledViewport = page.getViewport({ scale });

        canvas.width = scaledViewport.width;
        canvas.height = scaledViewport.height;
        canvas.style.width = `${scaledViewport.width}px`;
        canvas.style.height = `${scaledViewport.height}px`;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        await page.render({ canvasContext: ctx, viewport: scaledViewport }).promise;
      } catch (err) {
        console.error(`Error rendering page ${pageIndex + 1}:`, err);
      }
    };

    renderPage();
    return () => { cancelled = true; };
  }, [pdf, pageIndex, containerWidth, containerHeight]);

  return (
    <div style={{
      width: '100%', height: '100%',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      backgroundColor: '#fff', overflow: 'hidden',
    }}>
      <canvas ref={canvasRef} />
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
    maxWidth: width * 0.4,
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
