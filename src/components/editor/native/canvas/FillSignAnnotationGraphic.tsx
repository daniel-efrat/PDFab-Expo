import React from 'react';
import { Ellipse as SvgEllipse, G, Image as SvgImage, Line as SvgLine, Path as SvgPath, Rect as SvgRect } from 'react-native-svg';
import type { Annotation } from '../../../../types';
import { getSignaturePathsBounds } from '../utils/helpers';

export function FillSignAnnotationGraphic({
  annotation,
  width,
  height,
}: {
  annotation: Annotation;
  width: number;
  height: number;
}) {
  const kind = annotation.data?.kind || annotation.data?.slotType || 'signature';
  const color = annotation.data?.color || '#111827';

  if (kind === 'signature' || kind === 'initials') {
    if (typeof annotation.data?.imageUri === 'string' && annotation.data.imageUri) {
      return (
        <SvgImage
          href={{ uri: annotation.data.imageUri }}
          x={0}
          y={0}
          width={width}
          height={height}
          preserveAspectRatio="xMidYMid meet"
        />
      );
    }

    const sourceBounds = annotation.data?.sourceBounds || getSignaturePathsBounds(annotation.data?.paths || []);
    const scaleX = width / Math.max(sourceBounds.width, 1);
    const scaleY = height / Math.max(sourceBounds.height, 1);

    return (
      <G scaleX={scaleX} scaleY={scaleY}>
        <G translateX={-sourceBounds.minX} translateY={-sourceBounds.minY}>
          {(annotation.data?.paths || []).map((path: string, index: number) => (
            <SvgPath
              key={`${annotation.id}-graphic-path-${index}`}
              d={path}
              stroke={color}
              strokeWidth={3}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}
        </G>
      </G>
    );
  }

  if (kind === 'cross') {
    return (
      <>
        <SvgLine x1={0} y1={0} x2={width} y2={height} stroke={color} strokeWidth={3} strokeLinecap="round" />
        <SvgLine x1={width} y1={0} x2={0} y2={height} stroke={color} strokeWidth={3} strokeLinecap="round" />
      </>
    );
  }

  if (kind === 'check') {
    return (
      <SvgPath
        d={`M ${width * 0.08} ${height * 0.58} L ${width * 0.36} ${height * 0.88} L ${width * 0.92} ${height * 0.12}`}
        stroke={color}
        strokeWidth={3}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    );
  }

  if (kind === 'ellipse') {
    return (
      <SvgEllipse
        cx={width / 2}
        cy={height / 2}
        rx={Math.max(width / 2 - 1.5, 1)}
        ry={Math.max(height / 2 - 1.5, 1)}
        stroke={color}
        strokeWidth={3}
        fill="none"
      />
    );
  }

  if (kind === 'rect') {
    return (
      <SvgRect
        x={1.5}
        y={1.5}
        width={Math.max(width - 3, 1)}
        height={Math.max(height - 3, 1)}
        rx={2}
        ry={2}
        stroke={color}
        strokeWidth={3}
        fill="none"
      />
    );
  }

  if (kind === 'line') {
    return (
      <SvgLine
        x1={0}
        y1={height / 2}
        x2={width}
        y2={height / 2}
        stroke={color}
        strokeWidth={3}
        strokeLinecap="round"
      />
    );
  }

  return null;
}
