
import React, { useState } from 'react';
import AppLogo from './AppLogo';
import { TextConfig, RichTextLine, PageMetadata } from '../types';
import { DEFAULT_TEXT_CONFIG, DEFAULT_FOOTER_CONFIG } from '../services/pdfService';

interface EditorToolsPanelProps {
    activeSection: 'header' | 'footer';
    setActiveSection: (section: 'header' | 'footer') => void;
    currentConfig: TextConfig;
    updateActiveConfig: (key: keyof TextConfig, value: any) => void;
    pageMeta: PageMetadata;
    updateCurrentMeta: (updates: Partial<PageMetadata>) => void;
    focusedLineId: string | null;
    setFocusedLineId: (id: string | null) => void;
}

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

const EditorToolsPanel: React.FC<EditorToolsPanelProps> = ({
    activeSection,
    setActiveSection,
    currentConfig,
    updateActiveConfig,
    pageMeta,
    updateCurrentMeta,
    focusedLineId,
    setFocusedLineId
}) => {
    const [isStyleOpen, setIsStyleOpen] = useState(false);
    const [isFooterHeightOpen, setIsFooterHeightOpen] = useState(false);
    
    // Mobile expand state
    const [isMobileExpanded, setIsMobileExpanded] = useState(false);

    const renderContent = () => (
        <>
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between shrink-0">
                <div className="flex items-center space-x-3">
                    <div className="shrink-0"><AppLogo variant="phase2" className="w-8 h-8" /></div>
                    <h3 className="font-bold text-slate-800 text-lg leading-tight">Berätta kortfattat</h3>
                </div>
                {/* Mobile Collapse Button */}
                <button 
                    onClick={() => setIsMobileExpanded(false)} 
                    className="lg:hidden p-2 text-slate-400 hover:text-slate-600"
                >
                    <i className="fas fa-chevron-down"></i>
                </button>
            </div>
            
            <div className="bg-white p-3 border-b border-slate-200 flex flex-wrap gap-2 shrink-0">
                <div className="flex bg-slate-100 rounded p-1">
                    <button onClick={() => updateActiveConfig('isBold', !currentConfig.isBold)} className={`w-8 h-8 rounded text-xs transition-all ${currentConfig.isBold ? 'bg-white shadow text-indigo-600' : 'text-slate-500 hover:bg-slate-200'}`} title="Fetstil"><i className="fas fa-bold"></i></button>
                    <button onClick={() => updateActiveConfig('isItalic', !currentConfig.isItalic)} className={`w-8 h-8 rounded text-xs transition-all ${currentConfig.isItalic ? 'bg-white shadow text-indigo-600' : 'text-slate-500 hover:bg-slate-200'}`} title="Kursiv"><i className="fas fa-italic"></i></button>
                </div>
                <div className="flex bg-slate-100 rounded p-1">
                    <button onClick={() => updateActiveConfig('alignment', 'left')} className={`w-8 h-8 rounded text-xs transition-all ${currentConfig.alignment === 'left' ? 'bg-white shadow text-indigo-600' : 'text-slate-500 hover:bg-slate-200'}`} title="Vänsterjustera"><i className="fas fa-align-left"></i></button>
                    <button onClick={() => updateActiveConfig('alignment', 'center')} className={`w-8 h-8 rounded text-xs transition-all ${currentConfig.alignment === 'center' ? 'bg-white shadow text-indigo-600' : 'text-slate-500 hover:bg-slate-200'}`} title="Centrera"><i className="fas fa-align-center"></i></button>
                    <button onClick={() => updateActiveConfig('alignment', 'right')} className={`w-8 h-8 rounded text-xs transition-all ${currentConfig.alignment === 'right' ? 'bg-white shadow text-indigo-600' : 'text-slate-500 hover:bg-slate-200'}`} title="Högerjustera"><i className="fas fa-align-right"></i></button>
                </div>
                {activeSection === 'header' && (
                    <div className="flex bg-slate-100 rounded p-1">
                        <button onClick={() => updateActiveConfig('verticalPosition', 'top')} className={`w-8 h-8 rounded text-xs transition-all ${currentConfig.verticalPosition === 'top' ? 'bg-white shadow text-indigo-600' : 'text-slate-500 hover:bg-slate-200'}`} title="Placera i toppen"><i className="fas fa-arrow-up"></i></button>
                        <button onClick={() => updateActiveConfig('verticalPosition', 'center')} className={`w-8 h-8 rounded text-xs transition-all ${currentConfig.verticalPosition === 'center' ? 'bg-white shadow text-indigo-600' : 'text-slate-500 hover:bg-slate-200'}`} title="Placera i mitten"><i className="fas fa-arrows-alt-v"></i></button>
                        <button onClick={() => updateActiveConfig('verticalPosition', 'bottom')} className={`w-8 h-8 rounded text-xs transition-all ${currentConfig.verticalPosition === 'bottom' ? 'bg-white shadow text-indigo-600' : 'text-slate-500 hover:bg-slate-200'}`} title="Placera i botten"><i className="fas fa-arrow-down"></i></button>
                    </div>
                )}
            </div>

            <div className="px-4 py-3 border-b border-slate-100 shrink-0">
                <div className="flex justify-between text-[10px] font-bold text-slate-500 mb-1"><span>Textstorlek</span><span>{currentConfig.fontSize}px</span></div>
                <input type="range" min="8" max="72" value={currentConfig.fontSize} onChange={(e) => updateActiveConfig('fontSize', parseInt(e.target.value))} className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600" />
            </div>

            {/* COLLAPSIBLE STYLE & COLOR */}
            <div className="border-b border-slate-100 shrink-0">
                <button 
                    onClick={() => setIsStyleOpen(!isStyleOpen)}
                    className="w-full px-4 py-3 flex items-center justify-between hover:bg-slate-50 transition-colors"
                >
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Stil & Färg</span>
                    <i className={`fas fa-chevron-down text-slate-400 text-xs transition-transform ${isStyleOpen ? 'rotate-180' : ''}`}></i>
                </button>
                
                {isStyleOpen && (
                    <div className="px-4 pb-4 space-y-4 bg-slate-50/50 animate-in slide-in-from-top-2">
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="text-[9px] font-bold text-slate-400 block mb-1">Textfärg</label>
                                <div className="flex items-center gap-2 bg-white border border-slate-200 rounded p-1">
                                    <input type="color" value={currentConfig.color || '#000000'} onChange={(e) => updateActiveConfig('color', e.target.value)} className="w-6 h-6 rounded cursor-pointer border-none p-0" />
                                    <span className="text-[10px] font-mono text-slate-500">{currentConfig.color || '#000'}</span>
                                </div>
                            </div>
                            <div>
                                <label className="text-[9px] font-bold text-slate-400 block mb-1">Bakgrundsfärg</label>
                                <div className="flex items-center gap-2 bg-white border border-slate-200 rounded p-1">
                                    <input type="color" value={currentConfig.backgroundColor || '#ffffff'} onChange={(e) => updateActiveConfig('backgroundColor', e.target.value)} className="w-6 h-6 rounded cursor-pointer border-none p-0" />
                                    <button onClick={() => updateActiveConfig('backgroundOpacity', 0)} className="ml-auto text-[9px] text-slate-400 hover:text-red-500 font-bold px-1" title="Ingen bakgrund"><i className="fas fa-ban"></i></button>
                                </div>
                            </div>
                        </div>
                        
                        {/* +Vit Button moved here for context */}
                        <button 
                            onClick={() => {
                                updateActiveConfig('backgroundColor', '#ffffff');
                                updateActiveConfig('backgroundOpacity', 0.8);
                                updateActiveConfig('padding', 10);
                            }}
                            className="w-full py-2 bg-white border border-slate-200 hover:border-indigo-300 hover:text-indigo-600 rounded text-[10px] font-bold text-slate-600 flex items-center justify-center gap-2 shadow-sm transition-all"
                            title="Lägg till en halvtransparent vit ruta bakom texten för bättre läsbarhet"
                        >
                            <div className="w-3 h-3 bg-white border border-slate-300"></div> 
                            <span>Lägg till vit textruta (+Vit)</span>
                        </button>

                        <div>
                            <div className="flex justify-between text-[9px] font-bold text-slate-400 mb-1"><span>Opacitet (Bakgrund)</span><span>{Math.round((currentConfig.backgroundOpacity || 0) * 100)}%</span></div>
                            <input type="range" min="0" max="1" step="0.1" value={currentConfig.backgroundOpacity || 0} onChange={(e) => updateActiveConfig('backgroundOpacity', parseFloat(e.target.value))} className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600" />
                        </div>
                        <div>
                            <div className="flex justify-between text-[9px] font-bold text-slate-400 mb-1"><span>Luft (Padding)</span><span>{currentConfig.padding || 0}px</span></div>
                            <input type="range" min="0" max="50" step="1" value={currentConfig.padding || 0} onChange={(e) => updateActiveConfig('padding', parseInt(e.target.value))} className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600" />
                        </div>
                    </div>
                )}
            </div>

            {/* COLLAPSIBLE FOOTER HEIGHT */}
            {activeSection === 'footer' && (
                 <div className="border-b border-slate-100 shrink-0 bg-amber-50/30">
                     <button 
                        onClick={() => setIsFooterHeightOpen(!isFooterHeightOpen)}
                        className="w-full px-4 py-2 flex items-center justify-between hover:bg-amber-50 transition-colors"
                     >
                        <span className="text-[10px] font-bold text-amber-700 uppercase tracking-widest">Justera Fälthöjd</span>
                        <i className={`fas fa-chevron-down text-amber-400 text-xs transition-transform ${isFooterHeightOpen ? 'rotate-180' : ''}`}></i>
                     </button>
                     {isFooterHeightOpen && (
                         <div className="px-4 pb-4 animate-in slide-in-from-top-2">
                             <div className="flex justify-between text-[10px] font-bold text-amber-700 mb-1"><span>Höjd (under bild)</span><span>{currentConfig.boxHeight || 'Auto'}</span></div>
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
                 </div>
            )}

            {/* MAIN EDIT AREA - Scrollable */}
            <div className="flex-1 overflow-y-auto min-h-0 p-4 space-y-6 bg-slate-50">
                <div className={`rounded-lg border p-3 cursor-pointer transition-all ${activeSection === 'header' ? 'bg-white border-indigo-300 ring-2 ring-indigo-100 shadow-md' : 'bg-white border-slate-200 hover:border-slate-300'}`} onClick={() => setActiveSection('header')}>
                    <label className="text-[10px] font-black uppercase text-indigo-900 mb-2 block flex items-center gap-2">
                        <i className="fas fa-heading"></i> Text PÅ sidan
                    </label>
                    <RichTextListEditor lines={pageMeta.headerLines || []} onChange={(lines) => updateCurrentMeta({ headerLines: lines })} onFocusLine={setFocusedLineId} focusedLineId={focusedLineId}/>
                </div>
                
                <div className={`rounded-lg border p-3 cursor-pointer transition-all ${activeSection === 'footer' ? 'bg-white border-indigo-300 ring-2 ring-indigo-100 shadow-md' : 'bg-white border-slate-200 hover:border-slate-300'}`} onClick={() => setActiveSection('footer')}>
                    <label className="text-[10px] font-black uppercase text-slate-500 mb-2 block flex items-center gap-2">
                        <i className="fas fa-paragraph"></i> Text UNDER sidan
                    </label>
                    <RichTextListEditor lines={pageMeta.footerLines || []} onChange={(lines) => updateCurrentMeta({ footerLines: lines })} onFocusLine={setFocusedLineId} focusedLineId={focusedLineId}/>
                </div>

                <label className="flex items-center space-x-3 p-3 bg-white rounded-lg cursor-pointer hover:bg-slate-50 transition-colors border border-slate-200">
                    <input type="checkbox" checked={pageMeta.hideObject || false} onChange={(e) => updateCurrentMeta({ hideObject: e.target.checked })} className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"/>
                    <div><span className="text-xs font-bold text-slate-700 block">Dölj originalbilden</span></div>
                </label>
            </div>
        </>
    );

    return (
        <>
            {/* DESKTOP SIDEBAR (Visible on lg+) */}
            <div className="hidden lg:flex flex-col w-80 bg-white border-l border-slate-200 z-20 shadow-xl shrink-0 h-full">
                {renderContent()}
            </div>

            {/* MOBILE BOTTOM SHEET (Fixed on small screens) */}
            <div className={`lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 z-50 transition-all duration-300 shadow-[0_-4px_20px_rgba(0,0,0,0.1)] flex flex-col ${isMobileExpanded ? 'h-[75vh] rounded-t-2xl' : 'h-16'}`}>
                {!isMobileExpanded ? (
                    // COLLAPSED BAR
                    <div className="flex items-center justify-between px-4 h-full cursor-pointer" onClick={() => setIsMobileExpanded(true)}>
                         <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-indigo-50 rounded-full flex items-center justify-center text-indigo-600">
                                <i className="fas fa-pen"></i>
                            </div>
                            <div className="flex flex-col">
                                <span className="text-sm font-bold text-slate-800">Redigera text & stil</span>
                                <span className="text-[10px] text-slate-500">Tryck för att öppna verktyg</span>
                            </div>
                         </div>
                         <button className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center text-slate-600">
                            <i className="fas fa-chevron-up"></i>
                         </button>
                    </div>
                ) : (
                    // EXPANDED DRAWER
                    <div className="flex flex-col h-full rounded-t-2xl overflow-hidden">
                        {renderContent()}
                    </div>
                )}
            </div>
        </>
    );
};

export default EditorToolsPanel;
