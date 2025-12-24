
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { DriveFile, FileType, TextConfig, RichTextLine, PageMetadata, AppSettings, MemoryBook } from '../types';
import { generateCombinedPDF, splitPdfIntoPages, mergeFilesToPdf, createPreviewWithOverlay, getPdfPageCount, DEFAULT_TEXT_CONFIG, DEFAULT_FOOTER_CONFIG, calculateChunks, getPdfDocument, renderPdfPageToCanvas, extractHighQualityImage, processFileForCache } from '../services/pdfService';
import { uploadToDrive } from '../services/driveService';
import FamilySearchExport from './FamilySearchExport';

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

const CHUNK_COLORS = [
    'bg-indigo-600',
    'bg-emerald-600',
    'bg-amber-600',
    'bg-rose-600',
    'bg-cyan-600'
];

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
  const [precision, setPrecision] = useState(0);
  const [statusMessage, setStatusMessage] = useState<string>('');

  // Sync State
  const [syncedHashes, setSyncedHashes] = useState<Map<number, string>>(new Map());
  const [syncStatus, setSyncStatus] = useState<Record<number, 'synced' | 'uploading' | 'dirty' | 'waiting'>>({});

  // --- 1. CONTINUOUS OPTIMIZATION LOOP ---
  useEffect(() => {
     let isCancelled = false;
     
     const processQueue = async () => {
         if (isCancelled) return;
         
         // Find ONE item that needs processing (Image or PDF without page count)
         const itemToProcess = items.find(item => 
             (item.type === FileType.IMAGE && (!item.processedBuffer || item.compressionLevelUsed !== settings.compressionLevel)) ||
             (item.type === FileType.PDF && item.pageCount === undefined)
         );

         if (!itemToProcess) {
             if (statusMessage.startsWith("Optimerar")) setStatusMessage(""); 
             return;
         }

         setStatusMessage(`Optimerar: ${itemToProcess.name}...`);

         try {
            const { buffer, size } = await processFileForCache(itemToProcess, accessToken, settings.compressionLevel);
            
            // If it's a PDF, also count pages
            let pageCount = itemToProcess.pageCount;
            if (itemToProcess.type === FileType.PDF && !pageCount) {
                pageCount = await getPdfPageCount(new Blob([buffer as any], {type: 'application/pdf'}));
            }

            if (!isCancelled) {
                onUpdateItems((prevItems: DriveFile[]) => prevItems.map(prev => 
                    prev.id === itemToProcess.id 
                    ? { 
                        ...prev, 
                        processedBuffer: buffer, 
                        processedSize: size, 
                        compressionLevelUsed: settings.compressionLevel,
                        pageCount: pageCount
                      }
                    : prev
                ));
            }
         } catch (e) { 
             console.error("Optimization failed for", itemToProcess.name);
             // Mark as processed (but failed) to avoid infinite loop
             // In a real app we might want an 'error' state on the item
         }
     };

     // Calculate Precision
     const images = items.filter(i => i.type === FileType.IMAGE);
     if (images.length === 0) setPrecision(100);
     else {
        const processed = images.filter(i => i.processedSize && i.compressionLevelUsed === settings.compressionLevel);
        const p = Math.round((processed.length / images.length) * 100);
        setPrecision(p);
     }

     const timer = setTimeout(processQueue, 500); // 500ms delay between items
     return () => { isCancelled = true; clearTimeout(timer); };
  }, [items, settings.compressionLevel, accessToken]); 

  // --- 2. CHUNK CALCULATION ---
  const { chunkMap, chunkList } = useMemo(() => {
      const chunks = calculateChunks(items, bookTitle, settings.maxChunkSizeMB, settings.compressionLevel, settings.safetyMarginPercent);
      const map = new Map<string, { chunkIndex: number, isStart: boolean, isTooLarge: boolean, title: string, isFullyOptimized: boolean }>();
      const effectiveLimit = settings.maxChunkSizeMB * (1 - (settings.safetyMarginPercent / 100));

      chunks.forEach((chunk, cIdx) => {
          chunk.items.forEach((item, iIdx) => {
              const multiplier = item.type === FileType.IMAGE ? 1.0 : 1.0; 
              const sizeMB = ((item.processedSize || item.size || 0) * multiplier) / (1024 * 1024);
              const isTooLarge = sizeMB > effectiveLimit;
              map.set(item.id, { chunkIndex: cIdx, isStart: iIdx === 0, isTooLarge, title: chunk.title, isFullyOptimized: chunk.isFullyOptimized });
          });
      });
      return { chunkMap: map, chunkList: chunks };
  }, [items, bookTitle, settings.maxChunkSizeMB, settings.compressionLevel, settings.safetyMarginPercent]);

  // --- 3. STRICT SYNC LOGIC ---
  useEffect(() => {
      if (!currentBook.driveFolderId) return;

      const syncChunks = async () => {
          for (const chunk of chunkList) {
              const partNum = chunk.partNumber;
              const lastHash = syncedHashes.get(partNum);
              
              // NEW LOGIC: Sync if content changed, even if not fully optimized (Draft Sync), but prioritize full optimization
              // If it's the first time syncing this chunk, do it immediately (Draft)
              // If we have synced before, only re-sync if fully optimized or if content drastically changed?
              // Let's keep it simple: Sync if hash changed. Hash includes optimization state.
              // So if an item gets optimized, the hash changes, triggering a re-sync.
              
              const isReadyToUpload = syncStatus[partNum] !== 'uploading';

              if (isReadyToUpload && chunk.contentHash !== lastHash) {
                  
                  setSyncStatus(prev => ({ ...prev, [partNum]: 'uploading' }));
                  setStatusMessage(chunk.isFullyOptimized ? `Synkar slutgiltig PDF: ${chunk.title}...` : `Sparar utkast: ${chunk.title}...`);
                  
                  try {
                      const pdfBytes = await generateCombinedPDF(accessToken, chunk.items, chunk.title, settings.compressionLevel);
                      const blob = new Blob([new Uint8Array(pdfBytes)], { type: 'application/pdf' });
                      
                      await uploadToDrive(accessToken, currentBook.driveFolderId!, `${chunk.title}.pdf`, blob);
                      
                      setSyncedHashes(prev => new Map(prev).set(partNum, chunk.contentHash));
                      setSyncStatus(prev => ({ ...prev, [partNum]: 'synced' }));
                      setStatusMessage(`Sparad: ${chunk.title}`);
                  } catch (e) {
                      console.error(`Failed to sync ${chunk.title}`, e);
                      setSyncStatus(prev => ({ ...prev, [partNum]: 'dirty' }));
                      setStatusMessage(`Fel vid sparning: ${chunk.title}`);
                  }
                  
                  // Wait a bit before next chunk to not flood network
                  await new Promise(r => setTimeout(r, 1000));
              } 
          }
          // Clear status if nothing is happening
          const uploading = Object.values(syncStatus).some(s => s === 'uploading');
          if (!uploading && statusMessage.startsWith("Sparar")) setStatusMessage("");
      };

      const t = setTimeout(syncChunks, 2000); // 2s debounce
      return () => clearTimeout(t);
  }, [chunkList, currentBook.driveFolderId, syncedHashes, settings.compressionLevel, bookTitle]);

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
        const newItem: DriveFile = {
            id: `merged-${Date.now()}`, name: itemsToMerge[0].name + " (Samlad)", type: FileType.PDF,
            size: mergedBlob.size, modifiedTime: new Date().toISOString(), blobUrl: mergedUrl, isLocal: true, pageCount: count, pageMeta: {}, 
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
  const isAnyUploading = Object.values(syncStatus).some(s => s === 'uploading');

  if (showShareView) {
      return (
          <FamilySearchExport items={items} bookTitle={bookTitle} accessToken={accessToken} onBack={onCloseShareView} settings={settings} onUpdateItems={onUpdateItems} />
      );
  }

  return (
    <>
      <div className="h-full overflow-y-auto bg-[#f0f2f5] scroll-smooth relative" onClick={() => setSelectedIds(new Set())}>
         {isProcessing && (
            <div className="fixed inset-0 z-50 bg-white/80 backdrop-blur-sm flex items-center justify-center">
                <div className="flex flex-col items-center">
                    <i className="fas fa-circle-notch fa-spin text-4xl text-indigo-600 mb-4"></i>
                    <p className="font-bold text-slate-700">Bearbetar...</p>
                </div>
            </div>
         )}
         
         <div className="pb-48 px-4 max-w-7xl mx-auto pt-8">
            {selectedIds.size > 0 && (
                <div className="fixed bottom-24 left-1/2 transform -translate-x-1/2 bg-slate-900 text-white px-6 py-3 rounded-full shadow-2xl z-40 flex items-center space-x-4 animate-in slide-in-from-bottom-4">
                    <span className="font-bold text-sm whitespace-nowrap">{selectedIds.size} valda</span>
                    <div className="h-4 w-px bg-slate-700"></div>
                    <button onClick={(e) => { e.stopPropagation(); handleInsertAfterSelection(); }} className="hover:text-emerald-400 font-bold text-xs flex items-center space-x-1 whitespace-nowrap"><i className="fas fa-plus-circle"></i> <span>Lägg till</span></button>
                    {selectedIds.size > 1 && <button onClick={handleMergeItems} className="hover:text-indigo-300 font-bold text-xs flex items-center space-x-1 whitespace-nowrap"><i className="fas fa-object-group"></i> <span>Slå ihop</span></button>}
                    <button onClick={() => { onUpdateItems(items.filter(i => !selectedIds.has(i.id))); setSelectedIds(new Set()); }} className="hover:text-red-400 font-bold text-xs flex items-center space-x-1 whitespace-nowrap"><i className="fas fa-trash"></i> <span>Ta bort</span></button>
                    <button onClick={() => setSelectedIds(new Set())} className="ml-2 hover:text-slate-300"><i className="fas fa-times"></i></button>
                </div>
            )}

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6 select-none">
            {items.map((item, index) => {
                const chunkInfo = chunkMap.get(item.id);
                return (
                    <Tile 
                        key={item.id} id={`tile-${item.id}`} item={item} index={index}
                        isSelected={selectedIds.has(item.id)}
                        onClick={(e: React.MouseEvent) => handleSelection(e, item, index)}
                        onEdit={() => setEditingItem(item)}
                        onSplit={() => handleSplitPdf(item, index)}
                        onRemove={() => onUpdateItems(items.filter(i => i.id !== item.id))}
                        onDragStart={(e: any) => handleDragStart(e, index)}
                        onDragOver={(e: any) => handleDragOver(e, index)}
                        chunkInfo={chunkInfo}
                    />
                );
            })}
            <button 
                onClick={() => onOpenSourceSelector(null)}
                className="aspect-[210/297] rounded-lg border-2 border-dashed border-slate-200 flex flex-col items-center justify-center text-slate-300 hover:text-indigo-600 hover:border-indigo-300 hover:bg-indigo-50/20 transition-all group"
            >
                <div className="w-12 h-12 rounded-full bg-slate-50 group-hover:bg-white group-hover:shadow-md flex items-center justify-center mb-2 transition-all"><i className="fas fa-plus text-xl"></i></div>
                <span className="text-xs font-bold uppercase tracking-wider">Lägg till sida</span>
            </button>
            </div>
         </div>

         {/* STATUS FOOTER */}
         <div className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-md border-t border-slate-200 p-2 z-30 flex items-center justify-between px-6 shadow-lg">
             <div className="flex items-center space-x-4">
                 <div className="flex flex-col">
                    <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Antal delar (FamilySearch)</span>
                    <span className="text-sm font-bold text-indigo-600">{chunkList.length} st filer</span>
                 </div>
                 
                 {/* Detail Status Text */}
                 {statusMessage ? (
                    <div className="flex items-center space-x-2 bg-indigo-50 px-3 py-1 rounded-full border border-indigo-100 animate-in fade-in">
                        <i className="fas fa-circle-notch fa-spin text-indigo-500 text-xs"></i>
                        <span className="text-[10px] font-bold text-indigo-700 uppercase tracking-wide truncate max-w-[200px]">{statusMessage}</span>
                    </div>
                 ) : precision < 100 ? (
                     <div className="hidden sm:flex items-center space-x-2 bg-amber-50 px-3 py-1 rounded-full border border-amber-100">
                         <i className="fas fa-hourglass-half text-amber-500 text-xs"></i>
                         <span className="text-[10px] font-bold text-amber-700 uppercase tracking-wide">Väntar på optimering: {precision}%</span>
                     </div>
                 ) : (
                     <div className="hidden sm:flex items-center space-x-2 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-100">
                         <i className="fas fa-check text-emerald-500 text-xs"></i>
                         <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wide">Alla filer klara</span>
                     </div>
                 )}

                 {isAnyUploading ? (
                     <div className="flex items-center space-x-2 bg-blue-50 px-3 py-1 rounded-full border border-blue-100">
                         <i className="fas fa-cloud-upload-alt text-blue-500 animate-bounce text-xs"></i>
                         <span className="text-[10px] font-bold text-blue-700 uppercase tracking-wide">Sparar till: {bookTitle}</span>
                     </div>
                 ) : (
                     <div className="hidden sm:flex items-center space-x-2 opacity-50">
                         <i className="fas fa-cloud text-slate-400 text-xs"></i>
                         <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Sparat i molnet</span>
                     </div>
                 )}
             </div>
             <div className="flex items-center space-x-2">
                 {chunkList.length > 1 && (
                     <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-1 rounded">
                         <i className="fas fa-info-circle mr-1"></i>
                         Delas automatiskt vid {settings.maxChunkSizeMB} MB
                     </span>
                 )}
             </div>
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

// ... SidebarThumbnail ...
const SidebarThumbnail = ({ pdfDocProxy, pageIndex }: { pdfDocProxy: any, pageIndex: number }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    useEffect(() => { const render = async () => { if (!pdfDocProxy || !canvasRef.current) return; try { await renderPdfPageToCanvas(pdfDocProxy, pageIndex + 1, canvasRef.current, 0.2); } catch (e) { console.error("Thumb render error", e); } }; render(); }, [pdfDocProxy, pageIndex]);
    return <canvas ref={canvasRef} className="w-full h-full object-contain" />;
};

interface TileProps {
  id: string;
  item: DriveFile;
  index: number;
  isSelected: boolean;
  onClick: (e: React.MouseEvent) => void;
  onEdit: () => void;
  onSplit: () => void;
  onRemove: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  chunkInfo?: { chunkIndex: number, isStart: boolean, isTooLarge: boolean, title: string, isFullyOptimized: boolean };
}

const Tile: React.FC<TileProps> = ({ id, item, index, isSelected, onClick, onEdit, onSplit, onRemove, onDragStart, onDragOver, chunkInfo }) => {
    const chunkColor = chunkInfo ? CHUNK_COLORS[chunkInfo.chunkIndex % CHUNK_COLORS.length] : 'bg-slate-200';
    
    return (
        <div 
            id={id}
            draggable
            onDragStart={onDragStart}
            onDragOver={onDragOver}
            onClick={onClick}
            className={`
                relative aspect-[210/297] bg-white rounded-lg shadow-sm group transition-all cursor-pointer overflow-hidden border
                ${isSelected ? 'ring-4 ring-indigo-500 border-indigo-500 transform scale-[1.02] z-10' : 'border-slate-200 hover:shadow-lg hover:border-slate-300'}
                ${chunkInfo?.isTooLarge ? 'ring-2 ring-red-500' : ''}
            `}
        >
             {/* Chunk Indicator Strip */}
             <div className={`absolute top-0 left-0 right-0 h-1.5 ${chunkColor} z-20`} title={chunkInfo?.title}></div>
             
             {/* Main Content */}
             <div className="h-full w-full flex flex-col">
                 <div className="flex-1 relative overflow-hidden bg-slate-50 flex items-center justify-center">
                    {item.type === FileType.IMAGE && item.blobUrl ? (
                        <img src={item.blobUrl} alt={item.name} className="w-full h-full object-cover" />
                    ) : item.type === FileType.IMAGE && item.thumbnail ? (
                        <img src={item.thumbnail} alt={item.name} className="w-full h-full object-cover" />
                    ) : (
                        <div className="flex flex-col items-center justify-center p-4 text-center">
                            <i className={`fas ${item.type === FileType.PDF ? 'fa-file-pdf text-red-400' : 'fa-file-alt text-slate-400'} text-4xl mb-2`}></i>
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{item.type}</span>
                        </div>
                    )}
                    
                    {/* Overlay Actions */}
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                        <button onClick={(e) => { e.stopPropagation(); onEdit(); }} className="w-8 h-8 bg-white rounded-full flex items-center justify-center text-slate-900 hover:bg-indigo-600 hover:text-white transition-colors" title="Redigera">
                            <i className="fas fa-pen"></i>
                        </button>
                        {item.type === FileType.PDF && (
                             <button onClick={(e) => { e.stopPropagation(); onSplit(); }} className="w-8 h-8 bg-white rounded-full flex items-center justify-center text-slate-900 hover:bg-amber-500 hover:text-white transition-colors" title="Dela upp sidor">
                                <i className="fas fa-cut"></i>
                             </button>
                        )}
                        <button onClick={(e) => { e.stopPropagation(); onRemove(); }} className="w-8 h-8 bg-white rounded-full flex items-center justify-center text-slate-900 hover:bg-red-500 hover:text-white transition-colors" title="Ta bort">
                            <i className="fas fa-trash"></i>
                        </button>
                    </div>

                    {isSelected && (
                        <div className="absolute top-3 right-3 w-6 h-6 bg-indigo-600 rounded-full flex items-center justify-center shadow-sm z-20">
                            <i className="fas fa-check text-white text-[10px]"></i>
                        </div>
                    )}
                 </div>
                 
                 {/* Footer info */}
                 <div className="px-3 py-2 bg-white border-t border-slate-100 h-14 flex flex-col justify-center">
                    <p className="text-[10px] font-bold text-slate-700 truncate mb-0.5">{item.name}</p>
                    <div className="flex justify-between items-center text-[9px] text-slate-400 font-medium">
                        <span>{item.pageCount ? `${item.pageCount} sid` : (item.size / (1024*1024)).toFixed(1) + ' MB'}</span>
                        {item.headerText && <i className="fas fa-heading text-indigo-400" title="Har rubrik"></i>}
                        {item.description && <i className="fas fa-align-left text-indigo-400 ml-1" title="Har text"></i>}
                    </div>
                 </div>
             </div>
        </div>
    );
};

interface EditModalProps {
    item: DriveFile;
    accessToken: string;
    onClose: () => void;
    onUpdate: (updates: Partial<DriveFile>) => void;
    settings: AppSettings;
}

const EditModal: React.FC<EditModalProps> = ({ item, accessToken, onClose, onUpdate, settings }) => {
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [headerText, setHeaderText] = useState(item.headerText || '');
    const [description, setDescription] = useState(item.description || '');
    const [loading, setLoading] = useState(false);

    // Refresh preview when text changes (debounced)
    useEffect(() => {
        const timer = setTimeout(async () => {
            if (item.type === FileType.IMAGE || item.type === FileType.PDF) {
                setLoading(true);
                try {
                    // Create a temp item with current text for preview generation
                    const tempItem = { ...item, headerText, description };
                    // We need the blob to generate preview
                    const { buffer } = await processFileForCache(item, accessToken, 'medium'); // Use medium for preview speed
                    const blob = new Blob([buffer as any], { type: item.type === FileType.IMAGE ? 'image/jpeg' : 'application/pdf' });
                    
                    const url = await createPreviewWithOverlay(blob, item.type, { 
                        0: { 
                            headerLines: headerText ? [{ id: 'h1', text: headerText, config: item.textConfig || DEFAULT_TEXT_CONFIG }] : [], 
                            footerLines: description ? [{ id: 'f1', text: description, config: DEFAULT_FOOTER_CONFIG }] : [] 
                        } 
                    });
                    setPreviewUrl(url);
                } catch (e) {
                    console.error("Preview failed", e);
                } finally {
                    setLoading(false);
                }
            }
        }, 800);
        return () => clearTimeout(timer);
    }, [headerText, description, item, accessToken]);

    const handleSave = () => {
        onUpdate({ headerText, description });
        onClose();
    };

    return (
        <div className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl w-full max-w-5xl h-[90vh] flex overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
                {/* Left: Preview */}
                <div className="w-1/2 bg-slate-100 flex items-center justify-center p-8 relative">
                    {loading && (
                        <div className="absolute top-4 right-4 bg-white/80 px-3 py-1 rounded-full text-xs font-bold text-indigo-600 shadow-sm z-10">
                            <i className="fas fa-sync fa-spin mr-2"></i> Uppdaterar förhandsvisning...
                        </div>
                    )}
                    <div className="bg-white shadow-xl max-h-full aspect-[210/297] overflow-hidden">
                        {previewUrl ? (
                            <iframe src={previewUrl + '#toolbar=0&navpanes=0&scrollbar=0'} className="w-full h-full border-none" title="Preview" />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center">
                                <i className="fas fa-spinner fa-spin text-4xl text-slate-300"></i>
                            </div>
                        )}
                    </div>
                </div>

                {/* Right: Controls */}
                <div className="w-1/2 flex flex-col bg-white">
                    <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                        <div>
                             <h3 className="text-xl font-bold text-slate-900">Redigera sida</h3>
                             <p className="text-xs text-slate-500">{item.name}</p>
                        </div>
                        <button onClick={onClose} className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors">
                            <i className="fas fa-times text-lg"></i>
                        </button>
                    </div>
                    
                    <div className="flex-1 overflow-y-auto p-8 space-y-8">
                        <div>
                            <label className="block text-sm font-bold text-slate-700 mb-2 uppercase tracking-wide">Rubrik (Överst)</label>
                            <input 
                                type="text" 
                                value={headerText} 
                                onChange={(e) => setHeaderText(e.target.value)} 
                                className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50 transition-all font-serif text-lg outline-none"
                                placeholder="t.ex. Sommarstugan 1952"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-slate-700 mb-2 uppercase tracking-wide">Beskrivning (Nederst)</label>
                            <textarea 
                                value={description} 
                                onChange={(e) => setDescription(e.target.value)} 
                                rows={6}
                                className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50 transition-all text-sm leading-relaxed outline-none resize-none"
                                placeholder="Berätta mer om bilden eller dokumentet..."
                            />
                        </div>

                        {/* Formatting info */}
                        <div className="bg-indigo-50 rounded-xl p-4 flex items-start gap-3">
                             <i className="fas fa-lightbulb text-indigo-500 mt-1"></i>
                             <div className="text-xs text-indigo-900 leading-relaxed">
                                 <strong>Tips:</strong> Texten kommer att "brännas in" på sidan när boken exporteras. Rubriken hamnar högst upp och beskrivningen längst ner på sidan.
                             </div>
                        </div>
                    </div>

                    <div className="p-6 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
                        <button onClick={onClose} className="px-6 py-3 rounded-xl font-bold text-slate-600 hover:bg-white hover:shadow-sm border border-transparent hover:border-slate-200 transition-all">
                            Avbryt
                        </button>
                        <button onClick={handleSave} className="px-8 py-3 rounded-xl font-bold text-white bg-slate-900 hover:bg-indigo-600 shadow-lg hover:shadow-indigo-200 hover:-translate-y-0.5 transition-all">
                            Spara ändringar
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default StoryEditor;
