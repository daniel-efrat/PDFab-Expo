import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Camera, Check, ChevronLeft, Image as ImageIcon, PenTool, Plus, Trash2, X } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { collection, deleteDoc, doc, onSnapshot, setDoc } from 'firebase/firestore';
import { ref as storageRef, getDownloadURL } from 'firebase/storage';
import { G, Path, Svg } from 'react-native-svg';
import { db, storage } from '../firebase';
import { uploadFileToFirebase } from '../lib/firebase-upload';
import { useStore } from '../store/useStore';
import { theme } from '../theme';
import NeumorphicButton from './NeumorphicButton';
import NeumorphicView from './NeumorphicView';

interface SignaturesProps {
  setView: (view: any) => void;
}

type SlotId = 'signature' | 'initials';
type ComposerMode = 'draw' | 'image' | 'camera';
type SignaturePayload =
  | { kind: 'draw'; paths: string[]; updatedAt: string }
  | { kind: 'image'; imageUri: string; updatedAt: string };

function parseSignatureData(raw: any): SignaturePayload | null {
  if (!raw?.data) return null;
  try {
    return JSON.parse(raw.data) as SignaturePayload;
  } catch {
    return null;
  }
}

function getScreenOrientationModule() {
  try {
    // Loaded lazily so a stale native build doesn't crash module initialization.
    return require('expo-screen-orientation');
  } catch {
    return null;
  }
}

export default function Signatures({ setView }: SignaturesProps) {
  const { user } = useStore();
  const windowDimensions = useWindowDimensions();
  const [slots, setSlots] = useState<{ [key: string]: any }>({});
  const [loading, setLoading] = useState(true);
  const [activeSlot, setActiveSlot] = useState<SlotId | null>(null);
  const [saving, setSaving] = useState(false);
  const [composerMode, setComposerMode] = useState<ComposerMode>('draw');
  const [currentPath, setCurrentPath] = useState('');
  const [paths, setPaths] = useState<string[]>([]);
  const [selectedImageUri, setSelectedImageUri] = useState<string | null>(null);
  const [imageBusy, setImageBusy] = useState(false);

  useEffect(() => {
    if (!user) return;

    const unsubscribe = onSnapshot(collection(db, `users/${user.uid}/signatureSlots`), (snapshot) => {
      const data: any = {};
      snapshot.docs.forEach((slotDoc) => {
        data[slotDoc.id] = slotDoc.data();
      });
      setSlots(data);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    if (!activeSlot) return;
    const ScreenOrientation = getScreenOrientationModule();
    if (!ScreenOrientation) return;

    void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE).catch(() => {});

    return () => {
      void ScreenOrientation.unlockAsync().catch(() => {});
    };
  }, [activeSlot]);

  const composerLandscapeWidth = Math.max(windowDimensions.width, windowDimensions.height);
  const composerLandscapeHeight = Math.min(windowDimensions.width, windowDimensions.height);


  const activeSlotLabel = activeSlot === 'signature' ? 'Signature' : 'Initials';
  const hasDrawableContent = paths.length > 0;
  const canSave =
    composerMode === 'draw'
      ? hasDrawableContent
      : !!selectedImageUri;

  const closeComposer = () => {
    setActiveSlot(null);
    setComposerMode('draw');
    setCurrentPath('');
    setPaths([]);
    setSelectedImageUri(null);
    setImageBusy(false);
  };

  const openComposer = (slotId: SlotId) => {
    const existing = parseSignatureData(slots[slotId]);
    setActiveSlot(slotId);
    setComposerMode(existing?.kind === 'image' ? 'image' : 'draw');
    setCurrentPath('');
    setPaths(existing?.kind === 'draw' ? existing.paths : []);
    setSelectedImageUri(existing?.kind === 'image' ? existing.imageUri : null);
  };

  const handleTouchStart = (e: any) => {
    if (composerMode !== 'draw') return;
    const { locationX, locationY } = e.nativeEvent;
    setCurrentPath(`M${locationX},${locationY}`);
  };

  const handleTouchMove = (e: any) => {
    if (composerMode !== 'draw') return;
    const { locationX, locationY } = e.nativeEvent;
    setCurrentPath((prev) => `${prev} L${locationX},${locationY}`);
  };

  const handleTouchEnd = () => {
    if (composerMode !== 'draw' || !currentPath) return;
    setPaths((prev) => [...prev, currentPath]);
    setCurrentPath('');
  };

  const removeBackground = async (base64: string, mimeType: string): Promise<string> => {
    const originalUri = `data:${mimeType || 'image/png'};base64,${base64}`;
    const apiKey = process.env.EXPO_PUBLIC_REMOVE_BG_API_KEY;
    if (!apiKey) return originalUri;
    try {
      const response = await fetch('https://api.withoutbg.com/v1.0/image-without-background-base64', {
        method: 'POST',
        headers: {
          'X-API-Key': apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ image_base64: base64 }),
      });
      if (!response.ok) {
        console.error('[removeBackground] API error:', response.status, await response.text());
        return originalUri;
      }
      const data = await response.json();
      return `data:image/png;base64,${data.img_without_background_base64}`;
    } catch (e) {
      console.error('[removeBackground] Error:', e);
      return originalUri;
    }
  };

  const importImage = async (source: 'library' | 'camera') => {
    try {
      setImageBusy(true);
      const permissionResult =
        source === 'camera'
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permissionResult.granted) {
        Alert.alert('Permission needed', source === 'camera' ? 'Camera access is required.' : 'Photo library access is required.');
        return;
      }

      const result =
        source === 'camera'
          ? await ImagePicker.launchCameraAsync({
              mediaTypes: ['images'],
              quality: 1,
              base64: true,
              allowsEditing: true,
              aspect: [4, 2],
            })
          : await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ['images'],
              quality: 1,
              base64: true,
              allowsEditing: true,
              aspect: [4, 2],
            });

      if (result.canceled || !result.assets[0]) {
        return;
      }

      const asset = result.assets[0];
      let imageUri = asset.uri;

      if (asset.base64) {
        imageUri = await removeBackground(asset.base64, asset.mimeType || 'image/png');
      }

      setSelectedImageUri(imageUri);
    } catch (error) {
      console.error('Import signature image error:', error);
    } finally {
      setImageBusy(false);
    }
  };

  const handleSave = async () => {
    if (!user || !activeSlot || !canSave) return;
    setSaving(true);
    try {
      let imageUri = selectedImageUri ?? '';

      if (composerMode !== 'draw' && imageUri.startsWith('data:')) {
        const [header, base64Data] = imageUri.split(',');
        const mimeType = header.match(/data:(.*);base64/)?.[1] || 'image/png';
        const ext = mimeType.includes('png') ? 'png' : 'jpg';

        let uploadSrc: string = imageUri;
        let tempPath: string | null = null;

        if (Platform.OS !== 'web') {
          tempPath = `${FileSystem.cacheDirectory}sig-${Date.now()}.${ext}`;
          await FileSystem.writeAsStringAsync(tempPath, base64Data, {
            encoding: FileSystem.EncodingType.Base64,
          });
          uploadSrc = tempPath;
        }

        const sigRef = storageRef(storage, `users/${user.uid}/signatures/${activeSlot}.png`);
        await uploadFileToFirebase(sigRef, uploadSrc, { contentType: mimeType });
        imageUri = await getDownloadURL(sigRef);

        if (tempPath) {
          await FileSystem.deleteAsync(tempPath, { idempotent: true }).catch(() => {});
        }
      }

      const signatureData: SignaturePayload =
        composerMode === 'draw'
          ? { kind: 'draw', paths, updatedAt: new Date().toISOString() }
          : { kind: 'image', imageUri, updatedAt: new Date().toISOString() };

      await setDoc(doc(db, `users/${user.uid}/signatureSlots`, activeSlot), {
        type: activeSlot,
        data: JSON.stringify(signatureData),
        imageUrl: composerMode !== 'draw' ? imageUri : '',
        updatedAt: new Date().toISOString(),
      });

      closeComposer();
    } catch (error) {
      console.error('Save signature error:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (slotId: SlotId) => {
    if (!user || !slots[slotId]) return;
    Alert.alert(
      'Delete Signature',
      `Are you sure you want to delete your ${slotId}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteDoc(doc(db, `users/${user.uid}/signatureSlots`, slotId));
            } catch (error) {
              console.error('Delete signature error:', error);
            }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <NeumorphicButton radius={12} layerStyle={styles.backButton} onPress={() => setView('dashboard')}>
          <ChevronLeft size={24} color={theme.colors.text} />
        </NeumorphicButton>
        <View>
          <Text style={styles.title}>Signatures Hub</Text>
          <Text style={styles.subtitle}>MANAGE YOUR SAVED SIGNATURES</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {loading ? (
          <ActivityIndicator color={theme.colors.white} style={{ marginTop: 50 }} />
        ) : (
          <View style={styles.grid}>
            <SignatureCard
              id="signature"
              label="Full Signature"
              data={slots.signature}
              onEdit={() => openComposer('signature')}
              onDelete={() => handleDelete('signature')}
            />
            <SignatureCard
              id="initials"
              label="Initials"
              data={slots.initials}
              onEdit={() => openComposer('initials')}
              onDelete={() => handleDelete('initials')}
            />
          </View>
        )}
      </ScrollView>

      <Modal
        visible={activeSlot !== null}
        animationType="slide"
        transparent={false}
        presentationStyle="fullScreen"
        supportedOrientations={['landscape']}
      >
        <SafeAreaView style={styles.composerRoot} edges={['top', 'bottom']}>
          <View style={styles.composerHeader}>
            <TouchableOpacity onPress={closeComposer} style={styles.composerHeaderBtn}>
              <Text style={styles.composerHeaderBtnText}>Cancel</Text>
            </TouchableOpacity>
 
             <View style={styles.composerTabs}>
               <ComposerTab
                 icon={PenTool}
                 label="Draw"
                 active={composerMode === 'draw'}
                 onPress={() => setComposerMode('draw')}
               />
               <ComposerTab
                 icon={ImageIcon}
                 label="Image"
                 active={composerMode === 'image'}
                 onPress={() => {
                   setComposerMode('image');
                   if (!selectedImageUri) {
                     importImage('library');
                   }
                 }}
               />
               <ComposerTab
                 icon={Camera}
                 label="Camera"
                 active={composerMode === 'camera'}
                 onPress={() => {
                   setComposerMode('camera');
                   if (!selectedImageUri) {
                     importImage('camera');
                   }
                 }}
               />
             </View>
 
             <TouchableOpacity
               onPress={handleSave}
               style={styles.composerHeaderBtn}
               disabled={!canSave || saving}
             >
               <Text style={[styles.composerHeaderDoneText, (!canSave || saving) && styles.composerHeaderDoneTextDisabled]}>
                 {saving ? 'Saving...' : 'Done'}
               </Text>
             </TouchableOpacity>
           </View>

          <View style={styles.composerStage}>
            {composerMode === 'draw' ? (
              <NeumorphicView
                pressed
                radius={24}
                layerStyle={[
                  styles.drawStage,
                  {
                    minHeight: Math.max(composerLandscapeHeight - 180, 280),
                    backgroundColor: '#fff',
                  },
                ]}
                onStartShouldSetResponder={() => true}
                onResponderGrant={handleTouchStart}
                onResponderMove={handleTouchMove}
                onResponderRelease={handleTouchEnd}
              >
                <Text style={styles.signHereLabel}>Sign Here</Text>
                <View style={styles.signGuideBadge}>
                  <Text style={styles.signGuideBadgeText}>Sign</Text>
                </View>
                <View style={styles.signGuideLine} />
                <Svg style={StyleSheet.absoluteFill}>
                  {paths.map((path, index) => (
                    <G key={`path-${index}`}>
                      <Path d={path} stroke="#111" strokeWidth={3} fill="none" />
                    </G>
                  ))}
                  {currentPath ? (
                    <G key="current-path">
                      <Path d={currentPath} stroke="#111" strokeWidth={3} fill="none" />
                    </G>
                  ) : null}
                </Svg>
              </NeumorphicView>
            ) : (
              <NeumorphicView
                pressed
                radius={24}
                layerStyle={[
                  styles.assetStage,
                  {
                    minHeight: Math.max(composerLandscapeHeight - 180, 280),
                    width: Math.max(composerLandscapeWidth - 36, 280),
                    backgroundColor: '#fff',
                  },
                ]}
              >
                {selectedImageUri ? (
                  <Image source={{ uri: selectedImageUri }} style={styles.assetPreview as any} resizeMode="contain" />
                ) : (
                  <View style={styles.assetPlaceholder}>
                    {imageBusy ? (
                      <ActivityIndicator color="#111" />
                    ) : (
                      <>
                        {composerMode === 'image' ? <ImageIcon size={34} color="rgba(17,17,17,0.28)" /> : <Camera size={34} color="rgba(17,17,17,0.28)" />}
                        <Text style={styles.assetPlaceholderText}>
                          {composerMode === 'image' ? 'Pick an image to turn into a signature.' : 'Capture a signature with the camera.'}
                        </Text>
                      </>
                    )}
                  </View>
                )}

                <TouchableOpacity
                  style={styles.assetActionBtn}
                  onPress={() => importImage(composerMode === 'image' ? 'library' : 'camera')}
                  disabled={imageBusy}
                >
                  <Text style={styles.assetActionBtnText}>
                    {imageBusy
                      ? 'Processing...'
                      : composerMode === 'image'
                        ? selectedImageUri ? 'Choose Another Image' : 'Choose Image'
                        : selectedImageUri ? 'Retake Photo' : 'Open Camera'}
                  </Text>
                </TouchableOpacity>
                </NeumorphicView>
            )}
          </View>

          <View style={styles.composerFooter}>
            {composerMode === 'draw' ? (
              <TouchableOpacity onPress={() => { setPaths([]); setCurrentPath(''); }} style={styles.clearButton}>
                <Trash2 size={16} color="rgba(255,255,255,0.55)" />
                <Text style={styles.clearButtonText}>Clear</Text>
              </TouchableOpacity>
            ) : (
              <View />
            )}
          </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

function ComposerTab({
  icon: Icon,
  label,
  active,
  onPress,
}: {
  icon: any;
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.composerTab} onPress={onPress}>
      <Icon size={22} color={active ? '#60a5fa' : 'rgba(255,255,255,0.85)'} />
      <Text style={[styles.composerTabText, active && styles.composerTabTextActive]}>{label}</Text>
      <View style={[styles.composerTabUnderline, active && styles.composerTabUnderlineActive]} />
    </TouchableOpacity>
  );
}

function SignatureCard({
  id,
  label,
  data,
  onEdit,
  onDelete,
}: {
  id: string;
  label: string;
  data: any;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const signatureData = useMemo(() => parseSignatureData(data), [data]);

  return (
    <NeumorphicView radius={24} style={styles.card}>
      <View style={styles.cardHeader}>
        <View>
          <Text style={styles.cardLabel}>{label}</Text>
          <Text style={styles.cardDate}>{data ? 'UPDATED RECENTLY' : 'NOT CREATED'}</Text>
        </View>
        {data && (
          <TouchableOpacity onPress={onDelete}>
            <Trash2 size={18} color={theme.colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      <NeumorphicButton radius={16} layerStyle={styles.cardPreview} onPress={onEdit}>
        {signatureData ? (
          signatureData.kind === 'draw' ? (
            <Svg style={StyleSheet.absoluteFill}>
              {signatureData.paths.map((path, index) => (
                <G key={`preview-${index}`}>
                  <Path d={path} stroke="#fff" strokeWidth={2} fill="none" scale={0.6} />
                </G>
              ))}
            </Svg>
          ) : (
            <Image source={{ uri: signatureData.imageUri }} style={styles.cardPreviewImage as any} resizeMode="contain" />
          )
        ) : (
          <View style={styles.emptyPreview}>
            <Plus size={24} color={theme.colors.textSoft} />
          </View>
        )}
        <View style={styles.editOverlay}>
          <PenTool size={20} color="#000" />
          <Text style={styles.editText}>{data ? 'EDIT' : 'CREATE'}</Text>
        </View>
      </NeumorphicButton>
    </NeumorphicView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.bg,
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
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: 'bold',
  },
  subtitle: {
    color: theme.colors.textSoft,
    fontSize: 10,
    fontWeight: 'bold',
    letterSpacing: 1,
    marginTop: 2,
  },
  scrollContent: {
    paddingHorizontal: 25,
    paddingBottom: 40,
  },
  grid: {
    gap: 20,
  },
  card: {
    padding: 25,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  cardLabel: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: 'bold',
  },
  cardDate: {
    color: theme.colors.textMuted,
    fontSize: 10,
    fontWeight: 'bold',
    letterSpacing: 1,
    marginTop: 2,
  },
  cardPreview: {
    height: 150,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  cardPreviewImage: {
    width: '100%',
    height: '100%',
  },
  emptyPreview: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  editOverlay: {
    position: 'absolute',
    backgroundColor: '#fff',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 20,
    bottom: 15,
  },
  editText: {
    color: '#000',
    fontSize: 12,
    fontWeight: 'bold',
  },
  composerRoot: {
    flex: 1,
    backgroundColor: theme.colors.bg,
  },
  composerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 28,
    paddingVertical: 18,
  },
  composerHeaderBtn: {
    minWidth: 92,
  },
  composerHeaderBtnText: {
    color: theme.colors.text,
    fontSize: 19,
    fontWeight: '700',
  },
  composerHeaderDoneText: {
    color: theme.colors.accentStrong,
    fontSize: 19,
    fontWeight: '700',
    textAlign: 'right',
  },
  composerHeaderDoneTextDisabled: {
    color: 'rgba(96,165,250,0.35)',
  },
  composerTabs: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 28,
  },
  composerTab: {
    alignItems: 'center',
    gap: 6,
  },
  composerTabText: {
    color: theme.colors.textSoft,
    fontSize: 18,
  },
  composerTabTextActive: {
    color: theme.colors.accentStrong,
  },
  composerTabUnderline: {
    marginTop: 4,
    height: 3,
    width: 78,
    borderRadius: 999,
    backgroundColor: 'transparent',
  },
  composerTabUnderlineActive: {
    backgroundColor: theme.colors.accentStrong,
  },
  composerStage: {
    flex: 1,
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  drawStage: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 8,
    overflow: 'hidden',
  },
  signHereLabel: {
    position: 'absolute',
    left: '50%',
    top: '52%',
    transform: [{ translateX: -100 }, { translateY: -24 }],
    color: 'rgba(17,17,17,0.9)',
    fontSize: 34,
    zIndex: 1,
  },
  signGuideBadge: {
    position: 'absolute',
    left: 26,
    top: '42%',
    width: 62,
    height: 150,
    backgroundColor: '#ff5b47',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  signGuideBadgeText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
    transform: [{ rotate: '90deg' }],
  },
  signGuideLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '63%',
    height: 2,
    backgroundColor: theme.colors.accentStrong,
    zIndex: 1,
  },
  assetStage: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 18,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 18,
  },
  assetPreview: {
    width: '100%',
    height: '100%',
  },
  assetPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    width: '100%',
  },
  assetPlaceholderText: {
    color: 'rgba(17,17,17,0.6)',
    fontSize: 18,
    textAlign: 'center',
    maxWidth: 420,
  },
  assetActionBtn: {
    backgroundColor: '#111',
    paddingHorizontal: 22,
    paddingVertical: 14,
    borderRadius: 999,
  },
  assetActionBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  composerFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingBottom: 18,
  },
  clearButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  clearButtonText: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 14,
    fontWeight: '700',
  },
});
