import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Alert, TextInput, Share } from 'react-native';
import { useStore } from '../store/useStore';
import { ChevronLeft, Zap, FileText, Copy, Download, Sparkles, X } from 'lucide-react-native';
import * as DocumentPicker from 'expo-document-picker';
import { GoogleGenAI } from '@google/genai';
import { uriToBase64 } from '../lib/blob-utils';
import { PDFDocument as PDFLib, StandardFonts, rgb } from 'pdf-lib';
import { savePdf } from '../lib/savePdf';
import { SafeAreaView } from 'react-native-safe-area-context';
import { theme } from '../theme';
import NeumorphicButton from './NeumorphicButton';
import NeumorphicView from './NeumorphicView';

interface TranscriptionProps {
  setView: (view: any) => void;
}

export default function Transcription({ setView }: TranscriptionProps) {
  const { user } = useStore();
  const [file, setFile] = useState<any>(null);
  const [transcribing, setTranscribing] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState('');

  const pickFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/*'],
        copyToCacheDirectory: true,
      });

      if (!result.canceled) {
        setFile(result.assets[0]);
        setTranscript('');
        setError('');
      }
    } catch (err) {
      console.error('Pick file error:', err);
    }
  };

  const handleTranscribe = async () => {
    if (!file) return;
    setTranscribing(true);
    setError('');
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

      const base64 = await uriToBase64(file.uri);

      const prompt = "Please transcribe this document accurately. If it's a PDF, extract all text. If it's an image, perform OCR. Return only the transcribed text.";
      
      const result = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: [{
          parts: [
            { text: prompt },
            { inlineData: { data: base64, mimeType: (file.mimeType as string) || 'application/pdf' } }
          ]
        }]
      });

      setTranscript(result.text || '');
    } catch (err: any) {
      console.error('Transcription error:', err);
      setError('Failed to transcribe document. Please try again.');
    } finally {
      setTranscribing(false);
    }
  };

  const copyToClipboard = async () => {
    await Share.share({ message: transcript });
  };

  const exportAsPDF = async () => {
    try {
      const pdfDoc = await PDFLib.create();
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const page = pdfDoc.addPage();
      const { width, height } = page.getSize();
      
      page.drawText(transcript, {
        x: 50,
        y: height - 50,
        size: 12,
        font,
        color: rgb(0, 0, 0),
        maxWidth: width - 100,
      });

      const pdfBytes = await pdfDoc.save();
      await savePdf(pdfBytes, `transcript-${Date.now()}.pdf`);
    } catch (err) {
      console.error('Export error:', err);
      Alert.alert('Error', 'Failed to export transcript as PDF.');
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <NeumorphicButton radius={12} layerStyle={styles.backButton} onPress={() => setView('dashboard')}>
          <ChevronLeft size={24} color={theme.colors.text} />
        </NeumorphicButton>
        <View>
          <Text style={styles.title}>AI Transcription</Text>
          <Text style={styles.subtitle}>POWERED BY GEMINI AI</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {!transcript ? (
          <View style={styles.uploadSection}>
            <NeumorphicView radius={12} style={styles.aiBadge}>
              <Sparkles size={14} color={theme.colors.accentStrong} />
              <Text style={styles.aiBadgeText}>AI POWERED</Text>
            </NeumorphicView>
            <Text style={styles.uploadTitle}>Extract text from any PDF or Image</Text>
            <Text style={styles.uploadSubtitle}>Upload a file and let our AI handle the rest.</Text>

            <NeumorphicButton 
              radius={24}
              layerStyle={[styles.dropzone, file && styles.dropzoneActive]} 
              onPress={pickFile}
            >
              {file ? (
                <View style={styles.fileInfo}>
                  <FileText size={40} color={theme.colors.text} />
                  <Text style={styles.fileName} numberOfLines={1}>{file.name}</Text>
                  <TouchableOpacity onPress={() => setFile(null)} style={styles.removeFile}>
                    <X size={16} color={theme.colors.textSoft} />
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.emptyDropzone}>
                  <NeumorphicView pressed radius={18} layerStyle={styles.dropzoneIcon}>
                    <Zap size={32} color={theme.colors.textMuted} />
                  </NeumorphicView>
                  <Text style={styles.dropzoneText}>TAP TO SELECT FILE</Text>
                  <Text style={styles.dropzoneSub}>PDF, JPG, PNG SUPPORTED</Text>
                </View>
              )}
            </NeumorphicButton>

            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            <NeumorphicButton 
              radius={30}
              layerStyle={[styles.transcribeButton, !file && styles.transcribeButtonDisabled, file && { backgroundColor: theme.colors.accentStrong }]} 
              onPress={handleTranscribe}
              disabled={!file || transcribing}
            >
              {transcribing ? (
                <ActivityIndicator color={theme.colors.white} />
              ) : (
                <>
                  <Zap size={20} color={theme.colors.white} />
                  <Text style={styles.transcribeButtonText}>START TRANSCRIPTION</Text>
                </>
              )}
            </NeumorphicButton>
          </View>
        ) : (
          <View style={styles.transcriptSection}>
            <View style={styles.transcriptHeader}>
              <Text style={styles.transcriptTitle}>TRANSCRIPTION RESULT</Text>
              <View style={styles.transcriptActions}>
                <TouchableOpacity onPress={copyToClipboard} style={styles.iconAction}>
                  <Copy size={18} color={theme.colors.textMuted} />
                </TouchableOpacity>
                <TouchableOpacity onPress={exportAsPDF} style={styles.iconAction}>
                  <Download size={18} color={theme.colors.textMuted} />
                </TouchableOpacity>
              </View>
            </View>
            <NeumorphicView pressed radius={20} style={styles.transcriptContent}>
              <Text style={styles.transcriptText}>{transcript}</Text>
            </NeumorphicView>
            <NeumorphicButton radius={14} layerStyle={styles.resetButton} onPress={() => setTranscript('')}>
              <Text style={styles.resetButtonText}>NEW TRANSCRIPTION</Text>
            </NeumorphicButton>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 25,
    marginBottom: 30,
    gap: 15,
  },
  backButton: {
    width: 40,
    height: 40,
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  title: {
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: 'bold',
  },
  subtitle: {
    color: theme.colors.textSoft,
    fontSize: 10,
    fontWeight: 'bold',
    letterSpacing: 1,
    marginTop: 2,
  },
  scrollContent: {
    paddingHorizontal: 25,
    paddingBottom: 40,
  },
  uploadSection: {
    alignItems: 'center',
    marginTop: 20,
  },
  aiBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginBottom: 20,
  },
  aiBadgeText: {
    color: theme.colors.text,
    fontSize: 10,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  uploadTitle: {
    color: theme.colors.text,
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 10,
    letterSpacing: -0.5,
  },
  uploadSubtitle: {
    color: theme.colors.textMuted,
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 40,
  },
  dropzone: {
    width: '100%',
    height: 200,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 30,
  },
  dropzoneActive: {
  },
  emptyDropzone: {
    alignItems: 'center',
  },
  dropzoneIcon: {
    width: 64,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 15,
  },
  dropzoneText: {
    color: theme.colors.text,
    fontSize: 12,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  dropzoneSub: {
    color: theme.colors.textSoft,
    fontSize: 10,
    marginTop: 5,
  },
  fileInfo: {
    alignItems: 'center',
    width: '80%',
  },
  fileName: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
    marginTop: 15,
    textAlign: 'center',
  },
  removeFile: {
    position: 'absolute',
    top: -40,
    right: -40,
    padding: 10,
  },
  errorText: {
    color: '#f87171',
    fontSize: 12,
    marginBottom: 20,
  },
  transcribeButton: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingVertical: 18,
  },
  transcribeButtonDisabled: {
    opacity: 0.5,
  },
  transcribeButtonText: {
    color: theme.colors.white,
    fontSize: 14,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  transcriptSection: {
    marginTop: 10,
  },
  transcriptHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  transcriptTitle: {
    color: theme.colors.textMuted,
    fontSize: 10,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  transcriptActions: {
    flexDirection: 'row',
    gap: 15,
  },
  iconAction: {
    padding: 5,
  },
  transcriptContent: {
    padding: 25,
    minHeight: 300,
  },
  transcriptText: {
    color: theme.colors.text,
    fontSize: 16,
    lineHeight: 24,
  },
  resetButton: {
    marginTop: 30,
    alignItems: 'center',
    paddingVertical: 15,
  },
  resetButtonText: {
    color: theme.colors.textMuted,
    fontSize: 12,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
});
