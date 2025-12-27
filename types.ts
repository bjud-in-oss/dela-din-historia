
export enum FileType {
  IMAGE = 'IMAGE',
  PDF = 'PDF',
  TEXT = 'TEXT',
  FOLDER = 'FOLDER',
  HEADER = 'HEADER',
  GOOGLE_DOC = 'GOOGLE_DOC',
  AUDIO = 'AUDIO'
}

export interface TextConfig {
  fontSize: number;
  alignment: 'left' | 'center' | 'right';
  isBold: boolean;
  isItalic: boolean;
  verticalPosition: 'top' | 'center' | 'bottom';
  color?: string; // Hex color for text
  backgroundColor?: string; // Hex color for background box
  backgroundOpacity?: number; // 0.0 to 1.0
  padding?: number; // Padding around text in the box
  boxHeight?: number; // Specific height for footer area (only relevant for footer)
}

export interface RichTextLine {
  id: string;
  text: string;
  config: TextConfig;
}

export interface PageMetadata {
  headerLines: RichTextLine[];
  footerLines: RichTextLine[];
  hideObject?: boolean;
}

export type CompressionLevel = 'low' | 'medium' | 'high';

export interface DriveFile {
  id: string;
  name: string;
  type: FileType;
  size: number;
  thumbnail?: string;
  parentId?: string;
  modifiedTime: string;
  
  // Legacy fields
  description?: string; 
  headerText?: string;
  textConfig?: TextConfig;
  hideObject?: boolean;

  // Metadata
  pageMeta?: Record<number, PageMetadata>; 
  pageCount?: number;
  
  // Local data
  isLocal?: boolean;
  fileObj?: File; 
  blobUrl?: string; 
  transcript?: string; 
  sortOrder?: number;

  // Unified Process Caching
  processedBuffer?: ArrayBuffer; // Den färdigkomprimerade datan
  processedSize?: number;        // Den exakta storleken efter komprimering
  compressionLevelUsed?: CompressionLevel; // Vilken nivå som användes för cachen
}

export interface AppSettings {
  compressionLevel: CompressionLevel;
  maxChunkSizeMB: number;
  safetyMarginPercent: number;
}

export interface ChunkData {
    id: number;
    items: DriveFile[];
    sizeBytes: number;
    isOptimized: boolean; 
    isUploading: boolean;
    isSynced: boolean;
    title: string;
}

export interface MemoryBook {
  id: string;
  title: string;
  createdAt: string;
  items: DriveFile[];
  coverImageId?: string;
  driveFolderId?: string; // ID till mappen i Google Drive där boken bor
  settings?: AppSettings; // Bok-specifika inställningar
  chunks?: ChunkData[]; // Persisted chunks
  optimizationCursor?: number; // Index where optimization stopped
  optimizationHash?: string; // Hash to verify chunks validity
}

export interface ExportedFile {
    id: string;
    name: string;
    type: 'png' | 'pdf';
    timestamp: Date;
    driveId?: string; 
}
