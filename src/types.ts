export type EditorTool = 'SELECT' | 'TEXT' | 'HIGHLIGHT' | 'DRAW' | 'SIGNATURE' | 'COMMENT';

export interface Annotation {
  id: string;
  type: 'TEXT' | 'HIGHLIGHT' | 'DRAW' | 'SIGNATURE' | 'COMMENT';
  pageIndex: number;
  data: Record<string, any>;
}

export interface CommentReply {
  id: string;
  body: string;
  createdAt: string;
  authorId: string;
  authorName: string;
}

export interface Comment {
  id: string;
  documentId: string;
  pageIndex: number;
  position: { x: number; y: number };
  content: string;
  authorId: string;
  authorName: string;
  authorAvatarUrl?: string;
  isResolved: boolean;
  replies: CommentReply[];
  createdAt: string;
  updatedAt: string;
}

export interface PDFDocument {
  id: string;
  ownerId: string;
  title: string;
  fileStoragePath: string;
  fileUrl?: string;
  createdAt: string;
  updatedAt: string;
  isTrashed: boolean;
  isStarred: boolean;
  totalPages: number;
  annotations: Annotation[];
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string;
  createdAt: string;
  updatedAt: string;
  plan: 'free' | 'pro';
}

export interface SignatureSlot {
  type: 'signature' | 'initials';
  data: string;
  imageUrl?: string;
  imageStoragePath?: string;
  updatedAt: string;
}

export type TranscribedElement =
  | { type: 'h1' | 'h2' | 'h3'; text: string }
  | { type: 'p'; text: string }
  | { type: 'list'; items: string[] }
  | { type: 'table'; headers: string[]; rows: string[][] };

export interface StructuredDocument {
  title: string;
  elements: TranscribedElement[];
}
