import React from 'react';
import { View, Text, TouchableOpacity, Image, StyleSheet, ScrollView } from 'react-native';
import { LayoutDashboard, FileText, Type, PenTool, Camera, LogOut, User as UserIcon } from 'lucide-react-native';
import { auth } from '../firebase';
import { useStore } from '../store/useStore';

interface LayoutProps {
  children: React.ReactNode;
  currentView: string;
  setView: (view: any) => void;
}

export default function Layout({ children, currentView, setView }: LayoutProps) {
  const { user } = useStore();

  const navItems = [
    { id: 'dashboard', label: 'Library', icon: LayoutDashboard },
    { id: 'signatures', label: 'Signatures', icon: PenTool },
    { id: 'transcription', label: 'AI Transcribe', icon: Type },
    { id: 'scanner', label: 'Scan to PDF', icon: Camera },
  ];

  return (
    <View style={styles.container}>
      {/* Sidebar */}
      <View style={styles.sidebar}>
        <View style={styles.header}>
          <View style={styles.logoContainer}>
            <View style={styles.logo}>
              <Text style={styles.logoText}>P</Text>
            </View>
            <Text style={styles.title}>PDFOX</Text>
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
                color={currentView === item.id ? "#000" : "rgba(255,255,255,0.4)"} 
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
          <View style={styles.userCard}>
            {user?.photoURL ? (
              <Image 
                source={{ uri: user.photoURL }} 
                style={styles.avatar} 
                referrerPolicy="no-referrer" 
              />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <UserIcon size={16} color="rgba(255,255,255,0.4)" />
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
              <LogOut size={16} color="rgba(255,255,255,0.4)" />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Main Content */}
      <View style={styles.main}>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#0a0a0a',
  },
  sidebar: {
    width: 260,
    borderRightWidth: 1,
    borderRightColor: 'rgba(255,255,255,0.1)',
    flexDirection: 'column',
  },
  header: {
    padding: 24,
  },
  logoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  logo: {
    width: 32,
    height: 32,
    backgroundColor: '#fff',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoText: {
    fontSize: 20,
    fontWeight: '900',
    fontStyle: 'italic',
    color: '#000',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    letterSpacing: -0.5,
  },
  nav: {
    flex: 1,
    paddingHorizontal: 16,
  },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    marginBottom: 4,
  },
  navItemActive: {
    backgroundColor: '#fff',
  },
  navLabel: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.6)',
    fontWeight: '500',
  },
  navLabelActive: {
    color: '#000',
    fontWeight: '600',
  },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
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
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
  },
  userPlan: {
    fontSize: 9,
    color: 'rgba(255,255,255,0.4)',
    fontWeight: 'bold',
    letterSpacing: 1,
    marginTop: 2,
  },
  logoutButton: {
    padding: 4,
  },
  main: {
    flex: 1,
  },
});
