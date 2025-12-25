
import React, { useState } from 'react';
import { MemoryBook, FileType } from '../types';
import AppLogo from './AppLogo';

interface DashboardProps {
  books: MemoryBook[];
  onCreateNew: () => void;
  onOpenBook: (book: MemoryBook) => void;
  onUpdateBooks: (books: MemoryBook[]) => void;
}

const Dashboard: React.FC<DashboardProps> = ({ books, onCreateNew, onOpenBook, onUpdateBooks }) => {
  const [selectedBookIds, setSelectedBookIds] = useState<Set<string>>(new Set());

  const handleSelection = (e: React.MouseEvent, bookId: string) => {
    if (e.metaKey || e.ctrlKey || selectedBookIds.size > 0) {
        e.stopPropagation();
        e.preventDefault();
        const newSet = new Set(selectedBookIds);
        if (newSet.has(bookId)) newSet.delete(bookId);
        else newSet.add(bookId);
        setSelectedBookIds(newSet);
    } else {
        onOpenBook(books.find(b => b.id === bookId)!);
    }
  };

  const handleDeleteBook = (e: React.MouseEvent, bookId: string) => {
      e.stopPropagation();
      if (!confirm(`Vill du ta bort denna bok?`)) return;
      onUpdateBooks(books.filter(b => b.id !== bookId));
      if (selectedBookIds.has(bookId)) {
        const newSet = new Set(selectedBookIds);
        newSet.delete(bookId);
        setSelectedBookIds(newSet);
      }
  };

  const handleDeleteSelected = () => {
      if (!confirm(`Är du säker på att du vill ta bort ${selectedBookIds.size} böcker?`)) return;
      const remaining = books.filter(b => !selectedBookIds.has(b.id));
      onUpdateBooks(remaining);
      setSelectedBookIds(new Set());
  };

  const handleShareSelected = () => {
      const selectedTitles = books.filter(b => selectedBookIds.has(b.id)).map(b => b.title).join(', ');
      const subject = encodeURIComponent(`Kolla in mina minnesböcker: ${selectedTitles}`);
      const body = encodeURIComponent(`Hej,\n\nJag har skapat minnesböcker på "Dela din historia".\n\nBöcker: ${selectedTitles}`);
      window.location.href = `mailto:?subject=${subject}&body=${body}`;
  };

  const getThumbnail = (book: MemoryBook) => {
      if (book.coverImageId) {
          const item = book.items.find(i => i.id === book.coverImageId);
          if (item?.thumbnail) return item.thumbnail;
          if (item?.blobUrl && item.type === FileType.IMAGE) return item.blobUrl;
      }
      const firstVisual = book.items.find(i => i.thumbnail || (i.type === FileType.IMAGE && i.blobUrl));
      if (firstVisual?.thumbnail) return firstVisual.thumbnail;
      if (firstVisual?.blobUrl) return firstVisual.blobUrl;
      return null;
  };

  return (
    <div className="w-full h-full" onClick={() => setSelectedBookIds(new Set())}>
        <header className="mb-12 flex items-center space-x-4">
          <div className="shrink-0">
             {/* Phase 1 Icon ("Samla minnen") next to header */}
             <AppLogo variant="phase1" className="w-16 h-16" />
          </div>
          <div>
              <h2 className="text-3xl font-serif font-bold text-slate-900 mb-1">Senaste böckerna</h2>
              <p className="text-slate-500">Dina pågående berättelser och familjeminnen.</p>
          </div>
          {selectedBookIds.size > 0 && (
             <div className="text-indigo-600 font-bold animate-in fade-in ml-auto">
                 {selectedBookIds.size} markerade
             </div>
          )}
        </header>

        {/* Bigger Grid: Start with md:grid-cols-2 */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-8">
          
          {/* Create New Card - ALWAYS FIRST */}
          <button 
            onClick={(e) => { e.stopPropagation(); onCreateNew(); }}
            className="aspect-[3/4] rounded-[1.5rem] border-2 border-dashed border-slate-300 flex flex-col items-center justify-center text-slate-400 hover:border-indigo-400 hover:bg-indigo-50/20 hover:text-indigo-600 transition-all group bg-white/60"
          >
            {/* Olive Branch above the Plus sign */}
            <div className="mb-4 transform group-hover:scale-110 transition-transform">
               <AppLogo variant="olive" className="w-16 h-16" />
            </div>
            
            <div className="w-12 h-12 bg-white rounded-full shadow-sm flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <i className="fas fa-plus text-2xl text-indigo-500"></i>
            </div>
            {/* Increased text size */}
            <span className="font-bold text-lg">Skapa ny bok</span>
          </button>

          {/* Book Cards */}
          {books.map((book) => {
            const isSelected = selectedBookIds.has(book.id);
            const thumb = getThumbnail(book);
            
            return (
                <div 
                key={book.id}
                onClick={(e) => handleSelection(e, book.id)}
                className={`aspect-[3/4] bg-white rounded-[1.5rem] shadow-sm transition-all relative overflow-hidden group cursor-pointer border ${isSelected ? 'ring-4 ring-indigo-500 border-transparent transform scale-[1.02]' : 'border-slate-100 hover:shadow-xl hover:translate-y-[-4px]'}`}
                >
                <button 
                    onClick={(e) => handleDeleteBook(e, book.id)}
                    className="absolute top-3 right-3 z-30 w-8 h-8 bg-white/80 backdrop-blur text-slate-400 hover:text-red-500 hover:bg-white rounded-full flex items-center justify-center shadow-sm opacity-0 group-hover:opacity-100 transition-all"
                    title="Ta bort bok"
                >
                    <i className="fas fa-times"></i>
                </button>

                {isSelected && (
                    <div className="absolute top-4 left-4 z-20 w-8 h-8 bg-indigo-600 rounded-full flex items-center justify-center shadow-lg animate-in zoom-in">
                        <i className="fas fa-check text-white"></i>
                    </div>
                )}

                <div className="h-3/5 bg-slate-100 relative overflow-hidden">
                    {thumb ? (
                         <div className="w-full h-full bg-cover bg-center transition-transform duration-700 group-hover:scale-105" style={{backgroundImage: `url('${thumb}')`}}></div>
                    ) : (
                        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-indigo-50 to-blue-50">
                            <span className="text-6xl font-serif text-indigo-200 italic">{book.title.charAt(0)}</span>
                        </div>
                    )}
                    <div className={`absolute inset-0 bg-gradient-to-t from-black/50 to-transparent transition-opacity ${isSelected ? 'opacity-40' : 'opacity-0 group-hover:opacity-100'}`}></div>
                </div>
                
                <div className="p-6 flex flex-col justify-between h-2/5">
                    <div>
                    <h3 className="text-xl font-serif font-bold text-slate-900 mb-1 leading-tight line-clamp-2">{book.title}</h3>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mt-2">
                        {new Date(book.createdAt).toLocaleDateString()}
                    </p>
                    </div>
                    <div className="flex items-center justify-between mt-4">
                    <span className="text-xs font-medium text-slate-500 bg-slate-50 px-2 py-1 rounded-md">
                        {book.items.length} minnen
                    </span>
                    {!isSelected && <i className="fas fa-arrow-right text-indigo-500 opacity-0 group-hover:opacity-100 transform translate-x-[-10px] group-hover:translate-x-0 transition-all"></i>}
                    </div>
                </div>
                </div>
            );
          })}
        </div>

      {selectedBookIds.size > 0 && (
        <div className="fixed bottom-8 left-1/2 transform -translate-x-1/2 bg-slate-900 text-white px-8 py-4 rounded-full shadow-2xl z-50 flex items-center space-x-8 animate-in slide-in-from-bottom-6">
            <button onClick={(e) => { e.stopPropagation(); handleShareSelected(); }} className="flex flex-col items-center space-y-1 hover:text-indigo-300 transition-colors group">
                <i className="fas fa-envelope text-xl group-hover:scale-110 transition-transform"></i>
                <span className="text-[10px] font-bold uppercase tracking-wider">E-post</span>
            </button>
            <div className="w-px h-8 bg-slate-700"></div>
            <button onClick={(e) => { e.stopPropagation(); handleDeleteSelected(); }} className="flex flex-col items-center space-y-1 hover:text-red-400 transition-colors group">
                <i className="fas fa-trash text-xl group-hover:scale-110 transition-transform"></i>
                <span className="text-[10px] font-bold uppercase tracking-wider">Ta bort</span>
            </button>
            <button onClick={(e) => { e.stopPropagation(); setSelectedBookIds(new Set()); }} className="absolute -top-2 -right-2 w-6 h-6 bg-white text-slate-900 rounded-full flex items-center justify-center shadow-md hover:bg-slate-200">
                <i className="fas fa-times text-xs"></i>
            </button>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
