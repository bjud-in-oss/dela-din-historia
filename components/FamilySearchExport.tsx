
import React, { useState, useMemo, useEffect } from 'react';
import { DriveFile, AppSettings, FileType } from '../types';
import { generateCombinedPDF, calculateChunks, processFileForCache } from '../services/pdfService';
import { uploadToDrive, createFolder } from '../services/driveService';
import JSZip from 'jszip';
import AppLogo from './AppLogo';

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

    // Calculate chunks in real-time
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
                    <div className="flex items-center space-x-4">
                         <div className="shrink-0">
                            <AppLogo variant="phase3" className="w-16 h-16" />
                         </div>
                         <h1 className="text-2xl font-serif font-bold text-slate-900">Dela på FamilySearch</h1>
                    </div>
                </div>

                {/* Main Download Card */}
                <div className="bg-slate-900 rounded-[1.5rem] shadow-xl overflow-hidden mb-12 border border-slate-900 relative">
                    <div className="p-8 text-white flex flex-col md:flex-row items-center justify-between">
                        <div>
                             <h2 className="text-xl font-bold mb-1">Ladda ned boken "{bookTitle}"</h2>
                             <p className="opacity-80 font-serif italic text-sm">
                                 {items.length} sidor över {chunks.length} filer • Redo att dela med framtida generationer
                             </p>
                        </div>
                        <div className="mt-6 md:mt-0">
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
                         <div className="p-4 bg-indigo-50 text-indigo-900 text-center text-sm font-bold border-t border-indigo-100 animate-pulse">
                             {progress.msg}
                         </div>
                    )}
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
                    
                    {/* Alternatives Column (2/3 width) */}
                    <div className="xl:col-span-2 space-y-8">
                        
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

                    {/* AI Tip Column (1/3 width) - LIGHTER DESIGN */}
                    <div className="space-y-6">
                         <h3 className="text-xl font-bold text-slate-900 flex items-center">
                            <span className="w-8 h-8 bg-purple-50 text-purple-600 rounded-lg flex items-center justify-center mr-3 text-sm">
                                <i className="fas fa-magic"></i>
                            </span>
                            Tips: Förfina berättelsen
                        </h3>

                        <div className="bg-white border border-slate-200 rounded-[1.5rem] shadow-sm overflow-hidden">
                            <div className="p-6 relative">
                                 <div className="relative z-10">
                                     <div className="w-12 h-12 bg-purple-50 rounded-xl flex items-center justify-center mb-4 text-purple-600">
                                        <i className="fas fa-robot text-2xl"></i>
                                     </div>

                                     <h4 className="text-lg font-bold mb-2 text-slate-900">Med NotebookLM</h4>
                                     <p className="text-slate-500 text-xs leading-relaxed mb-4">
                                        Skapa proffsiga berättelser av dina PDF-filer:
                                     </p>

                                     <ol className="space-y-2 mb-6 text-[11px] text-slate-600 list-decimal list-inside font-medium bg-slate-50 p-3 rounded-xl border border-slate-100">
                                         <li>"Skapa anteckningsbok"</li>
                                         <li>"Lägga till källor" (Din PDF)</li>
                                         <li>Skapa ljud/text i <strong>"Studio"</strong></li>
                                         <li>Granska och ladda ned</li>
                                     </ol>
                                     
                                     <div className="bg-amber-50 border border-amber-100 p-3 rounded-xl mb-6">
                                        <p className="text-[10px] text-amber-800 leading-tight">
                                            <strong className="text-amber-600 block mb-1">Tips:</strong>
                                            Om berättelserna inte blev bra, skriv mer information i din bok och prova igen.
                                        </p>
                                     </div>

                                     <a href="https://notebooklm.google.com/" target="_blank" className="w-full py-3 bg-purple-50 text-purple-700 font-bold rounded-xl hover:bg-purple-100 transition-all flex items-center justify-center space-x-2 text-sm">
                                         <span>Öppna NotebookLM</span>
                                         <i className="fas fa-external-link-alt text-xs"></i>
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
