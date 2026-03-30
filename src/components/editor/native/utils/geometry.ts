import type { Annotation } from '../../../../types';
import {
  BUNDLED_FONT_FAMILY_MAP,
  DEFAULT_TEXT_METRICS_PRESET,
  HIGHLIGHT_OPACITY,
  LTR_TEXT_METRICS_PRESETS,
  MIN_STROKE_POINT_DISTANCE,
  RTL_TEXT_METRICS_PRESETS,
} from '../constants';
import { isRTLText } from './helpers';

export function toSvgPath(
  points: Array<{ x: number; y: number }>,
  width: number,
  height: number,
  offsetX = 0,
  offsetY = 0
) {
  if (points.length === 0) return '';

  const scaledPoints = points.map((point) => ({
    x: (point.x / 100) * width - offsetX,
    y: (point.y / 100) * height - offsetY,
  }));

  if (scaledPoints.length === 1) {
    const point = scaledPoints[0];
    return `M ${point.x} ${point.y}`;
  }

  if (scaledPoints.length === 2) {
    return scaledPoints
      .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
      .join(' ');
  }

  let path = `M ${scaledPoints[0].x} ${scaledPoints[0].y}`;

  for (let index = 1; index < scaledPoints.length - 1; index += 1) {
    const current = scaledPoints[index];
    const next = scaledPoints[index + 1];
    const controlX = current.x;
    const controlY = current.y;
    const midX = (current.x + next.x) / 2;
    const midY = (current.y + next.y) / 2;
    path += ` Q ${controlX} ${controlY} ${midX} ${midY}`;
  }

  const penultimate = scaledPoints[scaledPoints.length - 2];
  const last = scaledPoints[scaledPoints.length - 1];
  path += ` Q ${penultimate.x} ${penultimate.y} ${last.x} ${last.y}`;

  return path;
}

export function toPolylineSvgPath(points: Array<{ x: number; y: number }>, width: number, height: number) {
  if (points.length === 0) return '';

  return points
    .map((point, index) => {
      const x = (point.x / 100) * width;
      const y = (point.y / 100) * height;
      return `${index === 0 ? 'M' : 'L'} ${x} ${y}`;
    })
    .join(' ');
}

export function getHighlightScreenBounds(
  points: Array<{ x: number; y: number }>,
  width: number,
  height: number,
  strokeWidth: number
) {
  const bounds = getPointsBounds(points);
  const minX = (bounds.minX / 100) * width;
  const maxX = (bounds.maxX / 100) * width;
  const minY = (bounds.minY / 100) * height;
  const maxY = (bounds.maxY / 100) * height;
  const strokePadding = strokeWidth / 2;

  return {
    left: minX,
    top: minY - strokePadding,
    width: Math.max(maxX - minX, 0),
    height: Math.max(maxY - minY, 0) + strokeWidth,
    strokePadding,
  };
}

export function getDrawScreenBounds(
  points: Array<{ x: number; y: number }>,
  width: number,
  height: number,
  strokeWidth: number
) {
  const bounds = getPointsBounds(points);
  const strokePadding = strokeWidth / 2;
  const minX = (bounds.minX / 100) * width;
  const maxX = (bounds.maxX / 100) * width;
  const minY = (bounds.minY / 100) * height;
  const maxY = (bounds.maxY / 100) * height;

  return {
    left: minX - strokePadding,
    top: minY - strokePadding,
    width: Math.max(maxX - minX, 0) + strokeWidth,
    height: Math.max(maxY - minY, 0) + strokeWidth,
    strokePadding,
  };
}

export function getHighlightRenderRect(
  points: Array<{ x: number; y: number }>,
  width: number,
  height: number,
  strokeWidth: number
) {
  const bounds = getPointsBounds(points);
  const minX = (bounds.minX / 100) * width;
  const maxX = (bounds.maxX / 100) * width;
  const centerY = (((bounds.minY + bounds.maxY) / 2) / 100) * height;

  return {
    x: minX,
    y: centerY - strokeWidth / 2,
    width: Math.max(maxX - minX, 0),
    height: strokeWidth,
  };
}

export function getResizedTextFontSize(
  startFontSize: number,
  startWidth: number,
  startHeight: number,
  translationX: number,
  translationY: number
) {
  const nextWidth = Math.max(36, startWidth + translationX);
  const nextHeight = Math.max(24, startHeight + translationY);
  const widthScale = nextWidth / Math.max(startWidth, 1);
  const heightScale = nextHeight / Math.max(startHeight, 1);

  return Math.max(12, startFontSize * Math.max(widthScale, heightScale));
}

export function getRotationDegrees(data: Annotation['data']) {
  const value = Number(data?.rotation || 0);
  if (!Number.isFinite(value)) return 0;
  return value;
}

export function normalizeRotationDegrees(value: number) {
  const normalized = value % 360;
  if (normalized > 180) return normalized - 360;
  if (normalized < -180) return normalized + 360;
  return normalized;
}

export function getRotationFromGesture(startRotation: number, translationX: number, translationY: number) {
  // Use a higher multiplier (1.2) to ensure a full 360 degree rotation (300px drag)
  // is possible within the horizontal/vertical limits of a mobile screen.
  return normalizeRotationDegrees(startRotation + (translationX - translationY) * 1.2);
}

export function toHighlightColor(color: string) {
  if (color.startsWith('rgba(')) return color;
  if (color.startsWith('rgb(')) {
    return color.replace('rgb(', 'rgba(').replace(')', `, ${HIGHLIGHT_OPACITY})`);
  }
  if (color.startsWith('#')) {
    let hex = color.slice(1);
    if (hex.length === 3) {
      hex = hex.split('').map((char) => `${char}${char}`).join('');
    }
    if (hex.length !== 6) return `rgba(251,191,36,${HIGHLIGHT_OPACITY})`;
    const red = parseInt(hex.slice(0, 2), 16);
    const green = parseInt(hex.slice(2, 4), 16);
    const blue = parseInt(hex.slice(4, 6), 16);
    return `rgba(${red},${green},${blue},${HIGHLIGHT_OPACITY})`;
  }
  return `rgba(251,191,36,${HIGHLIGHT_OPACITY})`;
}

export function getPointDistance(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function simplifyStrokePoints(
  points: Array<{ x: number; y: number }>,
  {
    minDistance = MIN_STROKE_POINT_DISTANCE,
    angleThreshold = 0.12,
    neighborDistanceMultiplier = 2.2,
  }: {
    minDistance?: number;
    angleThreshold?: number;
    neighborDistanceMultiplier?: number;
  } = {}
) {
  if (points.length < 3) return points;

  const simplified = [points[0]];

  for (let index = 1; index < points.length - 1; index += 1) {
    const previous = simplified[simplified.length - 1];
    const current = points[index];
    const next = points[index + 1];

    if (getPointDistance(previous, current) < minDistance) {
      continue;
    }

    const previousAngle = Math.atan2(current.y - previous.y, current.x - previous.x);
    const nextAngle = Math.atan2(next.y - current.y, next.x - current.x);
    const angleDelta = Math.abs(previousAngle - nextAngle);

    if (angleDelta < angleThreshold && getPointDistance(current, next) < minDistance * neighborDistanceMultiplier) {
      continue;
    }

    simplified.push(current);
  }

  simplified.push(points[points.length - 1]);
  return simplified;
}

export function getTextMetrics(data: Annotation['data']) {
  const fontSize = data?.fontSize || 16;
  const textValue = String(data?.text || '');
  const isRTL = isRTLText(textValue);
  const lines = textValue.split('\n');
  const longestLine = lines.reduce((max, line) => Math.max(max, line.length), 1);
  const fontFamily = getEffectiveFontFamilyName(textValue, data?.fontFamily);
  const presetMap = isRTL ? RTL_TEXT_METRICS_PRESETS : LTR_TEXT_METRICS_PRESETS;
  const preset = presetMap[fontFamily] || presetMap.System || DEFAULT_TEXT_METRICS_PRESET;
  const lineHeight = fontSize * preset.lineHeightRatio;
  const horizontalPadding = fontSize * preset.horizontalPaddingRatio;
  const verticalPadding = fontSize * preset.verticalPaddingRatio;
  const ascent = fontSize * preset.ascentRatio;
  const descent = fontSize * preset.descentRatio;
  return {
    fontSize,
    lineHeight,
    ascent,
    descent,
    lines,
    horizontalPadding,
    verticalPadding,
    width: Math.max(12, longestLine * fontSize * preset.widthRatio + preset.widthBuffer),
    height: Math.max(fontSize * preset.minHeightRatio, ascent + descent + Math.max(0, lines.length - 1) * lineHeight),
  };
}

export function getNativeFontFamily(fontFamily?: string) {
  const normalizedFont = fontFamily || 'System';
  return BUNDLED_FONT_FAMILY_MAP[normalizedFont] || BUNDLED_FONT_FAMILY_MAP.System;
}

/** RTL (Hebrew, Arabic, etc.): use platform system font for native shaping and parity with RN <Text>. */
export function getEffectiveFontFamilyName(textValue: string, fontFamily?: string) {
  if (isRTLText(textValue)) {
    return 'System';
  }
  return fontFamily || 'System';
}

export function getRenderableFontFamily(textValue: string, fontFamily?: string) {
  return getNativeFontFamily(getEffectiveFontFamilyName(textValue, fontFamily));
}

export function getSkiaFontFamily(fontFamily?: string) {
  return getNativeFontFamily(fontFamily);
}

export function getPointsBounds(points: Array<{ x: number; y: number }>) {
  if (points.length === 0) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };
  }

  let minX = points[0].x;
  let maxX = points[0].x;
  let minY = points[0].y;
  let maxY = points[0].y;

  for (const point of points) {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minY = Math.min(minY, point.y);
    maxY = Math.max(maxY, point.y);
  }

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

export function translatePoints(points: Array<{ x: number; y: number }>, deltaX: number, deltaY: number) {
  return points.map((point) => ({
    x: Math.max(0, Math.min(100, point.x + deltaX)),
    y: Math.max(0, Math.min(100, point.y + deltaY)),
  }));
}

export function scalePointsFromBounds(
  points: Array<{ x: number; y: number }>,
  nextWidth: number,
  nextHeight: number
) {
  const bounds = getPointsBounds(points);
  const scaleX = nextWidth / Math.max(bounds.width, 0.01);
  const scaleY = nextHeight / Math.max(bounds.height, 0.01);

  return points.map((point) => ({
    x: Math.max(0, Math.min(100, bounds.minX + (point.x - bounds.minX) * scaleX)),
    y: Math.max(0, Math.min(100, bounds.minY + (point.y - bounds.minY) * scaleY)),
  }));
}
