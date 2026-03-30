import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, ActivityIndicator, Alert } from 'react-native';
import { useStore } from '../store/useStore';
import { ChevronLeft, Camera as CameraIcon, Image as ImageIcon, Check, RefreshCw } from 'lucide-react-native';
import { db, storage } from '../firebase';
import { collection, addDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { PDFDocument as PDFLib } from 'pdf-lib';
import { theme } from '../theme';
import NeumorphicButton from './NeumorphicButton';
import NeumorphicView from './NeumorphicView';

interface ScannerProps {
  setView: (view: any) => void;
}

function toArrayBuffer(bytes: Uint8Array) {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

export default function Scanner({ setView }: ScannerProps) {
  const { user } = useStore();
  const [image, setImage] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [scanning, setScanning] = useState(false);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const libraryInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    return () => {
      if (image) {
        URL.revokeObjectURL(image);
      }
    };
  }, [image]);

  const setSelectedFile = (file: File | null) => {
    if (!file) return;

    if (image) {
      URL.revokeObjectURL(image);
    }

    setImage(URL.createObjectURL(file));
    setImageFile(file);
  };

  const onFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    setSelectedFile(file);
    event.target.value = '';
  };

  const handleScan = async () => {
    if (!image || !imageFile || !user) return;
    setScanning(true);

    try {
      const pdfDoc = await PDFLib.create();
      const imageBytes = await imageFile.arrayBuffer();
      const isPng = imageFile.type === 'image/png';
      const pdfImage = isPng
        ? await pdfDoc.embedPng(imageBytes)
        : await pdfDoc.embedJpg(imageBytes);
      const page = pdfDoc.addPage([pdfImage.width, pdfImage.height]);

      page.drawImage(pdfImage, {
        x: 0,
        y: 0,
        width: pdfImage.width,
        height: pdfImage.height,
      });

      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([toArrayBuffer(pdfBytes)], { type: 'application/pdf' });

      const fileId = Math.random().toString(36).substring(7);
      const storagePath = `pdfs/${user.uid}/scan-${fileId}.pdf`;
      const storageRef = ref(storage, storagePath);

      await uploadBytes(storageRef, blob);
      const fileUrl = await getDownloadURL(storageRef);

      await addDoc(collection(db, 'documents'), {
        ownerId: user.uid,
        title: `Scan - ${new Date().toLocaleDateString()}`,
        fileStoragePath: storagePath,
        fileUrl,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        isTrashed: false,
        isStarred: false,
        totalPages: 1,
        annotations: [],
      });

      setView('dashboard');
    } catch (err: any) {
      console.error('Scan error:', err);
      Alert.alert('Error', 'Failed to create PDF from image.');
    } finally {
      setScanning(false);
    }
  };

  const clearImage = () => {
    if (image) {
      URL.revokeObjectURL(image);
    }

    setImage(null);
    setImageFile(null);
  };

  return (
    <View style={styles.container}>
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={onFileChange}
        style={styles.hiddenInput as any}
      />
      <input
        ref={libraryInputRef}
        type="file"
        accept="image/*"
        onChange={onFileChange}
        style={styles.hiddenInput as any}
      />

      <View style={styles.header}>
        <NeumorphicButton radius={12} layerStyle={styles.backButton} onPress={() => setView('dashboard')}>
          <ChevronLeft size={24} color={theme.colors.text} />
        </NeumorphicButton>
        <View>
          <Text style={styles.title}>Scan to PDF</Text>
          <Text style={styles.subtitle}>CAPTURE OR UPLOAD AN IMAGE</Text>
        </View>
      </View>

      <View style={styles.content}>
        {!image ? (
          <View style={styles.menu}>
            <NeumorphicButton radius={24} layerStyle={styles.menuCard} onPress={() => cameraInputRef.current?.click()}>
              <View style={styles.menuIcon}>
                <CameraIcon size={32} color={theme.colors.text} />
              </View>
              <Text style={styles.menuTitle}>Use Camera</Text>
              <Text style={styles.menuSubtitle}>Open your device camera in the browser</Text>
            </NeumorphicButton>
            <NeumorphicButton radius={24} layerStyle={styles.menuCard} onPress={() => libraryInputRef.current?.click()}>
              <View style={styles.menuIcon}>
                <ImageIcon size={32} color={theme.colors.text} />
              </View>
              <Text style={styles.menuTitle}>Upload Photo</Text>
              <Text style={styles.menuSubtitle}>Choose an image from your device</Text>
            </NeumorphicButton>
          </View>
        ) : (
          <View style={styles.previewWrapper}>
            <Image source={{ uri: image }} style={styles.previewImage} resizeMode="contain" />
            <View style={styles.previewActions}>
              <NeumorphicButton layerStyle={styles.discardButton} onPress={clearImage}>
                <RefreshCw size={18} color="rgba(255,255,255,0.6)" />
                <Text style={styles.discardButtonText}>START OVER</Text>
              </NeumorphicButton>
              <NeumorphicButton 
                layerStyle={[styles.saveButton, { backgroundColor: theme.colors.accentStrong }]} 
                onPress={handleScan} 
                disabled={scanning}
              >
                {scanning ? <ActivityIndicator color={theme.colors.white} /> : <Check size={20} color={theme.colors.white} />}
                <Text style={styles.saveButtonText}>{scanning ? 'SAVING...' : 'CREATE PDF'}</Text>
              </NeumorphicButton>
            </View>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.bg,
    paddingTop: 60,
  },
  hiddenInput: {
    display: 'none',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 25,
    marginBottom: 30,
    gap: 15,
  },
  backButton: {
    width: 40,
    height: 40,
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  title: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  subtitle: {
    color: theme.colors.textMuted,
    fontSize: 10,
    fontWeight: 'bold',
    letterSpacing: 1,
    marginTop: 2,
  },
  content: {
    flex: 1,
    paddingHorizontal: 25,
  },
  menu: {
    gap: 20,
    marginTop: 20,
  },
  menuCard: {
    padding: 30,
    alignItems: 'center',
  },
  menuIcon: {
    width: 64,
    height: 64,
    backgroundColor: theme.colors.surfaceMuted,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  menuTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  menuSubtitle: {
    color: theme.colors.textMuted,
    fontSize: 12,
    textAlign: 'center',
  },
  previewWrapper: {
    flex: 1,
    marginBottom: 40,
  },
  previewImage: {
    flex: 1,
    borderRadius: 24,
    backgroundColor: '#000',
  },
  previewActions: {
    flexDirection: 'row',
    gap: 15,
    marginTop: 20,
  },
  discardButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  discardButtonText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 14,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  saveButton: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  saveButtonText: {
    color: theme.colors.white,
    fontSize: 14,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
});
