import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Image, Alert, Modal, Dimensions } from 'react-native';
import { useStore } from '../store/useStore';
import { ChevronLeft, PenTool, Trash2, Plus, Check, X, Sparkles } from 'lucide-react-native';
import { db, storage } from '../firebase';
import { doc, setDoc, deleteDoc, collection, onSnapshot } from 'firebase/firestore';
import { ref, uploadString, getDownloadURL, deleteObject } from 'firebase/storage';
import { Svg, Path, G } from 'react-native-svg';
import { SafeAreaView } from 'react-native-safe-area-context';

const { width } = Dimensions.get('window');

interface SignaturesProps {
  setView: (view: any) => void;
}

export default function Signatures({ setView }: SignaturesProps) {
  const { user } = useStore();
  const [slots, setSlots] = useState<{ [key: string]: any }>({});
  const [loading, setLoading] = useState(true);
  const [activeSlot, setActiveSlot] = useState<'signature' | 'initials' | null>(null);
  const [saving, setSaving] = useState(false);
  
  // Drawing state
  const [currentPath, setCurrentPath] = useState<string>('');
  const [paths, setPaths] = useState<string[]>([]);

  useEffect(() => {
    if (!user) return;

    const unsubscribe = onSnapshot(collection(db, `users/${user.uid}/signatureSlots`), (snapshot) => {
      const data: any = {};
      snapshot.docs.forEach(d => {
        data[d.id] = d.data();
      });
      setSlots(data);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  const handleTouchStart = (e: any) => {
    const { locationX, locationY } = e.nativeEvent;
    setCurrentPath(`M${locationX},${locationY}`);
  };

  const handleTouchMove = (e: any) => {
    const { locationX, locationY } = e.nativeEvent;
    setCurrentPath(prev => `${prev} L${locationX},${locationY}`);
  };

  const handleTouchEnd = () => {
    setPaths(prev => [...prev, currentPath]);
    setCurrentPath('');
  };

  const handleSave = async () => {
    if (!user || !activeSlot || paths.length === 0) return;
    setSaving(true);
    try {
      // In a real app, we'd convert SVG to PNG/DataURL
      // For this demo, we'll store the SVG paths as data
      const signatureData = {
        paths,
        updatedAt: new Date().toISOString(),
      };

      await setDoc(doc(db, `users/${user.uid}/signatureSlots`, activeSlot), {
        type: activeSlot,
        data: JSON.stringify(signatureData),
        imageUrl: '', // Placeholder
        updatedAt: new Date().toISOString()
      });

      setActiveSlot(null);
      setPaths([]);
    } catch (error) {
      console.error('Save signature error:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (slotId: string) => {
    if (!user || !slots[slotId]) return;
    Alert.alert(
      "Delete Signature",
      `Are you sure you want to delete your ${slotId}?`,
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Delete", 
          style: "destructive",
          onPress: async () => {
            try {
              await deleteDoc(doc(db, `users/${user.uid}/signatureSlots`, slotId));
            } catch (error) {
              console.error('Delete signature error:', error);
            }
          }
        }
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => setView('dashboard')} style={styles.backButton}>
          <ChevronLeft size={24} color="#fff" />
        </TouchableOpacity>
        <View>
          <Text style={styles.title}>Signatures Hub</Text>
          <Text style={styles.subtitle}>MANAGE YOUR SAVED SIGNATURES</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {loading ? (
          <ActivityIndicator color="#fff" style={{ marginTop: 50 }} />
        ) : (
          <View style={styles.grid}>
            <SignatureCard 
              id="signature" 
              label="Full Signature" 
              data={slots.signature} 
              onEdit={() => setActiveSlot('signature')} 
              onDelete={() => handleDelete('signature')} 
            />
            <SignatureCard 
              id="initials" 
              label="Initials" 
              data={slots.initials} 
              onEdit={() => setActiveSlot('initials')} 
              onDelete={() => handleDelete('initials')} 
            />
          </View>
        )}
      </ScrollView>

      <Modal visible={activeSlot !== null} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Create {activeSlot === 'signature' ? 'Signature' : 'Initials'}</Text>
                <Text style={styles.modalSubtitle}>DRAW YOUR SIGNATURE BELOW</Text>
              </View>
              <TouchableOpacity onPress={() => { setActiveSlot(null); setPaths([]); }}>
                <X size={24} color="rgba(255,255,255,0.4)" />
              </TouchableOpacity>
            </View>

            <View 
              style={styles.canvas}
              onStartShouldSetResponder={() => true}
              onResponderGrant={handleTouchStart}
              onResponderMove={handleTouchMove}
              onResponderRelease={handleTouchEnd}
            >
              <Svg style={StyleSheet.absoluteFill}>
                {paths.map((p, i) => (
                  <G key={`path-${i}`}>
                    <Path d={p} stroke="#000" strokeWidth={3} fill="none" />
                  </G>
                ))}
                {currentPath ? (
                  <G key="current-path">
                    <Path d={currentPath} stroke="#000" strokeWidth={3} fill="none" />
                  </G>
                ) : null}
              </Svg>
            </View>

            <View style={styles.modalFooter}>
              <TouchableOpacity onPress={() => setPaths([])} style={styles.clearButton}>
                <Trash2 size={16} color="rgba(255,255,255,0.4)" />
                <Text style={styles.clearButtonText}>CLEAR</Text>
              </TouchableOpacity>
              <View style={styles.footerActions}>
                <TouchableOpacity onPress={() => { setActiveSlot(null); setPaths([]); }} style={styles.cancelButton}>
                  <Text style={styles.cancelButtonText}>CANCEL</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.saveButton} onPress={handleSave} disabled={saving || paths.length === 0}>
                  {saving ? <ActivityIndicator color="#000" /> : <Check size={20} color="#000" />}
                  <Text style={styles.saveButtonText}>{saving ? 'SAVING...' : 'SAVE'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function SignatureCard({ id, label, data, onEdit, onDelete }: { id: string, label: string, data: any, onEdit: () => void, onDelete: () => void }) {
  const signatureData = data ? JSON.parse(data.data) : null;

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View>
          <Text style={styles.cardLabel}>{label}</Text>
          <Text style={styles.cardDate}>{data ? 'UPDATED RECENTLY' : 'NOT CREATED'}</Text>
        </View>
        {data && (
          <TouchableOpacity onPress={onDelete}>
            <Trash2 size={18} color="rgba(255,255,255,0.2)" />
          </TouchableOpacity>
        )}
      </View>

      <TouchableOpacity style={styles.cardPreview} onPress={onEdit}>
        {signatureData ? (
          <Svg style={StyleSheet.absoluteFill}>
            {signatureData.paths.map((p: string, i: number) => (
              <G key={`preview-${i}`}>
                <Path d={p} stroke="#fff" strokeWidth={2} fill="none" scale={0.6} />
              </G>
            ))}
          </Svg>
        ) : (
          <View style={styles.emptyPreview}>
            <Plus size={24} color="rgba(255,255,255,0.1)" />
          </View>
        )}
        <View style={styles.editOverlay}>
          <PenTool size={20} color="#000" />
          <Text style={styles.editText}>{data ? 'EDIT' : 'CREATE'}</Text>
        </View>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
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
  scrollContent: {
    paddingHorizontal: 25,
    paddingBottom: 40,
  },
  grid: {
    gap: 20,
  },
  card: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 24,
    padding: 25,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  cardLabel: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  cardDate: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 10,
    fontWeight: 'bold',
    letterSpacing: 1,
    marginTop: 2,
  },
  cardPreview: {
    height: 150,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#161616',
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    padding: 30,
    paddingBottom: 50,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 30,
  },
  modalTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  modalSubtitle: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 10,
    fontWeight: 'bold',
    letterSpacing: 1,
    marginTop: 2,
  },
  canvas: {
    height: 250,
    backgroundColor: '#fff',
    borderRadius: 20,
  },
  modalFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 30,
  },
  clearButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  clearButtonText: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
    fontWeight: 'bold',
  },
  footerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
  },
  cancelButton: {
    paddingVertical: 10,
  },
  cancelButtonText: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 14,
    fontWeight: 'bold',
  },
  saveButton: {
    backgroundColor: '#fff',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 25,
    paddingVertical: 12,
    borderRadius: 25,
  },
  saveButtonText: {
    color: '#000',
    fontSize: 14,
    fontWeight: 'bold',
  },
});
