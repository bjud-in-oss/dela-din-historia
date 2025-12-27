
import React, { useState, useEffect, useRef } from 'react';
import AppLogo from './AppLogo';
import { TextConfig, RichTextLine, PageMetadata } from '../types';
import { DEFAULT_TEXT_CONFIG } from '../services/pdfService';

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
    // Show settings toggle
    const [showSettings, setShowSettings] = useState(false);
    const [isMobileExpanded, setIsMobileExpanded] = useState(false);
    const textAreaRef = useRef<HTMLTextAreaElement>(null);

    const activeLines = activeSection === 'header' ? pageMeta.headerLines : pageMeta.footerLines;

    // Convert array of lines to single string for textarea
    const textValue = (activeLines || []).map(l => l.text).join('\n');

    // Handle typing in the textarea
    const handleTextChange = (newFullText: string) => {
        const textLines = newFullText.split('\n');
        
        // Map back to RichTextLine objects
        // We reuse existing configs for indices that exist, or clone the current/first config for new lines
        const newRichLines: RichTextLine[] = textLines.map((text, index) => {
            const existingLine = activeLines && activeLines[index];
            // If line exists, keep its ID and config. If not, create new.
            // If it's the very first line being created, use DEFAULT_TEXT_CONFIG.
            // If it's a new line appended, copy config from the previous line (so style continues).
            const baseConfig = existingLine?.config || (activeLines && activeLines.length > 0 ? activeLines[activeLines.length-1].config : DEFAULT_TEXT_CONFIG);
            
            return {
                id: existingLine?.id || `line-${Date.now()}-${index}`,
                text: text,
                config: baseConfig
            };
        });

        if (activeSection === 'header') updateCurrentMeta({ headerLines: newRichLines });
        else updateCurrentMeta({ footerLines: newRichLines });
    };

    // Auto-focus logic
    useEffect(() => {
        if (isMobileExpanded || window.innerWidth >= 1024) {
            // Small timeout to allow render/animation
            const t = setTimeout(() => {
                textAreaRef.current?.focus();
                // Move cursor to end
                const len = textAreaRef.current?.value.length || 0;
                textAreaRef.current?.setSelectionRange(len, len);
            }, 100);
            return () => clearTimeout(t);
        }
    }, [activeSection, isMobileExpanded]);

    const renderContent = () => (
        <div className="flex flex-col flex-1 min-h-0 w-full bg-slate-50">
            {/* Desktop Header / Mobile Handle */}
            <div className="hidden lg:flex p-4 border-b border-slate-200 items-center justify-between shrink-0 bg-white">
                <div className="flex items-center space-x-3">
                    <div className="shrink-0"><AppLogo variant="phase2" className="w-8 h-8" /></div>
                    <h3 className="font-bold text-slate-800 text-lg leading-tight">Redigera</h3>
                </div>
            </div>
            
            {/* Main Controls Container - Scrollable */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-4">
                
                {/* 1. Compact Toolbar (Position Toggle + Settings Button) */}
                <div className="flex gap-2">
                    <div className="bg-slate-200 p-1 rounded-xl flex shadow-inner flex-1">
                        <button 
                            onClick={() => setActiveSection('header')} 
                            className={`flex-1 py-2 rounded-lg text-[10px] font-bold transition-all flex items-center justify-center gap-1 ${activeSection === 'header' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            <i className="fas fa-arrow-up"></i> PÅ
                        </button>
                        <button 
                            onClick={() => setActiveSection('footer')} 
                            className={`flex-1 py-2 rounded-lg text-[10px] font-bold transition-all flex items-center justify-center gap-1 ${activeSection === 'footer' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            <i className="fas fa-arrow-down"></i> UNDER
                        </button>
                    </div>
                    <button 
                        onClick={() => setShowSettings(!showSettings)}
                        className={`px-4 rounded-xl border transition-all flex items-center justify-center shadow-sm ${showSettings ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'}`}
                        title="Inställningar för stil och färg"
                    >
                        <i className="fas fa-sliders-h"></i>
                    </button>
                </div>

                {/* 2. Main Editor Input (Multi-line) */}
                <div className="relative">
                    <textarea 
                        ref={textAreaRef}
                        rows={2}
                        value={textValue} 
                        onChange={(e) => {
                            handleTextChange(e.target.value);
                            // Auto-grow height slightly up to a max
                            e.target.style.height = 'auto';
                            e.target.style.height = Math.min(e.target.scrollHeight, 200) + 'px';
                        }} 
                        className="w-full bg-white border border-slate-300 rounded-xl p-3 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 text-slate-800 transition-all font-serif resize-none shadow-sm text-sm leading-relaxed placeholder:font-sans placeholder:text-slate-400" 
                        style={{ 
                            fontWeight: currentConfig.isBold ? 'bold' : 'normal', 
                            fontStyle: currentConfig.isItalic ? 'italic' : 'normal',
                            textAlign: currentConfig.alignment
                        }} 
                        placeholder={activeSection === 'header' ? "Skriv rubrik eller text på bilden..." : "Skriv din berättelse här..."} 
                    />
                    <div className="absolute right-2 bottom-2 text-[9px] text-slate-300 font-bold pointer-events-none">
                        ENTER = Nytt stycke
                    </div>
                </div>

                {/* 3. Expandable Formatting Settings */}
                {showSettings && (
                    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm animate-in slide-in-from-top-2 fade-in duration-200">
                        <div className="p-4 space-y-5 bg-slate-50/30">
                            
                            {/* Basic Formatting Toolbar */}
                            <div>
                                <label className="text-[9px] font-bold text-slate-400 block mb-2">Grundläggande</label>
                                <div className="flex flex-wrap gap-2">
                                    <div className="flex bg-white border border-slate-200 rounded-lg p-1 shadow-sm">
                                        <button onClick={() => updateActiveConfig('isBold', !currentConfig.isBold)} className={`w-8 h-8 rounded text-xs transition-all ${currentConfig.isBold ? 'bg-indigo-50 text-indigo-600 font-bold' : 'text-slate-400 hover:bg-slate-50'}`} title="Fetstil"><i className="fas fa-bold"></i></button>
                                        <button onClick={() => updateActiveConfig('isItalic', !currentConfig.isItalic)} className={`w-8 h-8 rounded text-xs transition-all ${currentConfig.isItalic ? 'bg-indigo-50 text-indigo-600 font-bold' : 'text-slate-400 hover:bg-slate-50'}`} title="Kursiv"><i className="fas fa-italic"></i></button>
                                    </div>
                                    <div className="flex bg-white border border-slate-200 rounded-lg p-1 shadow-sm">
                                        <button onClick={() => updateActiveConfig('alignment', 'left')} className={`w-8 h-8 rounded text-xs transition-all ${currentConfig.alignment === 'left' ? 'bg-indigo-50 text-indigo-600' : 'text-slate-400 hover:bg-slate-50'}`} title="Vänster"><i className="fas fa-align-left"></i></button>
                                        <button onClick={() => updateActiveConfig('alignment', 'center')} className={`w-8 h-8 rounded text-xs transition-all ${currentConfig.alignment === 'center' ? 'bg-indigo-50 text-indigo-600' : 'text-slate-400 hover:bg-slate-50'}`} title="Center"><i className="fas fa-align-center"></i></button>
                                        <button onClick={() => updateActiveConfig('alignment', 'right')} className={`w-8 h-8 rounded text-xs transition-all ${currentConfig.alignment === 'right' ? 'bg-indigo-50 text-indigo-600' : 'text-slate-400 hover:bg-slate-50'}`} title="Höger"><i className="fas fa-align-right"></i></button>
                                    </div>
                                </div>
                            </div>

                            {/* Position (Header Only) */}
                            {activeSection === 'header' && (
                                <div>
                                    <label className="text-[9px] font-bold text-slate-400 block mb-2">Vertikal Position</label>
                                    <div className="flex bg-white border border-slate-200 rounded-lg p-1 shadow-sm inline-flex">
                                        <button onClick={() => updateActiveConfig('verticalPosition', 'top')} className={`px-3 py-1.5 rounded text-xs transition-all flex items-center gap-2 ${currentConfig.verticalPosition === 'top' ? 'bg-indigo-50 text-indigo-600 font-bold' : 'text-slate-400 hover:bg-slate-50'}`}><i className="fas fa-arrow-up"></i> Toppen</button>
                                        <button onClick={() => updateActiveConfig('verticalPosition', 'center')} className={`px-3 py-1.5 rounded text-xs transition-all flex items-center gap-2 ${currentConfig.verticalPosition === 'center' ? 'bg-indigo-50 text-indigo-600 font-bold' : 'text-slate-400 hover:bg-slate-50'}`}><i className="fas fa-arrows-alt-v"></i> Mitten</button>
                                        <button onClick={() => updateActiveConfig('verticalPosition', 'bottom')} className={`px-3 py-1.5 rounded text-xs transition-all flex items-center gap-2 ${currentConfig.verticalPosition === 'bottom' ? 'bg-indigo-50 text-indigo-600 font-bold' : 'text-slate-400 hover:bg-slate-50'}`}><i className="fas fa-arrow-down"></i> Botten</button>
                                    </div>
                                </div>
                            )}

                            {/* Size */}
                            <div>
                                <div className="flex justify-between text-[9px] font-bold text-slate-400 mb-1"><span>Textstorlek</span><span>{currentConfig.fontSize}px</span></div>
                                <input type="range" min="8" max="72" value={currentConfig.fontSize} onChange={(e) => updateActiveConfig('fontSize', parseInt(e.target.value))} className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600" />
                            </div>

                            {/* Colors */}
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-[9px] font-bold text-slate-400 block mb-1">Textfärg</label>
                                    <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg p-1.5 shadow-sm">
                                        <input type="color" value={currentConfig.color || '#000000'} onChange={(e) => updateActiveConfig('color', e.target.value)} className="w-6 h-6 rounded cursor-pointer border-none p-0" />
                                        <span className="text-[10px] font-mono text-slate-500 uppercase">{currentConfig.color || '#000'}</span>
                                    </div>
                                </div>
                                <div>
                                    <label className="text-[9px] font-bold text-slate-400 block mb-1">Bakgrundsfärg</label>
                                    <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg p-1.5 shadow-sm">
                                        <input type="color" value={currentConfig.backgroundColor || '#ffffff'} onChange={(e) => updateActiveConfig('backgroundColor', e.target.value)} className="w-6 h-6 rounded cursor-pointer border-none p-0" />
                                        <button onClick={() => updateActiveConfig('backgroundOpacity', 0)} className="ml-auto text-[10px] text-slate-400 hover:text-red-500 font-bold px-2 border-l border-slate-100" title="Ingen bakgrund">Ingen</button>
                                    </div>
                                </div>
                            </div>

                            {/* White Box Preset */}
                            <button 
                                onClick={() => {
                                    updateActiveConfig('backgroundColor', '#ffffff');
                                    updateActiveConfig('backgroundOpacity', 0.85);
                                    updateActiveConfig('padding', 12);
                                    updateActiveConfig('color', '#000000');
                                }}
                                className="w-full py-2 bg-white border border-slate-200 hover:border-indigo-300 hover:text-indigo-600 rounded-lg text-[10px] font-bold text-slate-600 flex items-center justify-center gap-2 shadow-sm transition-all group"
                            >
                                <div className="w-3 h-3 bg-white border border-slate-300 shadow-sm group-hover:border-indigo-300"></div> 
                                <span>Snabbval: Vit textruta (+Vit)</span>
                            </button>

                            {/* Opacity & Padding */}
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <div className="flex justify-between text-[9px] font-bold text-slate-400 mb-1"><span>Opacitet (Bakgrund)</span><span>{Math.round((currentConfig.backgroundOpacity || 0) * 100)}%</span></div>
                                    <input type="range" min="0" max="1" step="0.1" value={currentConfig.backgroundOpacity || 0} onChange={(e) => updateActiveConfig('backgroundOpacity', parseFloat(e.target.value))} className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600" />
                                </div>
                                <div>
                                    <div className="flex justify-between text-[9px] font-bold text-slate-400 mb-1"><span>Luft (Padding)</span><span>{currentConfig.padding || 0}px</span></div>
                                    <input type="range" min="0" max="50" step="1" value={currentConfig.padding || 0} onChange={(e) => updateActiveConfig('padding', parseInt(e.target.value))} className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600" />
                                </div>
                            </div>

                            {/* Footer Specific: Box Height */}
                            {activeSection === 'footer' && (
                                <div className="bg-amber-50 p-3 rounded-lg border border-amber-100">
                                    <div className="flex justify-between text-[9px] font-bold text-amber-700 mb-1"><span>Höjd på textfältet (under bild)</span><span>{currentConfig.boxHeight || 'Auto'}</span></div>
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
                                        <button onClick={() => updateActiveConfig('boxHeight', undefined)} className="text-[9px] text-amber-600 hover:text-amber-800 underline decoration-amber-300">Återställ till auto</button>
                                    </div>
                                </div>
                            )}

                            {/* Hide Image Checkbox - Moved inside */}
                            <label className="flex items-center space-x-3 p-3 bg-slate-100 rounded-lg cursor-pointer hover:bg-slate-200 transition-colors border border-transparent hover:border-slate-300">
                                <input type="checkbox" checked={pageMeta.hideObject || false} onChange={(e) => updateCurrentMeta({ hideObject: e.target.checked })} className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500 border-slate-300"/>
                                <div>
                                    <span className="text-xs font-bold text-slate-700 block">Dölj originalbilden</span>
                                    <span className="text-[9px] text-slate-500">Visar en vit bakgrund istället för bilden</span>
                                </div>
                            </label>

                        </div>
                    </div>
                )}
            </div>
        </div>
    );

    return (
        <>
            {/* DESKTOP SIDEBAR (Visible on lg+) */}
            <div className="hidden lg:flex flex-col w-80 bg-white border-l border-slate-200 z-20 shadow-xl shrink-0 h-full">
                {renderContent()}
            </div>

            {/* MOBILE BOTTOM SHEET (Fixed on small screens) */}
            <div className={`lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 z-50 transition-all duration-300 shadow-[0_-4px_20px_rgba(0,0,0,0.1)] flex flex-col ${isMobileExpanded ? 'max-h-[80vh]' : 'h-auto max-h-[50vh]'}`}>
                
                {!isMobileExpanded ? (
                    // COLLAPSED / COMPACT BAR (Default state)
                    <div className="flex flex-col bg-white w-full rounded-t-2xl shadow-lg">
                         <div className="flex justify-center p-2" onClick={() => setIsMobileExpanded(true)}>
                             <div className="w-12 h-1 bg-slate-300 rounded-full cursor-pointer hover:bg-slate-400"></div>
                         </div>
                         <div className="px-4 pb-4" style={{ height: showSettings ? 'auto' : 'auto' }}>
                             {/* Re-using render content logic but wrapped for mobile styling */}
                             <div className="flex gap-2 mb-3">
                                <div className="bg-slate-100 p-1 rounded-xl flex flex-1">
                                    <button onClick={() => setActiveSection('header')} className={`flex-1 py-2 rounded-lg text-[10px] font-bold transition-all flex items-center justify-center gap-1 ${activeSection === 'header' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500'}`}><i className="fas fa-arrow-up"></i> PÅ</button>
                                    <button onClick={() => setActiveSection('footer')} className={`flex-1 py-2 rounded-lg text-[10px] font-bold transition-all flex items-center justify-center gap-1 ${activeSection === 'footer' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500'}`}><i className="fas fa-arrow-down"></i> UNDER</button>
                                </div>
                                <button onClick={() => { setShowSettings(!showSettings); if(!showSettings) setIsMobileExpanded(true); }} className={`px-4 rounded-xl border flex items-center justify-center ${showSettings ? 'bg-indigo-600 text-white' : 'bg-slate-50 border-slate-200 text-slate-500'}`}><i className="fas fa-sliders-h"></i></button>
                             </div>
                             
                             <div className="relative">
                                <textarea 
                                    ref={textAreaRef}
                                    rows={showSettings ? 2 : 3}
                                    value={textValue}
                                    onChange={(e) => handleTextChange(e.target.value)}
                                    onFocus={() => { if(!showSettings) setIsMobileExpanded(true); }} // Expand on focus for better keyboard handling
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 outline-none focus:border-indigo-500 focus:bg-white text-slate-800 text-sm font-serif"
                                    placeholder="Skriv din text här..."
                                    style={{ fontWeight: currentConfig.isBold ? 'bold' : 'normal', fontStyle: currentConfig.isItalic ? 'italic' : 'normal', textAlign: currentConfig.alignment }}
                                />
                             </div>
                         </div>
                    </div>
                ) : (
                    // FULLY EXPANDED DRAWER
                    <div className="flex flex-col h-full rounded-t-2xl overflow-hidden bg-white">
                        <div className="flex justify-between items-center p-3 border-b border-slate-100 cursor-pointer bg-slate-50 shrink-0" onClick={() => setIsMobileExpanded(false)}>
                            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider pl-2">Redigera</span>
                            <div className="w-8 h-8 flex items-center justify-center bg-white rounded-full text-slate-400 hover:text-slate-600"><i className="fas fa-chevron-down"></i></div>
                        </div>
                        {renderContent()}
                    </div>
                )}
            </div>
        </>
    );
};

export default EditorToolsPanel;
