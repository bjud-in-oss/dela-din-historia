
import React, { useState, useEffect, useRef } from 'react';
import { DriveFile, MemoryBook, FileType, AppSettings, CompressionLevel } from './types';
import Layout from './components/Layout';
import FileBrowser from './components/FileBrowser';
import StoryEditor from './components/StoryEditor';
import Dashboard from './components/Dashboard';
import AppLogo from './components/AppLogo';
import LandingPage from './components/LandingPage';

declare global {
  interface Window {
    google: any;
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

  const [insertAtIndex, setInsertAtIndex] = useState<number | null>(null);
  const [books, setBooks] = useState<MemoryBook[]>([]);

  // App Settings State
  const [settings, setSettings] = useState<AppSettings>({
    compressionLevel: 'medium',
    maxChunkSizeMB: 14.7,
    safetyMarginPercent: 5 // Default 5% safety margin
  });

  const [browserState, setBrowserState] = useState({
    currentFolder: 'root',
    currentDriveId: null as string | null,
    breadcrumbs: [{id: 'root', name: 'Min Enhet'}],
    activeTab: 'local' as 'local' | 'drive' | 'shared'
  });
  
  const googleBtnRef = useRef<HTMLDivElement>(null);
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

  useEffect(() => {
    if (isGoogleReady && googleBtnRef.current && !user) {
      try {
        window.google.accounts.id.renderButton(googleBtnRef.current, { 
          theme: "outline", 
          size: "large", 
          shape: "pill",
          width: 280
        });
      } catch (e) {
        console.error("Kunde inte rendera Google-knappen", e);
      }
    }
  }, [isGoogleReady, user]);

  useEffect(() => {
    const savedBooks = localStorage.getItem('memory_books');
    if (savedBooks) {
      try {
        const parsedBooks: MemoryBook[] = JSON.parse(savedBooks);
        // Sanitera böckerna från korrupta ArrayBuffers (processedBuffer) som inte överlever JSON-serialisering
        const sanitizedBooks = parsedBooks.map(book => ({
            ...book,
            items: book.items.map(item => ({
                ...item,
                processedBuffer: undefined, // Rensa denna då den inte kan sparas/laddas korrekt
                processedSize: undefined
            }))
        }));
        setBooks(sanitizedBooks);
      } catch (e) {
        console.error("Failed to load books", e);
      }
    }
  }, []);

  useEffect(() => {
    if (books.length > 0) {
      // Vi sparar böckerna men processedBuffer kommer inte sparas korrekt (vilket är förväntat)
      // Nästa gång vi laddar rensar vi upp det i useEffect ovan.
      localStorage.setItem('memory_books', JSON.stringify(books));
    }
  }, [books]);

  const handleCreateBook = () => {
    const newBook: MemoryBook = {
      id: `book-${Date.now()}`,
      title: 'Min Nya Berättelse',
      createdAt: new Date().toISOString(),
      items: []
    };
    setBooks(prev => [newBook, ...prev]);
    setCurrentBook(newBook);
    setInsertAtIndex(null);
    setShowSourceSelector(true);
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

  if (!user || !isAuthenticated) {
    return (
      <LandingPage 
        googleBtnRef={googleBtnRef} 
        isGoogleReady={isGoogleReady} 
        googleLoadError={googleLoadError} 
      />
    );
  }

  // Authenticated State
  if (!user) return null; 

  return (
    <Layout 
      user={user} 
      onLogout={() => { setIsAuthenticated(false); setUser(null); }}
      showBookControls={!!currentBook}
      currentBookTitle={currentBook?.title}
      onUpdateBookTitle={currentBook ? (newTitle) => handleUpdateBook({ ...currentBook, title: newTitle }) : undefined}
      onAddSource={() => { setInsertAtIndex(null); setShowSourceSelector(true); }}
      onCreateBook={handleCreateBook}
      onShare={() => setShowShareModal(true)}
      onLogoClick={() => setCurrentBook(null)}
      onOpenSettings={() => setShowSettingsModal(true)}
      activePhase={showShareModal ? 'phase3' : (currentBook ? 'phase2' : 'phase1')}
    >
      {!currentBook ? (
        <div className="flex flex-col items-center md:items-start justify-center h-full max-w-7xl mx-auto px-8">
            <div className="w-full flex flex-col md:flex-row gap-12 items-center">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-6">
                      <h1 className="text-3xl font-black text-slate-900">Dela din historia</h1>
                      <AppLogo variant="phase1" className="w-12 h-12" />
                  </div>
                  <p className="text-xs font-bold text-slate-400 uppercase mb-8">Över generationer i FamilySearch</p>
                  
                  <div className="flex items-center gap-4 mb-8">
                     <img src={user.picture} className="w-16 h-16 rounded-full border-4 border-white shadow-lg" alt="Profile" />
                     <div>
                        <h2 className="text-2xl font-bold text-slate-800 tracking-tight">Välkommen, {user.name}!</h2>
                        <p className="text-sm text-slate-500">{user.email}</p>
                        {!user.accessToken && (
                           <p className="text-xs text-indigo-600 font-bold mt-1">Drive ej ansluten</p>
                        )}
                     </div>
                  </div>
                </div>
                
                <div className="flex-1 w-full h-[600px]">
                    <Dashboard 
                        books={books} 
                        onCreateNew={handleCreateBook} 
                        onOpenBook={setCurrentBook} 
                        onUpdateBooks={handleUpdateBooks}
                    />
                </div>
            </div>
        </div>
      ) : (
        <StoryEditor 
          items={currentBook.items}
          onUpdateItems={(newItemsOrUpdater) => {
              setCurrentBook(prevBook => {
                  if (!prevBook) return null;
                  
                  const newItems = typeof newItemsOrUpdater === 'function' 
                      ? newItemsOrUpdater(prevBook.items)
                      : newItemsOrUpdater;
                  
                  const updatedBook = { ...prevBook, items: newItems };
                  
                  // Persist to books list
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
      )}

      {showSourceSelector && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-0 md:p-4">
           <div className="bg-white md:rounded-2xl shadow-2xl w-full max-w-4xl h-full md:h-[80vh] overflow-hidden flex flex-col">
              <FileBrowser 
                accessToken={user.accessToken || ''}
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

      {showSettingsModal && (
        <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in">
             <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                <h3 className="text-lg font-bold text-slate-900">Inställningar</h3>
                <button onClick={() => setShowSettingsModal(false)} className="text-slate-400 hover:text-red-500"><i className="fas fa-times"></i></button>
             </div>
             <div className="p-6 space-y-6">
                
                {/* Max Chunk Size */}
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">
                    Max filstorlek för FamilySearch
                  </label>
                  <p className="text-xs text-slate-500 mb-3">
                    Styr hur stor varje del-PDF får vara innan boken delas upp. FamilySearch har en gräns på 15 MB.
                  </p>
                  <div className="flex items-center space-x-3">
                    <input 
                      type="number" 
                      min="5" 
                      max="50" 
                      step="0.1"
                      value={settings.maxChunkSizeMB} 
                      onChange={(e) => setSettings({...settings, maxChunkSizeMB: parseFloat(e.target.value)})}
                      className="w-24 px-3 py-2 border border-slate-300 rounded-lg text-sm font-bold"
                    />
                    <span className="text-sm font-bold text-slate-600">MB</span>
                  </div>
                </div>

                {/* Safety Margin */}
                <div>
                   <label className="block text-sm font-bold text-slate-700 mb-2">
                    Säkerhetsmarginal (%)
                   </label>
                   <p className="text-xs text-slate-500 mb-3">
                     PDF-formatet lägger till lite extra data utöver bilderna. En marginal på 5-10% rekommenderas för att inte riskera att filen blir precis över gränsen vid uppladdning. Sätt till 0% om du vill maximera utrymmet.
                   </p>
                   <div className="flex items-center space-x-4">
                      <input 
                         type="range" 
                         min="0" 
                         max="20" 
                         step="1"
                         value={settings.safetyMarginPercent}
                         onChange={(e) => setSettings({...settings, safetyMarginPercent: parseInt(e.target.value)})}
                         className="flex-1 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                      />
                      <span className="text-sm font-bold text-indigo-600 w-12 text-right">{settings.safetyMarginPercent}%</span>
                   </div>
                   <div className="text-[10px] text-slate-400 mt-1 flex justify-between font-bold uppercase">
                      <span>Riskfyllt (0%)</span>
                      <span>Rekommenderat (5-10%)</span>
                      <span>Säkert (20%)</span>
                   </div>
                </div>

                {/* Compression Level */}
                <div>
                   <label className="block text-sm font-bold text-slate-700 mb-2">
                    Komprimeringsgrad
                   </label>
                   <div className="grid grid-cols-3 gap-2">
                      {(['low', 'medium', 'high'] as CompressionLevel[]).map(level => (
                        <button
                          key={level}
                          onClick={() => setSettings({...settings, compressionLevel: level})}
                          className={`py-2 px-3 rounded-lg text-xs font-bold capitalize border ${settings.compressionLevel === level ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'}`}
                        >
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
