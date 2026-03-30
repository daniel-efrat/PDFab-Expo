/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet, Text, Image, Platform } from 'react-native';
// @ts-ignore
import logoSrc from '../public/logo.svg';
import appIcon from '../assets/icon.png';
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
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useFonts } from 'expo-font';
import { theme } from './theme';
import { SafeAreaProvider } from 'react-native-safe-area-context';

export default function App() {
  const { user, setUser } = useStore();
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<string>('dashboard');
  const [fontsLoaded] = useFonts({
    PDFabMontserrat: require('../assets/fonts/Montserrat-VariableFont_wght.ttf'),
  });

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

  if (loading || !fontsLoaded) {
    return (
      <View style={styles.loadingContainer}>
        <Image
          source={Platform.OS === 'web' ? { uri: '/icon.png' } : appIcon}
          style={styles.loadingLogo}
          resizeMode="contain"
        />
        <Text style={styles.loadingText}>PDFab</Text>
        <ActivityIndicator size="large" color={theme.colors.accentStrong} style={{ marginTop: 20 }} />
      </View>
    );
  }

  if (!user) {
    return <Auth />;
  }

  return (
    <SafeAreaProvider>
      <GestureHandlerRootView style={styles.container}>
        <StatusBar style="light" />
        <Layout currentView={view} setView={setView}>
          {view === 'dashboard' && <Dashboard setView={setView} />}
          {view === 'editor' && <Editor setView={setView} />}
          {view === 'reflow' && <Reflow setView={setView} />}
          {view === 'transcription' && <Transcription setView={setView} />}
          {view === 'signatures' && <Signatures setView={setView} />}
          {view === 'scanner' && <Scanner setView={setView} />}
        </Layout>
      </GestureHandlerRootView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.bg,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: theme.colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingLogo: {
    width: 80,
    height: 80,
    borderRadius: 20,
  },
  loadingText: {
    color: theme.colors.text,
    marginTop: 16,
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.6,
    fontFamily: 'PDFabMontserrat',
  },
});
