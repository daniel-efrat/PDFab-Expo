import { Platform } from 'react-native';
import { StorageReference, UploadResult, UploadMetadata, uploadBytes } from 'firebase/storage';
import * as FileSystem from 'expo-file-system/legacy';
import { Buffer } from 'buffer';
import { auth } from '../firebase';

/**
 * Robust file uploader for React Native and Web.
 * On Native: Uses the Firebase Storage REST API + FileSystem.uploadAsync (Native Bridge).
 * On Web: Uses standard uploadBytes (JS SDK).
 *
 * This completely bypasses the Firebase JS SDK's broken Blob constructor on Android.
 */
export const uploadFileToFirebase = async (
  storageRef: StorageReference,
  src: string | Uint8Array,
  metadata?: UploadMetadata
): Promise<UploadResult> => {
  try {
    if (Platform.OS === 'web') {
      // Web: Standard JS SDK path
      if (typeof src === 'string') {
        const response = await fetch(src);
        const blob = await response.blob();
        return await uploadBytes(storageRef, blob, metadata);
      } else {
        return await uploadBytes(storageRef, src, metadata);
      }
    }

    // ── Native (Android / iOS) ──────────────────────────────────
    const user = auth.currentUser;
    if (!user) {
      throw new Error('User must be authenticated to upload files');
    }

    // 1. Auth token for REST API
    const token = await user.getIdToken();

    // 2. Resolve source to a local file URI
    let uri: string;
    let isTemp = false;

    if (typeof src === 'string') {
      uri = src;
    } else {
      // Raw bytes (e.g. from pdf-lib scanner) → write to temp file
      const tempName = `temp-${Math.random().toString(36).substring(7)}.pdf`;
      uri = `${FileSystem.cacheDirectory}${tempName}`;
      const base64 = Buffer.from(src).toString('base64');
      await FileSystem.writeAsStringAsync(uri, base64, {
        encoding: FileSystem.EncodingType.Base64,
      });
      isTemp = true;
    }

    // 3. Build Firebase Storage REST upload URL
    const bucket = storageRef.storage.app.options.storageBucket || '';
    const path = storageRef.fullPath;
    const url = `https://firebasestorage.googleapis.com/v0/b/${bucket}/o?name=${encodeURIComponent(path)}`;

    // 4. Upload via native bridge (no JS Blobs involved)
    const response = await FileSystem.uploadAsync(url, uri, {
      httpMethod: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': metadata?.contentType || 'application/pdf',
      },
      uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
    });

    if (response.status < 200 || response.status >= 300) {
      throw new Error(`Upload failed with status ${response.status}: ${response.body}`);
    }

    const uploadData = JSON.parse(response.body);

    // Cleanup temp file
    if (isTemp) {
      try {
        await FileSystem.deleteAsync(uri, { idempotent: true });
      } catch (_) { /* ok */ }
    }

    // Return shape compatible with UploadResult
    return {
      metadata: uploadData,
      ref: storageRef,
    } as UploadResult;
  } catch (error) {
    console.error('uploadFileToFirebase error:', error);
    throw error;
  }
};
