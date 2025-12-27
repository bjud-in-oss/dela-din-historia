
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { DriveFile, FileType, TextConfig, RichTextLine, PageMetadata, AppSettings, MemoryBook, CompressionLevel, ChunkData } from '../types';
import { generateCombinedPDF, splitPdfIntoPages, mergeFilesToPdf, createPreviewWithOverlay, getPdfPageCount, DEFAULT_TEXT_CONFIG, DEFAULT_FOOTER_CONFIG, getPdfDocument, renderPdfPageToCanvas, extractHighQualityImage, processFileForCache, generatePageThumbnail } from '../services/pdfService';
import { uploadToDrive, saveProjectState } from '../services/driveService';
import FamilySearchExport from './FamilySearchExport';
import AppLogo from './AppLogo';
import StoryEditorSidebar from './StoryEditorSidebar';

// Distinct visual colors for chunks (exported for use in Tiles)
export const CHUNK_THEMES = [
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
    driveId?: string; 
}

// --- COMPONENTS ---

const Tile = ({ id, item, index, isSelected, onClick, onEdit, onSplit, onRemove, onDragStart, onDragOver, chunkInfo }: any) => {
  const isHeader = item.type === FileType.HEADER;
  const [dimensions, setDimensions] = useState({ width: 'auto', height: '180px' }); 
  const [imageLoaded, setImageLoaded] = useState(false);

  const SHORT_SIDE_PX = 180;
  const MAX_SIDE_PX = SHORT_SIDE_PX * 1.414;

  const handleImageLoad = (e: any) => {
      const naturalWidth = e.target.naturalWidth;
      const naturalHeight = e.target.naturalHeight;
      if (!naturalWidth || !naturalHeight) return;

      const isLandscape = naturalWidth > naturalHeight;
      let newWidth = SHORT_SIDE_PX;
      let newHeight = SHORT_SIDE_PX;

      if (isLandscape) {
          newHeight = SHORT_SIDE_PX;
          const idealWidth = SHORT_SIDE_PX * (naturalWidth / naturalHeight);
          newWidth = Math.min(idealWidth, MAX_SIDE_PX);
      } else {
          newWidth = SHORT_SIDE_PX;
          const idealHeight = SHORT_SIDE_PX * (naturalHeight / naturalWidth);
          newHeight = Math.min(idealHeight, MAX_SIDE_PX);
      }
      setDimensions({ width: `${newWidth}px`, height: `${newHeight}px` });
      setImageLoaded(true);
  };

  const style = isHeader 
    ? { width: `${SHORT_SIDE_PX}px`, height: `${SHORT_SIDE_PX}px` }
    : (imageLoaded ? dimensions : { width: `${SHORT_SIDE_PX}px`, height: `${SHORT_SIDE_PX * 1.41}px` });

  return (
    <div 
      id={id}
      draggable 
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onClick={onClick}
      style={style}
      className={`relative group rounded-sm shadow-sm transition-all cursor-pointer overflow-hidden max-w-full
        ${isSelected ? 'ring-2 ring-indigo-500 z-10' : 'hover:shadow-md hover:scale-[1.01]'}
        ${chunkInfo ? 'border-l-4 ' + chunkInfo.colorClass.replace('bg-', 'border-') : 'border border-slate-200'}
        ${isHeader ? 'bg-slate-800' : 'bg-white'}
      `}
    >
        {isHeader ? (
             <div className="w-full h-full flex flex-col items-center justify-center p-4 text-center">
                 <h3 className="text-white font-serif font-bold text-lg leading-tight line-clamp-3">{item.headerText}</h3>
                 <span className="text-slate-400 text-[10px] uppercase tracking-widest mt-2">Nytt kapitel</span>
             </div>
        ) : (
             <>
                 {item.thumbnail || item.blobUrl ? (
                     <img 
                        src={item.thumbnail || item.blobUrl} 
                        onLoad={handleImageLoad}
                        className="w-full h-full object-contain bg-slate-100" 
                        alt={item.name} 
                     />
                 ) : (
                     <div className="w-full h-full flex items-center justify-center text-slate-300 bg-slate-100">
                         <i className={`fas ${item.type === FileType.PDF ? 'fa-file-pdf' : 'fa-file-image'} text-4xl`}></i>
                     </div>
                 )}
                 <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/70 to-transparent pointer-events-none"></div>
                 {chunkInfo && (
                     <div className={`absolute top-0 right-0 px-2 py-1 text-[9px] font-bold text-white ${chunkInfo.colorClass} z-20`}>
                         Del {chunkInfo.chunkIndex}
                     </div>
                 )}
                 <div className="absolute bottom-2 left-2 right-14 z-20">
                     <h4 className="text-[10px] font-bold text-white line-clamp-2 leading-tight drop-shadow-md">{item.name}</h4>
                 </div>
                 <div className="absolute bottom-2 right-2 flex space-x-1 opacity-0 group-hover:opacity-100 transition-opacity z-20">
                    <button onClick={(e) => { e.stopPropagation(); onEdit(); }} className="w-6 h-6 rounded-full bg-white/90 hover:bg-white text-slate-700 hover:text-indigo-600 flex items-center justify-center shadow-sm backdrop-blur-sm"><i className="fas fa-pen text-[10px]"></i></button>
                    {item.type === FileType.PDF && onSplit && (
                        <button onClick={(e) => { e.stopPropagation(); onSplit(); }} className="w-6 h-6 rounded-full bg-white/90 hover:bg-white text-slate-700 hover:text-indigo-600 flex items-center justify-center shadow-sm backdrop-blur-sm" title="Dela upp sidor"><i className="fas fa-cut text-[10px]"></i></button>
                    )}
                 </div>
             </>
        )}
        {isSelected && (
            <div className="absolute top-2 left-2 w-6 h-6 bg-indigo-600 rounded-full flex items-center justify-center shadow-lg text-white z-30">
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

const SidebarThumbnail = ({ pdfDocProxy, pageIndex, item }: { pdfDocProxy: any, pageIndex: number, item?: DriveFile }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    useEffect(() => {
        const render = async () => {
            if (pdfDocProxy && canvasRef.current) {
                await renderPdfPageToCanvas(pdfDocProxy, pageIndex + 1, canvasRef.current, 0.25);
            }
        };
        render();
    }, [pdfDocProxy, pageIndex]);

    return <canvas ref={canvasRef} className="w-full h-full object-contain block" />;
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
    const [isSavingThumbnail, setIsSavingThumbnail] = useState(false);

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
                     const initMeta: PageMetadata = { 
                         headerLines: item.headerText ? [{ id: 'l1', text: item.headerText, config: item.textConfig || DEFAULT_TEXT_CONFIG }] : [], 
                         footerLines: item.description ? [{ id: 'f1', text: item.description, config: DEFAULT_FOOTER_CONFIG }] : [], 
                     };
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
        const renderMain = async () => { 
            if (pdfDocProxy && mainCanvasRef.current) {
                await renderPdfPageToCanvas(pdfDocProxy, activePageIndex + 1, mainCanvasRef.current, 1.5); 
            }
        };
        renderMain();
    }, [pdfDocProxy, activePageIndex]);

    const getCurrentMeta = () => pageMeta[activePageIndex] || { headerLines: [], footerLines: [] };
    const updateCurrentMeta = (updates: Partial<PageMetadata>) => setPageMeta(prev => ({ ...prev, [activePageIndex]: { ...(prev[activePageIndex] || { headerLines: [], footerLines: [] }), ...updates } }));
    
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
            if (onExportSuccess) onExportSuccess(filename, 'png');
            alert(`Bilden "${filename}" har sparats i bokens mapp på Google Drive.`);
        } catch (e) { 
            alert("Kunde inte spara bilden till Drive."); 
        } finally {
            setIsSavingImage(false);
        }
    };

    const handleSaveAndClose = async () => {
        setIsSavingThumbnail(true);
        try {
            if (previewBlob) {
               const newThumb = await generatePageThumbnail(previewBlob, 0, 0.5);
               onUpdate({ thumbnail: newThumb });
            }
        } catch(e) { console.warn("Kunde inte uppdatera miniatyrbild", e); } 
        finally {
            setIsSavingThumbnail(false);
            onClose();
        }
    };

    const getActiveConfig = () => { const meta = getCurrentMeta(); const lines = activeSection === 'header' ? meta.headerLines : meta.footerLines; const line = lines.find(l => l.id === focusedLineId); return line?.config || (activeSection === 'header' ? DEFAULT_TEXT_CONFIG : DEFAULT_FOOTER_CONFIG); };
    const updateActiveConfig = (key: keyof TextConfig, value: any) => { const meta = getCurrentMeta(); const isHeader = activeSection === 'header'; const lines = isHeader ? meta.headerLines : meta.footerLines; if (focusedLineId) { const newLines = lines.map(l => l.id === focusedLineId ? { ...l, config: { ...l.config, [key]: value } } : l); updateCurrentMeta(isHeader ? { headerLines: newLines } : { footerLines: newLines }); } else { const newLines = lines.map(l => ({ ...l, config: { ...l.config, [key]: value } })); updateCurrentMeta(isHeader ? { headerLines: newLines } : { footerLines: newLines }); } };
    const currentConfig = getActiveConfig();

    return (
        <div className="fixed inset-0 z-[100] bg-slate-900 flex flex-col animate-in fade-in duration-200">
            {/* Toolbar */}
            <div className="bg-slate-800 text-white h-14 flex items-center justify-between px-4 border-b border-slate-700 shrink-0">
                <div className="flex items-center space-x-4">
                    <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="text-slate-300 hover:text-white">
                        <i className="fas fa-bars text-lg"></i>
                    </button>
                    <span className="font-bold text-sm truncate max-w-[200px]">{item.name}</span>
                </div>
                <div className="flex items-center space-x-2">
                    <span className="text-xs text-slate-400 mr-2">{activePageIndex + 1} / {totalPages}</span>
                    <button onClick={() => setActivePageIndex(Math.max(0, activePageIndex - 1))} disabled={activePageIndex === 0} className="w-8 h-8 rounded hover:bg-slate-700 disabled:opacity-30"><i className="fas fa-chevron-left"></i></button>
                    <button onClick={() => setActivePageIndex(Math.min(totalPages - 1, activePageIndex + 1))} disabled={activePageIndex === totalPages - 1} className="w-8 h-8 rounded hover:bg-slate-700 disabled:opacity-30"><i className="fas fa-chevron-right"></i></button>
                </div>
                <div className="flex items-center space-x-3">
                    <button onClick={handleCopyPageToPng} disabled={isSavingImage || isSavingThumbnail} className="bg-emerald-600 hover:bg-emerald-500 px-3 py-1.5 rounded text-xs font-bold transition-colors flex items-center space-x-2 shadow-lg disabled:opacity-50">
                        {isSavingImage ? <i className="fas fa-circle-notch fa-spin"></i> : <i className="fas fa-save"></i>}
                        <span>{isSavingImage ? 'Sparar...' : 'Spara bild'}</span>
                    </button>
                    <button onClick={handleSaveAndClose} disabled={isSavingThumbnail} className="bg-indigo-600 hover:bg-indigo-500 px-4 py-1.5 rounded text-xs font-bold transition-colors disabled:opacity-50 flex items-center gap-2">
                        {isSavingThumbnail && <i className="fas fa-circle-notch fa-spin"></i>}
                        <span>{isSavingThumbnail ? 'Sparar...' : 'Klar'}</span>
                    </button>
                </div>
            </div>
            
            {/* Workspace */}
            <div className="flex-1 flex overflow-hidden">
                {isSidebarOpen && (
                    <div className="w-48 bg-[#222] border-r border-slate-700 flex flex-col overflow-y-auto custom-scrollbar shrink-0">
                        <div className="p-4 space-y-4">
                            {Array.from({ length: totalPages }).map((_, idx) => (
                                <div key={idx} onClick={() => setActivePageIndex(idx)} className={`cursor-pointer group relative flex flex-col items-center ${activePageIndex === idx ? 'opacity-100' : 'opacity-60 hover:opacity-100'}`}>
                                    <div className={`w-full aspect-[210/297] bg-white rounded-sm overflow-hidden relative shadow-sm transition-all ${activePageIndex === idx ? 'ring-2 ring-indigo-500' : ''}`}>
                                        <SidebarThumbnail pdfDocProxy={pdfDocProxy} pageIndex={idx} item={item} />
                                    </div>
                                    <span className="text-[10px] text-slate-400 mt-1">{idx + 1}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
                
                {/* Main View */}
                <div className="flex-1 bg-[#1a1a1a] relative flex items-center justify-center overflow-auto p-8">
                     {isLoadingPreview && (
                         <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 z-20 backdrop-blur-sm">
                             <i className="fas fa-circle-notch fa-spin text-indigo-400 text-4xl mb-4"></i>
                             <p className="text-white font-bold text-sm">Optimerar för redigering...</p>
                         </div>
                     )}
                     {errorMsg && !isLoadingPreview && (
                         <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900 z-10">
                             <div className="bg-slate-800 p-8 rounded-2xl max-w-md text-center border border-slate-700">
                                 <i className="fas fa-exclamation-triangle text-4xl text-amber-500 mb-4"></i>
                                 <h3 className="text-white font-bold text-lg mb-2">Hoppsan!</h3>
                                 <p className="text-slate-300 text-sm mb-6">{errorMsg}</p>
                                 <button onClick={onClose} className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 font-bold text-sm">Stäng</button>
                             </div>
                         </div>
                     )}
                     <div className="shadow-2xl bg-white relative">
                         <canvas ref={mainCanvasRef} className="block max-w-full max-h-[85vh] h-auto w-auto" />
                     </div>
                </div>
                
                {/* Right Panel: Tools */}
                <div className="w-80 bg-white border-l border-slate-200 flex flex-col z-20 shadow-xl shrink-0">
                     <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center space-x-3">
                         <div className="shrink-0"><AppLogo variant="phase2" className="w-8 h-8" /></div>
                         <h3 className="font-bold text-slate-800 text-lg leading-tight">Berätta kortfattat</h3>
                     </div>
                     <div className="bg-white p-2 border-b border-slate-200 flex flex-wrap gap-2">
                         <div className="flex bg-slate-100 rounded p-1">
                             <button onClick={() => updateActiveConfig('isBold', !currentConfig.isBold)} className={`w-7 h-7 rounded text-xs ${currentConfig.isBold ? 'bg-white shadow text-black' : 'text-slate-500'}`}><i className="fas fa-bold"></i></button>
                             <button onClick={() => updateActiveConfig('isItalic', !currentConfig.isItalic)} className={`w-7 h-7 rounded text-xs ${currentConfig.isItalic ? 'bg-white shadow text-black' : 'text-slate-500'}`}><i className="fas fa-italic"></i></button>
                         </div>
                         <div className="flex bg-slate-100 rounded p-1">
                             <button onClick={() => updateActiveConfig('alignment', 'left')} className={`w-7 h-7 rounded text-xs ${currentConfig.alignment === 'left' ? 'bg-white shadow text-black' : 'text-slate-500'}`}><i className="fas fa-align-left"></i></button>
                             <button onClick={() => updateActiveConfig('alignment', 'center')} className={`w-7 h-7 rounded text-xs ${currentConfig.alignment === 'center' ? 'bg-white shadow text-black' : 'text-slate-500'}`}><i className="fas fa-align-center"></i></button>
                             <button onClick={() => updateActiveConfig('alignment', 'right')} className={`w-7 h-7 rounded text-xs ${currentConfig.alignment === 'right' ? 'bg-white shadow text-black' : 'text-slate-500'}`}><i className="fas fa-align-right"></i></button>
                         </div>
                         {activeSection === 'header' && (
                             <div className="flex bg-slate-100 rounded p-1">
                                 <button onClick={() => updateActiveConfig('verticalPosition', 'top')} className={`w-7 h-7 rounded text-xs ${currentConfig.verticalPosition === 'top' ? 'bg-white shadow text-black' : 'text-slate-500'}`}><i className="fas fa-arrow-up"></i></button>
                                 <button onClick={() => updateActiveConfig('verticalPosition', 'center')} className={`w-7 h-7 rounded text-xs ${currentConfig.verticalPosition === 'center' ? 'bg-white shadow text-black' : 'text-slate-500'}`}><i className="fas fa-arrows-alt-v"></i></button>
                                 <button onClick={() => updateActiveConfig('verticalPosition', 'bottom')} className={`w-7 h-7 rounded text-xs ${currentConfig.verticalPosition === 'bottom' ? 'bg-white shadow text-black' : 'text-slate-500'}`}><i className="fas fa-arrow-down"></i></button>
                             </div>
                         )}
                         <button 
                            onClick={() => {
                                updateActiveConfig('backgroundColor', '#ffffff');
                                updateActiveConfig('backgroundOpacity', 0.8);
                                updateActiveConfig('padding', 10);
                            }}
                            className="px-2 py-1 bg-slate-100 hover:bg-slate-200 rounded text-[10px] font-bold text-slate-600 flex items-center gap-1"
                            title="Lägg till vit bakgrund"
                         >
                             <div className="w-3 h-3 bg-white border border-slate-300"></div> +Vit
                         </button>
                     </div>
                     <div className="px-4 py-3 border-b border-slate-100">
                         <div className="flex justify-between text-[10px] font-bold text-slate-500 mb-1"><span>Textstorlek</span><span>{currentConfig.fontSize}px</span></div>
                         <input type="range" min="8" max="72" value={currentConfig.fontSize} onChange={(e) => updateActiveConfig('fontSize', parseInt(e.target.value))} className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600" />
                     </div>

                     <div className="px-4 py-3 border-b border-slate-100 space-y-3">
                         <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Stil & Färg</h4>
                         <div className="grid grid-cols-2 gap-2">
                             <div>
                                 <label className="text-[9px] font-bold text-slate-500 block mb-1">Textfärg</label>
                                 <div className="flex items-center gap-2">
                                     <input type="color" value={currentConfig.color || '#000000'} onChange={(e) => updateActiveConfig('color', e.target.value)} className="w-6 h-6 rounded cursor-pointer border border-slate-200 p-0" />
                                     <span className="text-[10px] font-mono text-slate-400">{currentConfig.color || '#000'}</span>
                                 </div>
                             </div>
                             <div>
                                 <label className="text-[9px] font-bold text-slate-500 block mb-1">Bakgrundsfärg</label>
                                 <div className="flex items-center gap-2">
                                     <input type="color" value={currentConfig.backgroundColor || '#ffffff'} onChange={(e) => updateActiveConfig('backgroundColor', e.target.value)} className="w-6 h-6 rounded cursor-pointer border border-slate-200 p-0" />
                                     <button onClick={() => updateActiveConfig('backgroundOpacity', 0)} className="text-[9px] text-red-400 hover:text-red-600 font-bold px-1" title="Ta bort bakgrund">X</button>
                                 </div>
                             </div>
                         </div>
                         <div>
                             <div className="flex justify-between text-[9px] font-bold text-slate-500 mb-1"><span>Opacitet (Bakgrund)</span><span>{Math.round((currentConfig.backgroundOpacity || 0) * 100)}%</span></div>
                             <input type="range" min="0" max="1" step="0.1" value={currentConfig.backgroundOpacity || 0} onChange={(e) => updateActiveConfig('backgroundOpacity', parseFloat(e.target.value))} className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600" />
                         </div>
                         <div>
                             <div className="flex justify-between text-[9px] font-bold text-slate-500 mb-1"><span>Luft (Padding)</span><span>{currentConfig.padding || 0}px</span></div>
                             <input type="range" min="0" max="50" step="1" value={currentConfig.padding || 0} onChange={(e) => updateActiveConfig('padding', parseInt(e.target.value))} className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600" />
                         </div>
                     </div>
                     {activeSection === 'footer' && (
                         <div className="px-4 py-3 border-b border-slate-100 bg-amber-50/50">
                             <div className="flex justify-between text-[10px] font-bold text-amber-700 mb-1"><span>Fälthöjd (under bild)</span><span>{currentConfig.boxHeight || 'Auto'}</span></div>
                             <input 
                                type="range" 
                                min="50" 
                                max="800" 
                                step="10" 
                                value={currentConfig.boxHeight || 150} 
                                onChange={(e) => updateActiveConfig('boxHeight', parseInt(e.target.value))} 
                                className="w-full h-1 bg-amber-200 rounded-lg appearance-none cursor-pointer accent-amber-600" 
                             />
                             <div className="text-right mt-1">
                                 <button onClick={() => updateActiveConfig('boxHeight', undefined)} className="text-[9px] text-amber-500 hover:text-amber-700 underline">Återställ till auto</button>
                             </div>
                         </div>
                     )}

                     <div className="flex-1 overflow-y-auto p-4 space-y-6">
                        <div className={`rounded-lg border p-3 cursor-pointer transition-all ${activeSection === 'header' ? 'bg-indigo-50 border-indigo-200 ring-1 ring-indigo-200' : 'bg-white border-slate-200 hover:border-slate-300'}`} onClick={() => setActiveSection('header')}>
                            <label className="text-[10px] font-black uppercase text-indigo-900 mb-2 block">Text PÅ sidan</label>
                            <RichTextListEditor lines={getCurrentMeta().headerLines || []} onChange={(lines) => updateCurrentMeta({ headerLines: lines })} onFocusLine={setFocusedLineId} focusedLineId={focusedLineId}/>
                        </div>
                        <div className={`rounded-lg border p-3 cursor-pointer transition-all ${activeSection === 'footer' ? 'bg-indigo-50 border-indigo-200 ring-1 ring-indigo-200' : 'bg-white border-slate-200 hover:border-slate-300'}`} onClick={() => setActiveSection('footer')}>
                            <label className="text-[10px] font-black uppercase text-slate-500 mb-2 block">Text UNDER sidan</label>
                            <RichTextListEditor lines={getCurrentMeta().footerLines || []} onChange={(lines) => updateCurrentMeta({ footerLines: lines })} onFocusLine={setFocusedLineId} focusedLineId={focusedLineId}/>
                        </div>
                         <label className="flex items-center space-x-3 p-3 bg-slate-50 rounded-lg cursor-pointer hover:bg-slate-100 transition-colors border border-slate-100">
                             <input type="checkbox" checked={getCurrentMeta().hideObject || false} onChange={(e) => updateCurrentMeta({ hideObject: e.target.checked })} className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"/>
                             <div><span className="text-xs font-bold text-slate-700 block">Dölj originalbilden</span></div>
                         </label>
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
  
  const [showStatusLog, setShowStatusLog] = useState(false);
  const [statusLog, setStatusLog] = useState<string[]>([]);

  // Manual Exports State
  const [exportedFiles, setExportedFiles] = useState<ExportedFile[]>([]);

  const addLog = (msg: string) => {
      setStatusLog(prev => [msg, ...prev].slice(0, 20)); 
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
  const generateHash = () => {
      return items.map(i => 
          `${i.id}-${i.processedSize || 'u'}-${JSON.stringify(i.pageMeta || {})}-${(i.headerText||'').length}-${(i.description||'').length}`
      ).join('|');
  };
  const currentItemsHash = useMemo(generateHash, [items]);

  const [chunks, setChunks] = useState<ChunkData[]>(currentBook.chunks || []);
  const [optimizationCursor, setOptimizationCursor] = useState(0);
  const [optimizingStatus, setOptimizingStatus] = useState<string>('');
  
  const chunksRef = useRef(chunks);
  const cursorRef = useRef(optimizationCursor);

  useEffect(() => { chunksRef.current = chunks; }, [chunks]);
  useEffect(() => { cursorRef.current = optimizationCursor; }, [optimizationCursor]);

  useEffect(() => {
      if (optimizingStatus) addLog(optimizingStatus);
  }, [optimizingStatus]);

  useEffect(() => {
      const savedChunks = chunks.length > 0 ? chunks : (currentBook.chunks || []);
      
      let itemIndex = 0;
      let validChunks: ChunkData[] = [];
      let mismatchFound = false;

      for (const chunk of savedChunks) {
          if (mismatchFound) break;
          const chunkLen = chunk.items.length;
          if (itemIndex + chunkLen > items.length) {
              mismatchFound = true;
              break;
          }
          const currentSlice = items.slice(itemIndex, itemIndex + chunkLen);
          const isMatch = currentSlice.every((item, i) => {
              const chunkItem = chunk.items[i];
              const metaMatch = JSON.stringify(item.pageMeta || {}) === JSON.stringify(chunkItem.pageMeta || {});
              const textMatch = (item.headerText || '') === (chunkItem.headerText || '') &&
                                (item.description || '') === (chunkItem.description || '');
              return item.id === chunkItem.id && metaMatch && textMatch;
          });
          
          if (isMatch) {
              validChunks.push(chunk);
              itemIndex += chunkLen;
          } else {
              mismatchFound = true;
          }
      }

      if (validChunks.length > 0 && !validChunks[validChunks.length - 1].isSynced) {
          const lastChunk = validChunks.pop();
          if (lastChunk) {
              itemIndex -= lastChunk.items.length; 
              if (itemIndex < 0) itemIndex = 0;
          }
      }

      if (validChunks.length !== chunks.length || itemIndex !== optimizationCursor) {
          setChunks(validChunks);
          setOptimizationCursor(itemIndex);
          if (items.length > itemIndex) setOptimizingStatus('Omorganiserar...');
      }

  }, [currentItemsHash, currentBook.id]); 

  useEffect(() => {
      if (items.length > 0) {
          setChunks([]);
          setOptimizationCursor(0);
          setOptimizingStatus('Inställningar ändrade, startar om...');
      }
  }, [settings.maxChunkSizeMB, settings.safetyMarginPercent, settings.compressionLevel]);

  useEffect(() => {
    if (!currentBook.driveFolderId) return;
    setAutoSaveStatus('Sparar...');
    
    const handler = setTimeout(async () => {
        try {
            const itemsToPersist = items.filter(i => i.isLocal && !i.id.startsWith('drive-')); 
            if (itemsToPersist.length > 0) {
                setAutoSaveStatus('Synkroniserar filer...');
                for (const item of itemsToPersist) {
                    try {
                        let blobToUpload: Blob | null = null;
                        if (item.blobUrl) {
                            const res = await fetch(item.blobUrl);
                            blobToUpload = await res.blob();
                        } else if (item.processedBuffer) {
                            blobToUpload = new Blob([item.processedBuffer], { type: item.type === FileType.PDF ? 'application/pdf' : 'image/jpeg' });
                        }
                        if (blobToUpload) {
                            const filename = `${item.name}.pdf`;
                            await uploadToDrive(accessToken, currentBook.driveFolderId!, filename, blobToUpload, 'application/pdf');
                            // Find ID if possible to stabilize, but handled by logic above
                            const uploadedId = await (window as any).findFileInFolder?.(accessToken, currentBook.driveFolderId!, filename);
                        }
                    } catch (e) {
                        console.warn("Auto-upload failed for item", item.name);
                    }
                }
            }

            const bookToSave = { 
                ...currentBook, 
                items: items,
                title: bookTitle, 
                settings,
                chunks: chunksRef.current, 
                optimizationCursor: cursorRef.current, 
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

  useEffect(() => {
    if (optimizationCursor >= items.length) {
         if (optimizingStatus) setOptimizingStatus('');
         return;
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
             
             let needsProcessing = (!item.processedSize) || item.compressionLevelUsed !== settings.compressionLevel;

             if (needsProcessing) {
                 try {
                     const { buffer, size } = await processFileForCache(item, accessToken, settings.compressionLevel);
                     if (isCancelled) return;
                     itemSize = size;
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
    
    const timer = setTimeout(processNextStep, 200);
    return () => { isCancelled = true; clearTimeout(timer); };
  }, [currentItemsHash, optimizationCursor, chunks.length]);

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

  useEffect(() => {
      const handleResize = () => {
          setIsSidebarCompact(window.innerWidth < 1280);
      };
      handleResize();
      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
  }, []);

  const getChunkForItem = (itemId: string) => chunks.find(c => c.items.some(i => i.id === itemId));

  const handleDragStart = (e: React.DragEvent, index: number) => { setDraggedIndex(index); e.dataTransfer.effectAllowed = "move"; };
  const handleDragOver = (e: React.DragEvent, index: number) => { e.preventDefault(); if (draggedIndex === null || draggedIndex === index) return; const newItems = [...items]; const item = newItems[draggedIndex]; newItems.splice(draggedIndex, 1); newItems.splice(index, 0, item); onUpdateItems(newItems); setDraggedIndex(index); };
  
  const handleSelection = (e: React.MouseEvent, item: DriveFile, index: number) => { 
      e.stopPropagation(); 
      if (!items.find(i => i.id === item.id)) return; 
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
          if (!newSelection.has(item.id) || newSelection.size > 1) { newSelection.clear(); newSelection.add(item.id); setLastSelectedId(item.id); } 
          else { setEditingItem(item); } 
      } 
      setSelectedIds(newSelection); 
  };

  const handleSplitPdf = async (file: DriveFile, index: number) => { if (!confirm("Detta kommer dela upp PDF-filen i lösa sidor. Vill du fortsätta?")) return; setIsProcessing(true); try { const { buffer } = await processFileForCache(file, accessToken, 'medium'); const blob = new Blob([buffer as any], { type: 'application/pdf' }); const pages = await splitPdfIntoPages(blob, file.name); const newItems = [...items]; newItems.splice(index, 1, ...pages); onUpdateItems(newItems); setSelectedIds(new Set()); } catch (e) { console.error(e); alert("Kunde inte dela upp filen."); } finally { setIsProcessing(false); } };
  
  const handleMergeItems = async () => { 
      if (selectedIds.size < 2) return; 
      if (!confirm(`Vill du slå ihop ${selectedIds.size} filer?`)) return; 
      setIsProcessing(true); 
      setSelectedIds(new Set());
      try { 
          const itemsToMerge = items.filter(i => selectedIds.has(i.id)); 
          const firstIndex = items.findIndex(i => i.id === itemsToMerge[0].id); 
          const mergedBlob = await mergeFilesToPdf(itemsToMerge, accessToken, settings.compressionLevel); 
          const mergedUrl = URL.createObjectURL(mergedBlob); 
          const count = await getPdfPageCount(mergedBlob); 
          const thumbUrl = await generatePageThumbnail(mergedBlob, 0); 
          const baseName = itemsToMerge[0].name.replace(/\.pdf$/i, '');
          const newName = `${baseName}.pdf`;
          const newItemId = `merged-${Date.now()}`;
          const newItem: DriveFile = { 
              id: newItemId, name: newName, type: FileType.PDF, size: mergedBlob.size, 
              modifiedTime: new Date().toISOString(), blobUrl: mergedUrl, isLocal: true, 
              pageCount: count, pageMeta: {}, thumbnail: thumbUrl 
          }; 
          const finalItems = items.filter(i => !selectedIds.has(i.id));
          finalItems.splice(firstIndex, 0, newItem);
          onUpdateItems(finalItems); 
          setSelectedIds(new Set([newItemId])); 
          setLastSelectedId(newItemId); 
      } catch (e) { alert("Kunde inte slå ihop filerna."); console.error(e); } finally { setIsProcessing(false); } 
  };

  const handleUpdateItem = (updates: Partial<DriveFile>) => { if (!editingItem) return; const updated = { ...editingItem, ...updates }; setEditingItem(updated); onUpdateItems(items.map(i => i.id === updated.id ? updated : i)); };
  const handleInsertAfterSelection = () => { const indexes = items.map((item, idx) => selectedIds.has(item.id) ? idx : -1).filter(i => i !== -1); const maxIndex = Math.max(...indexes); if (maxIndex !== -1) onOpenSourceSelector(maxIndex + 1); };

  const filteredItems = activeChunkFilter !== null ? (chunks.find(c => c.id === activeChunkFilter)?.items || []) : items;

  if (showShareView) {
      return (
          <FamilySearchExport 
            items={items} 
            chunks={chunks} 
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

  return (
    <>
      <div className="flex flex-col lg:flex-row h-auto min-h-full lg:h-full bg-[#f0f2f5] lg:overflow-hidden" onClick={() => setSelectedIds(new Set())}>
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
                    <div className="flex flex-wrap justify-center md:justify-start gap-4 select-none">
                        <button onClick={(e) => { e.stopPropagation(); onOpenSourceSelector(null); }} className="h-52 md:h-80 w-36 md:w-56 rounded-sm border-2 border-dashed border-slate-300 flex flex-col items-center justify-center text-slate-400 hover:text-indigo-600 hover:border-indigo-300 hover:bg-indigo-50/20 transition-all group bg-white shadow-sm flex-shrink-0"><div className="mb-2 transform group-hover:scale-110 transition-transform"><AppLogo variant="phase1" className="w-20 h-20" /></div><div className="w-8 h-8 rounded-full bg-slate-100 group-hover:bg-white group-hover:shadow-md flex items-center justify-center mb-2 transition-all"><i className="fas fa-plus text-lg"></i></div><span className="text-sm font-bold uppercase tracking-wider text-center px-2">Lägg till<br/>minne</span></button>
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

         <StoryEditorSidebar 
            chunks={chunks}
            settings={settings}
            onUpdateSettings={onUpdateSettings}
            bookTitle={bookTitle}
            isCompact={isSidebarCompact}
            onToggleCompact={() => setIsSidebarCompact(!isSidebarCompact)}
            showStatusLog={showStatusLog}
            onToggleStatusLog={() => setShowStatusLog(!showStatusLog)}
            statusLog={statusLog}
            optimizingStatus={optimizingStatus}
            autoSaveStatus={autoSaveStatus}
            activeChunkFilter={activeChunkFilter}
            onSetActiveChunkFilter={setActiveChunkFilter}
            exportedFiles={exportedFiles}
            onTriggerShare={() => (window as any).triggerShare?.()}
         />
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
