import { useMemo } from 'react';
import type { Annotation } from '../../../../types';
import { getRenderableFontFamily, getTextMetrics } from './geometry';
import { getTextDirectionStyle } from './helpers';
import type { SummarizedTextBox } from './textLayoutBox';
import { useSkiaTextMeasure } from './useSkiaTextMeasure';

export function useMeasuredTextAnnotationBox({
  annotationData,
  textValue,
  fontSize,
}: {
  annotationData: Annotation['data'] | undefined;
  textValue: string;
  fontSize: number;
}) {
  const metrics = useMemo(
    () => getTextMetrics({ ...annotationData, fontSize }),
    [annotationData, fontSize]
  );

  const box: SummarizedTextBox = useSkiaTextMeasure({
    text: textValue,
    fontSize,
    fontFamily: annotationData?.fontFamily,
  });

  const textStyle = useMemo(
    () => ({
      color: annotationData?.color || '#111827',
      fontFamily: getRenderableFontFamily(textValue, annotationData?.fontFamily),
      fontSize: metrics.fontSize,
      ...getTextDirectionStyle(textValue),
    }),
    [annotationData?.color, annotationData?.fontFamily, metrics.fontSize, textValue]
  );

  return { metrics, box, textStyle };
}

export function getTextAnchorPageCoords(data: Annotation['data'] | undefined, pageWidth: number, pageHeight: number) {
  const x = ((data?.x || 0) / 100) * pageWidth;
  const y = ((data?.y || 0) / 100) * pageHeight;
  return { x, y };
}

export function getTextAnnotationFrame(
  metrics: ReturnType<typeof getTextMetrics>,
  box: SummarizedTextBox,
  x: number,
  y: number
) {
  return {
    boxLeft: x - metrics.horizontalPadding - box.leftInset,
    boxTop: y - box.baselineOffset,
    boxWidth: box.width,
    boxHeight: box.height,
  };
}
