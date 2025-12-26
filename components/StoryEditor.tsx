

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { DriveFile, FileType, TextConfig, RichTextLine, PageMetadata, AppSettings, MemoryBook, CompressionLevel, ChunkData } from '../types';
import { generateCombinedPDF, splitPdfIntoPages, mergeFilesToPdf, createPreviewWithOverlay, getPdfPageCount, DEFAULT_TEXT_CONFIG, DEFAULT_FOOTER_CONFIG, getPdfDocument, renderPdfPageToCanvas, extractHighQualityImage, processFileForCache, generatePageThumbnail } from '../services/pdfService';
import { uploadToDrive, saveProjectState } from '../services/driveService';
import FamilySearchExport from './FamilySearchExport';
import AppLogo from './AppLogo';

const stringToColor = (str: string) => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  let color = '#';
  for (let i = 0; i < 3; i++) {
    const value = (hash >> (i * 8)) & 0xFF;
    color += ('00' + value.toString(16)).substr(-2);
  }
  return color;
};

// Distinct visual colors for chunks
const CHUNK_THEMES = [
    { border: 'border-indigo-500', bg: 'bg-indigo-500', text: 'text-indigo-700', lightBg: 'bg-indigo-50' },
    { border: 'border-emerald-500', bg: 'bg-emerald-500', text: 'text-emerald-700', lightBg: 'bg-emerald-50' },
    { border: 'border-amber-500', bg: 'bg-amber-500', text: 'text-amber-700', lightBg: 'bg-amber-50' },
    { border: 'border-rose-500', bg: 'bg-rose-500', text: 'text-rose-700', lightBg: 'bg-rose-50' },
    { border: 'border-cyan-500', bg: 'bg-cyan-500', text: 'text-cyan-700', lightBg: 'bg-cyan-50' }
];

export interface ExportedFile {
    id: string;
    name: string;
    type: 'png' | 'pdf';
    timestamp: Date;
    driveId?: string; // ID on Drive if available
}

// --- MISSING COMPONENTS DEFINITIONS ---

const Tile = ({ id, item, index, isSelected, onClick, onEdit, onSplit, onRemove, onDragStart, onDragOver, chunkInfo }: any) => {
  const isHeader = item.type === FileType.HEADER;
  
  return (
    <div 
      id={id}
      draggable 
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onClick={onClick}
      className={`relative group aspect-[210/297] rounded-sm shadow-sm transition-all bg-white border cursor-pointer overflow-hidden
        ${isSelected ? 'ring-2 ring-indigo-500 z-10' : 'hover:shadow-md hover:scale-[1.02]'}
        ${chunkInfo ? 'border-l-4 ' + chunkInfo.colorClass.replace('bg-', 'border-') : 'border-slate-200'}
        ${isHeader ? 'bg-slate-800' : ''}
      `}
    >
        {isHeader ? (
             <div className="w-full h-full flex flex-col items-center justify-center p-4 text-center">
                 <h3 className="text-white font-serif font-bold text-lg leading-tight">{item.headerText}</h3>
                 <span className="text-slate-400 text-[10px] uppercase tracking-widest mt-2">Nytt kapitel</span>
             </div>
        ) : (
             <>
                 <div className="w-full h-2/3 bg-slate-100 overflow-hidden relative">
                     {item.thumbnail || item.blobUrl ? (
                         <img src={item.thumbnail || item.blobUrl} className="w-full h-full object-cover" alt={item.name} />
                     ) : (
                         <div className="w-full h-full flex items-center justify-center text-slate-300">
                             <i className={`fas ${item.type === FileType.PDF ? 'fa-file-pdf' : 'fa-file-image'} text-4xl`}></i>
                         </div>
                     )}
                     {chunkInfo && (
                         <div className={`absolute top-0 right-0 px-2 py-1 text-[9px] font-bold text-white ${chunkInfo.colorClass}`}>
                             Del {chunkInfo.chunkIndex}
                         </div>
                     )}
                 </div>
                 <div className="p-3 h-1/3 bg-white flex flex-col justify-between">
                     <div>
                         <h4 className="text-xs font-bold text-slate-800 line-clamp-2 leading-tight">{item.name}</h4>
                         {item.description && <p className="text-[10px] text-slate-500 mt-1 line-clamp-2 italic">{item.description}</p>}
                     </div>
                     <div className="flex justify-between items-center mt-2">
                        <span className="text-[9px] text-slate-400 font-mono">{item.size > 0 ? (item.size/1024/1024).toFixed(1) + ' MB' : ''}</span>
                        <div className="flex space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={(e) => { e.stopPropagation(); onEdit(); }} className="w-6 h-6 rounded-full bg-slate-100 hover:bg-indigo-100 text-slate-500 hover:text-indigo-600 flex items-center justify-center"><i className="fas fa-pen text-[10px]"></i></button>
                            {item.type === FileType.PDF && onSplit && (
                                <button onClick={(e) => { e.stopPropagation(); onSplit(); }} className="w-6 h-6 rounded-full bg-slate-100 hover:bg-indigo-100 text-slate-500 hover:text-indigo-600 flex items-center justify-center" title="Dela upp sidor"><i className="fas fa-cut text-[10px]"></i></button>
                            )}
                        </div>
                     </div>
                 </div>
             </>
        )}
        
        {isSelected && (
            <div className="absolute top-2 left-2 w-6 h-6 bg-indigo-600 rounded-full flex items-center justify-center shadow-lg text-white">
                <i className="fas fa-check text-xs"></i>
            </div>
        )}
    </div>
  );
};

const ListViewItem = ({ item, index, isSelected, onClick, onEdit, chunkInfo, onDragStart, onDragOver }: any) => {
    return (
        <div 
            draggable
            onDragStart={onDragStart}
            onDragOver={onDragOver}
            onClick={onClick}
            className={`flex items-center p-3 rounded-lg border bg-white cursor-pointer transition-all hover:shadow-sm
                ${isSelected ? 'ring-2 ring-indigo-500 border-transparent z-10' : 'border-slate-200'}
                ${chunkInfo ? 'border-l-4 ' + chunkInfo.colorClass.replace('bg-', 'border-') : ''}
            `}
        >
            <div className="w-10 h-10 rounded bg-slate-100 shrink-0 overflow-hidden mr-4 flex items-center justify-center">
                 {item.type === FileType.HEADER ? (
                     <i className="fas fa-heading text-slate-400"></i>
                 ) : (item.thumbnail || item.blobUrl) ? (
                     <img src={item.thumbnail || item.blobUrl} className="w-full h-full object-cover" alt={item.name} />
                 ) : (
                     <i className={`fas ${item.type === FileType.PDF ? 'fa-file-pdf' : 'fa-image'} text-slate-400`}></i>
                 )}
            </div>
            <div className="flex-1 min-w-0 mr-4">
                <h4 className="text-sm font-bold text-slate-800 truncate">{item.type === FileType.HEADER ? item.headerText : item.name}</h4>
                {item.description && <p className="text-xs text-slate-500 truncate">{item.description}</p>}
            </div>
            {chunkInfo && (
                 <span className={`text-[10px] font-black text-white px-2 py-1 rounded mr-4 ${chunkInfo.colorClass}`}>Del {chunkInfo.chunkIndex}</span>
            )}
             <span className="text-xs text-slate-400 font-mono mr-4">{item.size > 0 ? (item.size/1024/1024).toFixed(2) + ' MB' : ''}</span>
            <button onClick={(e) => { e.stopPropagation(); onEdit(); }} className="p-2 text-slate-300 hover:text-indigo-600"><i className="fas fa-pen"></i></button>
        </div>
    );
};

const EditModal = ({ item, accessToken, onClose, onUpdate, settings, driveFolderId, onExportSuccess }: any) => {
    const [name, setName] = useState(item.name || '');
    const [desc, setDesc] = useState(item.description || '');
    const [headerText, setHeaderText] = useState(item.headerText || '');
    const [isSaving, setIsSaving] = useState(false);

    const handleSave = () => {
        onUpdate({ name, description: desc, headerText });
        onClose();
    };
    
    const handleManualExport = async () => {
        if (!driveFolderId) return alert("Spara boken först.");
        setIsSaving(true);
        try {
            // Logic to process, compress and upload single file
            const { buffer } = await processFileForCache(item, accessToken, settings.compressionLevel);
            const blob = new Blob([buffer], { type: item.type === FileType.PDF ? 'application/pdf' : 'image/jpeg' });
            const ext = item.type === FileType.PDF ? 'pdf' : 'png';
            const filename = `${name}.${ext}`;
            await uploadToDrive(accessToken, driveFolderId, filename, blob, item.type === FileType.PDF ? 'application/pdf' : 'image/jpeg');
            if (onExportSuccess) onExportSuccess(filename, ext);
            alert("Fil sparad på Drive!");
        } catch(e) {
            console.error(e);
            alert("Kunde inte exportera.");
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[70] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in" onClick={e => e.stopPropagation()}>
                <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                    <h3 className="text-lg font-bold text-slate-900">Redigera</h3>
                    <button onClick={onClose}><i className="fas fa-times text-slate-400"></i></button>
                </div>
                <div className="p-6 space-y-4">
                    {item.type === FileType.HEADER ? (
                         <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1">Rubrik</label>
                            <input value={headerText} onChange={e => setHeaderText(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg font-bold" />
                         </div>
                    ) : (
                        <>
                            <div>
                                <label className="block text-xs font-bold text-slate-700 mb-1">Filnamn</label>
                                <input value={name} onChange={e => setName(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg" />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-700 mb-1">Beskrivning / Bildtext</label>
                                <textarea value={desc} onChange={e => setDesc(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg h-24 resize-none" />
                            </div>
                        </>
                    )}
                </div>
                <div className="p-4 bg-slate-50 flex justify-between items-center">
                     {item.type !== FileType.HEADER && (
                         <button onClick={handleManualExport} disabled={isSaving} className="text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-2">
                             {isSaving ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-cloud-upload-alt"></i>}
                             Spara separat till Drive
                         </button>
                     )}
                     <div className="flex space-x-2 ml-auto">
                        <button onClick={onClose} className="px-4 py-2 text-slate-600 font-bold hover:bg-slate-200 rounded-lg">Avbryt</button>
                        <button onClick={handleSave} className="px-4 py-2 bg-slate-900 text-white font-bold rounded-lg hover:bg-indigo-600">Spara</button>
                     </div>
                </div>
            </div>
        </div>
    );
};

interface StoryEditorProps {
  currentBook: MemoryBook; 
  items: DriveFile[];
  onUpdateItems: (items: DriveFile[] | ((prevItems: DriveFile[]) => DriveFile[])) => void;
  accessToken: string;
  bookTitle: string;
  onUpdateBookTitle: (t: string) => void;
  showShareView: boolean;
  onCloseShareView: () => void;
  onOpenSourceSelector: (index: number | null) => void;
  settings: AppSettings;
  onUpdateSettings: (s: AppSettings) => void;
}

const StoryEditor: React.FC<StoryEditorProps> = ({ 
  currentBook,
  items, 
  onUpdateItems, 
  accessToken, 
  bookTitle, 
  onUpdateBookTitle,
  showShareView,
  onCloseShareView,
  onOpenSourceSelector,
  settings,
  onUpdateSettings
}) => {
  const [editingItem, setEditingItem] = useState<DriveFile | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [lastSelectedId, setLastSelectedId] = useState<string | null>(null);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [activeChunkFilter, setActiveChunkFilter] = useState<number | null>(null);
  const [autoSaveStatus, setAutoSaveStatus] = useState<string>('Sparat');
  
  // Layout & Settings UI State
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [isSidebarCompact, setIsSidebarCompact] = useState(false);
  const [showSidebarOverlay, setShowSidebarOverlay] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [showStatusLog, setShowStatusLog] = useState(false);
  const [statusLog, setStatusLog] = useState<string[]>([]);
  const rightColumnRef = useRef<HTMLDivElement>(null);

  // Manual Exports State
  const [exportedFiles, setExportedFiles] = useState<ExportedFile[]>([]);

  const addLog = (msg: string) => {
      setStatusLog(prev => [msg, ...prev].slice(0, 20)); // Keep last 20 messages
  };

  const handleManualExportSuccess = (filename: string, type: 'png' | 'pdf') => {
      const newFile: ExportedFile = {
          id: `export-${Date.now()}`,
          name: filename,
          type: type,
          timestamp: new Date()
      };
      setExportedFiles(prev => [newFile, ...prev]);
  };

  // --- OPTIMIZATION STATE ---
  // Calculate a hash of current state to check against persisted state
  const generateHash = () => {
      const parts = items.map(i => `${i.id}-${i.modifiedTime}-${i.processedSize || 'u'}`);
      return parts.join('|') + `_${settings.maxChunkSizeMB}_${settings.compressionLevel}_${settings.safetyMarginPercent}`;
  };
  const currentItemsHash = useMemo(generateHash, [items, settings]);

  // Init state with saved chunks if hash matches. 
  // Trust the 'optimizationCursor' stored in the book if it exists.
  const [chunks, setChunks] = useState<ChunkData[]>(currentBook.chunks || []);
  const [optimizationCursor, setOptimizationCursor] = useState(
      (currentBook.optimizationHash === currentItemsHash && currentBook.optimizationCursor !== undefined) 
      ? currentBook.optimizationCursor 
      : (currentBook.chunks?.length && currentBook.optimizationHash === currentItemsHash) ? items.length : 0
  );
  
  const [optimizingStatus, setOptimizingStatus] = useState<string>('');
  
  // Use a ref to track chunks for autosave to avoid closure staleness in timeout
  const chunksRef = useRef(chunks);
  const cursorRef = useRef(optimizationCursor);

  useEffect(() => { chunksRef.current = chunks; }, [chunks]);
  useEffect(() => { cursorRef.current = optimizationCursor; }, [optimizationCursor]);

  useEffect(() => {
      if (optimizingStatus) addLog(optimizingStatus);
  }, [optimizingStatus]);

  // --- AUTO SAVE TO DRIVE ---
  useEffect(() => {
    if (!currentBook.driveFolderId) return;
    
    setAutoSaveStatus('Sparar...');
    const handler = setTimeout(async () => {
        try {
            // Include chunks and optimizationHash in the saved book
            const bookToSave = { 
                ...currentBook, 
                items, 
                title: bookTitle, 
                settings,
                chunks: chunksRef.current, // Use ref for latest state
                optimizationCursor: cursorRef.current, // Save exact cursor
                optimizationHash: currentItemsHash 
            };
            await saveProjectState(accessToken, bookToSave);
            setAutoSaveStatus('Sparat på Drive');
        } catch (e) {
            console.error("Auto-save failed", e);
            setAutoSaveStatus('Kunde inte spara');
        }
    }, 2000); 

    return () => clearTimeout(handler);
  }, [items, bookTitle, currentBook.driveFolderId, settings, currentItemsHash]);


  // --- GREEDY OPTIMIZATION WITH PRECISE VERIFICATION ---
  useEffect(() => {
    const isClean = currentBook.optimizationHash === currentItemsHash;
    const hasChunks = currentBook.chunks && currentBook.chunks.length > 0;
    
    // Resume logic:
    // If state is clean and we are at the end, stop.
    if (isClean && optimizationCursor >= items.length && hasChunks) {
         return;
    }

    // New start logic:
    if (optimizationCursor === 0 && chunks.length > 0 && !isClean) {
        setChunks([]); // Reset chunks if hash mismatch (settings changed)
        addLog("Startar ny beräkning...");
    }

    let isCancelled = false;
    const safetyFactor = (100 - (settings.safetyMarginPercent || 0)) / 100;
    const limitBytes = settings.maxChunkSizeMB * 1024 * 1024 * safetyFactor;
    
    const VERIFY_THRESHOLD_BYTES = limitBytes * 0.9; 
    const EST_PDF_OVERHEAD_BASE = 15000; 
    const EST_OVERHEAD_PER_PAGE = 3000; 

    const processNextStep = async () => {
        if (isCancelled) return;
        if (optimizationCursor >= items.length) {
            setOptimizingStatus('');
            return;
        }

        // Determine Chunk ID
        const currentChunkId = chunks.length + 1;
        let currentBatch: DriveFile[] = [];
        let estimatedAccumulator = EST_PDF_OVERHEAD_BASE;
        let nextCursor = optimizationCursor;
        let finalBatchSizeBytes = 0;
        let chunkIsFull = false;

        while (nextCursor < items.length) {
             const item = items[nextCursor];
             setOptimizingStatus(`Del ${currentChunkId}: Analyserar ${item.name}...`);
             let itemSize = item.processedSize;
             
             // Check if we have size in metadata (saved in project.json) or need to process
             let needsProcessing = (!item.processedSize) || item.compressionLevelUsed !== settings.compressionLevel;

             if (needsProcessing) {
                 try {
                     const { buffer, size } = await processFileForCache(item, accessToken, settings.compressionLevel);
                     if (isCancelled) return;
                     itemSize = size;
                     // Critical: Update item state with size so next reload is fast
                     onUpdateItems(prev => prev.map(p => p.id === item.id ? { ...p, processedBuffer: buffer, processedSize: size, compressionLevelUsed: settings.compressionLevel } : p));
                 } catch (e) { 
                     console.error("Processing failed", item.name); 
                     itemSize = item.size; 
                 }
             }
             
             currentBatch.push(item);
             estimatedAccumulator += (itemSize || 0) + EST_OVERHEAD_PER_PAGE;
             
             if (estimatedAccumulator < VERIFY_THRESHOLD_BYTES) {
                 nextCursor++; 
                 // Allow UI tick
                 await new Promise(r => setTimeout(r, 0)); 
                 continue;
             }

             setOptimizingStatus(`Del ${currentChunkId}: Kontrollerar FamilySearch storleksgräns...`);
             
             try {
                 const pdfBytes = await generateCombinedPDF(accessToken, currentBatch, "temp", settings.compressionLevel);
                 const realSize = pdfBytes.byteLength;
                 
                 if (realSize < limitBytes) {
                     finalBatchSizeBytes = realSize; nextCursor++;
                 } else {
                     currentBatch.pop(); 
                     if (currentBatch.length === 0) { currentBatch.push(item); finalBatchSizeBytes = realSize; nextCursor++; }
                     chunkIsFull = true; break;
                 }
             } catch (e) { chunkIsFull = true; break; }
        }
        
        if (!chunkIsFull && currentBatch.length > 0 && finalBatchSizeBytes === 0) {
             try { const pdfBytes = await generateCombinedPDF(accessToken, currentBatch, "temp", settings.compressionLevel); finalBatchSizeBytes = pdfBytes.byteLength; } catch (e) {}
        }

        if (!isCancelled && currentBatch.length > 0) {
            const newChunk = { id: currentChunkId, items: currentBatch, sizeBytes: finalBatchSizeBytes || estimatedAccumulator, isOptimized: true, isUploading: false, isSynced: false, title: `${bookTitle} (Del ${currentChunkId})` };
            setChunks(prev => [...prev, newChunk]);
            setOptimizationCursor(nextCursor); 
            addLog(`Del ${currentChunkId} klar: ${currentBatch.length} objekt, ${(newChunk.sizeBytes / 1024 / 1024).toFixed(1)}MB`);
            setOptimizingStatus('');
        }
    };
    
    // Small delay to allow render before locking thread
    const timer = setTimeout(processNextStep, 200);
    return () => { isCancelled = true; clearTimeout(timer); };
  }, [currentItemsHash, optimizationCursor, chunks.length]);

  // --- UPLOAD / SYNC LOGIC (Simple Linear Sync) ---
  useEffect(() => {
      if (!currentBook.driveFolderId) return;
      const sync = async () => {
          const chunkToSync = chunks.find(c => c.isOptimized && !c.isSynced && !c.isUploading);
          if (!chunkToSync) return;
          setChunks(prev => prev.map(c => c.id === chunkToSync.id ? { ...c, isUploading: true } : c));
          addLog(`Laddar upp Del ${chunkToSync.id} till Drive...`);
          try {
              const pdfBytes = await generateCombinedPDF(accessToken, chunkToSync.items, chunkToSync.title, settings.compressionLevel);
              const blob = new Blob([new Uint8Array(pdfBytes)], { type: 'application/pdf' });
              await uploadToDrive(accessToken, currentBook.driveFolderId!, `${chunkToSync.title}.pdf`, blob);
              setChunks(prev => prev.map(c => c.id === chunkToSync.id ? { ...c, isUploading: false, isSynced: true } : c));
              addLog(`Del ${chunkToSync.id} sparad på Drive!`);
          } catch (e) {
              addLog(`Fel vid sparande av Del ${chunkToSync.id}`);
              setChunks(prev => prev.map(c => c.id === chunkToSync.id ? { ...c, isUploading: false } : c));
          }
      };
      const t = setTimeout(sync, 2000); return () => clearTimeout(t);
  }, [chunks, currentBook.driveFolderId, accessToken]);


  // --- RESPONSIVE SIDEBAR LOGIC ---
  useEffect(() => {
      const handleResize = () => {
          const shouldBeCompact = window.innerWidth < 1280;
          setIsSidebarCompact(shouldBeCompact);
          if (!shouldBeCompact) setShowSidebarOverlay(false);
      };
      handleResize();
      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
  }, []);

  const toggleOverlay = () => {
      if (isSidebarCompact) {
          setShowSidebarOverlay(!showSidebarOverlay);
      }
  };

  const getChunkForItem = (itemId: string) => chunks.find(c => c.items.some(i => i.id === itemId));

  // --- HANDLERS (Drag, Select, Split, Merge, Update) ---
  const handleDragStart = (e: React.DragEvent, index: number) => { setDraggedIndex(index); e.dataTransfer.effectAllowed = "move"; };
  const handleDragOver = (e: React.DragEvent, index: number) => { e.preventDefault(); if (draggedIndex === null || draggedIndex === index) return; const newItems = [...items]; const item = newItems[draggedIndex]; newItems.splice(draggedIndex, 1); newItems.splice(index, 0, item); onUpdateItems(newItems); setDraggedIndex(index); };
  const handleSelection = (e: React.MouseEvent, item: DriveFile, index: number) => { e.stopPropagation(); const newSelection = new Set(selectedIds); if (e.shiftKey && lastSelectedId) { const lastIndex = items.findIndex(i => i.id === lastSelectedId); const start = Math.min(lastIndex, index); const end = Math.max(lastIndex, index); if (!e.metaKey && !e.ctrlKey) newSelection.clear(); for (let i = start; i <= end; i++) { newSelection.add(items[i].id); } } else if (e.metaKey || e.ctrlKey) { if (newSelection.has(item.id)) newSelection.delete(item.id); else { newSelection.add(item.id); setLastSelectedId(item.id); } } else { if (!newSelection.has(item.id) || newSelection.size > 1) { newSelection.clear(); newSelection.add(item.id); setLastSelectedId(item.id); } else { setEditingItem(item); } } setSelectedIds(newSelection); };
  const handleSplitPdf = async (file: DriveFile, index: number) => { if (!confirm("Detta kommer dela upp PDF-filen i lösa sidor. Vill du fortsätta?")) return; setIsProcessing(true); try { const { buffer } = await processFileForCache(file, accessToken, 'medium'); const blob = new Blob([buffer as any], { type: 'application/pdf' }); const pages = await splitPdfIntoPages(blob, file.name); const newItems = [...items]; newItems.splice(index, 1, ...pages); onUpdateItems(newItems); setSelectedIds(new Set()); } catch (e) { console.error(e); alert("Kunde inte dela upp filen."); } finally { setIsProcessing(false); } };
  const handleMergeItems = async () => { if (selectedIds.size < 2) return; if (!confirm(`Vill du slå ihop ${selectedIds.size} filer?`)) return; setIsProcessing(true); try { const itemsToMerge = items.filter(i => selectedIds.has(i.id)); const firstIndex = items.findIndex(i => i.id === itemsToMerge[0].id); const mergedBlob = await mergeFilesToPdf(itemsToMerge, accessToken, settings.compressionLevel); const mergedUrl = URL.createObjectURL(mergedBlob); const count = await getPdfPageCount(mergedBlob); const thumbUrl = await generatePageThumbnail(mergedBlob, 0); const newItem: DriveFile = { id: `merged-${Date.now()}`, name: itemsToMerge[0].name + " (Samlad)", type: FileType.PDF, size: mergedBlob.size, modifiedTime: new Date().toISOString(), blobUrl: mergedUrl, isLocal: true, pageCount: count, pageMeta: {}, thumbnail: thumbUrl }; const newItems = [...items]; const remainingItems = newItems.filter(i => !selectedIds.has(i.id)); remainingItems.splice(firstIndex, 0, newItem); onUpdateItems(remainingItems); setSelectedIds(new Set([newItem.id])); setLastSelectedId(newItem.id); } catch (e) { alert("Kunde inte slå ihop filerna."); } finally { setIsProcessing(false); } };
  const handleUpdateItem = (updates: Partial<DriveFile>) => { if (!editingItem) return; const updated = { ...editingItem, ...updates }; setEditingItem(updated); onUpdateItems(items.map(i => i.id === updated.id ? updated : i)); };
  const handleInsertAfterSelection = () => { const indexes = items.map((item, idx) => selectedIds.has(item.id) ? idx : -1).filter(i => i !== -1); const maxIndex = Math.max(...indexes); if (maxIndex !== -1) onOpenSourceSelector(maxIndex + 1); };

  const filteredItems = activeChunkFilter !== null ? (chunks.find(c => c.id === activeChunkFilter)?.items || []) : items;

  if (showShareView) {
      return (
          <FamilySearchExport 
            items={items} // Pass generic items (mostly ignored by new export logic)
            chunks={chunks} // PASS THE STABLE CHUNKS
            isOptimizationComplete={optimizationCursor >= items.length}
            driveFolderId={currentBook.driveFolderId}
            bookTitle={bookTitle} 
            accessToken={accessToken} 
            onBack={onCloseShareView} 
            settings={settings} 
            onUpdateItems={onUpdateItems} 
            exportedFiles={exportedFiles} 
          />
      );
  }

  // --- RENDER HELPERS FOR RIGHT COLUMN ---
  const renderFilesList = (isCompact: boolean) => (
      <>
        <div className={`bg-slate-50 border-b border-slate-100 relative ${isCompact ? 'flex justify-center p-4' : 'p-6'}`}>
             {!isCompact ? (
                 <div className="space-y-4">
                    <div>
                        <h2 className="text-xl font-serif font-bold text-slate-900 leading-tight">Filer till FamilySearch</h2>
                        {/* EXPANDABLE SETTINGS PANEL */}
                        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden shadow-sm mt-3">
                            <div 
                                className="p-3 flex items-center justify-between cursor-pointer hover:bg-slate-50 transition-colors bg-white"
                                onClick={() => setIsSettingsOpen(!isSettingsOpen)}
                            >
                                <h3 className="text-[10px] font-bold text-indigo-700 uppercase tracking-widest flex items-center gap-2">
                                    <i className="fas fa-info-circle"></i>
                                    Så här fungerar exporten
                                </h3>
                                <i className={`fas fa-chevron-down text-slate-400 text-xs transition-transform duration-200 ${isSettingsOpen ? 'rotate-180' : ''}`}></i>
                            </div>
                            
                            {isSettingsOpen && (
                                <div className="p-3 pt-0 border-t border-slate-50 space-y-4 bg-slate-50/50 animate-in slide-in-from-top-2">
                                    <div className="bg-indigo-50/50 p-2 rounded border border-indigo-100 text-[10px] text-slate-600 leading-relaxed">
                                        FamilySearch har en gräns på 15 MB per fil för "Minnen". Appen analyserar och delar automatiskt upp din bok i flera delar (PDF-filer) så att de garanterat går att ladda upp. Du kan justera bildkvaliteten nedan för att få plats med fler sidor per fil.
                                    </div>
                                    <div>
                                        <label className="text-[9px] font-bold text-slate-500 block mb-1">Mapp på Drive</label>
                                        <div className="text-[10px] bg-white p-2 rounded border border-slate-200 flex items-center shadow-sm" title={`Min Enhet / Dela din historia / ${bookTitle}`}>
                                            <i className="fab fa-google-drive mr-2 text-slate-500 shrink-0"></i>
                                            <div className="truncate font-mono text-slate-600">
                                                <span className="opacity-50">.../</span>{bookTitle}
                                            </div>
                                        </div>
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-bold text-slate-700 flex justify-between">
                                            <span>Brytpunkt för uppdelning (MB):</span>
                                            <span className="text-slate-400">{settings.maxChunkSizeMB} MB</span>
                                        </label>
                                        <input 
                                            type="range" min="5" max="50" step="0.5" 
                                            value={settings.maxChunkSizeMB} 
                                            onChange={(e) => onUpdateSettings({...settings, maxChunkSizeMB: parseFloat(e.target.value)})} 
                                            className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600 mt-2"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-bold text-slate-700 flex justify-between">
                                            <span>Marginal vid tillägg (%):</span>
                                            <span className="text-slate-400">{settings.safetyMarginPercent || 0}%</span>
                                        </label>
                                        <div className="text-[9px] text-slate-400 italic mb-1">
                                            Lägre marginal = fler sidor per fil, men risk för omräkning vid små ändringar.
                                        </div>
                                        <input 
                                            type="range" min="0" max="20" step="1" 
                                            value={settings.safetyMarginPercent || 0} 
                                            onChange={(e) => onUpdateSettings({...settings, safetyMarginPercent: parseInt(e.target.value)})} 
                                            className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600 mt-2"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-bold text-slate-700 block mb-2">Bildkvalitet på dokument</label>
                                        <div className="flex bg-slate-200 p-1 rounded-lg">
                                            {(['low', 'medium', 'high'] as CompressionLevel[]).map(level => {
                                                const map = {
                                                    'low': { label: 'Hög', tooltip: 'Låg komprimering (Större filer)' },
                                                    'medium': { label: 'Medel', tooltip: 'Balanserad' },
                                                    'high': { label: 'Låg', tooltip: 'Hög komprimering (Mindre filer)' }
                                                };
                                                const isActive = settings.compressionLevel === level;
                                                return (
                                                    <button key={level} title={map[level].tooltip} onClick={() => onUpdateSettings({...settings, compressionLevel: level})} className={`flex-1 py-1.5 text-[9px] font-bold rounded-md transition-all ${isActive ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>{map[level].label}</button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Status Line */}
                        <div className="flex justify-between items-center mt-3 relative">
                            <div className="flex items-center space-x-1 cursor-pointer hover:bg-slate-200 rounded px-1 -ml-1 transition-colors" onClick={() => setShowStatusLog(!showStatusLog)}>
                                <p className="text-[10px] text-slate-600 font-bold">
                                    {optimizingStatus ? <span className="text-amber-600 animate-pulse"><i className="fas fa-circle-notch fa-spin mr-1"></i> {optimizingStatus}</span> : 'Redo för export'}
                                </p>
                                <i className={`fas fa-chevron-${showStatusLog ? 'up' : 'down'} text-[8px] text-slate-400`}></i>
                            </div>
                            {autoSaveStatus && <span className={`text-[10px] font-bold ${autoSaveStatus === 'Kunde inte spara' ? 'text-red-500' : 'text-emerald-600'}`}>{autoSaveStatus}</span>}
                            {showStatusLog && (
                                <div className="absolute top-6 left-0 right-0 bg-slate-800 text-slate-300 p-3 rounded-lg shadow-xl z-50 text-[9px] font-mono max-h-40 overflow-y-auto border border-slate-700">
                                    {statusLog.length === 0 && <p className="italic opacity-50">Loggen är tom...</p>}
                                    {statusLog.map((log, i) => (<div key={i} className="border-b border-slate-700/50 pb-1 mb-1 last:mb-0 last:pb-0 last:border-0">{log}</div>))}
                                </div>
                            )}
                        </div>
                    </div>
                 </div>
             ) : (
                 <button onClick={toggleOverlay} className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center hover:bg-slate-300 transition-colors">
                     <i className="fas fa-bars text-slate-600"></i>
                 </button>
             )}
        </div>
        
        {/* CHUNK METER LIST */}
        <div className={`flex-1 overflow-y-auto bg-slate-50/50 custom-scrollbar ${isCompact ? 'px-1' : 'p-4 space-y-3'}`}>
             {chunks.map((chunk, idx) => {
                 const theme = CHUNK_THEMES[idx % CHUNK_THEMES.length];
                 const isGreen = chunk.isSynced;
                 const isUploading = chunk.isUploading;
                 const sizeMB = (chunk.sizeBytes / (1024 * 1024));
                 const safetyFactor = (100 - (settings.safetyMarginPercent || 0)) / 100;
                 const effectiveMaxMB = settings.maxChunkSizeMB * safetyFactor;
                 const percentFilled = Math.min(100, (sizeMB / effectiveMaxMB) * 100);

                 if (isCompact) {
                     return (
                         <div key={chunk.id} onClick={toggleOverlay} className={`w-10 h-10 mx-auto my-2 rounded-full flex items-center justify-center text-xs font-bold shadow-sm cursor-pointer hover:scale-110 transition-transform text-white ${isGreen ? theme.bg : isUploading ? 'bg-indigo-500 animate-pulse' : theme.bg}`} title={chunk.title}>{chunk.id}</div>
                     );
                 }

                 return (
                     <div key={chunk.id} onClick={() => setActiveChunkFilter(activeChunkFilter === chunk.id ? null : chunk.id)} className={`group bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden cursor-pointer transition-all hover:shadow-md ${activeChunkFilter === chunk.id ? 'ring-2 ring-indigo-500 ring-offset-1' : ''}`}>
                         <div className="p-4">
                             <div className="flex justify-between items-center mb-3">
                                 <div className="flex items-center space-x-3"><span className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-black text-white ${theme.bg}`}>{chunk.id}</span><div><h3 className="text-sm font-bold text-slate-800">Del {chunk.id}</h3><p className="text-[10px] text-slate-400 font-medium">{chunk.items.length} objekt</p></div></div>
                                 <div className="text-right">
                                     {isGreen ? (<span className="text-[9px] font-black text-emerald-600 bg-emerald-50 px-2 py-1 rounded-md uppercase tracking-wider flex items-center gap-1 border border-emerald-100"><i className="fas fa-check-circle"></i> SPARAD PÅ DRIVE</span>) : isUploading ? (<span className="text-[9px] font-black text-indigo-600 bg-indigo-50 px-2 py-1 rounded-md uppercase tracking-wider animate-pulse flex items-center gap-1"><i className="fas fa-sync fa-spin"></i> SPARAR...</span>) : (<span className="text-[9px] font-bold text-slate-400 bg-slate-100 px-2 py-1 rounded-md uppercase tracking-wider">Redo</span>)}
                                 </div>
                             </div>
                             <div className="relative w-full h-3 bg-slate-100 rounded-full overflow-hidden mb-2"><div className={`absolute top-0 left-0 h-full transition-all duration-1000 ${theme.bg}`} style={{ width: `${percentFilled}%` }}></div>{settings.safetyMarginPercent > 0 && (<div className="absolute top-0 bottom-0 right-0 bg-red-100/50 border-l border-red-200" style={{ width: `${settings.safetyMarginPercent}%` }} title="Säkerhetsmarginal"></div>)}</div>
                             <div className="flex justify-between text-[10px] font-bold text-slate-500"><span>{sizeMB.toFixed(1)} MB</span><span>{settings.maxChunkSizeMB} MB Max</span></div>
                         </div>
                     </div>
                 );
             })}
             {exportedFiles.length > 0 && !isCompact && (
                 <div className="mt-4">
                     <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 pl-1">Manuellt sparade filer</h4>
                     <div className="space-y-2">
                         {exportedFiles.map(file => (<div key={file.id} className="bg-white rounded-lg border border-slate-200 p-3 flex items-center justify-between shadow-sm"><div className="flex items-center space-x-3"><div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center text-sm font-bold border border-emerald-100"><i className="fas fa-image"></i></div><div className="min-w-0"><h5 className="text-xs font-bold text-slate-800 truncate max-w-[150px]">{file.name}</h5><p className="text-[9px] text-slate-400">Sparad {file.timestamp.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</p></div></div><span className="text-[9px] font-black text-emerald-600 bg-emerald-50 px-2 py-1 rounded-md uppercase tracking-wider border border-emerald-100">Klar</span></div>))}
                     </div>
                 </div>
             )}
             {optimizingStatus && (
                 <div className="p-4 bg-white rounded-xl border border-slate-200 border-dashed animate-pulse opacity-70">
                     <div className="flex items-center space-x-3"><div className="w-8 h-8 bg-slate-200 rounded-lg"></div><div className="flex-1 space-y-2"><div className="h-3 bg-slate-200 rounded w-1/2"></div><div className="h-2 bg-slate-200 rounded w-3/4"></div></div></div>
                 </div>
             )}
        </div>
        
        <div className={`p-4 bg-white border-t border-slate-100 ${isCompact ? 'flex justify-center' : ''}`}>
             {!isCompact ? (
                 <button onClick={() => (window as any).triggerShare?.()} className="w-full text-left bg-white border border-slate-200 hover:border-indigo-300 hover:shadow-lg rounded-[1.5rem] p-4 transition-all group">
                    <div className="flex items-center space-x-4"><div className="shrink-0 group-hover:scale-105 transition-transform"><AppLogo variant="phase3" className="w-16 h-16" /></div><div><h2 className="text-xl font-serif font-bold text-slate-900 group-hover:text-indigo-700 transition-colors">Dela oändligt</h2><p className="text-[10px] text-slate-500 font-medium mt-1 uppercase tracking-wider">Tryck för att dela</p></div><div className="ml-auto text-slate-300 group-hover:text-indigo-500 group-hover:translate-x-1 transition-all"><i className="fas fa-chevron-right text-lg"></i></div></div>
                 </button>
             ) : (
                 <button onClick={() => (window as any).triggerShare?.()} className="w-10 h-10 bg-indigo-50 hover:bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 transition-colors"><i className="fas fa-share-nodes"></i></button>
             )}
        </div>
      </>
  );

  return (
    <>
      <div className="flex flex-col lg:flex-row h-auto min-h-full lg:h-full bg-[#f0f2f5] lg:overflow-hidden" onClick={() => { setSelectedIds(new Set()); if (isSidebarCompact && showSidebarOverlay) setShowSidebarOverlay(false); }}>
         {isProcessing && (<div className="fixed inset-0 z-[60] bg-white/80 backdrop-blur-sm flex items-center justify-center"><div className="flex flex-col items-center"><i className="fas fa-circle-notch fa-spin text-4xl text-indigo-600 mb-4"></i><p className="font-bold text-slate-700">Bearbetar...</p></div></div>)}
         
         <div className="w-full lg:flex-1 lg:overflow-y-auto lg:scroll-smooth relative lg:border-r border-slate-200 min-w-0">
             <div className="p-4 md:p-8 pb-32">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
                    <div className="flex items-center space-x-4 max-w-full md:max-w-[70%]">
                        <div className="shrink-0"><AppLogo variant="phase2" className="w-16 h-16 md:w-20 md:h-20" /></div>
                        <div><h2 className="text-2xl font-serif font-bold text-slate-900 leading-tight break-words whitespace-normal">Berätta kortfattat</h2><p className="text-sm text-slate-500 font-medium mt-1">Klicka och skriv</p></div>
                    </div>
                    <div className="flex items-center bg-slate-200 rounded-lg p-1 shrink-0"><button onClick={(e) => { e.stopPropagation(); setViewMode('grid'); }} className={`p-2 rounded-md transition-all ${viewMode === 'grid' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`} title="Rutnät"><i className="fas fa-th-large"></i></button><button onClick={(e) => { e.stopPropagation(); setViewMode('list'); }} className={`p-2 rounded-md transition-all ${viewMode === 'list' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`} title="Lista"><i className="fas fa-list"></i></button></div>
                </div>

                {activeChunkFilter !== null && (<div className="mb-6 flex items-center justify-between bg-indigo-50 px-4 py-2 rounded-lg border border-indigo-100"><span className="text-sm font-bold text-indigo-700">Visar filer för Del {activeChunkFilter}</span><button onClick={(e) => { e.stopPropagation(); setActiveChunkFilter(null); }} className="text-xs bg-white hover:bg-indigo-100 px-3 py-1 rounded shadow-sm font-bold text-indigo-600 transition-colors">Visa alla</button></div>)}

                {selectedIds.size > 0 && (<div className="sticky top-4 z-40 bg-slate-900 text-white px-6 py-3 rounded-xl shadow-2xl flex items-center justify-between animate-in slide-in-from-top-4 mb-6 mx-auto max-w-lg"><span className="font-bold text-sm">{selectedIds.size} valda</span><div className="flex space-x-4"><button onClick={(e) => { e.stopPropagation(); handleInsertAfterSelection(); }} className="hover:text-emerald-400 font-bold text-xs flex items-center space-x-1"><i className="fas fa-plus-circle"></i> <span>Lägg till</span></button>{selectedIds.size > 1 && <button onClick={(e) => { e.stopPropagation(); handleMergeItems(); }} className="hover:text-indigo-300 font-bold text-xs flex items-center space-x-1"><i className="fas fa-object-group"></i> <span>Slå ihop</span></button>}<button onClick={(e) => { e.stopPropagation(); onUpdateItems(items.filter(i => !selectedIds.has(i.id))); setSelectedIds(new Set()); }} className="hover:text-red-400 font-bold text-xs flex items-center space-x-1"><i className="fas fa-trash"></i> <span>Ta bort</span></button></div></div>)}

                {viewMode === 'grid' && (
                    <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 select-none">
                        <button onClick={(e) => { e.stopPropagation(); onOpenSourceSelector(null); }} className="aspect-[210/297] rounded-sm border-2 border-dashed border-slate-300 flex flex-col items-center justify-center text-slate-400 hover:text-indigo-600 hover:border-indigo-300 hover:bg-indigo-50/20 transition-all group bg-white shadow-sm"><div className="mb-2 transform group-hover:scale-110 transition-transform"><AppLogo variant="phase1" className="w-12 h-12" /></div><div className="w-8 h-8 rounded-full bg-slate-100 group-hover:bg-white group-hover:shadow-md flex items-center justify-center mb-2 transition-all"><i className="fas fa-plus text-lg"></i></div><span className="text-sm font-bold uppercase tracking-wider text-center px-2">Lägg till<br/>minne</span></button>
                        {filteredItems.map((item, index) => {
                            const originalIndex = items.findIndex(i => i.id === item.id);
                            const chunk = getChunkForItem(item.id);
                            const chunkInfo = chunk ? { chunkIndex: chunk.id, colorClass: CHUNK_THEMES[(chunk.id - 1) % CHUNK_THEMES.length].bg } : undefined;
                            return (<Tile key={item.id} id={`tile-${item.id}`} item={item} index={originalIndex} isSelected={selectedIds.has(item.id)} onClick={(e: React.MouseEvent) => handleSelection(e, item, originalIndex)} onEdit={() => setEditingItem(item)} onSplit={() => handleSplitPdf(item, originalIndex)} onRemove={() => onUpdateItems(items.filter(i => i.id !== item.id))} onDragStart={(e: any) => handleDragStart(e, originalIndex)} onDragOver={(e: any) => handleDragOver(e, originalIndex)} chunkInfo={chunkInfo} />);
                        })}
                    </div>
                )}

                {viewMode === 'list' && (
                    <div className="flex flex-col space-y-2 select-none">
                         <button onClick={(e) => { e.stopPropagation(); onOpenSourceSelector(null); }} className="w-full p-4 border-2 border-dashed border-slate-300 rounded-lg flex items-center justify-center text-slate-400 hover:text-indigo-600 hover:border-indigo-300 hover:bg-indigo-50/20 transition-all font-bold text-sm mb-4"><i className="fas fa-plus mr-2"></i> Lägg till minne</button>
                        {filteredItems.map((item, index) => {
                            const originalIndex = items.findIndex(i => i.id === item.id);
                            const chunk = getChunkForItem(item.id);
                            const chunkInfo = chunk ? { chunkIndex: chunk.id, colorClass: CHUNK_THEMES[(chunk.id - 1) % CHUNK_THEMES.length].bg } : undefined;
                            return (<ListViewItem key={item.id} item={item} index={originalIndex} isSelected={selectedIds.has(item.id)} onClick={(e: React.MouseEvent) => handleSelection(e, item, originalIndex)} onEdit={() => setEditingItem(item)} chunkInfo={chunkInfo} onDragStart={(e: any) => handleDragStart(e, originalIndex)} onDragOver={(e: any) => handleDragOver(e, originalIndex)} />);
                        })}
                    </div>
                )}
             </div>
         </div>

         <div ref={rightColumnRef} onClick={(e) => e.stopPropagation()} className={`bg-white lg:border-l border-t lg:border-t-0 border-slate-200 shadow-xl z-20 flex flex-col shrink-0 transition-all duration-300 relative ${isSidebarCompact ? 'lg:w-16' : 'lg:w-80'} w-full lg:h-full h-auto`}>
             {renderFilesList(isSidebarCompact)}
             {isSidebarCompact && showSidebarOverlay && (<div className="hidden lg:flex absolute top-0 right-full w-80 h-full bg-white border-r border-slate-200 shadow-2xl z-30 flex-col animate-in slide-in-from-right-4"><div className="flex justify-end p-2 border-b border-slate-100"><button onClick={() => setShowSidebarOverlay(false)} className="text-slate-400 hover:text-slate-600 p-2"><i className="fas fa-times"></i></button></div>{renderFilesList(false)}</div>)}
         </div>
      </div>

      {editingItem && (
        <EditModal 
          key={editingItem.id} item={editingItem} accessToken={accessToken} onClose={() => setEditingItem(null)} onUpdate={handleUpdateItem} settings={settings} driveFolderId={currentBook.driveFolderId} onExportSuccess={handleManualExportSuccess} 
        />
      )}
    </>
  );
};

export default StoryEditor;