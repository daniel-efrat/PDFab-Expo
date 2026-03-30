import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, TextInput, ActivityIndicator, useWindowDimensions, Modal, ScrollView, ImageBackground } from 'react-native';
import { collection, query, where, orderBy, onSnapshot, addDoc, updateDoc, doc, deleteDoc } from 'firebase/firestore';
import { ref, getDownloadURL } from 'firebase/storage';
import { db, storage, auth } from '../firebase';
import { useStore } from '../store/useStore';
import { PDFDocument } from '../types';
import { FileText, Plus, Search, Star, Trash2, Clock, Zap, Scan, LogOut, User as UserIcon, Edit2, X, Check, ChevronLeft, MoreVertical, File } from 'lucide-react-native';
import * as DocumentPicker from 'expo-document-picker';
import { formatDate } from '../lib/utils';
import { SafeAreaView } from 'react-native-safe-area-context';
import { uploadFileToFirebase } from '../lib/firebase-upload';
import { theme } from '../theme';
import NeumorphicView from './NeumorphicView';
import NeumorphicButton from './NeumorphicButton';

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

  const stats = useMemo(() => {
    const activeDocuments = documents.filter((item) => !item.isTrashed);
    const starredDocuments = activeDocuments.filter((item) => item.isStarred);
    const trashedDocuments = documents.filter((item) => item.isTrashed);

    return [
      {
        label: 'Total Documents',
        value: activeDocuments.length.toString(),
        icon: FileText,
        tint: theme.colors.info,
        tintSoft: theme.colors.infoSoft,
      },
      {
        label: 'Starred Files',
        value: starredDocuments.length.toString(),
        icon: Star,
        tint: theme.colors.warning,
        tintSoft: theme.colors.warningSoft,
      },
      {
        label: 'In Trash',
        value: trashedDocuments.length.toString(),
        icon: Trash2,
        tint: theme.colors.danger,
        tintSoft: theme.colors.dangerSoft,
      },
    ];
  }, [documents]);

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
      activeOpacity={0.7}
      style={styles.card}
      onPress={() => handleOpen(item)}
    >
      <View style={styles.cardPreview}>
        <FileText size={24} color={theme.colors.accentStrong} />
      </View>
      <View style={styles.cardInfo}>
        <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
        <Text style={styles.cardDate}>{formatDate(item.updatedAt)} • PDF</Text>
      </View>
      <View style={styles.cardActions}>
        <TouchableOpacity 
          style={styles.cardActionIcon}
          onPress={(e) => { 
            e.stopPropagation(); 
            setCurrentDocument(item);
            setView('transcription');
          }}
        >
          <Zap size={20} color={theme.colors.accentStrong} />
        </TouchableOpacity>
        <TouchableOpacity 
          style={styles.cardActionIcon}
          onPress={(e) => { e.stopPropagation(); toggleStar(item.id, item.isStarred); }}
        >
          <Star size={20} color={item.isStarred ? theme.colors.warning : theme.colors.textSoft} fill={item.isStarred ? theme.colors.warning : 'transparent'} />
        </TouchableOpacity>
        <TouchableOpacity 
          style={styles.cardActionIcon}
          onPress={(e) => { e.stopPropagation(); setEditingDoc(item); setEditName(item.title); }}
        >
          <MoreVertical size={20} color={theme.colors.textSoft} />
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );

  const renderHeader = () => (
    <View style={styles.headerSpacer}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.menuIcon}>
          <Plus size={24} color={theme.colors.accentStrong} />
        </TouchableOpacity>
        <Text style={styles.appLogo}>PDFab Workspace</Text>
        <TouchableOpacity style={styles.searchHeaderIcon}>
          <Search size={24} color={theme.colors.accentStrong} />
        </TouchableOpacity>
      </View>

      <View style={styles.searchBarContainer}>
        <View style={styles.searchInputWrapper}>
          <Search size={20} color={theme.colors.textSoft} style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search your workspace..."
            placeholderTextColor={theme.colors.textSoft}
            value={search}
            onChangeText={setSearch}
          />
        </View>
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Summary</Text>
        <TouchableOpacity>
          <Text style={styles.detailsLink}>Details</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.bentoGrid}>
        <View style={[styles.bentoSmall, { width: '100%', marginBottom: 16 }]}>
          <View>
            <Text style={styles.bentoLabel}>Total Documents</Text>
            <Text style={styles.bentoValueLarge}>{documents.filter(d => !d.isTrashed).length}</Text>
          </View>
          <View style={styles.bentoIconWrapper}>
            <FileText size={24} color="#fff" />
          </View>
        </View>
        <View style={styles.bentoRow}>
          <View style={styles.bentoSmall}>
            <Star size={18} color={theme.colors.warning} fill={theme.colors.warning} style={{ marginBottom: 12 }} />
            <Text style={styles.bentoLabel}>Starred Files</Text>
            <Text style={styles.bentoValue}>{documents.filter(d => d.isStarred && !d.isTrashed).length}</Text>
          </View>
          <View style={styles.bentoSmall}>
            <Trash2 size={18} color={theme.colors.textSoft} style={{ marginBottom: 12 }} />
            <Text style={styles.bentoLabel}>In Trash</Text>
            <Text style={styles.bentoValue}>{documents.filter(d => d.isTrashed).length}</Text>
          </View>
        </View>
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Quick Actions</Text>
      </View>

      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false} 
        contentContainerStyle={styles.actionsCarousel}
      >
        <TouchableOpacity style={styles.actionCardMain} onPress={() => setView('scanner')} activeOpacity={0.9}>
          <ImageBackground 
            source={require('../../assets/gradient.png')} 
            style={styles.actionCardGradient}
            resizeMode="cover"
          >
            <View style={styles.actionIconWrapper}>
              <Scan size={24} color="#fff" />
            </View>
            <Text style={styles.actionLabelMain}>Scan to PDF</Text>
            <Text style={styles.actionDescMain}>Convert physical to digital instantly</Text>
          </ImageBackground>
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionCardMainSecondary} onPress={() => setView('transcription')} activeOpacity={0.9}>
          <ImageBackground 
            source={require('../../assets/gradient.png')} 
            style={[styles.actionCardGradient, { opacity: 0.9 }]}
            resizeMode="cover"
          >
            <View style={[styles.actionIconWrapper, { backgroundColor: 'rgba(255,255,255,0.15)' }]}>
              <Zap size={24} color="#fff" />
            </View>
            <Text style={styles.actionLabelMain}>AI Transcribe</Text>
            <Text style={styles.actionDescMain}>Audio to PDF text in seconds</Text>
          </ImageBackground>
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionCardSmall} onPress={() => setView('signatures')}>
          <Edit2 size={20} color={theme.colors.accentStrong} style={{ marginBottom: 12 }} />
          <Text style={styles.actionLabelSmall}>E-Sign</Text>
        </TouchableOpacity>
      </ScrollView>

      <View style={styles.tabs}>
        <TouchableOpacity onPress={() => setFilter('all')} style={[styles.tab, filter === 'all' && styles.activeTab]}>
          <Text style={[styles.tabText, filter === 'all' && styles.activeTabText]}>All Files</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setFilter('starred')} style={[styles.tab, filter === 'starred' && styles.activeTab]}>
          <Text style={[styles.tabText, filter === 'starred' && styles.activeTabText]}>Starred</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setFilter('trash')} style={[styles.tab, filter === 'trash' && styles.activeTab]}>
          <Text style={[styles.tabText, filter === 'trash' && styles.activeTabText]}>Trash</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <FlatList
        style={styles.list}
        data={filteredDocs}
        renderItem={renderItem}
        keyExtractor={item => item.id}
        ListHeaderComponent={renderHeader}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.empty}>
            <FileText size={48} color={theme.colors.textSoft} />
            <Text style={styles.emptyText}>No documents found</Text>
          </View>
        }
      />

      <TouchableOpacity 
        style={styles.fab}
        onPress={handleUpload}
        activeOpacity={0.8}
      >
        {uploading ? <ActivityIndicator color="#0E1320" /> : <Plus size={32} color="#0E1320" />}
      </TouchableOpacity>

      {/* Rename Modal */}
      <Modal
        visible={!!editingDoc}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setEditingDoc(null)}
      >
        <View style={styles.modalOverlay}>
          <NeumorphicView radius={24} style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Rename Document</Text>
              <TouchableOpacity onPress={() => setEditingDoc(null)}>
                <X size={20} color={theme.colors.textMuted} />
              </TouchableOpacity>
            </View>
            
            <NeumorphicView pressed radius={14} style={{ marginBottom: 25 }}>
              <TextInput
                style={styles.renameInput}
                value={editName}
                onChangeText={setEditName}
                placeholder="Enter new name..."
                placeholderTextColor={theme.colors.textSoft}
                autoFocus
              />
            </NeumorphicView>
            
            <View style={styles.modalButtons}>
              <NeumorphicButton 
                radius={12}
                layerStyle={[styles.modalButton, styles.cancelButton]} 
                onPress={() => setEditingDoc(null)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </NeumorphicButton>
              <NeumorphicButton 
                radius={12}
                layerStyle={[styles.modalButton, styles.saveButton]} 
                onPress={handleRename}
              >
                <Text style={styles.saveButtonText}>Save Changes</Text>
              </NeumorphicButton>
            </View>
          </NeumorphicView>
        </View>
      </Modal>

      {/* Toast Notification */}
      {toast && (
        <View style={[styles.toast, toast.type === 'error' && styles.toastError]}>
          <View style={styles.toastIcon}>
            {toast.type === 'success' ? <Check size={14} color={theme.colors.white} /> : <X size={14} color={theme.colors.white} />}
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
    backgroundColor: theme.colors.bg,
  },
  list: {
    flex: 1,
  },
  headerSpacer: {
    paddingTop: 12,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    marginBottom: 24,
  },
  menuIcon: {
    padding: 8,
  },
  appLogo: {
    color: theme.colors.accentStrong,
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: -0.5,
    fontFamily: 'PDFabMontserrat',
  },
  searchHeaderIcon: {
    padding: 8,
  },
  searchBarContainer: {
    paddingHorizontal: 24,
    marginBottom: 32,
  },
  searchInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: 16,
    paddingHorizontal: 16,
    height: 56,
  },
  searchIcon: {
    marginRight: 12,
  },
  searchInput: {
    flex: 1,
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: '500',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingHorizontal: 24,
    marginBottom: 16,
  },
  sectionTitle: {
    color: theme.colors.text,
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  detailsLink: {
    color: theme.colors.accentStrong,
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  bentoGrid: {
    paddingHorizontal: 24,
    marginBottom: 32,
  },
  bentoRow: {
    flexDirection: 'row',
    gap: 16,
  },
  bentoSmall: {
    flex: 1,
    backgroundColor: theme.colors.surface,
    borderRadius: 20,
    padding: 24,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.03)',
  },
  bentoLabel: {
    color: theme.colors.textSoft,
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 4,
  },
  bentoValueLarge: {
    color: theme.colors.white,
    fontSize: 36,
    fontWeight: '800',
  },
  bentoValue: {
    color: theme.colors.white,
    fontSize: 28,
    fontWeight: '800',
  },
  bentoIconWrapper: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionsCarousel: {
    paddingHorizontal: 24,
    gap: 16,
    paddingBottom: 32,
  },
  actionCardMain: {
    width: 260,
    borderRadius: 24,
    overflow: 'hidden',
  },
  actionCardMainSecondary: {
    width: 260,
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  actionCardGradient: {
    padding: 24,
    flex: 1,
  },
  actionIconWrapper: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  actionLabelMain: {
    color: '#0E1320',
    fontSize: 20,
    fontWeight: '900',
    marginBottom: 4,
  },
  actionDescMain: {
    color: 'rgba(14,19,32,0.7)',
    fontSize: 14,
    fontWeight: '500',
  },
  actionCardSmall: {
    width: 160,
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  actionLabelSmall: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: '800',
  },
  tabs: {
    flexDirection: 'row',
    paddingHorizontal: 24,
    gap: 24,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
    marginBottom: 24,
  },
  tab: {
    paddingBottom: 12,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  activeTab: {
    borderBottomColor: theme.colors.accentStrong,
  },
  tabText: {
    color: theme.colors.textSoft,
    fontSize: 14,
    fontWeight: '700',
  },
  activeTabText: {
    color: theme.colors.accentStrong,
  },
  listContent: {
    paddingBottom: 120,
  },
  card: {
    flexDirection: 'row',
    backgroundColor: theme.colors.surfaceAlt,
    marginHorizontal: 24,
    padding: 16,
    borderRadius: 20,
    marginBottom: 12,
    alignItems: 'center',
    gap: 16,
  },
  cardPreview: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: theme.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardInfo: {
    flex: 1,
  },
  cardTitle: {
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 2,
  },
  cardDate: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
    fontWeight: '500',
  },
  cardActions: {
    flexDirection: 'row',
    gap: 8,
  },
  cardActionIcon: {
    padding: 8,
  },
  fab: {
    position: 'absolute',
    right: 24,
    bottom: 110,
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: theme.colors.accentStrong,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: theme.colors.accentStrong,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 8,
  },
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 60,
  },
  emptyText: {
    color: theme.colors.textSoft,
    fontSize: 14,
    fontWeight: '800',
    marginTop: 16,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  // Toast & Modal styles retained from original but adapted to new spacing
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: {
    width: '100%',
    padding: 24,
    backgroundColor: theme.colors.surface,
    borderRadius: 24,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  modalTitle: {
    color: theme.colors.text,
    fontSize: 20,
    fontWeight: '800',
  },
  renameInput: {
    height: 56,
    paddingHorizontal: 16,
    color: theme.colors.text,
    fontSize: 16,
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: 12,
    marginBottom: 24,
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
    backgroundColor: theme.colors.accentStrong,
  },
  cancelButtonText: {
    color: theme.colors.textMuted,
    fontWeight: '800',
  },
  saveButtonText: {
    color: '#0E1320',
    fontWeight: '900',
  },
  toast: {
    position: 'absolute',
    top: 60,
    left: 20,
    right: 20,
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: 16,
    padding: 16,
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
    backgroundColor: theme.colors.danger,
  },
  toastIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  toastText: {
    color: theme.colors.white,
    fontSize: 14,
    fontWeight: '700',
  },
  toastTextError: {
    color: theme.colors.white,
  },
});
