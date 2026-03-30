import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { Buffer } from 'buffer';

/**
 * Converts a file URI into a format suitable for Firebase Storage upload.
 * On Web: Returns a Blob using fetch.
 * On Native (Android/iOS): Reads the file directly from disk using expo-file-system
 * to avoid "Network request failed" errors. Returns a Uint8Array.
 */
export const uriToBlob = async (uri: string): Promise<Blob | Uint8Array> => {
  if (Platform.OS === 'web') {
    const response = await fetch(uri);
    return await response.blob();
  }

  // Native implementation: Read from disk as base64 and convert to binary
  try {
    const base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: 'base64',
    });
    return new Uint8Array(Buffer.from(base64, 'base64'));
  } catch (error) {
    console.error('uriToBlob (native) error:', error);
    throw new TypeError('Failed to read local file');
  }
};

/**
 * Converts a file URI into a Base64 string.
 * Optimized for both Web and Native.
 */
export const uriToBase64 = async (uri: string): Promise<string> => {
  if (Platform.OS === 'web') {
    const response = await fetch(uri);
    const blob = await response.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        resolve(base64.split(',')[1]);
      };
      reader.readAsDataURL(blob);
    });
  }

  // Native implementation: Read from disk as base64
  try {
    // If remote URL (e.g. Firebase) → download first
    if (uri.startsWith('http')) {
      const tempUri = `${FileSystem.cacheDirectory}${Math.random().toString(36).substring(7)}.tmp`;
      const downloadResult = await FileSystem.downloadAsync(uri, tempUri);
      uri = downloadResult.uri;
    }

    const base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: 'base64',
    });
    return base64;
  } catch (error) {
    console.error('uriToBase64 (native) error:', error);
    throw error;
  }
};
