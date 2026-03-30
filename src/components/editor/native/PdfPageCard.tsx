import React, { memo } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import { FileText } from 'lucide-react-native';
import type { Annotation, PDFDocument } from '../../../types';
import { AnnotationTouchItem } from './annotations/TouchItems';
import { SelectedDrawOverlay } from './annotations/SelectedDrawOverlay';
import { SelectedFillSignOverlay } from './annotations/SelectedFillSignOverlay';
import { SelectedHighlightOverlay } from './annotations/SelectedHighlightOverlay';
import { SelectedTextOverlay } from './annotations/SelectedTextOverlay';
import { CommentAnnotationsCanvas } from './canvas/CommentAnnotationsCanvas';
import { SignatureAnnotationsCanvas } from './canvas/SignatureAnnotationsCanvas';
import { TextAnnotationsCanvas } from './canvas/TextAnnotationsCanvas';
import { VectorAnnotationsCanvas } from './canvas/VectorAnnotationsCanvas';
import { RELATIVE_STROKE_WIDTH_MODE } from './constants';
import type { DraftInput } from './types';
import { PdfPageSurface } from './PdfPageSurface';
import { styles } from './styles';
import { getRenderableFontFamily } from './utils/geometry';

export const PdfPageCard = memo(function PdfPageCard({
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
  let textDraftEditorLayout: {
    editorWidth: number;
    editorMinH: number;
    left: number;
    top: number;
  } | null = null;
  if (isTextDrafting && draftInput) {
    const editorMinW = 160;
    const desiredMaxW = Math.min(surfaceWidth * 0.85, 520);
    const editorMinH = activeTextSize + (Platform.OS === 'android' ? 16 : 10);
    const rawLeft = Math.max(0, (draftInput.x / 100) * surfaceWidth);
    const rawTop = (draftInput.y / 100) * surfaceHeight - activeTextSize;
    const spaceRight = Math.max(0, surfaceWidth - rawLeft);
    let editorWidth = Math.min(desiredMaxW, spaceRight);
    let left = rawLeft;
    if (editorWidth < editorMinW) {
      editorWidth = Math.min(editorMinW, surfaceWidth);
      left = Math.max(0, surfaceWidth - editorWidth);
    }
    const top = Math.max(0, Math.min(rawTop, Math.max(0, surfaceHeight - editorMinH)));
    textDraftEditorLayout = { editorWidth, editorMinH, left, top };
  }

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
          {textDraftEditorLayout && (
            <View
              pointerEvents="box-none"
              style={[
                styles.inlineTextEditor,
                {
                  left: textDraftEditorLayout.left,
                  top: textDraftEditorLayout.top,
                  width: textDraftEditorLayout.editorWidth,
                },
              ]}
            >
              <TextInput
                allowFontScaling={false}
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
                    width: '100%',
                    minHeight: textDraftEditorLayout.editorMinH,
                    color: activeTextColor,
                    fontFamily: getRenderableFontFamily(inputValue, activeTextFont),
                    fontSize: activeTextSize,
                    textAlign: 'left',
                    writingDirection: 'ltr',
                    ...(Platform.OS === 'android'
                      ? { textAlignVertical: 'center' as const, includeFontPadding: true }
                      : {}),
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
