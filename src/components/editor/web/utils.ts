let _annId = 0;

export const nextId = () => `ann_${Date.now()}_${++_annId}`;

export function normalizeHexColor(value: string) {
  if (/^#[0-9a-fA-F]{6}$/.test(value)) {
    return value;
  }
  return '#111827';
}
