import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';

export async function savePdf(bytes: Uint8Array, filename: string) {
  const base64 = Buffer.from(bytes).toString('base64');
  const directory = (FileSystem as any).documentDirectory || '';
  const path = `${directory}${filename}`;

  await FileSystem.writeAsStringAsync(path, base64, {
    encoding: (FileSystem as any).EncodingType?.Base64 || 'base64',
  });
  await Sharing.shareAsync(path);
}
