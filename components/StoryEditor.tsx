
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { DriveFile, FileType, TextConfig, RichTextLine, PageMetadata, AppSettings, MemoryBook, CompressionLevel } from '../types';
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

interface ChunkData {
    id: number;
    items: DriveFile[];
    sizeBytes: number;
    isOptimized: boolean; 
    isUploading: boolean;
    isSynced: boolean;
    title: string;
}

interface ExportedFile {
    id: string;
    name: string;
    type: 'png' | 'pdf';
    timestamp: Date;
}

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

  // --- AUTO SAVE TO DRIVE ---
  useEffect(() => {
    if (!currentBook.driveFolderId) return;
    
    setAutoSaveStatus('Sparar...');
    const handler = setTimeout(async () => {
        try {
            const bookToSave = { ...currentBook, items, title: bookTitle, settings };
            await saveProjectState(accessToken, bookToSave);
            setAutoSaveStatus('Sparat på Drive');
        } catch (e) {
            console.error("Auto-save failed", e);
            setAutoSaveStatus('Kunde inte spara');
        }
    }, 2000); 

    return () => clearTimeout(handler);
  }, [items, bookTitle, currentBook.driveFolderId, settings]);


  // --- OPTIMIZATION STATE ---
  const [chunks, setChunks] = useState<ChunkData[]>([]);
  const [optimizationCursor, setOptimizationCursor] = useState(0); 
  const [optimizingStatus, setOptimizingStatus] = useState<string>('');

  useEffect(() => {
      if (optimizingStatus) addLog(optimizingStatus);
  }, [optimizingStatus]);

  const itemsHash = items.map(i => i.id + i.modifiedTime).join('|');
  useEffect(() => {
      setOptimizationCursor(0);
      setChunks([]);
      addLog("Startar ny beräkning...");
  }, [itemsHash, settings.maxChunkSizeMB, settings.compressionLevel]);

  // --- GREEDY OPTIMIZATION WITH PRECISE VERIFICATION ---
  useEffect(() => {
    let isCancelled = false;
    const limitBytes = settings.maxChunkSizeMB * 1024 * 1024;
    const VERIFY_THRESHOLD_BYTES = limitBytes * 0.85; 
    const EST_PDF_OVERHEAD_BASE = 15000; 
    const EST_OVERHEAD_PER_PAGE = 3000; 

    const processNextStep = async () => {
        if (isCancelled) return;
        if (optimizationCursor >= items.length) {
            setOptimizingStatus('');
            return;
        }
        if (chunks.length > 0 && !chunks[chunks.length - 1].isOptimized) return;

        const currentChunkId = chunks.length + 1;
        let currentBatch: DriveFile[] = [];
        let estimatedAccumulator = EST_PDF_OVERHEAD_BASE;
        let nextCursor = optimizationCursor;
        let finalBatchSizeBytes = 0;
        let chunkIsFull = false;

        while (nextCursor < items.length) {
             const item = items[nextCursor];
             setOptimizingStatus(`Del ${currentChunkId}: Optimerar för FamilySearch-minnen...`);
             let itemSize = item.processedSize;
             if (!item.processedBuffer || item.compressionLevelUsed !== settings.compressionLevel) {
                 try {
                     const { buffer, size } = await processFileForCache(item, accessToken, settings.compressionLevel);
                     if (isCancelled) return;
                     itemSize = size;
                     onUpdateItems(prev => prev.map(p => p.id === item.id ? { ...p, processedBuffer: buffer, processedSize: size, compressionLevelUsed: settings.compressionLevel } : p));
                 } catch (e) { console.error("Processing failed", item.name); itemSize = item.size; }
             }
             currentBatch.push(item);
             estimatedAccumulator += (itemSize || 0) + EST_OVERHEAD_PER_PAGE;
             if (estimatedAccumulator < VERIFY_THRESHOLD_BYTES) {
                 nextCursor++; await new Promise(r => setTimeout(r, 0)); continue;
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
            addLog(`Del ${currentChunkId} klar för FamilySearch: ${currentBatch.length} objekt, ${(newChunk.sizeBytes / 1024 / 1024).toFixed(1)}MB`);
            setOptimizationCursor(nextCursor); setOptimizingStatus('');
        }
    };
    const timer = setTimeout(processNextStep, 100);
    return () => { isCancelled = true; clearTimeout(timer); };
  }, [itemsHash, optimizationCursor, chunks.length, settings.compressionLevel, settings.maxChunkSizeMB]);

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
          <FamilySearchExport items={items} bookTitle={bookTitle} accessToken={accessToken} onBack={onCloseShareView} settings={settings} onUpdateItems={onUpdateItems} />
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
                        
                        {/* EXPANDABLE SETTINGS PANEL - MOVED HERE */}
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
                                    {/* Explanation Text */}
                                    <div className="bg-indigo-50/50 p-2 rounded border border-indigo-100 text-[10px] text-slate-600 leading-relaxed">
                                        FamilySearch har en gräns på 15 MB per fil för "Minnen". Appen analyserar och delar automatiskt upp din bok i flera delar (PDF-filer) så att de garanterat går att ladda upp. Du kan justera bildkvaliteten nedan för att få plats med fler sidor per fil.
                                    </div>

                                    {/* Drive Path */}
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
                                            type="range" 
                                            min="5" max="50" step="0.5" 
                                            value={settings.maxChunkSizeMB} 
                                            onChange={(e) => onUpdateSettings({...settings, maxChunkSizeMB: parseFloat(e.target.value)})} 
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
                                                    <button 
                                                        key={level} 
                                                        title={map[level].tooltip}
                                                        onClick={() => onUpdateSettings({...settings, compressionLevel: level})}
                                                        className={`flex-1 py-1.5 text-[9px] font-bold rounded-md transition-all ${isActive ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                                                    >
                                                        {map[level].label}
                                                    </button>
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
                            
                            {/* Status Log Popover */}
                            {showStatusLog && (
                                <div className="absolute top-6 left-0 right-0 bg-slate-800 text-slate-300 p-3 rounded-lg shadow-xl z-50 text-[9px] font-mono max-h-40 overflow-y-auto border border-slate-700">
                                    {statusLog.length === 0 && <p className="italic opacity-50">Loggen är tom...</p>}
                                    {statusLog.map((log, i) => (
                                        <div key={i} className="border-b border-slate-700/50 pb-1 mb-1 last:mb-0 last:pb-0 last:border-0">{log}</div>
                                    ))}
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
             
             {/* PDF CHUNKS */}
             {chunks.map((chunk, idx) => {
                 const theme = CHUNK_THEMES[idx % CHUNK_THEMES.length];
                 const isGreen = chunk.isSynced;
                 const isUploading = chunk.isUploading;
                 const sizeMB = (chunk.sizeBytes / (1024 * 1024));
                 const maxMB = settings.maxChunkSizeMB;
                 const percentFilled = Math.min(100, (sizeMB / maxMB) * 100);

                 if (isCompact) {
                     return (
                         <div 
                            key={chunk.id}
                            onClick={toggleOverlay}
                            className={`w-10 h-10 mx-auto my-2 rounded-full flex items-center justify-center text-xs font-bold shadow-sm cursor-pointer hover:scale-110 transition-transform text-white ${isGreen ? theme.bg : isUploading ? 'bg-indigo-500 animate-pulse' : theme.bg}`}
                            title={chunk.title}
                         >
                             {chunk.id}
                         </div>
                     );
                 }

                 return (
                     <div 
                        key={chunk.id} 
                        onClick={() => setActiveChunkFilter(activeChunkFilter === chunk.id ? null : chunk.id)}
                        className={`group bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden cursor-pointer transition-all hover:shadow-md ${activeChunkFilter === chunk.id ? 'ring-2 ring-indigo-500 ring-offset-1' : ''}`}
                     >
                         <div className="p-4">
                             <div className="flex justify-between items-center mb-3">
                                 <div className="flex items-center space-x-3">
                                     <span className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-black text-white ${theme.bg}`}>
                                         {chunk.id}
                                     </span>
                                     <div>
                                         <h3 className="text-sm font-bold text-slate-800">Del {chunk.id}</h3>
                                         <p className="text-[10px] text-slate-400 font-medium">
                                             {chunk.items.length} objekt
                                         </p>
                                     </div>
                                 </div>
                                 <div className="text-right">
                                     {isGreen ? (
                                         <span className="text-[9px] font-black text-emerald-600 bg-emerald-50 px-2 py-1 rounded-md uppercase tracking-wider flex items-center gap-1 border border-emerald-100">
                                             <i className="fas fa-check-circle"></i> SPARAD PÅ DRIVE
                                         </span>
                                     ) : isUploading ? (
                                         <span className="text-[9px] font-black text-indigo-600 bg-indigo-50 px-2 py-1 rounded-md uppercase tracking-wider animate-pulse flex items-center gap-1">
                                             <i className="fas fa-sync fa-spin"></i> SPARAR...
                                         </span>
                                     ) : (
                                         <span className="text-[9px] font-bold text-slate-400 bg-slate-100 px-2 py-1 rounded-md uppercase tracking-wider">
                                             Redo
                                         </span>
                                     )}
                                 </div>
                             </div>

                             {/* Storage Meter */}
                             <div className="relative w-full h-3 bg-slate-100 rounded-full overflow-hidden mb-2">
                                 <div 
                                    className={`absolute top-0 left-0 h-full transition-all duration-1000 ${theme.bg}`}
                                    style={{ width: `${percentFilled}%` }}
                                 ></div>
                             </div>
                             
                             <div className="flex justify-between text-[10px] font-bold text-slate-500">
                                 <span>{sizeMB.toFixed(1)} MB</span>
                                 <span>{maxMB.toFixed(1)} MB Max</span>
                             </div>
                         </div>
                     </div>
                 );
             })}

             {/* MANUALLY EXPORTED FILES */}
             {exportedFiles.length > 0 && !isCompact && (
                 <div className="mt-4">
                     <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 pl-1">Manuellt sparade filer</h4>
                     <div className="space-y-2">
                         {exportedFiles.map(file => (
                             <div key={file.id} className="bg-white rounded-lg border border-slate-200 p-3 flex items-center justify-between shadow-sm">
                                <div className="flex items-center space-x-3">
                                    <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center text-sm font-bold border border-emerald-100">
                                        <i className="fas fa-image"></i>
                                    </div>
                                    <div className="min-w-0">
                                        <h5 className="text-xs font-bold text-slate-800 truncate max-w-[150px]">{file.name}</h5>
                                        <p className="text-[9px] text-slate-400">Sparad {file.timestamp.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</p>
                                    </div>
                                </div>
                                <span className="text-[9px] font-black text-emerald-600 bg-emerald-50 px-2 py-1 rounded-md uppercase tracking-wider border border-emerald-100">
                                    Klar
                                </span>
                             </div>
                         ))}
                     </div>
                 </div>
             )}
             
             {/* Loading / Optimizing Placeholder */}
             {optimizingStatus && (
                 <div className="p-4 bg-white rounded-xl border border-slate-200 border-dashed animate-pulse opacity-70">
                     <div className="flex items-center space-x-3">
                         <div className="w-8 h-8 bg-slate-200 rounded-lg"></div>
                         <div className="flex-1 space-y-2">
                             <div className="h-3 bg-slate-200 rounded w-1/2"></div>
                             <div className="h-2 bg-slate-200 rounded w-3/4"></div>
                         </div>
                     </div>
                 </div>
             )}
        </div>
        
        <div className={`p-4 bg-white border-t border-slate-100 ${isCompact ? 'flex justify-center' : ''}`}>
             {!isCompact ? (
                 <button 
                    onClick={() => (window as any).triggerShare?.()}
                    className="w-full text-left bg-white border border-slate-200 hover:border-indigo-300 hover:shadow-lg rounded-[1.5rem] p-4 transition-all group"
                 >
                    <div className="flex items-center space-x-4">
                        <div className="shrink-0 group-hover:scale-105 transition-transform">
                            <AppLogo variant="phase3" className="w-16 h-16" />
                        </div>
                        <div>
                            <h2 className="text-xl font-serif font-bold text-slate-900 group-hover:text-indigo-700 transition-colors">Dela oändligt</h2>
                            <p className="text-[10px] text-slate-500 font-medium mt-1 uppercase tracking-wider">Tryck för att dela</p>
                        </div>
                        <div className="ml-auto text-slate-300 group-hover:text-indigo-500 group-hover:translate-x-1 transition-all">
                            <i className="fas fa-chevron-right text-lg"></i>
                        </div>
                    </div>
                 </button>
             ) : (
                 <button onClick={() => (window as any).triggerShare?.()} className="w-10 h-10 bg-indigo-50 hover:bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 transition-colors">
                     <i className="fas fa-share-nodes"></i>
                 </button>
             )}
        </div>
      </>
  );

  return (
    <>
      {/* Changed min-h-screen to min-h-full to prevent forced scrolling in already constrained containers */}
      <div 
        className="flex flex-col lg:flex-row h-auto min-h-full lg:h-full bg-[#f0f2f5] lg:overflow-hidden" 
        onClick={() => {
            setSelectedIds(new Set());
            if (isSidebarCompact && showSidebarOverlay) {
                setShowSidebarOverlay(false);
            }
        }}
      >
         {isProcessing && (
            <div className="fixed inset-0 z-[60] bg-white/80 backdrop-blur-sm flex items-center justify-center">
                <div className="flex flex-col items-center">
                    <i className="fas fa-circle-notch fa-spin text-4xl text-indigo-600 mb-4"></i>
                    <p className="font-bold text-slate-700">Bearbetar...</p>
                </div>
            </div>
         )}
         
         {/* LEFT: INPUT (Main Content Area) */}
         {/* Changed to w-full on mobile, flex-1 on desktop. Removed fixed heights on mobile for natural scroll */}
         <div className="w-full lg:flex-1 lg:overflow-y-auto lg:scroll-smooth relative lg:border-r border-slate-200 min-w-0">
             <div className="p-4 md:p-8 pb-32">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
                    <div className="flex items-center space-x-4 max-w-full md:max-w-[70%]">
                        <div className="shrink-0">
                            <AppLogo variant="phase2" className="w-16 h-16 md:w-20 md:h-20" />
                        </div>
                        <div>
                            <h2 className="text-2xl font-serif font-bold text-slate-900 leading-tight break-words whitespace-normal">Berätta kortfattat</h2>
                            <p className="text-sm text-slate-500 font-medium mt-1">Klicka och skriv</p>
                        </div>
                    </div>
                    
                    {/* View Controls */}
                    <div className="flex items-center bg-slate-200 rounded-lg p-1 shrink-0">
                        <button 
                            onClick={(e) => { e.stopPropagation(); setViewMode('grid'); }}
                            className={`p-2 rounded-md transition-all ${viewMode === 'grid' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                            title="Rutnät"
                        >
                            <i className="fas fa-th-large"></i>
                        </button>
                        <button 
                            onClick={(e) => { e.stopPropagation(); setViewMode('list'); }}
                            className={`p-2 rounded-md transition-all ${viewMode === 'list' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                            title="Lista"
                        >
                            <i className="fas fa-list"></i>
                        </button>
                    </div>
                </div>

                {/* Filter Indicator */}
                {activeChunkFilter !== null && (
                    <div className="mb-6 flex items-center justify-between bg-indigo-50 px-4 py-2 rounded-lg border border-indigo-100">
                        <span className="text-sm font-bold text-indigo-700">Visar filer för Del {activeChunkFilter}</span>
                        <button onClick={(e) => { e.stopPropagation(); setActiveChunkFilter(null); }} className="text-xs bg-white hover:bg-indigo-100 px-3 py-1 rounded shadow-sm font-bold text-indigo-600 transition-colors">
                            Visa alla
                        </button>
                    </div>
                )}

                {/* Toolbar */}
                {selectedIds.size > 0 && (
                    <div className="sticky top-4 z-40 bg-slate-900 text-white px-6 py-3 rounded-xl shadow-2xl flex items-center justify-between animate-in slide-in-from-top-4 mb-6 mx-auto max-w-lg">
                        <span className="font-bold text-sm">{selectedIds.size} valda</span>
                        <div className="flex space-x-4">
                            <button onClick={(e) => { e.stopPropagation(); handleInsertAfterSelection(); }} className="hover:text-emerald-400 font-bold text-xs flex items-center space-x-1"><i className="fas fa-plus-circle"></i> <span>Lägg till</span></button>
                            {selectedIds.size > 1 && <button onClick={(e) => { e.stopPropagation(); handleMergeItems(); }} className="hover:text-indigo-300 font-bold text-xs flex items-center space-x-1"><i className="fas fa-object-group"></i> <span>Slå ihop</span></button>}
                            <button onClick={(e) => { e.stopPropagation(); onUpdateItems(items.filter(i => !selectedIds.has(i.id))); setSelectedIds(new Set()); }} className="hover:text-red-400 font-bold text-xs flex items-center space-x-1"><i className="fas fa-trash"></i> <span>Ta bort</span></button>
                        </div>
                    </div>
                )}

                {/* VIEW MODE: GRID */}
                {viewMode === 'grid' && (
                    <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 select-none">
                        {/* Add Button */}
                        <button 
                            onClick={(e) => { e.stopPropagation(); onOpenSourceSelector(null); }}
                            className="aspect-[210/297] rounded-sm border-2 border-dashed border-slate-300 flex flex-col items-center justify-center text-slate-400 hover:text-indigo-600 hover:border-indigo-300 hover:bg-indigo-50/20 transition-all group bg-white shadow-sm"
                        >
                            <div className="mb-2 transform group-hover:scale-110 transition-transform">
                                <AppLogo variant="phase1" className="w-12 h-12" />
                            </div>
                            <div className="w-8 h-8 rounded-full bg-slate-100 group-hover:bg-white group-hover:shadow-md flex items-center justify-center mb-2 transition-all">
                                <i className="fas fa-plus text-lg"></i>
                            </div>
                            <span className="text-sm font-bold uppercase tracking-wider text-center px-2">Lägg till<br/>minne</span>
                        </button>

                        {filteredItems.map((item, index) => {
                            const originalIndex = items.findIndex(i => i.id === item.id);
                            const chunk = getChunkForItem(item.id);
                            const chunkInfo = chunk ? { 
                                chunkIndex: chunk.id, 
                                colorClass: CHUNK_THEMES[(chunk.id - 1) % CHUNK_THEMES.length].bg 
                            } : undefined;

                            return (
                                <Tile 
                                    key={item.id} id={`tile-${item.id}`} item={item} index={originalIndex}
                                    isSelected={selectedIds.has(item.id)}
                                    onClick={(e: React.MouseEvent) => handleSelection(e, item, originalIndex)}
                                    onEdit={() => setEditingItem(item)}
                                    onSplit={() => handleSplitPdf(item, originalIndex)}
                                    onRemove={() => onUpdateItems(items.filter(i => i.id !== item.id))}
                                    onDragStart={(e: any) => handleDragStart(e, originalIndex)}
                                    onDragOver={(e: any) => handleDragOver(e, originalIndex)}
                                    chunkInfo={chunkInfo}
                                />
                            );
                        })}
                    </div>
                )}

                {/* VIEW MODE: LIST */}
                {viewMode === 'list' && (
                    <div className="flex flex-col space-y-2 select-none">
                         <button 
                            onClick={(e) => { e.stopPropagation(); onOpenSourceSelector(null); }}
                            className="w-full p-4 border-2 border-dashed border-slate-300 rounded-lg flex items-center justify-center text-slate-400 hover:text-indigo-600 hover:border-indigo-300 hover:bg-indigo-50/20 transition-all font-bold text-sm mb-4"
                        >
                            <i className="fas fa-plus mr-2"></i> Lägg till minne
                        </button>

                        {filteredItems.map((item, index) => {
                            const originalIndex = items.findIndex(i => i.id === item.id);
                            const chunk = getChunkForItem(item.id);
                            const chunkInfo = chunk ? { 
                                chunkIndex: chunk.id, 
                                colorClass: CHUNK_THEMES[(chunk.id - 1) % CHUNK_THEMES.length].bg 
                            } : undefined;

                            return (
                                <ListViewItem 
                                    key={item.id} item={item} index={originalIndex}
                                    isSelected={selectedIds.has(item.id)}
                                    onClick={(e: React.MouseEvent) => handleSelection(e, item, originalIndex)}
                                    onEdit={() => setEditingItem(item)}
                                    chunkInfo={chunkInfo}
                                    onDragStart={(e: any) => handleDragStart(e, originalIndex)}
                                    onDragOver={(e: any) => handleDragOver(e, originalIndex)}
                                />
                            );
                        })}
                    </div>
                )}
             </div>
         </div>

         {/* RIGHT: OUTPUT (Responsive Container) */}
         {/* Stacks below content on mobile, sits on right on desktop */}
         <div 
            ref={rightColumnRef} 
            onClick={(e) => e.stopPropagation()} 
            className={`
                bg-white lg:border-l border-t lg:border-t-0 border-slate-200 shadow-xl z-20 flex flex-col shrink-0 transition-all duration-300 relative
                ${isSidebarCompact ? 'lg:w-16' : 'lg:w-80'}
                w-full lg:h-full h-auto
            `}
         >
             {renderFilesList(isSidebarCompact)}

             {/* OVERLAY for Compact Mode Expansion (Desktop Only) */}
             {isSidebarCompact && showSidebarOverlay && (
                 <div className="hidden lg:flex absolute top-0 right-full w-80 h-full bg-white border-r border-slate-200 shadow-2xl z-30 flex-col animate-in slide-in-from-right-4">
                     <div className="flex justify-end p-2 border-b border-slate-100">
                         <button onClick={() => setShowSidebarOverlay(false)} className="text-slate-400 hover:text-slate-600 p-2">
                             <i className="fas fa-times"></i>
                         </button>
                     </div>
                     {renderFilesList(false)}
                 </div>
             )}
         </div>
      </div>

      {editingItem && (
        <EditModal 
          key={editingItem.id} 
          item={editingItem} 
          accessToken={accessToken}
          onClose={() => setEditingItem(null)} 
          onUpdate={handleUpdateItem}
          settings={settings}
          driveFolderId={currentBook.driveFolderId} // Pass drive folder ID
          onExportSuccess={handleManualExportSuccess} // Callback for tracking
        />
      )}
    </>
  );
};

// ... NEW LIST VIEW COMPONENT (Unchanged) ...
const ListViewItem = ({ item, index, isSelected, onClick, onEdit, chunkInfo, onDragStart, onDragOver }: any) => {
    const groupColor = stringToColor(item.id.split('-')[0] + (item.id.split('-')[1] || ''));
    const chunkColor = chunkInfo?.colorClass || 'bg-slate-300';
    const originalSize = item.size || 0;
    const processedSize = item.processedSize || originalSize;
    const reduction = originalSize > 0 ? Math.round(((originalSize - processedSize) / originalSize) * 100) : 0;
    const sizeStr = `${(originalSize / 1024 / 1024).toFixed(1)}MB -> ${(processedSize / 1024 / 1024).toFixed(1)}MB`;

    return (
        <div 
            className={`flex items-center p-3 rounded-lg border bg-white shadow-sm transition-all cursor-pointer ${isSelected ? 'ring-2 ring-indigo-500 border-indigo-500' : 'border-slate-200 hover:shadow-md hover:border-indigo-300'}`}
            style={{ borderLeft: `4px solid ${groupColor}` }}
            onClick={onClick}
            draggable onDragStart={onDragStart} onDragOver={onDragOver}
        >
            <div className="text-slate-300 mr-3 cursor-move hover:text-slate-500"><i className="fas fa-grip-vertical"></i></div>
            <div className="w-12 h-12 bg-slate-100 rounded overflow-hidden shrink-0 relative border border-slate-200">
                {item.thumbnail || (item.type === FileType.IMAGE && item.blobUrl) ? (
                    <img src={item.thumbnail || item.blobUrl} className="w-full h-full object-cover" />
                ) : (
                    <div className="flex items-center justify-center h-full text-slate-400"><i className={`fas ${item.type === FileType.PDF ? 'fa-file-pdf' : 'fa-file'} text-lg`}></i></div>
                )}
            </div>
            <div className="ml-4 flex-1 min-w-0">
                <h4 className="text-sm font-bold text-slate-800 truncate">{item.name}</h4>
                <div className="flex items-center gap-2 mt-1">
                    <div className={`w-2 h-2 rounded-full ${chunkColor}`}></div>
                    <span className="text-[10px] text-slate-500 font-mono">
                       {sizeStr} <span className="text-emerald-600 font-bold">(-{reduction}%)</span>
                    </span>
                </div>
            </div>
            <button onClick={(e) => { e.stopPropagation(); onEdit(); }} className="p-2 text-slate-400 hover:text-indigo-600">
                <i className="fas fa-pen"></i>
            </button>
        </div>
    );
};

// ... UPDATED TILE COMPONENT (Unchanged) ...
const Tile = ({ id, item, index, isSelected, onClick, onEdit, onSplit, onRemove, onDragStart, onDragOver, chunkInfo }: any) => {
  const groupColor = stringToColor(item.id.split('-')[0] + (item.id.split('-')[1] || ''));
  const showSplit = (item.type === FileType.PDF || item.type === FileType.GOOGLE_DOC) && (item.pageCount === undefined || item.pageCount > 1);
  const chunkColor = chunkInfo?.colorClass || 'bg-slate-300'; 
  const originalSize = item.size || 0;
  const processedSize = item.processedSize || originalSize;
  const reduction = originalSize > 0 ? Math.round(((originalSize - processedSize) / originalSize) * 100) : 0;
  const showStats = item.processedSize && reduction > 5;
  const displaySize = showStats 
      ? `${(originalSize/1024/1024).toFixed(1)}MB -> ${(processedSize/1024/1024).toFixed(1)}MB (-${reduction}%)`
      : `${(originalSize/1024/1024).toFixed(1)} MB`;
  const isEdited = item.pageMeta && Object.keys(item.pageMeta).length > 0;

  return (
    <div id={id} className={`group relative aspect-[210/297] bg-white rounded-sm shadow-sm transition-all cursor-pointer transform ${isSelected ? 'ring-4 ring-indigo-500 scale-105 z-10' : 'hover:shadow-xl hover:-translate-y-1'}`} style={{ borderBottom: `4px solid ${groupColor}` }} draggable onDragStart={onDragStart} onDragOver={onDragOver} onClick={onClick}>
       <div className="absolute inset-0 bottom-16 bg-slate-50 overflow-hidden flex items-center justify-center">
          <div className="w-full h-full relative">
             {item.thumbnail ? (
                 <img src={item.thumbnail} className="w-full h-full object-contain" loading="lazy" />
             ) : item.type === FileType.IMAGE && item.blobUrl ? (
                 <img src={item.blobUrl} className="w-full h-full object-contain" loading="lazy" />
             ) : (item.type === FileType.PDF && item.blobUrl) ? (
                 <iframe src={`${item.blobUrl}#toolbar=0&navpanes=0&scrollbar=0&view=Fit`} className="w-full h-full absolute inset-0 border-none pointer-events-none" title="Preview" scrolling="no" loading="lazy" />
             ) : (
                 <div className="flex flex-col items-center justify-center h-full text-center p-2">
                    <i className={`fas ${item.type === FileType.PDF || item.type === FileType.GOOGLE_DOC ? 'fa-file-pdf text-red-400' : 'fa-file-alt text-slate-400'} text-4xl mb-2`}></i>
                    {item.type === FileType.PDF && <p className="text-[10px] text-slate-400">PDF-dokument</p>}
                 </div>
             )}
             <div className="absolute bottom-0 left-0 right-0 h-10 bg-gradient-to-t from-black/20 to-transparent pointer-events-none"></div>
          </div>
          <div className="absolute top-2 left-2 flex flex-col gap-1 items-start z-20 pointer-events-none">
              <div className={`w-3 h-3 rounded-full shadow-sm border border-white/50 ${chunkColor}`}></div>
          </div>
          <div className={`absolute top-2 right-2 flex flex-col gap-2 transition-opacity z-30 ${isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
              <button onClick={(e) => { e.stopPropagation(); onEdit(); }} className="w-8 h-8 bg-indigo-600 text-white rounded-full shadow-md flex items-center justify-center hover:bg-indigo-700"><i className="fas fa-pen text-xs"></i></button>
              {showSplit && (<button onClick={(e) => { e.stopPropagation(); onSplit(); }} className="w-8 h-8 bg-white rounded-full text-slate-400 hover:text-indigo-600 shadow-md flex items-center justify-center"><i className="fas fa-layer-group text-xs"></i></button>)}
               <button onClick={(e) => { e.stopPropagation(); onRemove(); }} className="w-8 h-8 bg-white rounded-full text-slate-400 hover:text-red-500 shadow-md flex items-center justify-center"><i className="fas fa-trash-alt text-xs"></i></button>
          </div>
       </div>
       <div className="absolute bottom-0 left-0 right-0 h-16 px-3 py-2 bg-white border-t border-slate-100 flex flex-col justify-between">
          <div>
            <p className="text-[10px] font-bold text-slate-700 uppercase truncate mb-0.5">{item.name}</p>
            <div className="text-[9px] leading-tight text-slate-500 line-clamp-1 font-serif italic opacity-80">{item.description || "Ingen beskrivning..."}</div>
          </div>
          <div className="flex justify-between items-end mt-1">
             <span className="text-[8px] font-mono text-slate-400 truncate max-w-[70%]">{displaySize}</span>
             {isEdited && <span className="bg-indigo-50 text-indigo-600 px-1.5 py-0.5 text-[8px] font-bold uppercase rounded border border-indigo-100">Redigerad</span>}
          </div>
       </div>
    </div>
  );
};

const RichTextListEditor = ({ lines, onChange, onFocusLine, focusedLineId }: { lines: RichTextLine[], onChange: (l: RichTextLine[]) => void, onFocusLine: (id: string | null) => void, focusedLineId: string | null }) => {
    const handleTextChange = (id: string, newText: string) => onChange(lines.map(l => l.id === id ? { ...l, text: newText } : l));
    const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const newLine: RichTextLine = { id: `line-${Date.now()}`, text: '', config: { ...lines[index].config } };
            const newLines = [...lines]; newLines.splice(index + 1, 0, newLine); onChange(newLines);
        } else if (e.key === 'Backspace' && lines[index].text === '' && lines.length > 1) {
            e.preventDefault(); onChange(lines.filter((_, i) => i !== index));
        }
    };
    if (lines.length === 0) return (<button onClick={() => onChange([{ id: `init-${Date.now()}`, text: '', config: DEFAULT_TEXT_CONFIG }])} className="text-xs text-indigo-500 font-bold hover:bg-indigo-50 p-2 rounded w-full text-left">+ Lägg till textrad</button>);
    return (<div className="space-y-2">{lines.map((line, index) => (
        <div key={line.id} className={`flex items-center group relative ${focusedLineId === line.id ? 'ring-2 ring-indigo-100 rounded-lg' : ''}`}>
            <input value={line.text} onChange={(e) => handleTextChange(line.id, e.target.value)} onFocus={() => onFocusLine(line.id)} onBlur={() => {}} onKeyDown={(e) => handleKeyDown(e, index)} className="w-full bg-transparent border-b border-transparent hover:border-slate-200 focus:border-indigo-500 outline-none py-1 px-2 font-serif text-slate-800 transition-colors" style={{ fontWeight: line.config.isBold ? 'bold' : 'normal', fontStyle: line.config.isItalic ? 'italic' : 'normal', fontSize: Math.max(12, line.config.fontSize * 0.7) + 'px', textAlign: line.config.alignment }} placeholder="Skriv här..." />
            <button onClick={() => onChange(lines.filter(l => l.id !== line.id))} className="absolute right-2 text-slate-300 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity px-2" tabIndex={-1}><i className="fas fa-times"></i></button>
        </div>))}</div>);
};

const EditModal = ({ item, accessToken, onClose, onUpdate, settings, driveFolderId, onExportSuccess }: any) => {
    const [previewBlob, setPreviewBlob] = useState<Blob | null>(null);
    const [pageMeta, setPageMeta] = useState<Record<number, PageMetadata>>(item.pageMeta || {});
    const [activePageIndex, setActivePageIndex] = useState(0);
    const [totalPages, setTotalPages] = useState(1);
    const [activeSection, setActiveSection] = useState<'header' | 'footer'>('header');
    const [focusedLineId, setFocusedLineId] = useState<string | null>(null);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [pdfDocProxy, setPdfDocProxy] = useState<any>(null);
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);
    const mainCanvasRef = useRef<HTMLCanvasElement>(null);
    const [isLoadingPreview, setIsLoadingPreview] = useState(true);
    const [isSavingImage, setIsSavingImage] = useState(false);

    useEffect(() => {
        const init = async () => {
             setIsLoadingPreview(true); setErrorMsg(null);
             try {
                const { buffer } = await processFileForCache(item, accessToken, settings.compressionLevel || 'medium');
                const isPdfType = item.type === FileType.PDF || item.type === FileType.GOOGLE_DOC;
                const type = isPdfType ? 'application/pdf' : 'image/jpeg';
                
                const sourceBlob = new Blob([buffer as any], { type });
                const previewUrl = await createPreviewWithOverlay(sourceBlob, item.type, pageMeta);
                
                const res = await fetch(previewUrl);
                const pBlob = await res.blob();
                setPreviewBlob(pBlob);
                
                const pdf = await getPdfDocument(pBlob);
                setPdfDocProxy(pdf);
                setTotalPages(pdf.numPages);
                
                if (Object.keys(pageMeta).length === 0 && (item.headerText || item.description)) {
                     const initMeta: PageMetadata = { headerLines: item.headerText ? [{ id: 'l1', text: item.headerText, config: item.textConfig || DEFAULT_TEXT_CONFIG }] : [], footerLines: item.description ? [{ id: 'f1', text: item.description, config: DEFAULT_FOOTER_CONFIG }] : [], };
                    setPageMeta({ 0: initMeta });
                }
             } catch (e: any) { 
                 console.error("Init failed", e); 
                 setErrorMsg(e.message || "Kunde inte ladda filen."); 
             } finally { setIsLoadingPreview(false); }
        }
        init();
    }, []);

    useEffect(() => {
        const update = async () => {
            if (!item || errorMsg) return;
            try {
                onUpdate({ pageMeta });
                const { buffer } = await processFileForCache(item, accessToken, settings.compressionLevel || 'medium');
                const isPdfType = item.type === FileType.PDF || item.type === FileType.GOOGLE_DOC;
                const type = isPdfType ? 'application/pdf' : 'image/jpeg';

                const sourceBlob = new Blob([buffer as any], { type });
                const url = await createPreviewWithOverlay(sourceBlob, item.type, pageMeta);
                const res = await fetch(url);
                const pBlob = await res.blob();
                setPreviewBlob(pBlob);
                const pdf = await getPdfDocument(pBlob);
                setPdfDocProxy(pdf);
            } catch(e) { console.error(e); }
        };
        const t = setTimeout(update, 500); return () => clearTimeout(t);
    }, [pageMeta]);

    useEffect(() => {
        const renderMain = async () => { if (pdfDocProxy && mainCanvasRef.current) await renderPdfPageToCanvas(pdfDocProxy, activePageIndex + 1, mainCanvasRef.current, 1.5); };
        renderMain();
    }, [pdfDocProxy, activePageIndex]);

    const getCurrentMeta = () => pageMeta[activePageIndex] || { headerLines: [], footerLines: [] };
    const updateCurrentMeta = (updates: Partial<PageMetadata>) => setPageMeta(prev => ({ ...prev, [activePageIndex]: { ...(prev[activePageIndex] || { headerLines: [], footerLines: [] }), ...updates } }));
    
    // Updated PNG Save Logic
    const handleCopyPageToPng = async () => {
        if (!previewBlob || !driveFolderId) {
            alert("Kan inte spara bilden (saknar mapp eller data).");
            return;
        }
        
        const defaultName = `${item.name.replace(/\.[^/.]+$/, "")}_Sida${activePageIndex + 1}.png`;
        const filename = prompt("Vad ska bilden heta på Google Drive?", defaultName);
        if (!filename) return;

        setIsSavingImage(true);
        try { 
            const pngBlob = await extractHighQualityImage(previewBlob, activePageIndex); 
            await uploadToDrive(accessToken, driveFolderId, filename, pngBlob, 'image/png');
            
            // Notify success to parent to update export list
            if (onExportSuccess) {
                onExportSuccess(filename, 'png');
            }

            alert(`Bilden "${filename}" har sparats i bokens mapp på Google Drive.\n\nDu kan nu ladda upp den manuellt till "Minnen" på FamilySearch för att kunna tagga ansikten (vilket inte går med PDF-filer).`);
        } catch (e) { 
            alert("Kunde inte spara bilden till Drive."); 
            console.error(e);
        } finally {
            setIsSavingImage(false);
        }
    };

    const getActiveConfig = () => { const meta = getCurrentMeta(); const lines = activeSection === 'header' ? meta.headerLines : meta.footerLines; const line = lines.find(l => l.id === focusedLineId); return line?.config || (activeSection === 'header' ? DEFAULT_TEXT_CONFIG : DEFAULT_FOOTER_CONFIG); };
    const updateActiveConfig = (key: keyof TextConfig, value: any) => { const meta = getCurrentMeta(); const isHeader = activeSection === 'header'; const lines = isHeader ? meta.headerLines : meta.footerLines; if (focusedLineId) { const newLines = lines.map(l => l.id === focusedLineId ? { ...l, config: { ...l.config, [key]: value } } : l); updateCurrentMeta(isHeader ? { headerLines: newLines } : { footerLines: newLines }); } else { const newLines = lines.map(l => ({ ...l, config: { ...l.config, [key]: value } })); updateCurrentMeta(isHeader ? { headerLines: newLines } : { footerLines: newLines }); } };
    const currentConfig = getActiveConfig();

    return (
        <div className="fixed inset-0 z-[100] bg-slate-900 flex flex-col animate-in fade-in duration-200">
            <div className="bg-slate-800 text-white h-14 flex items-center justify-between px-4 border-b border-slate-700 shrink-0">
                <div className="flex items-center space-x-4"><button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="text-slate-300 hover:text-white"><i className="fas fa-bars text-lg"></i></button><span className="font-bold text-sm truncate max-w-[200px]">{item.name}</span></div>
                <div className="flex items-center space-x-2"><span className="text-xs text-slate-400 mr-2">{activePageIndex + 1} / {totalPages}</span><button onClick={() => setActivePageIndex(Math.max(0, activePageIndex - 1))} disabled={activePageIndex === 0} className="w-8 h-8 rounded hover:bg-slate-700 disabled:opacity-30"><i className="fas fa-chevron-left"></i></button><button onClick={() => setActivePageIndex(Math.min(totalPages - 1, activePageIndex + 1))} disabled={activePageIndex === totalPages - 1} className="w-8 h-8 rounded hover:bg-slate-700 disabled:opacity-30"><i className="fas fa-chevron-right"></i></button></div>
                <div className="flex items-center space-x-3">
                    <button onClick={handleCopyPageToPng} disabled={isSavingImage} className="bg-emerald-600 hover:bg-emerald-500 px-3 py-1.5 rounded text-xs font-bold transition-colors flex items-center space-x-2 shadow-lg disabled:opacity-50">
                        {isSavingImage ? <i className="fas fa-circle-notch fa-spin"></i> : <i className="fas fa-save"></i>}
                        <span>{isSavingImage ? 'Sparar...' : 'Spara bild till Drive'}</span>
                    </button>
                    <button onClick={onClose} className="bg-indigo-600 hover:bg-indigo-500 px-4 py-1.5 rounded text-xs font-bold transition-colors">Klar</button>
                </div>
            </div>
            <div className="flex-1 flex overflow-hidden">
                {isSidebarOpen && (<div className="w-48 bg-[#222] border-r border-slate-700 flex flex-col overflow-y-auto custom-scrollbar shrink-0"><div className="p-4 space-y-4">{Array.from({ length: totalPages }).map((_, idx) => (<div key={idx} onClick={() => setActivePageIndex(idx)} className={`cursor-pointer group relative flex flex-col items-center ${activePageIndex === idx ? 'opacity-100' : 'opacity-60 hover:opacity-100'}`}><div className={`w-full aspect-[210/297] bg-white rounded-sm overflow-hidden relative shadow-sm transition-all ${activePageIndex === idx ? 'ring-2 ring-indigo-500' : ''}`}><SidebarThumbnail pdfDocProxy={pdfDocProxy} pageIndex={idx} item={item} /></div><span className="text-[10px] text-slate-400 mt-1">{idx + 1}</span></div>))}</div></div>)}
                <div className="flex-1 bg-[#1a1a1a] relative flex items-center justify-center overflow-auto p-8">
                     {isLoadingPreview && (<div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 z-20 backdrop-blur-sm"><i className="fas fa-circle-notch fa-spin text-indigo-400 text-4xl mb-4"></i><p className="text-white font-bold text-sm">Optimerar för redigering...</p></div>)}
                     {errorMsg && !isLoadingPreview && (<div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900 z-10"><div className="bg-slate-800 p-8 rounded-2xl max-w-md text-center border border-slate-700"><i className="fas fa-exclamation-triangle text-4xl text-amber-500 mb-4"></i><h3 className="text-white font-bold text-lg mb-2">Hoppsan!</h3><p className="text-slate-300 text-sm mb-6">{errorMsg}</p><button onClick={onClose} className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 font-bold text-sm">Stäng</button></div></div>)}
                     <div className="shadow-2xl bg-white relative"><canvas ref={mainCanvasRef} className="block max-w-full max-h-[85vh] h-auto w-auto" /></div>
                </div>
                <div className="w-80 bg-white border-l border-slate-200 flex flex-col z-20 shadow-xl shrink-0">
                     <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center space-x-3">
                         <div className="shrink-0"><AppLogo variant="phase2" className="w-8 h-8" /></div>
                         <h3 className="font-bold text-slate-800 text-lg leading-tight">Berätta kortfattat</h3>
                     </div>
                     <div className="bg-white p-2 border-b border-slate-200 flex flex-wrap gap-2">
                         <div className="flex bg-slate-100 rounded p-1"><button onClick={() => updateActiveConfig('isBold', !currentConfig.isBold)} className={`w-7 h-7 rounded text-xs ${currentConfig.isBold ? 'bg-white shadow text-black' : 'text-slate-500'}`}><i className="fas fa-bold"></i></button><button onClick={() => updateActiveConfig('isItalic', !currentConfig.isItalic)} className={`w-7 h-7 rounded text-xs ${currentConfig.isItalic ? 'bg-white shadow text-black' : 'text-slate-500'}`}><i className="fas fa-italic"></i></button></div>
                         <div className="flex bg-slate-100 rounded p-1"><button onClick={() => updateActiveConfig('alignment', 'left')} className={`w-7 h-7 rounded text-xs ${currentConfig.alignment === 'left' ? 'bg-white shadow text-black' : 'text-slate-500'}`}><i className="fas fa-align-left"></i></button><button onClick={() => updateActiveConfig('alignment', 'center')} className={`w-7 h-7 rounded text-xs ${currentConfig.alignment === 'center' ? 'bg-white shadow text-black' : 'text-slate-500'}`}><i className="fas fa-align-center"></i></button><button onClick={() => updateActiveConfig('alignment', 'right')} className={`w-7 h-7 rounded text-xs ${currentConfig.alignment === 'right' ? 'bg-white shadow text-black' : 'text-slate-500'}`}><i className="fas fa-align-right"></i></button></div>
                         {activeSection === 'header' && (
                             <div className="flex bg-slate-100 rounded p-1"><button onClick={() => updateActiveConfig('verticalPosition', 'top')} className={`w-7 h-7 rounded text-xs ${currentConfig.verticalPosition === 'top' ? 'bg-white shadow text-black' : 'text-slate-500'}`}><i className="fas fa-arrow-up"></i></button><button onClick={() => updateActiveConfig('verticalPosition', 'center')} className={`w-7 h-7 rounded text-xs ${currentConfig.verticalPosition === 'center' ? 'bg-white shadow text-black' : 'text-slate-500'}`}><i className="fas fa-arrows-alt-v"></i></button><button onClick={() => updateActiveConfig('verticalPosition', 'bottom')} className={`w-7 h-7 rounded text-xs ${currentConfig.verticalPosition === 'bottom' ? 'bg-white shadow text-black' : 'text-slate-500'}`}><i className="fas fa-arrow-down"></i></button></div>
                         )}
                     </div>
                     <div className="px-4 py-2 border-b border-slate-100"><div className="flex justify-between text-[10px] font-bold text-slate-500 mb-1"><span>Textstorlek</span><span>{currentConfig.fontSize}px</span></div><input type="range" min="8" max="72" value={currentConfig.fontSize} onChange={(e) => updateActiveConfig('fontSize', parseInt(e.target.value))} className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600" /></div>
                     <div className="flex-1 overflow-y-auto p-4 space-y-6">
                        <div className={`rounded-lg border p-3 cursor-pointer transition-all ${activeSection === 'header' ? 'bg-indigo-50 border-indigo-200 ring-1 ring-indigo-200' : 'bg-white border-slate-200 hover:border-slate-300'}`} onClick={() => setActiveSection('header')}><label className="text-[10px] font-black uppercase text-indigo-900 mb-2 block">Text PÅ sidan</label><RichTextListEditor lines={getCurrentMeta().headerLines || []} onChange={(lines) => updateCurrentMeta({ headerLines: lines })} onFocusLine={setFocusedLineId} focusedLineId={focusedLineId}/></div>
                        <div className={`rounded-lg border p-3 cursor-pointer transition-all ${activeSection === 'footer' ? 'bg-indigo-50 border-indigo-200 ring-1 ring-indigo-200' : 'bg-white border-slate-200 hover:border-slate-300'}`} onClick={() => setActiveSection('footer')}><label className="text-[10px] font-black uppercase text-slate-500 mb-2 block">Text UNDER sidan</label><RichTextListEditor lines={getCurrentMeta().footerLines || []} onChange={(lines) => updateCurrentMeta({ footerLines: lines })} onFocusLine={setFocusedLineId} focusedLineId={focusedLineId}/></div>
                         <label className="flex items-center space-x-3 p-3 bg-slate-50 rounded-lg cursor-pointer hover:bg-slate-100 transition-colors border border-slate-100"><input type="checkbox" checked={getCurrentMeta().hideObject || false} onChange={(e) => updateCurrentMeta({ hideObject: e.target.checked })} className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"/><div><span className="text-xs font-bold text-slate-700 block">Dölj originalbilden</span></div></label>
                     </div>
                </div>
            </div>
        </div>
    );
};

const SidebarThumbnail = ({ pdfDocProxy, pageIndex, item }: { pdfDocProxy: any, pageIndex: number, item: DriveFile }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    useEffect(() => { const render = async () => { if (!pdfDocProxy || !canvasRef.current) return; try { await renderPdfPageToCanvas(pdfDocProxy, pageIndex + 1, canvasRef.current, 0.2); } catch (e) { console.error("Thumb render error", e); } }; render(); }, [pdfDocProxy, pageIndex]);
    if (item.type === FileType.IMAGE && item.blobUrl && pageIndex === 0) { return <img src={item.blobUrl} className="w-full h-full object-contain" />; }
    return <canvas ref={canvasRef} className="w-full h-full object-contain" />;
};

export default StoryEditor;
