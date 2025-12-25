
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { DriveFile, FileType, TextConfig, RichTextLine, PageMetadata, AppSettings, MemoryBook } from '../types';
import { generateCombinedPDF, splitPdfIntoPages, mergeFilesToPdf, createPreviewWithOverlay, getPdfPageCount, DEFAULT_TEXT_CONFIG, DEFAULT_FOOTER_CONFIG, getPdfDocument, renderPdfPageToCanvas, extractHighQualityImage, processFileForCache, generatePageThumbnail } from '../services/pdfService';
import { uploadToDrive } from '../services/driveService';
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
  settings
}) => {
  const [editingItem, setEditingItem] = useState<DriveFile | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [lastSelectedId, setLastSelectedId] = useState<string | null>(null);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [activeChunkFilter, setActiveChunkFilter] = useState<number | null>(null);
  
  // Layout State
  const [isSidebarCompact, setIsSidebarCompact] = useState(false);
  const [showSidebarOverlay, setShowSidebarOverlay] = useState(false);
  const rightColumnRef = useRef<HTMLDivElement>(null);

  // --- OPTIMIZATION STATE ---
  const [chunks, setChunks] = useState<ChunkData[]>([]);
  const [optimizationCursor, setOptimizationCursor] = useState(0); 
  const [optimizingStatus, setOptimizingStatus] = useState<string>('');

  // Reset optimization when fundamental items change
  const itemsHash = items.map(i => i.id + i.modifiedTime).join('|');
  useEffect(() => {
      setOptimizationCursor(0);
      setChunks([]);
  }, [itemsHash, settings.maxChunkSizeMB, settings.compressionLevel]);

  // --- SAFER OPTIMIZATION ALGORITHM (Linear Accumulation) ---
  useEffect(() => {
    let isCancelled = false;
    const limitBytes = settings.maxChunkSizeMB * 1024 * 1024;
    
    // We start measuring accurately when we reach this threshold (e.g. 85% full)
    // allowing us to skip expensive PDF generation for the first few small files.
    const precisionThreshold = limitBytes * 0.85; 

    const processNextStep = async () => {
        if (isCancelled) return;

        // 1. Done?
        if (optimizationCursor >= items.length) {
            setOptimizingStatus('');
            return;
        }

        // 2. Wait if previous chunk isn't fully locked in state yet
        // (Prevents race conditions where we optimize chunk 2 before chunk 1 is rendered)
        if (chunks.length > 0 && !chunks[chunks.length - 1].isOptimized) {
            return;
        }

        const currentChunkId = chunks.length + 1;
        setOptimizingStatus(`Beräknar Del ${currentChunkId}...`);

        let currentBatch: DriveFile[] = [];
        let currentEstimatedSize = 0;
        let nextCursor = optimizationCursor;
        let batchSizeBytes = 0;

        // PHASE 1: FAST FILL (Estimate)
        // Add items until we are close to the threshold
        while (nextCursor < items.length) {
             const item = items[nextCursor];
             // Estimate: Use cached size if available, otherwise raw size * compression factor guess (0.7)
             const itemEstSize = item.processedSize || (item.size * 0.7); 
             
             if (currentEstimatedSize + itemEstSize > precisionThreshold) {
                 break; // Stop fast fill, switch to precision
             }
             
             currentBatch.push(item);
             currentEstimatedSize += itemEstSize;
             nextCursor++;
        }

        // Ensure we have at least one item to start with
        if (currentBatch.length === 0 && nextCursor < items.length) {
            currentBatch.push(items[nextCursor]);
            nextCursor++;
        }

        // PHASE 2: PRECISION MODE (Measure exact PDF size)
        let isFinalized = false;
        
        while (!isFinalized && !isCancelled) {
             // A. Ensure all items in batch are processed/cached locally
             for (const item of currentBatch) {
                 if (!item.processedBuffer || item.compressionLevelUsed !== settings.compressionLevel) {
                     setOptimizingStatus(`Komprimerar ${item.name}...`);
                     try {
                         const { buffer, size } = await processFileForCache(item, accessToken, settings.compressionLevel);
                         if (!isCancelled) {
                            // Update the item in the main list so we don't re-process it next time
                            // Note: We use a functional update to avoid stale state closure issues
                            onUpdateItems(prev => prev.map(p => p.id === item.id ? { ...p, processedBuffer: buffer, processedSize: size, compressionLevelUsed: settings.compressionLevel } : p));
                         }
                     } catch (e) {
                         console.error("Failed to process", item.name);
                     }
                 }
             }

             // B. Measure Actual Combined PDF Size
             setOptimizingStatus(`Mäter ${currentBatch.length} filer...`);
             let realSize = 0;
             try {
                 const pdfBytes = await generateCombinedPDF(accessToken, currentBatch, "temp", settings.compressionLevel);
                 realSize = pdfBytes.byteLength;
                 batchSizeBytes = realSize;
             } catch (e) {
                 console.error("Measurement failed");
                 break; 
             }

             // C. Decide
             if (realSize > limitBytes) {
                 // Too big!
                 if (currentBatch.length === 1) {
                     // Special Case: A single file is larger than the limit.
                     // We must accept it as a chunk, otherwise we block forever.
                     // (In a real app, we might warn the user here)
                     isFinalized = true; 
                 } else {
                     // Remove the last added item, and finalize the chunk WITHOUT it.
                     currentBatch.pop();
                     nextCursor--; // Backtrack cursor
                     
                     // Re-measure the valid batch one last time to get correct size for UI
                     // (Optimization: we could remember previous loop's size, but safety first)
                     const pdfBytes = await generateCombinedPDF(accessToken, currentBatch, "temp", settings.compressionLevel);
                     batchSizeBytes = pdfBytes.byteLength;
                     isFinalized = true;
                 }
             } else {
                 // Fits! Can we add one more?
                 if (nextCursor < items.length) {
                     // Try adding next item
                     const nextItem = items[nextCursor];
                     currentBatch.push(nextItem);
                     nextCursor++;
                     // Loop continues to measure this new batch
                 } else {
                     // No more items, this is the last chunk
                     isFinalized = true;
                 }
             }
        }

        if (!isCancelled) {
            setChunks(prev => [
                ...prev, 
                {
                    id: currentChunkId,
                    items: currentBatch,
                    sizeBytes: batchSizeBytes,
                    isOptimized: true,
                    isUploading: false,
                    isSynced: false,
                    title: `${bookTitle} (Del ${currentChunkId})`
                }
            ]);
            setOptimizationCursor(nextCursor);
            setOptimizingStatus('');
        }
    };

    // Trigger loop with a small delay to allow UI to breathe
    const timer = setTimeout(processNextStep, 100);
    return () => { isCancelled = true; clearTimeout(timer); };

  }, [itemsHash, optimizationCursor, chunks.length, settings.compressionLevel, settings.maxChunkSizeMB]);


  // --- UPLOAD / SYNC LOGIC (Linear Sync) ---
  useEffect(() => {
      if (!currentBook.driveFolderId) return;

      const sync = async () => {
          // Find first chunk that is optimized but not synced/uploading
          const chunkToSync = chunks.find(c => c.isOptimized && !c.isSynced && !c.isUploading);
          if (!chunkToSync) return;

          setChunks(prev => prev.map(c => c.id === chunkToSync.id ? { ...c, isUploading: true } : c));

          try {
              const pdfBytes = await generateCombinedPDF(accessToken, chunkToSync.items, chunkToSync.title, settings.compressionLevel);
              const blob = new Blob([new Uint8Array(pdfBytes)], { type: 'application/pdf' });
              await uploadToDrive(accessToken, currentBook.driveFolderId!, `${chunkToSync.title}.pdf`, blob);
              
              setChunks(prev => prev.map(c => c.id === chunkToSync.id ? { ...c, isUploading: false, isSynced: true } : c));
          } catch (e) {
              console.error("Upload failed", e);
              // Reset uploading so it retries later (or handle error state)
              setChunks(prev => prev.map(c => c.id === chunkToSync.id ? { ...c, isUploading: false } : c));
          }
      };

      const t = setTimeout(sync, 1000);
      return () => clearTimeout(t);
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

  // --- HELPER FOR UI ---
  const getChunkForItem = (itemId: string) => chunks.find(c => c.items.some(i => i.id === itemId));

  // --- HANDLERS ---
  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = "move";
  };
  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;
    const newItems = [...items];
    const item = newItems[draggedIndex];
    newItems.splice(draggedIndex, 1);
    newItems.splice(index, 0, item);
    onUpdateItems(newItems);
    setDraggedIndex(index);
  };
  const handleSelection = (e: React.MouseEvent, item: DriveFile, index: number) => {
    e.stopPropagation();
    const newSelection = new Set(selectedIds);
    if (e.shiftKey && lastSelectedId) {
        const lastIndex = items.findIndex(i => i.id === lastSelectedId);
        const start = Math.min(lastIndex, index);
        const end = Math.max(lastIndex, index);
        if (!e.metaKey && !e.ctrlKey) newSelection.clear();
        for (let i = start; i <= end; i++) { newSelection.add(items[i].id); }
    } else if (e.metaKey || e.ctrlKey) {
        if (newSelection.has(item.id)) newSelection.delete(item.id);
        else { newSelection.add(item.id); setLastSelectedId(item.id); }
    } else {
        if (!newSelection.has(item.id) || newSelection.size > 1) {
             newSelection.clear(); newSelection.add(item.id); setLastSelectedId(item.id);
        } else { setEditingItem(item); }
    }
    setSelectedIds(newSelection);
  };
  const handleSplitPdf = async (file: DriveFile, index: number) => {
    if (!confirm("Detta kommer dela upp PDF-filen i lösa sidor. Vill du fortsätta?")) return;
    setIsProcessing(true);
    try {
        const { buffer } = await processFileForCache(file, accessToken, 'medium');
        const blob = new Blob([buffer as any], { type: 'application/pdf' });
        const pages = await splitPdfIntoPages(blob, file.name);
        const newItems = [...items];
        newItems.splice(index, 1, ...pages);
        onUpdateItems(newItems);
        setSelectedIds(new Set());
    } catch (e) { console.error(e); alert("Kunde inte dela upp filen."); } 
    finally { setIsProcessing(false); }
  };
  const handleMergeItems = async () => {
    if (selectedIds.size < 2) return;
    if (!confirm(`Vill du slå ihop ${selectedIds.size} filer?`)) return;
    setIsProcessing(true);
    try {
        const itemsToMerge = items.filter(i => selectedIds.has(i.id));
        const firstIndex = items.findIndex(i => i.id === itemsToMerge[0].id);
        const mergedBlob = await mergeFilesToPdf(itemsToMerge, accessToken, settings.compressionLevel);
        const mergedUrl = URL.createObjectURL(mergedBlob);
        const count = await getPdfPageCount(mergedBlob); 
        const thumbUrl = await generatePageThumbnail(mergedBlob, 0);

        const newItem: DriveFile = {
            id: `merged-${Date.now()}`, name: itemsToMerge[0].name + " (Samlad)", type: FileType.PDF,
            size: mergedBlob.size, modifiedTime: new Date().toISOString(), blobUrl: mergedUrl, isLocal: true, 
            pageCount: count, pageMeta: {}, thumbnail: thumbUrl 
        };
        const newItems = [...items];
        const remainingItems = newItems.filter(i => !selectedIds.has(i.id));
        remainingItems.splice(firstIndex, 0, newItem);
        onUpdateItems(remainingItems);
        setSelectedIds(new Set([newItem.id]));
        setLastSelectedId(newItem.id);
    } catch (e) { alert("Kunde inte slå ihop filerna."); } 
    finally { setIsProcessing(false); }
  };
  const handleUpdateItem = (updates: Partial<DriveFile>) => {
    if (!editingItem) return;
    const updated = { ...editingItem, ...updates };
    setEditingItem(updated);
    onUpdateItems(items.map(i => i.id === updated.id ? updated : i));
  };
  const handleInsertAfterSelection = () => {
      const indexes = items.map((item, idx) => selectedIds.has(item.id) ? idx : -1).filter(i => i !== -1);
      const maxIndex = Math.max(...indexes);
      if (maxIndex !== -1) onOpenSourceSelector(maxIndex + 1);
  };

  const filteredItems = activeChunkFilter !== null 
     ? (chunks.find(c => c.id === activeChunkFilter)?.items || [])
     : items;

  if (showShareView) {
      return (
          <FamilySearchExport items={items} bookTitle={bookTitle} accessToken={accessToken} onBack={onCloseShareView} settings={settings} onUpdateItems={onUpdateItems} />
      );
  }

  // --- RENDER HELPERS FOR RIGHT COLUMN ---
  const renderFilesList = (isCompact: boolean) => (
      <>
        <div className={`p-6 bg-slate-50 border-b border-slate-100 ${isCompact ? 'flex justify-center p-4' : ''}`}>
             {!isCompact ? (
                 <>
                    <h2 className="text-xl font-serif font-bold text-slate-900 leading-tight">Filer till FamilySearch</h2>
                    <p className="text-[10px] text-slate-500 font-medium mt-1">
                        {optimizingStatus ? <span className="text-amber-600 animate-pulse"><i className="fas fa-circle-notch fa-spin mr-1"></i> {optimizingStatus}</span> : 'Klar att spara och dela'}
                    </p>
                 </>
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
                 const maxMB = settings.maxChunkSizeMB;
                 const percentFilled = Math.min(100, (sizeMB / maxMB) * 100);

                 if (isCompact) {
                     return (
                         <div 
                            key={chunk.id}
                            onClick={toggleOverlay}
                            className={`w-10 h-10 mx-auto my-2 rounded-full flex items-center justify-center text-xs font-bold shadow-sm cursor-pointer hover:scale-110 transition-transform text-white ${isGreen ? 'bg-emerald-500' : isUploading ? 'bg-indigo-500 animate-pulse' : theme.bg}`}
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
                                     <span className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-black text-white ${isGreen ? 'bg-emerald-500' : theme.bg}`}>
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
                                         <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full uppercase tracking-wider">
                                             <i className="fas fa-check mr-1"></i> Sparad
                                         </span>
                                     ) : isUploading ? (
                                         <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-1 rounded-full uppercase tracking-wider animate-pulse">
                                             <i className="fas fa-sync fa-spin mr-1"></i> Sparar
                                         </span>
                                     ) : (
                                         <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-1 rounded-full uppercase tracking-wider">
                                             Redo
                                         </span>
                                     )}
                                 </div>
                             </div>

                             {/* Storage Meter */}
                             <div className="relative w-full h-3 bg-slate-100 rounded-full overflow-hidden mb-2">
                                 <div 
                                    className={`absolute top-0 left-0 h-full transition-all duration-1000 ${isGreen ? 'bg-emerald-500' : theme.bg}`}
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
      <div className="flex h-full bg-[#f0f2f5] overflow-hidden" onClick={() => setSelectedIds(new Set())}>
         {isProcessing && (
            <div className="fixed inset-0 z-[60] bg-white/80 backdrop-blur-sm flex items-center justify-center">
                <div className="flex flex-col items-center">
                    <i className="fas fa-circle-notch fa-spin text-4xl text-indigo-600 mb-4"></i>
                    <p className="font-bold text-slate-700">Bearbetar...</p>
                </div>
            </div>
         )}
         
         {/* LEFT: INPUT */}
         <div className="flex-1 overflow-y-auto scroll-smooth relative border-r border-slate-200 min-w-[200px]">
             <div className="p-8 pb-32">
                <div className="flex justify-between items-center mb-8">
                    <div className="flex items-center space-x-4 max-w-[80%]">
                        <div className="shrink-0">
                            <AppLogo variant="phase2" className="w-20 h-20" />
                        </div>
                        <div>
                            <h2 className="text-2xl font-serif font-bold text-slate-900 leading-tight break-words whitespace-normal">Berätta kortfattat</h2>
                            <p className="text-sm text-slate-500 font-medium mt-1">Klicka och skriv</p>
                        </div>
                    </div>
                    {activeChunkFilter !== null && (
                        <button onClick={() => setActiveChunkFilter(null)} className="text-xs bg-slate-200 hover:bg-slate-300 px-3 py-1 rounded-full font-bold text-slate-600 shrink-0">
                            Visa alla
                        </button>
                    )}
                </div>

                {/* Toolbar */}
                {selectedIds.size > 0 && (
                    <div className="sticky top-4 z-40 bg-slate-900 text-white px-6 py-3 rounded-xl shadow-2xl flex items-center justify-between animate-in slide-in-from-top-4 mb-6 mx-auto max-w-lg">
                        <span className="font-bold text-sm">{selectedIds.size} valda</span>
                        <div className="flex space-x-4">
                            <button onClick={(e) => { e.stopPropagation(); handleInsertAfterSelection(); }} className="hover:text-emerald-400 font-bold text-xs flex items-center space-x-1"><i className="fas fa-plus-circle"></i> <span>Lägg till</span></button>
                            {selectedIds.size > 1 && <button onClick={handleMergeItems} className="hover:text-indigo-300 font-bold text-xs flex items-center space-x-1"><i className="fas fa-object-group"></i> <span>Slå ihop</span></button>}
                            <button onClick={() => { onUpdateItems(items.filter(i => !selectedIds.has(i.id))); setSelectedIds(new Set()); }} className="hover:text-red-400 font-bold text-xs flex items-center space-x-1"><i className="fas fa-trash"></i> <span>Ta bort</span></button>
                        </div>
                    </div>
                )}

                {/* Tiles Grid */}
                <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 select-none">
                    {/* Add Button */}
                    <button 
                        onClick={() => onOpenSourceSelector(null)}
                        className="aspect-[210/297] rounded-lg border-2 border-dashed border-slate-300 flex flex-col items-center justify-center text-slate-400 hover:text-indigo-600 hover:border-indigo-300 hover:bg-indigo-50/20 transition-all group bg-white"
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
                        // Simplified chunk info for tile
                        const chunkInfo = chunk ? { 
                            chunkIndex: chunk.id, 
                            colorClass: CHUNK_THEMES[(chunk.id - 1) % CHUNK_THEMES.length].bg, 
                            isTooLarge: false 
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
             </div>
         </div>

         {/* RIGHT: OUTPUT (Responsive Container) */}
         <div 
            ref={rightColumnRef} 
            className={`bg-white border-l border-slate-200 shadow-xl z-20 flex flex-col shrink-0 transition-all duration-300 relative ${isSidebarCompact ? 'w-16' : 'w-80'}`}
         >
             {renderFilesList(isSidebarCompact)}

             {/* OVERLAY for Compact Mode Expansion */}
             {isSidebarCompact && showSidebarOverlay && (
                 <div className="absolute top-0 right-full w-80 h-full bg-white border-r border-slate-200 shadow-2xl z-30 flex flex-col animate-in slide-in-from-right-4">
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
        />
      )}
    </>
  );
};

// ... Tile, RichTextListEditor, EditModal, SidebarThumbnail (Unchanged)
const Tile = ({ id, item, index, isSelected, onClick, onEdit, onSplit, onRemove, onDragStart, onDragOver, chunkInfo }: any) => {
  const groupColor = stringToColor(item.id.split('-')[0] + (item.id.split('-')[1] || ''));
  const showSplit = (item.type === FileType.PDF || item.type === FileType.GOOGLE_DOC) && (item.pageCount === undefined || item.pageCount > 1);
  const chunkColor = chunkInfo?.colorClass || 'bg-slate-300'; // Default gray if not chunked yet
  const displaySizeMB = item.processedSize ? (item.processedSize / (1024*1024)).toFixed(2) : ((item.size || 0) / (1024*1024)).toFixed(2);
  const isEdited = item.pageMeta && Object.keys(item.pageMeta).length > 0;
  const isCached = !!item.processedBuffer;

  return (
    <div id={id} className={`group relative aspect-[210/297] bg-white rounded-sm shadow-sm transition-all cursor-pointer transform ${isSelected ? 'ring-4 ring-indigo-500 scale-105 z-10' : 'hover:shadow-xl hover:-translate-y-1'}`} style={{ borderBottom: `4px solid ${groupColor}` }} draggable onDragStart={onDragStart} onDragOver={onDragOver} onClick={onClick}>
       <div className="absolute top-2 left-2 right-2 bottom-20 bg-slate-100 overflow-hidden flex items-center justify-center border border-slate-100 relative">
          <div className="w-full h-full relative overflow-hidden bg-white">
             {item.thumbnail ? (
                 <img src={item.thumbnail} className="w-full h-full object-cover" loading="lazy" />
             ) : item.type === FileType.IMAGE && item.blobUrl ? (
                 <img src={item.blobUrl} className="w-full h-full object-cover" loading="lazy" />
             ) : (item.type === FileType.PDF && item.blobUrl) ? (
                 <iframe src={`${item.blobUrl}#toolbar=0&navpanes=0&scrollbar=0&view=Fit`} className="w-full h-full absolute inset-0 border-none pointer-events-none" title="Preview" scrolling="no" loading="lazy" />
             ) : (
                 <div className="flex flex-col items-center justify-center h-full text-center p-2">
                    <i className={`fas ${item.type === FileType.PDF || item.type === FileType.GOOGLE_DOC ? 'fa-file-pdf text-red-400' : 'fa-file-alt text-slate-400'} text-4xl mb-2`}></i>
                    {item.type === FileType.PDF && <p className="text-[10px] text-slate-400">PDF-dokument</p>}
                 </div>
             )}
             <div className="absolute inset-0 bg-transparent z-10"></div>
          </div>
          {/* Chunk Indicator Dot */}
          <div className="absolute top-2 left-2 flex flex-col gap-1 items-start z-20 pointer-events-none">
              <div className={`w-3 h-3 rounded-full shadow-sm ${chunkColor}`}></div>
          </div>
          <div className={`absolute top-2 right-2 flex flex-col gap-2 transition-opacity z-30 ${isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
              <button onClick={(e) => { e.stopPropagation(); onEdit(); }} className="w-8 h-8 bg-indigo-600 text-white rounded-full shadow-md flex items-center justify-center hover:bg-indigo-700"><i className="fas fa-pen text-xs"></i></button>
              {showSplit && (<button onClick={(e) => { e.stopPropagation(); onSplit(); }} className="w-8 h-8 bg-white rounded-full text-slate-400 hover:text-indigo-600 shadow-md flex items-center justify-center"><i className="fas fa-layer-group text-xs"></i></button>)}
               <button onClick={(e) => { e.stopPropagation(); onRemove(); }} className="w-8 h-8 bg-white rounded-full text-slate-400 hover:text-red-500 shadow-md flex items-center justify-center"><i className="fas fa-trash-alt text-xs"></i></button>
          </div>
          <div className="absolute bottom-0 left-0 right-0 p-1.5 flex justify-between items-end bg-gradient-to-t from-black/60 to-transparent z-20 pointer-events-none">
                <div className="flex gap-1"><span className="bg-black/40 backdrop-blur-sm text-white px-1.5 py-0.5 rounded text-[8px] font-mono border border-white/10">{displaySizeMB} MB</span>{isCached && (<span className="bg-emerald-500/90 text-white px-1.5 py-0.5 text-[8px] font-bold rounded shadow-sm flex items-center"><i className="fas fa-bolt"></i></span>)}</div>
                <div className="flex gap-1">{isEdited && (<span className="bg-indigo-600/90 text-white px-1.5 py-0.5 text-[8px] font-bold uppercase rounded shadow-sm">Redigerad</span>)}{(item.type === FileType.PDF || item.type === FileType.GOOGLE_DOC) && item.pageCount && item.pageCount > 1 && (<span className="bg-slate-800/80 backdrop-blur text-white px-1.5 py-0.5 rounded text-[8px] font-bold shadow-sm">{item.pageCount} sid</span>)}</div>
          </div>
       </div>
       <div className="absolute bottom-0 left-0 right-0 h-20 px-3 py-2 bg-white">
          <p className="text-[10px] font-bold text-slate-400 uppercase truncate mb-1">{item.name}</p>
          <div className="text-[9px] leading-tight text-slate-600 line-clamp-3 font-serif italic opacity-80">{item.description || "Ingen beskrivning..."}</div>
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

const EditModal = ({ item, accessToken, onClose, onUpdate, settings }: any) => {
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
    const handleCopyPageToPng = async () => {
        if (!previewBlob) return;
        try { const pngBlob = await extractHighQualityImage(previewBlob, activePageIndex); const url = URL.createObjectURL(pngBlob); const a = document.createElement('a'); a.href = url; a.download = `${item.name.replace(/\.[^/.]+$/, "")}_Sida${activePageIndex + 1}.png`; a.click(); } catch (e) { alert("Kunde inte spara sidan som bild."); }
    };

    const getActiveConfig = () => { const meta = getCurrentMeta(); const lines = activeSection === 'header' ? meta.headerLines : meta.footerLines; const line = lines.find(l => l.id === focusedLineId); return line?.config || (activeSection === 'header' ? DEFAULT_TEXT_CONFIG : DEFAULT_FOOTER_CONFIG); };
    const updateActiveConfig = (key: keyof TextConfig, value: any) => { const meta = getCurrentMeta(); const isHeader = activeSection === 'header'; const lines = isHeader ? meta.headerLines : meta.footerLines; if (focusedLineId) { const newLines = lines.map(l => l.id === focusedLineId ? { ...l, config: { ...l.config, [key]: value } } : l); updateCurrentMeta(isHeader ? { headerLines: newLines } : { footerLines: newLines }); } else { const newLines = lines.map(l => ({ ...l, config: { ...l.config, [key]: value } })); updateCurrentMeta(isHeader ? { headerLines: newLines } : { footerLines: newLines }); } };
    const currentConfig = getActiveConfig();

    return (
        <div className="fixed inset-0 z-[100] bg-slate-900 flex flex-col animate-in fade-in duration-200">
            <div className="bg-slate-800 text-white h-14 flex items-center justify-between px-4 border-b border-slate-700 shrink-0">
                <div className="flex items-center space-x-4"><button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="text-slate-300 hover:text-white"><i className="fas fa-bars text-lg"></i></button><span className="font-bold text-sm truncate max-w-[200px]">{item.name}</span></div>
                <div className="flex items-center space-x-2"><span className="text-xs text-slate-400 mr-2">{activePageIndex + 1} / {totalPages}</span><button onClick={() => setActivePageIndex(Math.max(0, activePageIndex - 1))} disabled={activePageIndex === 0} className="w-8 h-8 rounded hover:bg-slate-700 disabled:opacity-30"><i className="fas fa-chevron-left"></i></button><button onClick={() => setActivePageIndex(Math.min(totalPages - 1, activePageIndex + 1))} disabled={activePageIndex === totalPages - 1} className="w-8 h-8 rounded hover:bg-slate-700 disabled:opacity-30"><i className="fas fa-chevron-right"></i></button></div>
                <div className="flex items-center space-x-3"><button onClick={handleCopyPageToPng} className="bg-emerald-600 hover:bg-emerald-500 px-3 py-1.5 rounded text-xs font-bold transition-colors flex items-center space-x-2 shadow-lg"><i className="fas fa-file-image"></i><span>Spara bild (PNG)</span></button><button onClick={onClose} className="bg-indigo-600 hover:bg-indigo-500 px-4 py-1.5 rounded text-xs font-bold transition-colors">Klar</button></div>
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
