import { useMemo } from 'react';
import { matchFont } from '@shopify/react-native-skia';
import { getRenderableFontFamily } from './geometry';
import { isRTLText } from './helpers';
import type { SummarizedTextBox } from './textLayoutBox';

const WIDTH_GUARD = 2;
const WIDTH_GUARD_RTL = 10;
const HEIGHT_GUARD = 6;
/** Skia getTextWidth often under-reports complex scripts (Hebrew, Arabic); blend with a per-grapheme estimate. */
const RTL_CHAR_WIDTH_RATIO = 0.62;

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

    const rtlDoc = isRTLText(text);
    const widthGuard = rtlDoc ? WIDTH_GUARD_RTL : WIDTH_GUARD;

    const lines = text.split('\n');
    let maxLineWidth = 0;

    for (const line of lines) {
      if (line.length === 0) continue;
      const advanceWidth = font.getTextWidth(line);
      const graphemes = [...line].length;
      const heuristicWidth = graphemes * fontSize * RTL_CHAR_WIDTH_RATIO;
      const rtlLine = rtlDoc || isRTLText(line);
      const lineWidth = rtlLine ? Math.max(advanceWidth, heuristicWidth) : advanceWidth;
      maxLineWidth = Math.max(maxLineWidth, lineWidth);
    }

    const rtlSlack = rtlDoc ? Math.ceil(fontSize * 0.15) : 0;
    const totalWidth = Math.ceil(maxLineWidth) + widthGuard + rtlSlack;
    const totalHeight = Math.ceil(lines.length * lineHeight) + HEIGHT_GUARD;

    return {
      width: Math.max(rtlDoc ? Math.ceil(fontSize * 2) : 12, totalWidth),
      height: Math.max(fontSize * 0.8, totalHeight),
      baselineOffset: ascent + HEIGHT_GUARD / 2,
      leftInset: 0,
    };
  }, [text, fontSize, resolvedFamily]);
}
