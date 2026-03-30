import { Platform } from 'react-native';
import { theme } from '../../../theme';
import type { TextMetricsPreset } from './types';

export const INACTIVE_PEN_COLOR = '';
export const INACTIVE_PEN_WIDTH = 0;

export const TEXT_COLORS = ['#ffffff', '#111111', '#4b5563', '#fca5a5', '#fb7185', '#ef4444', '#dc2626', theme.colors.accentStrong, '#f59e0b', '#2563eb', '#7c3aed', '#c084fc'];
export const FONT_OPTIONS = ['Assistant', 'Amatic SC', 'Bellefair', 'Montserrat', 'Open Sans', 'Georgia', 'Courier New', 'Times New Roman', 'Verdana'];
export const EMPTY_POINTS: Array<{ x: number; y: number }> = [];
export const MIN_STROKE_POINT_DISTANCE = 0.35;
export const PAGE_RENDER_WINDOW = 1;
export const PAGE_STACK_GAP = 18;
export const BUNDLED_FONT_FAMILY_MAP: Record<string, string> = {
  Arial: 'PDFabArial',
  Assistant: 'PDFabAssistant',
  'Amatic SC': 'PDFabAmaticSC',
  Bellefair: 'PDFabBellefair',
  Montserrat: 'PDFabMontserrat',
  'Open Sans': 'PDFabOpenSans',
  Georgia: 'PDFabGeorgia',
  'Courier New': 'PDFabCourierNew',
  'Times New Roman': 'PDFabTimesNewRoman',
  Verdana: 'PDFabVerdana',
  System: Platform.select({
    ios: 'System',
    android: 'sans-serif',
    default: 'sans-serif',
  }) || 'sans-serif',
};
export const HEBREW_CAPABLE_FONT_FAMILIES = new Set([
  'Arial',
  'Assistant',
  'Bellefair',
  'Courier New',
  'Open Sans',
  'Times New Roman',
  'System',
]);
export const DEFAULT_TEXT_METRICS_PRESET: TextMetricsPreset = {
  widthRatio: 0.52,
  widthBuffer: 1,
  lineHeightRatio: 1.05,
  ascentRatio: 0.78,
  descentRatio: 0.14,
  horizontalPaddingRatio: 0,
  verticalPaddingRatio: 0.1,
  minHeightRatio: 0.95,
};

export const RTL_TEXT_METRICS_PRESETS: Record<string, TextMetricsPreset> = {
  Arial: {
    widthRatio: 0.66,
    widthBuffer: 5,
    lineHeightRatio: 1.02,
    ascentRatio: 0.84,
    descentRatio: 0.18,
    horizontalPaddingRatio: 0.08,
    verticalPaddingRatio: 0.08,
    minHeightRatio: 1,
  },
  Assistant: {
    widthRatio: 0.64,
    widthBuffer: 4,
    lineHeightRatio: 0.98,
    ascentRatio: 0.82,
    descentRatio: 0.16,
    horizontalPaddingRatio: 0.02,
    verticalPaddingRatio: 0.04,
    minHeightRatio: 0.96,
  },
  'Amatic SC': {
    widthRatio: 0.42,
    widthBuffer: 4,
    lineHeightRatio: 0.92,
    ascentRatio: 0.78,
    descentRatio: 0.1,
    horizontalPaddingRatio: 0.02,
    verticalPaddingRatio: 0.02,
    minHeightRatio: 0.88,
  },
  Bellefair: {
    widthRatio: 0.64,
    widthBuffer: 4,
    lineHeightRatio: 1.04,
    ascentRatio: 0.83,
    descentRatio: 0.18,
    horizontalPaddingRatio: 0.02,
    verticalPaddingRatio: 0.08,
    minHeightRatio: 1,
  },
  Montserrat: {
    widthRatio: 0.62,
    widthBuffer: 4,
    lineHeightRatio: 1,
    ascentRatio: 0.82,
    descentRatio: 0.16,
    horizontalPaddingRatio: 0.04,
    verticalPaddingRatio: 0.05,
    minHeightRatio: 0.96,
  },
  'Open Sans': {
    widthRatio: 0.64,
    widthBuffer: 3,
    lineHeightRatio: 1.04,
    ascentRatio: 0.85,
    descentRatio: 0.2,
    horizontalPaddingRatio: 0.02,
    verticalPaddingRatio: 0.08,
    minHeightRatio: 1.02,
  },
  Georgia: {
    widthRatio: 0.64,
    widthBuffer: 6,
    lineHeightRatio: 0.98,
    ascentRatio: 0.82,
    descentRatio: 0.14,
    horizontalPaddingRatio: 0.03,
    verticalPaddingRatio: 0.04,
    minHeightRatio: 0.94,
  },
  'Courier New': {
    widthRatio: 0.67,
    widthBuffer: 6,
    lineHeightRatio: 1,
    ascentRatio: 0.81,
    descentRatio: 0.16,
    horizontalPaddingRatio: 0.04,
    verticalPaddingRatio: 0.04,
    minHeightRatio: 0.96,
  },
  'Times New Roman': {
    widthRatio: 0.66,
    widthBuffer: 5,
    lineHeightRatio: 1.06,
    ascentRatio: 0.85,
    descentRatio: 0.2,
    horizontalPaddingRatio: 0.02,
    verticalPaddingRatio: 0.09,
    minHeightRatio: 1.02,
  },
  Verdana: {
    widthRatio: 0.64,
    widthBuffer: 5,
    lineHeightRatio: 1.02,
    ascentRatio: 0.83,
    descentRatio: 0.16,
    horizontalPaddingRatio: 0.05,
    verticalPaddingRatio: 0.05,
    minHeightRatio: 0.98,
  },
  System: {
    widthRatio: 0.64,
    widthBuffer: 4,
    lineHeightRatio: 1,
    ascentRatio: 0.82,
    descentRatio: 0.16,
    horizontalPaddingRatio: 0.04,
    verticalPaddingRatio: 0.05,
    minHeightRatio: 0.96,
  },
};

export const LTR_TEXT_METRICS_PRESETS: Record<string, TextMetricsPreset> = {
  Arial: DEFAULT_TEXT_METRICS_PRESET,
  Assistant: {
    widthRatio: 0.57,
    widthBuffer: 2,
    lineHeightRatio: 0.9,
    ascentRatio: 0.77,
    descentRatio: 0.1,
    horizontalPaddingRatio: 0,
    verticalPaddingRatio: 0.02,
    minHeightRatio: 0.9,
  },
  'Amatic SC': {
    widthRatio: 0.42,
    widthBuffer: 4,
    lineHeightRatio: 0.9,
    ascentRatio: 0.76,
    descentRatio: 0.08,
    horizontalPaddingRatio: 0.01,
    verticalPaddingRatio: 0.01,
    minHeightRatio: 0.86,
  },
  Bellefair: {
    widthRatio: 0.57,
    widthBuffer: 3,
    lineHeightRatio: 0.88,
    ascentRatio: 0.78,
    descentRatio: 0.08,
    horizontalPaddingRatio: 0,
    verticalPaddingRatio: 0.02,
    minHeightRatio: 0.86,
  },
  Montserrat: {
    widthRatio: 0.57,
    widthBuffer: 2,
    lineHeightRatio: 0.9,
    ascentRatio: 0.77,
    descentRatio: 0.1,
    horizontalPaddingRatio: 0,
    verticalPaddingRatio: 0.02,
    minHeightRatio: 0.89,
  },
  'Open Sans': {
    widthRatio: 0.57,
    widthBuffer: 2,
    lineHeightRatio: 0.92,
    ascentRatio: 0.78,
    descentRatio: 0.11,
    horizontalPaddingRatio: 0.01,
    verticalPaddingRatio: 0.03,
    minHeightRatio: 0.9,
  },
  Georgia: {
    widthRatio: 0.59,
    widthBuffer: 4,
    lineHeightRatio: 0.94,
    ascentRatio: 0.79,
    descentRatio: 0.12,
    horizontalPaddingRatio: 0,
    verticalPaddingRatio: 0.03,
    minHeightRatio: 0.92,
  },
  'Courier New': {
    widthRatio: 0.61,
    widthBuffer: 6,
    lineHeightRatio: 0.88,
    ascentRatio: 0.77,
    descentRatio: 0.07,
    horizontalPaddingRatio: 0.01,
    verticalPaddingRatio: 0.01,
    minHeightRatio: 0.85,
  },
  'Times New Roman': {
    widthRatio: 0.57,
    widthBuffer: 3,
    lineHeightRatio: 0.94,
    ascentRatio: 0.79,
    descentRatio: 0.12,
    horizontalPaddingRatio: 0,
    verticalPaddingRatio: 0.03,
    minHeightRatio: 0.92,
  },
  Verdana: {
    widthRatio: 0.59,
    widthBuffer: 4,
    lineHeightRatio: 0.88,
    ascentRatio: 0.78,
    descentRatio: 0.07,
    horizontalPaddingRatio: 0.01,
    verticalPaddingRatio: 0.01,
    minHeightRatio: 0.85,
  },
  System: DEFAULT_TEXT_METRICS_PRESET,
};
export const HIGHLIGHT_OPACITY = 0.35;
export const HIGHLIGHT_DEFAULT_COLOR = '#facc15';
export const HIGHLIGHT_DEFAULT_WIDTH = 10;
export const HIGHLIGHT_COLORS = [
  TEXT_COLORS[0],
  TEXT_COLORS[1],
  HIGHLIGHT_DEFAULT_COLOR,
  ...TEXT_COLORS.slice(2),
];
export const RELATIVE_STROKE_WIDTH_MODE = 'relative';
export const MIN_HIGHLIGHT_WIDTH = 1;
export const MAX_HIGHLIGHT_WIDTH = 24;
export const MIN_ZOOM = 0.7;
export const MAX_ZOOM = 2.5;
export const AUTOSAVE_DEBOUNCE_MS = 600;
export const RTL_TEXT_REGEX = /[\u0590-\u05FF\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/;
