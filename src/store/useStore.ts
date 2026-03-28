import { create } from 'zustand';
import { Annotation, EditorTool, PDFDocument, UserProfile } from '../types';

interface HistoryState {
  annotations: Annotation[];
}

interface AppState {
  // Auth
  user: UserProfile | null;
  setUser: (user: UserProfile | null) => void;

  // Document
  currentDocument: PDFDocument | null;
  setCurrentDocument: (doc: PDFDocument | null) => void;
  
  // Editor UI
  activeTool: EditorTool;
  setActiveTool: (tool: EditorTool) => void;
  zoom: number;
  setZoom: (zoom: number) => void;
  currentPage: number;
  setCurrentPage: (page: number) => void;
  isSaving: boolean;
  setIsSaving: (isSaving: boolean) => void;
  hasUnsavedChanges: boolean;
  setHasUnsavedChanges: (has: boolean) => void;

  // Annotations & History
  annotations: Annotation[];
  setAnnotations: (annotations: Annotation[]) => void;
  addAnnotation: (annotation: Annotation) => void;
  updateAnnotation: (id: string, data: Partial<Annotation>) => void;
  removeAnnotation: (id: string) => void;
  
  history: HistoryState[];
  historyIndex: number;
  pushHistory: () => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;

  // Settings
  penColor: string;
  setPenColor: (color: string) => void;
  penWidth: number;
  setPenWidth: (width: number) => void;
  fontFamily: string;
  setFontFamily: (family: string) => void;
  fontSize: number;
  setFontSize: (size: number) => void;

  // Selection
  selectedAnnotationId: string | null;
  setSelectedAnnotation: (id: string | null) => void;
}

export const useStore = create<AppState>((set, get) => ({
  user: null,
  setUser: (user) => set({ user }),

  currentDocument: null,
  setCurrentDocument: (doc) => set({ currentDocument: doc, annotations: doc?.annotations || [] }),

  activeTool: 'SELECT',
  setActiveTool: (tool) => set({ activeTool: tool }),
  zoom: 1.0,
  setZoom: (zoom) => set({ zoom }),
  currentPage: 0,
  setCurrentPage: (page) => set({ currentPage: page }),
  isSaving: false,
  setIsSaving: (isSaving) => set({ isSaving }),
  hasUnsavedChanges: false,
  setHasUnsavedChanges: (has) => set({ hasUnsavedChanges: has }),

  annotations: [],
  setAnnotations: (annotations) => set({ annotations, hasUnsavedChanges: true }),
  addAnnotation: (annotation) => {
    const { annotations } = get();
    get().pushHistory();
    set({ annotations: [...annotations, annotation], hasUnsavedChanges: true });
  },
  updateAnnotation: (id, data) => {
    const { annotations } = get();
    get().pushHistory();
    set({
      annotations: annotations.map((a) => (a.id === id ? { ...a, ...data } : a)),
      hasUnsavedChanges: true,
    });
  },
  removeAnnotation: (id) => {
    const { annotations } = get();
    get().pushHistory();
    set({
      annotations: annotations.filter((a) => a.id !== id),
      hasUnsavedChanges: true,
    });
  },

  history: [],
  historyIndex: -1,
  canUndo: false,
  canRedo: false,
  pushHistory: () => {
    const { annotations, history, historyIndex } = get();
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push({ annotations: JSON.parse(JSON.stringify(annotations)) });
    if (newHistory.length > 50) newHistory.shift();
    set({ 
      history: newHistory, 
      historyIndex: newHistory.length - 1,
      canUndo: newHistory.length > 1,
      canRedo: false
    });
  },
  undo: () => {
    const { history, historyIndex } = get();
    if (historyIndex > 0) {
      const prev = history[historyIndex - 1];
      set({
        annotations: JSON.parse(JSON.stringify(prev.annotations)),
        historyIndex: historyIndex - 1,
        canUndo: historyIndex - 1 > 0,
        canRedo: true,
        hasUnsavedChanges: true,
      });
    }
  },
  redo: () => {
    const { history, historyIndex } = get();
    if (historyIndex < history.length - 1) {
      const next = history[historyIndex + 1];
      set({
        annotations: JSON.parse(JSON.stringify(next.annotations)),
        historyIndex: historyIndex + 1,
        canUndo: true,
        canRedo: historyIndex + 1 < history.length - 1,
        hasUnsavedChanges: true,
      });
    }
  },

  penColor: '#000000',
  setPenColor: (color) => set({ penColor: color }),
  penWidth: 2,
  setPenWidth: (width) => set({ penWidth: width }),
  fontFamily: 'Inter',
  setFontFamily: (family) => set({ fontFamily: family }),
  fontSize: 16,
  setFontSize: (size) => set({ fontSize: size }),

  selectedAnnotationId: null,
  setSelectedAnnotation: (id) => set({ selectedAnnotationId: id }),
}));
