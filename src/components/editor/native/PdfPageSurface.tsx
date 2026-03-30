import React, { memo } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { FileText } from 'lucide-react-native';
import Pdf from 'react-native-pdf';
import type { PDFDocument } from '../../../types';
import { styles } from './styles';

export const PdfPageSurface = memo(function PdfPageSurface({
  currentDocument,
  shouldRenderPage,
  pageIndex,
  onPdfLoadComplete,
  onPdfError,
}: {
  currentDocument: PDFDocument | null;
  shouldRenderPage: boolean;
  pageIndex: number;
  onPdfLoadComplete: (numberOfPages: number, size?: { width: number; height: number }) => void;
  onPdfError: (error: unknown) => void;
}) {
  if (currentDocument?.fileUrl && shouldRenderPage) {
    return (
      <Pdf
        key={`${currentDocument.id}-${pageIndex}`}
        source={{ uri: currentDocument.fileUrl, cache: true }}
        style={styles.pdfViewer}
        page={pageIndex + 1}
        scale={1}
        minScale={0.7}
        maxScale={2.5}
        fitPolicy={0}
        horizontal={false}
        enablePaging={false}
        scrollEnabled={false}
        trustAllCerts={false}
        onLoadComplete={(numberOfPages, _path, size) => {
          onPdfLoadComplete(numberOfPages, size);
        }}
        onError={onPdfError}
        renderActivityIndicator={() => (
          <View style={styles.pdfPlaceholder}>
            <ActivityIndicator size="large" color="#fff" />
            <Text style={styles.nativeHint}>Loading PDF...</Text>
          </View>
        )}
      />
    );
  }

  if (currentDocument?.fileUrl) {
    return (
      <View style={styles.pagePlaceholder}>
        <FileText size={56} color="rgba(255,255,255,0.08)" />
        <Text style={styles.placeholderText}>PAGE {pageIndex + 1}</Text>
      </View>
    );
  }

  return (
    <View style={styles.pdfPlaceholder}>
      <FileText size={64} color="rgba(255,255,255,0.05)" />
      <Text style={styles.placeholderText}>NO PDF</Text>
      <Text style={styles.nativeHint}>This document does not have a file URL yet.</Text>
    </View>
  );
}, (previous, next) => (
  previous.currentDocument?.id === next.currentDocument?.id &&
  previous.currentDocument?.fileUrl === next.currentDocument?.fileUrl &&
  previous.shouldRenderPage === next.shouldRenderPage &&
  previous.pageIndex === next.pageIndex
));
