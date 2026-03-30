import React, { memo, useMemo } from 'react';
import { StyleSheet } from 'react-native';
import { Canvas, Group as SkiaGroup, Path as SkiaPath, Rect as SkiaRect, Skia } from '@shopify/react-native-skia';
import type { Annotation } from '../../../../types';
import { HIGHLIGHT_DEFAULT_WIDTH } from '../constants';
import { getCanvasStrokeWidth } from '../utils/helpers';
import {
  getHighlightRenderRect,
  getPointsBounds,
  getRotationDegrees,
  toHighlightColor,
  toPolylineSvgPath,
  toSvgPath,
} from '../utils/geometry';

export const VectorAnnotationsCanvas = memo(function VectorAnnotationsCanvas({
  annotations,
  drawPoints,
  activeTool,
  activeColor,
  activeStrokeWidth,
  selectedAnnotationId,
  width,
  height,
}: {
  annotations: Annotation[];
  drawPoints: Array<{ x: number; y: number }>;
  activeTool: string;
  activeColor: string;
  activeStrokeWidth: number;
  selectedAnnotationId: string | null;
  width: number;
  height: number;
}) {
  const vectorAnnotations = useMemo(
    () =>
      annotations.filter(
        (annotation) =>
          (annotation.type === 'DRAW' || annotation.type === 'HIGHLIGHT') &&
          !(
            (annotation.type === 'HIGHLIGHT' || annotation.type === 'DRAW') &&
            annotation.id === selectedAnnotationId
          )
      ),
    [annotations, selectedAnnotationId]
  );
  const livePath = useMemo(
    () =>
      drawPoints.length > 1
        ? Skia.Path.MakeFromSVGString(
            activeTool === 'DRAW'
              ? toPolylineSvgPath(drawPoints, width, height)
              : toSvgPath(drawPoints, width, height)
          )
        : null,
    [activeTool, drawPoints, height, width]
  );

  if (vectorAnnotations.length === 0 && !livePath) return null;

  return (
    <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
      {vectorAnnotations.map((annotation) => {
        const points = annotation.data?.points || [];
        if (points.length < 2) return null;
        if (annotation.type === 'HIGHLIGHT') {
          const canvasStrokeWidth = getCanvasStrokeWidth(annotation.data, width, HIGHLIGHT_DEFAULT_WIDTH);
          const rect = getHighlightRenderRect(
            points,
            width,
            height,
            canvasStrokeWidth
          );
          const rotation = (getRotationDegrees(annotation.data) * Math.PI) / 180;
          const centerX = rect.x + rect.width / 2;
          const centerY = rect.y + rect.height / 2;

          return (
            <SkiaGroup
              key={`${annotation.id}-highlight-rect`}
              transform={[
                { translateX: centerX },
                { translateY: centerY },
                { rotate: rotation },
                { translateX: -centerX },
                { translateY: -centerY },
              ]}
            >
              <SkiaRect
                x={rect.x}
                y={rect.y}
                width={rect.width}
                height={rect.height}
                color={annotation.data?.color || 'rgba(251,191,36,0.45)'}
                style="fill"
              />
            </SkiaGroup>
          );
        }

        const path = Skia.Path.MakeFromSVGString(
          toSvgPath(points, width, height)
        );
        if (!path) return null;
        const bounds = getPointsBounds(points);
        const centerX = (((bounds.minX + bounds.maxX) / 2) / 100) * width;
        const centerY = (((bounds.minY + bounds.maxY) / 2) / 100) * height;
        const rotation = (getRotationDegrees(annotation.data) * Math.PI) / 180;

        return (
          <SkiaGroup
            key={`${annotation.id}-vector-path`}
            transform={[
              { translateX: centerX },
              { translateY: centerY },
              { rotate: rotation },
              { translateX: -centerX },
              { translateY: -centerY },
            ]}
          >
            <SkiaPath
              path={path}
              color={annotation.data?.color || '#111827'}
              style="stroke"
              strokeWidth={getCanvasStrokeWidth(annotation.data, width, 3)}
              strokeCap="round"
              strokeJoin="round"
            />
          </SkiaGroup>
        );
      })}
      {activeTool === 'HIGHLIGHT' && drawPoints.length > 1 ? (
        (() => {
          const rect = getHighlightRenderRect(drawPoints, width, height, activeStrokeWidth);

          return (
            <SkiaRect
              x={rect.x}
              y={rect.y}
              width={rect.width}
              height={rect.height}
              color={toHighlightColor(activeColor)}
              style="fill"
            />
          );
        })()
      ) : livePath ? (
        <SkiaPath
          path={livePath}
          color={activeColor}
          style="stroke"
          strokeWidth={activeStrokeWidth}
          strokeCap="round"
          strokeJoin="round"
        />
      ) : null}
    </Canvas>
  );
});
