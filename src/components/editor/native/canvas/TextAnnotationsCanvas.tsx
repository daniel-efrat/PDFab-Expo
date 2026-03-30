import React, { memo, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { Annotation } from '../../../../types';
import { styles } from '../styles';
import { getRenderableFontFamily, getRotationDegrees, getTextMetrics } from '../utils/geometry';
import { getTextDirectionStyle } from '../utils/helpers';

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
