import { Buffer } from 'buffer';
import { Platform } from 'react-native';
import { type PDFDocument, type PDFPage, rgb, StandardFonts, LineCapStyle } from 'pdf-lib';
import type { Annotation } from '../types';
import { HIGHLIGHT_DEFAULT_WIDTH } from '../components/editor/native/constants';
import {
  getHighlightRenderRect,
  getTextMetrics,
  toHighlightColor,
  toSvgPath,
} from '../components/editor/native/utils/geometry';
import { getCanvasStrokeWidth, getSignaturePathsBounds } from '../components/editor/native/utils/helpers';

function anchorPercentToPagePx(
  data: Annotation['data'] | undefined,
  pageWidth: number,
  pageHeight: number
) {
  const x = ((data?.x || 0) / 100) * pageWidth;
  const y = ((data?.y || 0) / 100) * pageHeight;
  return { x, y };
}

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}

function cssToRgbOpacity(input: string | undefined): { r: number; g: number; b: number; opacity: number } {
  if (!input) return { r: 0.067, g: 0.094, b: 0.153, opacity: 1 };
  const s = input.trim();
  const rgba = s.match(/^rgba\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)$/i);
  if (rgba) {
    return {
      r: +rgba[1] / 255,
      g: +rgba[2] / 255,
      b: +rgba[3] / 255,
      opacity: clamp01(parseFloat(rgba[4])),
    };
  }
  const rgbM = s.match(/^rgb\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/i);
  if (rgbM) {
    return { r: +rgbM[1] / 255, g: +rgbM[2] / 255, b: +rgbM[3] / 255, opacity: 1 };
  }
  if (s.startsWith('#')) {
    let hex = s.slice(1);
    if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('');
    if (hex.length === 6) {
      return {
        r: parseInt(hex.slice(0, 2), 16) / 255,
        g: parseInt(hex.slice(2, 4), 16) / 255,
        b: parseInt(hex.slice(4, 6), 16) / 255,
        opacity: 1,
      };
    }
  }
  return { r: 0.067, g: 0.094, b: 0.153, opacity: 1 };
}

async function loadUriBytes(uri: string): Promise<Uint8Array> {
  if (uri.startsWith('http://') || uri.startsWith('https://')) {
    const res = await fetch(uri);
    return new Uint8Array(await res.arrayBuffer());
  }
  if (Platform.OS === 'web') {
    const res = await fetch(uri);
    return new Uint8Array(await res.arrayBuffer());
  }
  const FileSystem = require('expo-file-system/legacy');
  const b64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
  return new Uint8Array(Buffer.from(b64, 'base64'));
}

async function embedImageInBox(
  pdfDoc: PDFDocument,
  page: PDFPage,
  uri: string,
  bx: number,
  byTop: number,
  bw: number,
  bh: number,
  pageHeight: number
) {
  try {
    const bytes = await loadUriBytes(uri);
    let image;
    try {
      image = await pdfDoc.embedPng(bytes);
    } catch {
      image = await pdfDoc.embedJpg(bytes);
    }
    const iw = image.width;
    const ih = image.height;
    const scale = Math.min(bw / Math.max(iw, 1), bh / Math.max(ih, 1));
    const w = iw * scale;
    const h = ih * scale;
    const ox = bx + (bw - w) / 2;
    const oyPdf = pageHeight - byTop - h;
    page.drawImage(image, { x: ox, y: oyPdf, width: w, height: h });
  } catch {
    // skip broken image
  }
}

function fillSignLocalSvgPath(kind: string, w: number, h: number): string | null {
  switch (kind) {
    case 'cross':
      return `M 0 0 L ${w} ${h} M ${w} 0 L 0 ${h}`;
    case 'check':
      return `M ${w * 0.08} ${h * 0.58} L ${w * 0.36} ${h * 0.88} L ${w * 0.92} ${h * 0.12}`;
    case 'ellipse': {
      const rx = Math.max(w / 2 - 2, 1);
      const ry = Math.max(h / 2 - 2, 1);
      const cx = w / 2;
      const cy = h / 2;
      return `M ${cx + rx} ${cy} A ${rx} ${ry} 0 1 0 ${cx - rx} ${cy} A ${rx} ${ry} 0 1 0 ${cx + rx} ${cy}`;
    }
    case 'rect': {
      const x = 2;
      const y = 2;
      const rw = Math.max(w - 4, 1);
      const rh = Math.max(h - 4, 1);
      return `M ${x} ${y} L ${x + rw} ${y} L ${x + rw} ${y + rh} L ${x} ${y + rh} Z`;
    }
    case 'line':
      return `M 0 ${h / 2} L ${w} ${h / 2}`;
    default:
      return null;
  }
}

const EXPORT_ORDER: Annotation['type'][] = ['HIGHLIGHT', 'DRAW', 'TEXT', 'COMMENT', 'SIGNATURE'];

/**
 * Flattens editor annotations onto pdf-lib pages. Coordinates match the in-app overlay (percent of page).
 */
export async function embedAnnotationsInPdf(
  pdfDoc: PDFDocument,
  annotations: Annotation[],
  options: { editorSurfaceWidth: number }
): Promise<void> {
  const pages = pdfDoc.getPages();
  if (pages.length === 0 || annotations.length === 0) return;

  const refW = Math.max(options.editorSurfaceWidth, 1);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const byPage = new Map<number, Annotation[]>();
  for (const a of annotations) {
    if (a.pageIndex < 0 || a.pageIndex >= pages.length) continue;
    const list = byPage.get(a.pageIndex) || [];
    list.push(a);
    byPage.set(a.pageIndex, list);
  }

  for (const [pageIndex, list] of byPage) {
    const page = pages[pageIndex];
    const { width: pw, height: ph } = page.getSize();
    const sorted = [...list].sort(
      (a, b) => EXPORT_ORDER.indexOf(a.type) - EXPORT_ORDER.indexOf(b.type)
    );

    for (const annotation of sorted) {
      const d = annotation.data || {};

      if (annotation.type === 'HIGHLIGHT') {
        const points = d.points as Array<{ x: number; y: number }> | undefined;
        if (!points || points.length < 2) continue;
        const strokeW = getCanvasStrokeWidth(d, pw, HIGHLIGHT_DEFAULT_WIDTH);
        const rect = getHighlightRenderRect(points, pw, ph, strokeW);
        const fillCss = toHighlightColor(typeof d.color === 'string' ? d.color : 'rgba(251,191,36,0.45)');
        const { r, g, b, opacity } = cssToRgbOpacity(fillCss);
        const pdfY = ph - rect.y - rect.height;
        page.drawRectangle({
          x: rect.x,
          y: pdfY,
          width: rect.width,
          height: rect.height,
          color: rgb(r, g, b),
          opacity: opacity > 0 ? opacity : 0.45,
        });
        continue;
      }

      if (annotation.type === 'DRAW') {
        const points = d.points as Array<{ x: number; y: number }> | undefined;
        if (!points || points.length < 2) continue;
        const path = toSvgPath(points, pw, ph);
        if (!path) continue;
        const strokeW = getCanvasStrokeWidth(d, pw, 3);
        const { r, g, b, opacity } = cssToRgbOpacity(typeof d.color === 'string' ? d.color : '#111827');
        page.drawSvgPath(path, {
          x: 0,
          y: ph,
          scale: 1,
          borderColor: rgb(r, g, b),
          borderWidth: Math.max(0.5, strokeW),
          borderOpacity: opacity,
          borderLineCap: LineCapStyle.Round,
        });
        continue;
      }

      if (annotation.type === 'TEXT') {
        const text = String(d.text || '');
        if (!text) continue;
        const screenFontSize = typeof d.fontSize === 'number' ? d.fontSize : 16;
        const pdfFontSize = Math.max(4, Math.min(96, screenFontSize * (pw / refW)));
        const { r, g, b, opacity } = cssToRgbOpacity(typeof d.color === 'string' ? d.color : '#111827');
        const { x: anchorX, y: anchorY } = anchorPercentToPagePx(d, pw, ph);
        const metrics = getTextMetrics({ ...d, fontSize: screenFontSize });
        const lineHeight = metrics.lineHeight * (pw / refW);
        const lines = text.split('\n');
        let baselinePdfY = ph - anchorY - pdfFontSize * 0.75;
        for (const line of lines) {
          if (line.length > 0) {
            page.drawText(line, {
              x: anchorX,
              y: baselinePdfY,
              size: pdfFontSize,
              font,
              color: rgb(r, g, b),
              opacity,
            });
          }
          baselinePdfY -= lineHeight;
        }
        continue;
      }

      if (annotation.type === 'COMMENT') {
        const cx = ((d.x as number) || 0) / 100 * pw;
        const cyTop = ((d.y as number) || 0) / 100 * ph;
        const cyPdf = ph - cyTop;
        const rMarker = Math.max(8, pw * 0.022);
        page.drawCircle({
          x: cx,
          y: cyPdf,
          size: rMarker,
          color: rgb(0.96, 0.62, 0.04),
          borderColor: rgb(1, 1, 1),
          borderWidth: 1.5,
        });
        const note = String(d.text || '').trim();
        const author = String(d.author || '').trim();
        const label = [author, note].filter(Boolean).join(' — ').slice(0, 500);
        if (label) {
          const fs = Math.max(5, Math.min(11, pw * 0.022));
          page.drawText(label, {
            x: Math.min(cx + rMarker + 4, pw - fs * 2),
            y: cyPdf - fs * 0.35,
            size: fs,
            font: boldFont,
            color: rgb(0.9, 0.9, 0.95),
            opacity: 0.95,
          });
        }
        continue;
      }

      if (annotation.type === 'SIGNATURE') {
        const bx = ((d.x as number) || 0) / 100 * pw;
        const byTop = ((d.y as number) || 0) / 100 * ph;
        const bw = ((d.width as number) || 10) / 100 * pw;
        const bh = ((d.height as number) || 10) / 100 * ph;
        const kind = String(d.kind || d.slotType || 'signature');
        const color = cssToRgbOpacity(typeof d.color === 'string' ? d.color : '#111827');

        if ((kind === 'signature' || kind === 'initials') && typeof d.imageUri === 'string' && d.imageUri) {
          await embedImageInBox(pdfDoc, page, d.imageUri, bx, byTop, bw, bh, ph);
          continue;
        }

        const paths = Array.isArray(d.paths) ? (d.paths as string[]) : [];
        if ((kind === 'signature' || kind === 'initials') && paths.length > 0) {
          const bounds =
            d.sourceBounds && typeof d.sourceBounds === 'object'
              ? (d.sourceBounds as { minX: number; minY: number; width: number; height: number })
              : getSignaturePathsBounds(paths);
          const bwSrc = Math.max(bounds.width, 1);
          const bhSrc = Math.max(bounds.height, 1);
          const scale = Math.min(bw / bwSrc, bh / bhSrc);
          const strokePdf = Math.max(0.75, 3 * scale);
          for (const p of paths) {
            if (typeof p !== 'string' || !p.trim()) continue;
            page.drawSvgPath(p, {
              x: bx - bounds.minX * scale,
              y: ph - byTop + bounds.minY * scale,
              scale,
              borderColor: rgb(color.r, color.g, color.b),
              borderWidth: strokePdf,
              borderOpacity: color.opacity,
              borderLineCap: LineCapStyle.Round,
            });
          }
          continue;
        }

        const localPath = fillSignLocalSvgPath(kind, bw, bh);
        if (localPath) {
          page.drawSvgPath(localPath, {
            x: bx,
            y: ph - byTop,
            scale: 1,
            borderColor: rgb(color.r, color.g, color.b),
            borderWidth: Math.max(1, pw * 0.004),
            borderOpacity: color.opacity,
            borderLineCap: LineCapStyle.Round,
          });
        }
      }
    }
  }
}
