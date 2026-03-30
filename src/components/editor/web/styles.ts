import { StyleSheet } from 'react-native';
import { theme } from '../../../theme';

const neuBoxShadow = `6px 6px 12px ${theme.neu.colors.darkShadow}, -6px -6px 12px ${theme.neu.colors.lightShadow}`;
const neuBoxShadowPressed = theme.neu.shadowStyles.lightLayerInset.boxShadow;

export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.bg,
    paddingTop: 60,
  },
  loading: {
    flex: 1,
    backgroundColor: theme.colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    color: theme.colors.textMuted,
    fontSize: 10,
    fontWeight: 'bold',
    letterSpacing: 2,
    marginTop: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 25,
    marginBottom: 20,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 15,
    flex: 1,
  },
  backButton: {
    width: 40, height: 40,
    backgroundColor: theme.colors.surface,
    borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
    // @ts-ignore
    boxShadow: neuBoxShadow,
  },
  title: {
    color: theme.colors.text, fontSize: 16, fontWeight: '700',
    maxWidth: 300,
  },
  subtitle: {
    color: theme.colors.textMuted,
    fontSize: 10, fontWeight: 'bold',
    letterSpacing: 1, marginTop: 2,
  },
  headerActions: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
  },
  actionBtn: {
    width: 40, height: 40,
    backgroundColor: theme.colors.surface,
    borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
    // @ts-ignore
    boxShadow: neuBoxShadow,
  },
  disabledBtn: { opacity: 0.3 },
  saveBtn: {
    width: 40, height: 40,
    backgroundColor: theme.colors.accentStrong,
    borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
    // @ts-ignore
    boxShadow: neuBoxShadow,
  },
  editorArea: {
    flex: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  pdfPage: {
    backgroundColor: '#fff',
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative' as any,
    // @ts-ignore
    boxShadow: `8px 8px 18px ${theme.neu.colors.darkShadow}`,
  },
  toolbar: {
    position: 'absolute',
    bottom: 40, left: 25, right: 25,
    height: 70,
    backgroundColor: theme.colors.surface,
    borderRadius: 35,
    flexDirection: 'row',
    alignItems: 'center', justifyContent: 'space-around',
    paddingHorizontal: 15,
    // @ts-ignore
    boxShadow: `8px 8px 16px ${theme.neu.colors.darkShadow}, -8px -8px 16px ${theme.neu.colors.lightShadow}`,
  },
  toolBtn: {
    width: 48, height: 48, borderRadius: 24,
    alignItems: 'center', justifyContent: 'center',
  },
  activeToolBtn: { backgroundColor: theme.colors.accentStrong },
  toolDivider: {
    width: 1, height: 30,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  exportBtn: {
    width: 48, height: 48,
    backgroundColor: theme.colors.surfaceSoft,
    borderRadius: 24,
    alignItems: 'center', justifyContent: 'center',
  },
  quickAccess: {
    position: 'absolute', right: 25, top: 120, gap: 15,
  },
  quickBtn: {
    width: 50, height: 50,
    backgroundColor: theme.colors.surface,
    borderRadius: 15,
    alignItems: 'center', justifyContent: 'center',
    // @ts-ignore
    boxShadow: neuBoxShadow,
  },
  quickText: {
    color: theme.colors.textMuted,
    fontSize: 8, fontWeight: 'bold', marginTop: 2,
  },
});
