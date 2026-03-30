export type SummarizedTextBox = {
  width: number;
  height: number;
  /** Page baseline y = boxTop + baselineOffset (first line). */
  baselineOffset: number;
  /** Subtract from anchor x so box left aligns with glyph bounds (line x inset). */
  leftInset: number;
};
