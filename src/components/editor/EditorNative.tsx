import React, { Fragment, useEffect, useMemo, useRef, useState } from 'react';
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
  type ScrollView as RNScrollView,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import {
  Check,
  ChevronLeft,
  Circle as CircleIcon,
  Download,
  FileText,
  Highlighter,
  LineSquiggle,
  MessageSquare,
  Minus,
  MousePointer2,
  PenTool,
  Square,
  SquarePen,
  Trash2,
  Type,
  Undo2,
  Redo2,
  X,
  Zap,
  ZoomIn,
  ZoomOut,
} from 'lucide-react-native';
import { PDFDocument as PDFLib } from 'pdf-lib';
import { collection, doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { G, Image as SvgImage, Path as SvgPath } from 'react-native-svg';
import { db } from '../../firebase';
import { savePdf } from '../../lib/savePdf';
import { useStore } from '../../store/useStore';
import type { Annotation, PDFDocument } from '../../types';
import { theme } from '../../theme';
import NeumorphicButton from '../NeumorphicButton';
import NeumorphicView from '../NeumorphicView';
import { PdfPageCard } from './native/PdfPageCard';
import { StrokeWidthSlider } from './native/controls/StrokeWidthSlider';
import { ToolButton, ToolButtonLite } from './native/controls/ToolButton';
import { ZoomSlider } from './native/controls/ZoomSlider';
import {
  AUTOSAVE_DEBOUNCE_MS,
  EMPTY_POINTS,
  FONT_OPTIONS,
  HIGHLIGHT_COLORS,
  HIGHLIGHT_DEFAULT_COLOR,
  HIGHLIGHT_DEFAULT_WIDTH,
  INACTIVE_PEN_COLOR,
  INACTIVE_PEN_WIDTH,
  MAX_ZOOM,
  MIN_STROKE_POINT_DISTANCE,
  MIN_ZOOM,
  PAGE_RENDER_WINDOW,
  PAGE_STACK_GAP,
  RELATIVE_STROKE_WIDTH_MODE,
  TEXT_COLORS,
} from './native/constants';
import type { DraftInput, EditorProps, FillSignAction, SavedSignatureSlot } from './native/types';
import { styles } from './native/styles';
import {
  getCanvasStrokeWidth,
  getFillSignActionForAnnotation,
  getSignaturePathsBounds,
  parseSignatureSlot,
  stripUndefinedDeep,
  toRelativeStrokeWidth,
} from './native/utils/helpers';
import {
  getPointDistance,
  getPointsBounds,
  simplifyStrokePoints,
  toHighlightColor,
} from './native/utils/geometry';
import { nextId } from './native/utils/ids';

const { width, height } = Dimensions.get('window');

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
            <ToolButton icon={MessageSquare} active={isCommentTool} onPress={() => setActiveTool('COMMENT')} />
            <ToolButton icon={PenTool} active={isSignatureTool} onPress={() => setActiveTool('SIGNATURE')} />
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
