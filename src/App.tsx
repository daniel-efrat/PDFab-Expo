/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet, Text } from 'react-native';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from './firebase';
import { useStore } from './store/useStore';
import Auth from './components/Auth';
import Dashboard from './components/Dashboard';
import Editor from './components/Editor';
import Reflow from './components/Reflow';
import Transcription from './components/Transcription';
import Signatures from './components/Signatures';
import Scanner from './components/Scanner';
import Layout from './components/Layout';
import { UserProfile } from './types';
import { StatusBar } from 'expo-status-bar';

export default function App() {
  const { user, setUser } = useStore();
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<string>('dashboard');

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        const userRef = doc(db, 'users', firebaseUser.uid);
        const userSnap = await getDoc(userRef);
        
        let userData: UserProfile;
        if (!userSnap.exists()) {
          userData = {
            uid: firebaseUser.uid,
            email: firebaseUser.email || '',
            displayName: firebaseUser.displayName || '',
            photoURL: firebaseUser.photoURL || '',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            plan: 'free',
          };
          await setDoc(userRef, userData);
        } else {
          userData = userSnap.data() as UserProfile;
        }
        setUser(userData);
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [setUser]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#ffffff" />
        <Text style={styles.loadingText}>PDFOX</Text>
      </View>
    );
  }

  if (!user) {
    return <Auth />;
  }

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <Layout currentView={view} setView={setView}>
        {view === 'dashboard' && <Dashboard setView={setView} />}
        {view === 'editor' && <Editor setView={setView} />}
        {view === 'reflow' && <Reflow setView={setView} />}
        {view === 'transcription' && <Transcription setView={setView} />}
        {view === 'signatures' && <Signatures setView={setView} />}
        {view === 'scanner' && <Scanner setView={setView} />}
      </Layout>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#0a0a0a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    color: '#ffffff',
    marginTop: 20,
    fontSize: 24,
    fontWeight: '900',
    fontStyle: 'italic',
    letterSpacing: -1,
  },
});
