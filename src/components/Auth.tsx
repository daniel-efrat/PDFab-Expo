import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator, Image } from 'react-native';
// @ts-ignore
import logoSrc from '../../public/logo.svg';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signInWithPopup } from 'firebase/auth';
import { auth, googleProvider } from '../firebase';
import { Mail, Lock, LogIn, UserPlus } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { theme } from '../theme';
import NeumorphicView from './NeumorphicView';
import NeumorphicButton from './NeumorphicButton';

export default function Auth() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleAuth = async () => {
    if (!email || !password) {
      setError('Please fill in all fields');
      return;
    }
    setError('');
    setLoading(true);
    try {
      if (isLogin) {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        await createUserWithEmailAndPassword(auth, email, password);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    try {
      if (Platform.OS === 'web') {
        await signInWithPopup(auth, googleProvider);
      } else {
        setError('Google Sign-In on mobile requires native configuration. Please use Email/Password sign-in for now or use the web version.');
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.container}
      >
        <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <NeumorphicView radius={24} style={styles.logoWrapper}>
            <Image source={Platform.OS === 'web' ? { uri: '/logo.svg' } : logoSrc} style={styles.logo} resizeMode="contain" />
          </NeumorphicView>
          <Text style={styles.title}>PDFab</Text>
          <Text style={styles.subtitle}>THE ULTIMATE PDF WORKSPACE</Text>
        </View>

        <NeumorphicView radius={28} style={styles.form}>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Email Address</Text>
            <NeumorphicView pressed radius={16} layerStyle={styles.inputWrapper}>
              <Mail size={20} color={theme.colors.textSoft} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="name@example.com"
                placeholderTextColor={theme.colors.textSoft}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </NeumorphicView>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Password</Text>
            <NeumorphicView pressed radius={16} layerStyle={styles.inputWrapper}>
              <Lock size={20} color={theme.colors.textSoft} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="••••••••"
                placeholderTextColor={theme.colors.textSoft}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
              />
            </NeumorphicView>
          </View>

          {error ? (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <NeumorphicButton
            radius={16}
            layerStyle={[styles.button, { backgroundColor: theme.colors.accentStrong }]}
            onPress={handleAuth}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color={theme.colors.white} />
            ) : (
              <>
                {isLogin ? <LogIn size={20} color={theme.colors.white} /> : <UserPlus size={20} color={theme.colors.white} />}
                <Text style={styles.buttonText}>{isLogin ? 'SIGN IN' : 'CREATE ACCOUNT'}</Text>
              </>
            )}
          </NeumorphicButton>

          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>OR CONTINUE WITH</Text>
            <View style={styles.dividerLine} />
          </View>

          <NeumorphicButton radius={16} layerStyle={styles.googleButton} onPress={handleGoogle}>
            <Text style={styles.googleButtonText}>GOOGLE</Text>
          </NeumorphicButton>

          <TouchableOpacity 
            style={styles.switchButton} 
            onPress={() => setIsLogin(!isLogin)}
          >
            <Text style={styles.switchText}>
              {isLogin ? "Don't have an account? " : "Already have an account? "}
              <Text style={styles.switchTextBold}>{isLogin ? 'Sign up' : 'Sign in'}</Text>
            </Text>
          </TouchableOpacity>
        </NeumorphicView>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.bg,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 30,
  },
  header: {
    alignItems: 'center',
    marginBottom: 42,
  },
  logoWrapper: {
    padding: 12,
    marginBottom: 20,
  },
  logo: {
    width: 48,
    height: 48,
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    color: theme.colors.text,
    letterSpacing: -1,
    fontFamily: 'PDFabMontserrat',
  },
  subtitle: {
    fontSize: 11,
    color: theme.colors.accentStrong,
    fontWeight: '800',
    letterSpacing: 1.8,
    marginTop: 7,
  },
  form: {
    gap: 20,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
  },
  inputGroup: {
    gap: 8,
  },
  label: {
    fontSize: 10,
    color: theme.colors.textMuted,
    fontWeight: 'bold',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginLeft: 4,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 15,
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    height: 56,
    color: theme.colors.text,
    fontSize: 16,
  },
  errorContainer: {
    backgroundColor: theme.colors.dangerSoft,
    borderWidth: 1,
    borderColor: theme.colors.danger,
    padding: 12,
    borderRadius: 14,
  },
  errorText: {
    color: '#ffd1cb',
    fontSize: 12,
    textAlign: 'center',
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 18,
  },
  buttonText: {
    color: theme.colors.white,
    fontSize: 16,
    fontWeight: '800',
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 20,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  dividerText: {
    color: theme.colors.textSoft,
    fontSize: 10,
    fontWeight: 'bold',
    marginHorizontal: 15,
    letterSpacing: 1,
  },
  googleButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
  },
  googleButtonText: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  switchButton: {
    alignItems: 'center',
    marginTop: 10,
  },
  switchText: {
    color: theme.colors.textMuted,
    fontSize: 14,
  },
  switchTextBold: {
    color: theme.colors.accentStrong,
    fontWeight: 'bold',
  },
});
