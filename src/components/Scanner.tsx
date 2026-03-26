import React, { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, ActivityIndicator, Dimensions, Alert } from 'react-native';
import { Camera, CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { useStore } from '../store/useStore';
import { ChevronLeft, Camera as CameraIcon, Image as ImageIcon, Check, X, Scan, RefreshCw } from 'lucide-react-native';
import { uriToBlob } from '../lib/blob-utils';
import { db, storage } from '../firebase';
import { collection, addDoc } from 'firebase/firestore';
import { ref, getDownloadURL } from 'firebase/storage';
import { PDFDocument as PDFLib } from 'pdf-lib';
import { uploadFileToFirebase } from '../lib/firebase-upload';

const { width, height } = Dimensions.get('window');

function toArrayBuffer(bytes: Uint8Array) {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

interface ScannerProps {
  setView: (view: any) => void;
}

export default function Scanner({ setView }: ScannerProps) {
  const { user } = useStore();
  const [image, setImage] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const [cameraActive, setCameraActive] = useState(false);
  const cameraRef = useRef<CameraView>(null);

  useEffect(() => {
    if (!permission) {
      requestPermission();
    }
  }, [permission]);

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 1,
    });

    if (!result.canceled) {
      setImage(result.assets[0].uri);
    }
  };

  const takePhoto = async () => {
    if (cameraRef.current) {
      const photo = await cameraRef.current.takePictureAsync();
      if (photo) {
        setImage(photo.uri);
        setCameraActive(false);
      }
    }
  };

  const handleScan = async () => {
    if (!image || !user) return;
    setScanning(true);
    try {
      const pdfDoc = await PDFLib.create();
      const imageBytes = await uriToBlob(image);
      
      // embedJpg accepts Uint8Array or ArrayBuffer. uriToBlob returns Uint8Array on native.
      const pdfImage = await pdfDoc.embedJpg(imageBytes as any);
      const page = pdfDoc.addPage([pdfImage.width, pdfImage.height]);
      page.drawImage(pdfImage, { x: 0, y: 0, width: pdfImage.width, height: pdfImage.height });

      const pdfBytes = await pdfDoc.save();

      const fileId = Math.random().toString(36).substring(7);
      const storagePath = `pdfs/${user.uid}/scan-${fileId}.pdf`;
      const storageRef = ref(storage, storagePath);
      
      await uploadFileToFirebase(storageRef, pdfBytes, {
        contentType: 'application/pdf',
      });
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
        annotations: []
      });

      setView('dashboard');
    } catch (err: any) {
      console.error('Scan error:', err);
      Alert.alert('Error', 'Failed to create PDF from scan.');
    } finally {
      setScanning(false);
    }
  };

  if (!permission) {
    return <View style={styles.container} />;
  }

  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <Text style={styles.permissionText}>We need your permission to show the camera</Text>
        <TouchableOpacity style={styles.permissionButton} onPress={requestPermission}>
          <Text style={styles.permissionButtonText}>Grant Permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => setView('dashboard')} style={styles.backButton}>
          <ChevronLeft size={24} color="#fff" />
        </TouchableOpacity>
        <View>
          <Text style={styles.title}>Scan to PDF</Text>
          <Text style={styles.subtitle}>CONVERT PHOTOS TO DOCUMENTS</Text>
        </View>
      </View>

      <View style={styles.content}>
        {!image && !cameraActive ? (
          <View style={styles.menu}>
            <TouchableOpacity style={styles.menuCard} onPress={() => setCameraActive(true)}>
              <View style={styles.menuIcon}>
                <CameraIcon size={32} color="#fff" />
              </View>
              <Text style={styles.menuTitle}>Use Camera</Text>
              <Text style={styles.menuSubtitle}>Scan documents directly</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuCard} onPress={pickImage}>
              <View style={styles.menuIcon}>
                <ImageIcon size={32} color="#fff" />
              </View>
              <Text style={styles.menuTitle}>Upload Photo</Text>
              <Text style={styles.menuSubtitle}>Pick from gallery</Text>
            </TouchableOpacity>
          </View>
        ) : cameraActive ? (
          <View style={styles.cameraWrapper}>
            <CameraView ref={cameraRef} style={styles.camera} facing="back">
              <View style={styles.overlay}>
                <View style={styles.scanFrame} />
              </View>
              <View style={styles.cameraControls}>
                <TouchableOpacity style={styles.closeButton} onPress={() => setCameraActive(false)}>
                  <X size={24} color="#fff" />
                </TouchableOpacity>
                <TouchableOpacity style={styles.captureButton} onPress={takePhoto}>
                  <View style={styles.captureButtonInner} />
                </TouchableOpacity>
                <View style={{ width: 50 }} />
              </View>
            </CameraView>
          </View>
        ) : (
          <View style={styles.previewWrapper}>
            <Image source={{ uri: image! }} style={styles.previewImage} resizeMode="contain" />
            <View style={styles.previewActions}>
              <TouchableOpacity style={styles.discardButton} onPress={() => setImage(null)}>
                <Text style={styles.discardButtonText}>DISCARD</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveButton} onPress={handleScan} disabled={scanning}>
                {scanning ? <ActivityIndicator color="#000" /> : <Check size={20} color="#000" />}
                <Text style={styles.saveButtonText}>{scanning ? 'SAVING...' : 'CREATE PDF'}</Text>
              </TouchableOpacity>
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
    backgroundColor: '#0a0a0a',
    paddingTop: 60,
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
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  subtitle: {
    color: 'rgba(255,255,255,0.4)',
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
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 24,
    padding: 30,
    alignItems: 'center',
  },
  menuIcon: {
    width: 64,
    height: 64,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  menuTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  menuSubtitle: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
  },
  cameraWrapper: {
    flex: 1,
    borderRadius: 30,
    overflow: 'hidden',
    marginBottom: 40,
  },
  camera: {
    flex: 1,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanFrame: {
    width: width * 0.7,
    height: height * 0.5,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.3)',
    borderStyle: 'dashed',
    borderRadius: 20,
  },
  cameraControls: {
    position: 'absolute',
    bottom: 30,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  captureButton: {
    width: 70,
    height: 70,
    backgroundColor: '#fff',
    borderRadius: 35,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: 'rgba(0,0,0,0.1)',
  },
  captureButtonInner: {
    width: 50,
    height: 50,
    borderRadius: 25,
    borderWidth: 2,
    borderColor: '#000',
  },
  closeButton: {
    width: 50,
    height: 50,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
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
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  discardButtonText: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 14,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  saveButton: {
    flex: 2,
    height: 56,
    backgroundColor: '#fff',
    borderRadius: 28,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  saveButtonText: {
    color: '#000',
    fontSize: 14,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  permissionText: {
    color: '#fff',
    textAlign: 'center',
    fontSize: 16,
    marginBottom: 20,
  },
  permissionButton: {
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 12,
    alignSelf: 'center',
  },
  permissionButtonText: {
    color: '#000',
    fontWeight: 'bold',
  },
});
