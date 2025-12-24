
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { PDFDocument } from 'pdf-lib';
import { DriveFile, FileType, TextConfig, RichTextLine, PageMetadata, AppSettings, MemoryBook } from '../types';
import { generateCombinedPDF, splitPdfIntoPages, mergeFilesToPdf, createPreviewWithOverlay, getPdfPageCount, DEFAULT_TEXT_CONFIG, DEFAULT_FOOTER_CONFIG, calculateChunks, getPdfDocument, renderPdfPageToCanvas, extractHighQualityImage, processFileForCache } from '../services/pdfService';
import { fetchFileBlob, createFolder, uploadToDrive, fetchDriveFiles } from '../services/driveService';
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
  currentBook: MemoryBook; // Using full book object now
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

  // Sync State
  const [syncedHashes, setSyncedHashes] = useState<Map<number, string>>(new Map());
  const [syncStatus, setSyncStatus] = useState<Record<number, 'synced' | 'uploading' | 'dirty' | 'waiting'>>({});

  // --- HYBRID CACHING & PROCESSING ---
  useEffect(() => {
     let isCancelled = false;
     const processQueue = async () => {
         if (isCancelled) return;
         
         const idsToProcess = new Set<string>();
         if (editingItem) idsToProcess.add(editingItem.id);
         selectedIds.forEach(id => idsToProcess.add(id));

         // Add neighbors
         items.forEach((item, index) => {
             if (selectedIds.has(item.id) || (editingItem && editingItem.id === item.id)) {
                 if (index > 0) idsToProcess.add(items[index - 1].id);
                 if (index < items.length - 1) idsToProcess.add(items[index + 1].id);
             }
         });

         let itemToProcess = items.find(item => 
             idsToProcess.has(item.id) && item.type === FileType.IMAGE && 
             (!item.processedBuffer || item.compressionLevelUsed !== settings.compressionLevel)
         );

         if (!itemToProcess) {
             itemToProcess = items.find(item => item.type === FileType.IMAGE && 
                 (!item.processedBuffer || item.compressionLevelUsed !== settings.compressionLevel)
             );
         }

         if (!itemToProcess) return;

         try {
            const { buffer, size } = await processFileForCache(itemToProcess, accessToken, settings.compressionLevel);
            if (!isCancelled) {
                onUpdateItems((prevItems: DriveFile[]) => prevItems.map(prev => 
                    prev.id === itemToProcess!.id 
                    ? { ...prev, processedBuffer: buffer, processedSize: size, compressionLevelUsed: settings.compressionLevel }
                    : prev
                ));
            }
         } catch (e) { console.error("Background processing failed for", itemToProcess.name); }
     };

     const images = items.filter(i => i.type === FileType.IMAGE);
     if (images.length === 0) setPrecision(100);
     else {
        const processed = images.filter(i => i.processedSize && i.compressionLevelUsed === settings.compressionLevel);
        const p = Math.round((processed.length / images.length) * 100);
        setPrecision(p);
     }

     const timer = setTimeout(processQueue, 100);
     return () => { isCancelled = true; clearTimeout(timer); };
  }, [items, selectedIds, editingItem, settings.compressionLevel]);

  // Calculate chunks
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

  // --- STRICT SYNC LOGIC (USES BOOK FOLDER ID) ---
  useEffect(() => {
      if (!currentBook.driveFolderId) return;

      const syncChunks = async () => {
          for (const chunk of chunkList) {
              const partNum = chunk.partNumber;
              const lastHash = syncedHashes.get(partNum);
              
              if (chunk.isFullyOptimized && chunk.contentHash !== lastHash && syncStatus[partNum] !== 'uploading') {
                  
                  setSyncStatus(prev => ({ ...prev, [partNum]: 'uploading' }));
                  
                  try {
                      const pdfBytes = await generateCombinedPDF(accessToken, chunk.items, chunk.title, settings.compressionLevel);
                      const blob = new Blob([new Uint8Array(pdfBytes)], { type: 'application/pdf' });
                      
                      // UPLOAD TO SPECIFIC FOLDER
                      await uploadToDrive(accessToken, currentBook.driveFolderId!, `${chunk.title}.pdf`, blob);
                      
                      setSyncedHashes(prev => new Map(prev).set(partNum, chunk.contentHash));
                      setSyncStatus(prev => ({ ...prev, [partNum]: 'synced' }));
                  } catch (e) {
                      console.error(`Failed to sync ${chunk.title}`, e);
                      setSyncStatus(prev => ({ ...prev, [partNum]: 'dirty' }));
                  }
              } else if (!chunk.isFullyOptimized) {
                   setSyncStatus(prev => ({ ...prev, [partNum]: 'waiting' }));
              }
          }
      };

      const t = setTimeout(syncChunks, 3000);
      return () => clearTimeout(t);
  }, [chunkList, currentBook.driveFolderId, syncedHashes, settings.compressionLevel, bookTitle]);

  // ... (Rest of component methods remain similar, just checking currentBook state)
  
  // Background check for page counts
  useEffect(() => {
    const updatePageCounts = async () => {
        let hasUpdates = false;
        const newItems = [...items];
        for (let i = 0; i < newItems.length; i++) {
            const item = newItems[i];
            if (item.type === FileType.PDF && item.pageCount === undefined) {
                try {
                    const { buffer } = await processFileForCache(item, accessToken, 'medium'); // Use cache processor
                    const blob = new Blob([buffer], { type: 'application/pdf' });
                    const count = await getPdfPageCount(blob);
                    if (item.pageCount !== count) {
                        newItems[i] = { ...item, pageCount: count };
                        hasUpdates = true;
                    }
                } catch (e) { console.error("Page count check failed", e); }
            }
        }
        if (hasUpdates) onUpdateItems(newItems);
    };
    const t = setTimeout(updatePageCounts, 1000);
    return () => clearTimeout(t);
  }, [items.length]);

  // ... (Keyboard, Drag, Selection, Split, Merge methods - Unchanged)
  
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
        const blob = new Blob([buffer], { type: 'application/pdf' });
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
         <div className="fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-sm border-t border-slate-200 p-2 z-30 flex items-center justify-between px-6">
             <div className="flex items-center space-x-4">
                 <div className="flex flex-col">
                    <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Antal delar (FamilySearch)</span>
                    <span className="text-sm font-bold text-indigo-600">{chunkList.length} st filer</span>
                 </div>
                 
                 {precision < 100 ? (
                     <div className="hidden sm:flex items-center space-x-2 bg-amber-50 px-3 py-1 rounded-full border border-amber-100">
                         <i className="fas fa-circle-notch fa-spin text-amber-500 text-xs"></i>
                         <span className="text-[10px] font-bold text-amber-700 uppercase tracking-wide">AI-optimering: {precision}%</span>
                     </div>
                 ) : (
                     <div className="hidden sm:flex items-center space-x-2 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-100">
                         <i className="fas fa-check text-emerald-500 text-xs"></i>
                         <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wide">Optimerat & Klart</span>
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

// ... (Tile component same as before)
const Tile = ({ id, item, index, isSelected, onClick, onEdit, onSplit, onRemove, onDragStart, onDragOver, chunkInfo }: any) => {
  const groupColor = stringToColor(item.id.split('-')[0] + (item.id.split('-')[1] || ''));
  const showSplit = item.type === FileType.PDF && (item.pageCount === undefined || item.pageCount > 1);
  const chunkColor = CHUNK_COLORS[(chunkInfo?.chunkIndex || 0) % CHUNK_COLORS.length];
  const displaySizeMB = item.processedSize ? (item.processedSize / (1024*1024)).toFixed(2) : ((item.size || 0) / (1024*1024)).toFixed(2);
  const isEdited = item.pageMeta && Object.keys(item.pageMeta).length > 0;
  const isCached = !!item.processedBuffer;

  return (
    <div id={id} className={`group relative aspect-[210/297] bg-white rounded-sm shadow-sm transition-all cursor-pointer transform ${isSelected ? 'ring-4 ring-indigo-500 scale-105 z-10' : 'hover:shadow-xl hover:-translate-y-1'}`} style={{ borderBottom: `4px solid ${groupColor}` }} draggable onDragStart={onDragStart} onDragOver={onDragOver} onClick={onClick}>
       <div className="absolute top-2 left-2 right-2 bottom-20 bg-slate-100 overflow-hidden flex items-center justify-center border border-slate-100 relative">
          {(item.type === FileType.PDF && item.blobUrl) || (item.type === FileType.IMAGE && item.blobUrl) ? (
             <div className="w-full h-full relative overflow-hidden bg-white">
                {item.type === FileType.PDF ? (
                    <iframe src={`${item.blobUrl}#toolbar=0&navpanes=0&scrollbar=0&view=Fit`} className="w-full h-full absolute inset-0 border-none pointer-events-none" title="Preview" scrolling="no" loading="lazy" />
                ) : ( <img src={item.blobUrl} className="w-full h-full object-cover" /> )}
                <div className="absolute inset-0 bg-transparent z-10"></div>
             </div>
          ) : item.type === FileType.IMAGE && item.thumbnail ? (
             <img src={item.thumbnail} className="w-full h-full object-cover" />
          ) : (
             <div className="text-center p-2"><i className={`fas ${item.type === FileType.PDF ? 'fa-file-pdf text-red-400' : 'fa-file-alt text-slate-400'} text-4xl mb-2`}></i>{item.type === FileType.PDF && <p className="text-[10px] text-slate-400">PDF-dokument</p>}</div>
          )}
          
          <div className="absolute top-2 left-2 flex flex-col gap-1 items-start z-20 pointer-events-none">
              <div className={`px-2 py-1 ${chunkColor} text-white rounded-md flex items-center justify-center text-[10px] font-bold shadow-sm`}>
                 <span className="opacity-75 mr-1 text-[9px]">Del {(chunkInfo?.chunkIndex || 0) + 1}</span><span>#{index + 1}</span>
              </div>
              {chunkInfo?.isTooLarge && (<div className="w-6 h-6 bg-red-500 rounded-full flex items-center justify-center shadow-lg animate-pulse" title="För stor"><i className="fas fa-exclamation text-white text-[10px]"></i></div>)}
          </div>
          <div className={`absolute top-2 right-2 flex flex-col gap-2 transition-opacity z-30 ${isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
              <button onClick={(e) => { e.stopPropagation(); onEdit(); }} className="w-8 h-8 bg-indigo-600 text-white rounded-full shadow-md flex items-center justify-center hover:bg-indigo-700"><i className="fas fa-pen text-xs"></i></button>
              {showSplit && (<button onClick={(e) => { e.stopPropagation(); onSplit(); }} className="w-8 h-8 bg-white rounded-full text-slate-400 hover:text-indigo-600 shadow-md flex items-center justify-center"><i className="fas fa-layer-group text-xs"></i></button>)}
               <button onClick={(e) => { e.stopPropagation(); onRemove(); }} className="w-8 h-8 bg-white rounded-full text-slate-400 hover:text-red-500 shadow-md flex items-center justify-center"><i className="fas fa-trash-alt text-xs"></i></button>
          </div>
          <div className="absolute bottom-0 left-0 right-0 p-1.5 flex justify-between items-end bg-gradient-to-t from-black/60 to-transparent z-20 pointer-events-none">
                <div className="flex gap-1"><span className="bg-black/40 backdrop-blur-sm text-white px-1.5 py-0.5 rounded text-[8px] font-mono border border-white/10">{displaySizeMB} MB</span>{isCached && (<span className="bg-emerald-500/90 text-white px-1.5 py-0.5 text-[8px] font-bold rounded shadow-sm flex items-center"><i className="fas fa-bolt"></i></span>)}</div>
                <div className="flex gap-1">{isEdited && (<span className="bg-indigo-600/90 text-white px-1.5 py-0.5 text-[8px] font-bold uppercase rounded shadow-sm">Redigerad</span>)}{item.type === FileType.PDF && item.pageCount && item.pageCount > 1 && (<span className="bg-slate-800/80 backdrop-blur text-white px-1.5 py-0.5 rounded text-[8px] font-bold shadow-sm">{item.pageCount} sid</span>)}</div>
          </div>
       </div>
       <div className="absolute bottom-0 left-0 right-0 h-20 px-3 py-2 bg-white">
          <p className="text-[10px] font-bold text-slate-400 uppercase truncate mb-1">{item.name}</p>
          <div className="text-[9px] leading-tight text-slate-600 line-clamp-3 font-serif italic opacity-80">{item.description || "Ingen beskrivning..."}</div>
       </div>
    </div>
  );
};

// ... (RichTextListEditor same as before)
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

// ... (EditModal same as before, ensures loading state is correct)
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
                const type = item.type === FileType.PDF ? 'application/pdf' : 'image/jpeg';
                const sourceBlob = new Blob([buffer], { type });
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
             } catch (e: any) { console.error("Init failed", e); setErrorMsg("Kunde inte ladda filen. Kontrollera att du är inloggad och har behörighet."); } 
             finally { setIsLoadingPreview(false); }
        }
        init();
    }, []);

    useEffect(() => {
        const update = async () => {
            if (!item || errorMsg) return;
            try {
                onUpdate({ pageMeta });
                const { buffer } = await processFileForCache(item, accessToken, settings.compressionLevel || 'medium');
                const type = item.type === FileType.PDF ? 'application/pdf' : 'image/jpeg';
                const sourceBlob = new Blob([buffer], { type });
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
                <div className="flex items-center space-x-3"><button onClick={handleCopyPageToPng} className="bg-emerald-600 hover:bg-emerald-500 px-3 py-1.5 rounded text-xs font-bold transition-colors flex items-center space-x-2 shadow-lg"><i className="fas fa-file-image"></i><span>Spara originalbild (PNG)</span></button><button onClick={onClose} className="bg-indigo-600 hover:bg-indigo-500 px-4 py-1.5 rounded text-xs font-bold transition-colors">Klar</button></div>
            </div>
            <div className="flex-1 flex overflow-hidden">
                {isSidebarOpen && (<div className="w-48 bg-[#222] border-r border-slate-700 flex flex-col overflow-y-auto custom-scrollbar shrink-0"><div className="p-4 space-y-4">{Array.from({ length: totalPages }).map((_, idx) => (<div key={idx} onClick={() => setActivePageIndex(idx)} className={`cursor-pointer group relative flex flex-col items-center ${activePageIndex === idx ? 'opacity-100' : 'opacity-60 hover:opacity-100'}`}><div className={`w-full aspect-[210/297] bg-white rounded-sm overflow-hidden relative shadow-sm transition-all ${activePageIndex === idx ? 'ring-2 ring-indigo-500' : ''}`}><SidebarThumbnail pdfDocProxy={pdfDocProxy} pageIndex={idx} /></div><span className="text-[10px] text-slate-400 mt-1">{idx + 1}</span></div>))}</div></div>)}
                <div className="flex-1 bg-[#1a1a1a] relative flex items-center justify-center overflow-auto p-8">
                     {isLoadingPreview && (<div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 z-20 backdrop-blur-sm"><i className="fas fa-circle-notch fa-spin text-indigo-400 text-4xl mb-4"></i><p className="text-white font-bold text-sm">Optimerar för redigering...</p></div>)}
                     {errorMsg && !isLoadingPreview && (<div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900 z-10"><div className="bg-slate-800 p-8 rounded-2xl max-w-md text-center border border-slate-700"><i className="fas fa-exclamation-triangle text-4xl text-amber-500 mb-4"></i><h3 className="text-white font-bold text-lg mb-2">Hoppsan!</h3><p className="text-slate-300 text-sm mb-6">{errorMsg}</p><button onClick={onClose} className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 font-bold text-sm">Stäng</button></div></div>)}
                     <div className="shadow-2xl bg-white relative"><canvas ref={mainCanvasRef} className="block max-w-full max-h-[85vh] h-auto w-auto" /></div>
                </div>
                <div className="w-80 bg-white border-l border-slate-200 flex flex-col z-20 shadow-xl shrink-0">
                     <div className="p-4 bg-slate-50 border-b border-slate-200"><h3 className="font-bold text-slate-800 text-sm">Redigera Text</h3></div>
                     <div className="bg-white p-2 border-b border-slate-200 flex flex-wrap gap-2">
                         <div className="flex bg-slate-100 rounded p-1"><button onClick={() => updateActiveConfig('isBold', !currentConfig.isBold)} className={`w-7 h-7 rounded text-xs ${currentConfig.isBold ? 'bg-white shadow text-black' : 'text-slate-500'}`}><i className="fas fa-bold"></i></button><button onClick={() => updateActiveConfig('isItalic', !currentConfig.isItalic)} className={`w-7 h-7 rounded text-xs ${currentConfig.isItalic ? 'bg-white shadow text-black' : 'text-slate-500'}`}><i className="fas fa-italic"></i></button></div>
                         <div className="flex bg-slate-100 rounded p-1"><button onClick={() => updateActiveConfig('alignment', 'left')} className={`w-7 h-7 rounded text-xs ${currentConfig.alignment === 'left' ? 'bg-white shadow text-black' : 'text-slate-500'}`}><i className="fas fa-align-left"></i></button><button onClick={() => updateActiveConfig('alignment', 'center')} className={`w-7 h-7 rounded text-xs ${currentConfig.alignment === 'center' ? 'bg-white shadow text-black' : 'text-slate-500'}`}><i className="fas fa-align-center"></i></button><button onClick={() => updateActiveConfig('alignment', 'right')} className={`w-7 h-7 rounded text-xs ${currentConfig.alignment === 'right' ? 'bg-white shadow text-black' : 'text-slate-500'}`}><i className="fas fa-align-right"></i></button></div>
                         <div className="flex bg-slate-100 rounded p-1"><button onClick={() => updateActiveConfig('verticalPosition', 'top')} className={`w-7 h-7 rounded text-xs ${currentConfig.verticalPosition === 'top' ? 'bg-white shadow text-black' : 'text-slate-500'}`}><i className="fas fa-arrow-up"></i></button><button onClick={() => updateActiveConfig('verticalPosition', 'bottom')} className={`w-7 h-7 rounded text-xs ${currentConfig.verticalPosition === 'bottom' ? 'bg-white shadow text-black' : 'text-slate-500'}`}><i className="fas fa-arrow-down"></i></button></div>
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

const SidebarThumbnail = ({ pdfDocProxy, pageIndex }: { pdfDocProxy: any, pageIndex: number }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    useEffect(() => { const render = async () => { if (!pdfDocProxy || !canvasRef.current) return; try { await renderPdfPageToCanvas(pdfDocProxy, pageIndex + 1, canvasRef.current, 0.2); } catch (e) { console.error("Thumb render error", e); } }; render(); }, [pdfDocProxy, pageIndex]);
    return <canvas ref={canvasRef} className="w-full h-full object-contain" />;
};

export default StoryEditor;
