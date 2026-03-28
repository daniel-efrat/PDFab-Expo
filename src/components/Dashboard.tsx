import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, TextInput, ActivityIndicator, useWindowDimensions, Modal } from 'react-native';
import { collection, query, where, orderBy, onSnapshot, addDoc, updateDoc, doc, deleteDoc } from 'firebase/firestore';
import { ref, getDownloadURL } from 'firebase/storage';
import { db, storage, auth } from '../firebase';
import { useStore } from '../store/useStore';
import { PDFDocument } from '../types';
import { FileText, Plus, Search, Star, Trash2, Clock, Zap, Scan, LogOut, User as UserIcon, Edit2, X, Check } from 'lucide-react-native';
import * as DocumentPicker from 'expo-document-picker';
import { formatDate } from '../lib/utils';
import { SafeAreaView } from 'react-native-safe-area-context';
import { uploadFileToFirebase } from '../lib/firebase-upload';

interface DashboardProps {
  setView: (view: any) => void;
}

export default function Dashboard({ setView }: DashboardProps) {
  const { user, setCurrentDocument } = useStore();
  const { width } = useWindowDimensions();
  const isMobile = width < 768;
  const [documents, setDocuments] = useState<PDFDocument[]>([]);
  const [search, setSearch] = useState('');
  const [uploading, setUploading] = useState(false);
  const [filter, setFilter] = useState<'all' | 'starred' | 'trash'>('all');
  
  // Toast & Rename State
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [editingDoc, setEditingDoc] = useState<PDFDocument | null>(null);
  const [editName, setEditName] = useState('');

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, 'documents'),
      where('ownerId', '==', user.uid),
      orderBy('updatedAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as PDFDocument));
      setDocuments(docs);
    });

    return () => unsubscribe();
  }, [user]);

  const handleUpload = async () => {
    if (!user) return;
    
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/pdf',
        copyToCacheDirectory: true,
      });

      if (result.canceled) return;

      setUploading(true);
      const file = result.assets[0];
      const fileId = Math.random().toString(36).substring(7);
      const storagePath = `pdfs/${user.uid}/${fileId}.pdf`;
      const storageRef = ref(storage, storagePath);
      
      await uploadFileToFirebase(storageRef, file.uri, {
        contentType: 'application/pdf',
      });
      const fileUrl = await getDownloadURL(storageRef);

      await addDoc(collection(db, 'documents'), {
        ownerId: user.uid,
        title: file.name,
        fileStoragePath: storagePath,
        fileUrl,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        isTrashed: false,
        isStarred: false,
        totalPages: 0,
        annotations: []
      });
      showToast('Document uploaded successfully!');
    } catch (error) {
      console.error('Upload error:', error);
      showToast('Failed to upload document', 'error');
    } finally {
      setUploading(false);
    }
  };

  const filteredDocs = documents.filter(doc => {
    const matchesSearch = doc.title.toLowerCase().includes(search.toLowerCase());
    if (filter === 'starred') return matchesSearch && doc.isStarred && !doc.isTrashed;
    if (filter === 'trash') return matchesSearch && doc.isTrashed;
    return matchesSearch && !doc.isTrashed;
  });

  const handleOpen = (doc: PDFDocument) => {
    setCurrentDocument(doc);
    setView('editor');
  };

  const toggleStar = async (docId: string, current: boolean) => {
    try {
      await updateDoc(doc(db, 'documents', docId), { isStarred: !current });
      showToast(current ? 'Removed from starred' : 'Added to starred');
    } catch (error) {
      showToast('Failed to update star', 'error');
    }
  };

  const moveToTrash = async (docId: string) => {
    try {
      await updateDoc(doc(db, 'documents', docId), { isTrashed: true });
      showToast('Moved to trash');
    } catch (error) {
      showToast('Failed to move to trash', 'error');
    }
  };

  const handleRename = async () => {
    if (!editingDoc || !editName.trim()) return;
    try {
      await updateDoc(doc(db, 'documents', editingDoc.id), { 
        title: editName.trim(),
        updatedAt: new Date().toISOString()
      });
      showToast('Document renamed');
      setEditingDoc(null);
    } catch (error) {
      showToast('Failed to rename document', 'error');
    }
  };

  const renderItem = ({ item }: { item: PDFDocument }) => (
    <TouchableOpacity 
      style={styles.card} 
      onPress={() => handleOpen(item)}
    >
      <View style={styles.cardPreview}>
        <FileText size={40} color="rgba(255,255,255,0.1)" />
      </View>
      <View style={styles.cardInfo}>
        <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
        <View style={styles.cardMeta}>
          <Clock size={10} color="rgba(255,255,255,0.4)" />
          <Text style={styles.cardDate}>{formatDate(item.updatedAt)}</Text>
        </View>
      </View>
      <View style={styles.cardActions}>
        <TouchableOpacity onPress={() => toggleStar(item.id, item.isStarred)}>
          <Star size={18} color={item.isStarred ? '#fbbf24' : 'rgba(255,255,255,0.2)'} fill={item.isStarred ? '#fbbf24' : 'transparent'} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => { setEditingDoc(item); setEditName(item.title); }}>
          <Edit2 size={18} color="rgba(255,255,255,0.2)" />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => moveToTrash(item.id)}>
          <Trash2 size={18} color="rgba(255,255,255,0.2)" />
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <Text style={styles.welcome}>Welcome back, {user?.displayName?.split(' ')[0] || 'User'}</Text>
          <Text style={styles.headerSubtitle}>YOUR PDF WORKSPACE</Text>
        </View>
        <TouchableOpacity
          onPress={() => auth.signOut()}
          style={[styles.logoutButton, isMobile && styles.logoutButtonMobile]}
        >
          <LogOut size={18} color="#fff" />
          {isMobile && <Text style={styles.logoutLabel}>LOG OUT</Text>}
        </TouchableOpacity>
      </View>

      {/* Search & Upload */}
      <View style={styles.searchBar}>
        <View style={styles.searchInputWrapper}>
          <Search size={16} color="rgba(255,255,255,0.2)" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search documents..."
            placeholderTextColor="rgba(255,255,255,0.2)"
            value={search}
            onChangeText={setSearch}
          />
        </View>
        <TouchableOpacity style={styles.uploadButton} onPress={handleUpload} disabled={uploading}>
          {uploading ? <ActivityIndicator color="#000" size="small" /> : <Plus size={20} color="#000" />}
        </TouchableOpacity>
      </View>

      {/* Quick Actions */}
      <View style={styles.quickActions}>
        <TouchableOpacity style={styles.actionCard} onPress={() => setView('scanner')}>
          <View style={styles.actionIcon}>
            <Scan size={20} color="#fff" />
          </View>
          <Text style={styles.actionLabel}>Scan to PDF</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionCard} onPress={() => setView('transcription')}>
          <View style={styles.actionIcon}>
            <Zap size={20} color="#fff" />
          </View>
          <Text style={styles.actionLabel}>AI Transcribe</Text>
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        <TouchableOpacity onPress={() => setFilter('all')} style={[styles.tab, filter === 'all' && styles.activeTab]}>
          <Text style={[styles.tabText, filter === 'all' && styles.activeTabText]}>ALL FILES</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setFilter('starred')} style={[styles.tab, filter === 'starred' && styles.activeTab]}>
          <Text style={[styles.tabText, filter === 'starred' && styles.activeTabText]}>STARRED</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setFilter('trash')} style={[styles.tab, filter === 'trash' && styles.activeTab]}>
          <Text style={[styles.tabText, filter === 'trash' && styles.activeTabText]}>TRASH</Text>
        </TouchableOpacity>
      </View>

      {/* List */}
      <FlatList
        data={filteredDocs}
        renderItem={renderItem}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.empty}>
            <FileText size={48} color="rgba(255,255,255,0.05)" />
            <Text style={styles.emptyText}>No documents found</Text>
          </View>
        }
      />

      {/* Rename Modal */}
      <Modal
        visible={!!editingDoc}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setEditingDoc(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Rename Document</Text>
              <TouchableOpacity onPress={() => setEditingDoc(null)}>
                <X size={20} color="rgba(255,255,255,0.4)" />
              </TouchableOpacity>
            </View>
            
            <TextInput
              style={styles.renameInput}
              value={editName}
              onChangeText={setEditName}
              placeholder="Enter new name..."
              placeholderTextColor="rgba(255,255,255,0.2)"
              autoFocus
            />
            
            <View style={styles.modalButtons}>
              <TouchableOpacity 
                style={[styles.modalButton, styles.cancelButton]} 
                onPress={() => setEditingDoc(null)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.modalButton, styles.saveButton]} 
                onPress={handleRename}
              >
                <Text style={styles.saveButtonText}>Save Changes</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Toast Notification */}
      {toast && (
        <View style={[styles.toast, toast.type === 'error' && styles.toastError]}>
          <View style={styles.toastIcon}>
            {toast.type === 'success' ? <Check size={14} color="#000" /> : <X size={14} color="#fff" />}
          </View>
          <Text style={[styles.toastText, toast.type === 'error' && styles.toastTextError]}>
            {toast.message}
          </Text>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 25,
    marginBottom: 20,
    marginTop: 10,
  },
  headerContent: {
    flex: 1,
    paddingRight: 12,
  },
  welcome: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  headerSubtitle: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 10,
    fontWeight: 'bold',
    letterSpacing: 1,
    marginTop: 2,
  },
  logoutButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  logoutButtonMobile: {
    width: 'auto',
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 14,
  },
  logoutLabel: {
    color: '#fff',
    fontSize: 11,
    fontWeight: 'bold',
    letterSpacing: 0.8,
  },
  searchBar: {
    flexDirection: 'row',
    paddingHorizontal: 25,
    gap: 12,
    marginBottom: 20,
  },
  searchInputWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    paddingHorizontal: 15,
    height: 50,
  },
  searchIcon: {
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    color: '#fff',
    fontSize: 14,
  },
  uploadButton: {
    width: 50,
    height: 50,
    backgroundColor: '#fff',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickActions: {
    flexDirection: 'row',
    paddingHorizontal: 25,
    gap: 15,
    marginBottom: 30,
  },
  actionCard: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 20,
    padding: 20,
    alignItems: 'center',
  },
  actionIcon: {
    width: 40,
    height: 40,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  actionLabel: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  tabs: {
    flexDirection: 'row',
    paddingHorizontal: 25,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
    marginBottom: 20,
  },
  tab: {
    paddingVertical: 15,
    marginRight: 25,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  activeTab: {
    borderBottomColor: '#fff',
  },
  tabText: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  activeTabText: {
    color: '#fff',
  },
  listContent: {
    paddingHorizontal: 25,
    paddingBottom: 40,
  },
  card: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    padding: 12,
    marginBottom: 15,
    alignItems: 'center',
  },
  cardPreview: {
    width: 60,
    height: 80,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 15,
  },
  cardInfo: {
    flex: 1,
  },
  cardTitle: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  cardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  cardDate: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 10,
    fontWeight: 'bold',
  },
  cardActions: {
    gap: 15,
    alignItems: 'center',
    paddingLeft: 10,
  },
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 100,
  },
  emptyText: {
    color: 'rgba(255,255,255,0.2)',
    fontSize: 14,
    fontWeight: 'bold',
    marginTop: 15,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  // Toast Styles
  toast: {
    position: 'absolute',
    top: 60,
    left: 20,
    right: 20,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 15,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
    zIndex: 1000,
  },
  toastError: {
    backgroundColor: '#ef4444',
  },
  toastIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  toastText: {
    color: '#000',
    fontSize: 14,
    fontWeight: 'bold',
  },
  toastTextError: {
    color: '#fff',
  },
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    width: '100%',
    backgroundColor: '#1a1a1a',
    borderRadius: 24,
    padding: 25,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  renameInput: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    height: 55,
    paddingHorizontal: 15,
    color: '#fff',
    fontSize: 16,
    marginBottom: 25,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  modalButton: {
    flex: 1,
    height: 50,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButton: {
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  saveButton: {
    backgroundColor: '#fff',
  },
  cancelButtonText: {
    color: 'rgba(255,255,255,0.4)',
    fontWeight: 'bold',
  },
  saveButtonText: {
    color: '#000',
    fontWeight: 'bold',
  },
});
