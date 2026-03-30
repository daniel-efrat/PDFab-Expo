import type { Annotation } from '../../../../types';
import { RELATIVE_STROKE_WIDTH_MODE, RTL_TEXT_REGEX } from '../constants';
import type { FillSignAction, SavedSignatureSlot } from '../types';

export function stripUndefinedDeep<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => stripUndefinedDeep(item)) as T;
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entryValue]) => entryValue !== undefined)
      .map(([key, entryValue]) => [key, stripUndefinedDeep(entryValue)]);
    return Object.fromEntries(entries) as T;
  }

  return value;
}

export function isRTLText(value: string) {
  return RTL_TEXT_REGEX.test(value);
}

export function getTextDirectionStyle(value: string) {
  const isRTL = isRTLText(value);
  return {
    writingDirection: isRTL ? ('rtl' as const) : ('ltr' as const),
    textAlign: isRTL ? ('right' as const) : ('left' as const),
  };
}

export function toRelativeStrokeWidth(screenStrokeWidth: number, canvasWidth: number) {
  return (screenStrokeWidth / Math.max(canvasWidth, 1)) * 100;
}

export function getCanvasStrokeWidth(
  data: Annotation['data'] | undefined,
  canvasWidth: number,
  fallback: number
) {
  const storedStrokeWidth = data?.strokeWidth;
  if (typeof storedStrokeWidth !== 'number' || Number.isNaN(storedStrokeWidth)) {
    return fallback;
  }

  if (data?.strokeWidthMode === RELATIVE_STROKE_WIDTH_MODE) {
    return (storedStrokeWidth / 100) * canvasWidth;
  }

  return storedStrokeWidth;
}

export function parseSignatureSlot(slotId: 'signature' | 'initials', raw: any): SavedSignatureSlot | null {
  if (!raw?.data) return null;

  try {
    const parsed = JSON.parse(raw.data);
    const paths = Array.isArray(parsed?.paths) ? parsed.paths.filter((path: unknown) => typeof path === 'string') : [];
    const imageUri = typeof parsed?.imageUri === 'string' ? parsed.imageUri : null;
    const kind = parsed?.kind === 'image' && imageUri ? 'image' : 'draw';
    if (kind === 'draw' && paths.length === 0) return null;
    return {
      id: slotId,
      label: slotId === 'signature' ? 'Signature' : 'Initials',
      kind,
      paths,
      imageUri,
      aspectRatio: typeof parsed?.aspectRatio === 'number' && parsed.aspectRatio > 0 ? parsed.aspectRatio : 3.4,
      raw,
    };
  } catch (error) {
    console.error('Parse signature slot error:', error);
    return null;
  }
}

export function getSignaturePathsBounds(paths: string[]) {
  const values = paths.flatMap((path) => {
    const matches = path.match(/-?\d*\.?\d+/g);
    if (!matches) return [];
    return matches.map(Number).filter((value) => Number.isFinite(value));
  });

  if (values.length < 2) {
    return { minX: 0, minY: 0, maxX: 1, maxY: 1, width: 1, height: 1 };
  }

  let minX = values[0];
  let maxX = values[0];
  let minY = values[1];
  let maxY = values[1];

  for (let index = 0; index < values.length - 1; index += 2) {
    const x = values[index];
    const y = values[index + 1];
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: Math.max(maxX - minX, 1),
    height: Math.max(maxY - minY, 1),
  };
}

export function getFillSignActionForAnnotation(annotation: Annotation | null): FillSignAction | null {
  if (!annotation || annotation.type !== 'SIGNATURE') return null;
  const kind = annotation.data?.kind || annotation.data?.slotType;
  if (kind === 'signature' || kind === 'initials') return 'sign';
  if (kind === 'cross') return 'cross';
  if (kind === 'check') return 'check';
  if (kind === 'ellipse') return 'ellipse';
  if (kind === 'rect') return 'rect';
  if (kind === 'line') return 'line';
  if (kind === 'text') return 'text';
  return null;
}
