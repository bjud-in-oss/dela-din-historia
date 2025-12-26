
import React, { useState, useEffect, useRef } from 'react';
import { DriveFile, MemoryBook, FileType, AppSettings, CompressionLevel } from './types';
import Layout from './components/Layout';
import FileBrowser from './components/FileBrowser';
import StoryEditor from './components/StoryEditor';
import Dashboard from './components/Dashboard';
import AppLogo from './components/AppLogo';
import LandingPage from './components/LandingPage';
import { createFolder, fetchDriveFiles, findOrCreateFolder, moveFile, listDriveBookFolders, fetchProjectState } from './services/driveService';

declare global {
  interface Window {
    google: any;
    triggerShare?: () => void;
  }
}

interface GoogleUser {
  name: string;
  email: string;
  picture: string;
  accessToken?: string;
}

const App: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<GoogleUser | null>(null);
  const [isGoogleReady, setIsGoogleReady] = useState(false);
  const [googleLoadError, setGoogleLoadError] = useState(false);
  
  const [currentBook, setCurrentBook] = useState<MemoryBook | null>(null);
  const [isLoadingBook, setIsLoadingBook] = useState(false); // New state for loading book details

  const [showSourceSelector, setShowSourceSelector] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false); 
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  
  // Create Book Flow State
  const [isCreatingBook, setIsCreatingBook] = useState(false);
  const [showCreateBookModal, setShowCreateBookModal] = useState(false);
  const [newBookTitle, setNewBookTitle] = useState('');
  
  // New state to remember pending actions during auth flow
  const [pendingAction, setPendingAction] = useState<'createBook' | 'addSource' | null>(null);

  // Dashboard Intro State
  const [hideIntro, setHideIntro] = useState(false);
  const [hideIntroNextTime, setHideIntroNextTime] = useState(false);

  const [insertAtIndex, setInsertAtIndex] = useState<number | null>(null);
  const [books, setBooks] = useState<MemoryBook[]>([]);

  // App Settings State
  const [settings, setSettings] = useState<AppSettings>({
    compressionLevel: 'low',
    maxChunkSizeMB: 15.0,
    safetyMarginPercent: 1 
  });

  const [browserState, setBrowserState] = useState({
    currentFolder: 'root',
    currentDriveId: null as string | null,
    breadcrumbs: [{id: 'root', name: 'Min Enhet'}],
    activeTab: 'local' as 'local' | 'drive' | 'shared'
  });
  
  const headerGoogleBtnDesktopRef = useRef<HTMLDivElement>(null); 
  const headerGoogleBtnMobileRef = useRef<HTMLDivElement>(null);
  const tokenClientRef = useRef<any>(null);

  const decodeJwt = (token: string) => {
    try {
      return JSON.parse(decodeURIComponent(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')).split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join('')));
    } catch { return null; }
  };

  const handleCredentialResponse = (response: any) => {
    const payload = decodeJwt(response.credential);
    if (payload) {
      setUser({ name: payload.name, email: payload.email, picture: payload.picture });
      setIsAuthenticated(true);
    }
  };

  const handleRequestDriveAccess = () => {
    if (tokenClientRef.current && user) {
      tokenClientRef.current.requestAccessToken({ login_hint: user.email, prompt: 'consent' });
    }
  };

  useEffect(() => {
    const clientId = process.env.GOOGLE_CLIENT_ID || '765827205160-ft7dv2ud5ruf2tgft4jvt68dm7eboei6.apps.googleusercontent.com';
    
    if (!clientId) {
      console.error("Saknar GOOGLE_CLIENT_ID");
      setGoogleLoadError(true);
      return;
    }

    const initializeGSI = () => {
      if (window.google?.accounts?.id && !isGoogleReady) {
        try {
          window.google.accounts.id.initialize({
            client_id: clientId, 
            callback: handleCredentialResponse,
            auto_select: false
          });

          tokenClientRef.current = window.google.accounts.oauth2.initTokenClient({
            client_id: clientId,
            scope: "https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/drive.file",
            callback: (r: any) => {
              if (r?.access_token) {
                setUser(prev => prev ? { ...prev, accessToken: r.access_token } : null);
                setIsAuthenticated(true);
              }
            },
          });

          setIsGoogleReady(true);
          setGoogleLoadError(false);
        } catch (error) {
          console.error("GSI initialization error:", error);
          setGoogleLoadError(true);
        }
      }
    };

    initializeGSI();

    const interval = setInterval(() => {
      if (window.google?.accounts?.id) {
        initializeGSI();
        clearInterval(interval);
      }
    }, 500);

    const timeout = setTimeout(() => {
      clearInterval(interval);
      if (!window.google?.accounts?.id) {
        setGoogleLoadError(true);
      }
    }, 8000);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [isGoogleReady]);

  // SYNC BOOKS FROM DRIVE ON AUTH
  useEffect(() => {
      if (user?.accessToken) {
          const syncBooks = async () => {
              const driveBooks = await listDriveBookFolders(user.accessToken!);
              
              setBooks(prevLocalBooks => {
                  // Merge strategy:
                  // 1. Keep local books if they match an ID from Drive (prefer Drive metadata?)
                  // 2. Add new books from Drive that aren't local
                  // 3. Remove local books that shouldn't exist? (Maybe safer to keep them visually but mark as sync issue? For now, we trust Drive listing)
                  
                  // Simple approach: Trust Drive list for existence. 
                  // If we have local detail (items > 0), maybe keep it, but project.json load will override anyway.
                  
                  // Map Drive ID to existing local book to preserve some state if needed, 
                  // but mostly we want to populate the dashboard with what's on Drive.
                  
                  const merged = driveBooks.map(dBook => {
                      const localMatch = prevLocalBooks.find(l => l.title === dBook.title); // Match by title if ID differs (legacy)
                      if (localMatch) {
                           return { ...localMatch, driveFolderId: dBook.driveFolderId, id: dBook.id };
                      }
                      return dBook;
                  });
                  return merged;
              });
          };
          syncBooks();
          
          if (pendingAction) {
              if (pendingAction === 'createBook') setShowCreateBookModal(true);
              else if (pendingAction === 'addSource') setShowSourceSelector(true);
              setPendingAction(null);
          }
      }
  }, [user?.accessToken]);

  // Render buttons
  useEffect(() => {
    if (isGoogleReady && !isAuthenticated) {
      try {
        if (headerGoogleBtnDesktopRef.current) {
            window.google.accounts.id.renderButton(headerGoogleBtnDesktopRef.current, { theme: "outline", size: "large", shape: "pill", width: 250, text: "signin_with" });
        }
        if (headerGoogleBtnMobileRef.current) {
            window.google.accounts.id.renderButton(headerGoogleBtnMobileRef.current, { theme: "outline", size: "large", shape: "pill", width: 120, text: "signin" });
        }
      } catch (e) { console.error(e); }
    }
  }, [isGoogleReady, isAuthenticated]);

  // Load local preferences
  useEffect(() => {
    const savedHideIntro = localStorage.getItem('hide_intro');
    if (savedHideIntro === 'true') {
      setHideIntro(true);
      setHideIntroNextTime(true);
    }
  }, []);

  useEffect(() => {
    window.triggerShare = () => setShowShareModal(true);
    return () => { window.triggerShare = undefined; };
  }, []);

  const toggleIntroCheckbox = (shouldHide: boolean) => {
      setHideIntroNextTime(shouldHide);
      localStorage.setItem('hide_intro', String(shouldHide));
  };

  const ensureBookFolder = async (title: string): Promise<string> => {
    if (!user?.accessToken) throw new Error("Ingen åtkomst till Drive");
    const rootFiles = await fetchDriveFiles(user.accessToken, 'root');
    let rootFolder = rootFiles.find(f => f.name === 'Dela din historia' && f.type === FileType.FOLDER);
    if (!rootFolder) {
      const rootId = await createFolder(user.accessToken, 'root', 'Dela din historia');
      rootFolder = { id: rootId } as DriveFile;
    }
    const bookFiles = await fetchDriveFiles(user.accessToken, rootFolder.id);
    let bookFolder = bookFiles.find(f => f.name.toLowerCase() === title.toLowerCase() && f.type === FileType.FOLDER);
    if (bookFolder) throw new Error("DUPLICATE_NAME");
    return await createFolder(user.accessToken, rootFolder.id, title);
  };

  const handleInitiateCreateBook = () => {
    if (!user?.accessToken) {
       setPendingAction('createBook');
       handleRequestDriveAccess();
       return;
    }
    setNewBookTitle('');
    setShowCreateBookModal(true);
  };

  const handleCreateBookSubmit = async () => {
    const title = newBookTitle.trim();
    if (!title) return;
    if (books.some(b => b.title.toLowerCase() === title.toLowerCase())) {
        alert("En bok med detta namn finns redan.");
        return;
    }

    setIsCreatingBook(true);
    setShowCreateBookModal(false);
    
    try {
      const folderId = await ensureBookFolder(title);
      const newBook: MemoryBook = {
        id: folderId, // Use folder ID as book ID
        title: title,
        createdAt: new Date().toISOString(),
        items: [],
        driveFolderId: folderId
      };

      setBooks(prev => [newBook, ...prev]);
      setCurrentBook(newBook);
      setInsertAtIndex(null);
      setShowSourceSelector(true);
    } catch (e: any) {
      if (e.message === "DUPLICATE_NAME") {
          alert("En mapp med detta namn finns redan.");
          setShowCreateBookModal(true);
      } else {
          alert("Kunde inte skapa mappen på Drive.");
      }
    } finally {
      setIsCreatingBook(false);
    }
  };

  // OPEN BOOK: Load state from Drive
  const handleOpenBook = async (book: MemoryBook) => {
      if (!user?.accessToken) {
          alert("Du måste vara inloggad för att öppna böcker.");
          return;
      }
      
      setIsLoadingBook(true);
      try {
          // Attempt to load project.json from the folder
          if (book.driveFolderId) {
              const cloudState = await fetchProjectState(user.accessToken, book.driveFolderId);
              if (cloudState) {
                  setCurrentBook(cloudState);
                  // Also update the book in the list in case metadata changed
                  setBooks(prev => prev.map(b => b.id === book.id ? { ...b, ...cloudState } : b));
              } else {
                  // No project file? Just open empty/local version
                  setCurrentBook(book);
              }
          } else {
             setCurrentBook(book);
          }
      } catch (e) {
          console.error("Failed to load book state", e);
          setCurrentBook(book); // Fallback
      } finally {
          setIsLoadingBook(false);
      }
  };

  const handleDeleteBook = async (book: MemoryBook) => {
      if (!confirm(`Vill du ta bort boken "${book.title}"?`)) return;
      if (book.driveFolderId && user?.accessToken) {
          try {
              const rootFiles = await fetchDriveFiles(user.accessToken, 'root');
              let rootFolder = rootFiles.find(f => f.name === 'Dela din historia' && f.type === FileType.FOLDER);
              if (rootFolder) {
                  const trashId = await findOrCreateFolder(user.accessToken, rootFolder.id, "Papperskorg");
                  await moveFile(user.accessToken, book.driveFolderId, trashId);
                  alert(`Boken flyttad till Papperskorgen på Drive.`);
              }
          } catch (e) {
              alert("Kunde inte flytta på Drive, men tar bort från listan.");
          }
      }
      setBooks(prev => prev.filter(b => b.id !== book.id));
  };

  const handleAddItemsToBook = (newItems: DriveFile[]) => {
    if (!currentBook) return;
    let updatedItems = [...currentBook.items];
    if (insertAtIndex !== null) {
      updatedItems.splice(insertAtIndex, 0, ...newItems);
    } else {
      updatedItems = [...updatedItems, ...newItems];
    }
    const updatedBook = { ...currentBook, items: updatedItems };
    setCurrentBook(updatedBook);
    setBooks(prev => prev.map(b => b.id === updatedBook.id ? updatedBook : b));
    setInsertAtIndex(null);
  };

  const handleUpdateBook = (updatedBook: MemoryBook) => {
    setCurrentBook(updatedBook);
    setBooks(prev => prev.map(b => b.id === updatedBook.id ? updatedBook : b));
  };

  const handleBack = () => {
     if (showShareModal) setShowShareModal(false);
     else setCurrentBook(null);
  };

  const renderContent = () => {
      if (!isAuthenticated || !user) {
          return (
            <LandingPage isGoogleReady={isGoogleReady} googleLoadError={googleLoadError} isAuthenticated={isAuthenticated} />
          );
      }

      if (isLoadingBook) {
          return (
             <div className="flex h-full items-center justify-center flex-col bg-[#f8fafc]">
                 <div className="w-16 h-16 mb-4">
                     <AppLogo variant="phase2" className="animate-bounce" />
                 </div>
                 <p className="text-slate-500 font-bold animate-pulse">Hämtar bokens innehåll från Drive...</p>
             </div>
          );
      }

      if (!currentBook) {
          return (
            <div className="flex flex-col lg:flex-row h-full w-full overflow-hidden bg-[#f8fafc]">
                <div className={`flex-1 overflow-y-auto p-4 md:p-8 ${!hideIntro ? 'lg:border-r border-slate-200' : ''}`}>
                    <div className="max-w-7xl mx-auto w-full">
                        <Dashboard 
                            books={books} 
                            onCreateNew={handleInitiateCreateBook} 
                            onOpenBook={handleOpenBook} 
                            onUpdateBooks={setBooks}
                            onDeleteBook={handleDeleteBook}
                        />
                    </div>
                </div>
                {!hideIntro && (
                    <div className="w-full lg:w-[45%] xl:w-[40%] bg-white shadow-inner lg:shadow-none flex flex-col shrink-0 overflow-hidden border-t lg:border-t-0 border-slate-200">
                         <div className="flex-1 overflow-y-auto custom-scrollbar">
                             <LandingPage isGoogleReady={true} googleLoadError={false} isAuthenticated={false} compact={true} />
                         </div>
                         <div className="p-6 border-t border-slate-100 bg-slate-50 shrink-0">
                             <label className="flex items-center space-x-3 text-sm font-bold text-slate-500 cursor-pointer hover:text-slate-800 transition-colors select-none">
                                 <input type="checkbox" checked={hideIntroNextTime} onChange={(e) => toggleIntroCheckbox(e.target.checked)} className="w-5 h-5 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300" />
                                 <span>Dölj introduktionstexten nästa gång</span>
                             </label>
                         </div>
                    </div>
                )}
            </div>
          );
      }

      return (
        <StoryEditor 
          currentBook={currentBook} 
          items={currentBook.items}
          onUpdateItems={(newItemsOrUpdater) => {
              setCurrentBook(prevBook => {
                  if (!prevBook) return null;
                  const newItems = typeof newItemsOrUpdater === 'function' ? newItemsOrUpdater(prevBook.items) : newItemsOrUpdater;
                  const updatedBook = { ...prevBook, items: newItems };
                  // Don't update global books here to avoid flicker, handled by Editor auto-save or back
                  return updatedBook;
              });
          }}
          accessToken={user.accessToken!}
          bookTitle={currentBook.title}
          onUpdateBookTitle={(newTitle) => handleUpdateBook({ ...currentBook, title: newTitle })}
          showShareView={showShareModal}
          onCloseShareView={() => setShowShareModal(false)}
          onOpenSourceSelector={(idx) => { setInsertAtIndex(idx); setShowSourceSelector(true); }}
          settings={settings}
        />
      );
  };

  return (
    <Layout 
      user={user} 
      onLogout={() => { setIsAuthenticated(false); setUser(null); }}
      showBookControls={!!currentBook && isAuthenticated}
      currentBookTitle={currentBook?.title}
      onUpdateBookTitle={currentBook ? (newTitle) => handleUpdateBook({ ...currentBook, title: newTitle }) : undefined}
      onAddSource={() => { 
          if(!user?.accessToken) { setPendingAction('addSource'); handleRequestDriveAccess(); } 
          else { setInsertAtIndex(null); setShowSourceSelector(true); }
      }}
      onCreateBook={handleInitiateCreateBook}
      onShare={() => setShowShareModal(true)}
      onBack={handleBack} 
      onOpenSettings={() => setShowSettingsModal(true)}
      activePhase={showShareModal ? 'phase3' : (currentBook ? 'phase2' : 'phase1')}
      googleBtnDesktopRef={headerGoogleBtnDesktopRef}
      googleBtnMobileRef={headerGoogleBtnMobileRef}
    >
      {isCreatingBook && (
         <div className="fixed inset-0 z-[100] bg-white/80 backdrop-blur-sm flex items-center justify-center">
            <div className="flex flex-col items-center">
                <i className="fas fa-folder-plus fa-spin text-4xl text-indigo-600 mb-4"></i>
                <p className="font-bold text-slate-700">Skapar mappstruktur på Drive...</p>
                <p className="text-xs text-slate-400">Dela din historia / {newBookTitle || 'Ny bok'}</p>
            </div>
         </div>
      )}

      {renderContent()}

      {showSourceSelector && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-0 md:p-4">
           <div className="bg-white md:rounded-2xl shadow-2xl w-full max-w-4xl h-full md:h-[80vh] overflow-hidden flex flex-col">
              <FileBrowser 
                accessToken={user?.accessToken || ''}
                onRequestAccess={handleRequestDriveAccess}
                onAddFiles={handleAddItemsToBook}
                selectedIds={currentBook?.items.map(i => i.id) || []}
                browserState={browserState}
                onUpdateState={setBrowserState}
                onClose={() => setShowSourceSelector(false)}
              />
           </div>
        </div>
      )}

      {showCreateBookModal && (
        <div className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in">
                 <div className="p-6">
                     <div className="w-12 h-12 bg-indigo-50 rounded-full flex items-center justify-center text-indigo-600 mb-4 mx-auto">
                        <i className="fas fa-book-medical text-xl"></i>
                     </div>
                     <h3 className="text-lg font-bold text-slate-900 text-center mb-1">Skapa ny bok</h3>
                     <p className="text-xs text-slate-500 text-center mb-6">
                         Ange ett namn för din bok. En mapp med detta namn kommer skapas på din Google Drive.
                     </p>
                     
                     <div className="space-y-4">
                         <div>
                             <label className="block text-xs font-bold text-slate-700 mb-1 ml-1">Bokens titel</label>
                             <input 
                                autoFocus
                                type="text" 
                                value={newBookTitle}
                                onChange={(e) => setNewBookTitle(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && newBookTitle.trim() && handleCreateBookSubmit()}
                                placeholder="T.ex. Farmors memoarer..."
                                className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 outline-none font-bold text-slate-800"
                             />
                         </div>
                         <div className="flex space-x-3">
                             <button onClick={() => setShowCreateBookModal(false)} className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold rounded-xl transition-colors">Avbryt</button>
                             <button onClick={handleCreateBookSubmit} disabled={!newBookTitle.trim()} className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition-colors disabled:opacity-50 shadow-lg shadow-indigo-200">Skapa</button>
                         </div>
                     </div>
                 </div>
            </div>
        </div>
      )}

      {showSettingsModal && (
        <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in">
             <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                <h3 className="text-lg font-bold text-slate-900">Inställningar</h3>
                <button onClick={() => setShowSettingsModal(false)} className="text-slate-400 hover:text-red-500"><i className="fas fa-times"></i></button>
             </div>
             <div className="p-6 space-y-6">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">Max filstorlek för FamilySearch</label>
                  <p className="text-xs text-slate-500 mb-3">Styr hur stor varje del-PDF får vara innan boken delas upp. FamilySearch har en gräns på 15 MB.</p>
                  <div className="flex items-center space-x-3">
                    <input type="number" min="5" max="50" step="0.1" value={settings.maxChunkSizeMB} onChange={(e) => setSettings({...settings, maxChunkSizeMB: parseFloat(e.target.value)})} className="w-24 px-3 py-2 border border-slate-300 rounded-lg text-sm font-bold"/>
                    <span className="text-sm font-bold text-slate-600">MB</span>
                  </div>
                </div>
                <div>
                   <label className="block text-sm font-bold text-slate-700 mb-2">Komprimeringsgrad</label>
                   <div className="grid grid-cols-3 gap-2">
                      {(['low', 'medium', 'high'] as CompressionLevel[]).map(level => (
                        <button key={level} onClick={() => setSettings({...settings, compressionLevel: level})} className={`py-2 px-3 rounded-lg text-xs font-bold capitalize border ${settings.compressionLevel === level ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'}`}>
                          {level === 'low' ? 'Låg' : level === 'medium' ? 'Medium' : 'Hög'}
                        </button>
                      ))}
                   </div>
                </div>
             </div>
             <div className="p-4 bg-slate-50 text-right">
                <button onClick={() => setShowSettingsModal(false)} className="px-6 py-2 bg-slate-900 text-white font-bold rounded-lg hover:bg-slate-800">Klar</button>
             </div>
          </div>
        </div>
      )}
    </Layout>
  );
};

export default App;
