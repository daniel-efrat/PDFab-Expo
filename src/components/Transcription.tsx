import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Alert, TextInput, Share } from 'react-native';
import { useStore } from '../store/useStore';
import { ChevronLeft, Zap, FileText, Copy, Download, Sparkles, X } from 'lucide-react-native';
import * as DocumentPicker from 'expo-document-picker';
import { GoogleGenAI } from '@google/genai';
import { PDFDocument as PDFLib, StandardFonts, rgb } from 'pdf-lib';
import { savePdf } from '../lib/savePdf';

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

      const response = await fetch(file.uri);
      const blob = await response.blob();
      const base64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(blob);
      });

      const prompt = "Please transcribe this document accurately. If it's a PDF, extract all text. If it's an image, perform OCR. Return only the transcribed text.";
      
      const result = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: [{
          parts: [
            { text: prompt },
            { inlineData: { data: base64.split(',')[1], mimeType: (file.mimeType as string) || 'application/pdf' } }
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
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => setView('dashboard')} style={styles.backButton}>
          <ChevronLeft size={24} color="#fff" />
        </TouchableOpacity>
        <View>
          <Text style={styles.title}>AI Transcription</Text>
          <Text style={styles.subtitle}>POWERED BY GEMINI AI</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {!transcript ? (
          <View style={styles.uploadSection}>
            <View style={styles.aiBadge}>
              <Sparkles size={14} color="#fff" />
              <Text style={styles.aiBadgeText}>AI POWERED</Text>
            </View>
            <Text style={styles.uploadTitle}>Extract text from any PDF or Image</Text>
            <Text style={styles.uploadSubtitle}>Upload a file and let our AI handle the rest.</Text>

            <TouchableOpacity 
              style={[styles.dropzone, file && styles.dropzoneActive]} 
              onPress={pickFile}
            >
              {file ? (
                <View style={styles.fileInfo}>
                  <FileText size={40} color="#fff" />
                  <Text style={styles.fileName} numberOfLines={1}>{file.name}</Text>
                  <TouchableOpacity onPress={() => setFile(null)} style={styles.removeFile}>
                    <X size={16} color="rgba(255,255,255,0.4)" />
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.emptyDropzone}>
                  <View style={styles.dropzoneIcon}>
                    <Zap size={32} color="rgba(255,255,255,0.2)" />
                  </View>
                  <Text style={styles.dropzoneText}>TAP TO SELECT FILE</Text>
                  <Text style={styles.dropzoneSub}>PDF, JPG, PNG SUPPORTED</Text>
                </View>
              )}
            </TouchableOpacity>

            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            <TouchableOpacity 
              style={[styles.transcribeButton, !file && styles.transcribeButtonDisabled]} 
              onPress={handleTranscribe}
              disabled={!file || transcribing}
            >
              {transcribing ? (
                <ActivityIndicator color="#000" />
              ) : (
                <>
                  <Zap size={20} color="#000" />
                  <Text style={styles.transcribeButtonText}>START TRANSCRIPTION</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.transcriptSection}>
            <View style={styles.transcriptHeader}>
              <Text style={styles.transcriptTitle}>TRANSCRIPTION RESULT</Text>
              <View style={styles.transcriptActions}>
                <TouchableOpacity onPress={copyToClipboard} style={styles.iconAction}>
                  <Copy size={18} color="rgba(255,255,255,0.4)" />
                </TouchableOpacity>
                <TouchableOpacity onPress={exportAsPDF} style={styles.iconAction}>
                  <Download size={18} color="rgba(255,255,255,0.4)" />
                </TouchableOpacity>
              </View>
            </View>
            <View style={styles.transcriptContent}>
              <Text style={styles.transcriptText}>{transcript}</Text>
            </View>
            <TouchableOpacity style={styles.resetButton} onPress={() => setTranscript('')}>
              <Text style={styles.resetButtonText}>NEW TRANSCRIPTION</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
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
    alignItems: 'center',
    paddingHorizontal: 25,
    marginBottom: 30,
    gap: 15,
  },
  backButton: {
    width: 40,
    height: 40,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  subtitle: {
    color: 'rgba(255,255,255,0.4)',
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
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginBottom: 20,
  },
  aiBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  uploadTitle: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 10,
    letterSpacing: -0.5,
  },
  uploadSubtitle: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 40,
  },
  dropzone: {
    width: '100%',
    height: 200,
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.1)',
    borderStyle: 'dashed',
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 30,
  },
  dropzoneActive: {
    borderColor: '#fff',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderStyle: 'solid',
  },
  emptyDropzone: {
    alignItems: 'center',
  },
  dropzoneIcon: {
    width: 64,
    height: 64,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 15,
  },
  dropzoneText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  dropzoneSub: {
    color: 'rgba(255,255,255,0.2)',
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
    height: 60,
    backgroundColor: '#fff',
    borderRadius: 30,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  transcribeButtonDisabled: {
    opacity: 0.5,
  },
  transcribeButtonText: {
    color: '#000',
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
    color: 'rgba(255,255,255,0.4)',
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
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 20,
    padding: 25,
    minHeight: 300,
  },
  transcriptText: {
    color: '#fff',
    fontSize: 16,
    lineHeight: 24,
  },
  resetButton: {
    marginTop: 30,
    alignItems: 'center',
  },
  resetButtonText: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
});
