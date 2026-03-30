export interface EditorProps {
  setView: (view: any) => void;
}

export type DraftInput = {
  kind: 'TEXT' | 'COMMENT';
  pageIndex: number;
  x: number;
  y: number;
  value: string;
};

export type SavedSignatureSlot = {
  id: 'signature' | 'initials';
  label: string;
  kind: 'draw' | 'image';
  paths: string[];
  imageUri: string | null;
  aspectRatio: number;
  raw: any;
};

export type FillSignAction = 'text' | 'cross' | 'check' | 'ellipse' | 'rect' | 'line' | 'sign';

export type TextMetricsPreset = {
  widthRatio: number;
  widthBuffer: number;
  lineHeightRatio: number;
  ascentRatio: number;
  descentRatio: number;
  horizontalPaddingRatio: number;
  verticalPaddingRatio: number;
  minHeightRatio: number;
};
