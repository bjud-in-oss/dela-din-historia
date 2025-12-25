
import React, { useState, useEffect, useRef } from 'react';
import { DriveFile, MemoryBook, FileType, AppSettings, CompressionLevel } from './types';
import Layout from './components/Layout';
import FileBrowser from './components/FileBrowser';
import StoryEditor from './components/StoryEditor';
import Dashboard from './components/Dashboard';
import AppLogo from './components/AppLogo';
import LandingPage from './components/LandingPage';
import { createFolder, fetchDriveFiles } from './services/driveService';

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
  const [showSourceSelector, setShowSourceSelector] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false); 
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [isCreatingBook, setIsCreatingBook] = useState(false);
  
  // New state to remember pending actions during auth flow
  const [pendingAction, setPendingAction] = useState<'createBook' | 'addSource' | null>(null);

  // Dashboard Intro State
  const [hideIntro, setHideIntro] = useState(false);
  // Separate state for the checkbox to allow "hide NEXT time" without hiding immediately
  const [hideIntroNextTime, setHideIntroNextTime] = useState(false);

  const [insertAtIndex, setInsertAtIndex] = useState<number | null>(null);
  const [books, setBooks] = useState<MemoryBook[]>([]);

  // App Settings State - Updated defaults per request
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
  
  // Refs for Google Buttons (Desktop vs Mobile)
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

  // Execute pending actions when authenticated
  useEffect(() => {
      if (user?.accessToken && pendingAction) {
          if (pendingAction === 'createBook') {
              handleCreateBook();
          } else if (pendingAction === 'addSource') {
              setShowSourceSelector(true);
          }
          setPendingAction(null);
      }
  }, [user?.accessToken, pendingAction]);

  // Render buttons when ready
  useEffect(() => {
    if (isGoogleReady && !isAuthenticated) {
      try {
        // Render Desktop Button (Large width, "Sign in with Google")
        if (headerGoogleBtnDesktopRef.current) {
            window.google.accounts.id.renderButton(headerGoogleBtnDesktopRef.current, { 
                theme: "outline", 
                size: "large", 
                shape: "pill",
                width: 250,
                text: "signin_with" // Default: "Logga in med Google"
            });
        }
        
        // Render Mobile Button (Small width, "Sign in")
        if (headerGoogleBtnMobileRef.current) {
            window.google.accounts.id.renderButton(headerGoogleBtnMobileRef.current, { 
                theme: "outline", 
                size: "large", 
                shape: "pill",
                width: 120, // Smaller width
                text: "signin" // Renders "Logga in"
            });
        }
      } catch (e) {
        console.error("Kunde inte rendera Google-knappen", e);
      }
    }
  }, [isGoogleReady, isAuthenticated]);

  useEffect(() => {
    const savedBooks = localStorage.getItem('memory_books');
    if (savedBooks) {
      try {
        const parsedBooks: MemoryBook[] = JSON.parse(savedBooks);
        const sanitizedBooks = parsedBooks.map(book => ({
            ...book,
            items: book.items.map(item => ({
                ...item,
                processedBuffer: undefined, 
                processedSize: undefined,
                blobUrl: item.isLocal ? item.blobUrl : undefined
            }))
        }));
        setBooks(sanitizedBooks);
      } catch (e) {
        console.error("Failed to load books", e);
      }
    }

    const savedHideIntro = localStorage.getItem('hide_intro');
    if (savedHideIntro === 'true') {
      setHideIntro(true);
      setHideIntroNextTime(true);
    }
  }, []);

  useEffect(() => {
    if (books.length > 0) {
      localStorage.setItem('memory_books', JSON.stringify(books));
    }
  }, [books]);

  // Global helper to trigger share from StoryEditor button
  useEffect(() => {
    window.triggerShare = () => setShowShareModal(true);
    return () => { window.triggerShare = undefined; };
  }, []);

  const toggleIntroCheckbox = (shouldHide: boolean) => {
      setHideIntroNextTime(shouldHide);
      localStorage.setItem('hide_intro', String(shouldHide));
      // Note: We do NOT update 'hideIntro' here, because we want it to hide "next time", 
      // not immediately while the user is looking at it, unless we wanted instant feedback. 
      // The requirement says "nästa gång" (next time).
  };

  // STRICT FOLDER CREATION LOGIC
  const ensureBookFolder = async (title: string): Promise<string> => {
    if (!user?.accessToken) throw new Error("Ingen åtkomst till Drive");
    
    // 1. Check for Root Folder "Dela din historia"
    const rootFiles = await fetchDriveFiles(user.accessToken, 'root');
    let rootFolder = rootFiles.find(f => f.name === 'Dela din historia' && f.type === FileType.FOLDER);
    
    if (!rootFolder) {
      const rootId = await createFolder(user.accessToken, 'root', 'Dela din historia');
      rootFolder = { id: rootId } as DriveFile;
    }

    // 2. Check/Create Book Subfolder
    const bookFiles = await fetchDriveFiles(user.accessToken, rootFolder.id);
    let bookFolder = bookFiles.find(f => f.name === title && f.type === FileType.FOLDER);

    if (!bookFolder) {
      const bookId = await createFolder(user.accessToken, rootFolder.id, title);
      return bookId;
    }
    
    return bookFolder.id;
  };

  const handleCreateBook = async () => {
    if (!user?.accessToken) {
       setPendingAction('createBook');
       handleRequestDriveAccess();
       return;
    }

    setIsCreatingBook(true);
    const title = 'Min Nya Berättelse';
    
    try {
      // Create folder structure immediately
      const folderId = await ensureBookFolder(title);

      const newBook: MemoryBook = {
        id: `book-${Date.now()}`,
        title: title,
        createdAt: new Date().toISOString(),
        items: [],
        driveFolderId: folderId // Store the ID!
      };

      setBooks(prev => [newBook, ...prev]);
      setCurrentBook(newBook);
      setInsertAtIndex(null);
      setShowSourceSelector(true);
    } catch (e) {
      console.error("Kunde inte skapa bokmapp", e);
      alert("Kunde inte skapa mappen på Drive. Kontrollera dina rättigheter.");
    } finally {
      setIsCreatingBook(false);
    }
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

  const handleUpdateBooks = (newBooks: MemoryBook[]) => {
      setBooks(newBooks);
      localStorage.setItem('memory_books', JSON.stringify(newBooks));
  };

  // UNIFIED BACK HANDLER
  const handleBack = () => {
     if (showShareModal) {
         setShowShareModal(false);
     } else if (currentBook) {
         setCurrentBook(null);
     } else {
         setCurrentBook(null); // Already on Dashboard
     }
  };

  // Render Content based on state
  const renderContent = () => {
      if (!isAuthenticated || !user) {
          return (
            <LandingPage 
                isGoogleReady={isGoogleReady} 
                googleLoadError={googleLoadError} 
                isAuthenticated={isAuthenticated}
            />
          );
      }

      if (!currentBook) {
          // DASHBOARD + OPTIONAL INTRO TEXT (Split Screen)
          return (
            <div className="flex flex-col lg:flex-row h-full w-full overflow-hidden bg-[#f8fafc]">
                
                {/* Left Column: Books */}
                <div className={`flex-1 overflow-y-auto p-4 md:p-8 ${!hideIntro ? 'lg:border-r border-slate-200' : ''}`}>
                    <div className="max-w-7xl mx-auto w-full">
                        <Dashboard 
                            books={books} 
                            onCreateNew={handleCreateBook} 
                            onOpenBook={setCurrentBook} 
                            onUpdateBooks={handleUpdateBooks}
                        />
                    </div>
                </div>
                
                {/* Right Column: Intro Text (if enabled) */}
                {!hideIntro && (
                    <div className="w-full lg:w-[45%] xl:w-[40%] bg-white shadow-inner lg:shadow-none flex flex-col shrink-0 overflow-hidden border-t lg:border-t-0 border-slate-200">
                         <div className="flex-1 overflow-y-auto custom-scrollbar">
                             <LandingPage 
                                 isGoogleReady={true} 
                                 googleLoadError={false} 
                                 isAuthenticated={false} // Pass false to hide the "Logged in" banner inside component
                                 compact={true} // New prop to remove excess padding
                            />
                         </div>
                         <div className="p-6 border-t border-slate-100 bg-slate-50 shrink-0">
                             <label className="flex items-center space-x-3 text-sm font-bold text-slate-500 cursor-pointer hover:text-slate-800 transition-colors select-none">
                                 <input 
                                    type="checkbox" 
                                    checked={hideIntroNextTime}
                                    onChange={(e) => toggleIntroCheckbox(e.target.checked)} 
                                    className="w-5 h-5 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300" 
                                 />
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
                  setBooks(prevBooks => prevBooks.map(b => b.id === updatedBook.id ? updatedBook : b));
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
      user={user} // Can be null now
      onLogout={() => { setIsAuthenticated(false); setUser(null); }}
      showBookControls={!!currentBook && isAuthenticated}
      currentBookTitle={currentBook?.title}
      onUpdateBookTitle={currentBook ? (newTitle) => handleUpdateBook({ ...currentBook, title: newTitle }) : undefined}
      onAddSource={() => { 
          if(!user?.accessToken) {
              setPendingAction('addSource');
              handleRequestDriveAccess();
          } else {
              setInsertAtIndex(null); setShowSourceSelector(true); 
          }
      }}
      onCreateBook={handleCreateBook}
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
                <p className="text-xs text-slate-400">Dela din historia / Min Nya Berättelse</p>
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

      {/* Settings Modal */}
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
                   <label className="block text-sm font-bold text-slate-700 mb-2">Säkerhetsmarginal (%)</label>
                   <p className="text-xs text-slate-500 mb-3">PDF-formatet lägger till lite extra data utöver bilderna.</p>
                   <div className="flex items-center space-x-4">
                      <input type="range" min="0" max="20" step="1" value={settings.safetyMarginPercent} onChange={(e) => setSettings({...settings, safetyMarginPercent: parseInt(e.target.value)})} className="flex-1 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"/>
                      <span className="text-sm font-bold text-indigo-600 w-12 text-right">{settings.safetyMarginPercent}%</span>
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
