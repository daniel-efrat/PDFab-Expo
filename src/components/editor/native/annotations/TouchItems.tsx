import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import type { Annotation } from '../../../../types';
import { HIGHLIGHT_DEFAULT_WIDTH } from '../constants';
import { styles } from '../styles';
import { getCanvasStrokeWidth } from '../utils/helpers';
import {
  getDrawScreenBounds,
  getHighlightScreenBounds,
  getResizedTextFontSize,
  getRotationDegrees,
  getTextMetrics,
} from '../utils/geometry';
import {
  getTextAnchorPageCoords,
  getTextAnnotationFrame,
  useMeasuredTextAnnotationBox,
} from '../utils/useMeasuredTextAnnotationBox';

export function AnnotationTouchItem({
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

export function HighlightAnnotationTouchItem({
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

export function DrawAnnotationTouchItem({
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

export function TextAnnotationTouchItem({
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
  const { x, y } = getTextAnchorPageCoords(annotation.data, width, height);
  const rotation = getRotationDegrees(annotation.data);
  const metrics = getTextMetrics(annotation.data);
  const [previewFontSize, setPreviewFontSize] = useState(annotation.data?.fontSize || metrics.fontSize);
  const { box } = useMeasuredTextAnnotationBox({
    annotationData: annotation.data,
    textValue,
    fontSize: previewFontSize,
  });
  const previewMetrics = getTextMetrics({ ...annotation.data, fontSize: previewFontSize });
  const { boxLeft, boxTop, boxWidth, boxHeight } = getTextAnnotationFrame(previewMetrics, box, x, y);
  const previewFontSizeRef = useRef(previewFontSize);
  const dragTranslateX = useSharedValue(0);
  const dragTranslateY = useSharedValue(0);
  const resizeStartFontSize = useSharedValue(annotation.data?.fontSize || metrics.fontSize);
  const resizeStartWidth = useSharedValue(1);
  const resizeStartHeight = useSharedValue(1);
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
      annotation.data?.fontSize,
      boxHeight,
      boxWidth,
      metrics.fontSize,
      onPress,
      onResize,
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
          left: boxLeft,
          top: boxTop,
          width: boxWidth,
          height: boxHeight,
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
