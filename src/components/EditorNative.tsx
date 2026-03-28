import React, { useEffect, useMemo, useRef, useState } from 'react';
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
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Check, ChevronLeft, ChevronRight, Download, FileText, Highlighter, MessageSquare, MousePointer2, PenTool, Save, Trash2, Type, Undo2, Redo2, ZoomIn, ZoomOut } from 'lucide-react-native';
import { PDFDocument as PDFLib } from 'pdf-lib';
import { doc, updateDoc } from 'firebase/firestore';
import Pdf from 'react-native-pdf';
import { Canvas, Circle, Path as SkiaPath, Rect as SkiaRect, Skia, Text as SkiaText, matchFont } from '@shopify/react-native-skia';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { db } from '../firebase';
import { savePdf } from '../lib/savePdf';
import { useStore } from '../store/useStore';
import type { Annotation } from '../types';
import { SafeAreaView } from 'react-native-safe-area-context';

const { width, height } = Dimensions.get('window');

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
const MIN_STROKE_POINT_DISTANCE = 0.35;
const TEXT_ASCENT_RATIO = 0.78;
const TEXT_DESCENT_RATIO = 0.06;
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

export default function EditorNative({ setView }: EditorProps) {
  const {
    user,
    currentDocument,
    activeTool,
    setActiveTool,
    annotations,
    addAnnotation,
    updateAnnotation,
    removeAnnotation,
    undo,
    redo,
    canUndo,
    canRedo,
    penColor,
    setPenColor,
    fontFamily,
    setFontFamily,
    fontSize,
    setFontSize,
    selectedAnnotationId,
    setSelectedAnnotation,
  } = useStore();

  const [currentPage, setCurrentPage] = useState(0);
  const [resolvedPageCount, setResolvedPageCount] = useState(Math.max(currentDocument?.totalPages || 1, 1));
  const [loadingPdf, setLoadingPdf] = useState(true);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [surfaceSize, setSurfaceSize] = useState({ width: width * 0.9, height: height * 0.6 });
  const [drawPoints, setDrawPoints] = useState<Array<{ x: number; y: number }>>([]);
  const [draftInput, setDraftInput] = useState<DraftInput | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [commentViewer, setCommentViewer] = useState<Annotation | null>(null);

  const drawPointsRef = useRef<Array<{ x: number; y: number }>>([]);

  useEffect(() => {
    setCurrentPage(0);
    setResolvedPageCount(Math.max(currentDocument?.totalPages || 1, 1));
    setLoadingPdf(true);
    setPdfError(null);
    setZoom(1);
    setDrawPoints([]);
    drawPointsRef.current = [];
  }, [currentDocument?.id, currentDocument?.totalPages]);

  const pageCount = Math.max(resolvedPageCount || currentDocument?.totalPages || 1, 1);
  const renderPageWidth = surfaceSize.width * zoom;
  const renderPageHeight = surfaceSize.height * zoom;

  const pageAnnotations = useMemo(
    () => annotations.filter((annotation) => annotation.pageIndex === currentPage),
    [annotations, currentPage]
  );
  const selectedAnnotation = pageAnnotations.find((annotation) => annotation.id === selectedAnnotationId) || null;
  const selectedTextAnnotation = selectedAnnotation?.type === 'TEXT' ? selectedAnnotation : null;
  const isTextDrafting = draftInput?.kind === 'TEXT';
  const showTextControls = activeTool === 'TEXT' || !!selectedTextAnnotation || isTextDrafting;
  const showSelectionControls = !!selectedAnnotation && activeTool === 'SELECT' && !selectedTextAnnotation;
  const activeTextColor = selectedTextAnnotation?.data?.color || penColor;
  const activeTextFont = selectedTextAnnotation?.data?.fontFamily || fontFamily;
  const activeTextSize = selectedTextAnnotation?.data?.fontSize || fontSize;
  const selectedTextMetrics = selectedTextAnnotation ? getTextMetrics(selectedTextAnnotation.data) : null;

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

  const clampPoint = (locationX: number, locationY: number) => ({
    x: Math.max(0, Math.min(100, ((locationX / Math.max(zoom, 0.01)) / Math.max(surfaceSize.width, 1)) * 100)),
    y: Math.max(0, Math.min(100, ((locationY / Math.max(zoom, 0.01)) / Math.max(surfaceSize.height, 1)) * 100)),
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
      setDrawPoints([point]);
    }
  };

  const updateCanvasGesture = (locationX: number, locationY: number) => {
    if (activeTool !== 'DRAW' && activeTool !== 'HIGHLIGHT') return;
    const point = clampPoint(locationX, locationY);
    const lastPoint = drawPointsRef.current[drawPointsRef.current.length - 1];
    if (lastPoint && getPointDistance(lastPoint, point) < MIN_STROKE_POINT_DISTANCE) {
      return;
    }
    const next = [...drawPointsRef.current, point];
    drawPointsRef.current = next;
    setDrawPoints(next);
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
          color: activeTool === 'HIGHLIGHT' ? 'rgba(251,191,36,0.45)' : '#111827',
          strokeWidth: activeTool === 'HIGHLIGHT' ? 12 : 3,
        },
      });
      setSelectedAnnotation(null);
      setActiveTool('SELECT');
    }
    drawPointsRef.current = [];
    setDrawPoints([]);
  };

  const commitDraftInput = () => {
    if (!draftInput) return;
    const value = inputValue.trim();
    if (value) {
      const annotation = {
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
      } satisfies Annotation;
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
  };

  const cancelDraftInput = () => {
    Keyboard.dismiss();
    setDraftInput(null);
    setInputValue('');
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
  }, [activeTool, currentPage, surfaceSize.height, surfaceSize.width]);

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

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
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
          <TouchableOpacity onPress={() => setCurrentPage((page) => Math.max(0, page - 1))} disabled={currentPage <= 0} style={[styles.actionBtn, currentPage <= 0 && styles.disabledBtn]}>
            <ChevronLeft size={20} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setCurrentPage((page) => Math.min(pageCount - 1, page + 1))} disabled={currentPage >= pageCount - 1} style={[styles.actionBtn, currentPage >= pageCount - 1 && styles.disabledBtn]}>
            <ChevronRight size={20} color="#fff" />
          </TouchableOpacity>
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

      <View style={styles.zoomBar}>
        <TouchableOpacity style={styles.zoomBtn} onPress={() => setZoom((value) => Math.max(0.7, Number((value - 0.15).toFixed(2))))}>
          <ZoomOut size={16} color="#fff" />
        </TouchableOpacity>
        <View style={styles.zoomTrack}>
          <View style={[styles.zoomFill, { width: `${((zoom - 0.7) / (2.5 - 0.7)) * 100}%` }]} />
        </View>
        <TouchableOpacity style={styles.zoomBtn} onPress={() => setZoom((value) => Math.min(2.5, Number((value + 0.15).toFixed(2))))}>
          <ZoomIn size={16} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.zoomLabel}>{Math.round(zoom * 100)}%</Text>
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

      <View style={styles.editorArea}>
        <ScrollView
          contentContainerStyle={styles.editorScrollContent}
          showsVerticalScrollIndicator={false}
          showsHorizontalScrollIndicator={false}
        >
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pageWrapper}>
            <View style={styles.pageStack}>
              {Array.from({ length: pageCount }, (_, pageIndex) => {
                const annotationsForPage = annotations.filter((annotation) => annotation.pageIndex === pageIndex);
                const isActivePage = pageIndex === currentPage;

                return (
                  <Pressable
                    key={`${currentDocument?.id || 'doc'}-page-${pageIndex}`}
                    onPress={() => setCurrentPage(pageIndex)}
                    style={[styles.pdfPage, styles.zoomedPageFrame, { width: renderPageWidth, height: renderPageHeight }]}
                  >
                    <View
                      style={[
                        styles.pdfBaseLayer,
                        {
                          width: surfaceSize.width,
                          height: surfaceSize.height,
                          transform: [{ scale: zoom }],
                        },
                      ]}
                      onLayout={(event) => {
                        if (!isActivePage) return;
                        const { width: layoutWidth, height: layoutHeight } = event.nativeEvent.layout;
                        if (Math.abs(layoutWidth - surfaceSize.width) > 0.5 || Math.abs(layoutHeight - surfaceSize.height) > 0.5) {
                          setSurfaceSize({ width: layoutWidth, height: layoutHeight });
                        }
                      }}
                    >
                      {currentDocument?.fileUrl ? (
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
                          onLoadComplete={(numberOfPages) => {
                            setResolvedPageCount(Math.max(numberOfPages, 1));
                            setLoadingPdf(false);
                            setPdfError(null);
                          }}
                          onError={(error) => {
                            console.error('PDF render error:', error);
                            const message = error instanceof Error ? error.message : String(error);
                            setPdfError(message || 'Failed to render this PDF on native.');
                            setLoadingPdf(false);
                          }}
                          renderActivityIndicator={() => (
                            <View style={styles.pdfPlaceholder}>
                              <ActivityIndicator size="large" color="#fff" />
                              <Text style={styles.nativeHint}>Loading PDF...</Text>
                            </View>
                          )}
                        />
                      ) : (
                        <View style={styles.pdfPlaceholder}>
                          <FileText size={64} color="rgba(255,255,255,0.05)" />
                          <Text style={styles.placeholderText}>NO PDF</Text>
                          <Text style={styles.nativeHint}>This document does not have a file URL yet.</Text>
                        </View>
                      )}

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
                            annotations={annotationsForPage}
                            width={surfaceSize.width}
                            height={surfaceSize.height}
                            selectedAnnotationId={selectedAnnotationId}
                          />
                          <CommentAnnotationsCanvas
                            annotations={annotationsForPage}
                            width={surfaceSize.width}
                            height={surfaceSize.height}
                            selectedAnnotationId={selectedAnnotationId}
                          />
                          <VectorAnnotationsCanvas
                            annotations={annotationsForPage}
                            drawPoints={isActivePage ? drawPoints : []}
                            activeTool={activeTool}
                            width={surfaceSize.width}
                            height={surfaceSize.height}
                          />
                          {annotationsForPage.map((annotation) => (
                            annotation.id === selectedAnnotationId && annotation.type === 'TEXT' ? (
                              <SelectedTextOverlay
                                key={annotation.id}
                                annotation={annotation}
                                width={surfaceSize.width}
                                height={surfaceSize.height}
                                activeFontSize={activeTextSize}
                                onPress={() => setSelectedAnnotation(annotation.id)}
                                onDragEnd={(position) => {
                                  updateAnnotation(annotation.id, {
                                    data: {
                                      ...annotation.data,
                                      ...position,
                                    },
                                  });
                                }}
                                onResize={(nextFontSize) => {
                                  updateAnnotation(annotation.id, {
                                    data: {
                                      ...annotation.data,
                                      fontSize: nextFontSize,
                                    },
                                  });
                                }}
                                onDecrease={() => applyTextStyleUpdate({ fontSize: Math.max(12, activeTextSize - 2) })}
                                onIncrease={() => applyTextStyleUpdate({ fontSize: Math.min(72, activeTextSize + 2) })}
                                onDelete={() => {
                                  removeAnnotation(annotation.id);
                                  setSelectedAnnotation(null);
                                }}
                              />
                            ) : (
                              <AnnotationTouchItem
                                key={annotation.id}
                                annotation={annotation}
                                width={surfaceSize.width}
                                height={surfaceSize.height}
                                selected={annotation.id === selectedAnnotationId}
                                selectable={activeTool === 'SELECT' && isActivePage}
                                onPress={() => {
                                  setCurrentPage(pageIndex);
                                  setSelectedAnnotation(annotation.id);
                                  if (annotation.type === 'COMMENT') {
                                    setCommentViewer(annotation);
                                  }
                                }}
                                onDragEnd={(position) => {
                                  updateAnnotation(annotation.id, {
                                    data: {
                                      ...annotation.data,
                                      ...position,
                                    },
                                  });
                                }}
                                onResize={(nextFontSize) => {
                                  updateAnnotation(annotation.id, {
                                    data: {
                                      ...annotation.data,
                                      fontSize: nextFontSize,
                                    },
                                  });
                                }}
                              />
                            )
                          ))}
                        </View>
                        {isActivePage && isTextDrafting && draftInput && (
                          <View
                            pointerEvents="box-none"
                            style={[
                              styles.inlineTextEditor,
                              {
                                left: (draftInput.x / 100) * surfaceSize.width,
                                top: (draftInput.y / 100) * surfaceSize.height - activeTextSize,
                              },
                            ]}
                          >
                            <TextInput
                              value={inputValue}
                              onChangeText={setInputValue}
                              placeholder="Enter your text"
                              placeholderTextColor="rgba(255,255,255,0.5)"
                              autoFocus
                              blurOnSubmit
                              returnKeyType="done"
                              onSubmitEditing={commitDraftInput}
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
                              <Text style={styles.placeholderText}>PAGE {currentPage + 1}</Text>
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
              })}
            </View>
          </ScrollView>
        </ScrollView>
      </View>

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
        ) : (
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

function ToolButton({ icon: Icon, active, onPress }: { icon: any; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity style={[styles.toolBtn, active && styles.activeToolBtn]} onPress={onPress}>
      <Icon size={24} color={active ? '#000' : 'rgba(255,255,255,0.4)'} />
    </TouchableOpacity>
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
    width: Math.max(12, longestLine * fontSize * 0.54),
    height: Math.max(fontSize * 0.84, ascent + descent + Math.max(0, lines.length - 1) * lineHeight),
  };
}

function getSkiaFontFamily(fontFamily?: string) {
  return SKIA_FONT_FAMILY_MAP[fontFamily || ''] || 'Helvetica';
}

function TextAnnotationsCanvas({
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
  const textAnnotations = annotations.filter(
    (annotation) => annotation.type === 'TEXT' && annotation.id !== selectedAnnotationId
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

        return metrics.lines.map((line, index) => (
          <SkiaText
            key={`${annotation.id}-canvas-line-${index}`}
            x={x}
            y={y + index * metrics.lineHeight}
            text={line || ' '}
            font={font}
            color={annotation.data?.color || '#111827'}
          />
        ));
      })}
    </Canvas>
  );
}

function VectorAnnotationsCanvas({
  annotations,
  drawPoints,
  activeTool,
  width,
  height,
}: {
  annotations: Annotation[];
  drawPoints: Array<{ x: number; y: number }>;
  activeTool: string;
  width: number;
  height: number;
}) {
  const vectorAnnotations = annotations.filter(
    (annotation) => annotation.type === 'DRAW' || annotation.type === 'HIGHLIGHT'
  );
  const livePath = drawPoints.length > 1 ? Skia.Path.MakeFromSVGString(toSvgPath(drawPoints, width, height)) : null;

  if (vectorAnnotations.length === 0 && !livePath) return null;

  return (
    <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
      {vectorAnnotations.map((annotation) => {
        const points = annotation.data?.points || [];
        if (points.length < 2) return null;
        const path = Skia.Path.MakeFromSVGString(toSvgPath(points, width, height));
        if (!path) return null;

        return (
          <SkiaPath
            key={`${annotation.id}-vector-path`}
            path={path}
            color={annotation.data?.color || (annotation.type === 'HIGHLIGHT' ? 'rgba(251,191,36,0.45)' : '#111827')}
            style="stroke"
            strokeWidth={annotation.data?.strokeWidth || (annotation.type === 'HIGHLIGHT' ? 12 : 3)}
            strokeCap="round"
            strokeJoin="round"
          />
        );
      })}
      {livePath && (
        <SkiaPath
          path={livePath}
          color={activeTool === 'HIGHLIGHT' ? 'rgba(251,191,36,0.45)' : '#111827'}
          style="stroke"
          strokeWidth={activeTool === 'HIGHLIGHT' ? 12 : 3}
          strokeCap="round"
          strokeJoin="round"
        />
      )}
    </Canvas>
  );
}

function CommentAnnotationsCanvas({
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
  const commentAnnotations = annotations.filter((annotation) => annotation.type === 'COMMENT');

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
}

function AnnotationTouchItem({
  annotation,
  width,
  height,
  selected,
  selectable,
  onPress,
  onDragEnd,
  onResize,
}: {
  annotation: Annotation;
  width: number;
  height: number;
  selected: boolean;
  selectable: boolean;
  onPress: () => void;
  onDragEnd: (position: { x: number; y: number }) => void;
  onResize: (fontSize: number) => void;
}) {
  if (!selectable) return null;

  if (annotation.type === 'TEXT') {
    return (
      <TextAnnotationTouchItem
        annotation={annotation}
        width={width}
        height={height}
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

  return null;
}

function TextAnnotationTouchItem({
  annotation,
  width,
  height,
  selected,
  onPress,
  onDragEnd,
  onResize,
}: {
  annotation: Annotation;
  width: number;
  height: number;
  selected: boolean;
  onPress: () => void;
  onDragEnd: (position: { x: number; y: number }) => void;
  onResize: (fontSize: number) => void;
}) {
  const x = ((annotation.data?.x || 0) / 100) * width;
  const y = ((annotation.data?.y || 0) / 100) * height;
  const metrics = getTextMetrics(annotation.data);
  const [previewFontSize, setPreviewFontSize] = useState(annotation.data?.fontSize || metrics.fontSize);
  const dragTranslateX = useSharedValue(0);
  const dragTranslateY = useSharedValue(0);
  const resizeStartFontSize = useSharedValue(annotation.data?.fontSize || metrics.fontSize);
  const resizeStartWidth = useSharedValue(1);
  const resizeStartHeight = useSharedValue(1);
  const previewMetrics = getTextMetrics({
    ...annotation.data,
    fontSize: previewFontSize,
  });

  useEffect(() => {
    setPreviewFontSize(annotation.data?.fontSize || metrics.fontSize);
  }, [annotation.data?.fontSize, metrics.fontSize]);

  const hitboxAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: dragTranslateX.value },
      { translateY: dragTranslateY.value },
    ],
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
          dragTranslateX.value = 0;
          dragTranslateY.value = 0;
          onDragEnd({ x: nextX, y: nextY });
        })
        .onFinalize(() => {
          dragTranslateX.value = 0;
          dragTranslateY.value = 0;
        }),
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
          const nextWidth = Math.max(36, resizeStartWidth.value + event.translationX);
          const nextHeight = Math.max(24, resizeStartHeight.value + event.translationY);
          const widthScale = nextWidth / Math.max(resizeStartWidth.value, 1);
          const heightScale = nextHeight / Math.max(resizeStartHeight.value, 1);
          setPreviewFontSize(
            Math.max(12, Math.min(72, resizeStartFontSize.value * Math.max(widthScale, heightScale)))
          );
        })
        .onEnd(() => {
          onResize(previewFontSize);
        }),
    [annotation.data?.fontSize, metrics.fontSize, onPress, onResize, previewFontSize, previewMetrics.height, previewMetrics.horizontalPadding, previewMetrics.verticalPadding, previewMetrics.width, resizeStartFontSize, resizeStartHeight, resizeStartWidth]
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
          <View style={[styles.selectionHandle, styles.selectionHandleTopLeft]} />
          <View style={[styles.selectionHandle, styles.selectionHandleTopRight]} />
          <View style={[styles.selectionHandle, styles.selectionHandleBottomLeft]} />
          <View style={[styles.selectionHandle, styles.selectionHandleBottomRight]} />
          <GestureDetector gesture={resizeGesture}>
            <Animated.View style={styles.resizeHandle}>
              <Text style={styles.resizeHandleText}>↘</Text>
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
  activeFontSize,
  onPress,
  onDragEnd,
  onResize,
  onDecrease,
  onIncrease,
  onDelete,
}: {
  annotation: Annotation;
  width: number;
  height: number;
  activeFontSize: number;
  onPress: () => void;
  onDragEnd: (position: { x: number; y: number }) => void;
  onResize: (fontSize: number) => void;
  onDecrease: () => void;
  onIncrease: () => void;
  onDelete: () => void;
}) {
  const x = ((annotation.data?.x || 0) / 100) * width;
  const y = ((annotation.data?.y || 0) / 100) * height;
  const [previewFontSize, setPreviewFontSize] = useState(annotation.data?.fontSize || activeFontSize);
  const dragTranslateX = useSharedValue(0);
  const dragTranslateY = useSharedValue(0);
  const resizeStartFontSize = useSharedValue(annotation.data?.fontSize || activeFontSize);
  const resizeStartWidth = useSharedValue(1);
  const resizeStartHeight = useSharedValue(1);

  useEffect(() => {
    const nextFontSize = annotation.data?.fontSize || activeFontSize;
    setPreviewFontSize(nextFontSize);
  }, [activeFontSize, annotation.data?.fontSize]);

  const metrics = getTextMetrics({ ...annotation.data, fontSize: previewFontSize });
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
  const pillWidth = 160;
  const pillHeight = 52;
  const pillGap = 18;
  const placePillAbove = boxTop - pillHeight - pillGap >= 12;
  const pillTop = placePillAbove ? boxTop - pillHeight - pillGap : boxTop + boxHeight + pillGap;
  const pillLeft = Math.max(12, Math.min(boxLeft + boxWidth / 2 - pillWidth / 2, width - pillWidth - 12));

  const overlayAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: dragTranslateX.value },
      { translateY: dragTranslateY.value },
    ],
  }));

  const pillAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: dragTranslateX.value },
      { translateY: dragTranslateY.value },
    ],
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
          dragTranslateX.value = 0;
          dragTranslateY.value = 0;
          runOnJS(onDragEnd)({ x: nextX, y: nextY });
        })
        .onFinalize(() => {
          dragTranslateX.value = 0;
          dragTranslateY.value = 0;
        }),
    [dragTranslateX, dragTranslateY, height, onDragEnd, onPress, width, x, y]
  );

  const resizeGesture = useMemo(
    () =>
      Gesture.Pan()
        .onBegin(() => {
          runOnJS(onPress)();
          resizeStartFontSize.value = annotation.data?.fontSize || activeFontSize;
          resizeStartWidth.value = boxWidth;
          resizeStartHeight.value = boxHeight;
        })
        .onUpdate((event) => {
          const nextWidth = Math.max(36, resizeStartWidth.value + event.translationX);
          const nextHeight = Math.max(24, resizeStartHeight.value + event.translationY);
          const widthScale = nextWidth / Math.max(resizeStartWidth.value, 1);
          const heightScale = nextHeight / Math.max(resizeStartHeight.value, 1);
          const nextFontSize = Math.max(
            12,
            Math.min(72, resizeStartFontSize.value * Math.max(widthScale, heightScale))
          );
          runOnJS(setPreviewFontSize)(nextFontSize);
        })
        .onEnd(() => {
          runOnJS(onResize)(previewFontSize);
        })
        .onFinalize(() => {
          resizeStartFontSize.value = annotation.data?.fontSize || activeFontSize;
        }),
    [
      activeFontSize,
      annotation.data?.fontSize,
      boxHeight,
      boxWidth,
      onPress,
      onResize,
      previewFontSize,
      resizeStartFontSize,
      resizeStartHeight,
      resizeStartWidth,
    ]
  );

  return (
    <>
      <Animated.View style={[styles.selectionActionPill, { left: pillLeft, top: pillTop, width: pillWidth }, pillAnimatedStyle]}>
        <TouchableOpacity style={styles.selectionActionBtn} onPress={onDecrease}>
          <Text style={styles.selectionActionText}>A-</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.selectionActionBtn} onPress={onIncrease}>
          <Text style={styles.selectionActionText}>A+</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.selectionActionBtn, styles.selectionDeleteBtn]} onPress={onDelete}>
          <Trash2 size={16} color="#fff" />
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
          <SkiaRect
            x={0}
            y={0}
            width={boxWidth}
            height={boxHeight}
            color="rgba(96,165,250,0.18)"
            style="fill"
          />
          <SkiaRect
            x={0}
            y={0}
            width={boxWidth}
            height={boxHeight}
            color="#60a5fa"
            style="stroke"
            strokeWidth={1.5}
          />
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
          <Circle cx={-5} cy={-5} r={5} color="#ffffff" />
          <Circle cx={-5} cy={-5} r={5} color="#60a5fa" style="stroke" strokeWidth={1.5} />
          <Circle cx={boxWidth + 5} cy={-5} r={5} color="#ffffff" />
          <Circle cx={boxWidth + 5} cy={-5} r={5} color="#60a5fa" style="stroke" strokeWidth={1.5} />
          <Circle cx={-5} cy={boxHeight + 5} r={5} color="#ffffff" />
          <Circle cx={-5} cy={boxHeight + 5} r={5} color="#60a5fa" style="stroke" strokeWidth={1.5} />
          <Circle cx={boxWidth + 5} cy={boxHeight + 5} r={5} color="#ffffff" />
          <Circle cx={boxWidth + 5} cy={boxHeight + 5} r={5} color="#60a5fa" style="stroke" strokeWidth={1.5} />
        </Canvas>
        <GestureDetector gesture={dragGesture}>
          <Animated.View style={styles.selectedTextDragSurface} />
        </GestureDetector>
        <GestureDetector gesture={resizeGesture}>
          <Animated.View style={styles.resizeHandle}>
            <Text style={styles.resizeHandleText}>↘</Text>
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
  zoomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 20,
    marginBottom: 12,
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
    height: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden',
  },
  zoomFill: {
    height: '100%',
    backgroundColor: '#ec6400',
  },
  zoomLabel: {
    minWidth: 48,
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
    gap: 18,
    paddingVertical: 8,
  },
  pdfPage: {
    backgroundColor: '#111',
    borderRadius: 24,
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
  selectedTextOverlay: {
    position: 'absolute',
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
