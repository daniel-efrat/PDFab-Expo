import React, { Fragment, memo, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Keyboard,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  type LayoutChangeEvent,
  type ScrollView as RNScrollView,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Check, ChevronLeft, Download, FileText, Highlighter, MessageSquare, MousePointer2, PenTool, Trash2, Type, Undo2, Redo2, ZoomIn, ZoomOut } from 'lucide-react-native';
import { PDFDocument as PDFLib } from 'pdf-lib';
import { doc, updateDoc } from 'firebase/firestore';
import Pdf from 'react-native-pdf';
import { Canvas, Circle, Path as SkiaPath, Rect as SkiaRect, Skia, Text as SkiaText, matchFont } from '@shopify/react-native-skia';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { db } from '../firebase';
import { savePdf } from '../lib/savePdf';
import { useStore } from '../store/useStore';
import type { Annotation, PDFDocument } from '../types';
import { SafeAreaView } from 'react-native-safe-area-context';

const { width, height } = Dimensions.get('window');
const INACTIVE_PEN_COLOR = '';
const INACTIVE_PEN_WIDTH = 0;

interface EditorProps {
  setView: (view: any) => void;
}

type DraftInput = {
  kind: 'TEXT' | 'COMMENT';
  pageIndex: number;
  x: number;
  y: number;
  value: string;
};

const nextId = () => `ann_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const TEXT_COLORS = ['#ffffff', '#111111', '#4b5563', '#fca5a5', '#fb7185', '#ef4444', '#dc2626', '#ec6400', '#f59e0b', '#2563eb', '#7c3aed', '#c084fc'];
const FONT_OPTIONS = ['Inter', 'Archivo Black', 'Georgia', 'Helvetica', 'Courier New', 'Times New Roman', 'Verdana'];
const EMPTY_POINTS: Array<{ x: number; y: number }> = [];
const MIN_STROKE_POINT_DISTANCE = 0.35;
const TEXT_ASCENT_RATIO = 0.78;
const TEXT_DESCENT_RATIO = 0.06;
const PAGE_RENDER_WINDOW = 1;
const PAGE_STACK_GAP = 18;
const SKIA_FONT_FAMILY_MAP: Record<string, string> = {
  Inter: 'Helvetica',
  'Archivo Black': 'Helvetica',
  Helvetica: 'Helvetica',
  Georgia: 'Georgia',
  'Courier New': 'Courier',
  'Times New Roman': 'Times New Roman',
  Verdana: 'Verdana',
  System: 'Helvetica',
};
const TEXT_WIDTH_RATIO_MAP: Record<string, number> = {
  Inter: 0.58,
  'Archivo Black': 0.62,
  Helvetica: 0.58,
  Georgia: 0.64,
  'Courier New': 0.62,
  'Times New Roman': 0.62,
  Verdana: 0.6,
  System: 0.58,
};
const TEXT_WIDTH_BUFFER_MAP: Record<string, number> = {
  Inter: 2,
  'Archivo Black': 4,
  Helvetica: 2,
  Georgia: 6,
  'Courier New': 6,
  'Times New Roman': 6,
  Verdana: 4,
  System: 2,
};
const HIGHLIGHT_OPACITY = 0.35;
const HIGHLIGHT_DEFAULT_COLOR = '#facc15';
const HIGHLIGHT_DEFAULT_WIDTH = 10;
const HIGHLIGHT_COLORS = [
  TEXT_COLORS[0],
  TEXT_COLORS[1],
  HIGHLIGHT_DEFAULT_COLOR,
  ...TEXT_COLORS.slice(2),
];
const MIN_HIGHLIGHT_WIDTH = 6;
const MAX_HIGHLIGHT_WIDTH = 24;
const MIN_ZOOM = 0.7;
const MAX_ZOOM = 2.5;
const AUTOSAVE_DEBOUNCE_MS = 600;

function stripUndefinedDeep<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => stripUndefinedDeep(item)) as T;
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entryValue]) => entryValue !== undefined)
      .map(([key, entryValue]) => [key, stripUndefinedDeep(entryValue)]);
    return Object.fromEntries(entries) as T;
  }

  return value;
}

export default function EditorNative({ setView }: EditorProps) {
  const user = useStore((state) => state.user);
  const currentDocument = useStore((state) => state.currentDocument);
  const activeTool = useStore((state) => state.activeTool);
  const setActiveTool = useStore((state) => state.setActiveTool);
  const annotations = useStore((state) => state.annotations);
  const addAnnotation = useStore((state) => state.addAnnotation);
  const updateAnnotation = useStore((state) => state.updateAnnotation);
  const removeAnnotation = useStore((state) => state.removeAnnotation);
  const undo = useStore((state) => state.undo);
  const redo = useStore((state) => state.redo);
  const canUndo = useStore((state) => state.canUndo);
  const canRedo = useStore((state) => state.canRedo);
  const penColor = useStore((state) => state.penColor);
  const setPenColor = useStore((state) => state.setPenColor);
  const penWidth = useStore((state) => state.penWidth);
  const setPenWidth = useStore((state) => state.setPenWidth);
  const fontFamily = useStore((state) => state.fontFamily);
  const setFontFamily = useStore((state) => state.setFontFamily);
  const fontSize = useStore((state) => state.fontSize);
  const setFontSize = useStore((state) => state.setFontSize);
  const selectedAnnotationId = useStore((state) => state.selectedAnnotationId);
  const setSelectedAnnotation = useStore((state) => state.setSelectedAnnotation);

  const basePageWidth = width * 0.9;
  const [currentPage, setCurrentPage] = useState(0);
  const [resolvedPageCount, setResolvedPageCount] = useState(Math.max(currentDocument?.totalPages || 1, 1));
  const [loadingPdf, setLoadingPdf] = useState(true);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [surfaceSize, setSurfaceSize] = useState({ width: basePageWidth, height: basePageWidth * 1.414 });
  const [editorViewportSize, setEditorViewportSize] = useState({ width, height: height * 0.6 });
  const [drawPoints, setDrawPoints] = useState<Array<{ x: number; y: number }>>([]);
  const [draftInput, setDraftInput] = useState<DraftInput | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [commentViewer, setCommentViewer] = useState<Annotation | null>(null);
  const [editingTextAnnotationId, setEditingTextAnnotationId] = useState<string | null>(null);

  const drawPointsRef = useRef<Array<{ x: number; y: number }>>([]);
  const pendingDrawPointsRef = useRef<Array<{ x: number; y: number }> | null>(null);
  const drawPreviewFrameRef = useRef<number | null>(null);
  const currentPageRef = useRef(0);
  const previousToolRef = useRef(activeTool);
  const verticalScrollRef = useRef<RNScrollView | null>(null);
  const horizontalScrollRef = useRef<RNScrollView | null>(null);
  const verticalScrollOffsetRef = useRef(0);
  const horizontalScrollOffsetRef = useRef(0);
  const pinchStartZoomRef = useRef(zoom);
  const autosaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedSnapshotRef = useRef('');

  const scheduleDrawPreview = (points: Array<{ x: number; y: number }>) => {
    pendingDrawPointsRef.current = points;

    if (drawPreviewFrameRef.current !== null) {
      return;
    }

    drawPreviewFrameRef.current = requestAnimationFrame(() => {
      drawPreviewFrameRef.current = null;
      setDrawPoints(pendingDrawPointsRef.current || []);
    });
  };

  const flushDrawPreview = (points: Array<{ x: number; y: number }>) => {
    if (drawPreviewFrameRef.current !== null) {
      cancelAnimationFrame(drawPreviewFrameRef.current);
      drawPreviewFrameRef.current = null;
    }

    pendingDrawPointsRef.current = points;
    setDrawPoints(points);
  };

  useEffect(() => {
    setCurrentPage(0);
    currentPageRef.current = 0;
    setResolvedPageCount(Math.max(currentDocument?.totalPages || 1, 1));
    setLoadingPdf(true);
    setPdfError(null);
    setZoom(1);
    setDrawPoints([]);
    setDraftInput(null);
    setInputValue('');
    setEditingTextAnnotationId(null);
    drawPointsRef.current = [];
    pendingDrawPointsRef.current = null;
    if (drawPreviewFrameRef.current !== null) {
      cancelAnimationFrame(drawPreviewFrameRef.current);
      drawPreviewFrameRef.current = null;
    }
  }, [currentDocument?.id, currentDocument?.totalPages]);

  useEffect(() => {
    lastSavedSnapshotRef.current = JSON.stringify(annotations);
  }, [currentDocument?.id]);

  useEffect(() => () => {
    if (drawPreviewFrameRef.current !== null) {
      cancelAnimationFrame(drawPreviewFrameRef.current);
    }
    if (autosaveTimeoutRef.current !== null) {
      clearTimeout(autosaveTimeoutRef.current);
    }
  }, []);

  useEffect(() => {
    if (activeTool === 'HIGHLIGHT' && previousToolRef.current !== 'HIGHLIGHT') {
      setPenColor(HIGHLIGHT_DEFAULT_COLOR);
      setPenWidth(HIGHLIGHT_DEFAULT_WIDTH);
    }
    previousToolRef.current = activeTool;
  }, [activeTool, setPenColor, setPenWidth]);

  useEffect(() => {
    if (activeTool !== 'SELECT' && selectedAnnotationId) {
      setSelectedAnnotation(null);
    }
  }, [activeTool, selectedAnnotationId, setSelectedAnnotation]);

  const pageCount = Math.max(resolvedPageCount || currentDocument?.totalPages || 1, 1);
  const renderPageWidth = surfaceSize.width * zoom;
  const renderPageHeight = surfaceSize.height * zoom;
  const annotationsByPage = useMemo(() => {
    const grouped = new Map<number, Annotation[]>();
    for (const annotation of annotations) {
      const bucket = grouped.get(annotation.pageIndex);
      if (bucket) {
        bucket.push(annotation);
      } else {
        grouped.set(annotation.pageIndex, [annotation]);
      }
    }
    return grouped;
  }, [annotations]);

  const pageAnnotations = useMemo(
    () => annotationsByPage.get(currentPage) || [],
    [annotationsByPage, currentPage]
  );
  const selectedAnnotationGlobal = useMemo(
    () => annotations.find((annotation) => annotation.id === selectedAnnotationId) || null,
    [annotations, selectedAnnotationId]
  );
  const selectedAnnotation = pageAnnotations.find((annotation) => annotation.id === selectedAnnotationId) || null;
  const selectedTextAnnotation = selectedAnnotation?.type === 'TEXT' ? selectedAnnotation : null;
  const selectedHighlightAnnotation = selectedAnnotation?.type === 'HIGHLIGHT' ? selectedAnnotation : null;
  const isTextDrafting = draftInput?.kind === 'TEXT';
  const showTextControls = activeTool === 'TEXT' || !!selectedTextAnnotation || isTextDrafting;
  const showHighlightControls = activeTool === 'HIGHLIGHT' || !!selectedHighlightAnnotation;
  const showSelectionControls =
    !!selectedAnnotation &&
    activeTool === 'SELECT' &&
    !selectedTextAnnotation &&
    !selectedHighlightAnnotation;
  const isSelectTool = activeTool === 'SELECT';
  const isTextTool = activeTool === 'TEXT';
  const isHighlightTool = activeTool === 'HIGHLIGHT';
  const isDrawTool = activeTool === 'DRAW';
  const isCommentTool = activeTool === 'COMMENT';
  const activeTextColor = selectedTextAnnotation?.data?.color || penColor;
  const activeTextFont = selectedTextAnnotation?.data?.fontFamily || fontFamily;
  const activeTextSize = selectedTextAnnotation?.data?.fontSize || fontSize;
  const activeHighlightColor = selectedHighlightAnnotation?.data?.color || penColor;
  const activeHighlightStrokeWidth = selectedHighlightAnnotation?.data?.strokeWidth || penWidth;

  const persistAnnotations = async (nextAnnotations: Annotation[]) => {
    if (!currentDocument || !user) return;
    setSaving(true);
    try {
      const sanitizedAnnotations = stripUndefinedDeep(nextAnnotations);
      await updateDoc(doc(db, 'documents', currentDocument.id), {
        annotations: sanitizedAnnotations,
        updatedAt: new Date().toISOString(),
      });
      lastSavedSnapshotRef.current = JSON.stringify(sanitizedAnnotations);
    } catch (err) {
      console.error('Save error:', err);
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (!currentDocument || !user) return;

    const snapshot = JSON.stringify(annotations);
    if (snapshot === lastSavedSnapshotRef.current) {
      return;
    }

    if (autosaveTimeoutRef.current !== null) {
      clearTimeout(autosaveTimeoutRef.current);
    }

    autosaveTimeoutRef.current = setTimeout(() => {
      persistAnnotations(annotations);
    }, AUTOSAVE_DEBOUNCE_MS);

    return () => {
      if (autosaveTimeoutRef.current !== null) {
        clearTimeout(autosaveTimeoutRef.current);
        autosaveTimeoutRef.current = null;
      }
    };
  }, [annotations, currentDocument, user]);

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

  const clampPoint = (locationX: number, locationY: number) => ({
    x: Math.max(0, Math.min(100, (locationX / Math.max(surfaceSize.width, 1)) * 100)),
    y: Math.max(0, Math.min(100, (locationY / Math.max(surfaceSize.height, 1)) * 100)),
  });

  const beginCanvasGesture = (locationX: number, locationY: number) => {
    const point = clampPoint(locationX, locationY);

    if (activeTool === 'TEXT' || activeTool === 'COMMENT') {
      setDraftInput({ kind: activeTool, pageIndex: currentPage, x: point.x, y: point.y, value: '' });
      setInputValue('');
      return;
    }

    if (activeTool === 'DRAW' || activeTool === 'HIGHLIGHT') {
      drawPointsRef.current = [point];
      flushDrawPreview([point]);
    }
  };

  const updateCanvasGesture = (locationX: number, locationY: number) => {
    if (activeTool !== 'DRAW' && activeTool !== 'HIGHLIGHT') return;
    const point = clampPoint(locationX, locationY);
    const constrainedPoint =
      activeTool === 'HIGHLIGHT' && drawPointsRef.current.length > 0
        ? {
            ...point,
            y: drawPointsRef.current[0].y,
          }
        : point;
    const lastPoint = drawPointsRef.current[drawPointsRef.current.length - 1];
    if (lastPoint && getPointDistance(lastPoint, constrainedPoint) < MIN_STROKE_POINT_DISTANCE) {
      return;
    }
    const next = [...drawPointsRef.current, constrainedPoint];
    drawPointsRef.current = next;
    scheduleDrawPreview(next);
  };

  const endCanvasGesture = () => {
    const finalizedPoints = simplifyStrokePoints(drawPointsRef.current);

    if ((activeTool === 'DRAW' || activeTool === 'HIGHLIGHT') && finalizedPoints.length > 1) {
      addAnnotation({
        id: nextId(),
        type: activeTool,
        pageIndex: currentPage,
        data: {
          points: finalizedPoints,
          color: activeTool === 'HIGHLIGHT' ? toHighlightColor(penColor) : penColor,
          strokeWidth: activeTool === 'HIGHLIGHT' ? penWidth : Math.max(2, penWidth * 0.35),
        },
      });
      setSelectedAnnotation(null);
      if (activeTool === 'DRAW') {
        setActiveTool('SELECT');
      }
    }
    drawPointsRef.current = [];
    flushDrawPreview([]);
  };

  const beginTextAnnotationEdit = (annotation: Annotation) => {
    if (annotation.type !== 'TEXT') return;
    setSelectedAnnotation(annotation.id);
    setEditingTextAnnotationId(annotation.id);
    setDraftInput({
      kind: 'TEXT',
      pageIndex: annotation.pageIndex,
      x: annotation.data?.x || 0,
      y: annotation.data?.y || 0,
      value: annotation.data?.text || '',
    });
    setInputValue(annotation.data?.text || '');
  };

  const commitDraftInput = () => {
    if (!draftInput) return;
    const value = inputValue.trim();
    if (editingTextAnnotationId) {
      if (value) {
        updateAnnotation(editingTextAnnotationId, {
          data: {
            ...annotations.find((annotation) => annotation.id === editingTextAnnotationId)?.data,
            text: value,
          },
        });
        setSelectedAnnotation(editingTextAnnotationId);
      }
      Keyboard.dismiss();
      setDraftInput(null);
      setInputValue('');
      setEditingTextAnnotationId(null);
      return;
    }

    if (value) {
      const annotation = stripUndefinedDeep({
        id: nextId(),
        type: draftInput.kind,
        pageIndex: draftInput.pageIndex,
        data: {
          x: draftInput.x,
          y: draftInput.y,
          text: value,
          color: draftInput.kind === 'TEXT' ? penColor : undefined,
          fontSize: draftInput.kind === 'TEXT' ? fontSize : undefined,
          fontFamily: draftInput.kind === 'TEXT' ? fontFamily : undefined,
          author: draftInput.kind === 'COMMENT' ? (user?.displayName || user?.email || 'You') : undefined,
        },
      } satisfies Annotation);
      addAnnotation(annotation);
      setSelectedAnnotation(annotation.id);
      setActiveTool('SELECT');
      if (annotation.type === 'COMMENT') {
        setCommentViewer(annotation);
      }
    }
    Keyboard.dismiss();
    setDraftInput(null);
    setInputValue('');
    setEditingTextAnnotationId(null);
  };

  const cancelDraftInput = () => {
    Keyboard.dismiss();
    setDraftInput(null);
    setInputValue('');
    setEditingTextAnnotationId(null);
  };

  const canvasGesture = useMemo(() => {
    if (activeTool === 'TEXT' || activeTool === 'COMMENT') {
      return Gesture.Tap()
        .runOnJS(true)
        .onEnd((event) => {
          beginCanvasGesture(event.x, event.y);
        });
    }

    if (activeTool === 'DRAW' || activeTool === 'HIGHLIGHT') {
      return Gesture.Pan()
        .runOnJS(true)
        .onBegin((event) => {
          beginCanvasGesture(event.x, event.y);
        })
        .onUpdate((event) => {
          updateCanvasGesture(event.x, event.y);
        })
        .onEnd(() => {
          endCanvasGesture();
        })
        .onFinalize(() => {
          if (drawPointsRef.current.length > 0) {
            endCanvasGesture();
          }
        });
    }

    return Gesture.Tap().enabled(false);
  }, [activeTool, currentPage, penColor, penWidth, surfaceSize.height, surfaceSize.width]);

  const updateSelectedTextStyle = (data: Partial<Annotation['data']>) => {
    if (!selectedTextAnnotation) return;
    updateAnnotation(selectedTextAnnotation.id, {
      data: {
        ...selectedTextAnnotation.data,
        ...data,
      },
    });
  };

  const applyTextStyleUpdate = (data: Partial<Annotation['data']>) => {
    if (typeof data.color === 'string') setPenColor(data.color);
    if (typeof data.fontFamily === 'string') setFontFamily(data.fontFamily);
    if (typeof data.fontSize === 'number') setFontSize(data.fontSize);
    if (selectedTextAnnotation) updateSelectedTextStyle(data);
  };

  const nudgeSelectedAnnotation = (deltaX: number, deltaY: number) => {
    if (!selectedAnnotation) return;
    const nextX = Math.max(0, Math.min(100, (selectedAnnotation.data?.x || 0) + deltaX));
    const nextY = Math.max(0, Math.min(100, (selectedAnnotation.data?.y || 0) + deltaY));
    updateAnnotation(selectedAnnotation.id, {
      data: {
        ...selectedAnnotation.data,
        x: nextX,
        y: nextY,
      },
    });
  };

  const syncCurrentPageFromOffset = (offsetY: number) => {
    const pagePitch = renderPageHeight + PAGE_STACK_GAP;
    const estimatedPage = Math.round(offsetY / Math.max(pagePitch, 1));
    const nextPage = Math.max(0, Math.min(pageCount - 1, estimatedPage));
    if (nextPage !== currentPageRef.current) {
      currentPageRef.current = nextPage;
      setCurrentPage(nextPage);
    }
  };

  const getSelectionFocusPoint = (annotation: Annotation) => {
    if (annotation.type === 'TEXT' || annotation.type === 'COMMENT') {
      return {
        x: annotation.data?.x || 0,
        y: annotation.data?.y || 0,
        pageIndex: annotation.pageIndex,
      };
    }

    if (annotation.type === 'HIGHLIGHT' || annotation.type === 'DRAW') {
      const bounds = getPointsBounds(annotation.data?.points || []);
      return {
        x: bounds.minX + bounds.width / 2,
        y: bounds.minY + bounds.height / 2,
        pageIndex: annotation.pageIndex,
      };
    }

    return null;
  };

  const getViewportCenterFocusPoint = () => {
    const currentRenderPageWidth = surfaceSize.width * zoom;
    const currentRenderPageHeight = surfaceSize.height * zoom;
    const horizontalContentWidth = Math.max(editorViewportSize.width, currentRenderPageWidth + 40);
    const pageLeft = Math.max((horizontalContentWidth - currentRenderPageWidth) / 2, 20);
    const centerX = horizontalScrollOffsetRef.current + editorViewportSize.width / 2;
    const centerY = verticalScrollOffsetRef.current + editorViewportSize.height / 2;
    const pagePitch = currentRenderPageHeight + PAGE_STACK_GAP;
    const estimatedPage = Math.round((centerY - 8 - currentRenderPageHeight / 2) / Math.max(pagePitch, 1));
    const pageIndex = Math.max(0, Math.min(pageCount - 1, estimatedPage));
    const pageTop = 8 + pageIndex * pagePitch;

    return {
      x: Math.max(0, Math.min(100, ((centerX - pageLeft) / Math.max(currentRenderPageWidth, 1)) * 100)),
      y: Math.max(0, Math.min(100, ((centerY - pageTop) / Math.max(currentRenderPageHeight, 1)) * 100)),
      pageIndex,
    };
  };

  const applyZoom = (nextZoom: number) => {
    const normalizedZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Number(nextZoom.toFixed(2))));
    const focus = selectedAnnotationGlobal
      ? getSelectionFocusPoint(selectedAnnotationGlobal)
      : getViewportCenterFocusPoint();

    setZoom(normalizedZoom);

    if (!focus) {
      return;
    }

    requestAnimationFrame(() => {
      const nextRenderPageWidth = surfaceSize.width * normalizedZoom;
      const nextRenderPageHeight = surfaceSize.height * normalizedZoom;
      const horizontalContentWidth = Math.max(editorViewportSize.width, nextRenderPageWidth + 40);
      const pageLeft = Math.max((horizontalContentWidth - nextRenderPageWidth) / 2, 20);
      const targetX = Math.max(
        0,
        pageLeft + (focus.x / 100) * nextRenderPageWidth - editorViewportSize.width / 2
      );
      const pageTop = 8 + focus.pageIndex * (nextRenderPageHeight + PAGE_STACK_GAP);
      const targetY = Math.max(
        0,
        pageTop + (focus.y / 100) * nextRenderPageHeight - editorViewportSize.height / 2
      );

      horizontalScrollRef.current?.scrollTo({ x: targetX, animated: false });
      verticalScrollRef.current?.scrollTo({ y: targetY, animated: false });
    });
  };

  const pinchGesture = useMemo(
    () =>
      Gesture.Pinch()
        .runOnJS(true)
        .onBegin(() => {
          pinchStartZoomRef.current = zoom;
        })
        .onUpdate((event) => {
          applyZoom(pinchStartZoomRef.current * event.scale);
        }),
    [applyZoom, zoom]
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <TouchableOpacity onPress={() => setView('dashboard')} style={styles.backButton}>
            <ChevronLeft size={24} color="#fff" />
          </TouchableOpacity>
          <View>
            <Text style={styles.title} numberOfLines={1}>{currentDocument?.title}</Text>
          </View>
        </View>

        <View style={styles.headerActions}>
          <TouchableOpacity onPress={undo} disabled={!canUndo} style={[styles.actionBtn, !canUndo && styles.disabledBtn]}>
            <Undo2 size={20} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity onPress={redo} disabled={!canRedo} style={[styles.actionBtn, !canRedo && styles.disabledBtn]}>
            <Redo2 size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.zoomBar}>
        <TouchableOpacity style={styles.zoomBtn} onPress={() => applyZoom(zoom - 0.15)}>
          <ZoomOut size={16} color="#fff" />
        </TouchableOpacity>
        <ZoomSlider value={zoom} onChange={applyZoom} />
        <TouchableOpacity style={styles.zoomBtn} onPress={() => applyZoom(zoom + 0.15)}>
          <ZoomIn size={16} color="#fff" />
        </TouchableOpacity>
      </View>

      {showSelectionControls && (
        <View style={styles.contextBar}>
          <Text style={styles.contextTitle}>Selected {selectedAnnotation.type}</Text>
          <View style={styles.contextRow}>
            <TouchableOpacity style={styles.miniBtn} onPress={() => nudgeSelectedAnnotation(-2, 0)}>
              <Text style={styles.miniBtnText}>Left</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.miniBtn} onPress={() => nudgeSelectedAnnotation(2, 0)}>
              <Text style={styles.miniBtnText}>Right</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.miniBtn} onPress={() => nudgeSelectedAnnotation(0, -2)}>
              <Text style={styles.miniBtnText}>Up</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.miniBtn} onPress={() => nudgeSelectedAnnotation(0, 2)}>
              <Text style={styles.miniBtnText}>Down</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.deleteBtn} onPress={() => {
              removeAnnotation(selectedAnnotation.id);
              setSelectedAnnotation(null);
            }}>
              <Text style={styles.deleteBtnText}>Delete</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      <GestureDetector gesture={pinchGesture}>
        <View
          style={styles.editorArea}
          onLayout={(event) => {
            setEditorViewportSize({
              width: event.nativeEvent.layout.width,
              height: event.nativeEvent.layout.height,
            });
          }}
        >
          <ScrollView
            ref={verticalScrollRef}
            contentContainerStyle={styles.editorScrollContent}
            showsVerticalScrollIndicator={false}
            showsHorizontalScrollIndicator={false}
            scrollEventThrottle={64}
            onScroll={(event) => {
              verticalScrollOffsetRef.current = event.nativeEvent.contentOffset.y;
            }}
            onMomentumScrollEnd={(event) => {
              verticalScrollOffsetRef.current = event.nativeEvent.contentOffset.y;
              syncCurrentPageFromOffset(event.nativeEvent.contentOffset.y);
            }}
            onScrollEndDrag={(event) => {
              verticalScrollOffsetRef.current = event.nativeEvent.contentOffset.y;
              syncCurrentPageFromOffset(event.nativeEvent.contentOffset.y);
            }}
          >
            <ScrollView
              ref={horizontalScrollRef}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.pageWrapper}
              onScroll={(event) => {
                horizontalScrollOffsetRef.current = event.nativeEvent.contentOffset.x;
              }}
              scrollEventThrottle={64}
            >
              <View style={styles.pageStack}>
                {Array.from({ length: pageCount }, (_, pageIndex) => {
                  const annotationsForPage = annotationsByPage.get(pageIndex) || [];
                  const isActivePage = pageIndex === currentPage;
                  const shouldRenderPage = Math.abs(pageIndex - currentPage) <= PAGE_RENDER_WINDOW;

                  return (
                    <PdfPageCard
                      key={`${currentDocument?.id || 'doc'}-page-${pageIndex}`}
                      pageIndex={pageIndex}
                      currentDocument={currentDocument}
                      shouldRenderPage={shouldRenderPage}
                      isActivePage={isActivePage}
                      renderPageWidth={renderPageWidth}
                      renderPageHeight={renderPageHeight}
                      surfaceWidth={surfaceSize.width}
                      surfaceHeight={surfaceSize.height}
                      zoom={zoom}
                      activeTool={activeTool}
                      canvasGesture={canvasGesture}
                      annotations={annotationsForPage}
                      selectedAnnotationId={selectedAnnotationId}
                      editingTextAnnotationId={editingTextAnnotationId}
                      drawPoints={isActivePage ? drawPoints : EMPTY_POINTS}
                      penColor={isActivePage ? penColor : INACTIVE_PEN_COLOR}
                      penWidth={isActivePage ? penWidth : INACTIVE_PEN_WIDTH}
                      activeTextColor={activeTextColor}
                      activeTextFont={activeTextFont}
                      activeTextSize={activeTextSize}
                      zoom={zoom}
                      isTextDrafting={isActivePage && isTextDrafting}
                      draftInput={isActivePage ? draftInput : null}
                      inputValue={inputValue}
                      loadingPdf={loadingPdf}
                      pdfError={pdfError}
                      basePageWidth={basePageWidth}
                      onPressPage={() => {
                        currentPageRef.current = pageIndex;
                        setCurrentPage(pageIndex);
                        if (activeTool === 'SELECT') {
                          setSelectedAnnotation(null);
                        }
                      }}
                      onPdfLoadComplete={(numberOfPages, size) => {
                        setResolvedPageCount(Math.max(numberOfPages, 1));
                        if (size?.width && size?.height) {
                          const nextHeight = basePageWidth * (size.height / size.width);
                          setSurfaceSize((previous) => {
                            if (Math.abs(previous.height - nextHeight) < 0.5 && Math.abs(previous.width - basePageWidth) < 0.5) {
                              return previous;
                            }
                            return { width: basePageWidth, height: nextHeight };
                          });
                        }
                        setLoadingPdf(false);
                        setPdfError(null);
                      }}
                      onPdfError={(error) => {
                        console.error('PDF render error:', error);
                        const message = error instanceof Error ? error.message : String(error);
                        setPdfError(message || 'Failed to render this PDF on native.');
                        setLoadingPdf(false);
                      }}
                      onChangeDraftInput={setInputValue}
                      onSubmitDraftInput={commitDraftInput}
                      onSelectAnnotation={(annotation) => {
                        setCurrentPage(pageIndex);
                        setSelectedAnnotation(annotation.id);
                        if (annotation.type === 'COMMENT') {
                          setCommentViewer(annotation);
                        }
                      }}
                      onUpdateAnnotation={updateAnnotation}
                      onRemoveAnnotation={(annotationId) => {
                        removeAnnotation(annotationId);
                        setSelectedAnnotation(null);
                      }}
                      onSetSelectedAnnotation={setSelectedAnnotation}
                      onBeginTextAnnotationEdit={beginTextAnnotationEdit}
                      onApplyTextFontSizeDelta={(delta) => {
                        applyTextStyleUpdate({
                          fontSize: Math.max(12, activeTextSize + delta),
                        });
                      }}
                    />
                  );
                })}
              </View>
            </ScrollView>
          </ScrollView>
        </View>
      </GestureDetector>

      <View style={styles.bottomPanel}>
        {showTextControls ? (
          <View style={styles.contextBarBottom}>
            {(isTextDrafting || !selectedTextAnnotation) && (
              <View style={styles.contextHeader}>
                <Text style={styles.contextTitle}>{isTextDrafting ? 'Enter Text' : 'Text Tool'}</Text>
                {isTextDrafting && (
                  <TouchableOpacity style={styles.doneBtn} onPress={commitDraftInput}>
                    <Check size={18} color="#000" />
                    <Text style={styles.doneBtnText}>Done</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.swatchRow}>
              {TEXT_COLORS.map((color) => (
                <TouchableOpacity
                  key={color}
                  style={[styles.colorSwatchLarge, { backgroundColor: color }, activeTextColor === color && styles.colorSwatchActive]}
                  onPress={() => applyTextStyleUpdate({ color })}
                />
              ))}
            </ScrollView>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.fontRow}>
              {FONT_OPTIONS.map((option) => (
                <TouchableOpacity
                  key={option}
                  style={[styles.fontChip, activeTextFont === option && styles.fontChipActive]}
                  onPress={() => applyTextStyleUpdate({ fontFamily: option })}
                >
                  <Text style={[styles.fontChipText, activeTextFont === option && styles.fontChipTextActive]} numberOfLines={1}>
                    {option}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

          </View>
        ) : showHighlightControls ? (
          <View style={styles.contextBarBottom}>
            <View style={styles.contextHeader}>
              <Text style={styles.contextTitle}>{selectedHighlightAnnotation ? 'Selected Highlight' : 'Highlight Tool'}</Text>
              <TouchableOpacity
                style={styles.doneBtn}
                onPress={() => {
                  setActiveTool('SELECT');
                  setSelectedAnnotation(null);
                }}
              >
                <Check size={18} color="#000" />
                <Text style={styles.doneBtnText}>Done</Text>
              </TouchableOpacity>
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.swatchRow}>
              {HIGHLIGHT_COLORS.map((color) => (
                <TouchableOpacity
                  key={color}
                  style={[
                    styles.colorSwatchLarge,
                    { backgroundColor: color },
                    activeHighlightColor === toHighlightColor(color) && styles.colorSwatchActive,
                  ]}
                  onPress={() => {
                    if (selectedHighlightAnnotation) {
                      updateAnnotation(selectedHighlightAnnotation.id, {
                        data: {
                          ...selectedHighlightAnnotation.data,
                          color: toHighlightColor(color),
                        },
                      });
                    } else {
                      setPenColor(color);
                    }
                  }}
                />
              ))}
            </ScrollView>

            <HighlightWidthSlider
              value={activeHighlightStrokeWidth}
              onChange={(nextWidth) => {
                if (selectedHighlightAnnotation) {
                  updateAnnotation(selectedHighlightAnnotation.id, {
                    data: {
                      ...selectedHighlightAnnotation.data,
                      strokeWidth: nextWidth,
                    },
                  });
                } else {
                  setPenWidth(nextWidth);
                }
              }}
            />
          </View>
        ) : (
          <View style={styles.toolbar}>
            <ToolButton icon={MousePointer2} active={isSelectTool} onPress={() => setActiveTool('SELECT')} />
            <ToolButton icon={Type} active={isTextTool} onPress={() => setActiveTool('TEXT')} />
            <ToolButton icon={Highlighter} active={isHighlightTool} onPress={() => setActiveTool('HIGHLIGHT')} />
            <ToolButton icon={PenTool} active={isDrawTool} onPress={() => setActiveTool('DRAW')} />
            <ToolButton icon={MessageSquare} active={isCommentTool} onPress={() => setActiveTool('COMMENT')} />
            <View style={styles.toolDivider} />
            <TouchableOpacity style={styles.exportBtn} onPress={handleExport}>
              <Download size={20} color="#000" />
            </TouchableOpacity>
          </View>
        )}
      </View>

      <Modal visible={draftInput?.kind === 'COMMENT'} transparent animationType="fade" onRequestClose={cancelDraftInput}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Add Comment</Text>
            <TextInput
              value={inputValue}
              onChangeText={setInputValue}
              placeholder="Enter comment"
              placeholderTextColor="rgba(255,255,255,0.35)"
              multiline
              autoFocus
              style={styles.modalInput}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalBtnGhost} onPress={cancelDraftInput}>
                <Text style={styles.modalBtnGhostText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalBtn} onPress={commitDraftInput}>
                <Text style={styles.modalBtnText}>Add</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={!!commentViewer} transparent animationType="fade" onRequestClose={() => setCommentViewer(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Comment</Text>
            <Text style={styles.commentAuthor}>{commentViewer?.data?.author || 'Anonymous'}</Text>
            <Text style={styles.commentBody}>{commentViewer?.data?.text || ''}</Text>
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalBtnGhost} onPress={() => setCommentViewer(null)}>
                <Text style={styles.modalBtnGhostText}>Close</Text>
              </TouchableOpacity>
              {commentViewer && (
                <TouchableOpacity style={styles.deleteBtn} onPress={() => {
                  removeAnnotation(commentViewer.id);
                  setCommentViewer(null);
                  setSelectedAnnotation(null);
                }}>
                  <Text style={styles.deleteBtnText}>Delete</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const PdfPageCard = memo(function PdfPageCard({
  pageIndex,
  currentDocument,
  shouldRenderPage,
  isActivePage,
  renderPageWidth,
  renderPageHeight,
  surfaceWidth,
  surfaceHeight,
  zoom,
  activeTool,
  canvasGesture,
  annotations,
  selectedAnnotationId,
  editingTextAnnotationId,
  drawPoints,
  penColor,
  penWidth,
  activeTextColor,
  activeTextFont,
  activeTextSize,
  isTextDrafting,
  draftInput,
  inputValue,
  loadingPdf,
  pdfError,
  basePageWidth,
  onPressPage,
  onPdfLoadComplete,
  onPdfError,
  onChangeDraftInput,
  onSubmitDraftInput,
  onSelectAnnotation,
  onUpdateAnnotation,
  onRemoveAnnotation,
  onSetSelectedAnnotation,
  onBeginTextAnnotationEdit,
  onApplyTextFontSizeDelta,
}: {
  pageIndex: number;
  currentDocument: PDFDocument | null;
  shouldRenderPage: boolean;
  isActivePage: boolean;
  renderPageWidth: number;
  renderPageHeight: number;
  surfaceWidth: number;
  surfaceHeight: number;
  zoom: number;
  activeTool: string;
  canvasGesture: any;
  annotations: Annotation[];
  selectedAnnotationId: string | null;
  editingTextAnnotationId: string | null;
  drawPoints: Array<{ x: number; y: number }>;
  penColor: string;
  penWidth: number;
  activeTextColor: string;
  activeTextFont: string;
  activeTextSize: number;
  isTextDrafting: boolean;
  draftInput: DraftInput | null;
  inputValue: string;
  loadingPdf: boolean;
  pdfError: string | null;
  basePageWidth: number;
  onPressPage: () => void;
  onPdfLoadComplete: (numberOfPages: number, size?: { width: number; height: number }) => void;
  onPdfError: (error: unknown) => void;
  onChangeDraftInput: (value: string) => void;
  onSubmitDraftInput: () => void;
  onSelectAnnotation: (annotation: Annotation) => void;
  onUpdateAnnotation: (id: string, data: Partial<Annotation>) => void;
  onRemoveAnnotation: (annotationId: string) => void;
  onSetSelectedAnnotation: (id: string | null) => void;
  onBeginTextAnnotationEdit: (annotation: Annotation) => void;
  onApplyTextFontSizeDelta: (delta: number) => void;
}) {
  return (
    <Pressable
      onPress={onPressPage}
      style={[styles.pdfPage, styles.zoomedPageFrame, { width: renderPageWidth, height: renderPageHeight }]}
    >
      <View
        style={[
          styles.pdfBaseLayer,
          {
            width: surfaceWidth,
            height: surfaceHeight,
            transform: [{ scale: zoom }],
          },
        ]}
      >
        <PdfPageSurface
          currentDocument={currentDocument}
          shouldRenderPage={shouldRenderPage}
          pageIndex={pageIndex}
          onPdfLoadComplete={onPdfLoadComplete}
          onPdfError={onPdfError}
        />

        <View
          pointerEvents={isActivePage ? (activeTool === 'SELECT' ? 'box-none' : 'auto') : 'box-none'}
          style={StyleSheet.absoluteFill}
        >
          {isActivePage && (
            <GestureDetector gesture={canvasGesture}>
              <View style={StyleSheet.absoluteFill} pointerEvents={activeTool === 'SELECT' ? 'none' : 'auto'} />
            </GestureDetector>
          )}
          <View style={styles.annotationScaleLayer} pointerEvents="box-none">
            <TextAnnotationsCanvas
              annotations={annotations}
              width={surfaceWidth}
              height={surfaceHeight}
              selectedAnnotationId={selectedAnnotationId}
            />
            <CommentAnnotationsCanvas
              annotations={annotations}
              width={surfaceWidth}
              height={surfaceHeight}
              selectedAnnotationId={selectedAnnotationId}
            />
            <VectorAnnotationsCanvas
              annotations={annotations}
              drawPoints={drawPoints}
              activeTool={activeTool}
              activeColor={penColor}
              activeStrokeWidth={penWidth}
              selectedAnnotationId={selectedAnnotationId}
              width={surfaceWidth}
              height={surfaceHeight}
            />
            {annotations.map((annotation) => (
              annotation.id === selectedAnnotationId && annotation.type === 'TEXT' ? (
                editingTextAnnotationId === annotation.id ? null : (
                <SelectedTextOverlay
                  key={annotation.id}
                  annotation={annotation}
                  width={surfaceWidth}
                  height={surfaceHeight}
                  zoom={zoom}
                  activeFontSize={activeTextSize}
                  onPress={() => onSetSelectedAnnotation(annotation.id)}
                  onDragEnd={(position) => {
                    onUpdateAnnotation(annotation.id, {
                      data: {
                        ...annotation.data,
                        ...position,
                      },
                    });
                  }}
                  onResize={(nextFontSize) => {
                    onUpdateAnnotation(annotation.id, {
                      data: {
                        ...annotation.data,
                        fontSize:
                          typeof nextFontSize === 'number'
                            ? nextFontSize
                            : annotation.data?.fontSize || activeTextSize,
                      },
                    });
                  }}
                  onDecrease={() => onApplyTextFontSizeDelta(-2)}
                  onIncrease={() => onApplyTextFontSizeDelta(2)}
                  onDelete={() => {
                    onRemoveAnnotation(annotation.id);
                  }}
                  onEdit={() => onBeginTextAnnotationEdit(annotation)}
                />
                )
              ) : annotation.id === selectedAnnotationId && annotation.type === 'HIGHLIGHT' ? (
                <SelectedHighlightOverlay
                  key={annotation.id}
                  annotation={annotation}
                  width={surfaceWidth}
                  height={surfaceHeight}
                  zoom={zoom}
                  onPress={() => onSetSelectedAnnotation(annotation.id)}
                  onDragEnd={(points) => {
                    onUpdateAnnotation(annotation.id, {
                      data: {
                        ...annotation.data,
                        points,
                      },
                    });
                  }}
                  onResize={({ points, strokeWidth }) => {
                    onUpdateAnnotation(annotation.id, {
                      data: {
                        ...annotation.data,
                        points,
                        strokeWidth,
                      },
                    });
                  }}
                  onDelete={() => {
                    onRemoveAnnotation(annotation.id);
                  }}
                />
              ) : (
                <AnnotationTouchItem
                  key={annotation.id}
                  annotation={annotation}
                  width={surfaceWidth}
                  height={surfaceHeight}
                  zoom={zoom}
                  selected={annotation.id === selectedAnnotationId}
                  selectable={activeTool === 'SELECT' && isActivePage}
                  onPress={() => onSelectAnnotation(annotation)}
                  onDragEnd={(position) => {
                    onUpdateAnnotation(annotation.id, {
                      data: {
                        ...annotation.data,
                        ...(annotation.type === 'HIGHLIGHT'
                          ? { points: 'points' in position ? position.points : annotation.data?.points || [] }
                          : position),
                      },
                    });
                  }}
                  onResize={(nextValue) => {
                    onUpdateAnnotation(annotation.id, {
                      data: {
                        ...annotation.data,
                        ...(annotation.type === 'HIGHLIGHT'
                          ? { points: typeof nextValue === 'object' && 'points' in nextValue ? nextValue.points : annotation.data?.points || [] }
                          : { fontSize: typeof nextValue === 'number' ? nextValue : annotation.data?.fontSize }),
                      },
                    });
                  }}
                />
              )
            ))}
          </View>
          {isTextDrafting && draftInput && (
            <View
              pointerEvents="box-none"
              style={[
                styles.inlineTextEditor,
                {
                  left: (draftInput.x / 100) * surfaceWidth,
                  top: (draftInput.y / 100) * surfaceHeight - activeTextSize,
                },
              ]}
            >
              <TextInput
                value={inputValue}
                onChangeText={onChangeDraftInput}
                placeholder="Enter your text"
                placeholderTextColor="rgba(255,255,255,0.5)"
                autoFocus
                blurOnSubmit
                returnKeyType="done"
                onSubmitEditing={onSubmitDraftInput}
                style={[
                  styles.inlineTextInput,
                  {
                    color: activeTextColor,
                    fontFamily: activeTextFont,
                    fontSize: activeTextSize,
                  },
                ]}
              />
            </View>
          )}
        </View>

        {(loadingPdf || pdfError) && isActivePage && (
          <View pointerEvents="none" style={styles.pdfStatusOverlay}>
            {pdfError ? (
              <>
                <FileText size={56} color="rgba(255,255,255,0.08)" />
                <Text style={styles.placeholderText}>PAGE {pageIndex + 1}</Text>
                <Text style={styles.nativeHint}>{pdfError}</Text>
              </>
            ) : (
              <>
                <ActivityIndicator size="large" color="#fff" />
                <Text style={styles.nativeHint}>Loading native preview...</Text>
              </>
            )}
          </View>
        )}
      </View>
    </Pressable>
  );
}, (previous, next) => (
  previous.currentDocument?.id === next.currentDocument?.id &&
  previous.currentDocument?.fileUrl === next.currentDocument?.fileUrl &&
  previous.shouldRenderPage === next.shouldRenderPage &&
  previous.isActivePage === next.isActivePage &&
  previous.renderPageWidth === next.renderPageWidth &&
  previous.renderPageHeight === next.renderPageHeight &&
  previous.surfaceWidth === next.surfaceWidth &&
  previous.surfaceHeight === next.surfaceHeight &&
  previous.zoom === next.zoom &&
  previous.activeTool === next.activeTool &&
  previous.canvasGesture === next.canvasGesture &&
  previous.annotations === next.annotations &&
  previous.selectedAnnotationId === next.selectedAnnotationId &&
  previous.drawPoints === next.drawPoints &&
  previous.penColor === next.penColor &&
  previous.penWidth === next.penWidth &&
  previous.activeTextColor === next.activeTextColor &&
  previous.activeTextFont === next.activeTextFont &&
  previous.activeTextSize === next.activeTextSize &&
  previous.isTextDrafting === next.isTextDrafting &&
  previous.draftInput === next.draftInput &&
  previous.inputValue === next.inputValue &&
  previous.loadingPdf === next.loadingPdf &&
  previous.pdfError === next.pdfError
));

const PdfPageSurface = memo(function PdfPageSurface({
  currentDocument,
  shouldRenderPage,
  pageIndex,
  onPdfLoadComplete,
  onPdfError,
}: {
  currentDocument: PDFDocument | null;
  shouldRenderPage: boolean;
  pageIndex: number;
  onPdfLoadComplete: (numberOfPages: number, size?: { width: number; height: number }) => void;
  onPdfError: (error: unknown) => void;
}) {
  if (currentDocument?.fileUrl && shouldRenderPage) {
    return (
      <Pdf
        key={`${currentDocument.id}-${pageIndex}`}
        source={{ uri: currentDocument.fileUrl, cache: true }}
        style={styles.pdfViewer}
        page={pageIndex + 1}
        scale={1}
        minScale={0.7}
        maxScale={2.5}
        fitPolicy={0}
        horizontal={false}
        enablePaging={false}
        scrollEnabled={false}
        trustAllCerts={false}
        onLoadComplete={(numberOfPages, _path, size) => {
          onPdfLoadComplete(numberOfPages, size);
        }}
        onError={onPdfError}
        renderActivityIndicator={() => (
          <View style={styles.pdfPlaceholder}>
            <ActivityIndicator size="large" color="#fff" />
            <Text style={styles.nativeHint}>Loading PDF...</Text>
          </View>
        )}
      />
    );
  }

  if (currentDocument?.fileUrl) {
    return (
      <View style={styles.pagePlaceholder}>
        <FileText size={56} color="rgba(255,255,255,0.08)" />
        <Text style={styles.placeholderText}>PAGE {pageIndex + 1}</Text>
      </View>
    );
  }

  return (
    <View style={styles.pdfPlaceholder}>
      <FileText size={64} color="rgba(255,255,255,0.05)" />
      <Text style={styles.placeholderText}>NO PDF</Text>
      <Text style={styles.nativeHint}>This document does not have a file URL yet.</Text>
    </View>
  );
}, (previous, next) => (
  previous.currentDocument?.id === next.currentDocument?.id &&
  previous.currentDocument?.fileUrl === next.currentDocument?.fileUrl &&
  previous.shouldRenderPage === next.shouldRenderPage &&
  previous.pageIndex === next.pageIndex
));

function ToolButton({ icon: Icon, active, onPress }: { icon: any; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity style={[styles.toolBtn, active && styles.activeToolBtn]} onPress={onPress}>
      <Icon size={24} color={active ? '#000' : 'rgba(255,255,255,0.4)'} />
    </TouchableOpacity>
  );
}

function HighlightWidthSlider({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  const [trackWidth, setTrackWidth] = useState(0);
  const [previewValue, setPreviewValue] = useState(value);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    if (!isDragging) {
      setPreviewValue(value);
    }
  }, [isDragging, value]);

  const getValueForLocation = (locationX: number) => {
    if (trackWidth <= 0) return previewValue;
    const ratio = Math.max(0, Math.min(1, locationX / trackWidth));
    const nextValue = MIN_HIGHLIGHT_WIDTH + ratio * (MAX_HIGHLIGHT_WIDTH - MIN_HIGHLIGHT_WIDTH);
    return Math.round(nextValue);
  };

  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .onBegin((event) => {
          setIsDragging(true);
          setPreviewValue(getValueForLocation(event.x));
        })
        .onUpdate((event) => {
          setPreviewValue(getValueForLocation(event.x));
        })
        .onEnd((event) => {
          const nextValue = getValueForLocation(event.x);
          setPreviewValue(nextValue);
          onChange(nextValue);
          setIsDragging(false);
        })
        .onFinalize(() => {
          setIsDragging(false);
        }),
    [onChange, previewValue, trackWidth]
  );

  const fillRatio = (previewValue - MIN_HIGHLIGHT_WIDTH) / (MAX_HIGHLIGHT_WIDTH - MIN_HIGHLIGHT_WIDTH);
  const clampedFillRatio = Math.max(0, Math.min(1, fillRatio));

  return (
    <View style={styles.sliderBlock}>
      <View style={styles.sliderHeader}>
        <Text style={styles.sliderLabel}>Stroke Width</Text>
        <Text style={styles.sliderValue}>{Math.round(previewValue)}</Text>
      </View>
      <GestureDetector gesture={panGesture}>
        <View
          style={styles.sliderTrack}
          onLayout={(event: LayoutChangeEvent) => {
            setTrackWidth(event.nativeEvent.layout.width);
          }}
        >
          <View style={[styles.sliderFill, { width: `${clampedFillRatio * 100}%` }]} />
          <View style={[styles.sliderThumb, { left: `${clampedFillRatio * 100}%` }]} />
        </View>
      </GestureDetector>
    </View>
  );
}

function ZoomSlider({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  const [trackWidth, setTrackWidth] = useState(0);
  const [previewValue, setPreviewValue] = useState(value);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    if (!isDragging) {
      setPreviewValue(value);
    }
  }, [isDragging, value]);

  const getValueForLocation = (locationX: number) => {
    if (trackWidth <= 0) return previewValue;
    const ratio = Math.max(0, Math.min(1, locationX / trackWidth));
    return Number((MIN_ZOOM + ratio * (MAX_ZOOM - MIN_ZOOM)).toFixed(2));
  };

  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .onBegin((event) => {
          setIsDragging(true);
          const nextValue = getValueForLocation(event.x);
          setPreviewValue(nextValue);
          onChange(nextValue);
        })
        .onUpdate((event) => {
          const nextValue = getValueForLocation(event.x);
          setPreviewValue(nextValue);
          onChange(nextValue);
        })
        .onEnd((event) => {
          const nextValue = getValueForLocation(event.x);
          setPreviewValue(nextValue);
          onChange(nextValue);
          setIsDragging(false);
        })
        .onFinalize(() => {
          setIsDragging(false);
        }),
    [onChange, previewValue, trackWidth]
  );

  const fillRatio = (previewValue - MIN_ZOOM) / (MAX_ZOOM - MIN_ZOOM);
  const clampedFillRatio = Math.max(0, Math.min(1, fillRatio));

  return (
    <View style={styles.zoomSliderWrap}>
      <GestureDetector gesture={panGesture}>
        <View
          style={styles.zoomTrack}
          onLayout={(event: LayoutChangeEvent) => {
            setTrackWidth(event.nativeEvent.layout.width);
          }}
        >
          <View style={[styles.zoomFill, { width: `${clampedFillRatio * 100}%` }]} />
          <View style={[styles.sliderThumb, { left: `${clampedFillRatio * 100}%` }]} />
        </View>
      </GestureDetector>
      <Text style={styles.zoomLabel}>{Math.round(previewValue * 100)}%</Text>
    </View>
  );
}

function toSvgPath(points: Array<{ x: number; y: number }>, width: number, height: number) {
  if (points.length === 0) return '';

  const scaledPoints = points.map((point) => ({
    x: (point.x / 100) * width,
    y: (point.y / 100) * height,
  }));

  if (scaledPoints.length === 1) {
    const point = scaledPoints[0];
    return `M ${point.x} ${point.y}`;
  }

  if (scaledPoints.length === 2) {
    return scaledPoints
      .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
      .join(' ');
  }

  let path = `M ${scaledPoints[0].x} ${scaledPoints[0].y}`;

  for (let index = 1; index < scaledPoints.length - 1; index += 1) {
    const current = scaledPoints[index];
    const next = scaledPoints[index + 1];
    const controlX = current.x;
    const controlY = current.y;
    const midX = (current.x + next.x) / 2;
    const midY = (current.y + next.y) / 2;
    path += ` Q ${controlX} ${controlY} ${midX} ${midY}`;
  }

  const penultimate = scaledPoints[scaledPoints.length - 2];
  const last = scaledPoints[scaledPoints.length - 1];
  path += ` Q ${penultimate.x} ${penultimate.y} ${last.x} ${last.y}`;

  return path;
}

function getHighlightScreenBounds(
  points: Array<{ x: number; y: number }>,
  width: number,
  height: number,
  strokeWidth: number
) {
  const bounds = getPointsBounds(points);
  const minX = (bounds.minX / 100) * width;
  const maxX = (bounds.maxX / 100) * width;
  const minY = (bounds.minY / 100) * height;
  const maxY = (bounds.maxY / 100) * height;
  const strokePadding = strokeWidth / 2;

  return {
    left: minX,
    top: minY - strokePadding,
    width: Math.max(maxX - minX, 0),
    height: Math.max(maxY - minY, 0) + strokeWidth,
    strokePadding,
  };
}

function getHighlightRenderRect(
  points: Array<{ x: number; y: number }>,
  width: number,
  height: number,
  strokeWidth: number
) {
  const bounds = getPointsBounds(points);
  const minX = (bounds.minX / 100) * width;
  const maxX = (bounds.maxX / 100) * width;
  const centerY = (((bounds.minY + bounds.maxY) / 2) / 100) * height;

  return {
    x: minX,
    y: centerY - strokeWidth / 2,
    width: Math.max(maxX - minX, 0),
    height: strokeWidth,
  };
}

function getResizedTextFontSize(
  startFontSize: number,
  startWidth: number,
  startHeight: number,
  translationX: number,
  translationY: number
) {
  const nextWidth = Math.max(36, startWidth + translationX);
  const nextHeight = Math.max(24, startHeight + translationY);
  const widthScale = nextWidth / Math.max(startWidth, 1);
  const heightScale = nextHeight / Math.max(startHeight, 1);

  return Math.max(12, startFontSize * Math.max(widthScale, heightScale));
}

function toHighlightColor(color: string) {
  if (color.startsWith('rgba(')) return color;
  if (color.startsWith('rgb(')) {
    return color.replace('rgb(', 'rgba(').replace(')', `, ${HIGHLIGHT_OPACITY})`);
  }
  if (color.startsWith('#')) {
    let hex = color.slice(1);
    if (hex.length === 3) {
      hex = hex.split('').map((char) => `${char}${char}`).join('');
    }
    if (hex.length !== 6) return `rgba(251,191,36,${HIGHLIGHT_OPACITY})`;
    const red = parseInt(hex.slice(0, 2), 16);
    const green = parseInt(hex.slice(2, 4), 16);
    const blue = parseInt(hex.slice(4, 6), 16);
    return `rgba(${red},${green},${blue},${HIGHLIGHT_OPACITY})`;
  }
  return `rgba(251,191,36,${HIGHLIGHT_OPACITY})`;
}

function getPointDistance(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function simplifyStrokePoints(points: Array<{ x: number; y: number }>) {
  if (points.length < 3) return points;

  const simplified = [points[0]];

  for (let index = 1; index < points.length - 1; index += 1) {
    const previous = simplified[simplified.length - 1];
    const current = points[index];
    const next = points[index + 1];

    if (getPointDistance(previous, current) < MIN_STROKE_POINT_DISTANCE) {
      continue;
    }

    const previousAngle = Math.atan2(current.y - previous.y, current.x - previous.x);
    const nextAngle = Math.atan2(next.y - current.y, next.x - current.x);
    const angleDelta = Math.abs(previousAngle - nextAngle);

    if (angleDelta < 0.12 && getPointDistance(current, next) < MIN_STROKE_POINT_DISTANCE * 2.2) {
      continue;
    }

    simplified.push(current);
  }

  simplified.push(points[points.length - 1]);
  return simplified;
}

function getTextMetrics(data: Annotation['data']) {
  const fontSize = data?.fontSize || 16;
  const lineHeight = fontSize * 0.88;
  const lines = String(data?.text || '').split('\n');
  const longestLine = lines.reduce((max, line) => Math.max(max, line.length), 1);
  const fontFamily = data?.fontFamily || 'System';
  const widthRatio = TEXT_WIDTH_RATIO_MAP[fontFamily] || TEXT_WIDTH_RATIO_MAP.System;
  const widthBuffer = TEXT_WIDTH_BUFFER_MAP[fontFamily] || TEXT_WIDTH_BUFFER_MAP.System;
  const horizontalPadding = 0;
  const verticalPadding = 0;
  const ascent = fontSize * TEXT_ASCENT_RATIO;
  const descent = fontSize * TEXT_DESCENT_RATIO;
  return {
    fontSize,
    lineHeight,
    ascent,
    descent,
    lines,
    horizontalPadding,
    verticalPadding,
    width: Math.max(12, longestLine * fontSize * widthRatio + widthBuffer),
    height: Math.max(fontSize * 0.84, ascent + descent + Math.max(0, lines.length - 1) * lineHeight),
  };
}

function getSkiaFontFamily(fontFamily?: string) {
  return SKIA_FONT_FAMILY_MAP[fontFamily || ''] || 'Helvetica';
}

function getPointsBounds(points: Array<{ x: number; y: number }>) {
  if (points.length === 0) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };
  }

  let minX = points[0].x;
  let maxX = points[0].x;
  let minY = points[0].y;
  let maxY = points[0].y;

  for (const point of points) {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minY = Math.min(minY, point.y);
    maxY = Math.max(maxY, point.y);
  }

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

function translatePoints(points: Array<{ x: number; y: number }>, deltaX: number, deltaY: number) {
  return points.map((point) => ({
    x: Math.max(0, Math.min(100, point.x + deltaX)),
    y: Math.max(0, Math.min(100, point.y + deltaY)),
  }));
}

function scalePointsFromBounds(
  points: Array<{ x: number; y: number }>,
  nextWidth: number,
  nextHeight: number
) {
  const bounds = getPointsBounds(points);
  const scaleX = nextWidth / Math.max(bounds.width, 0.01);
  const scaleY = nextHeight / Math.max(bounds.height, 0.01);

  return points.map((point) => ({
    x: Math.max(0, Math.min(100, bounds.minX + (point.x - bounds.minX) * scaleX)),
    y: Math.max(0, Math.min(100, bounds.minY + (point.y - bounds.minY) * scaleY)),
  }));
}

const TextAnnotationsCanvas = memo(function TextAnnotationsCanvas({
  annotations,
  width,
  height,
  selectedAnnotationId,
}: {
  annotations: Annotation[];
  width: number;
  height: number;
  selectedAnnotationId: string | null;
}) {
  const textAnnotations = useMemo(
    () => annotations.filter((annotation) => annotation.type === 'TEXT' && annotation.id !== selectedAnnotationId),
    [annotations, selectedAnnotationId]
  );

  if (textAnnotations.length === 0) return null;

  return (
    <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
      {textAnnotations.map((annotation) => {
        const metrics = getTextMetrics(annotation.data);
        const x = (annotation.data?.x / 100) * width;
        const y = (annotation.data?.y / 100) * height;
        const font = matchFont({
          fontFamily: getSkiaFontFamily(annotation.data?.fontFamily),
          fontSize: metrics.fontSize,
          fontStyle: 'normal',
          fontWeight: '700',
        });

        return (
          <Fragment key={`${annotation.id}-canvas-group`}>
            {metrics.lines.map((line, index) => (
              <SkiaText
                key={`${annotation.id}-canvas-line-${index}`}
                x={x}
                y={y + index * metrics.lineHeight}
                text={line || ' '}
                font={font}
                color={annotation.data?.color || '#111827'}
              />
            ))}
          </Fragment>
        );
      })}
    </Canvas>
  );
});

const VectorAnnotationsCanvas = memo(function VectorAnnotationsCanvas({
  annotations,
  drawPoints,
  activeTool,
  activeColor,
  activeStrokeWidth,
  selectedAnnotationId,
  width,
  height,
}: {
  annotations: Annotation[];
  drawPoints: Array<{ x: number; y: number }>;
  activeTool: string;
  activeColor: string;
  activeStrokeWidth: number;
  selectedAnnotationId: string | null;
  width: number;
  height: number;
}) {
  const vectorAnnotations = useMemo(
    () =>
      annotations.filter(
        (annotation) =>
          (annotation.type === 'DRAW' || annotation.type === 'HIGHLIGHT') &&
          !(annotation.type === 'HIGHLIGHT' && annotation.id === selectedAnnotationId)
      ),
    [annotations, selectedAnnotationId]
  );
  const livePath = useMemo(
    () =>
      drawPoints.length > 1
        ? Skia.Path.MakeFromSVGString(
            toSvgPath(drawPoints, width, height)
          )
        : null,
    [drawPoints, height, width]
  );

  if (vectorAnnotations.length === 0 && !livePath) return null;

  return (
    <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
      {vectorAnnotations.map((annotation) => {
        const points = annotation.data?.points || [];
        if (points.length < 2) return null;
        if (annotation.type === 'HIGHLIGHT') {
          const rect = getHighlightRenderRect(
            points,
            width,
            height,
            annotation.data?.strokeWidth || HIGHLIGHT_DEFAULT_WIDTH
          );

          return (
            <SkiaRect
              key={`${annotation.id}-highlight-rect`}
              x={rect.x}
              y={rect.y}
              width={rect.width}
              height={rect.height}
              color={annotation.data?.color || 'rgba(251,191,36,0.45)'}
              style="fill"
            />
          );
        }

        const path = Skia.Path.MakeFromSVGString(
          toSvgPath(points, width, height)
        );
        if (!path) return null;

        return (
          <SkiaPath
            key={`${annotation.id}-vector-path`}
            path={path}
            color={annotation.data?.color || (annotation.type === 'HIGHLIGHT' ? 'rgba(251,191,36,0.45)' : '#111827')}
            style="stroke"
            strokeWidth={annotation.data?.strokeWidth || (annotation.type === 'HIGHLIGHT' ? 12 : 3)}
            strokeCap={annotation.type === 'HIGHLIGHT' ? 'butt' : 'round'}
            strokeJoin="round"
          />
        );
      })}
      {activeTool === 'HIGHLIGHT' && drawPoints.length > 1 ? (
        (() => {
          const rect = getHighlightRenderRect(drawPoints, width, height, activeStrokeWidth);

          return (
            <SkiaRect
              x={rect.x}
              y={rect.y}
              width={rect.width}
              height={rect.height}
              color={toHighlightColor(activeColor)}
              style="fill"
            />
          );
        })()
      ) : livePath ? (
        <SkiaPath
          path={livePath}
          color={activeColor}
          style="stroke"
          strokeWidth={Math.max(2, activeStrokeWidth * 0.35)}
          strokeCap="round"
          strokeJoin="round"
        />
      ) : null}
    </Canvas>
  );
});

const CommentAnnotationsCanvas = memo(function CommentAnnotationsCanvas({
  annotations,
  width,
  height,
  selectedAnnotationId,
}: {
  annotations: Annotation[];
  width: number;
  height: number;
  selectedAnnotationId: string | null;
}) {
  const commentAnnotations = useMemo(
    () => annotations.filter((annotation) => annotation.type === 'COMMENT'),
    [annotations]
  );

  if (commentAnnotations.length === 0) return null;

  return (
    <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
      {commentAnnotations.map((annotation) => {
        const x = ((annotation.data?.x || 0) / 100) * width;
        const y = ((annotation.data?.y || 0) / 100) * height;
        const isSelected = annotation.id === selectedAnnotationId;
        const fillColor = isSelected ? '#2563eb' : '#f59e0b';

        return (
          <React.Fragment key={`${annotation.id}-comment-marker`}>
            <Circle cx={x} cy={y} r={14} color={fillColor} />
            <Circle cx={x} cy={y} r={14} color="#ffffff" style="stroke" strokeWidth={2} />
            <SkiaRect
              x={x - 4}
              y={y - 4}
              width={8}
              height={8}
              color="#ffffff"
              style="fill"
            />
          </React.Fragment>
        );
      })}
    </Canvas>
  );
});

function AnnotationTouchItem({
  annotation,
  width,
  height,
  zoom,
  selected,
  selectable,
  onPress,
  onDragEnd,
  onResize,
}: {
  annotation: Annotation;
  width: number;
  height: number;
  zoom: number;
  selected: boolean;
  selectable: boolean;
  onPress: () => void;
  onDragEnd: (position: { x: number; y: number } | { points: Array<{ x: number; y: number }> }) => void;
  onResize: (nextValue: number | { points: Array<{ x: number; y: number }> }) => void;
}) {
  if (!selectable) return null;

  if (annotation.type === 'TEXT') {
    return (
      <TextAnnotationTouchItem
        annotation={annotation}
        width={width}
        height={height}
        zoom={zoom}
        selected={selected}
        onPress={onPress}
        onDragEnd={onDragEnd}
        onResize={onResize}
      />
    );
  }

  if (annotation.type === 'COMMENT') {
    const x = ((annotation.data?.x || 0) / 100) * width;
    const y = ((annotation.data?.y || 0) / 100) * height;
    return (
      <Pressable
        onPress={onPress}
        style={[styles.commentHitTarget, { left: x - 22, top: y - 22 }]}
        hitSlop={8}
      />
    );
  }

  if (annotation.type === 'HIGHLIGHT') {
    return (
      <HighlightAnnotationTouchItem
        annotation={annotation}
        width={width}
        height={height}
        onPress={onPress}
      />
    );
  }

  return null;
}

function HighlightAnnotationTouchItem({
  annotation,
  width,
  height,
  onPress,
}: {
  annotation: Annotation;
  width: number;
  height: number;
  onPress: () => void;
}) {
  const points = annotation.data?.points || [];
  const renderedBounds = getHighlightScreenBounds(
    points,
    width,
    height,
    annotation.data?.strokeWidth || HIGHLIGHT_DEFAULT_WIDTH
  );

  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.highlightHitbox,
        {
          left: renderedBounds.left,
          top: renderedBounds.top,
          width: Math.max(24, renderedBounds.width),
          height: Math.max(24, renderedBounds.height),
        },
      ]}
      hitSlop={10}
    />
  );
}

function TextAnnotationTouchItem({
  annotation,
  width,
  height,
  zoom,
  selected,
  onPress,
  onDragEnd,
  onResize,
}: {
  annotation: Annotation;
  width: number;
  height: number;
  zoom: number;
  selected: boolean;
  onPress: () => void;
  onDragEnd: (position: { x: number; y: number }) => void;
  onResize: (fontSize: number) => void;
}) {
  const x = ((annotation.data?.x || 0) / 100) * width;
  const y = ((annotation.data?.y || 0) / 100) * height;
  const metrics = getTextMetrics(annotation.data);
  const [previewFontSize, setPreviewFontSize] = useState(annotation.data?.fontSize || metrics.fontSize);
  const previewFontSizeRef = useRef(previewFontSize);
  const dragTranslateX = useSharedValue(0);
  const dragTranslateY = useSharedValue(0);
  const resizeStartFontSize = useSharedValue(annotation.data?.fontSize || metrics.fontSize);
  const resizeStartWidth = useSharedValue(1);
  const resizeStartHeight = useSharedValue(1);
  const previewMetrics = getTextMetrics({ ...annotation.data, fontSize: previewFontSize });
  const uiScale = 1 / Math.max(zoom, 0.01);
  const handleSize = 10 * uiScale;
  const handleOffset = -5 * uiScale;
  const resizeHandleSize = 24 * uiScale;
  const resizeHandleOffset = -18 * uiScale;
  const resizeHandleRadius = 12 * uiScale;
  const resizeHandleBorderWidth = 1 * uiScale;
  const resizeHandleFontSize = 12 * uiScale;

  useEffect(() => {
    setPreviewFontSize(annotation.data?.fontSize || metrics.fontSize);
  }, [annotation.data?.fontSize, metrics.fontSize]);

  useEffect(() => {
    previewFontSizeRef.current = previewFontSize;
  }, [previewFontSize]);

  useEffect(() => {
    dragTranslateX.value = 0;
    dragTranslateY.value = 0;
  }, [dragTranslateX, dragTranslateY, x, y]);

  const hitboxAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: dragTranslateX.value },
      { translateY: dragTranslateY.value },
    ] as const,
  }));

  const tapGesture = useMemo(
    () =>
      Gesture.Tap()
        .runOnJS(true)
        .onEnd(() => {
          onPress();
        }),
    [onPress]
  );

  const dragGesture = useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .minDistance(3)
        .onBegin(() => {
          onPress();
        })
        .onUpdate((event) => {
          dragTranslateX.value = event.translationX;
          dragTranslateY.value = event.translationY;
        })
        .onEnd((event) => {
          const nextX = Math.max(0, Math.min(100, ((x + event.translationX) / Math.max(width, 1)) * 100));
          const nextY = Math.max(0, Math.min(100, ((y + event.translationY) / Math.max(height, 1)) * 100));
          onDragEnd({ x: nextX, y: nextY });
        })
        .onFinalize(() => {}),
    [dragTranslateX, dragTranslateY, height, onDragEnd, onPress, width, x, y]
  );

  const resizeGesture = useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .onBegin(() => {
          onPress();
          resizeStartFontSize.value = annotation.data?.fontSize || metrics.fontSize;
          resizeStartWidth.value = previewMetrics.width + previewMetrics.horizontalPadding * 2;
          resizeStartHeight.value = previewMetrics.height + previewMetrics.verticalPadding * 2;
        })
        .onUpdate((event) => {
          const nextFontSize = getResizedTextFontSize(
            resizeStartFontSize.value,
            resizeStartWidth.value,
            resizeStartHeight.value,
            event.translationX,
            event.translationY
          );
          previewFontSizeRef.current = nextFontSize;
          setPreviewFontSize(nextFontSize);
        })
        .onEnd(() => {
          onResize(previewFontSizeRef.current);
        }),
    [
      annotation.data?.fontSize,
      metrics.fontSize,
      onPress,
      onResize,
      previewMetrics.height,
      previewMetrics.horizontalPadding,
      previewMetrics.verticalPadding,
      previewMetrics.width,
      resizeStartFontSize,
      resizeStartHeight,
      resizeStartWidth,
    ]
  );

  const contentGesture = useMemo(() => Gesture.Race(dragGesture, tapGesture), [dragGesture, tapGesture]);

  return (
    <Animated.View
      style={[
        styles.textHitbox,
        {
          left: x - previewMetrics.horizontalPadding,
          top: y - previewMetrics.ascent - previewMetrics.verticalPadding,
          width: previewMetrics.width + previewMetrics.horizontalPadding * 2,
          height: previewMetrics.height + previewMetrics.verticalPadding * 2,
        },
        selected && styles.selectedHitbox,
        hitboxAnimatedStyle,
      ]}
    >
      <GestureDetector gesture={contentGesture}>
        <Animated.View style={StyleSheet.absoluteFill} />
      </GestureDetector>
      {selected && (
        <>
          <View style={[styles.selectionHandle, styles.selectionHandleTopLeft, { width: handleSize, height: handleSize, borderRadius: handleSize / 2, left: handleOffset, top: handleOffset }]} />
          <View style={[styles.selectionHandle, styles.selectionHandleTopRight, { width: handleSize, height: handleSize, borderRadius: handleSize / 2, right: handleOffset, top: handleOffset }]} />
          <View style={[styles.selectionHandle, styles.selectionHandleBottomLeft, { width: handleSize, height: handleSize, borderRadius: handleSize / 2, left: handleOffset, bottom: handleOffset }]} />
          <View style={[styles.selectionHandle, styles.selectionHandleBottomRight, { width: handleSize, height: handleSize, borderRadius: handleSize / 2, right: handleOffset, bottom: handleOffset }]} />
          <GestureDetector gesture={resizeGesture}>
            <Animated.View
              style={[
                styles.resizeHandle,
                {
                  right: resizeHandleOffset,
                  bottom: resizeHandleOffset,
                  width: resizeHandleSize,
                  height: resizeHandleSize,
                  borderRadius: resizeHandleRadius,
                  borderWidth: resizeHandleBorderWidth,
                },
              ]}
            >
              <Text style={[styles.resizeHandleText, { fontSize: resizeHandleFontSize }]}>↘</Text>
            </Animated.View>
          </GestureDetector>
        </>
      )}
    </Animated.View>
  );
}

function SelectedTextOverlay({
  annotation,
  width,
  height,
  zoom,
  activeFontSize,
  onPress,
  onDragEnd,
  onResize,
  onDecrease,
  onIncrease,
  onDelete,
  onEdit,
}: {
  annotation: Annotation;
  width: number;
  height: number;
  zoom: number;
  activeFontSize: number;
  onPress: () => void;
  onDragEnd: (position: { x: number; y: number }) => void;
  onResize: (fontSize: number) => void;
  onDecrease: () => void;
  onIncrease: () => void;
  onDelete: () => void;
  onEdit: () => void;
}) {
  const x = ((annotation.data?.x || 0) / 100) * width;
  const y = ((annotation.data?.y || 0) / 100) * height;
  const [previewFontSize, setPreviewFontSize] = useState(annotation.data?.fontSize || activeFontSize);
  const previewFontSizeRef = useRef(previewFontSize);
  const dragTranslateX = useSharedValue(0);
  const dragTranslateY = useSharedValue(0);
  const resizeStartFontSize = useSharedValue(annotation.data?.fontSize || activeFontSize);
  const resizeStartWidth = useSharedValue(1);
  const resizeStartHeight = useSharedValue(1);

  useEffect(() => {
    const nextFontSize = annotation.data?.fontSize || activeFontSize;
    setPreviewFontSize(nextFontSize);
  }, [activeFontSize, annotation.data?.fontSize]);

  useEffect(() => {
    previewFontSizeRef.current = previewFontSize;
  }, [previewFontSize]);

  useEffect(() => {
    dragTranslateX.value = 0;
    dragTranslateY.value = 0;
  }, [dragTranslateX, dragTranslateY, x, y]);

  const metrics = getTextMetrics({
    ...annotation.data,
    fontSize: previewFontSize,
  });
  const skiaFont = useMemo(
    () =>
      matchFont({
        fontFamily: getSkiaFontFamily(annotation.data?.fontFamily),
        fontSize: previewFontSize,
        fontStyle: 'normal',
        fontWeight: '700',
      }),
    [annotation.data?.fontFamily, previewFontSize]
  );
  const boxLeft = x - metrics.horizontalPadding;
  const boxTop = y - metrics.ascent - metrics.verticalPadding;
  const boxWidth = metrics.width + metrics.horizontalPadding * 2;
  const boxHeight = metrics.height + metrics.verticalPadding * 2;
  const uiScale = 1 / Math.max(zoom, 0.01);
  const pillWidth = 160 * uiScale;
  const pillHeight = 52 * uiScale;
  const pillGap = 18 * uiScale;
  const canvasHandleRadius = 5 * uiScale;
  const canvasHandleOffset = 5 * uiScale;
  const canvasHandleStrokeWidth = 1.5 * uiScale;
  const resizeHandleSize = 24 * uiScale;
  const resizeHandleOffset = -18 * uiScale;
  const resizeHandleRadius = 12 * uiScale;
  const resizeHandleBorderWidth = 1 * uiScale;
  const resizeHandleFontSize = 12 * uiScale;
  const placePillAbove = boxTop - pillHeight - pillGap >= 12 * uiScale;
  const pillTop = placePillAbove ? boxTop - pillHeight - pillGap : boxTop + boxHeight + pillGap;
  const pillLeft = Math.max(12 * uiScale, Math.min(boxLeft + boxWidth / 2 - pillWidth / 2, width - pillWidth - 12 * uiScale));

  const overlayAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: dragTranslateX.value },
      { translateY: dragTranslateY.value },
    ] as const,
  }));

  const pillAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: dragTranslateX.value },
      { translateY: dragTranslateY.value },
    ] as const,
  }));

  const dragGesture = useMemo(
    () =>
      Gesture.Pan()
        .onBegin(() => {
          runOnJS(onPress)();
        })
        .onUpdate((event) => {
          dragTranslateX.value = event.translationX;
          dragTranslateY.value = event.translationY;
        })
        .onEnd((event) => {
          const nextX = Math.max(0, Math.min(100, ((x + event.translationX) / Math.max(width, 1)) * 100));
          const nextY = Math.max(0, Math.min(100, ((y + event.translationY) / Math.max(height, 1)) * 100));
          runOnJS(onDragEnd)({ x: nextX, y: nextY });
        })
        .onFinalize(() => {}),
    [dragTranslateX, dragTranslateY, height, onDragEnd, onPress, width, x, y]
  );

  const doubleTapGesture = useMemo(
    () =>
      Gesture.Tap()
        .runOnJS(true)
        .numberOfTaps(2)
        .maxDelay(250)
        .onEnd(() => {
          onEdit();
        }),
    [onEdit]
  );

  const longPressGesture = useMemo(
    () =>
      Gesture.LongPress()
        .runOnJS(true)
        .minDuration(350)
        .onStart(() => {
          onEdit();
        }),
    [onEdit]
  );

  const resizeGesture = useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .onBegin(() => {
          onPress();
          resizeStartFontSize.value = annotation.data?.fontSize || activeFontSize;
          resizeStartWidth.value = boxWidth;
          resizeStartHeight.value = boxHeight;
        })
        .onUpdate((event) => {
          const nextFontSize = getResizedTextFontSize(
            resizeStartFontSize.value,
            resizeStartWidth.value,
            resizeStartHeight.value,
            event.translationX,
            event.translationY
          );
          previewFontSizeRef.current = nextFontSize;
          setPreviewFontSize(nextFontSize);
        })
        .onEnd(() => {
          onResize(previewFontSizeRef.current);
        }),
    [
      activeFontSize,
      annotation.data?.fontSize,
      boxHeight,
      boxWidth,
      onPress,
      onResize,
      resizeStartFontSize,
      resizeStartHeight,
      resizeStartWidth,
    ]
  );

  return (
    <>
      <Animated.View
        style={[
          styles.selectionActionPill,
          {
            left: pillLeft,
            top: pillTop,
            width: pillWidth,
            height: pillHeight,
            paddingVertical: 6 * uiScale,
            borderWidth: 1 * uiScale,
          },
          pillAnimatedStyle,
        ]}
      >
        <TouchableOpacity style={[styles.selectionActionBtn, { paddingHorizontal: 6 * uiScale, paddingVertical: 8 * uiScale }]} onPress={onDecrease}>
          <Text style={[styles.selectionActionText, { fontSize: 14 * uiScale }]}>A-</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.selectionActionBtn, { paddingHorizontal: 6 * uiScale, paddingVertical: 8 * uiScale }]} onPress={onIncrease}>
          <Text style={[styles.selectionActionText, { fontSize: 14 * uiScale }]}>A+</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.selectionActionBtn,
            styles.selectionDeleteBtn,
            {
              paddingHorizontal: 6 * uiScale,
              paddingVertical: 8 * uiScale,
              minWidth: 38 * uiScale,
            },
          ]}
          onPress={onDelete}
        >
          <Trash2 size={16 * uiScale} color="#fff" />
        </TouchableOpacity>
      </Animated.View>

      <Animated.View
        style={[
          styles.selectedTextOverlay,
          {
            left: boxLeft,
            top: boxTop,
            width: boxWidth,
            minHeight: boxHeight,
          },
          overlayAnimatedStyle,
        ]}
      >
        <Canvas style={StyleSheet.absoluteFill}>
          <SkiaRect x={0} y={0} width={boxWidth} height={boxHeight} color="rgba(96,165,250,0.18)" style="fill" />
          <SkiaRect x={0} y={0} width={boxWidth} height={boxHeight} color="#60a5fa" style="stroke" strokeWidth={1.5} />
          {metrics.lines.map((line, index) => (
            <SkiaText
              key={`${annotation.id}-skia-line-${index}`}
              x={metrics.horizontalPadding}
              y={metrics.ascent + metrics.verticalPadding + index * metrics.lineHeight}
              text={line || ' '}
              font={skiaFont}
              color={annotation.data?.color || '#111827'}
            />
          ))}
          <Circle cx={-canvasHandleOffset} cy={-canvasHandleOffset} r={canvasHandleRadius} color="#ffffff" />
          <Circle cx={-canvasHandleOffset} cy={-canvasHandleOffset} r={canvasHandleRadius} color="#60a5fa" style="stroke" strokeWidth={canvasHandleStrokeWidth} />
          <Circle cx={boxWidth + canvasHandleOffset} cy={-canvasHandleOffset} r={canvasHandleRadius} color="#ffffff" />
          <Circle cx={boxWidth + canvasHandleOffset} cy={-canvasHandleOffset} r={canvasHandleRadius} color="#60a5fa" style="stroke" strokeWidth={canvasHandleStrokeWidth} />
          <Circle cx={-canvasHandleOffset} cy={boxHeight + canvasHandleOffset} r={canvasHandleRadius} color="#ffffff" />
          <Circle cx={-canvasHandleOffset} cy={boxHeight + canvasHandleOffset} r={canvasHandleRadius} color="#60a5fa" style="stroke" strokeWidth={canvasHandleStrokeWidth} />
          <Circle cx={boxWidth + canvasHandleOffset} cy={boxHeight + canvasHandleOffset} r={canvasHandleRadius} color="#ffffff" />
          <Circle cx={boxWidth + canvasHandleOffset} cy={boxHeight + canvasHandleOffset} r={canvasHandleRadius} color="#60a5fa" style="stroke" strokeWidth={canvasHandleStrokeWidth} />
        </Canvas>
        <GestureDetector gesture={Gesture.Exclusive(doubleTapGesture, longPressGesture, dragGesture)}>
          <Animated.View style={styles.selectedTextDragSurface} />
        </GestureDetector>
        <GestureDetector gesture={resizeGesture}>
          <Animated.View
            style={[
              styles.resizeHandle,
              {
                right: resizeHandleOffset,
                bottom: resizeHandleOffset,
                width: resizeHandleSize,
                height: resizeHandleSize,
                borderRadius: resizeHandleRadius,
                borderWidth: resizeHandleBorderWidth,
              },
            ]}
          >
            <Text style={[styles.resizeHandleText, { fontSize: resizeHandleFontSize }]}>↘</Text>
          </Animated.View>
        </GestureDetector>
      </Animated.View>
    </>
  );
}

function SelectedHighlightOverlay({
  annotation,
  width,
  height,
  zoom,
  onPress,
  onDragEnd,
  onResize,
  onDelete,
}: {
  annotation: Annotation;
  width: number;
  height: number;
  zoom: number;
  onPress: () => void;
  onDragEnd: (points: Array<{ x: number; y: number }>) => void;
  onResize: (nextValue: { points: Array<{ x: number; y: number }>; strokeWidth: number }) => void;
  onDelete: () => void;
}) {
  const points = annotation.data?.points || [];
  const bounds = getPointsBounds(points);
  const strokeWidth = annotation.data?.strokeWidth || HIGHLIGHT_DEFAULT_WIDTH;
  const [previewPoints, setPreviewPoints] = useState(points);
  const [previewStrokeWidth, setPreviewStrokeWidth] = useState(strokeWidth);
  const previewPointsRef = useRef(previewPoints);
  const previewStrokeWidthRef = useRef(previewStrokeWidth);
  const uiScale = 1 / Math.max(zoom, 0.01);
  const resizeHandleSize = 24 * uiScale;
  const resizeHandleOffset = -18 * uiScale;
  const resizeHandleRadius = 12 * uiScale;
  const resizeHandleBorderWidth = 1 * uiScale;
  const resizeHandleFontSize = 12 * uiScale;
  const pillSize = 44 * uiScale;
  const pillGap = 16 * uiScale;
  const dragTranslateX = useSharedValue(0);
  const dragTranslateY = useSharedValue(0);
  const resizeStartWidth = useSharedValue(bounds.width);
  const resizeStartStrokeWidth = useSharedValue(strokeWidth);

  useEffect(() => {
    setPreviewPoints(points);
  }, [annotation.data?.points, points]);

  useEffect(() => {
    setPreviewStrokeWidth(strokeWidth);
  }, [strokeWidth]);

  useEffect(() => {
    previewPointsRef.current = previewPoints;
  }, [previewPoints]);

  useEffect(() => {
    previewStrokeWidthRef.current = previewStrokeWidth;
  }, [previewStrokeWidth]);

  useEffect(() => {
    dragTranslateX.value = 0;
    dragTranslateY.value = 0;
  }, [bounds.minX, bounds.minY, dragTranslateX, dragTranslateY]);

  const renderedBounds = getHighlightScreenBounds(previewPoints, width, height, previewStrokeWidth);
  const previewRect = useMemo(
    () => getHighlightRenderRect(previewPoints, width, height, previewStrokeWidth),
    [height, previewPoints, previewStrokeWidth, width]
  );

  const overlayAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: dragTranslateX.value },
      { translateY: dragTranslateY.value },
    ] as const,
  }));
  const pillAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: dragTranslateX.value },
      { translateY: dragTranslateY.value },
    ] as const,
  }));
  const placePillAbove = renderedBounds.top - pillSize - pillGap >= 12 * uiScale;
  const pillTop = placePillAbove ? renderedBounds.top - pillSize - pillGap : renderedBounds.top + renderedBounds.height + pillGap;
  const pillLeft = Math.max(
    12 * uiScale,
    Math.min(
      renderedBounds.left + renderedBounds.width / 2 - pillSize / 2,
      width - pillSize - 12 * uiScale
    )
  );

  const dragGesture = useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .onBegin(() => {
          onPress();
        })
        .onUpdate((event) => {
          dragTranslateX.value = event.translationX;
          dragTranslateY.value = event.translationY;
        })
        .onEnd((event) => {
          const deltaX = (event.translationX / Math.max(width, 1)) * 100;
          const deltaY = (event.translationY / Math.max(height, 1)) * 100;
          onDragEnd(translatePoints(points, deltaX, deltaY));
        }),
    [dragTranslateX, dragTranslateY, height, onDragEnd, onPress, points, width]
  );

  const resizeGesture = useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .onBegin(() => {
          onPress();
          resizeStartWidth.value = Math.max(bounds.width, 0.5);
          resizeStartStrokeWidth.value = strokeWidth;
        })
        .onUpdate((event) => {
          const nextWidth = Math.max(2, resizeStartWidth.value + (event.translationX / Math.max(width, 1)) * 100);
          const nextStrokeWidth = Math.max(
            2,
            Math.min(Math.max(width, height), resizeStartStrokeWidth.value + event.translationY)
          );
          const nextPoints = scalePointsFromBounds(points, nextWidth, Math.max(bounds.height, 0.5));
          previewPointsRef.current = nextPoints;
          previewStrokeWidthRef.current = nextStrokeWidth;
          setPreviewPoints(nextPoints);
          setPreviewStrokeWidth(nextStrokeWidth);
        })
        .onEnd(() => {
          onResize({
            points: previewPointsRef.current,
            strokeWidth: previewStrokeWidthRef.current,
          });
        }),
    [
      bounds.height,
      bounds.width,
      height,
      onPress,
      onResize,
      points,
      resizeStartStrokeWidth,
      resizeStartWidth,
      strokeWidth,
      width,
    ]
  );

  return (
    <>
      <Animated.View
        style={[
          styles.selectionActionPill,
          {
            left: pillLeft,
            top: pillTop,
            width: pillSize,
            height: pillSize,
            paddingVertical: 6 * uiScale,
            borderWidth: 1 * uiScale,
          },
          pillAnimatedStyle,
        ]}
      >
        <TouchableOpacity
          style={[
            styles.selectionActionBtn,
            styles.selectionDeleteBtn,
            {
              paddingHorizontal: 6 * uiScale,
              paddingVertical: 8 * uiScale,
              minWidth: 38 * uiScale,
            },
          ]}
          onPress={onDelete}
        >
          <Trash2 size={16 * uiScale} color="#fff" />
        </TouchableOpacity>
      </Animated.View>

      <Animated.View
        style={[
          styles.selectedHighlightOverlay,
          {
            left: renderedBounds.left,
            top: renderedBounds.top,
            width: renderedBounds.width,
            height: renderedBounds.height,
          },
          overlayAnimatedStyle,
        ]}
      >
        <Canvas style={StyleSheet.absoluteFill}>
          <SkiaRect
            x={previewRect.x - renderedBounds.left}
            y={previewRect.y - renderedBounds.top}
            width={previewRect.width}
            height={previewRect.height}
            color={annotation.data?.color || toHighlightColor(HIGHLIGHT_DEFAULT_COLOR)}
            style="fill"
          />
          <SkiaRect
            x={0.75}
            y={0.75}
            width={Math.max(0, renderedBounds.width - 1.5)}
            height={Math.max(0, renderedBounds.height - 1.5)}
            color="#60a5fa"
            style="stroke"
            strokeWidth={1.5}
          />
        </Canvas>
        <GestureDetector gesture={dragGesture}>
          <Animated.View style={styles.selectedHighlightDragSurface} />
        </GestureDetector>
        <GestureDetector gesture={resizeGesture}>
          <Animated.View
            style={[
              styles.resizeHandle,
              {
                right: resizeHandleOffset,
                bottom: resizeHandleOffset,
                width: resizeHandleSize,
                height: resizeHandleSize,
                borderRadius: resizeHandleRadius,
                borderWidth: resizeHandleBorderWidth,
              },
            ]}
          >
            <Text style={[styles.resizeHandleText, { fontSize: resizeHandleFontSize }]}>↘</Text>
          </Animated.View>
        </GestureDetector>
      </Animated.View>
    </>
  );
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
    marginBottom: 14,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 15,
    flex: 1,
    minWidth: 0,
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
    flexShrink: 1,
    maxWidth: width * 0.6,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
    marginLeft: 12,
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
  zoomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 20,
    marginBottom: 12,
  },
  zoomSliderWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  zoomBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoomTrack: {
    flex: 1,
    position: 'relative',
    height: 20,
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  zoomFill: {
    position: 'absolute',
    left: 0,
    top: 6,
    height: 8,
    borderRadius: 999,
    backgroundColor: '#ec6400',
  },
  zoomLabel: {
    minWidth: 52,
    textAlign: 'right',
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  contextBar: {
    marginHorizontal: 20,
    marginBottom: 12,
    padding: 12,
    borderRadius: 16,
    backgroundColor: '#171717',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    gap: 10,
  },
  contextBarBottom: {
    marginHorizontal: 20,
    marginBottom: 24,
    padding: 12,
    borderRadius: 16,
    backgroundColor: '#171717',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    gap: 10,
  },
  contextHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  contextTitle: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  doneBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#fff',
  },
  doneBtnText: {
    color: '#000',
    fontSize: 12,
    fontWeight: '700',
  },
  contextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  swatchRow: {
    gap: 10,
    paddingRight: 20,
  },
  fontRow: {
    gap: 10,
    paddingRight: 20,
  },
  contextActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  colorSwatch: {
    width: 24,
    height: 24,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  colorSwatchActive: {
    borderColor: '#fff',
  },
  colorSwatchLarge: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  fontChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  fontChipActive: {
    backgroundColor: '#fff',
    borderColor: '#fff',
  },
  fontChipText: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 12,
    fontWeight: '600',
  },
  fontChipTextActive: {
    color: '#000',
  },
  sliderBlock: {
    gap: 10,
  },
  sliderHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sliderLabel: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  sliderValue: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 12,
    fontWeight: '700',
  },
  sliderTrack: {
    position: 'relative',
    height: 20,
    justifyContent: 'center',
  },
  sliderFill: {
    position: 'absolute',
    left: 0,
    top: 6,
    height: 8,
    borderRadius: 999,
    backgroundColor: '#ec6400',
  },
  sliderThumb: {
    position: 'absolute',
    top: 0,
    marginLeft: -10,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#ec6400',
  },
  miniBtn: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  miniBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  deleteBtn: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(239,68,68,0.22)',
  },
  deleteBtnText: {
    color: '#fca5a5',
    fontSize: 12,
    fontWeight: '700',
  },
  editorArea: {
    flex: 1,
  },
  editorScrollContent: {
    minHeight: '100%',
    justifyContent: 'center',
    paddingBottom: 20,
  },
  pageWrapper: {
    minWidth: width,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  pageStack: {
    alignItems: 'center',
    gap: PAGE_STACK_GAP,
    paddingVertical: 8,
  },
  pdfPage: {
    backgroundColor: '#111',
    overflow: 'hidden',
  },
  zoomedPageFrame: {
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
  },
  pdfBaseLayer: {
    position: 'absolute',
    left: 0,
    top: 0,
    transformOrigin: 'top left',
  },
  annotationScaleLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  pdfViewer: {
    width: '100%',
    height: '100%',
    backgroundColor: '#111',
  },
  inlineTextEditor: {
    position: 'absolute',
    minWidth: 180,
    maxWidth: '85%',
    zIndex: 15,
  },
  inlineTextInput: {
    paddingVertical: 4,
    paddingHorizontal: 0,
    fontWeight: '700',
    minWidth: 160,
  },
  textHitbox: {
    position: 'absolute',
    borderRadius: 6,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  selectedHitbox: {
    borderColor: '#60a5fa',
    backgroundColor: 'rgba(96,165,250,0.12)',
  },
  selectionHandle: {
    position: 'absolute',
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#ffffff',
    borderWidth: 1.5,
    borderColor: '#60a5fa',
  },
  selectionHandleTopLeft: {
    left: -5,
    top: -5,
  },
  selectionHandleTopRight: {
    right: -5,
    top: -5,
  },
  selectionHandleBottomLeft: {
    left: -5,
    bottom: -5,
  },
  selectionHandleBottomRight: {
    right: -5,
    bottom: -5,
  },
  selectedTextOverlay: {
    position: 'absolute',
  },
  highlightHitbox: {
    position: 'absolute',
    backgroundColor: 'transparent',
  },
  selectedHighlightOverlay: {
    position: 'absolute',
  },
  selectedHighlightDragSurface: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 2,
  },
  selectedTextDragSurface: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 2,
  },
  resizeHandle: {
    position: 'absolute',
    right: -18,
    bottom: -18,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#d1d5db',
    zIndex: 3,
  },
  resizeHandleText: {
    color: '#111827',
    fontSize: 12,
    fontWeight: '700',
  },
  selectionActionPill: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 0,
    backgroundColor: '#232323',
    borderRadius: 999,
    paddingHorizontal: 0,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    zIndex: 16,
  },
  selectionActionBtn: {
    paddingHorizontal: 6,
    paddingVertical: 8,
    borderRadius: 999,
  },
  selectionActionText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  selectionDeleteBtn: {
    backgroundColor: 'rgba(220,38,38,0.9)',
    minWidth: 38,
    alignItems: 'center',
  },
  commentHitTarget: {
    position: 'absolute',
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'transparent',
  },
  pdfPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  pagePlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#111',
  },
  pdfStatusOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: 'rgba(17,17,17,0.82)',
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
    marginBottom: 24,
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
  bottomPanel: {
    zIndex: 10,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 20,
    backgroundColor: '#111',
    padding: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  modalTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 12,
  },
  modalInput: {
    minHeight: 110,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.06)',
    color: '#fff',
    padding: 12,
    textAlignVertical: 'top',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 14,
  },
  commentAuthor: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 8,
  },
  commentBody: {
    color: '#fff',
    fontSize: 15,
    lineHeight: 22,
  },
  modalBtnGhost: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  modalBtnGhostText: {
    color: '#fff',
    fontWeight: '600',
  },
  modalBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#ec6400',
  },
  modalBtnText: {
    color: '#000',
    fontWeight: '700',
  },
});
