import React, { Fragment, memo, useMemo } from 'react';
import { StyleSheet } from 'react-native';
import { Canvas, Circle, Rect as SkiaRect } from '@shopify/react-native-skia';
import type { Annotation } from '../../../../types';

export const CommentAnnotationsCanvas = memo(function CommentAnnotationsCanvas({
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
  const commentAnnotations = useMemo(
    () => annotations.filter((annotation) => annotation.type === 'COMMENT'),
    [annotations]
  );

  if (commentAnnotations.length === 0) return null;

  return (
    <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
      {commentAnnotations.map((annotation) => {
        const x = ((annotation.data?.x || 0) / 100) * width;
        const y = ((annotation.data?.y || 0) / 100) * height;
        const isSelected = annotation.id === selectedAnnotationId;
        const fillColor = isSelected ? '#2563eb' : '#f59e0b';

        return (
          <Fragment key={`${annotation.id}-comment-marker`}>
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
          </Fragment>
        );
      })}
    </Canvas>
  );
});
