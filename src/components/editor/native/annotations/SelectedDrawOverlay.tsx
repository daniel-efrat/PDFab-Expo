import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { Canvas, Path as SkiaPath, Rect as SkiaRect, Skia } from '@shopify/react-native-skia';
import { Trash2 } from 'lucide-react-native';
import type { Annotation } from '../../../../types';
import { styles } from '../styles';
import { getCanvasStrokeWidth, toRelativeStrokeWidth } from '../utils/helpers';
import {
  getDrawScreenBounds,
  getPointsBounds,
  getRotationDegrees,
  getRotationFromGesture,
  scalePointsFromBounds,
  toSvgPath,
  translatePoints,
} from '../utils/geometry';

export function SelectedDrawOverlay({
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
