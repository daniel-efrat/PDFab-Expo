import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import Svg, { Rect as SvgRect } from 'react-native-svg';
import { Trash2 } from 'lucide-react-native';
import type { Annotation } from '../../../../types';
import { FillSignAnnotationGraphic } from '../canvas/FillSignAnnotationGraphic';
import { styles } from '../styles';
import { getRotationDegrees, getRotationFromGesture } from '../utils/geometry';

export function SelectedFillSignOverlay({
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
