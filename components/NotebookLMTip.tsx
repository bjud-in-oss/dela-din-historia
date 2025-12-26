
import React, { useState } from 'react';

interface NotebookLMTipProps {
    defaultOpen?: boolean;
}

const NotebookLMTip: React.FC<NotebookLMTipProps> = ({ defaultOpen = false }) => {
    const [isOpen, setIsOpen] = useState(defaultOpen);

    return (
        <div className="bg-white rounded-xl border border-purple-100 shadow-sm overflow-hidden transition-all hover:shadow-md">
            <div 
                className="p-4 flex items-center justify-between cursor-pointer bg-purple-50/30 hover:bg-purple-50/60 transition-colors"
                onClick={() => setIsOpen(!isOpen)}
            >
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center text-purple-600">
                        <i className="fas fa-magic"></i>
                    </div>
                    <div>
                        <h5 className="font-bold text-purple-900 text-sm">Tips: Förfina med NotebookLM</h5>
                        {!isOpen && <p className="text-xs text-purple-400 truncate max-w-[200px]">Skapa ljudfiler och sammanfattningar</p>}
                    </div>
                </div>
                <i className={`fas fa-chevron-down text-purple-300 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}></i>
            </div>
            
            {isOpen && (
                <div className="p-5 pt-2 border-t border-purple-50 animate-in slide-in-from-top-2">
                    <p className="text-sm text-slate-600 mb-4 leading-relaxed">
                        Ladda upp dina exporterade PDF-filer till Google NotebookLM för att skapa ljudfiler ("Audio Overviews") eller få hjälp att sammanfatta och ställa frågor om din släkthistoria.
                    </p>
                    <a href="https://notebooklm.google.com/" target="_blank" rel="noopener noreferrer" className="text-xs font-bold text-purple-600 hover:text-purple-800 inline-flex items-center px-4 py-2 bg-purple-50 rounded-lg hover:bg-purple-100 transition-colors border border-purple-100">
                        Gå till NotebookLM <i className="fas fa-external-link-alt ml-2"></i>
                    </a>
                </div>
            )}
        </div>
    );
};

export default NotebookLMTip;
