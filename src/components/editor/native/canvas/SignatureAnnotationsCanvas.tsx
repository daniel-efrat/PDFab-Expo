import React, { memo, useMemo } from 'react';
import { StyleSheet } from 'react-native';
import Svg, { G } from 'react-native-svg';
import type { Annotation } from '../../../../types';
import { FillSignAnnotationGraphic } from './FillSignAnnotationGraphic';
import { getRotationDegrees } from '../utils/geometry';

export const SignatureAnnotationsCanvas = memo(function SignatureAnnotationsCanvas({
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
