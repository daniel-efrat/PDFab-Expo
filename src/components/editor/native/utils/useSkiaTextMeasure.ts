import { useMemo } from 'react';
import { matchFont } from '@shopify/react-native-skia';
import { getRenderableFontFamily } from './geometry';
import type { SummarizedTextBox } from './textLayoutBox';

const WIDTH_GUARD = 2;
const HEIGHT_GUARD = 6;

export function useSkiaTextMeasure({
  text,
  fontSize,
  fontFamily,
}: {
  text: string;
  fontSize: number;
  fontFamily?: string;
}): SummarizedTextBox {
  const resolvedFamily = getRenderableFontFamily(text, fontFamily);

  return useMemo(() => {
    const font = matchFont({ fontFamily: resolvedFamily, fontSize });
    const fontMetrics = font.getMetrics();
    const ascent = Math.abs(fontMetrics.ascent);
    const descent = Math.abs(fontMetrics.descent);
    const leading = Math.abs(fontMetrics.leading || 0);
    const lineHeight = ascent + descent + leading;

    const lines = text.split('\n');
    let maxLineWidth = 0;

    for (const line of lines) {
      if (line.length === 0) continue;
      const advanceWidth = font.getTextWidth(line);
      maxLineWidth = Math.max(maxLineWidth, advanceWidth);
    }

    const totalWidth = Math.ceil(maxLineWidth) + WIDTH_GUARD;
    const totalHeight = Math.ceil(lines.length * lineHeight) + HEIGHT_GUARD;

    return {
      width: Math.max(12, totalWidth),
      height: Math.max(fontSize * 0.8, totalHeight),
      baselineOffset: ascent + HEIGHT_GUARD / 2,
      leftInset: 0,
    };
  }, [text, fontSize, resolvedFamily]);
}
