import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { Canvas, Circle, Rect as SkiaRect } from '@shopify/react-native-skia';
import { Trash2 } from 'lucide-react-native';
import type { Annotation } from '../../../../types';
import { styles } from '../styles';
import { getResizedTextFontSize, getRotationDegrees, getRotationFromGesture } from '../utils/geometry';
import { isRTLText } from '../utils/helpers';
import {
  getTextAnchorPageCoords,
  getTextAnnotationFrame,
  useMeasuredTextAnnotationBox,
} from '../utils/useMeasuredTextAnnotationBox';

export function SelectedTextOverlay({
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
  const { x, y } = getTextAnchorPageCoords(annotation.data, width, height);
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

  const { metrics, box, textStyle } = useMeasuredTextAnnotationBox({
    annotationData: annotation.data,
    textValue,
    fontSize: previewFontSize,
  });
  const { boxLeft, boxTop, boxWidth, boxHeight } = getTextAnnotationFrame(metrics, box, x, y);

  const uiScale = 1 / Math.max(zoom, 0.01);
  const pillWidth = 204 * uiScale;
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
        <View
          pointerEvents="none"
          style={[
            styles.selectionPillSizeLabel,
            { paddingHorizontal: 6 * uiScale, minWidth: 40 * uiScale },
          ]}
        >
          <Text
            style={[
              styles.selectionPillSizeText,
              { fontSize: 13 * uiScale, fontVariant: ['tabular-nums'] },
            ]}
          >
            {Math.round(previewFontSize)}
          </Text>
        </View>
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
            height: boxHeight,
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
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: boxWidth,
            minHeight: boxHeight,
            alignItems: isRTLText(textValue) ? 'flex-end' : 'flex-start',
          }}
        >
          <Text allowFontScaling={false} style={textStyle}>
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
