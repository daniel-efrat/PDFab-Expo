import { Paths, File } from 'expo-file-system';
import { Buffer } from 'buffer';

/**
 * Single-segment filename safe for Android/iOS document dir. Titles often contain
 * `/`, `:`, etc.; those become path segments and the parent folder does not exist → IOException.
 */
export function safePdfFilename(raw: string): string {
  const trimmed = (raw || '').trim() || 'export';
  const flat = trimmed.replace(/[/\\]+/g, '_').replace(/\0/g, '');
  const safe = flat.replace(/[:*?"<>|]/g, '_').replace(/\s+/g, ' ').trim() || 'export';
  const base = safe.slice(0, 180);
  return /\.pdf$/i.test(base) ? base : `${base}.pdf`;
}

export async function savePdf(bytes: Uint8Array, filename: string): Promise<string> {
  try {
    const base64 = Buffer.from(bytes).toString('base64');
    const name = safePdfFilename(filename);

    const pdfFile = new File(Paths.document, name);

    pdfFile.write(base64, {
      encoding: 'base64',
    });

    return pdfFile.uri;
  } catch (err) {
    console.error('savePdf error:', err);
    throw err;
  }
}
