import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Alert, TextInput, Share, Platform } from 'react-native';
import { useStore } from '../store/useStore';
import { ChevronLeft, Zap, FileText, Copy, Download, Sparkles, X, List, Table as TableIcon } from 'lucide-react-native';
import * as DocumentPicker from 'expo-document-picker';
import { GoogleGenAI } from '@google/genai';
import { uriToBase64 } from '../lib/blob-utils';
import { PDFDocument as PDFLib, StandardFonts, rgb } from 'pdf-lib';
import { savePdf } from '../lib/savePdf';
import { SafeAreaView } from 'react-native-safe-area-context';
import { theme } from '../theme';
import NeumorphicButton from './NeumorphicButton';
import NeumorphicView from './NeumorphicView';
import { db, storage } from '../firebase';
import { ref, getDownloadURL } from 'firebase/storage';
import { doc, setDoc, collection } from 'firebase/firestore';
import { uploadFileToFirebase } from '../lib/firebase-upload';

interface StructuredDocument {
  title: string;
  elements: Array<{
    type: 'h1' | 'h2' | 'h3' | 'p' | 'list' | 'table';
    text?: string;
    items?: string[];
    headers?: string[];
    rows?: string[][];
  }>;
}

interface TranscriptionProps {
  setView: (view: any) => void;
}

export default function Transcription({ setView }: TranscriptionProps) {
  const { user, setCurrentDocument, currentDocument } = useStore();
  const [file, setFile] = useState<any>(null);
  const [transcribing, setTranscribing] = useState(false);
  const [transcribingMessage, setTranscribingMessage] = useState('ANALYZING DOCUMENT...');
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState('');
  const [isUsingStoreFile, setIsUsingStoreFile] = useState(false);
  const [isPicking, setIsPicking] = useState(false);

  React.useEffect(() => {
    if (currentDocument && !file && !transcript) {
      setFile({
        uri: currentDocument.fileUrl,
        name: currentDocument.title,
        mimeType: 'application/pdf',
      });
      setIsUsingStoreFile(true);
    }
  }, [currentDocument]);

  const pickFile = async () => {
    if (isPicking) return;
    setIsPicking(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/*'],
        copyToCacheDirectory: true,
      });

      if (!result.canceled) {
        setFile(result.assets[0]);
        setIsUsingStoreFile(false);
        setTranscript('');
        setError('');
      }
    } catch (err) {
      console.error('Pick file error:', err);
    } finally {
      setIsPicking(false);
    }
  };

  const handleTranscribe = async () => {
    if (!file) return;
    setTranscribing(true);
    setTranscribingMessage('ANALYZING DOCUMENT...');
    setError('');

    const apiKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY;

    if (!apiKey) {
      setError('Gemini API Key is missing.');
      setTranscribing(false);
      return;
    }

    const ai = new GoogleGenAI({ apiKey, apiVersion: 'v1beta' });
    const base64 = await uriToBase64(file.uri);
    const mimeType = (file.mimeType as string) || (file.uri.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg');

    const prompt = `You are a professional document transcriber. 
      Analyze the document and return a STRUCTURED TRANSCRIPTION in JSON format.
      
      JSON Schema:
      {
        "title": "Document Title",
        "elements": [
          { "type": "h1" | "h2" | "h3" | "p" | "list" | "table", "text": "string", "items": ["string"], "headers": ["string"], "rows": [["string"]] }
        ]
      }
      
      Requirements:
      - Preserve the original visual hierarchy.
      - Convert tables into the "table" type with rows and headers.
      - Convert bullet points into the "list" type.
      - Use "h1", "h2", or "h3" for headings.
      - Do not include any text outside the JSON object.`;

    const models = ['gemini-3-flash-preview', 'gemini-2.0-flash'];
    
    for (const modelName of models) {
      const maxRetries = modelName === 'gemini-3-flash-preview' ? 3 : 1;
      
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          if (attempt > 1) {
            setTranscribingMessage(`RETRYING (${attempt-1}/2)...`);
            await new Promise(r => setTimeout(r, 1000 * attempt)); // Exponential backoff
          }

          const result = await ai.models.generateContent({
            model: modelName,
            contents: [{
              parts: [
                { text: prompt },
                { inlineData: { data: base64, mimeType } }
              ]
            }]
          });

          if (result.text) {
            const cleanedText = result.text.replace(/```json|```/g, '').trim();
            setTranscript(cleanedText);
            setTranscribing(false);
            return;
          }
        } catch (err: any) {
          console.error(`Error with model ${modelName} (attempt ${attempt}):`, err);
          if (attempt === maxRetries && modelName === models[models.length - 1]) {
            setError(`Transcription failed after fallback: ${err.message}`);
          }
        }
      }
    }

    setError('Failed to transcribe document after all attempts.');
    setTranscribing(false);
  };

  const copyToClipboard = () => {
    if (!transcript) return;
    Alert.alert('Success', 'Copied to clipboard!');
  };

  const createPDFAndOpen = async () => {
    if (!transcript) return;
    try {
      setTranscribing(true);
      setTranscribingMessage('GENERATING STRUCTURED PDF...');
      
      const docData = JSON.parse(transcript) as StructuredDocument;
      const pdfDoc = await PDFLib.create();
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
      
      let page = pdfDoc.addPage();
      const { width, height } = page.getSize();
      const margin = 50;
      const maxWidth = width - (margin * 2);
      let cursorY = height - margin;

      const checkPageBreak = (neededHeight: number) => {
        if (cursorY - neededHeight < margin) {
          page = pdfDoc.addPage();
          cursorY = height - margin;
          return true;
        }
        return false;
      };

      const drawTextWrapped = (text: string, fontSize: number, isBold = false) => {
        const activeFont = isBold ? boldFont : font;
        const lineHeight = fontSize * 1.4;
        const words = text.split(' ');
        let currentLine = '';

        for (const word of words) {
          const testLine = currentLine ? `${currentLine} ${word}` : word;
          if (activeFont.widthOfTextAtSize(testLine, fontSize) > maxWidth) {
            checkPageBreak(lineHeight);
            page.drawText(currentLine, { x: margin, y: cursorY, size: fontSize, font: activeFont });
            cursorY -= lineHeight;
            currentLine = word;
          } else {
            currentLine = testLine;
          }
        }
        checkPageBreak(lineHeight);
        page.drawText(currentLine, { x: margin, y: cursorY, size: fontSize, font: activeFont });
        cursorY -= lineHeight;
      };

      page.drawText(docData.title.toUpperCase(), { x: margin, y: cursorY, size: 16, font: boldFont });
      cursorY -= 40;

      for (const el of docData.elements) {
        
        switch (el.type) {
          case 'h1': drawTextWrapped(el.text || '', 18, true); cursorY -= 10; break;
          case 'h2': drawTextWrapped(el.text || '', 14, true); cursorY -= 5; break;
          case 'p': drawTextWrapped(el.text || '', 11); cursorY -= 10; break;
          case 'list':
            el.items?.forEach(item => {
              checkPageBreak(15);
              page.drawText('• ' + item, { x: margin, y: cursorY, size: 11, font });
              cursorY -= 18;
            });
            break;
          case 'table':
            cursorY -= 10;
            const colWidth = maxWidth / (el.headers?.length || 1);
            // Draw Headers
            checkPageBreak(25);
            el.headers?.forEach((h, idx) => {
              page.drawText(h, { x: margin + (idx * colWidth), y: cursorY, size: 10, font: boldFont });
            });
            cursorY -= 15;
            // Draw Rows
            el.rows?.forEach(row => {
              checkPageBreak(20);
              row.forEach((cell, idx) => {
                page.drawText(cell, { x: margin + (idx * colWidth), y: cursorY, size: 9, font });
              });
              cursorY -= 15;
            });
            cursorY -= 10;
            break;
        }
      }

      const pdfBytes = await pdfDoc.save();
      const localUri = await savePdf(pdfBytes, `${docData.title}.pdf`);

      // ── Cloud Sync ──────────────────────────────────────────
      let cloudUrl = localUri;
      let storagePath = localUri;
      const docId = `pdf-${Date.now()}`;
      const userId = user?.uid || 'guest';

      if (user) {
        setTranscribingMessage('SYNCING TO CLOUD...');
        storagePath = `documents/${userId}/${docId}.pdf`;
        const storageRef = ref(storage, storagePath);
        
        await uploadFileToFirebase(storageRef, pdfBytes, {
          contentType: 'application/pdf',
        });
        
        cloudUrl = await getDownloadURL(storageRef);

        // Save metadata to Firestore
        await setDoc(doc(db, 'documents', docId), {
          id: docId,
          ownerId: userId,
          title: docData.title,
          fileUrl: cloudUrl,
          fileStoragePath: storagePath,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          isTrashed: false,
          isStarred: false,
          totalPages: pdfDoc.getPageCount(),
          annotations: [],
        });
      }

      setCurrentDocument({
        id: docId,
        ownerId: userId,
        title: docData.title,
        fileUrl: cloudUrl,
        fileStoragePath: storagePath,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        isTrashed: false,
        isStarred: false,
        totalPages: pdfDoc.getPageCount(),
        annotations: [],
      });

      setView('editor');
    } catch (err) {
      Alert.alert('Error', 'Failed to create PDF.');
    } finally {
      setTranscribing(false);
    }
  };

  const renderStructuredPreview = () => {
    try {
      const data = JSON.parse(transcript) as StructuredDocument;
      return (
        <View style={styles.structuredContainer}>
          {data.elements.map((el, i) => {
            switch (el.type) {
              case 'h1': return <Text key={i} style={styles.titleH1}>{el.text}</Text>;
              case 'h2': return <Text key={i} style={styles.titleH2}>{el.text}</Text>;
              case 'h3': return <Text key={i} style={styles.titleH3}>{el.text}</Text>;
              case 'p': return <Text key={i} style={styles.paraP}>{el.text}</Text>;
              case 'list': return (
                <View key={i} style={styles.listContainer}>
                  {el.items?.map((it, idx) => (
                    <View key={idx} style={styles.listItem}>
                      <Text style={styles.bullet}>•</Text>
                      <Text style={styles.itemText}>{it}</Text>
                    </View>
                  ))}
                </View>
              );
              case 'table': return (
                <ScrollView key={i} horizontal style={styles.tableScroll}>
                  <View style={styles.table}>
                    <View style={styles.tableHeader}>
                      {el.headers?.map((h, idx) => <Text key={idx} style={styles.headerCell}>{h}</Text>)}
                    </View>
                    {el.rows?.map((row, idx) => (
                      <View key={idx} style={styles.tableRow}>
                        {row.map((cell, cidx) => <Text key={cidx} style={styles.cell}>{cell}</Text>)}
                      </View>
                    ))}
                  </View>
                </ScrollView>
              );
              default: return null;
            }
          })}
        </View>
      );
    } catch {
      return <Text style={styles.transcriptText}>{transcript}</Text>;
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
            <NeumorphicButton radius={24} layerStyle={[styles.dropzone, file && styles.dropzoneActive]} onPress={pickFile}>
              {file ? (
                <View style={styles.fileInfo}>
                  <FileText size={40} color={theme.colors.accentStrong} />
                  <Text style={styles.fileName} numberOfLines={1}>{file.name}</Text>
                  <TouchableOpacity onPress={() => { setFile(null); setIsUsingStoreFile(false); }} style={styles.removeFile}>
                    <X size={16} color={theme.colors.textSoft} />
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.emptyDropzone}>
                  <NeumorphicView pressed radius={18} layerStyle={styles.dropzoneIcon}>
                    <Zap size={32} color={theme.colors.textMuted} />
                  </NeumorphicView>
                  <Text style={styles.dropzoneText}>TAP TO SELECT FILE</Text>
                </View>
              )}
            </NeumorphicButton>
            {error ? <Text style={styles.errorText}>{error}</Text> : null}
          </View>
        ) : (
          <View style={styles.transcriptSection}>
            <View style={styles.transcriptHeader}>
              <Text style={styles.transcriptTitle}>TRANSCRIPTION RESULT</Text>
              <View style={styles.transcriptActions}>
                <TouchableOpacity onPress={copyToClipboard} style={styles.iconAction}><Copy size={18} color={theme.colors.textMuted} /></TouchableOpacity>
                <TouchableOpacity onPress={createPDFAndOpen} style={styles.iconAction}><Download size={18} color={theme.colors.textMuted} /></TouchableOpacity>
              </View>
            </View>
            <NeumorphicView pressed radius={20} style={styles.transcriptContent}>
              {renderStructuredPreview()}
            </NeumorphicView>
            <View style={styles.resultActions}>
              <NeumorphicButton radius={16} layerStyle={[styles.exportBtn, { backgroundColor: theme.colors.accentStrong }]} onPress={createPDFAndOpen}>
                <Download size={20} color={theme.colors.white} />
                <Text style={styles.exportBtnText}>CREATE PDF</Text>
              </NeumorphicButton>
              <NeumorphicButton radius={14} layerStyle={styles.resetButton} onPress={() => setTranscript('')}>
                <Text style={styles.resetButtonText}>NEW TRANSCRIPTION</Text>
              </NeumorphicButton>
            </View>
          </View>
        )}
      </ScrollView>

      {!transcript && file && (
        <View style={styles.fixedFooter}>
          <NeumorphicButton radius={18} layerStyle={[styles.transcribeButton, { backgroundColor: theme.colors.accentStrong }]} onPress={handleTranscribe} disabled={transcribing}>
            {transcribing ? <ActivityIndicator color={theme.colors.white} /> : <Text style={styles.transcribeButtonText}>START TRANSCRIPTION</Text>}
          </NeumorphicButton>
        </View>
      )}
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
    paddingTop: 20,
    marginBottom: 20,
    gap: 15,
  },
  backButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: '900',
    color: theme.colors.text,
  },
  subtitle: {
    fontSize: 10,
    color: theme.colors.accentStrong,
    fontWeight: 'bold',
    letterSpacing: 2,
  },
  scrollContent: {
    paddingHorizontal: 25,
    paddingBottom: 150,
  },
  uploadSection: {
    alignItems: 'center',
    marginTop: 40,
    width: '100%',
  },
  aiBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: theme.colors.accentSoft,
    borderRadius: 8,
    marginBottom: 15,
  },
  aiBadgeText: {
    color: theme.colors.accentStrong,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1,
  },
  uploadTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: theme.colors.text,
    textAlign: 'center',
    marginBottom: 30,
  },
  dropzone: {
    width: '100%',
    height: 200,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dropzoneActive: {
    borderColor: theme.colors.accentStrong,
    borderWidth: 1,
  },
  emptyDropzone: {
    alignItems: 'center',
    gap: 12,
  },
  dropzoneIcon: {
    padding: 15,
    borderRadius: 20,
    backgroundColor: theme.colors.bg,
  },
  dropzoneText: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  fileInfo: {
    alignItems: 'center',
    gap: 10,
  },
  fileName: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  removeFile: {
    position: 'absolute',
    top: -40,
    right: -40,
    padding: 8,
  },
  errorText: {
    color: theme.colors.danger,
    marginTop: 20,
    textAlign: 'center',
  },
  transcriptSection: {
    width: '100%',
  },
  transcriptHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  transcriptTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: theme.colors.textSoft,
    letterSpacing: 1,
  },
  transcriptActions: {
    flexDirection: 'row',
    gap: 10,
  },
  iconAction: {
    padding: 8,
  },
  transcriptContent: {
    flex: 1,
    padding: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
  },
  structuredContainer: {
    padding: 20,
  },
  titleH1: {
    color: theme.colors.text,
    fontSize: 24,
    fontWeight: '800',
    marginBottom: 16,
    fontFamily: 'PDFabMontserrat',
  },
  titleH2: {
    color: theme.colors.text,
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 12,
    marginTop: 8,
  },
  titleH3: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 8,
  },
  paraP: {
    color: theme.colors.textSoft,
    fontSize: 14,
    lineHeight: 22,
    marginBottom: 16,
  },
  listContainer: {
    marginBottom: 16,
    paddingLeft: 8,
  },
  listItem: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  bullet: {
    color: theme.colors.accentStrong,
    marginRight: 10,
    fontSize: 18,
  },
  itemText: {
    color: theme.colors.textSoft,
    fontSize: 14,
    flex: 1,
  },
  tableScroll: {
    marginBottom: 20,
  },
  table: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 8,
    overflow: 'hidden',
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  headerCell: {
    color: theme.colors.text,
    fontWeight: 'bold',
    fontSize: 12,
    padding: 10,
    minWidth: 100,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  cell: {
    color: theme.colors.textSoft,
    fontSize: 12,
    padding: 10,
    minWidth: 100,
  },
  transcriptText: {
    color: theme.colors.textSoft,
    fontSize: 14,
    lineHeight: 22,
    padding: 20,
  },
  resultActions: {
    marginTop: 25,
    gap: 15,
  },
  exportBtn: {
    width: '100%',
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  exportBtnText: {
    color: theme.colors.white,
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 1,
  },
  resetButton: {
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
  },
  resetButtonText: {
    color: theme.colors.textMuted,
    fontSize: 12,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  fixedFooter: {
    position: 'absolute',
    bottom: 40,
    left: 25,
    right: 25,
  },
  transcribeButton: {
    width: '100%',
    height: 64,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  transcribeButtonText: {
    color: theme.colors.white,
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 1,
  },
});
