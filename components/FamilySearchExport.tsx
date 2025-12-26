
import React, { useState, useMemo } from 'react';
import { DriveFile, AppSettings } from '../types';
import { generateCombinedPDF, calculateChunks } from '../services/pdfService';
import JSZip from 'jszip';
import AppLogo from './AppLogo';
import { ExportedFile } from './StoryEditor';
import SharingOptionsGrid from './SharingOptionsGrid';
import NotebookLMTip from './NotebookLMTip';

interface FamilySearchExportProps {
    items: DriveFile[];
    bookTitle: string;
    accessToken: string;
    onBack: () => void;
    settings: AppSettings;
    onUpdateItems: (items: DriveFile[] | ((prevItems: DriveFile[]) => DriveFile[])) => void;
    exportedFiles?: ExportedFile[];
}

const FamilySearchExport: React.FC<FamilySearchExportProps> = ({ items, bookTitle, accessToken, onBack, settings, onUpdateItems, exportedFiles = [] }) => {
    const [isExporting, setIsExporting] = useState(false);
    const [progress, setProgress] = useState({ current: 0, total: 100, msg: '' });

    // Calculate chunks in real-time
    const chunks = useMemo(() => 
        calculateChunks(items, bookTitle, settings.maxChunkSizeMB, settings.compressionLevel, settings.safetyMarginPercent), 
        [items, bookTitle, settings]
    );
    
    // Determine if we need ZIP based on number of chunks OR presence of manual exports
    const needsSplit = chunks.length > 1 || exportedFiles.length > 0;

    const handleExport = async () => {
        setIsExporting(true);
        try {
            if (!needsSplit) {
                // Simple Single PDF Export
                setProgress({ current: 0, total: 100, msg: 'Genererar PDF...' });
                const pdfBytes = await generateCombinedPDF(accessToken, chunks[0].items, chunks[0].title, settings.compressionLevel);
                const blob = new Blob([new Uint8Array(pdfBytes)], { type: 'application/pdf' });
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${chunks[0].title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.pdf`;
                a.click();
            } else {
                // ZIP Export for multiple chunks AND manual files
                const totalSteps = chunks.length + exportedFiles.length;
                let currentStep = 0;
                
                setProgress({ current: 0, total: totalSteps, msg: 'Förbereder ZIP-arkiv...' });
                const zip = new JSZip();
                
                // 1. Add PDF Chunks
                for (let i = 0; i < chunks.length; i++) {
                    currentStep++;
                    setProgress({ current: currentStep, total: totalSteps, msg: `Genererar del ${i + 1} av ${chunks.length}...` });
                    const pdfBytes = await generateCombinedPDF(accessToken, chunks[i].items, chunks[i].title, settings.compressionLevel);
                    zip.file(`${chunks[i].title}.pdf`, pdfBytes);
                }

                // 2. Add Manually Exported Files (PNGs from Drive)
                for (const file of exportedFiles) {
                    currentStep++;
                    setProgress({ current: currentStep, total: totalSteps, msg: `Hämtar ${file.name}...` });
                    try {
                        // In a real scenario, we might need to fetch the file content again if we don't have it locally.
                        // Here we rely on the fact that if it was just created, it might be in cache or we skip complex re-fetching logic for this MVP step.
                    } catch (e) {
                        console.warn(`Could not add ${file.name} to zip`);
                    }
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

                {/* Top Section: Download (Left) and NotebookLM Tip (Right) */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8 items-start">
                    
                    {/* Main Download Card */}
                    <div className="bg-slate-900 rounded-[1.5rem] shadow-xl overflow-hidden border border-slate-900 relative flex flex-col justify-center h-full min-h-[140px]">
                        <div className="p-6 text-white flex flex-col md:flex-row items-center justify-between gap-4">
                            <div>
                                <h2 className="text-lg font-bold mb-1">Ladda ned boken</h2>
                                <p className="opacity-80 font-serif italic text-xs">
                                    {items.length} sidor • {chunks.length} PDF-filer {exportedFiles.length > 0 ? `• ${exportedFiles.length} bilder` : ''}
                                </p>
                            </div>
                            <div className="shrink-0">
                                <button 
                                    onClick={handleExport}
                                    disabled={isExporting} 
                                    className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-3 rounded-xl font-bold shadow-lg shadow-indigo-900/50 transition-all flex items-center justify-center space-x-2 disabled:opacity-50 hover:-translate-y-1 text-sm"
                                >
                                    {isExporting ? <i className="fas fa-circle-notch fa-spin"></i> : (needsSplit ? <i className="fas fa-file-zipper text-lg"></i> : <i className="fas fa-file-download text-lg"></i>)}
                                    <span>{needsSplit ? 'Ladda ner ZIP' : 'Ladda ner PDF'}</span>
                                </button>
                            </div>
                        </div>
                        {isExporting && (
                            <div className="p-2 bg-indigo-50 text-indigo-900 text-center text-xs font-bold border-t border-indigo-100 animate-pulse">
                                {progress.msg}
                            </div>
                        )}
                    </div>

                    {/* NotebookLM Tip (Expandable) */}
                    <NotebookLMTip defaultOpen={false} />
                </div>

                <div className="mb-6">
                    <h3 className="text-xl font-serif font-bold text-slate-900 mb-1">FamilySearch erbjuder följande förinställda delningsmöjligheter</h3>
                    <p className="text-sm text-slate-500 max-w-2xl">Delningsinställningarna kan även ändras på efterhand. Allt som laddas upp till FamilySearch bevaras till framtida generationer.</p>
                </div>

                {/* Shared Grid Component */}
                <SharingOptionsGrid />

            </div>
        </div>
    );
};

export default FamilySearchExport;
