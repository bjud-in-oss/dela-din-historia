import React, { useState, useEffect, useRef } from 'react';
import { DriveFile, FileType, PageMetadata, TextConfig, AppSettings } from '../types';
import { 
    processFileForCache, 
    createPreviewWithOverlay, 
    getPdfDocument, 
    renderPdfPageToCanvas, 
    extractHighQualityImage, 
    generatePageThumbnail,
    DEFAULT_TEXT_CONFIG,
    DEFAULT_FOOTER_CONFIG
} from '../services/pdfService';
import { uploadToDrive } from '../services/driveService';
import EditorToolsPanel from './EditorToolsPanel';

// --- SUB-COMPONENT: Sidebar Thumbnail ---

interface SidebarThumbnailProps {
    pdfDocProxy: any;
    pageIndex: number;
    isActive: boolean;
    onClick: () => void;
}

const SidebarThumbnail: React.FC<SidebarThumbnailProps> = ({ pdfDocProxy, pageIndex, isActive, onClick }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [aspectRatio, setAspectRatio] = useState(1.414); // Default A4 aspect

    useEffect(() => {
        const render = async () => {
            if (pdfDocProxy && canvasRef.current) {
                // Get page to determine aspect ratio
                const page = await pdfDocProxy.getPage(pageIndex + 1);
                const viewport = page.getViewport({ scale: 1.0 });
                setAspectRatio(viewport.height / viewport.width);

                // Render thumbnail
                await renderPdfPageToCanvas(pdfDocProxy, pageIndex + 1, canvasRef.current, 0.25);
            }
        };
        render();
    }, [pdfDocProxy, pageIndex]);

    return (
        <div 
            onClick={onClick} 
            className={`cursor-pointer group relative w-full mb-4 px-2 transition-all duration-200 ${isActive ? 'opacity-100 scale-100' : 'opacity-60 hover:opacity-100 hover:scale-[1.02]'}`}
        >
            <div 
                className={`w-full bg-white rounded-sm overflow-hidden relative shadow-sm transition-all ${isActive ? 'ring-2 ring-indigo-500 ring-offset-2 ring-offset-[#222]' : ''}`}
                style={{ aspectRatio: `${1 / aspectRatio}` }} // Inverse aspect ratio for CSS
            >
                <canvas ref={canvasRef} className="w-full h-full object-contain block" />
            </div>
            <span className={`text-[10px] mt-1 block text-center font-bold ${isActive ? 'text-white' : 'text-slate-500'}`}>
                {pageIndex + 1}
            </span>
        </div>
    );
};

// --- MAIN COMPONENT ---

interface FileEditorModalProps {
    item: DriveFile;
    allItems: DriveFile[]; // Needed for horizontal file navigation
    accessToken: string;
    onClose: () => void;
    onUpdate: (updates: Partial<DriveFile>) => void; // Updates current item in parent
    onNavigateFile: (newItem: DriveFile) => void; // Switches current item in parent
    settings: AppSettings;
    driveFolderId?: string;
    onExportSuccess?: (filename: string, type: 'png' | 'pdf') => void;
}

const FileEditorModal: React.FC<FileEditorModalProps> = ({ 
    item, 
    allItems,
    accessToken, 
    onClose, 
    onUpdate, 
    onNavigateFile,
    settings, 
    driveFolderId, 
    onExportSuccess 
}) => {
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

    // Calculate file navigation indices
    const currentFileIndex = allItems.findIndex(i => i.id === item.id);
    const hasPrevFile = currentFileIndex > 0;
    const hasNextFile = currentFileIndex < allItems.length - 1;

    // --- EFFECTS ---

    // 1. Load File Data on Mount or Item Change
    useEffect(() => {
        const init = async () => {
             setIsLoadingPreview(true); 
             setErrorMsg(null);
             setPageMeta(item.pageMeta || {});
             setActivePageIndex(0);

             try {
                const { buffer } = await processFileForCache(item, accessToken, settings.compressionLevel || 'medium');
                const isPdfType = item.type === FileType.PDF || item.type === FileType.GOOGLE_DOC;
                const type = isPdfType ? 'application/pdf' : 'image/jpeg';
                
                // Create initial preview (with existing meta)
                const sourceBlob = new Blob([buffer as any], { type });
                const previewUrl = await createPreviewWithOverlay(sourceBlob, item.type, item.pageMeta || {});
                
                const res = await fetch(previewUrl);
                const pBlob = await res.blob();
                setPreviewBlob(pBlob);
                
                const pdf = await getPdfDocument(pBlob);
                setPdfDocProxy(pdf);
                setTotalPages(pdf.numPages);
                
                // If it's a new item without meta but has legacy text, init meta
                if ((!item.pageMeta || Object.keys(item.pageMeta).length === 0) && (item.headerText || item.description)) {
                     const initMeta: PageMetadata = { 
                         headerLines: item.headerText ? [{ id: 'l1', text: item.headerText, config: item.textConfig || DEFAULT_TEXT_CONFIG }] : [], 
                         footerLines: item.description ? [{ id: 'f1', text: item.description, config: DEFAULT_FOOTER_CONFIG }] : [], 
                     };
                    setPageMeta({ 0: initMeta });
                }
             } catch (e: any) { 
                 console.error("Init failed", e); 
                 setErrorMsg(e.message || "Kunde inte ladda filen."); 
             } finally { 
                 setIsLoadingPreview(false); 
             }
        }
        init();
    }, [item.id]); // Re-run when item ID changes (navigation)

    // 2. Refresh Preview when PageMeta Changes
    useEffect(() => {
        const update = async () => {
            if (!item || errorMsg) return;
            try {
                // Determine if we actually have changes compared to item.pageMeta
                // Simple JSON check to avoid unnecessary re-renders if effect fires on mount
                if (JSON.stringify(pageMeta) === JSON.stringify(item.pageMeta)) return;

                // Propagate changes to parent immediately (so they persist if we switch files)
                onUpdate({ pageMeta }); 

                // Re-generate visual preview
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
        const t = setTimeout(update, 500); // Debounce
        return () => clearTimeout(t);
    }, [pageMeta]);

    // 3. Render Main Canvas when Page or Doc changes
    useEffect(() => {
        const renderMain = async () => { 
            if (pdfDocProxy && mainCanvasRef.current) {
                await renderPdfPageToCanvas(pdfDocProxy, activePageIndex + 1, mainCanvasRef.current, 1.5); 
            }
        };
        renderMain();
    }, [pdfDocProxy, activePageIndex]);


    // --- HANDLERS ---

    const getCurrentMeta = () => pageMeta[activePageIndex] || { headerLines: [], footerLines: [] };
    
    const updateCurrentMeta = (updates: Partial<PageMetadata>) => {
        setPageMeta(prev => ({ 
            ...prev, 
            [activePageIndex]: { 
                ...(prev[activePageIndex] || { headerLines: [], footerLines: [] }), 
                ...updates 
            } 
        }));
    };
    
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
               // Update the thumbnail for the main list view based on current edits
               const newThumb = await generatePageThumbnail(previewBlob, 0, 0.5);
               onUpdate({ thumbnail: newThumb });
            }
        } catch(e) { console.warn("Kunde inte uppdatera miniatyrbild", e); } 
        finally {
            setIsSavingThumbnail(false);
            onClose();
        }
    };

    // Tools Panel Helpers
    const getActiveConfig = () => { 
        const meta = getCurrentMeta(); 
        const lines = activeSection === 'header' ? meta.headerLines : meta.footerLines; 
        const line = lines.find(l => l.id === focusedLineId); 
        return line?.config || (activeSection === 'header' ? DEFAULT_TEXT_CONFIG : DEFAULT_FOOTER_CONFIG); 
    };
    
    const updateActiveConfig = (key: keyof TextConfig, value: any) => { 
        const meta = getCurrentMeta(); 
        const isHeader = activeSection === 'header'; 
        const lines = isHeader ? meta.headerLines : meta.footerLines; 
        
        if (focusedLineId) { 
            const newLines = lines.map(l => l.id === focusedLineId ? { ...l, config: { ...l.config, [key]: value } } : l); 
            updateCurrentMeta(isHeader ? { headerLines: newLines } : { footerLines: newLines }); 
        } else { 
            const newLines = lines.map(l => ({ ...l, config: { ...l.config, [key]: value } })); 
            updateCurrentMeta(isHeader ? { headerLines: newLines } : { footerLines: newLines }); 
        } 
    };
    
    const currentConfig = getActiveConfig();

    return (
        <div className="fixed inset-0 z-[100] bg-slate-900 flex flex-col animate-in fade-in duration-200">
            {/* --- TOP TOOLBAR --- */}
            <div className="bg-slate-800 text-white h-16 flex items-center justify-between px-4 border-b border-slate-700 shrink-0 z-50 shadow-md">
                
                {/* LEFT: File Navigation (Double Browser Part 1) */}
                <div className="flex items-center space-x-2 mr-4">
                     <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="text-slate-400 hover:text-white p-2 mr-2 hidden lg:block" title="Visa sidor">
                        <i className="fas fa-th-large"></i>
                    </button>
                    
                    <button 
                        onClick={() => hasPrevFile && onNavigateFile(allItems[currentFileIndex - 1])} 
                        disabled={!hasPrevFile}
                        className="w-8 h-8 rounded-full bg-slate-700 hover:bg-slate-600 disabled:opacity-30 flex items-center justify-center transition-colors"
                        title="Föregående fil"
                    >
                        <i className="fas fa-step-backward text-xs"></i>
                    </button>
                    
                    <div className="flex flex-col max-w-[150px] md:max-w-[250px]">
                        <span className="font-bold text-sm truncate">{item.name}</span>
                        <span className="text-[10px] text-slate-400 font-mono">Fil {currentFileIndex + 1} av {allItems.length}</span>
                    </div>

                    <button 
                        onClick={() => hasNextFile && onNavigateFile(allItems[currentFileIndex + 1])} 
                        disabled={!hasNextFile}
                        className="w-8 h-8 rounded-full bg-slate-700 hover:bg-slate-600 disabled:opacity-30 flex items-center justify-center transition-colors"
                        title="Nästa fil"
                    >
                        <i className="fas fa-step-forward text-xs"></i>
                    </button>
                </div>

                {/* CENTER: Page Navigation (Double Browser Part 2) - Only if multiple pages */}
                {totalPages > 1 && (
                    <div className="hidden md:flex items-center bg-slate-900/50 rounded-full px-4 py-1.5 border border-slate-700">
                         <button onClick={() => setActivePageIndex(Math.max(0, activePageIndex - 1))} disabled={activePageIndex === 0} className="text-slate-400 hover:text-white disabled:opacity-30 px-2">
                            <i className="fas fa-chevron-left"></i>
                         </button>
                         <span className="text-xs font-mono font-bold text-slate-200 mx-3 min-w-[50px] text-center">
                            Sida {activePageIndex + 1} / {totalPages}
                         </span>
                         <button onClick={() => setActivePageIndex(Math.min(totalPages - 1, activePageIndex + 1))} disabled={activePageIndex === totalPages - 1} className="text-slate-400 hover:text-white disabled:opacity-30 px-2">
                            <i className="fas fa-chevron-right"></i>
                         </button>
                    </div>
                )}

                {/* RIGHT: Save Actions */}
                <div className="flex items-center space-x-3">
                    <button onClick={handleCopyPageToPng} disabled={isSavingImage || isSavingThumbnail} className="bg-emerald-600 hover:bg-emerald-500 px-3 py-2 rounded-lg text-xs font-bold transition-colors flex items-center space-x-2 shadow-lg disabled:opacity-50 hidden sm:flex">
                        {isSavingImage ? <i className="fas fa-circle-notch fa-spin"></i> : <i className="fas fa-save"></i>}
                        <span className="hidden lg:inline">{isSavingImage ? 'Sparar...' : 'Spara som bild'}</span>
                    </button>
                    <button onClick={handleSaveAndClose} disabled={isSavingThumbnail} className="bg-indigo-600 hover:bg-indigo-500 px-5 py-2 rounded-lg text-xs font-bold transition-colors disabled:opacity-50 flex items-center gap-2 shadow-lg hover:shadow-indigo-500/20">
                        {isSavingThumbnail ? <i className="fas fa-circle-notch fa-spin"></i> : <i className="fas fa-check"></i>}
                        <span>{isSavingThumbnail ? 'Sparar...' : 'Klar'}</span>
                    </button>
                </div>
            </div>
            
            {/* --- WORKSPACE --- */}
            <div className="flex-1 flex overflow-hidden relative">
                
                {/* LEFT SIDEBAR: Page Thumbnails */}
                {isSidebarOpen && (
                    <div className="hidden lg:flex w-56 bg-[#222] border-r border-slate-700 flex-col overflow-y-auto custom-scrollbar shrink-0 shadow-inner">
                        <div className="p-4">
                            <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-4 pl-1">Sidor i filen</h4>
                            {Array.from({ length: totalPages }).map((_, idx) => (
                                <SidebarThumbnail 
                                    key={idx}
                                    pdfDocProxy={pdfDocProxy}
                                    pageIndex={idx}
                                    isActive={activePageIndex === idx}
                                    onClick={() => setActivePageIndex(idx)}
                                />
                            ))}
                        </div>
                    </div>
                )}
                
                {/* CENTER MAIN VIEW */}
                <div className="flex-1 bg-[#1a1a1a] relative flex items-center justify-center overflow-auto p-4 md:p-8 pb-20 lg:pb-8">
                     {isLoadingPreview && (
                         <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 z-20 backdrop-blur-sm">
                             <div className="w-16 h-16 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-4"></div>
                             <p className="text-white font-bold text-sm tracking-widest">Laddar förhandsvisning...</p>
                         </div>
                     )}
                     
                     {errorMsg && !isLoadingPreview && (
                         <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900 z-10">
                             <div className="bg-slate-800 p-8 rounded-2xl max-w-md text-center border border-slate-700 shadow-2xl">
                                 <i className="fas fa-exclamation-triangle text-4xl text-amber-500 mb-4"></i>
                                 <h3 className="text-white font-bold text-lg mb-2">Hoppsan!</h3>
                                 <p className="text-slate-300 text-sm mb-6">{errorMsg}</p>
                                 <button onClick={onClose} className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 font-bold text-sm">Stäng</button>
                             </div>
                         </div>
                     )}
                     
                     <div className="shadow-2xl bg-white relative transition-transform duration-200">
                         <canvas ref={mainCanvasRef} className="block max-w-full max-h-[75vh] md:max-h-[85vh] h-auto w-auto" />
                     </div>
                </div>
                
                {/* RIGHT PANEL: Tools (Modularized) */}
                <EditorToolsPanel 
                    activeSection={activeSection}
                    setActiveSection={setActiveSection}
                    currentConfig={currentConfig}
                    updateActiveConfig={updateActiveConfig}
                    pageMeta={getCurrentMeta()}
                    updateCurrentMeta={updateCurrentMeta}
                    focusedLineId={focusedLineId}
                    setFocusedLineId={setFocusedLineId}
                />
            </div>
        </div>
    );
};

export default FileEditorModal;