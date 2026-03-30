import React, { memo, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { Annotation } from '../../../../types';
import { styles } from '../styles';
import { getRotationDegrees } from '../utils/geometry';
import {
  getTextAnchorPageCoords,
  getTextAnnotationFrame,
  useMeasuredTextAnnotationBox,
} from '../utils/useMeasuredTextAnnotationBox';

export const TextAnnotationsCanvas = memo(function TextAnnotationsCanvas({
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
      {textAnnotations.map((annotation) => (
        <MeasuredTextAnnotationView
          key={`${annotation.id}-canvas-group`}
          annotation={annotation}
          pageWidth={width}
          pageHeight={height}
          rotation={getRotationDegrees(annotation.data)}
        />
      ))}
    </View>
  );
});

function MeasuredTextAnnotationView({
  annotation,
  pageWidth,
  pageHeight,
  rotation,
}: {
  annotation: Annotation;
  pageWidth: number;
  pageHeight: number;
  rotation: number;
}) {
  const textValue = String(annotation.data?.text || '');
  const fontSize = annotation.data?.fontSize || 16;
  const { metrics, box, textStyle } = useMeasuredTextAnnotationBox({
    annotationData: annotation.data,
    textValue,
    fontSize,
  });
  const { x, y } = getTextAnchorPageCoords(annotation.data, pageWidth, pageHeight);
  const { boxLeft, boxTop, boxWidth, boxHeight } = getTextAnnotationFrame(metrics, box, x, y);

  return (
    <View
      style={[
        styles.annotationTextContent,
        {
          left: boxLeft,
          top: boxTop,
          width: boxWidth,
          minHeight: boxHeight,
          transform: [{ rotate: `${rotation}deg` }],
        },
      ]}
    >
      <Text allowFontScaling={false} style={textStyle}>
        {textValue}
      </Text>
    </View>
  );
}
