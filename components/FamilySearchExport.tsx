
import React, { useState, useMemo, useEffect } from 'react';
import { DriveFile, AppSettings, FileType } from '../types';
import { generateCombinedPDF, calculateChunks, processFileForCache } from '../services/pdfService';
import { uploadToDrive, createFolder } from '../services/driveService';
import JSZip from 'jszip';

interface FamilySearchExportProps {
    items: DriveFile[];
    bookTitle: string;
    accessToken: string;
    onBack: () => void;
    settings: AppSettings;
    onUpdateItems: (items: DriveFile[] | ((prevItems: DriveFile[]) => DriveFile[])) => void;
}

const FamilySearchExport: React.FC<FamilySearchExportProps> = ({ items, bookTitle, accessToken, onBack, settings, onUpdateItems }) => {
    const [isExporting, setIsExporting] = useState(false);
    const [progress, setProgress] = useState({ current: 0, total: 100, msg: '' });
    const [precision, setPrecision] = useState(0);

    // BACKGROUND PROCESSING EFFECT
    // Automatically processes items to get exact size when this view is open
    useEffect(() => {
        let isCancelled = false;
        
        const processNextItem = async () => {
            if (isCancelled) return;

            // Find first image that needs processing
            const itemToProcess = items.find(item => 
                item.type === FileType.IMAGE && 
                (!item.processedBuffer || item.compressionLevelUsed !== settings.compressionLevel)
            );

            if (!itemToProcess) return;

            try {
                const { buffer, size } = await processFileForCache(itemToProcess, accessToken, settings.compressionLevel);
                
                if (!isCancelled) {
                    onUpdateItems((prevItems: DriveFile[]) => prevItems.map(prev => 
                        prev.id === itemToProcess.id 
                        ? { ...prev, processedBuffer: buffer, processedSize: size, compressionLevelUsed: settings.compressionLevel }
                        : prev
                    ));
                }
            } catch (e) {
                console.error("Auto-process failed for", itemToProcess.name);
            }
        };

        // Run immediately and then whenever items change (until all done)
        const timer = setTimeout(processNextItem, 100);
        return () => {
            isCancelled = true;
            clearTimeout(timer);
        };
    }, [items, accessToken, settings.compressionLevel]);

    // Calculate Precision Metric
    useEffect(() => {
        const images = items.filter(i => i.type === FileType.IMAGE);
        if (images.length === 0) {
            setPrecision(100);
            return;
        }
        const processed = images.filter(i => i.processedSize && i.compressionLevelUsed === settings.compressionLevel);
        const p = Math.round((processed.length / images.length) * 100);
        setPrecision(p);
    }, [items, settings.compressionLevel]);

    // Calculate chunks in real-time with the full settings object
    const chunks = useMemo(() => 
        calculateChunks(items, bookTitle, settings.maxChunkSizeMB, settings.compressionLevel, settings.safetyMarginPercent), 
        [items, bookTitle, settings]
    );
    
    const needsSplit = chunks.length > 1;

    const handleExport = async () => {
        setIsExporting(true);
        try {
            if (chunks.length === 1) {
                setProgress({ current: 0, total: 100, msg: 'Genererar PDF...' });
                const pdfBytes = await generateCombinedPDF(accessToken, chunks[0].items, chunks[0].title, settings.compressionLevel);
                const blob = new Blob([new Uint8Array(pdfBytes)], { type: 'application/pdf' });
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${chunks[0].title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.pdf`;
                a.click();
            } else {
                // ZIP Export for multiple chunks
                setProgress({ current: 0, total: chunks.length, msg: 'Genererar ZIP-arkiv...' });
                const zip = new JSZip();
                
                for (let i = 0; i < chunks.length; i++) {
                    setProgress({ current: i + 1, total: chunks.length, msg: `Genererar del ${i + 1} av ${chunks.length}...` });
                    const pdfBytes = await generateCombinedPDF(accessToken, chunks[i].items, chunks[i].title, settings.compressionLevel);
                    zip.file(`${chunks[i].title}.pdf`, pdfBytes);
                }
                
                setProgress({ current: 100, total: 100, msg: 'Komprimerar...' });
                const content = await zip.generateAsync({ type: 'blob' });
                const url = window.URL.createObjectURL(content);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${bookTitle.replace(/[^a-z0-9]/gi, '_')}_Archive.zip`;
                a.click();
            }
        } catch (e) {
            console.error(e);
            alert("Export misslyckades.");
        } finally {
            setIsExporting(false);
            setProgress({ current: 0, total: 100, msg: '' });
        }
    };

    return (
        <div className="h-full overflow-y-auto bg-slate-50 custom-scrollbar">
            <div className="max-w-6xl mx-auto p-8 pb-32">
                
                {/* Header with Close */}
                <div className="flex justify-between items-center mb-8">
                    <button onClick={onBack} className="flex items-center space-x-2 text-slate-500 hover:text-slate-900 transition-colors bg-white px-4 py-2 rounded-full shadow-sm border border-slate-200">
                        <i className="fas fa-arrow-left"></i>
                        <span className="font-bold text-sm">Tillbaka till redigeraren</span>
                    </button>
                    <h1 className="text-2xl font-serif font-bold text-slate-900">Exportera & Bevara</h1>
                </div>

                {/* Status Section for Splitting */}
                {needsSplit ? (
                    <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 mb-8 flex items-start space-x-4 shadow-sm">
                        <div className="w-10 h-10 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center shrink-0">
                            <i className="fas fa-cut text-lg"></i>
                        </div>
                        <div className="flex-1 w-full">
                            <h3 className="font-bold text-amber-900">Boken har delats upp i {chunks.length} delar</h3>
                            <p className="text-sm text-amber-800 mt-1 mb-3">
                                För att möta gränsen på {settings.maxChunkSizeMB} MB per fil har vi automatiskt delat upp din bok. 
                                Du kan ladda ner alla delar som ett ZIP-arkiv. Alla delar är redan sparade på din Drive.
                            </p>
                            
                            {/* Precision Meter */}
                            <div className="mb-4">
                                <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-widest text-amber-900/60 mb-1">
                                    <span>{precision < 100 ? `Beräknar exakt storlek: ${precision}%` : 'Exakt storlek beräknad'}</span>
                                    {precision < 100 && <i className="fas fa-sync fa-spin"></i>}
                                </div>
                                <div className="h-1.5 w-full bg-amber-200/50 rounded-full overflow-hidden">
                                    <div 
                                        className={`h-full transition-all duration-300 ${precision === 100 ? 'bg-emerald-500' : 'bg-amber-500'}`} 
                                        style={{ width: `${precision}%` }}
                                    ></div>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                {chunks.map((chunk, idx) => (
                                    <div key={idx} className="bg-white/60 px-3 py-2 rounded-lg text-xs font-medium text-amber-900 border border-amber-100 flex justify-between">
                                        <span>{chunk.title}</span>
                                        <span className="opacity-60">~{chunk.estimatedSizeMB.toFixed(1)} MB</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6 mb-8 flex items-start space-x-4 shadow-sm">
                        <div className="w-10 h-10 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center shrink-0">
                            <i className="fas fa-check text-lg"></i>
                        </div>
                         <div className="flex-1 w-full">
                            <h3 className="font-bold text-emerald-900">Optimerad storlek</h3>
                            <p className="text-sm text-emerald-800 mb-3">
                                Din bok ({chunks[0]?.estimatedSizeMB.toFixed(1)} MB) är redo. Den är redan sparad på din Drive.
                            </p>

                            {/* Precision Meter for Single Chunk */}
                            <div className="mb-1">
                                <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-widest text-emerald-900/60 mb-1">
                                    <span>{precision < 100 ? `Beräknar exakt storlek: ${precision}%` : 'Exakt storlek beräknad'}</span>
                                    {precision < 100 && <i className="fas fa-sync fa-spin"></i>}
                                </div>
                                <div className="h-1.5 w-full bg-emerald-200/50 rounded-full overflow-hidden">
                                    <div 
                                        className={`h-full transition-all duration-300 ${precision === 100 ? 'bg-emerald-500' : 'bg-emerald-400'}`} 
                                        style={{ width: `${precision}%` }}
                                    ></div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Main Export Card */}
                <div className="bg-white rounded-[2rem] shadow-xl overflow-hidden mb-12 border border-slate-100 relative">
                    <div className="bg-slate-900 p-8 text-white flex flex-col md:flex-row items-center justify-between">
                        <div>
                             <h2 className="text-3xl font-black mb-2">{bookTitle}</h2>
                             <p className="opacity-80 font-serif italic text-lg">{items.length} sidor • Redo för arkivering</p>
                        </div>
                        <div className="mt-6 md:mt-0 flex flex-col sm:flex-row space-y-3 sm:space-y-0 sm:space-x-4">
                            <button 
                                onClick={handleExport}
                                disabled={isExporting} 
                                className="bg-indigo-600 hover:bg-indigo-500 text-white px-8 py-4 rounded-xl font-bold shadow-lg shadow-indigo-900/50 transition-all flex items-center justify-center space-x-3 disabled:opacity-50 hover:-translate-y-1"
                            >
                                {isExporting ? <i className="fas fa-circle-notch fa-spin"></i> : (needsSplit ? <i className="fas fa-file-zipper text-xl"></i> : <i className="fas fa-file-download text-xl"></i>)}
                                <span>{needsSplit ? 'Ladda ner ZIP' : 'Ladda ner PDF'}</span>
                            </button>
                        </div>
                    </div>
                    {isExporting && (
                         <div className="p-4 bg-indigo-50 text-indigo-900 text-center text-sm font-bold border-b border-indigo-100 animate-pulse">
                             {progress.msg}
                         </div>
                    )}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    
                    {/* Alternatives Column (2/3 width) */}
                    <div className="lg:col-span-2 space-y-8">
                        <div className="flex items-center justify-between">
                            <h3 className="text-xl font-bold text-slate-900 flex items-center">
                                <span className="w-8 h-8 bg-emerald-100 text-emerald-600 rounded-lg flex items-center justify-center mr-3 text-sm">
                                    <i className="fas fa-tree"></i>
                                </span>
                                Dela på FamilySearch
                            </h3>
                            <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-100">
                                <i className="fas fa-infinity mr-1"></i> Gratis för alltid
                            </span>
                        </div>
                        
                        {/* PRIVAT DELNING */}
                        <div>
                            <h4 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-4 ml-1">Privat (Familj & Släkt)</h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <ShareOptionCard 
                                    icon="fa-users"
                                    color="slate"
                                    title="Privata Stories"
                                    subtitle="På Together av FamilySearch"
                                    link="https://www.familysearch.org/en/discovery/together/stories"
                                    details={{
                                        service: "Stories - spara privata bilder och texter via guider",
                                        target: "Familjeanpassat för barn och unga i släktgrupper.",
                                        format: "Text och bild",
                                        persistence: "Bevaras för alltid men faller ej i glömska om unga delar nutidshistoria."
                                    }}
                                />
                                <ShareOptionCard 
                                    icon="fa-user-lock"
                                    color="slate"
                                    title="Privata Minnen"
                                    subtitle="På Levande Person (Family Tree)"
                                    link="https://www.familysearch.org/en/tree/private-people"
                                    details={{
                                        service: "Personliga minnen om levande - spara privata källdokument",
                                        target: "Familj och släkt i släktgrupper",
                                        format: "PDF, Ljud, Text, Bild",
                                        persistence: "Bevaras för alltid. Kan flyttas till publika trädet efter bortgång."
                                    }}
                                />
                            </div>
                        </div>

                        {/* OFFENTLIG DELNING */}
                        <div>
                            <h4 className="text-sm font-black text-emerald-600 uppercase tracking-widest mb-4 ml-1">Offentligt (Synligt för alla)</h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <ShareOptionCard 
                                    icon="fa-rss"
                                    color="emerald"
                                    title="Offentlig Feed"
                                    subtitle="På Together av FamilySearch"
                                    link="https://www.familysearch.org/en/discovery/together/feed"
                                    details={{
                                        service: "Feed - spara bild och text om släkten i ett flöde",
                                        target: "Familj och släkt",
                                        format: "Text och bild",
                                        persistence: "Tips: Dela offentligt för att slippa minnas vad som är privat."
                                    }}
                                />
                                <ShareOptionCard 
                                    icon="fa-images"
                                    color="emerald"
                                    title="Offentlig Gallery"
                                    subtitle="På Memories av FamilySearch"
                                    link="https://www.familysearch.org/en/memories/gallery"
                                    details={{
                                        service: "Memories Gallery",
                                        target: "Släktforskare och allmänhet",
                                        format: "Bild, ljud, text och PDF",
                                        persistence: "Använder samma delningsguide som personliga minnen men för offentligt bruk."
                                    }}
                                />
                            </div>
                        </div>
                    </div>

                    {/* AI Tip Column (1/3 width) */}
                    <div className="space-y-6">
                         <h3 className="text-xl font-bold text-slate-900 flex items-center">
                            <span className="w-8 h-8 bg-purple-100 text-purple-600 rounded-lg flex items-center justify-center mr-3 text-sm">
                                <i className="fas fa-magic"></i>
                            </span>
                            Förfina berättelsen
                        </h3>

                        <div className="bg-gradient-to-br from-purple-600 to-indigo-700 p-1 rounded-[2rem] shadow-xl text-white">
                            <div className="bg-slate-900/40 backdrop-blur-sm p-6 rounded-[1.8rem] h-full relative overflow-hidden">
                                 {/* Background decoration */}
                                 <div className="absolute top-0 right-0 -mt-10 -mr-10 w-40 h-40 bg-purple-500 rounded-full opacity-30 blur-3xl"></div>
                                 <div className="absolute bottom-0 left-0 -mb-10 -ml-10 w-40 h-40 bg-indigo-500 rounded-full opacity-30 blur-3xl"></div>
                                 
                                 <div className="relative z-10">
                                     <div className="w-16 h-16 bg-white/10 rounded-2xl flex items-center justify-center mb-6 border border-white/20 shadow-inner">
                                        <i className="fas fa-robot text-3xl text-purple-300"></i>
                                     </div>

                                     <h4 className="text-xl font-black mb-3 leading-tight">Med NotebookLM</h4>
                                     <p className="text-purple-100 text-xs leading-relaxed mb-4 font-medium">
                                        Skapa proffsiga berättelser genom att:
                                     </p>

                                     <ol className="space-y-2 mb-6 text-[11px] text-purple-50 list-decimal list-inside font-medium bg-black/20 p-3 rounded-xl border border-white/10">
                                         <li>"Skapa anteckningsbok"</li>
                                         <li>"Lägga till källor" (Din PDF)</li>
                                         <li>Skapa ljud/text i <strong>"Studio"</strong></li>
                                         <li>Granska och ladda ned</li>
                                     </ol>
                                     
                                     <div className="bg-amber-500/20 border border-amber-300/30 p-3 rounded-xl mb-6">
                                        <p className="text-[10px] text-amber-100 leading-tight">
                                            <strong className="text-amber-300 block mb-1">Tips:</strong>
                                            Om berättelserna inte blev bra, skriv då mer information om det du saknar i källorna och skapa om dokumenten igen.
                                        </p>
                                     </div>

                                     <a href="https://notebooklm.google.com/" target="_blank" className="w-full py-4 bg-white text-purple-900 font-black rounded-xl shadow-lg hover:bg-purple-50 transition-all flex items-center justify-center space-x-2 group">
                                         <span>Öppna NotebookLM</span>
                                         <i className="fas fa-external-link-alt text-xs group-hover:translate-x-1 transition-transform"></i>
                                     </a>
                                 </div>
                            </div>
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
};

const ShareOptionCard = ({ icon, color, title, subtitle, link, details }: any) => {
    const [isOpen, setIsOpen] = useState(false);
    const theme = color === 'emerald' 
        ? { bg: 'bg-white', border: 'border-slate-200 hover:border-emerald-400', iconBg: 'bg-emerald-50', iconText: 'text-emerald-600', link: 'text-emerald-600' }
        : { bg: 'bg-white', border: 'border-slate-200 hover:border-slate-400', iconBg: 'bg-slate-100', iconText: 'text-slate-600', link: 'text-indigo-600' };

    return (
        <div className={`${theme.bg} rounded-2xl shadow-sm border ${theme.border} transition-all group overflow-hidden`}>
            <div className="p-5 cursor-pointer" onClick={() => setIsOpen(!isOpen)}>
                <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                        <div className={`w-12 h-12 ${theme.iconBg} ${theme.iconText} rounded-xl flex items-center justify-center text-xl font-black shadow-sm group-hover:scale-110 transition-transform shrink-0`}>
                            <i className={`fas ${icon}`}></i>
                        </div>
                        <div>
                            <h4 className="font-bold text-slate-900 text-sm">{title}</h4>
                            <p className="text-xs text-slate-500">{subtitle}</p>
                        </div>
                    </div>
                    <div className="text-slate-300">
                        <i className={`fas fa-chevron-${isOpen ? 'up' : 'down'} transition-transform`}></i>
                    </div>
                </div>
            </div>
            
            {isOpen && (
                <div className="px-5 pb-5 pt-0 animate-in slide-in-from-top-2">
                    <div className="h-px bg-slate-100 mb-4"></div>
                    <div className="space-y-3 text-xs text-slate-600 leading-relaxed">
                        <p><strong className="text-slate-900">Tjänst:</strong> {details.service}</p>
                        <p><strong className="text-slate-900">Målgrupp:</strong> {details.target}</p>
                        <p><strong className="text-slate-900">Format:</strong> {details.format}</p>
                        <p className="italic text-slate-500 border-l-2 border-slate-200 pl-2">{details.persistence}</p>
                        <div className="pt-2">
                            <a href={link} target="_blank" className={`font-bold ${theme.link} hover:underline inline-flex items-center`}>
                                Öppna tjänsten <i className="fas fa-external-link-alt ml-2"></i>
                            </a>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default FamilySearchExport;
