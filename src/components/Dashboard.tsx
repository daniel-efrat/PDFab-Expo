import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, TextInput, ActivityIndicator, Image, ScrollView, Dimensions } from 'react-native';
import { collection, query, where, orderBy, onSnapshot, addDoc, updateDoc, doc, deleteDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage, auth } from '../firebase';
import { useStore } from '../store/useStore';
import { PDFDocument } from '../types';
import { FileText, Plus, Search, Star, Trash2, Clock, Zap, Scan, LogOut, User as UserIcon } from 'lucide-react-native';
import * as DocumentPicker from 'expo-document-picker';
import { formatDate } from '../lib/utils';

const { width } = Dimensions.get('window');

interface DashboardProps {
  setView: (view: any) => void;
}

export default function Dashboard({ setView }: DashboardProps) {
  const { user, setCurrentDocument } = useStore();
  const [documents, setDocuments] = useState<PDFDocument[]>([]);
  const [search, setSearch] = useState('');
  const [uploading, setUploading] = useState(false);
  const [filter, setFilter] = useState<'all' | 'starred' | 'trash'>('all');

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
      const response = await fetch(file.uri);
      const blob = await response.blob();

      const fileId = Math.random().toString(36).substring(7);
      const storagePath = `pdfs/${user.uid}/${fileId}.pdf`;
      const storageRef = ref(storage, storagePath);
      
      await uploadBytes(storageRef, blob);
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
        totalPages: 0, // In a real app, we'd calculate this
        annotations: []
      });
    } catch (error) {
      console.error('Upload error:', error);
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
    await updateDoc(doc(db, 'documents', docId), { isStarred: !current });
  };

  const moveToTrash = async (docId: string) => {
    await updateDoc(doc(db, 'documents', docId), { isTrashed: true });
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
        <TouchableOpacity onPress={() => moveToTrash(item.id)}>
          <Trash2 size={18} color="rgba(255,255,255,0.2)" />
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.welcome}>Welcome back, {user?.displayName?.split(' ')[0] || 'User'}</Text>
          <Text style={styles.headerSubtitle}>YOUR PDF WORKSPACE</Text>
        </View>
        <TouchableOpacity onPress={() => auth.signOut()}>
          <LogOut size={20} color="rgba(255,255,255,0.4)" />
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
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 25,
    marginBottom: 25,
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
  searchBar: {
    flexDirection: 'row',
    paddingHorizontal: 25,
    gap: 12,
    marginBottom: 25,
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
});
