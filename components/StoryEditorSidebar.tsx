
import React, { useState } from 'react';
import { ChunkData, AppSettings, CompressionLevel } from '../types';
import AppLogo from './AppLogo';
import { ExportedFile } from './StoryEditor';

// Duplicate themes here to ensure standalone styling logic
const CHUNK_THEMES = [
    { border: 'border-indigo-500', bg: 'bg-indigo-500', text: 'text-indigo-700', lightBg: 'bg-indigo-50' },
    { border: 'border-emerald-500', bg: 'bg-emerald-500', text: 'text-emerald-700', lightBg: 'bg-emerald-50' },
    { border: 'border-amber-500', bg: 'bg-amber-500', text: 'text-amber-700', lightBg: 'bg-amber-50' },
    { border: 'border-rose-500', bg: 'bg-rose-500', text: 'text-rose-700', lightBg: 'bg-rose-50' },
    { border: 'border-cyan-500', bg: 'bg-cyan-500', text: 'text-cyan-700', lightBg: 'bg-cyan-50' }
];

interface StoryEditorSidebarProps {
    chunks: ChunkData[];
    settings: AppSettings;
    onUpdateSettings: (s: AppSettings) => void;
    bookTitle: string;
    isCompact: boolean; // Controls if we show just icons or full text
    onToggleCompact: () => void;
    showStatusLog: boolean;
    onToggleStatusLog: () => void;
    statusLog: string[];
    optimizingStatus: string;
    autoSaveStatus: string;
    activeChunkFilter: number | null;
    onSetActiveChunkFilter: (id: number | null) => void;
    exportedFiles: ExportedFile[];
    onTriggerShare: () => void;
}

const StoryEditorSidebar: React.FC<StoryEditorSidebarProps> = ({
    chunks,
    settings,
    onUpdateSettings,
    bookTitle,
    isCompact,
    onToggleCompact,
    showStatusLog,
    onToggleStatusLog,
    statusLog,
    optimizingStatus,
    autoSaveStatus,
    activeChunkFilter,
    onSetActiveChunkFilter,
    exportedFiles,
    onTriggerShare
}) => {
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    
    // Internal state for mobile expansion
    const [isMobileExpanded, setIsMobileExpanded] = useState(false);

    const renderContent = (compactMode: boolean) => (
      <>
        <div className={`bg-slate-50 border-b border-slate-100 relative ${compactMode ? 'flex justify-center p-4' : 'p-6'}`}>
             {!compactMode ? (
                 <div className="space-y-4">
                    <div>
                        <div className="flex justify-between items-start">
                             <h2 className="text-xl font-serif font-bold text-slate-900 leading-tight">Filer till FamilySearch</h2>
                             {/* Mobile collapse button */}
                             <button onClick={() => setIsMobileExpanded(false)} className="lg:hidden p-2 text-slate-400 hover:text-slate-600">
                                <i className="fas fa-chevron-down"></i>
                             </button>
                        </div>

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
                                        FamilySearch har en gräns på 15 MB per fil. Appen delar automatiskt upp din bok i PDF-filer (delar) som klarar denna gräns.
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
                                            <span>Brytpunkt (MB):</span>
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
                                            <span>Marginal (%):</span>
                                            <span className="text-slate-400">{settings.safetyMarginPercent || 0}%</span>
                                        </label>
                                        <input 
                                            type="range" min="0" max="20" step="1" 
                                            value={settings.safetyMarginPercent || 0} 
                                            onChange={(e) => onUpdateSettings({...settings, safetyMarginPercent: parseInt(e.target.value)})} 
                                            className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600 mt-2"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-bold text-slate-700 block mb-2">Bildkvalitet</label>
                                        <div className="flex bg-slate-200 p-1 rounded-lg">
                                            {(['low', 'medium', 'high'] as CompressionLevel[]).map(level => {
                                                const map = {
                                                    'low': { label: 'Hög', tooltip: 'Låg komprimering' },
                                                    'medium': { label: 'Medel', tooltip: 'Balanserad' },
                                                    'high': { label: 'Låg', tooltip: 'Hög komprimering' }
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
                            <div className="flex items-center space-x-1 cursor-pointer hover:bg-slate-200 rounded px-1 -ml-1 transition-colors" onClick={onToggleStatusLog}>
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
                 <button onClick={onToggleCompact} className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center hover:bg-slate-300 transition-colors">
                     <i className="fas fa-bars text-slate-600"></i>
                 </button>
             )}
        </div>
        
        {/* CHUNK METER LIST */}
        <div className={`flex-1 overflow-y-auto bg-slate-50/50 custom-scrollbar ${compactMode ? 'px-1' : 'p-4 space-y-3'}`}>
             {chunks.map((chunk, idx) => {
                 const theme = CHUNK_THEMES[idx % CHUNK_THEMES.length];
                 const isGreen = chunk.isSynced;
                 const isUploading = chunk.isUploading;
                 const sizeMB = (chunk.sizeBytes / (1024 * 1024));
                 const safetyFactor = (100 - (settings.safetyMarginPercent || 0)) / 100;
                 const effectiveMaxMB = settings.maxChunkSizeMB * safetyFactor;
                 const percentFilled = Math.min(100, (sizeMB / effectiveMaxMB) * 100);

                 if (compactMode) {
                     return (
                         <div key={chunk.id} onClick={onToggleCompact} className={`w-10 h-10 mx-auto my-2 rounded-full flex items-center justify-center text-xs font-bold shadow-sm cursor-pointer hover:scale-110 transition-transform text-white ${isGreen ? theme.bg : isUploading ? 'bg-indigo-500 animate-pulse' : theme.bg}`} title={chunk.title}>{chunk.id}</div>
                     );
                 }

                 return (
                     <div key={chunk.id} onClick={() => onSetActiveChunkFilter(activeChunkFilter === chunk.id ? null : chunk.id)} className={`group bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden cursor-pointer transition-all hover:shadow-md ${activeChunkFilter === chunk.id ? 'ring-2 ring-indigo-500 ring-offset-1' : ''}`}>
                         <div className="p-4">
                             <div className="flex justify-between items-center mb-3">
                                 <div className="flex items-center space-x-3"><span className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-black text-white ${theme.bg}`}>{chunk.id}</span><div><h3 className="text-sm font-bold text-slate-800">Del {chunk.id}</h3><p className="text-[10px] text-slate-400 font-medium">{chunk.items.length} objekt</p></div></div>
                                 <div className="text-right">
                                     {isGreen ? (<span className="text-[9px] font-black text-emerald-600 bg-emerald-50 px-2 py-1 rounded-md uppercase tracking-wider flex items-center gap-1 border border-emerald-100"><i className="fas fa-check-circle"></i> KLAR</span>) : isUploading ? (<span className="text-[9px] font-black text-indigo-600 bg-indigo-50 px-2 py-1 rounded-md uppercase tracking-wider animate-pulse flex items-center gap-1"><i className="fas fa-sync fa-spin"></i> SPARAR...</span>) : (<span className="text-[9px] font-bold text-slate-400 bg-slate-100 px-2 py-1 rounded-md uppercase tracking-wider">Redo</span>)}
                                 </div>
                             </div>
                             <div className="relative w-full h-3 bg-slate-100 rounded-full overflow-hidden mb-2"><div className={`absolute top-0 left-0 h-full transition-all duration-1000 ${theme.bg}`} style={{ width: `${percentFilled}%` }}></div>{settings.safetyMarginPercent > 0 && (<div className="absolute top-0 bottom-0 right-0 bg-red-100/50 border-l border-red-200" style={{ width: `${settings.safetyMarginPercent}%` }} title="Säkerhetsmarginal"></div>)}</div>
                             <div className="flex justify-between text-[10px] font-bold text-slate-500"><span>{sizeMB.toFixed(1)} MB</span><span>{settings.maxChunkSizeMB} MB Max</span></div>
                         </div>
                     </div>
                 );
             })}
             
             {exportedFiles.length > 0 && !compactMode && (
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
        
        <div className={`p-4 bg-white border-t border-slate-100 ${compactMode ? 'flex justify-center' : ''}`}>
             {!compactMode ? (
                 <button onClick={onTriggerShare} className="w-full text-left bg-white border border-slate-200 hover:border-indigo-300 hover:shadow-lg rounded-[1.5rem] p-4 transition-all group">
                    <div className="flex items-center space-x-4"><div className="shrink-0 group-hover:scale-105 transition-transform"><AppLogo variant="sunWindow" className="w-16 h-16" /></div><div><h2 className="text-xl font-serif font-bold text-slate-900 group-hover:text-indigo-700 transition-colors">Dela oändligt</h2><p className="text-[10px] text-slate-500 font-medium mt-1 uppercase tracking-wider">Tryck för att dela</p></div><div className="ml-auto text-slate-300 group-hover:text-indigo-500 group-hover:translate-x-1 transition-all"><i className="fas fa-chevron-right text-lg"></i></div></div>
                 </button>
             ) : (
                 <button onClick={onTriggerShare} className="w-10 h-10 bg-indigo-50 hover:bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 transition-colors"><i className="fas fa-share-nodes"></i></button>
             )}
        </div>
      </>
    );

    return (
        <>
            {/* DESKTOP SIDEBAR (HIDDEN ON MOBILE unless expanded logic handled differently, usually visible > lg) */}
            <div className={`hidden lg:flex flex-col h-full bg-white border-l border-slate-200 shadow-xl transition-all duration-300 relative ${isCompact ? 'w-16' : 'w-80'}`}>
                {renderContent(isCompact)}
                
                {/* Overlay logic for desktop compact mode */}
                {isCompact && isMobileExpanded && ( // Reuse isMobileExpanded state for overlay trigger on desktop if desired, or simpler logic
                    <div className="absolute top-0 right-full w-80 h-full bg-white border-r border-slate-200 shadow-2xl z-30 flex flex-col animate-in slide-in-from-right-4">
                        <div className="flex justify-end p-2 border-b border-slate-100">
                             <button onClick={() => setIsMobileExpanded(false)} className="text-slate-400 hover:text-slate-600 p-2"><i className="fas fa-times"></i></button>
                        </div>
                        {renderContent(false)}
                    </div>
                )}
            </div>

            {/* MOBILE BOTTOM BAR (FIXED) */}
            <div className={`lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 z-30 transition-all duration-300 shadow-[0_-4px_20px_rgba(0,0,0,0.1)] ${isMobileExpanded ? 'h-[80vh] rounded-t-2xl' : 'h-16'}`}>
                
                {!isMobileExpanded ? (
                    // COLLAPSED MOBILE BAR
                    <div className="flex items-center justify-between px-4 h-full" onClick={() => setIsMobileExpanded(true)}>
                         <div className="flex items-center gap-3">
                             <div className="flex -space-x-2 overflow-hidden">
                                {chunks.slice(0, 3).map((chunk, i) => (
                                    <div key={chunk.id} className={`w-8 h-8 rounded-full border-2 border-white flex items-center justify-center text-[10px] font-bold text-white ${chunk.isSynced ? 'bg-emerald-500' : 'bg-slate-400'}`}>
                                        {chunk.id}
                                    </div>
                                ))}
                                {chunks.length > 3 && <div className="w-8 h-8 rounded-full border-2 border-white bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-500">+{chunks.length - 3}</div>}
                             </div>
                             <div className="flex flex-col">
                                 <span className="text-xs font-bold text-slate-800">Filer till FamilySearch</span>
                                 <span className="text-[10px] text-slate-500">{chunks.length} delar redo</span>
                             </div>
                         </div>
                         <button className="w-8 h-8 bg-indigo-50 rounded-full flex items-center justify-center text-indigo-600">
                            <i className="fas fa-chevron-up"></i>
                         </button>
                    </div>
                ) : (
                    // EXPANDED MOBILE DRAWER
                    <div className="flex flex-col h-full rounded-t-2xl overflow-hidden">
                        {renderContent(false)}
                    </div>
                )}
            </div>
        </>
    );
};

export default StoryEditorSidebar;
