import { Platform } from 'react-native';
import { theme } from '../../../theme';
import type { TextMetricsPreset } from './types';

export const INACTIVE_PEN_COLOR = '';
export const INACTIVE_PEN_WIDTH = 0;

export const TEXT_COLORS = ['#ffffff', '#111111', '#4b5563', '#fca5a5', '#fb7185', '#ef4444', '#dc2626', theme.colors.accentStrong, '#f59e0b', '#2563eb', '#7c3aed', '#c084fc'];
export const EMPTY_POINTS: Array<{ x: number; y: number }> = [];
export const MIN_STROKE_POINT_DISTANCE = 0.35;
export const PAGE_RENDER_WINDOW = 1;
export const PAGE_STACK_GAP = 18;
export const BUNDLED_FONT_FAMILY_MAP: Record<string, string> = {
  System: Platform.select({
    ios: 'System',
    android: 'sans-serif',
    default: 'sans-serif',
  }) || 'sans-serif',
};
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
