
import React, { useState } from 'react';
import { DriveFile, FileType, CompressionLevel } from '../types';
import { suggestMetadata, getAIAssistantResponse } from '../services/geminiService';
import { generateCombinedPDF } from '../services/pdfService';
import { uploadToDrive, createFolder } from '../services/driveService';

interface StagingAreaProps {
  accessToken: string;
  selectedFiles: DriveFile[];
  currentFolderId: string;
  onRemove: (fileId: string) => void;
  onClear: () => void;
  onReorder: (newOrder: DriveFile[]) => void;
  coverImageId: string | null;
  setCoverImageId: (id: string | null) => void;
}

const StagingArea: React.FC<StagingAreaProps> = ({ accessToken, selectedFiles, currentFolderId, onRemove, onClear, onReorder, coverImageId, setCoverImageId }) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, msg: '' });
  const [saveToDrive, setSaveToDrive] = useState(true);
  const [compression, setCompression] = useState<CompressionLevel>('medium');
  const [aiSuggestions, setAiSuggestions] = useState<{suggestedTitle: string, suggestedDescription: string} | null>(null);
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [newHeader, setNewHeader] = useState('');

  const handleAddHeader = () => {
    if (!newHeader.trim()) return;
    const header: DriveFile = {
      id: `header-${Date.now()}`,
      name: `Kapitel: ${newHeader}`,
      type: FileType.HEADER,
      size: 0,
      modifiedTime: new Date().toLocaleDateString(),
      headerText: newHeader
    };
    onReorder([...selectedFiles, header]);
    setNewHeader('');
  };

  const handleGetAnalysis = async () => {
    if (selectedFiles.length === 0) return;
    setIsProcessing(true);
    try {
      const prompt = "Analysera dessa minnen och ge mig en varm sammanfattning av personens livshistoria. Föreslå kapitelindelningar för att bevara familjehistorien på ett sätt som känns levande.";
      const response = await getAIAssistantResponse(selectedFiles.filter(f => f.type !== FileType.HEADER), prompt);
      setAiAnalysis(response ?? null);
    } catch (e) {
      console.error(e);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleGetSuggestions = async () => {
    if (selectedFiles.length === 0) return;
    setIsProcessing(true);
    try {
      const result = await suggestMetadata(selectedFiles.filter(f => f.type !== FileType.HEADER));
      setAiSuggestions(result ?? null);
    } catch (e) {
      console.error(e);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleExport = async () => {
    if (selectedFiles.length === 0) return;
    setIsProcessing(true);
    
    let wakeLock: any = null;
    try {
      if ('wakeLock' in navigator) {
        wakeLock = await (navigator as any).wakeLock.request('screen');
      }

      const baseName = (aiSuggestions?.suggestedTitle?.trim() || 'Berättelse_' + new Date().toLocaleDateString());
      const targetFolderId = saveToDrive ? await createFolder(accessToken, currentFolderId, baseName) : '';
      
      let chunks: {title: string, items: DriveFile[]}[] = [];
      let currentChunkItems: DriveFile[] = [];
      let currentChunkTitle = baseName;
      let estimatedSize = 0;
      const MAX_MB = 14.0;
      
      // Manual simple chunk calculation for staging area export (mimics the advanced one)
      const COMPRESSION_MULTIPLIERS = { 'low': 1.0, 'medium': 0.6, 'high': 0.3 };

      for (const item of selectedFiles) {
        if (item.type === FileType.HEADER) {
          if (currentChunkItems.length > 0) chunks.push({ title: currentChunkTitle, items: currentChunkItems });
          currentChunkItems = [];
          currentChunkTitle = item.headerText || baseName;
          estimatedSize = 0;
          continue;
        }

        const isImage = item.type === FileType.IMAGE;
        const baseMultiplier = isImage ? COMPRESSION_MULTIPLIERS[compression] : 1.0;
        const itemSizeMB = ((item.size || 800000) * baseMultiplier * 1.1) / (1024 * 1024);
        
        if (estimatedSize + itemSizeMB > MAX_MB && currentChunkItems.length > 0) {
          chunks.push({ title: currentChunkTitle, items: currentChunkItems });
          currentChunkItems = [item];
          currentChunkTitle = `${currentChunkTitle} (forts.)`;
          estimatedSize = itemSizeMB;
        } else {
          currentChunkItems.push(item);
          estimatedSize += itemSizeMB;
        }
      }
      
      if (currentChunkItems.length > 0) chunks.push({ title: currentChunkTitle, items: currentChunkItems });

      for (let i = 0; i < chunks.length; i++) {
        const partName = chunks[i].title;
        setProgress({ current: i + 1, total: chunks.length, msg: `Skapar dokument: ${partName}...` });
        
        const pdfBytes = await generateCombinedPDF(accessToken, chunks[i].items, partName, compression, coverImageId ?? undefined);
        const blob = new Blob([new Uint8Array(pdfBytes)], { type: 'application/pdf' });

        if (saveToDrive) {
          await uploadToDrive(accessToken, targetFolderId, `${partName}.pdf`, blob);
        } else {
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `${partName}.pdf`;
          a.click();
        }
      }

      alert(`Exporten är klar! Din berättelse ligger nu i mappen "${baseName}".`);
    } catch (err: any) {
      alert(`Exporten avbröts: ${err.message}`);
    } finally {
      if (wakeLock) await wakeLock.release();
      setIsProcessing(false);
      setProgress({ current: 0, total: 0, msg: '' });
    }
  };

  return (
    <div className="w-96 bg-white border-l border-slate-200 flex flex-col h-full shrink-0 shadow-2xl z-20">
      <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-white sticky top-0 z-10">
        <h2 className="font-black text-slate-800 tracking-tight text-lg">Ditt urval</h2>
        <span className="bg-indigo-600 text-white text-[10px] font-black px-2 py-1 rounded-lg uppercase">
          {selectedFiles.length} OBJEKT
        </span>
      </div>

      <div className="flex-1 overflow-auto p-4 space-y-6">
        {/* AI Livsberättelse - Visas vackrare här */}
        {aiAnalysis && (
          <div className="bg-amber-50 p-6 rounded-[2rem] border border-amber-100 space-y-4 animate-in fade-in zoom-in duration-300 shadow-sm">
            <div className="flex justify-between items-center">
               <span className="text-[10px] font-black text-amber-600 uppercase tracking-widest">AI Livsberättelse</span>
               <button onClick={() => setAiAnalysis(null)} className="text-amber-400 hover:text-amber-600 transition-colors"><i className="fas fa-times-circle"></i></button>
            </div>
            <div className="text-[11px] text-amber-900 leading-relaxed max-h-64 overflow-auto font-medium whitespace-pre-wrap pr-2">
              {aiAnalysis}
            </div>
            <button 
              onClick={() => {
                navigator.clipboard.writeText(aiAnalysis);
                alert("Berättelsen kopierad till urklipp!");
              }}
              className="w-full py-3 bg-white text-amber-800 rounded-2xl text-[10px] font-black border border-amber-200 uppercase tracking-widest hover:bg-amber-100 transition-all shadow-sm"
            >
              Kopiera berättelse
            </button>
          </div>
        )}

        <div className="bg-slate-50 p-4 rounded-3xl border border-slate-100 space-y-3">
           <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Skapa nya avsnitt</span>
           <div className="flex space-x-2">
              <input 
                type="text" 
                value={newHeader} 
                onChange={e => setNewHeader(e.target.value)}
                placeholder="Ex: 'Barndomen'..." 
                className="flex-1 text-[11px] px-4 py-2.5 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-100 font-medium"
              />
              <button onClick={handleAddHeader} className="bg-indigo-600 text-white px-4 rounded-xl hover:bg-indigo-700 transition-all shadow-md shadow-indigo-100">
                <i className="fas fa-plus"></i>
              </button>
           </div>
        </div>

        {selectedFiles.length === 0 ? (
          <div className="h-40 flex flex-col items-center justify-center text-slate-300 italic text-xs text-center px-10 border-2 border-dashed border-slate-100 rounded-[2.5rem]">
            Lägg till dokument från din Drive för att börja berätta.
          </div>
        ) : (
          <div className="space-y-3">
            {selectedFiles.map((file, idx) => (
              <div key={file.id} className={`p-4 rounded-[1.8rem] border transition-all ${file.type === FileType.HEADER ? 'bg-indigo-600 border-indigo-400 text-white shadow-lg shadow-indigo-100' : 'bg-slate-50 border-slate-100'}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <span className="text-[9px] font-black opacity-40 uppercase tracking-tighter">#{idx + 1}</span>
                    <span className="text-[11px] font-bold truncate w-40">{file.type === FileType.HEADER ? file.headerText : file.name}</span>
                  </div>
                  <div className="flex items-center space-x-2">
                     {file.type === FileType.IMAGE && (
                       <button 
                        onClick={() => setCoverImageId(file.id === coverImageId ? null : file.id)}
                        className={`text-xs transition-colors ${coverImageId === file.id ? 'text-amber-500' : 'text-slate-300 hover:text-amber-400'}`}
                        title="Välj som bakgrund på titelblad"
                       >
                         <i className="fas fa-image"></i>
                       </button>
                     )}
                     <button onClick={() => onRemove(file.id)} className={`transition-colors ${file.type === FileType.HEADER ? 'text-white/50 hover:text-white' : 'text-slate-300 hover:text-red-500'}`}>
                       <i className="fas fa-times-circle"></i>
                     </button>
                  </div>
                </div>
                {coverImageId === file.id && (
                  <div className="mt-2 text-[8px] font-black uppercase text-amber-600 tracking-widest flex items-center">
                    <i className="fas fa-star mr-1"></i> Vald som bakgrundsbild
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="bg-slate-900 p-6 rounded-[2.5rem] text-white shadow-xl space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-[0.2em] opacity-80">AI Berättare</span>
            <div className="flex space-x-2">
               <button onClick={handleGetAnalysis} disabled={isProcessing} className="text-[9px] font-black bg-white/20 hover:bg-white/40 px-3 py-1.5 rounded-full uppercase transition-all">
                  Analysera
               </button>
               <button onClick={handleGetSuggestions} disabled={isProcessing} className="text-[9px] font-black bg-indigo-500 hover:bg-indigo-400 px-3 py-1.5 rounded-full uppercase transition-all">
                  Titel
               </button>
            </div>
          </div>
          {aiSuggestions && (
            <input 
              className="bg-white/10 w-full text-xs p-3 rounded-2xl border-none text-white font-bold placeholder-white/40 focus:bg-white/20 outline-none"
              value={aiSuggestions.suggestedTitle}
              onChange={(e) => setAiSuggestions({...aiSuggestions, suggestedTitle: e.target.value})}
              placeholder="Ange boktitel..."
            />
          )}
        </div>
      </div>

      <div className="p-8 bg-slate-50 border-t border-slate-100 space-y-5">
        {isProcessing && (
          <div className="space-y-3">
            <div className="flex justify-between text-[10px] font-black text-indigo-600 uppercase tracking-widest">
              <span>{progress.msg}</span>
              <span>{progress.current} / {progress.total}</span>
            </div>
            <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden shadow-inner">
              <div className="bg-indigo-600 h-full transition-all duration-700 ease-out" style={{ width: `${(progress.current/progress.total)*100}%` }}></div>
            </div>
          </div>
        )}

        <button 
          onClick={handleExport}
          disabled={selectedFiles.length === 0 || isProcessing}
          className="w-full bg-slate-900 text-white font-black py-5 rounded-[2rem] shadow-2xl hover:bg-indigo-600 transition-all disabled:opacity-50 uppercase tracking-widest"
        >
          {isProcessing ? 'Bygger berättelse...' : 'Bevara minnen'}
        </button>
        
        <p className="text-[9px] text-slate-400 text-center font-bold px-4 leading-relaxed uppercase tracking-widest">
          Export optimerad för <a href="https://www.familysearch.org/en/tree/person/memories" target="_blank" className="text-indigo-500 underline">FamilySearch</a>
        </p>
      </div>
    </div>
  );
};

export default StagingArea;
