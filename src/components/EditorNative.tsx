import React, { Fragment, memo, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Keyboard,
  Modal,
  Platform,
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
import { Check, ChevronLeft, Circle as CircleIcon, Download, FileText, Highlighter, LineSquiggle, MessageSquare, Minus, MousePointer2, PenTool, Square, SquarePen, Trash2, Type, Undo2, Redo2, X, ZoomIn, ZoomOut } from 'lucide-react-native';
import { PDFDocument as PDFLib } from 'pdf-lib';
import { collection, doc, onSnapshot, updateDoc } from 'firebase/firestore';
import Pdf from 'react-native-pdf';
import { Canvas, Circle, Group as SkiaGroup, Path as SkiaPath, Rect as SkiaRect, Skia } from '@shopify/react-native-skia';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import Svg, { Ellipse as SvgEllipse, G, Image as SvgImage, Line as SvgLine, Path as SvgPath, Rect as SvgRect } from 'react-native-svg';
import { db } from '../firebase';
import { savePdf } from '../lib/savePdf';
import { useStore } from '../store/useStore';
import type { Annotation, PDFDocument } from '../types';
import { SafeAreaView } from 'react-native-safe-area-context';
import { theme } from '../theme';
import NeumorphicButton from './NeumorphicButton';
import NeumorphicView from './NeumorphicView';

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

type SavedSignatureSlot = {
  id: 'signature' | 'initials';
  label: string;
  kind: 'draw' | 'image';
  paths: string[];
  imageUri: string | null;
  aspectRatio: number;
  raw: any;
};

type FillSignAction = 'text' | 'cross' | 'check' | 'ellipse' | 'rect' | 'line' | 'sign';

const nextId = () => `ann_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const TEXT_COLORS = ['#ffffff', '#111111', '#4b5563', '#fca5a5', '#fb7185', '#ef4444', '#dc2626', theme.colors.accentStrong, '#f59e0b', '#2563eb', '#7c3aed', '#c084fc'];
const FONT_OPTIONS = ['Assistant', 'Amatic SC', 'Bellefair', 'Montserrat', 'Open Sans', 'Georgia', 'Courier New', 'Times New Roman', 'Verdana'];
const EMPTY_POINTS: Array<{ x: number; y: number }> = [];
const MIN_STROKE_POINT_DISTANCE = 0.35;
const PAGE_RENDER_WINDOW = 1;
const PAGE_STACK_GAP = 18;
const BUNDLED_FONT_FAMILY_MAP: Record<string, string> = {
  Arial: 'PDFabArial',
  Assistant: 'PDFabAssistant',
  'Amatic SC': 'PDFabAmaticSC',
  Bellefair: 'PDFabBellefair',
  Montserrat: 'PDFabMontserrat',
  'Open Sans': 'PDFabOpenSans',
  Georgia: 'PDFabGeorgia',
  'Courier New': 'PDFabCourierNew',
  'Times New Roman': 'PDFabTimesNewRoman',
  Verdana: 'PDFabVerdana',
  System: Platform.select({
    ios: 'System',
    android: 'sans-serif',
    default: 'sans-serif',
  }) || 'sans-serif',
};
const HEBREW_CAPABLE_FONT_FAMILIES = new Set([
  'Arial',
  'Assistant',
  'Bellefair',
  'Courier New',
  'Open Sans',
  'Times New Roman',
  'System',
]);
type TextMetricsPreset = {
  widthRatio: number;
  widthBuffer: number;
  lineHeightRatio: number;
  ascentRatio: number;
  descentRatio: number;
  horizontalPaddingRatio: number;
  verticalPaddingRatio: number;
  minHeightRatio: number;
};

const DEFAULT_TEXT_METRICS_PRESET: TextMetricsPreset = {
  widthRatio: 0.58,
  widthBuffer: 2,
  lineHeightRatio: 0.88,
  ascentRatio: 0.78,
  descentRatio: 0.06,
  horizontalPaddingRatio: 0,
  verticalPaddingRatio: 0,
  minHeightRatio: 0.84,
};

const RTL_TEXT_METRICS_PRESETS: Record<string, TextMetricsPreset> = {
  Arial: {
    widthRatio: 0.66,
    widthBuffer: 5,
    lineHeightRatio: 1.02,
    ascentRatio: 0.84,
    descentRatio: 0.18,
    horizontalPaddingRatio: 0.08,
    verticalPaddingRatio: 0.08,
    minHeightRatio: 1,
  },
  Assistant: {
    widthRatio: 0.64,
    widthBuffer: 4,
    lineHeightRatio: 0.98,
    ascentRatio: 0.82,
    descentRatio: 0.16,
    horizontalPaddingRatio: 0.02,
    verticalPaddingRatio: 0.04,
    minHeightRatio: 0.96,
  },
  'Amatic SC': {
    widthRatio: 0.42,
    widthBuffer: 4,
    lineHeightRatio: 0.92,
    ascentRatio: 0.78,
    descentRatio: 0.1,
    horizontalPaddingRatio: 0.02,
    verticalPaddingRatio: 0.02,
    minHeightRatio: 0.88,
  },
  Bellefair: {
    widthRatio: 0.64,
    widthBuffer: 4,
    lineHeightRatio: 1.04,
    ascentRatio: 0.83,
    descentRatio: 0.18,
    horizontalPaddingRatio: 0.02,
    verticalPaddingRatio: 0.08,
    minHeightRatio: 1,
  },
  Montserrat: {
    widthRatio: 0.62,
    widthBuffer: 4,
    lineHeightRatio: 1,
    ascentRatio: 0.82,
    descentRatio: 0.16,
    horizontalPaddingRatio: 0.04,
    verticalPaddingRatio: 0.05,
    minHeightRatio: 0.96,
  },
  'Open Sans': {
    widthRatio: 0.64,
    widthBuffer: 3,
    lineHeightRatio: 1.04,
    ascentRatio: 0.85,
    descentRatio: 0.2,
    horizontalPaddingRatio: 0.02,
    verticalPaddingRatio: 0.08,
    minHeightRatio: 1.02,
  },
  Georgia: {
    widthRatio: 0.64,
    widthBuffer: 6,
    lineHeightRatio: 0.98,
    ascentRatio: 0.82,
    descentRatio: 0.14,
    horizontalPaddingRatio: 0.03,
    verticalPaddingRatio: 0.04,
    minHeightRatio: 0.94,
  },
  'Courier New': {
    widthRatio: 0.67,
    widthBuffer: 6,
    lineHeightRatio: 1,
    ascentRatio: 0.81,
    descentRatio: 0.16,
    horizontalPaddingRatio: 0.04,
    verticalPaddingRatio: 0.04,
    minHeightRatio: 0.96,
  },
  'Times New Roman': {
    widthRatio: 0.66,
    widthBuffer: 5,
    lineHeightRatio: 1.06,
    ascentRatio: 0.85,
    descentRatio: 0.2,
    horizontalPaddingRatio: 0.02,
    verticalPaddingRatio: 0.09,
    minHeightRatio: 1.02,
  },
  Verdana: {
    widthRatio: 0.64,
    widthBuffer: 5,
    lineHeightRatio: 1.02,
    ascentRatio: 0.83,
    descentRatio: 0.16,
    horizontalPaddingRatio: 0.05,
    verticalPaddingRatio: 0.05,
    minHeightRatio: 0.98,
  },
  System: {
    widthRatio: 0.64,
    widthBuffer: 4,
    lineHeightRatio: 1,
    ascentRatio: 0.82,
    descentRatio: 0.16,
    horizontalPaddingRatio: 0.04,
    verticalPaddingRatio: 0.05,
    minHeightRatio: 0.96,
  },
};

const LTR_TEXT_METRICS_PRESETS: Record<string, TextMetricsPreset> = {
  Arial: DEFAULT_TEXT_METRICS_PRESET,
  Assistant: {
    widthRatio: 0.57,
    widthBuffer: 2,
    lineHeightRatio: 0.9,
    ascentRatio: 0.77,
    descentRatio: 0.1,
    horizontalPaddingRatio: 0,
    verticalPaddingRatio: 0.02,
    minHeightRatio: 0.9,
  },
  'Amatic SC': {
    widthRatio: 0.42,
    widthBuffer: 4,
    lineHeightRatio: 0.9,
    ascentRatio: 0.76,
    descentRatio: 0.08,
    horizontalPaddingRatio: 0.01,
    verticalPaddingRatio: 0.01,
    minHeightRatio: 0.86,
  },
  Bellefair: {
    widthRatio: 0.57,
    widthBuffer: 3,
    lineHeightRatio: 0.88,
    ascentRatio: 0.78,
    descentRatio: 0.08,
    horizontalPaddingRatio: 0,
    verticalPaddingRatio: 0.02,
    minHeightRatio: 0.86,
  },
  Montserrat: {
    widthRatio: 0.57,
    widthBuffer: 2,
    lineHeightRatio: 0.9,
    ascentRatio: 0.77,
    descentRatio: 0.1,
    horizontalPaddingRatio: 0,
    verticalPaddingRatio: 0.02,
    minHeightRatio: 0.89,
  },
  'Open Sans': {
    widthRatio: 0.57,
    widthBuffer: 2,
    lineHeightRatio: 0.92,
    ascentRatio: 0.78,
    descentRatio: 0.11,
    horizontalPaddingRatio: 0.01,
    verticalPaddingRatio: 0.03,
    minHeightRatio: 0.9,
  },
  Georgia: {
    widthRatio: 0.59,
    widthBuffer: 4,
    lineHeightRatio: 0.94,
    ascentRatio: 0.79,
    descentRatio: 0.12,
    horizontalPaddingRatio: 0,
    verticalPaddingRatio: 0.03,
    minHeightRatio: 0.92,
  },
  'Courier New': {
    widthRatio: 0.61,
    widthBuffer: 6,
    lineHeightRatio: 0.88,
    ascentRatio: 0.77,
    descentRatio: 0.07,
    horizontalPaddingRatio: 0.01,
    verticalPaddingRatio: 0.01,
    minHeightRatio: 0.85,
  },
  'Times New Roman': {
    widthRatio: 0.57,
    widthBuffer: 3,
    lineHeightRatio: 0.94,
    ascentRatio: 0.79,
    descentRatio: 0.12,
    horizontalPaddingRatio: 0,
    verticalPaddingRatio: 0.03,
    minHeightRatio: 0.92,
  },
  Verdana: {
    widthRatio: 0.59,
    widthBuffer: 4,
    lineHeightRatio: 0.88,
    ascentRatio: 0.78,
    descentRatio: 0.07,
    horizontalPaddingRatio: 0.01,
    verticalPaddingRatio: 0.01,
    minHeightRatio: 0.85,
  },
  System: DEFAULT_TEXT_METRICS_PRESET,
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
const RELATIVE_STROKE_WIDTH_MODE = 'relative';
const MIN_HIGHLIGHT_WIDTH = 1;
const MAX_HIGHLIGHT_WIDTH = 24;
const MIN_ZOOM = 0.7;
const MAX_ZOOM = 2.5;
const AUTOSAVE_DEBOUNCE_MS = 600;
const RTL_TEXT_REGEX = /[\u0590-\u05FF\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/;

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

function isRTLText(value: string) {
  return RTL_TEXT_REGEX.test(value);
}

function getTextDirectionStyle(value: string) {
  const isRTL = isRTLText(value);
  return {
    writingDirection: isRTL ? ('rtl' as const) : ('ltr' as const),
    textAlign: isRTL ? ('right' as const) : ('left' as const),
  };
}

function toRelativeStrokeWidth(screenStrokeWidth: number, canvasWidth: number) {
  return (screenStrokeWidth / Math.max(canvasWidth, 1)) * 100;
}

function getCanvasStrokeWidth(
  data: Annotation['data'] | undefined,
  canvasWidth: number,
  fallback: number
) {
  const storedStrokeWidth = data?.strokeWidth;
  if (typeof storedStrokeWidth !== 'number' || Number.isNaN(storedStrokeWidth)) {
    return fallback;
  }

  if (data?.strokeWidthMode === RELATIVE_STROKE_WIDTH_MODE) {
    return (storedStrokeWidth / 100) * canvasWidth;
  }

  return storedStrokeWidth;
}

function parseSignatureSlot(slotId: 'signature' | 'initials', raw: any): SavedSignatureSlot | null {
  if (!raw?.data) return null;

  try {
    const parsed = JSON.parse(raw.data);
    const paths = Array.isArray(parsed?.paths) ? parsed.paths.filter((path: unknown) => typeof path === 'string') : [];
    const imageUri = typeof parsed?.imageUri === 'string' ? parsed.imageUri : null;
    const kind = parsed?.kind === 'image' && imageUri ? 'image' : 'draw';
    if (kind === 'draw' && paths.length === 0) return null;
    return {
      id: slotId,
      label: slotId === 'signature' ? 'Signature' : 'Initials',
      kind,
      paths,
      imageUri,
      aspectRatio: typeof parsed?.aspectRatio === 'number' && parsed.aspectRatio > 0 ? parsed.aspectRatio : 3.4,
      raw,
    };
  } catch (error) {
    console.error('Parse signature slot error:', error);
    return null;
  }
}

function getSignaturePathsBounds(paths: string[]) {
  const values = paths.flatMap((path) => {
    const matches = path.match(/-?\d*\.?\d+/g);
    if (!matches) return [];
    return matches.map(Number).filter((value) => Number.isFinite(value));
  });

  if (values.length < 2) {
    return { minX: 0, minY: 0, maxX: 1, maxY: 1, width: 1, height: 1 };
  }

  let minX = values[0];
  let maxX = values[0];
  let minY = values[1];
  let maxY = values[1];

  for (let index = 0; index < values.length - 1; index += 2) {
    const x = values[index];
    const y = values[index + 1];
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: Math.max(maxX - minX, 1),
    height: Math.max(maxY - minY, 1),
  };
}

function getFillSignActionForAnnotation(annotation: Annotation | null): FillSignAction | null {
  if (!annotation || annotation.type !== 'SIGNATURE') return null;
  const kind = annotation.data?.kind || annotation.data?.slotType;
  if (kind === 'signature' || kind === 'initials') return 'sign';
  if (kind === 'cross') return 'cross';
  if (kind === 'check') return 'check';
  if (kind === 'ellipse') return 'ellipse';
  if (kind === 'rect') return 'rect';
  if (kind === 'line') return 'line';
  if (kind === 'text') return 'text';
  return null;
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
  const [isOverlayInteracting, setIsOverlayInteracting] = useState(false);
  const [isCanvasInteracting, setIsCanvasInteracting] = useState(false);
  const [signatureSlots, setSignatureSlots] = useState<Record<string, any>>({});
  const [activeSignatureSlotId, setActiveSignatureSlotId] = useState<'signature' | 'initials' | null>(null);
  const [activeFillSignAction, setActiveFillSignAction] = useState<FillSignAction>('text');

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
  const pinchFocusPointRef = useRef<{ x: number; y: number; pageIndex: number } | null>(null);
  const zoomRecenterFrameRef = useRef<number | null>(null);
  const autosaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedSnapshotRef = useRef('');
  const ignoreNextSelectPagePressRef = useRef(false);

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
    if (zoomRecenterFrameRef.current !== null) {
      cancelAnimationFrame(zoomRecenterFrameRef.current);
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
    if (activeTool === 'SIGNATURE' && previousToolRef.current !== 'SIGNATURE') {
      setActiveFillSignAction('text');
      setActiveSignatureSlotId(null);
    }
    if (activeTool !== 'SIGNATURE') {
      setActiveSignatureSlotId(null);
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
  const selectedDrawAnnotation = selectedAnnotation?.type === 'DRAW' ? selectedAnnotation : null;
  const selectedSignatureAnnotation = selectedAnnotation?.type === 'SIGNATURE' ? selectedAnnotation : null;
  const isTextDrafting = draftInput?.kind === 'TEXT';
  const showTextControls = activeTool === 'TEXT' || !!selectedTextAnnotation || isTextDrafting;
  const showHighlightControls = activeTool === 'HIGHLIGHT' || !!selectedHighlightAnnotation;
  const showDrawControls = activeTool === 'DRAW' || !!selectedDrawAnnotation;
  const showSignatureControls = activeTool === 'SIGNATURE' || !!selectedSignatureAnnotation;
  const showSelectionControls =
    !!selectedAnnotation &&
    activeTool === 'SELECT' &&
    !selectedTextAnnotation &&
    !selectedHighlightAnnotation &&
    !selectedDrawAnnotation &&
    !selectedSignatureAnnotation;
  const isSelectTool = activeTool === 'SELECT';
  const isTextTool = activeTool === 'TEXT';
  const isHighlightTool = activeTool === 'HIGHLIGHT';
  const isDrawTool = activeTool === 'DRAW';
  const isSignatureTool = activeTool === 'SIGNATURE';
  const isCommentTool = activeTool === 'COMMENT';
  const activeTextColor = selectedTextAnnotation?.data?.color || penColor;
  const activeTextFont = selectedTextAnnotation?.data?.fontFamily || fontFamily;
  const activeTextSize = selectedTextAnnotation?.data?.fontSize || fontSize;
  const activeHighlightColor = selectedHighlightAnnotation?.data?.color || penColor;
  const activeHighlightStrokeWidth = selectedHighlightAnnotation
    ? getCanvasStrokeWidth(selectedHighlightAnnotation.data, surfaceSize.width, penWidth)
    : penWidth;
  const activeDrawColor = selectedDrawAnnotation?.data?.color || penColor;
  const activeDrawStrokeWidth = selectedDrawAnnotation
    ? getCanvasStrokeWidth(selectedDrawAnnotation.data, surfaceSize.width, penWidth)
    : penWidth;
  const availableSignatureSlots = useMemo(
    () =>
      (['signature', 'initials'] as const)
        .map((slotId) => parseSignatureSlot(slotId, signatureSlots[slotId]))
        .filter((slot): slot is SavedSignatureSlot => !!slot),
    [signatureSlots]
  );

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

  useEffect(() => {
    if (!user) {
      setSignatureSlots({});
      return;
    }

    const unsubscribe = onSnapshot(collection(db, `users/${user.uid}/signatureSlots`), (snapshot) => {
      const nextSlots: Record<string, any> = {};
      snapshot.docs.forEach((slotDoc) => {
        nextSlots[slotDoc.id] = slotDoc.data();
      });
      setSignatureSlots(nextSlots);
    });

    return () => unsubscribe();
  }, [user]);

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

    if (activeTool === 'SIGNATURE') {
      if (activeFillSignAction === 'text') {
        setDraftInput({ kind: 'TEXT', pageIndex: currentPage, x: point.x, y: point.y, value: '' });
        setInputValue('');
        return;
      }

      const createFillSignAnnotation = (data: Record<string, any>) => {
        const annotation = stripUndefinedDeep({
          id: nextId(),
          type: 'SIGNATURE',
          pageIndex: currentPage,
          data,
        } satisfies Annotation);
        addAnnotation(annotation);
        ignoreNextSelectPagePressRef.current = true;
        setActiveTool('SELECT');
        requestAnimationFrame(() => {
          setSelectedAnnotation(annotation.id);
        });
      };

      if (activeFillSignAction === 'sign') {
        const slot = availableSignatureSlots.find((candidate) => candidate.id === activeSignatureSlotId) || availableSignatureSlots[0];
        if (!slot) return;

        const sourceBounds = getSignaturePathsBounds(slot.paths);
        const targetWidth = slot.id === 'signature' ? 28 : 18;
        const targetHeight = Math.max(
          6,
          slot.kind === 'image'
            ? targetWidth / Math.max(slot.aspectRatio, 0.1)
            : (sourceBounds.height / Math.max(sourceBounds.width, 1)) * targetWidth
        );
        createFillSignAnnotation({
          kind: slot.id,
          x: Math.max(0, Math.min(100 - targetWidth, point.x - targetWidth / 2)),
          y: Math.max(0, Math.min(100 - targetHeight, point.y - targetHeight / 2)),
          width: targetWidth,
          height: targetHeight,
          color: penColor,
          slotType: slot.id,
          slotContentKind: slot.kind,
          paths: slot.paths,
          imageUri: slot.imageUri,
          aspectRatio: slot.aspectRatio,
          sourceBounds,
        });
        return;
      }

      const defaultDimensions: Record<Exclude<FillSignAction, 'text' | 'sign'>, { width: number; height: number }> = {
        cross: { width: 10, height: 10 },
        check: { width: 10, height: 10 },
        ellipse: { width: 12, height: 9 },
        rect: { width: 12, height: 9 },
        line: { width: 14, height: 3 },
      };
      const dimensions = defaultDimensions[activeFillSignAction];
      createFillSignAnnotation({
        kind: activeFillSignAction,
        x: Math.max(0, Math.min(100 - dimensions.width, point.x - dimensions.width / 2)),
        y: Math.max(0, Math.min(100 - dimensions.height, point.y - dimensions.height / 2)),
        width: dimensions.width,
        height: dimensions.height,
        color: penColor,
      });
      return;
    }

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
    const finalizedPoints =
      activeTool === 'DRAW'
        ? simplifyStrokePoints(drawPointsRef.current, {
            minDistance: MIN_STROKE_POINT_DISTANCE * 1.75,
            angleThreshold: 0.22,
            neighborDistanceMultiplier: 3.2,
          })
        : simplifyStrokePoints(drawPointsRef.current);

    if ((activeTool === 'DRAW' || activeTool === 'HIGHLIGHT') && finalizedPoints.length > 1) {
      addAnnotation({
        id: nextId(),
        type: activeTool,
        pageIndex: currentPage,
        data: {
          points: finalizedPoints,
          color: activeTool === 'HIGHLIGHT' ? toHighlightColor(penColor) : penColor,
          strokeWidth: toRelativeStrokeWidth(penWidth, surfaceSize.width),
          strokeWidthMode: RELATIVE_STROKE_WIDTH_MODE,
        },
      });
      setSelectedAnnotation(null);
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
      if (activeTool === 'SIGNATURE' && annotation.type === 'TEXT') {
        setSelectedAnnotation(null);
      } else {
        setSelectedAnnotation(annotation.id);
        setActiveTool('SELECT');
      }
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
    if (activeTool === 'TEXT' || activeTool === 'COMMENT' || activeTool === 'SIGNATURE') {
      return Gesture.Tap()
        .runOnJS(true)
        .onEnd((event) => {
          beginCanvasGesture(event.x, event.y);
        });
    }

    if (activeTool === 'DRAW' || activeTool === 'HIGHLIGHT') {
      return Gesture.Pan()
        .runOnJS(true)
        .onTouchesDown(() => {
          setIsCanvasInteracting(true);
        })
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
          setIsCanvasInteracting(false);
        });
    }

    return Gesture.Tap().enabled(false);
  }, [activeFillSignAction, activeSignatureSlotId, activeTool, availableSignatureSlots, currentPage, penColor, penWidth, surfaceSize.height, surfaceSize.width]);

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

    if (annotation.type === 'SIGNATURE') {
      return {
        x: (annotation.data?.x || 0) + (annotation.data?.width || 0) / 2,
        y: (annotation.data?.y || 0) + (annotation.data?.height || 0) / 2,
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

  const getZoomFocusPoint = () =>
    selectedAnnotationGlobal ? getSelectionFocusPoint(selectedAnnotationGlobal) : getViewportCenterFocusPoint();

  const normalizeZoom = (nextZoom: number) =>
    Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Number(nextZoom.toFixed(2))));

  const recenterZoomToFocus = (normalizedZoom: number, focus: { x: number; y: number; pageIndex: number } | null) => {
    if (!focus) {
      return;
    }

    if (zoomRecenterFrameRef.current !== null) {
      cancelAnimationFrame(zoomRecenterFrameRef.current);
    }

    zoomRecenterFrameRef.current = requestAnimationFrame(() => {
      zoomRecenterFrameRef.current = null;
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

  const applyZoom = (nextZoom: number, focusOverride?: { x: number; y: number; pageIndex: number } | null) => {
    const normalizedZoom = normalizeZoom(nextZoom);
    const focus = focusOverride === undefined ? getZoomFocusPoint() : focusOverride;

    setZoom(normalizedZoom);
    recenterZoomToFocus(normalizedZoom, focus);
  };

  const applyPinchZoom = (nextZoom: number) => {
    const normalizedZoom = normalizeZoom(nextZoom);
    setZoom(normalizedZoom);
  };

  const commitPinchZoom = (nextZoom: number) => {
    const normalizedZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Number(nextZoom.toFixed(2))));
    setZoom(normalizedZoom);
    recenterZoomToFocus(normalizedZoom, pinchFocusPointRef.current);
  };

  const pinchGesture = useMemo(
    () =>
      Gesture.Pinch()
        .runOnJS(true)
        .onBegin(() => {
          pinchStartZoomRef.current = zoom;
          pinchFocusPointRef.current = getZoomFocusPoint();
        })
        .onUpdate((event) => {
          applyPinchZoom(pinchStartZoomRef.current * event.scale);
        })
        .onEnd((event) => {
          commitPinchZoom(pinchStartZoomRef.current * event.scale);
        })
        .onFinalize(() => {
          pinchFocusPointRef.current = null;
        }),
    [commitPinchZoom, getZoomFocusPoint, zoom]
  );

  const selectedFillSignAction = getFillSignActionForAnnotation(selectedSignatureAnnotation);
  const effectiveFillSignAction = selectedSignatureAnnotation ? (selectedFillSignAction || activeFillSignAction) : activeFillSignAction;
  const activeDisplayedSignatureSlot =
    availableSignatureSlots.find((slot) => slot.id === (selectedSignatureAnnotation?.data?.slotType || activeSignatureSlotId)) ||
    availableSignatureSlots[0] ||
    null;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <NeumorphicButton radius={14} onPress={() => setView('dashboard')} layerStyle={styles.backButton}>
            <ChevronLeft size={24} color={theme.colors.textMuted} />
          </NeumorphicButton>
          <View>
            <Text style={styles.title} numberOfLines={1}>{currentDocument?.title}</Text>
          </View>
        </View>

        <View style={styles.headerActions}>
          <NeumorphicButton radius={14} onPress={undo} disabled={!canUndo} layerStyle={[styles.actionBtn, !canUndo && styles.disabledBtn]}>
            <Undo2 size={20} color={theme.colors.textMuted} />
          </NeumorphicButton>
          <NeumorphicButton radius={14} onPress={redo} disabled={!canRedo} layerStyle={[styles.actionBtn, !canRedo && styles.disabledBtn]}>
            <Redo2 size={20} color={theme.colors.textMuted} />
          </NeumorphicButton>
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
        <NeumorphicView radius={16} style={styles.contextBar}>
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
        </NeumorphicView>
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
            scrollEnabled={!isOverlayInteracting && !isCanvasInteracting}
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
              scrollEnabled={!isOverlayInteracting && !isCanvasInteracting}
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
                          if (ignoreNextSelectPagePressRef.current) {
                            ignoreNextSelectPagePressRef.current = false;
                            return;
                          }
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
                      onOverlayInteractionStart={() => setIsOverlayInteracting(true)}
                      onOverlayInteractionEnd={() => setIsOverlayInteracting(false)}
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

            <StrokeWidthSlider
              value={activeHighlightStrokeWidth}
              onChange={(nextWidth) => {
                if (selectedHighlightAnnotation) {
                  updateAnnotation(selectedHighlightAnnotation.id, {
                    data: {
                      ...selectedHighlightAnnotation.data,
                      strokeWidth: toRelativeStrokeWidth(nextWidth, surfaceSize.width),
                      strokeWidthMode: RELATIVE_STROKE_WIDTH_MODE,
                    },
                  });
                } else {
                  setPenWidth(nextWidth);
                }
              }}
            />
          </View>
        ) : showDrawControls ? (
          <View style={styles.contextBarBottom}>
            <View style={styles.contextHeader}>
              <Text style={styles.contextTitle}>{selectedDrawAnnotation ? 'Selected Drawing' : 'Draw Tool'}</Text>
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
              {TEXT_COLORS.map((color) => (
                <TouchableOpacity
                  key={color}
                  style={[
                    styles.colorSwatchLarge,
                    { backgroundColor: color },
                    activeDrawColor === color && styles.colorSwatchActive,
                  ]}
                  onPress={() => {
                    if (selectedDrawAnnotation) {
                      updateAnnotation(selectedDrawAnnotation.id, {
                        data: {
                          ...selectedDrawAnnotation.data,
                          color,
                        },
                      });
                    } else {
                      setPenColor(color);
                    }
                  }}
                />
              ))}
            </ScrollView>

            <StrokeWidthSlider
              value={activeDrawStrokeWidth}
              onChange={(nextWidth) => {
                if (selectedDrawAnnotation) {
                  updateAnnotation(selectedDrawAnnotation.id, {
                    data: {
                      ...selectedDrawAnnotation.data,
                      strokeWidth: toRelativeStrokeWidth(nextWidth, surfaceSize.width),
                      strokeWidthMode: RELATIVE_STROKE_WIDTH_MODE,
                    },
                  });
                } else {
                  setPenWidth(nextWidth);
                }
              }}
            />
          </View>
        ) : showSignatureControls ? (
          <View style={styles.contextBarBottom}>
            <View style={styles.contextHeader}>
              <Text style={styles.contextTitle}>Fill & Sign</Text>
              <TouchableOpacity
                style={styles.doneBtn}
                onPress={() => {
                  setActiveSignatureSlotId(null);
                  if (selectedSignatureAnnotation) {
                    setSelectedAnnotation(null);
                  } else {
                    setActiveTool('SELECT');
                    setSelectedAnnotation(null);
                  }
                }}
              >
                <Check size={18} color="#000" />
                <Text style={styles.doneBtnText}>Done</Text>
              </TouchableOpacity>
            </View>

            {effectiveFillSignAction === 'sign' && (
              <View style={styles.signatureTray}>
                {availableSignatureSlots.length === 0 ? (
                  <Text style={styles.signatureTrayEmpty}>No saved signature yet. Create one in Signature Hub first.</Text>
                ) : (
                  <>
                    <View style={styles.signatureTabRow}>
                      {availableSignatureSlots.map((slot) => {
                        const isActiveSlot = activeDisplayedSignatureSlot?.id === slot.id;
                        return (
                          <TouchableOpacity
                            key={`${slot.id}-tab`}
                            style={[styles.signatureTab, isActiveSlot && styles.signatureTabActive]}
                            onPress={() => setActiveSignatureSlotId(slot.id)}
                          >
                            <Text style={[styles.signatureTabText, isActiveSlot && styles.signatureTabTextActive]}>
                              {slot.label}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                      <TouchableOpacity
                        style={styles.signatureTabEditBtn}
                        onPress={() => setView('signatures')}
                      >
                        <SquarePen size={16} color="#111" />
                      </TouchableOpacity>
                    </View>
                    {activeDisplayedSignatureSlot && (
                      <View style={styles.signatureTrayCard}>
                        <View style={styles.signatureTrayPreview}>
                          {(() => {
                            if (activeDisplayedSignatureSlot.kind === 'image' && activeDisplayedSignatureSlot.imageUri) {
                              return (
                                <Svg style={StyleSheet.absoluteFill}>
                                  <SvgImage
                                    href={{ uri: activeDisplayedSignatureSlot.imageUri }}
                                    x={0}
                                    y={0}
                                    width="100%"
                                    height="100%"
                                    preserveAspectRatio="xMidYMid meet"
                                  />
                                </Svg>
                              );
                            }

                            const slotBounds = getSignaturePathsBounds(activeDisplayedSignatureSlot.paths);
                            return (
                              <Svg
                                style={StyleSheet.absoluteFill}
                                viewBox={`0 0 ${Math.max(slotBounds.width, 1)} ${Math.max(slotBounds.height, 1)}`}
                              >
                                <G translateX={-slotBounds.minX} translateY={-slotBounds.minY}>
                                  {activeDisplayedSignatureSlot.paths.map((path, index) => (
                                    <SvgPath
                                      key={`${activeDisplayedSignatureSlot.id}-tray-path-${index}`}
                                      d={path}
                                      stroke={penColor}
                                      strokeWidth={3}
                                      fill="none"
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                    />
                                  ))}
                                </G>
                              </Svg>
                            );
                          })()}
                        </View>
                      </View>
                    )}
                  </>
                )}
              </View>
            )}

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.swatchRow}>
              {TEXT_COLORS.map((color) => (
                <TouchableOpacity
                  key={color}
                  style={[
                    styles.colorSwatchLarge,
                    { backgroundColor: color },
                    (selectedSignatureAnnotation?.data?.color || penColor) === color && styles.colorSwatchActive,
                  ]}
                  onPress={() => {
                    if (selectedSignatureAnnotation) {
                      updateAnnotation(selectedSignatureAnnotation.id, {
                        data: {
                          ...selectedSignatureAnnotation.data,
                          color,
                        },
                      });
                    } else {
                      setPenColor(color);
                    }
                  }}
                />
              ))}
            </ScrollView>

            {effectiveFillSignAction !== 'sign' && (
              <View style={styles.fillSignActionRow}>
                <ToolButtonLite icon={Type} active={effectiveFillSignAction === 'text'} onPress={() => !selectedSignatureAnnotation && setActiveFillSignAction('text')} />
                <ToolButtonLite icon={X} active={effectiveFillSignAction === 'cross'} onPress={() => !selectedSignatureAnnotation && setActiveFillSignAction('cross')} />
                <ToolButtonLite icon={Check} active={effectiveFillSignAction === 'check'} onPress={() => !selectedSignatureAnnotation && setActiveFillSignAction('check')} />
                <ToolButtonLite icon={CircleIcon} active={effectiveFillSignAction === 'ellipse'} onPress={() => !selectedSignatureAnnotation && setActiveFillSignAction('ellipse')} />
                <ToolButtonLite icon={Square} active={effectiveFillSignAction === 'rect'} onPress={() => !selectedSignatureAnnotation && setActiveFillSignAction('rect')} />
                <ToolButtonLite icon={Minus} active={effectiveFillSignAction === 'line'} onPress={() => !selectedSignatureAnnotation && setActiveFillSignAction('line')} />
                <ToolButtonLite icon={PenTool} active={false} onPress={() => !selectedSignatureAnnotation && setActiveFillSignAction('sign')} />
              </View>
            )}
          </View>
        ) : (
          <View style={styles.toolbar}>
            <ToolButton icon={MousePointer2} active={isSelectTool} onPress={() => setActiveTool('SELECT')} />
            <ToolButton icon={Type} active={isTextTool} onPress={() => setActiveTool('TEXT')} />
            <ToolButton icon={Highlighter} active={isHighlightTool} onPress={() => setActiveTool('HIGHLIGHT')} />
            <ToolButton icon={LineSquiggle} active={isDrawTool} onPress={() => setActiveTool('DRAW')} />
            <ToolButton icon={PenTool} active={isSignatureTool} onPress={() => setActiveTool('SIGNATURE')} />
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
  onOverlayInteractionStart,
  onOverlayInteractionEnd,
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
  onOverlayInteractionStart: () => void;
  onOverlayInteractionEnd: () => void;
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
            <SignatureAnnotationsCanvas
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
                  onRotate={(rotation) => {
                    onUpdateAnnotation(annotation.id, {
                      data: {
                        ...annotation.data,
                        rotation,
                      },
                    });
                  }}
                  onDecrease={() => onApplyTextFontSizeDelta(-2)}
                  onIncrease={() => onApplyTextFontSizeDelta(2)}
                  onDelete={() => {
                    onRemoveAnnotation(annotation.id);
                  }}
                  onEdit={() => onBeginTextAnnotationEdit(annotation)}
                  onInteractionStart={onOverlayInteractionStart}
                  onInteractionEnd={onOverlayInteractionEnd}
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
                        strokeWidthMode: RELATIVE_STROKE_WIDTH_MODE,
                      },
                    });
                  }}
                  onRotate={(rotation) => {
                    onUpdateAnnotation(annotation.id, {
                      data: {
                        ...annotation.data,
                        rotation,
                      },
                    });
                  }}
                  onDelete={() => {
                    onRemoveAnnotation(annotation.id);
                  }}
                />
              ) : annotation.id === selectedAnnotationId && annotation.type === 'DRAW' ? (
                <SelectedDrawOverlay
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
                        strokeWidthMode: RELATIVE_STROKE_WIDTH_MODE,
                      },
                    });
                  }}
                  onRotate={(rotation) => {
                    onUpdateAnnotation(annotation.id, {
                      data: {
                        ...annotation.data,
                        rotation,
                      },
                    });
                  }}
                  onDelete={() => {
                    onRemoveAnnotation(annotation.id);
                  }}
                />
              ) : annotation.id === selectedAnnotationId && annotation.type === 'SIGNATURE' ? (
                <SelectedFillSignOverlay
                  key={annotation.id}
                  annotation={annotation}
                  width={surfaceWidth}
                  height={surfaceHeight}
                  zoom={zoom}
                  onPress={() => onSetSelectedAnnotation(annotation.id)}
                  onDragEnd={(position) => {
                    onUpdateAnnotation(annotation.id, {
                      data: {
                        ...annotation.data,
                        ...position,
                      },
                    });
                  }}
                  onResize={(size) => {
                    onUpdateAnnotation(annotation.id, {
                      data: {
                        ...annotation.data,
                        ...size,
                      },
                    });
                  }}
                  onRotate={(rotation) => {
                    onUpdateAnnotation(annotation.id, {
                      data: {
                        ...annotation.data,
                        rotation,
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
                    fontFamily: getRenderableFontFamily(inputValue, activeTextFont),
                    fontSize: activeTextSize,
                    ...getTextDirectionStyle(inputValue),
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
    <NeumorphicButton radius={14} onPress={onPress} layerStyle={[styles.toolBtn, active && styles.activeToolBtn]}>
      <Icon size={24} color={active ? '#000' : 'rgba(255,255,255,0.4)'} />
    </NeumorphicButton>
  );
}

function ToolButtonLite({ icon: Icon, active, onPress }: { icon: any; active: boolean; onPress: () => void }) {
  return (
    <NeumorphicButton radius={12} onPress={onPress} layerStyle={[styles.fillSignActionBtn, active && styles.fillSignActionBtnActive]}>
      <Icon size={24} color={active ? '#60a5fa' : 'rgba(255,255,255,0.82)'} />
    </NeumorphicButton>
  );
}

function StrokeWidthSlider({ value, onChange }: { value: number; onChange: (value: number) => void }) {
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

function toSvgPath(
  points: Array<{ x: number; y: number }>,
  width: number,
  height: number,
  offsetX = 0,
  offsetY = 0
) {
  if (points.length === 0) return '';

  const scaledPoints = points.map((point) => ({
    x: (point.x / 100) * width - offsetX,
    y: (point.y / 100) * height - offsetY,
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

function toPolylineSvgPath(points: Array<{ x: number; y: number }>, width: number, height: number) {
  if (points.length === 0) return '';

  return points
    .map((point, index) => {
      const x = (point.x / 100) * width;
      const y = (point.y / 100) * height;
      return `${index === 0 ? 'M' : 'L'} ${x} ${y}`;
    })
    .join(' ');
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

function getDrawScreenBounds(
  points: Array<{ x: number; y: number }>,
  width: number,
  height: number,
  strokeWidth: number
) {
  const bounds = getPointsBounds(points);
  const strokePadding = strokeWidth / 2;
  const minX = (bounds.minX / 100) * width;
  const maxX = (bounds.maxX / 100) * width;
  const minY = (bounds.minY / 100) * height;
  const maxY = (bounds.maxY / 100) * height;

  return {
    left: minX - strokePadding,
    top: minY - strokePadding,
    width: Math.max(maxX - minX, 0) + strokeWidth,
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

function getRotationDegrees(data: Annotation['data']) {
  const value = Number(data?.rotation || 0);
  if (!Number.isFinite(value)) return 0;
  return value;
}

function normalizeRotationDegrees(value: number) {
  const normalized = value % 360;
  if (normalized > 180) return normalized - 360;
  if (normalized < -180) return normalized + 360;
  return normalized;
}

function getRotationFromGesture(startRotation: number, translationX: number, translationY: number) {
  return normalizeRotationDegrees(startRotation + (translationX - translationY) * 0.35);
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

function simplifyStrokePoints(
  points: Array<{ x: number; y: number }>,
  {
    minDistance = MIN_STROKE_POINT_DISTANCE,
    angleThreshold = 0.12,
    neighborDistanceMultiplier = 2.2,
  }: {
    minDistance?: number;
    angleThreshold?: number;
    neighborDistanceMultiplier?: number;
  } = {}
) {
  if (points.length < 3) return points;

  const simplified = [points[0]];

  for (let index = 1; index < points.length - 1; index += 1) {
    const previous = simplified[simplified.length - 1];
    const current = points[index];
    const next = points[index + 1];

    if (getPointDistance(previous, current) < minDistance) {
      continue;
    }

    const previousAngle = Math.atan2(current.y - previous.y, current.x - previous.x);
    const nextAngle = Math.atan2(next.y - current.y, next.x - current.x);
    const angleDelta = Math.abs(previousAngle - nextAngle);

    if (angleDelta < angleThreshold && getPointDistance(current, next) < minDistance * neighborDistanceMultiplier) {
      continue;
    }

    simplified.push(current);
  }

  simplified.push(points[points.length - 1]);
  return simplified;
}

function getTextMetrics(data: Annotation['data']) {
  const fontSize = data?.fontSize || 16;
  const textValue = String(data?.text || '');
  const isRTL = isRTLText(textValue);
  const lines = textValue.split('\n');
  const longestLine = lines.reduce((max, line) => Math.max(max, line.length), 1);
  const fontFamily = getEffectiveFontFamilyName(textValue, data?.fontFamily);
  const presetMap = isRTL ? RTL_TEXT_METRICS_PRESETS : LTR_TEXT_METRICS_PRESETS;
  const preset = presetMap[fontFamily] || presetMap.System || DEFAULT_TEXT_METRICS_PRESET;
  const lineHeight = fontSize * preset.lineHeightRatio;
  const horizontalPadding = fontSize * preset.horizontalPaddingRatio;
  const verticalPadding = fontSize * preset.verticalPaddingRatio;
  const ascent = fontSize * preset.ascentRatio;
  const descent = fontSize * preset.descentRatio;
  return {
    fontSize,
    lineHeight,
    ascent,
    descent,
    lines,
    horizontalPadding,
    verticalPadding,
    width: Math.max(12, longestLine * fontSize * preset.widthRatio + preset.widthBuffer),
    height: Math.max(fontSize * preset.minHeightRatio, ascent + descent + Math.max(0, lines.length - 1) * lineHeight),
  };
}

function getNativeFontFamily(fontFamily?: string) {
  const normalizedFont = fontFamily || 'System';
  return BUNDLED_FONT_FAMILY_MAP[normalizedFont] || BUNDLED_FONT_FAMILY_MAP.System;
}

function getEffectiveFontFamilyName(textValue: string, fontFamily?: string) {
  const normalizedFont = fontFamily || 'System';

  if (!isRTLText(textValue)) {
    return normalizedFont;
  }

  if (HEBREW_CAPABLE_FONT_FAMILIES.has(normalizedFont)) {
    return normalizedFont;
  }

  return 'Assistant';
}

function getRenderableFontFamily(textValue: string, fontFamily?: string) {
  return getNativeFontFamily(getEffectiveFontFamilyName(textValue, fontFamily));
}

function getSkiaFontFamily(fontFamily?: string) {
  return getNativeFontFamily(fontFamily);
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
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {textAnnotations.map((annotation) => {
        const metrics = getTextMetrics(annotation.data);
        const x = (annotation.data?.x / 100) * width;
        const y = (annotation.data?.y / 100) * height;
        const textValue = String(annotation.data?.text || '');
        const rotation = getRotationDegrees(annotation.data);
        const boxWidth = metrics.width + metrics.horizontalPadding * 2;
        const boxHeight = metrics.height + metrics.verticalPadding * 2;

        return (
          <View
            key={`${annotation.id}-canvas-group`}
            style={[
              styles.annotationTextContent,
              {
                left: x - metrics.horizontalPadding,
                top: y - metrics.ascent - metrics.verticalPadding,
                width: boxWidth,
                minHeight: boxHeight,
                transform: [{ rotate: `${rotation}deg` }],
              },
            ]}
          >
            <Text
              style={{
                color: annotation.data?.color || '#111827',
                fontFamily: getRenderableFontFamily(textValue, annotation.data?.fontFamily),
                fontSize: metrics.fontSize,
                lineHeight: metrics.lineHeight,
                ...getTextDirectionStyle(textValue),
              }}
            >
              {textValue}
            </Text>
          </View>
        );
      })}
    </View>
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
          !(
            (annotation.type === 'HIGHLIGHT' || annotation.type === 'DRAW') &&
            annotation.id === selectedAnnotationId
          )
      ),
    [annotations, selectedAnnotationId]
  );
  const livePath = useMemo(
    () =>
      drawPoints.length > 1
        ? Skia.Path.MakeFromSVGString(
            activeTool === 'DRAW'
              ? toPolylineSvgPath(drawPoints, width, height)
              : toSvgPath(drawPoints, width, height)
          )
        : null,
    [activeTool, drawPoints, height, width]
  );

  if (vectorAnnotations.length === 0 && !livePath) return null;

  return (
    <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
      {vectorAnnotations.map((annotation) => {
        const points = annotation.data?.points || [];
        if (points.length < 2) return null;
        if (annotation.type === 'HIGHLIGHT') {
          const canvasStrokeWidth = getCanvasStrokeWidth(annotation.data, width, HIGHLIGHT_DEFAULT_WIDTH);
          const rect = getHighlightRenderRect(
            points,
            width,
            height,
            canvasStrokeWidth
          );
          const rotation = (getRotationDegrees(annotation.data) * Math.PI) / 180;
          const centerX = rect.x + rect.width / 2;
          const centerY = rect.y + rect.height / 2;

          return (
            <SkiaGroup
              key={`${annotation.id}-highlight-rect`}
              transform={[
                { translateX: centerX },
                { translateY: centerY },
                { rotate: rotation },
                { translateX: -centerX },
                { translateY: -centerY },
              ]}
            >
              <SkiaRect
                x={rect.x}
                y={rect.y}
                width={rect.width}
                height={rect.height}
                color={annotation.data?.color || 'rgba(251,191,36,0.45)'}
                style="fill"
              />
            </SkiaGroup>
          );
        }

        const path = Skia.Path.MakeFromSVGString(
          toSvgPath(points, width, height)
        );
        if (!path) return null;
        const bounds = getPointsBounds(points);
        const centerX = (((bounds.minX + bounds.maxX) / 2) / 100) * width;
        const centerY = (((bounds.minY + bounds.maxY) / 2) / 100) * height;
        const rotation = (getRotationDegrees(annotation.data) * Math.PI) / 180;

        return (
          <SkiaGroup
            key={`${annotation.id}-vector-path`}
            transform={[
              { translateX: centerX },
              { translateY: centerY },
              { rotate: rotation },
              { translateX: -centerX },
              { translateY: -centerY },
            ]}
          >
            <SkiaPath
              path={path}
              color={annotation.data?.color || '#111827'}
              style="stroke"
              strokeWidth={getCanvasStrokeWidth(annotation.data, width, 3)}
              strokeCap="round"
              strokeJoin="round"
            />
          </SkiaGroup>
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
          strokeWidth={activeStrokeWidth}
          strokeCap="round"
          strokeJoin="round"
        />
      ) : null}
    </Canvas>
  );
});

const SignatureAnnotationsCanvas = memo(function SignatureAnnotationsCanvas({
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
  const signatureAnnotations = useMemo(
    () => annotations.filter((annotation) => annotation.type === 'SIGNATURE'),
    [annotations]
  );

  if (signatureAnnotations.length === 0) return null;

  return (
    <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
      {signatureAnnotations.map((annotation) => {
        if (annotation.id === selectedAnnotationId) return null;
        const x = ((annotation.data?.x || 0) / 100) * width;
        const y = ((annotation.data?.y || 0) / 100) * height;
        const targetWidth = ((annotation.data?.width || 0) / 100) * width;
        const targetHeight = ((annotation.data?.height || 0) / 100) * height;
        const rotation = getRotationDegrees(annotation.data);

        return (
          <G
            key={`${annotation.id}-signature-group`}
            x={x}
            y={y}
            rotation={rotation}
            originX={targetWidth / 2}
            originY={targetHeight / 2}
          >
            <FillSignAnnotationGraphic annotation={annotation} width={targetWidth} height={targetHeight} />
          </G>
        );
      })}
    </Svg>
  );
});

function FillSignAnnotationGraphic({
  annotation,
  width,
  height,
}: {
  annotation: Annotation;
  width: number;
  height: number;
}) {
  const kind = annotation.data?.kind || annotation.data?.slotType || 'signature';
  const color = annotation.data?.color || '#111827';

  if (kind === 'signature' || kind === 'initials') {
    if (typeof annotation.data?.imageUri === 'string' && annotation.data.imageUri) {
      return (
        <SvgImage
          href={{ uri: annotation.data.imageUri }}
          x={0}
          y={0}
          width={width}
          height={height}
          preserveAspectRatio="xMidYMid meet"
        />
      );
    }

    const sourceBounds = annotation.data?.sourceBounds || getSignaturePathsBounds(annotation.data?.paths || []);
    const scaleX = width / Math.max(sourceBounds.width, 1);
    const scaleY = height / Math.max(sourceBounds.height, 1);

    return (
      <G scaleX={scaleX} scaleY={scaleY}>
        <G translateX={-sourceBounds.minX} translateY={-sourceBounds.minY}>
          {(annotation.data?.paths || []).map((path: string, index: number) => (
            <SvgPath
              key={`${annotation.id}-graphic-path-${index}`}
              d={path}
              stroke={color}
              strokeWidth={3}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}
        </G>
      </G>
    );
  }

  if (kind === 'cross') {
    return (
      <>
        <SvgLine x1={0} y1={0} x2={width} y2={height} stroke={color} strokeWidth={3} strokeLinecap="round" />
        <SvgLine x1={width} y1={0} x2={0} y2={height} stroke={color} strokeWidth={3} strokeLinecap="round" />
      </>
    );
  }

  if (kind === 'check') {
    return (
      <SvgPath
        d={`M ${width * 0.08} ${height * 0.58} L ${width * 0.36} ${height * 0.88} L ${width * 0.92} ${height * 0.12}`}
        stroke={color}
        strokeWidth={3}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    );
  }

  if (kind === 'ellipse') {
    return (
      <SvgEllipse
        cx={width / 2}
        cy={height / 2}
        rx={Math.max(width / 2 - 1.5, 1)}
        ry={Math.max(height / 2 - 1.5, 1)}
        stroke={color}
        strokeWidth={3}
        fill="none"
      />
    );
  }

  if (kind === 'rect') {
    return (
      <SvgRect
        x={1.5}
        y={1.5}
        width={Math.max(width - 3, 1)}
        height={Math.max(height - 3, 1)}
        rx={2}
        ry={2}
        stroke={color}
        strokeWidth={3}
        fill="none"
      />
    );
  }

  if (kind === 'line') {
    return (
      <SvgLine
        x1={0}
        y1={height / 2}
        x2={width}
        y2={height / 2}
        stroke={color}
        strokeWidth={3}
        strokeLinecap="round"
      />
    );
  }

  return null;
}

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

  if (annotation.type === 'SIGNATURE') {
    const left = ((annotation.data?.x || 0) / 100) * width;
    const top = ((annotation.data?.y || 0) / 100) * height;
    const signatureWidth = ((annotation.data?.width || 0) / 100) * width;
    const signatureHeight = ((annotation.data?.height || 0) / 100) * height;
    const rotation = getRotationDegrees(annotation.data);

    return (
      <Pressable
        onPress={onPress}
        style={[
          styles.highlightHitbox,
          {
            left,
            top,
            width: Math.max(24, signatureWidth),
            height: Math.max(24, signatureHeight),
            transform: [{ rotate: `${rotation}deg` }],
          },
        ]}
        hitSlop={10}
      />
    );
  }

  if (annotation.type === 'DRAW') {
    return (
      <DrawAnnotationTouchItem
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
    getCanvasStrokeWidth(annotation.data, width, HIGHLIGHT_DEFAULT_WIDTH)
  );
  const rotation = getRotationDegrees(annotation.data);

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
          transform: [{ rotate: `${rotation}deg` }],
        },
      ]}
      hitSlop={10}
    />
  );
}

function DrawAnnotationTouchItem({
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
  const renderedBounds = getDrawScreenBounds(
    points,
    width,
    height,
    getCanvasStrokeWidth(annotation.data, width, 3)
  );
  const rotation = getRotationDegrees(annotation.data);

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
          transform: [{ rotate: `${rotation}deg` }],
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
  const textValue = String(annotation.data?.text || '');
  const x = ((annotation.data?.x || 0) / 100) * width;
  const y = ((annotation.data?.y || 0) / 100) * height;
  const metrics = getTextMetrics(annotation.data);
  const rotation = getRotationDegrees(annotation.data);
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
          transform: [{ rotate: `${rotation}deg` }],
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
  onRotate,
  onDecrease,
  onIncrease,
  onDelete,
  onEdit,
  onInteractionStart,
  onInteractionEnd,
}: {
  annotation: Annotation;
  width: number;
  height: number;
  zoom: number;
  activeFontSize: number;
  onPress: () => void;
  onDragEnd: (position: { x: number; y: number }) => void;
  onResize: (fontSize: number) => void;
  onRotate: (rotation: number) => void;
  onDecrease: () => void;
  onIncrease: () => void;
  onDelete: () => void;
  onEdit: () => void;
  onInteractionStart: () => void;
  onInteractionEnd: () => void;
}) {
  const textValue = String(annotation.data?.text || '');
  const x = ((annotation.data?.x || 0) / 100) * width;
  const y = ((annotation.data?.y || 0) / 100) * height;
  const [previewFontSize, setPreviewFontSize] = useState(annotation.data?.fontSize || activeFontSize);
  const [previewRotation, setPreviewRotation] = useState(getRotationDegrees(annotation.data));
  const previewFontSizeRef = useRef(previewFontSize);
  const previewRotationRef = useRef(previewRotation);
  const dragTranslateX = useSharedValue(0);
  const dragTranslateY = useSharedValue(0);
  const resizeStartFontSize = useSharedValue(annotation.data?.fontSize || activeFontSize);
  const resizeStartWidth = useSharedValue(1);
  const resizeStartHeight = useSharedValue(1);
  const rotationStart = useSharedValue(getRotationDegrees(annotation.data));

  useEffect(() => {
    const nextFontSize = annotation.data?.fontSize || activeFontSize;
    setPreviewFontSize(nextFontSize);
  }, [activeFontSize, annotation.data?.fontSize]);

  useEffect(() => {
    previewFontSizeRef.current = previewFontSize;
  }, [previewFontSize]);

  useEffect(() => {
    const nextRotation = getRotationDegrees(annotation.data);
    setPreviewRotation(nextRotation);
  }, [annotation.data]);

  useEffect(() => {
    previewRotationRef.current = previewRotation;
  }, [previewRotation]);

  useEffect(() => {
    dragTranslateX.value = 0;
    dragTranslateY.value = 0;
  }, [dragTranslateX, dragTranslateY, x, y]);

  const metrics = getTextMetrics({
    ...annotation.data,
    fontSize: previewFontSize,
  });
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
      { rotate: `${previewRotation}deg` },
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
        .runOnJS(true)
        .onTouchesDown(() => {
          onInteractionStart();
        })
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
        .onFinalize(() => {
          onInteractionEnd();
        }),
    [dragTranslateX, dragTranslateY, height, onDragEnd, onInteractionEnd, onInteractionStart, onPress, width, x, y]
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
        .onTouchesDown(() => {
          onInteractionStart();
        })
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
        })
        .onFinalize(() => {
          onInteractionEnd();
        }),
    [
      activeFontSize,
      annotation.data?.fontSize,
      boxHeight,
      boxWidth,
      onInteractionEnd,
      onInteractionStart,
      onPress,
      onResize,
      resizeStartFontSize,
      resizeStartHeight,
      resizeStartWidth,
    ]
  );

  const rotateGesture = useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .onTouchesDown(() => {
          onInteractionStart();
        })
        .onBegin(() => {
          onPress();
          rotationStart.value = getRotationDegrees(annotation.data);
        })
        .onUpdate((event) => {
          const nextRotation = getRotationFromGesture(rotationStart.value, event.translationX, event.translationY);
          previewRotationRef.current = nextRotation;
          setPreviewRotation(nextRotation);
        })
        .onEnd(() => {
          onRotate(previewRotationRef.current);
        })
        .onFinalize(() => {
          onInteractionEnd();
        }),
    [annotation.data, onInteractionEnd, onInteractionStart, onPress, onRotate, rotationStart]
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
          <Circle cx={-canvasHandleOffset} cy={-canvasHandleOffset} r={canvasHandleRadius} color="#ffffff" />
          <Circle cx={-canvasHandleOffset} cy={-canvasHandleOffset} r={canvasHandleRadius} color="#60a5fa" style="stroke" strokeWidth={canvasHandleStrokeWidth} />
          <Circle cx={boxWidth + canvasHandleOffset} cy={-canvasHandleOffset} r={canvasHandleRadius} color="#ffffff" />
          <Circle cx={boxWidth + canvasHandleOffset} cy={-canvasHandleOffset} r={canvasHandleRadius} color="#60a5fa" style="stroke" strokeWidth={canvasHandleStrokeWidth} />
          <Circle cx={-canvasHandleOffset} cy={boxHeight + canvasHandleOffset} r={canvasHandleRadius} color="#ffffff" />
          <Circle cx={-canvasHandleOffset} cy={boxHeight + canvasHandleOffset} r={canvasHandleRadius} color="#60a5fa" style="stroke" strokeWidth={canvasHandleStrokeWidth} />
          <Circle cx={boxWidth + canvasHandleOffset} cy={boxHeight + canvasHandleOffset} r={canvasHandleRadius} color="#ffffff" />
          <Circle cx={boxWidth + canvasHandleOffset} cy={boxHeight + canvasHandleOffset} r={canvasHandleRadius} color="#60a5fa" style="stroke" strokeWidth={canvasHandleStrokeWidth} />
        </Canvas>
        <View pointerEvents="none" style={styles.selectedTextContent}>
          <Text
            style={{
              color: annotation.data?.color || '#111827',
              fontFamily: getRenderableFontFamily(textValue, annotation.data?.fontFamily),
              fontSize: previewFontSize,
              lineHeight: metrics.lineHeight,
              ...getTextDirectionStyle(textValue),
            }}
          >
            {textValue}
          </Text>
        </View>
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
        <GestureDetector gesture={rotateGesture}>
          <Animated.View
            style={[
              styles.rotationHandle,
              {
                left: resizeHandleOffset,
                bottom: resizeHandleOffset,
                width: resizeHandleSize,
                height: resizeHandleSize,
                borderRadius: resizeHandleRadius,
                borderWidth: resizeHandleBorderWidth,
              },
            ]}
          >
            <Text style={[styles.rotationHandleText, { fontSize: resizeHandleFontSize - 1 }]}>↺</Text>
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
  onRotate,
  onDelete,
}: {
  annotation: Annotation;
  width: number;
  height: number;
  zoom: number;
  onPress: () => void;
  onDragEnd: (points: Array<{ x: number; y: number }>) => void;
  onResize: (nextValue: { points: Array<{ x: number; y: number }>; strokeWidth: number }) => void;
  onRotate: (rotation: number) => void;
  onDelete: () => void;
}) {
  const points = annotation.data?.points || [];
  const bounds = getPointsBounds(points);
  const strokeWidth = getCanvasStrokeWidth(annotation.data, width, HIGHLIGHT_DEFAULT_WIDTH);
  const [previewPoints, setPreviewPoints] = useState(points);
  const [previewStrokeWidth, setPreviewStrokeWidth] = useState(strokeWidth);
  const [previewRotation, setPreviewRotation] = useState(getRotationDegrees(annotation.data));
  const previewPointsRef = useRef(previewPoints);
  const previewStrokeWidthRef = useRef(previewStrokeWidth);
  const previewRotationRef = useRef(previewRotation);
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
  const rotationStart = useSharedValue(getRotationDegrees(annotation.data));
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
    const nextRotation = getRotationDegrees(annotation.data);
    setPreviewRotation(nextRotation);
  }, [annotation.data]);

  useEffect(() => {
    previewRotationRef.current = previewRotation;
  }, [previewRotation]);

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
      { rotate: `${previewRotation}deg` },
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
            strokeWidth: toRelativeStrokeWidth(previewStrokeWidthRef.current, width),
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

  const rotateGesture = useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .onBegin(() => {
          onPress();
          rotationStart.value = getRotationDegrees(annotation.data);
        })
        .onUpdate((event) => {
          const nextRotation = getRotationFromGesture(rotationStart.value, event.translationX, event.translationY);
          previewRotationRef.current = nextRotation;
          setPreviewRotation(nextRotation);
        })
        .onEnd(() => {
          onRotate(previewRotationRef.current);
        }),
    [annotation.data, onPress, onRotate, rotationStart]
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
        <GestureDetector gesture={rotateGesture}>
          <Animated.View
            style={[
              styles.rotationHandle,
              {
                left: resizeHandleOffset,
                bottom: resizeHandleOffset,
                width: resizeHandleSize,
                height: resizeHandleSize,
                borderRadius: resizeHandleRadius,
                borderWidth: resizeHandleBorderWidth,
              },
            ]}
          >
            <Text style={[styles.rotationHandleText, { fontSize: resizeHandleFontSize - 1 }]}>↺</Text>
          </Animated.View>
        </GestureDetector>
      </Animated.View>
    </>
  );
}

function SelectedDrawOverlay({
  annotation,
  width,
  height,
  zoom,
  onPress,
  onDragEnd,
  onResize,
  onRotate,
  onDelete,
}: {
  annotation: Annotation;
  width: number;
  height: number;
  zoom: number;
  onPress: () => void;
  onDragEnd: (points: Array<{ x: number; y: number }>) => void;
  onResize: (nextValue: { points: Array<{ x: number; y: number }>; strokeWidth: number }) => void;
  onRotate: (rotation: number) => void;
  onDelete: () => void;
}) {
  const points = annotation.data?.points || [];
  const bounds = getPointsBounds(points);
  const strokeWidth = getCanvasStrokeWidth(annotation.data, width, 3);
  const [previewPoints, setPreviewPoints] = useState(points);
  const [previewStrokeWidth, setPreviewStrokeWidth] = useState(strokeWidth);
  const [previewRotation, setPreviewRotation] = useState(getRotationDegrees(annotation.data));
  const previewPointsRef = useRef(previewPoints);
  const previewStrokeWidthRef = useRef(previewStrokeWidth);
  const previewRotationRef = useRef(previewRotation);
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
  const rotationStart = useSharedValue(getRotationDegrees(annotation.data));
  const resizeStartWidth = useSharedValue(Math.max(bounds.width, 0.5));
  const resizeStartHeight = useSharedValue(Math.max(bounds.height, 0.5));
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
    const nextRotation = getRotationDegrees(annotation.data);
    setPreviewRotation(nextRotation);
  }, [annotation.data]);

  useEffect(() => {
    previewRotationRef.current = previewRotation;
  }, [previewRotation]);

  useEffect(() => {
    dragTranslateX.value = 0;
    dragTranslateY.value = 0;
  }, [bounds.minX, bounds.minY, dragTranslateX, dragTranslateY]);

  const renderedBounds = getDrawScreenBounds(previewPoints, width, height, previewStrokeWidth);
  const overlayAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: dragTranslateX.value },
      { translateY: dragTranslateY.value },
      { rotate: `${previewRotation}deg` },
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
  const localPath = useMemo(
    () =>
      previewPoints.length > 1
        ? Skia.Path.MakeFromSVGString(
            toSvgPath(
              previewPoints,
              width,
              height,
              renderedBounds.left + renderedBounds.strokePadding,
              renderedBounds.top + renderedBounds.strokePadding
            )
          )
        : null,
    [height, previewPoints, renderedBounds.left, renderedBounds.strokePadding, renderedBounds.top, width]
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
          resizeStartHeight.value = Math.max(bounds.height, 0.5);
          resizeStartStrokeWidth.value = strokeWidth;
        })
        .onUpdate((event) => {
          const nextWidth = Math.max(1, resizeStartWidth.value + (event.translationX / Math.max(width, 1)) * 100);
          const nextHeight = Math.max(1, resizeStartHeight.value + (event.translationY / Math.max(height, 1)) * 100);
          const widthScale = nextWidth / Math.max(bounds.width, 0.5);
          const heightScale = nextHeight / Math.max(bounds.height, 0.5);
          const nextPoints = scalePointsFromBounds(points, nextWidth, nextHeight);
          const nextStrokeWidth = Math.max(1, resizeStartStrokeWidth.value * Math.max(widthScale, heightScale));
          previewPointsRef.current = nextPoints;
          previewStrokeWidthRef.current = nextStrokeWidth;
          setPreviewPoints(nextPoints);
          setPreviewStrokeWidth(nextStrokeWidth);
        })
        .onEnd(() => {
          onResize({
            points: previewPointsRef.current,
            strokeWidth: toRelativeStrokeWidth(previewStrokeWidthRef.current, width),
          });
        }),
    [
      bounds.height,
      bounds.width,
      height,
      onPress,
      onResize,
      points,
      resizeStartHeight,
      resizeStartStrokeWidth,
      resizeStartWidth,
      strokeWidth,
      width,
    ]
  );

  const rotateGesture = useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .onBegin(() => {
          onPress();
          rotationStart.value = getRotationDegrees(annotation.data);
        })
        .onUpdate((event) => {
          const nextRotation = getRotationFromGesture(rotationStart.value, event.translationX, event.translationY);
          previewRotationRef.current = nextRotation;
          setPreviewRotation(nextRotation);
        })
        .onEnd(() => {
          onRotate(previewRotationRef.current);
        }),
    [annotation.data, onPress, onRotate, rotationStart]
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
          {localPath && (
            <SkiaPath
              path={localPath}
              color={annotation.data?.color || '#111827'}
              style="stroke"
              strokeWidth={previewStrokeWidth}
              strokeCap="round"
              strokeJoin="round"
            />
          )}
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
        <GestureDetector gesture={rotateGesture}>
          <Animated.View
            style={[
              styles.rotationHandle,
              {
                left: resizeHandleOffset,
                bottom: resizeHandleOffset,
                width: resizeHandleSize,
                height: resizeHandleSize,
                borderRadius: resizeHandleRadius,
                borderWidth: resizeHandleBorderWidth,
              },
            ]}
          >
            <Text style={[styles.rotationHandleText, { fontSize: resizeHandleFontSize - 1 }]}>↺</Text>
          </Animated.View>
        </GestureDetector>
      </Animated.View>
    </>
  );
}

function SelectedFillSignOverlay({
  annotation,
  width,
  height,
  zoom,
  onPress,
  onDragEnd,
  onResize,
  onRotate,
  onDelete,
}: {
  annotation: Annotation;
  width: number;
  height: number;
  zoom: number;
  onPress: () => void;
  onDragEnd: (position: { x: number; y: number }) => void;
  onResize: (size: { width: number; height: number }) => void;
  onRotate: (rotation: number) => void;
  onDelete: () => void;
}) {
  const x = ((annotation.data?.x || 0) / 100) * width;
  const y = ((annotation.data?.y || 0) / 100) * height;
  const boxWidth = ((annotation.data?.width || 0) / 100) * width;
  const boxHeight = ((annotation.data?.height || 0) / 100) * height;
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
  const resizeStartWidth = useSharedValue(boxWidth);
  const resizeStartHeight = useSharedValue(boxHeight);
  const previewSizeRef = useRef({ width: boxWidth, height: boxHeight });
  const [previewSize, setPreviewSize] = useState({ width: boxWidth, height: boxHeight });
  const [previewRotation, setPreviewRotation] = useState(getRotationDegrees(annotation.data));
  const previewRotationRef = useRef(previewRotation);
  const rotationStart = useSharedValue(getRotationDegrees(annotation.data));

  useEffect(() => {
    const nextSize = { width: boxWidth, height: boxHeight };
    setPreviewSize(nextSize);
    previewSizeRef.current = nextSize;
  }, [boxHeight, boxWidth]);

  useEffect(() => {
    dragTranslateX.value = 0;
    dragTranslateY.value = 0;
  }, [dragTranslateX, dragTranslateY, x, y]);

  useEffect(() => {
    const nextRotation = getRotationDegrees(annotation.data);
    setPreviewRotation(nextRotation);
  }, [annotation.data]);

  useEffect(() => {
    previewRotationRef.current = previewRotation;
  }, [previewRotation]);

  const overlayAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: dragTranslateX.value },
      { translateY: dragTranslateY.value },
      { rotate: `${previewRotation}deg` },
    ] as const,
  }));
  const pillAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: dragTranslateX.value },
      { translateY: dragTranslateY.value },
    ] as const,
  }));
  const placePillAbove = y - pillSize - pillGap >= 12 * uiScale;
  const pillTop = placePillAbove ? y - pillSize - pillGap : y + previewSize.height + pillGap;
  const pillLeft = Math.max(12 * uiScale, Math.min(x + previewSize.width / 2 - pillSize / 2, width - pillSize - 12 * uiScale));

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
          const nextX = Math.max(0, Math.min(100 - (annotation.data?.width || 0), ((x + event.translationX) / Math.max(width, 1)) * 100));
          const nextY = Math.max(0, Math.min(100 - (annotation.data?.height || 0), ((y + event.translationY) / Math.max(height, 1)) * 100));
          onDragEnd({ x: nextX, y: nextY });
        }),
    [annotation.data, dragTranslateX, dragTranslateY, height, onDragEnd, onPress, width, x, y]
  );

  const resizeGesture = useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .onBegin(() => {
          onPress();
          resizeStartWidth.value = boxWidth;
          resizeStartHeight.value = boxHeight;
        })
        .onUpdate((event) => {
          const nextWidth = Math.max(18, resizeStartWidth.value + event.translationX);
          const nextHeight = Math.max(18, resizeStartHeight.value + event.translationY);
          const nextSize = { width: nextWidth, height: nextHeight };
          previewSizeRef.current = nextSize;
          setPreviewSize(nextSize);
        })
        .onEnd(() => {
          onResize({
            width: (previewSizeRef.current.width / Math.max(width, 1)) * 100,
            height: (previewSizeRef.current.height / Math.max(height, 1)) * 100,
          });
        }),
    [boxHeight, boxWidth, height, onPress, onResize, resizeStartHeight, resizeStartWidth, width]
  );

  const rotateGesture = useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .onBegin(() => {
          onPress();
          rotationStart.value = getRotationDegrees(annotation.data);
        })
        .onUpdate((event) => {
          const nextRotation = getRotationFromGesture(rotationStart.value, event.translationX, event.translationY);
          previewRotationRef.current = nextRotation;
          setPreviewRotation(nextRotation);
        })
        .onEnd(() => {
          onRotate(previewRotationRef.current);
        }),
    [annotation.data, onPress, onRotate, rotationStart]
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
            left: x,
            top: y,
            width: previewSize.width,
            height: previewSize.height,
          },
          overlayAnimatedStyle,
        ]}
      >
        <Svg style={StyleSheet.absoluteFill}>
          <FillSignAnnotationGraphic annotation={annotation} width={previewSize.width} height={previewSize.height} />
          <SvgRect
            x={0.75}
            y={0.75}
            width={Math.max(previewSize.width - 1.5, 1)}
            height={Math.max(previewSize.height - 1.5, 1)}
            stroke="#60a5fa"
            strokeWidth={1.5}
            fill="rgba(96,165,250,0.12)"
          />
        </Svg>
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
        <GestureDetector gesture={rotateGesture}>
          <Animated.View
            style={[
              styles.rotationHandle,
              {
                left: resizeHandleOffset,
                bottom: resizeHandleOffset,
                width: resizeHandleSize,
                height: resizeHandleSize,
                borderRadius: resizeHandleRadius,
                borderWidth: resizeHandleBorderWidth,
              },
            ]}
          >
            <Text style={[styles.rotationHandleText, { fontSize: resizeHandleFontSize - 1 }]}>↺</Text>
          </Animated.View>
        </GestureDetector>
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.bg,
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
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: '700',
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
    backgroundColor: theme.colors.surfaceSoft,
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
    backgroundColor: theme.colors.accentStrong,
  },
  zoomLabel: {
    minWidth: 52,
    textAlign: 'right',
    color: theme.colors.text,
    fontSize: 12,
    fontWeight: '700',
  },
  contextBar: {
    marginHorizontal: 20,
    marginBottom: 12,
    padding: 12,
    gap: 10,
  },
  contextBottomWrap: {
    marginHorizontal: 20,
    marginBottom: 24,
  },
  contextBarBottom: {
    padding: 12,
    gap: 10,
    backgroundColor: theme.colors.surface,
    marginHorizontal: 12,
    marginBottom: 12,
    borderRadius: 18,
    ...(Platform.OS === 'web'
      ? { boxShadow: `6px 6px 12px ${theme.neu.colors.darkShadow}, -6px -6px 12px ${theme.neu.colors.lightShadow}` } as any
      : {
          shadowColor: '#000',
          shadowOffset: { width: 5, height: 5 },
          shadowOpacity: 0.45,
          shadowRadius: 10,
          elevation: 8,
        }),
  },
  contextHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  contextTitle: {
    color: theme.colors.text,
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
    backgroundColor: theme.colors.accentStrong,
  },
  doneBtnText: {
    color: theme.colors.white,
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
  fillSignActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  fillSignActionBtn: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  fillSignActionBtnActive: {
    backgroundColor: theme.colors.infoSoft,
  },
  signatureTray: {
    gap: 14,
  },
  signatureTabRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  signatureTab: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceMuted,
  },
  signatureTabActive: {
    borderColor: theme.colors.info,
    backgroundColor: theme.colors.infoSoft,
  },
  signatureTabText: {
    color: theme.colors.textMuted,
    fontSize: 13,
    fontWeight: '700',
  },
  signatureTabTextActive: {
    color: theme.colors.text,
  },
  signatureTabEditBtn: {
    marginLeft: 'auto',
    width: 34,
    height: 34,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.accentStrong,
  },
  signatureTrayEmpty: {
    color: theme.colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
  },
  signatureTrayCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    backgroundColor: theme.colors.page,
    padding: 10,
  },
  signatureTrayPreview: {
    height: 46,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(17,17,17,0.08)',
    backgroundColor: theme.colors.page,
    overflow: 'hidden',
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
    backgroundColor: theme.colors.surfaceMuted,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  fontChipActive: {
    backgroundColor: theme.colors.accentStrong,
    borderColor: theme.colors.accentStrong,
  },
  fontChipText: {
    color: theme.colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  fontChipTextActive: {
    color: theme.colors.white,
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
    color: theme.colors.text,
    fontSize: 12,
    fontWeight: '700',
  },
  sliderValue: {
    color: theme.colors.textMuted,
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
    backgroundColor: theme.colors.accentStrong,
  },
  sliderThumb: {
    position: 'absolute',
    top: 0,
    marginLeft: -10,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: theme.colors.white,
    borderWidth: 2,
    borderColor: theme.colors.accentStrong,
  },
  miniBtn: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: theme.colors.surfaceSoft,
  },
  miniBtnText: {
    color: theme.colors.text,
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
    backgroundColor: theme.colors.page,
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
    backgroundColor: theme.colors.page,
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
    minWidth: 160,
  },
  annotationTextContent: {
    position: 'absolute',
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
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
  selectedTextContent: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-start',
    alignItems: 'flex-start',
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
    backgroundColor: theme.colors.white,
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
  rotationHandle: {
    position: 'absolute',
    backgroundColor: theme.colors.accentStrong,
    alignItems: 'center',
    justifyContent: 'center',
    borderColor: theme.colors.white,
    zIndex: 3,
  },
  rotationHandleText: {
    color: theme.colors.white,
    fontSize: 12,
    fontWeight: '700',
  },
  selectionActionPill: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 0,
    backgroundColor: theme.colors.bgAlt,
    borderRadius: 999,
    paddingHorizontal: 0,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: theme.colors.border,
    zIndex: 16,
  },
  selectionActionBtn: {
    paddingHorizontal: 6,
    paddingVertical: 8,
    borderRadius: 999,
  },
  selectionActionText: {
    color: theme.colors.text,
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
    backgroundColor: theme.colors.surfaceMuted,
  },
  pdfStatusOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: theme.colors.overlay,
  },
  placeholderText: {
    color: theme.colors.text,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  nativeHint: {
    color: theme.colors.textSoft,
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
    backgroundColor: theme.colors.surface,
    borderRadius: 22,
    gap: 8,
    ...(Platform.OS === 'web'
      ? { boxShadow: `6px 6px 12px ${theme.neu.colors.darkShadow}, -6px -6px 12px ${theme.neu.colors.lightShadow}` } as any
      : {
          shadowColor: '#000',
          shadowOffset: { width: 5, height: 5 },
          shadowOpacity: 0.45,
          shadowRadius: 10,
          elevation: 8,
        }),
  },
  toolBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeToolBtn: {
    backgroundColor: theme.colors.accentStrong,
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
    backgroundColor: theme.colors.surfaceSoft,
  },
  bottomPanel: {
    zIndex: 10,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: theme.colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 20,
    backgroundColor: theme.colors.surface,
    padding: 18,
    ...(Platform.OS === 'web'
      ? { boxShadow: `8px 8px 16px ${theme.neu.colors.darkShadow}, -8px -8px 16px ${theme.neu.colors.lightShadow}` } as any
      : {
          shadowColor: '#000',
          shadowOffset: { width: 6, height: 6 },
          shadowOpacity: 0.5,
          shadowRadius: 12,
          elevation: 10,
        }),
  },
  modalTitle: {
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 12,
  },
  modalInput: {
    minHeight: 110,
    borderRadius: 14,
    backgroundColor: theme.colors.surfaceMuted,
    color: theme.colors.text,
    padding: 12,
    textAlignVertical: 'top',
    ...(Platform.OS === 'web'
      ? { boxShadow: theme.neu.shadowStyles.lightLayerInset.boxShadow } as any
      : {}),
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 14,
  },
  commentAuthor: {
    color: theme.colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 8,
  },
  commentBody: {
    color: theme.colors.text,
    fontSize: 15,
    lineHeight: 22,
  },
  modalBtnGhost: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: theme.colors.surfaceSoft,
  },
  modalBtnGhostText: {
    color: theme.colors.text,
    fontWeight: '600',
  },
  modalBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: theme.colors.accentStrong,
  },
  modalBtnText: {
    color: theme.colors.white,
    fontWeight: '700',
  },
});
