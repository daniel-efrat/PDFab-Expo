import React from 'react';
import { View, Text, TouchableOpacity, Image, StyleSheet, ScrollView, Platform, useWindowDimensions } from 'react-native';
// @ts-ignore
import logoSrc from '../../public/logo.svg';
import { LayoutDashboard, FileText, Type, PenTool, Camera, LogOut, User as UserIcon } from 'lucide-react-native';
import { auth } from '../firebase';
import { useStore } from '../store/useStore';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '../theme';
import NeumorphicView from './NeumorphicView';

interface LayoutProps {
  children: React.ReactNode;
  currentView: string;
  setView: (view: any) => void;
}

export default function Layout({ children, currentView, setView }: LayoutProps) {
  const { user } = useStore();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isMobile = width < 768 || Platform.OS !== 'web';
  const handleHomePress = () => setView('dashboard');

  const navItems = [
    { id: 'dashboard', label: 'Library', icon: LayoutDashboard },
    { id: 'signatures', label: 'Signatures', icon: PenTool },
    { id: 'transcription', label: 'AI Transcribe', icon: Type },
    { id: 'scanner', label: 'Scan to PDF', icon: Camera },
  ];

  const Sidebar = () => (
    <View style={styles.sidebar}>
      <View style={styles.header}>
        <View style={styles.logoContainer}>
          <Image source={Platform.OS === 'web' ? { uri: '/logo.svg' } : logoSrc} style={styles.logo} resizeMode="contain" />
          <Text style={styles.title}>PDFab</Text>
        </View>
      </View>

      <ScrollView style={styles.nav}>
        {navItems.map((item) => (
          <TouchableOpacity
            key={item.id}
            onPress={() => setView(item.id)}
            style={[
              styles.navItem,
              currentView === item.id && styles.navItemActive
            ]}
          >
            <item.icon 
              size={20} 
              color={currentView === item.id ? theme.colors.text : theme.colors.textMuted} 
            />
            <Text style={[
              styles.navLabel,
              currentView === item.id && styles.navLabelActive
            ]}>
              {item.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <View style={styles.footer}>
        <NeumorphicView radius={18} style={styles.userCard}>
          {user?.photoURL ? (
            <Image 
              source={{ uri: user.photoURL }} 
              style={styles.avatar} 
              referrerPolicy="no-referrer" 
            />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <UserIcon size={16} color={theme.colors.textMuted} />
            </View>
          )}
          <View style={styles.userInfo}>
            <Text style={styles.userName} numberOfLines={1}>
              {user?.displayName || user?.email}
            </Text>
            <Text style={styles.userPlan}>
              {user?.plan?.toUpperCase()} PLAN
            </Text>
          </View>
          <TouchableOpacity 
            onPress={() => auth.signOut()}
            style={styles.logoutButton}
          >
            <LogOut size={16} color={theme.colors.textMuted} />
          </TouchableOpacity>
        </NeumorphicView>
      </View>
    </View>
  );

  const BottomNav = () => (
    <View style={[styles.bottomNav, { paddingBottom: Math.max(insets.bottom, 10) }]}>
      {navItems.map((item) => (
        <TouchableOpacity
          key={item.id}
          onPress={() => item.id === 'dashboard' ? handleHomePress() : setView(item.id)}
          style={styles.bottomNavItem}
        >
          <item.icon 
            size={22} 
            color={currentView === item.id ? theme.colors.accentStrong : theme.colors.textMuted} 
          />
          <Text style={[
            styles.bottomNavLabel,
            currentView === item.id && styles.bottomNavLabelActive
          ]}>
            {item.label === 'Library' ? 'Home' : item.label.split(' ')[0]}
          </Text>
        </TouchableOpacity>
      ))}
      <TouchableOpacity
        onPress={() => auth.signOut()}
        style={styles.bottomNavItem}
      >
        <LogOut size={22} color={theme.colors.textMuted} />
        <Text style={styles.bottomNavLabel}>Logout</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView 
      style={[
        styles.container, 
        { flexDirection: !isMobile ? 'row' : 'column' }
      ]} 
      edges={[]}
    >
      {!isMobile && <Sidebar />}
      <View style={styles.main}>
        {children}
      </View>
      {isMobile && currentView !== 'editor' && currentView !== 'reflow' && <BottomNav />}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.bg,
  },
  sidebar: {
    width: 260,
    borderRightWidth: 1,
    borderRightColor: theme.colors.border,
    flexDirection: 'column',
    backgroundColor: theme.colors.bgAlt,
  },
  header: {
    padding: 24,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  logoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  logo: {
    width: 32,
    height: 32,
    borderRadius: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: theme.colors.text,
    letterSpacing: -0.5,
    fontFamily: 'PDFabMontserrat',
  },
  nav: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 18,
  },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  navItemActive: {
    backgroundColor: theme.colors.accentSoft,
    borderColor: theme.colors.accentBorder,
  },
  navLabel: {
    fontSize: 14,
    color: theme.colors.textMuted,
    fontWeight: '600',
  },
  navLabelActive: {
    color: theme.colors.text,
    fontWeight: '700',
  },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  avatarPlaceholder: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: theme.colors.surfaceSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.text,
  },
  userPlan: {
    fontSize: 9,
    color: theme.colors.textSoft,
    fontWeight: 'bold',
    letterSpacing: 1,
    marginTop: 2,
  },
  logoutButton: {
    padding: 8,
    borderRadius: 10,
    backgroundColor: theme.colors.bgAlt,
  },
  main: {
    flex: 1,
    backgroundColor: theme.colors.bg,
  },
  bottomNav: {
    flexDirection: 'row',
    backgroundColor: theme.colors.bgAlt,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    paddingTop: 10,
  },
  bottomNavItem: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  bottomNavLabel: {
    fontSize: 10,
    color: theme.colors.textMuted,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  bottomNavLabelActive: {
    color: theme.colors.accentStrong,
  },
});
