import { Platform } from 'react-native';
import { ref, uploadBytes, StorageReference, UploadResult, UploadMetadata } from 'firebase/storage';
import * as FileSystem from 'expo-file-system/legacy';
import { Buffer } from 'buffer';

/**
 * Unified file uploader for React Native and Web.
 * Resolves the "Creating blobs from ArrayBuffer is not supported" error on Native.
 * Strategy: Uses fetch(uri).blob() which delegates blob creation to the native bridge.
 */
export const uploadFileToFirebase = async (
  storageRef: StorageReference,
  src: string | Uint8Array,
  metadata?: UploadMetadata
): Promise<UploadResult> => {
  let uri: string;
  let isTemp = false;

  if (typeof src === 'string') {
    uri = src;
  } else {
    // For Uint8Array: write to a temporary file first
    // This is necessary because 'new Blob([bytes])' fails on Android
    const tempName = `temp-${Math.random().toString(36).substring(7)}.pdf`;
    uri = `${FileSystem.cacheDirectory}${tempName}`;
    const base64 = Buffer.from(src).toString('base64');
    await FileSystem.writeAsStringAsync(uri, base64, {
      encoding: 'base64',
    });
    isTemp = true;
  }

  try {
    // 1. Fetch the URI to get a Blob from the native bridge
    const response = await fetch(uri);
    const blob = await response.blob();
    
    // 2. Upload the native-generated Blob
    return await uploadBytes(storageRef, blob, metadata);
  } catch (error) {
    console.error('uploadFileToFirebase error:', error);
    throw error;
  } finally {
    // 3. Cleanup temp file if created
    if (isTemp && Platform.OS !== 'web') {
      try {
        await FileSystem.deleteAsync(uri, { idempotent: true });
      } catch (e) {
        console.warn('Failed to delete temp file:', e);
      }
    }
  }
};
