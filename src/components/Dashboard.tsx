import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, TextInput, ActivityIndicator, Modal, ScrollView, ImageBackground, Platform } from 'react-native';
import { collection, query, where, orderBy, onSnapshot, addDoc, updateDoc, doc } from 'firebase/firestore';
import { ref, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../firebase';
import { useStore } from '../store/useStore';
import { PDFDocument } from '../types';
import { FileText, Plus, Search, Star, Trash2, Zap, Scan, User as UserIcon, X, Check, MoreVertical, Menu, Settings, Merge, Lock } from 'lucide-react-native';
import * as DocumentPicker from 'expo-document-picker';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatDistanceToNow } from 'date-fns';
import { uploadFileToFirebase } from '../lib/firebase-upload';
import { theme } from '../theme';
import NeumorphicView from './NeumorphicView';
import NeumorphicButton from './NeumorphicButton';

interface DashboardProps {
  setView: (view: any) => void;
}

/** Matches PDFab Workspace HTML mock (dark navy, orange accent). */
const ws = {
  bg: '#0e1320',
  surface: '#1a1f2c',
  row: '#161b28',
  searchBg: '#303442',
  accent: '#ff8c00',
  label: '#ddc1ae',
  starIcon: '#b9c5ef',
  trashIcon: '#abb4d3',
  barTint: 'rgba(26,31,44,0.92)',
  placeholder: 'rgba(221,193,174,0.55)',
};

function formatDocMeta(updatedAt: string, totalPages: number) {
  const rel = formatDistanceToNow(new Date(updatedAt), { addSuffix: true });
  const pages = totalPages > 0 ? `${totalPages} pg` : 'PDF';
  return `Updated ${rel} • ${pages}`.toUpperCase();
}

export default function Dashboard({ setView }: DashboardProps) {
  const { user, setCurrentDocument } = useStore();
  const insets = useSafeAreaInsets();
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

  const activeCount = documents.filter((d) => !d.isTrashed).length;
  const starredCount = documents.filter((d) => d.isStarred && !d.isTrashed).length;
  const trashCount = documents.filter((d) => d.isTrashed).length;

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

  const renderItem = ({ item, index }: { item: PDFDocument; index: number }) => (
    <TouchableOpacity
      activeOpacity={0.7}
      style={[styles.card, index > 2 && styles.cardFaded]}
      onPress={() => handleOpen(item)}
    >
      <View style={styles.cardIconSlot}>
        <FileText size={25} color={ws.accent} />
      </View>
      <View style={styles.cardInfo}>
        <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
        <Text style={styles.cardMeta}>{formatDocMeta(item.updatedAt, item.totalPages)}</Text>
      </View>
      <View style={styles.cardActions}>
        <TouchableOpacity
          style={styles.cardActionGhost}
          onPress={(e) => {
            e.stopPropagation();
            setCurrentDocument(item);
            setView('transcription');
          }}
        >
          <Zap size={18} color={ws.trashIcon} />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.cardActionGhost}
          onPress={(e) => {
            e.stopPropagation();
            toggleStar(item.id, item.isStarred);
          }}
        >
          <Star
            size={18}
            color={item.isStarred ? ws.accent : ws.trashIcon}
            fill={item.isStarred ? ws.accent : 'transparent'}
          />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.moreBtn}
          onPress={(e) => {
            e.stopPropagation();
            setEditingDoc(item);
            setEditName(item.title);
          }}
        >
          <MoreVertical size={13} color={ws.accent} />
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );

  const renderHeader = () => (
    <View style={styles.listHeaderInner}>
      <View style={styles.searchBarContainer}>
        <View style={styles.searchFieldOuter}>
          <View style={styles.searchIconAbs} pointerEvents="none">
            <Search size={18} color={ws.trashIcon} />
          </View>
          <TextInput
            style={styles.searchInput}
            placeholder="Search your archive..."
            placeholderTextColor={ws.placeholder}
            value={search}
            onChangeText={setSearch}
          />
        </View>
      </View>

      <View style={styles.summaryGrid}>
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => setFilter('all')}
          style={[
            styles.summaryCard,
            styles.summaryFull,
            filter === 'all' && styles.summaryCardActive,
          ]}
        >
          <View style={styles.summaryAccent} />
          <View style={styles.summaryBody}>
            <View>
              <Text style={styles.summaryLabel}>Total Documents</Text>
              <Text style={styles.summaryValueLarge}>{activeCount}</Text>
            </View>
            <Settings size={24} color={ws.accent} />
          </View>
        </TouchableOpacity>

        <View style={styles.summaryRow}>
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => setFilter('starred')}
            style={[
              styles.summaryCard,
              styles.summaryHalf,
              filter === 'starred' && styles.summaryCardActive,
            ]}
          >
            <View style={styles.summaryAccent} />
            <View style={styles.summaryBody}>
              <View>
                <Text style={styles.summaryLabel}>Starred</Text>
                <Text style={styles.summaryValueLarge}>{starredCount}</Text>
              </View>
              <Star size={24} color={ws.starIcon} />
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => setFilter('trash')}
            style={[
              styles.summaryCard,
              styles.summaryHalf,
              filter === 'trash' && styles.summaryCardActive,
            ]}
          >
            <View style={styles.summaryAccent} />
            <View style={styles.summaryBody}>
              <View>
                <Text style={styles.summaryLabel}>In Trash</Text>
                <Text style={styles.summaryValueLarge}>{trashCount}</Text>
              </View>
              <Trash2 size={24} color={ws.trashIcon} />
            </View>
          </TouchableOpacity>
        </View>
      </View>

      <View style={[styles.sectionBlock, styles.sectionPad]}>
        <View style={[styles.sectionTitleRow, styles.quickActionsTitleSpacing]}>
          <View style={styles.sectionOrangeBar} />
          <Text style={styles.sectionHeading}>Quick Actions</Text>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.actionsCarousel}
        >
          <TouchableOpacity style={styles.actionCardMain} onPress={() => setView('scanner')} activeOpacity={0.92}>
            <ImageBackground
              source={require('../../assets/gradient.png')}
              style={styles.actionCardGradient}
              resizeMode="cover"
            >
              <View style={styles.actionIconWrapper}>
                <Scan size={18} color="#fff" />
              </View>
              <Text style={styles.actionLabelMain}>Scan to PDF</Text>
              <Text style={styles.actionDescMain}>Convert physical to digital instantly</Text>
              <View style={styles.actionWatermark} pointerEvents="none">
                <FileText size={110} color="rgba(222,226,244,0.12)" />
              </View>
            </ImageBackground>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionCardSmall}
            onPress={() => showToast('Merge PDFs is coming soon')}
            activeOpacity={0.85}
          >
            <Merge size={20} color="#ffb77d" />
            <Text style={styles.actionLabelSmall}>Merge</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionCardSmall} onPress={() => setView('signatures')} activeOpacity={0.85}>
            <Lock size={20} color="#ffb77d" />
            <Text style={styles.actionLabelSmall}>Protect</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      <View style={styles.sectionBlock}>
        <View style={styles.recentHeaderRow}>
          <View style={styles.sectionTitleRow}>
            <View style={styles.sectionOrangeBar} />
            <Text style={styles.sectionHeading}>Recent Files</Text>
          </View>
          <TouchableOpacity onPress={() => setFilter('all')} activeOpacity={0.7}>
            <Text style={styles.viewAllLink}>View All</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.safeRoot} edges={['bottom']}>
      <View style={styles.root}>
        <View
          style={[
            styles.topBar,
            {
              paddingTop: insets.top + 10,
              paddingBottom: 14,
              ...(Platform.OS === 'web'
                ? { boxShadow: '0 8px 32px rgba(9,14,26,0.5)' as const }
                : null),
            },
          ]}
        >
          <View style={styles.topBarLeft}>
            <TouchableOpacity style={styles.topBarIconBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Menu size={18} color={ws.accent} />
            </TouchableOpacity>
            <Text style={styles.topBarTitle} numberOfLines={1}>
              PDFab workspace
            </Text>
          </View>
          <View style={styles.avatarRing}>
            <UserIcon size={22} color="#fff" />
          </View>
        </View>

        <FlatList
          style={styles.list}
          data={filteredDocs}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={renderHeader}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.empty}>
              <FileText size={48} color={ws.trashIcon} />
              <Text style={styles.emptyText}>No documents found</Text>
            </View>
          }
        />

        <TouchableOpacity style={styles.fabOuter} onPress={handleUpload} activeOpacity={0.88}>
          <ImageBackground
            source={require('../../assets/gradient.png')}
            style={styles.fab}
            imageStyle={styles.fabImageRadius}
            resizeMode="cover"
          >
            {uploading ? <ActivityIndicator color="#0e1320" /> : <Plus size={22} color="#0e1320" />}
          </ImageBackground>
        </TouchableOpacity>
      </View>

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
  safeRoot: {
    flex: 1,
    backgroundColor: ws.bg,
  },
  root: {
    flex: 1,
    backgroundColor: ws.bg,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    backgroundColor: ws.barTint,
    zIndex: 10,
    ...Platform.select({
      ios: {
        shadowColor: '#09121e',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.5,
        shadowRadius: 16,
      },
      android: { elevation: 12 },
      default: {},
    }),
  },
  topBarLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 0,
  },
  topBarIconBtn: {
    marginRight: 12,
    padding: 4,
  },
  topBarTitle: {
    flexShrink: 1,
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    fontFamily: 'PDFabMontserrat',
  },
  avatarRing: {
    width: 40,
    height: 40,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#f97316',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 12,
  },
  list: {
    flex: 1,
    backgroundColor: ws.bg,
  },
  listHeaderInner: {
    paddingTop: 8,
    paddingBottom: 8,
  },
  listContent: {
    paddingBottom: 120,
  },
  searchBarContainer: {
    paddingHorizontal: 24,
    marginBottom: 24,
  },
  searchFieldOuter: {
    backgroundColor: ws.searchBg,
    borderRadius: 12,
    position: 'relative',
  },
  searchIconAbs: {
    position: 'absolute',
    left: 16,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    zIndex: 1,
  },
  searchInput: {
    paddingVertical: 16,
    paddingLeft: 48,
    paddingRight: 16,
    fontSize: 16,
    fontWeight: '500',
    color: '#f3f4f7',
    fontFamily: 'PDFabMontserrat',
  },
  summaryGrid: {
    paddingHorizontal: 24,
    marginBottom: 28,
  },
  summaryCard: {
    backgroundColor: ws.surface,
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
  },
  summaryFull: {
    width: '100%',
    marginBottom: 16,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: 16,
  },
  summaryHalf: {
    flex: 1,
  },
  summaryAccent: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    backgroundColor: ws.accent,
    borderTopLeftRadius: 12,
    borderBottomLeftRadius: 12,
  },
  summaryBody: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    padding: 22,
    paddingLeft: 20,
  },
  summaryLabel: {
    color: ws.label,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
    marginBottom: 4,
    fontFamily: 'PDFabMontserrat',
  },
  summaryValueLarge: {
    color: '#ffffff',
    fontSize: 34,
    fontWeight: '800',
    lineHeight: 40,
    fontFamily: 'PDFabMontserrat',
  },
  summaryCardActive: {
    borderWidth: 1,
    borderColor: 'rgba(255, 140, 0, 0.45)',
  },
  sectionBlock: {
    marginBottom: 24,
  },
  sectionPad: {
    paddingHorizontal: 24,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sectionOrangeBar: {
    width: 4,
    height: 20,
    borderRadius: 2,
    backgroundColor: ws.accent,
    marginRight: 10,
  },
  sectionHeading: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.2,
    fontFamily: 'PDFabMontserrat',
  },
  recentHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    marginBottom: 12,
  },
  viewAllLink: {
    color: ws.accent,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    fontFamily: 'PDFabMontserrat',
  },
  quickActionsTitleSpacing: {
    marginBottom: 14,
  },
  actionsCarousel: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 16,
    paddingBottom: 4,
    paddingTop: 4,
    paddingRight: 24,
  },
  actionCardMain: {
    width: 280,
    minHeight: 148,
    borderRadius: 12,
    overflow: 'hidden',
  },
  actionCardGradient: {
    padding: 22,
    flex: 1,
    position: 'relative',
    overflow: 'hidden',
  },
  actionWatermark: {
    position: 'absolute',
    right: -28,
    bottom: -28,
    opacity: 1,
  },
  actionIconWrapper: {
    width: 48,
    height: 48,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  actionLabelMain: {
    color: '#0e1320',
    fontSize: 19,
    fontWeight: '800',
    marginBottom: 4,
    fontFamily: 'PDFabMontserrat',
  },
  actionDescMain: {
    color: 'rgba(14,19,32,0.72)',
    fontSize: 13,
    fontWeight: '500',
    maxWidth: 220,
    fontFamily: 'PDFabMontserrat',
  },
  actionCardSmall: {
    width: 160,
    backgroundColor: ws.surface,
    borderRadius: 12,
    padding: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    flexDirection: 'column',
    gap: 14,
  },
  actionLabelSmall: {
    color: '#dee2f4',
    fontSize: 15,
    fontWeight: '700',
    fontFamily: 'PDFabMontserrat',
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: ws.row,
    marginHorizontal: 24,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 12,
    marginBottom: 10,
  },
  cardFaded: {
    opacity: 0.82,
  },
  cardIconSlot: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  cardInfo: {
    flex: 1,
    minWidth: 0,
  },
  cardTitle: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 4,
    fontFamily: 'PDFabMontserrat',
  },
  cardMeta: {
    color: ws.label,
    fontSize: 10,
    fontWeight: '500',
    letterSpacing: 0.2,
    fontFamily: 'PDFabMontserrat',
  },
  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  cardActionGhost: {
    padding: 6,
  },
  moreBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(255,140,0,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabOuter: {
    position: 'absolute',
    right: 22,
    bottom: 102,
    zIndex: 20,
    borderRadius: 12,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: ws.accent,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.35,
        shadowRadius: 14,
      },
      android: { elevation: 10 },
      default: {},
    }),
  },
  fab: {
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabImageRadius: {
    borderRadius: 12,
  },
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 48,
    paddingHorizontal: 24,
  },
  emptyText: {
    color: ws.trashIcon,
    fontSize: 13,
    fontWeight: '700',
    marginTop: 14,
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontFamily: 'PDFabMontserrat',
  },
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
