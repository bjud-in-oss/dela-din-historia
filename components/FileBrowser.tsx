
import { DriveFile, FileType } from '../types';
import { fetchDriveFiles, fetchSharedDrives } from '../services/driveService';
import React, { useState, useEffect, useRef } from 'react';

interface FileBrowserProps {
  accessToken: string;
  onRequestAccess: () => void; // New prop to trigger auth flow
  onAddFiles: (files: DriveFile[]) => void;
  selectedIds: string[]; 
  onClose: () => void;
  
  browserState: {
    currentFolder: string;
    currentDriveId: string | null;
    breadcrumbs: {id: string, name: string}[];
    activeTab: 'local' | 'drive' | 'shared';
  };
  onUpdateState: (newState: any) => void;
}

const FileBrowser: React.FC<FileBrowserProps> = ({ 
  accessToken, 
  onRequestAccess,
  onAddFiles, 
  onClose,
  browserState,
  onUpdateState
}) => {
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [localSelection, setLocalSelection] = useState<DriveFile[]>([]); 
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { currentFolder, currentDriveId, breadcrumbs, activeTab } = browserState;
  
  const hasAccess = !!accessToken;

  useEffect(() => {
    // Only fetch if we are in a drive tab AND have an access token
    if (activeTab !== 'local' && hasAccess) {
      loadDriveFiles();
    } else if (!hasAccess && activeTab !== 'local') {
      // Clear files if we lose access or switch to a tab requiring access without it
      setFiles([]);
    }
  }, [currentFolder, activeTab, currentDriveId, hasAccess]);

  const loadDriveFiles = async () => {
    if (!hasAccess) return;
    
    setLoading(true);
    try {
      if (activeTab === 'shared' && !currentDriveId) {
        const drives = await fetchSharedDrives(accessToken);
        setFiles(drives);
      } else {
        const driveIdToUse = activeTab === 'shared' && currentDriveId ? currentDriveId : undefined;
        const folderIdToUse = (activeTab === 'shared' && currentFolder === 'root' && currentDriveId) 
          ? currentDriveId 
          : currentFolder;

        const data = await fetchDriveFiles(accessToken, folderIdToUse, driveIdToUse);
        setFiles(data);
      }
    } catch (err) {
      console.error(err);
      setFiles([]);
    } finally {
      setLoading(false);
    }
  };

  const updateState = (updates: Partial<typeof browserState>) => {
    onUpdateState({ ...browserState, ...updates });
  };

  // --- Actions ---

  const handleToggleFile = (file: DriveFile) => {
    if (file.type === FileType.FOLDER) {
      // Navigera in i mapp
      if (activeTab === 'shared' && !currentDriveId) {
        updateState({
          currentDriveId: file.id,
          currentFolder: file.id,
          breadcrumbs: [{id: 'root-drives', name: 'Delade Enheter'}, {id: file.id, name: file.name}]
        });
      } else {
        updateState({
          currentFolder: file.id,
          breadcrumbs: [...breadcrumbs, {id: file.id, name: file.name}]
        });
      }
    } else {
      // Toggla markering
      if (localSelection.some(f => f.id === file.id)) {
        setLocalSelection(localSelection.filter(f => f.id !== file.id));
      } else {
        setLocalSelection([...localSelection, file]);
      }
    }
  };

  const handleSelectAll = () => {
    const visibleFiles = files.filter(f => f.type !== FileType.FOLDER);
    const allSelected = visibleFiles.every(f => localSelection.some(s => s.id === f.id));
    
    if (allSelected) {
      // Avmarkera alla synliga
      setLocalSelection(localSelection.filter(s => !visibleFiles.some(v => v.id === s.id)));
    } else {
      // Lägg till de som inte redan är valda
      const newSelection = [...localSelection];
      visibleFiles.forEach(f => {
        if (!newSelection.some(s => s.id === f.id)) newSelection.push(f);
      });
      setLocalSelection(newSelection);
    }
  };

  const handleAddEmptySource = () => {
    const empty: DriveFile = {
      id: `empty-${Date.now()}`,
      name: 'Ny källa',
      type: FileType.TEXT,
      size: 0,
      modifiedTime: new Date().toLocaleDateString(),
      description: '',
      isLocal: true
    };
    onAddFiles([empty]); 
    onClose();
  };

  const handlePasteText = () => {
    const text = prompt("Klistra in din text här:");
    if (text) {
      const textFile: DriveFile = {
        id: `text-${Date.now()}`,
        name: 'Inklistrad text',
        type: FileType.TEXT,
        size: text.length,
        modifiedTime: new Date().toLocaleDateString(),
        description: text,
        isLocal: true
      };
      onAddFiles([textFile]);
      onClose();
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selectedFiles = Array.from(e.target.files).map((file: File) => ({
        id: `local-${Date.now()}-${Math.random()}`,
        name: file.name,
        type: file.type.startsWith('image/') ? FileType.IMAGE : FileType.TEXT, 
        size: file.size,
        modifiedTime: new Date(file.lastModified).toLocaleDateString(),
        isLocal: true,
        fileObj: file,
        blobUrl: URL.createObjectURL(file)
      }));
      
      setLocalSelection(prev => [...prev, ...selectedFiles]);
    }
  };

  const handleDone = () => {
    onAddFiles(localSelection);
    setLocalSelection([]);
    onClose();
  };

  const switchTab = (tab: 'local' | 'drive' | 'shared') => {
    let newBreadcrumbs = [{id: 'root', name: 'Min Enhet'}];
    if (tab === 'local') newBreadcrumbs = [{id: 'root', name: 'Lokal'}];
    if (tab === 'shared') newBreadcrumbs = [{id: 'root-drives', name: 'Delade Enheter'}];

    updateState({
      activeTab: tab,
      currentFolder: 'root',
      currentDriveId: null,
      breadcrumbs: newBreadcrumbs
    });
  };

  const isAllSelected = files.length > 0 && files.filter(f => f.type !== FileType.FOLDER).every(f => localSelection.some(s => s.id === f.id));

  // Render Logic for "Connect Drive" states
  const renderConnectDrivePrompt = (reason: string) => (
    <div className="flex flex-col items-center justify-center h-full p-6 text-center">
       <div className="w-20 h-20 bg-indigo-50 rounded-full flex items-center justify-center mb-4">
         <i className="fab fa-google-drive text-3xl text-indigo-600"></i>
       </div>
       <h3 className="text-xl font-bold text-slate-900 mb-2">Anslut till Google Drive</h3>
       <p className="text-slate-500 mb-6 max-w-sm">
         {reason}
       </p>
       <button 
         onClick={onRequestAccess}
         className="px-8 py-3 bg-indigo-600 text-white rounded-xl font-bold shadow-lg hover:bg-indigo-700 transition-all flex items-center gap-2"
       >
         <i className="fas fa-link"></i>
         <span>Anslut nu</span>
       </button>
    </div>
  );

  return (
    <div className="flex flex-col h-full bg-white text-slate-900">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 md:px-6 md:py-4 border-b border-slate-100">
        <h2 className="text-base md:text-lg font-bold">Hämta källor</h2>
        <div className="flex items-center space-x-2">
           <button onClick={handleAddEmptySource} className="hidden md:inline-block px-3 py-1.5 text-xs font-bold bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors">
             + Tom källa
           </button>
           <button onClick={handlePasteText} className="hidden md:inline-block px-3 py-1.5 text-xs font-bold bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors">
             <i className="fas fa-paste mr-1"></i> Klistra in
           </button>
           <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors">
             <i className="fas fa-times text-lg"></i>
           </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-100">
        {['local', 'drive', 'shared'].map((tab: any) => (
          <button 
            key={tab}
            onClick={() => switchTab(tab)}
            className={`flex-1 py-3 text-sm font-bold border-b-2 transition-colors ${activeTab === tab ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
          >
            {tab === 'local' ? 'Lokal' : tab === 'drive' ? 'Min Drive' : 'Delad Drive'}
          </button>
        ))}
      </div>

      {/* Drive Warning inside Local Tab */}
      {activeTab === 'local' && !hasAccess && (
          <div className="bg-amber-50 border-b border-amber-100 p-4 flex flex-col md:flex-row items-center justify-between gap-3 text-center md:text-left">
              <div className="flex items-center gap-3">
                  <i className="fas fa-info-circle text-amber-500 text-xl"></i>
                  <div>
                      <p className="text-xs font-bold text-amber-900">Resultatet sparas på Drive</p>
                      <p className="text-[10px] text-amber-700">För att säkra din berättelse sparas den färdiga boken automatiskt till din Google Drive.</p>
                  </div>
              </div>
              <button 
                onClick={onRequestAccess} 
                className="whitespace-nowrap px-4 py-2 bg-white border border-amber-200 text-amber-800 text-xs font-bold rounded-lg hover:bg-amber-100"
              >
                Anslut Drive
              </button>
          </div>
      )}

      {/* Breadcrumbs & Select All */}
      {activeTab !== 'local' && hasAccess && (
        <div className="px-4 py-3 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center space-x-2 text-xs font-medium text-slate-500 overflow-x-auto whitespace-nowrap mask-linear-fade pr-4">
             {breadcrumbs.map((crumb, idx) => (
                <span key={crumb.id} className="flex items-center cursor-pointer hover:text-indigo-600 shrink-0" onClick={() => {
                   if (crumb.id === 'root-drives') {
                      updateState({ currentDriveId: null, currentFolder: 'root', breadcrumbs: breadcrumbs.slice(0, idx + 1) });
                   } else {
                      updateState({ currentFolder: crumb.id, breadcrumbs: breadcrumbs.slice(0, idx + 1) });
                   }
                }}>
                  {idx > 0 && <span className="mx-1 text-slate-300">/</span>}
                  {crumb.name}
                </span>
             ))}
          </div>
          {files.some(f => f.type !== FileType.FOLDER) && (
            <button onClick={handleSelectAll} className="text-xs font-bold text-indigo-600 hover:text-indigo-800 shrink-0 ml-2">
              {isAllSelected ? 'Avmarkera' : 'Markera alla'}
            </button>
          )}
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4 md:p-6 bg-[#fbfcfd]">
        {/* VIEW: LOCAL */}
        {activeTab === 'local' ? (
          <div className="flex flex-col items-center justify-center h-full space-y-4 min-h-[300px]">
             {localSelection.length > 0 ? (
               <div className="w-full grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                  <button 
                    onClick={() => fileInputRef.current?.click()}
                    className="aspect-video rounded-xl border-2 border-dashed border-indigo-200 bg-indigo-50 flex flex-col items-center justify-center text-indigo-600 hover:bg-indigo-100 transition-colors min-h-[120px]"
                  >
                     <i className="fas fa-plus text-2xl mb-2"></i>
                     <span className="text-xs font-bold">Välj fler</span>
                  </button>
                  {localSelection.filter(f => f.isLocal && f.fileObj).map(f => (
                     <div key={f.id} className="relative aspect-video rounded-xl border border-indigo-500 bg-indigo-50 p-4 flex flex-col items-center justify-center text-center min-h-[120px]">
                        <i className="fas fa-file text-xl text-indigo-400 mb-2"></i>
                        <span className="text-xs font-bold truncate w-full">{f.name}</span>
                        <button 
                          onClick={() => setLocalSelection(prev => prev.filter(x => x.id !== f.id))}
                          className="absolute top-2 right-2 text-indigo-300 hover:text-red-500 p-2"
                        >
                          <i className="fas fa-times"></i>
                        </button>
                     </div>
                  ))}
               </div>
             ) : (
               <>
                <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center text-slate-300 mb-2">
                  <i className="fas fa-desktop text-3xl"></i>
                </div>
                <p className="text-slate-500 font-medium text-center px-4">Hämta filer från din enhet</p>
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  className="px-6 py-3 bg-slate-900 text-white rounded-xl font-bold hover:bg-indigo-600 transition-all shadow-lg"
                >
                  Välj filer från datorn
                </button>
               </>
             )}
          </div>
        ) : !hasAccess ? (
            /* VIEW: DRIVE/SHARED NO ACCESS */
            renderConnectDrivePrompt(activeTab === 'drive' ? "För att hämta filer från din Drive behöver du ansluta den." : "För att se delade enheter behöver du ansluta ditt konto.")
        ) : loading ? (
           /* VIEW: LOADING */
           <div className="flex justify-center py-20"><i className="fas fa-spinner fa-spin text-indigo-600 text-2xl"></i></div>
        ) : (
          /* VIEW: DRIVE FILES GRID/LIST */
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 md:gap-4 pb-20">
            {files.map(file => {
              const isSelected = localSelection.some(s => s.id === file.id);
              return (
                <div 
                  key={file.id}
                  onClick={() => handleToggleFile(file)}
                  className={`
                    relative cursor-pointer transition-all rounded-xl border group overflow-hidden
                    ${isSelected ? 'ring-2 ring-indigo-500 border-indigo-500 bg-indigo-50' : 'border-slate-200 bg-white hover:border-indigo-300 hover:shadow-md'}
                  `}
                  title={file.name}
                >
                   {/* Mobile Layout: Simple List Row */}
                   <div className="flex md:hidden items-center p-3 gap-3">
                        <div className={`shrink-0 w-10 h-10 flex items-center justify-center rounded-lg text-lg ${isSelected ? 'bg-indigo-100' : 'bg-slate-50'}`}>
                             {file.type === FileType.FOLDER ? (
                                <i className="fas fa-folder text-amber-300"></i>
                             ) : (
                                <i className={`fas ${file.type === FileType.PDF ? 'fa-file-pdf text-red-400' : 'fa-file text-slate-400'}`}></i>
                             )}
                        </div>
                        <span className="text-sm font-bold text-slate-700 truncate flex-1 min-w-0">{file.name}</span>
                        {isSelected && <i className="fas fa-check-circle text-indigo-600 text-xl shrink-0"></i>}
                   </div>

                   {/* Desktop Layout: Vertical Card with separate image/text areas */}
                   <div className="hidden md:flex flex-col h-full">
                        {/* Top: Image/Icon Area (Fixed Height) */}
                        <div className={`h-32 w-full flex items-center justify-center relative overflow-hidden ${isSelected ? 'bg-indigo-50/50' : 'bg-slate-50'}`}>
                            {file.type === FileType.FOLDER ? (
                                <i className="fas fa-folder text-5xl text-amber-300 drop-shadow-sm"></i>
                            ) : file.thumbnail ? (
                                <img src={file.thumbnail} className="w-full h-full object-cover transform group-hover:scale-105 transition-transform duration-500" alt={file.name} />
                            ) : (
                                <i className={`fas ${file.type === FileType.PDF ? 'fa-file-pdf text-red-400' : 'fa-file text-slate-300'} text-4xl`}></i>
                            )}
                            
                            {/* Selection Checkmark Overlay */}
                            {isSelected && file.type !== FileType.FOLDER && (
                                <div className="absolute top-2 right-2 w-6 h-6 bg-indigo-600 rounded-full flex items-center justify-center shadow-sm z-10">
                                    <i className="fas fa-check text-white text-xs"></i>
                                </div>
                            )}
                        </div>
                        
                        {/* Bottom: Text Area (Auto Height) */}
                        <div className="p-3 border-t border-slate-100 flex-1 flex items-start">
                             <span className="text-xs font-bold text-slate-700 line-clamp-2 leading-tight break-words w-full">
                                {file.name}
                             </span>
                        </div>
                   </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="p-4 border-t border-slate-100 bg-white flex justify-between items-center shrink-0">
        <span className="text-xs font-bold text-slate-500">{localSelection.length} valda</span>
        <div className="flex gap-2">
            {/* Mobile Actions */}
            <button onClick={handleAddEmptySource} className="md:hidden px-3 py-2 bg-slate-100 rounded-lg text-slate-600"><i className="fas fa-plus"></i></button>
            <button onClick={handlePasteText} className="md:hidden px-3 py-2 bg-slate-100 rounded-lg text-slate-600"><i className="fas fa-paste"></i></button>
            
            <button 
            onClick={handleDone}
            disabled={localSelection.length === 0}
            className="px-6 py-2 bg-indigo-600 text-white rounded-lg font-bold text-sm hover:bg-indigo-700 disabled:opacity-50 transition-all shadow-lg shadow-indigo-200"
            >
            Lägg till
            </button>
        </div>
      </div>
      
      <input 
        type="file" 
        multiple 
        ref={fileInputRef} 
        onChange={handleFileSelect}
        className="hidden" 
      />
    </div>
  );
};

export default FileBrowser;
