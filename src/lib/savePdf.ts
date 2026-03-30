import { Paths, File } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Buffer } from 'buffer';

export async function savePdf(bytes: Uint8Array, filename: string): Promise<string> {
  try {
    const base64 = Buffer.from(bytes).toString('base64');
    
    // In FileSystem v55+, new File(parentDir, name) creates the reference
    const pdfFile = new File(Paths.document, filename);

    // According to types, 'write' is likely synchronous (JSI-based)
    pdfFile.write(base64, { 
      encoding: 'base64' 
    });

    return pdfFile.uri;
  } catch (err) {
    console.error('savePdf error:', err);
    throw err;
  }
}
