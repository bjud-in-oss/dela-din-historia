
import React, { useState } from 'react';
import { MemoryBook, FileType } from '../types';
import AppLogo from './AppLogo';

interface DashboardProps {
  books: MemoryBook[];
  onCreateNew: () => void;
  onOpenBook: (book: MemoryBook) => void;
  onUpdateBooks: (books: MemoryBook[]) => void;
  onDeleteBook: (book: MemoryBook) => Promise<void>; // Updated to Promise
}

const Dashboard: React.FC<DashboardProps> = ({ books, onCreateNew, onOpenBook, onUpdateBooks, onDeleteBook }) => {
  const [selectedBookIds, setSelectedBookIds] = useState<Set<string>>(new Set());
  const [deletingBookIds, setDeletingBookIds] = useState<Set<string>>(new Set());

  const handleSelection = (e: React.MouseEvent, bookId: string) => {
    if (deletingBookIds.has(bookId)) return; // Prevent interaction while deleting

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

  const handleDeleteClick = async (e: React.MouseEvent, book: MemoryBook) => {
      e.stopPropagation();
      if (deletingBookIds.has(book.id)) return;

      // Add to deleting set immediately to show spinner
      setDeletingBookIds(prev => new Set(prev).add(book.id));
      
      try {
          await onDeleteBook(book);
      } catch (error) {
          console.error("Delete failed", error);
          // Only remove from deleting set on error (success removes the book entirely via props)
          setDeletingBookIds(prev => {
              const next = new Set(prev);
              next.delete(book.id);
              return next;
          });
      }
      
      // Clean up selection if needed
      if (selectedBookIds.has(book.id)) {
        const newSet = new Set(selectedBookIds);
        newSet.delete(book.id);
        setSelectedBookIds(newSet);
      }
  };

  const handleDeleteSelected = async () => {
      if (!confirm(`Är du säker på att du vill ta bort ${selectedBookIds.size} böcker?`)) return;
      
      const idsToDelete = Array.from(selectedBookIds);
      setDeletingBookIds(prev => {
          const next = new Set(prev);
          idsToDelete.forEach(id => next.add(id));
          return next;
      });

      // Process sequentially or parallel based on backend limits, here simply updating list for local UI
      // Real implementation depends on App.tsx handler
      const remaining = books.filter(b => !selectedBookIds.has(b.id));
      onUpdateBooks(remaining);
      setSelectedBookIds(new Set());
      setDeletingBookIds(new Set());
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
    <div className="w-full h-full pb-20" onClick={() => setSelectedBookIds(new Set())}>
        <header className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center space-x-4">
            <div className="shrink-0">
               <AppLogo variant="phase1" className="w-14 h-14" />
            </div>
            <div>
                <h2 className="text-2xl font-serif font-bold text-slate-900 mb-1">Senaste böckerna</h2>
                <p className="text-xs text-slate-500">Dina pågående berättelser och minnen.</p>
            </div>
          </div>
          
          <div className="flex items-center space-x-6 self-end md:self-auto">
             {selectedBookIds.size > 0 && (
                 <div className="text-indigo-600 font-bold animate-in fade-in text-sm">
                     {selectedBookIds.size} markerade
                 </div>
             )}
             <button className="text-xs font-bold text-slate-400 hover:text-indigo-600 transition-colors flex items-center space-x-1">
                 <span>Visa alla</span>
                 <i className="fas fa-chevron-right text-[10px]"></i>
             </button>
          </div>
        </header>

        {/* Updated Grid: Denser columns to match Tile width */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 md:gap-6">
          
          {/* Create New Card */}
          <div 
            onClick={(e) => { e.stopPropagation(); onCreateNew(); }}
            className="flex flex-col gap-3 group cursor-pointer"
          >
            <div className="aspect-[3/4] w-full rounded-xl border-2 border-dashed border-slate-300 flex flex-col items-center justify-center bg-white/60 hover:bg-indigo-50/40 hover:border-indigo-400 transition-all relative overflow-hidden">
               <div className="transform group-hover:scale-110 transition-transform duration-500 flex flex-col items-center">
                    <AppLogo variant="olive" className="w-10 h-10 mb-2 opacity-60 group-hover:opacity-100 transition-opacity" />
                    <div className="w-8 h-8 bg-white rounded-full shadow-sm flex items-center justify-center mb-2">
                        <i className="fas fa-plus text-sm text-indigo-500"></i>
                    </div>
                    <span className="font-bold text-sm text-slate-400 group-hover:text-indigo-600 transition-colors">Skapa ny bok</span>
               </div>
            </div>
          </div>

          {/* Book Cards */}
          {books.map((book) => {
            const isSelected = selectedBookIds.has(book.id);
            const isDeleting = deletingBookIds.has(book.id);
            const thumb = getThumbnail(book);
            
            return (
                <div 
                key={book.id}
                onClick={(e) => !isDeleting && handleSelection(e, book.id)}
                className={`flex flex-col gap-3 group cursor-pointer relative ${isDeleting ? 'opacity-70 pointer-events-none' : ''}`}
                >
                    {/* Cover Image Container - Fixed Aspect Ratio */}
                    <div className={`aspect-[3/4] w-full bg-slate-100 rounded-xl shadow-sm relative overflow-hidden transition-all border border-slate-200 ${isSelected ? 'ring-4 ring-indigo-500 ring-offset-2' : 'group-hover:shadow-lg group-hover:-translate-y-1'}`}>
                        
                        {/* Loading Overlay when deleting */}
                        {isDeleting && (
                            <div className="absolute inset-0 z-40 bg-white/80 flex flex-col items-center justify-center">
                                <i className="fas fa-circle-notch fa-spin text-red-500 text-xl mb-2"></i>
                                <span className="text-[10px] font-bold text-red-500 uppercase tracking-wider">Raderar...</span>
                            </div>
                        )}

                        {/* Delete Button */}
                        {!isDeleting && (
                            <button 
                                onClick={(e) => handleDeleteClick(e, book)}
                                className="absolute top-2 right-2 z-30 w-6 h-6 bg-white/90 backdrop-blur text-slate-400 hover:text-red-500 hover:bg-white rounded-full flex items-center justify-center shadow-sm opacity-0 group-hover:opacity-100 transition-all"
                                title="Ta bort bok"
                            >
                                <i className="fas fa-times text-xs"></i>
                            </button>
                        )}

                        {/* Selection Indicator */}
                        {isSelected && !isDeleting && (
                            <div className="absolute top-2 left-2 z-20 w-6 h-6 bg-indigo-600 rounded-full flex items-center justify-center shadow-lg animate-in zoom-in">
                                <i className="fas fa-check text-white text-xs"></i>
                            </div>
                        )}

                        {/* Image / Placeholder */}
                        {thumb ? (
                            <div className="w-full h-full bg-slate-50 flex items-center justify-center overflow-hidden">
                                <img 
                                    src={thumb} 
                                    alt={book.title}
                                    className="w-full h-full object-contain transition-transform duration-700 group-hover:scale-105" 
                                />
                            </div>
                        ) : (
                            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-indigo-50 to-blue-50">
                                <span className="text-4xl font-serif text-indigo-200 italic">{book.title.charAt(0)}</span>
                            </div>
                        )}
                        
                        {/* Hover Overlay */}
                        <div className={`absolute inset-0 bg-gradient-to-t from-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none`}></div>
                    </div>

                    {/* Metadata - Variable Height */}
                    <div className="px-1 flex flex-col">
                        <h3 className="text-sm font-serif font-bold text-slate-900 leading-tight mb-1 line-clamp-2 group-hover:text-indigo-700 transition-colors">
                            {book.title}
                        </h3>
                        <div className="flex items-center justify-between mt-1">
                             <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{new Date(book.createdAt).toLocaleDateString()}</span>
                             <span className="text-[10px] font-medium text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                                {book.items.length} st
                             </span>
                        </div>
                    </div>
                </div>
            );
          })}
        </div>

      {selectedBookIds.size > 0 && (
        <div className="fixed bottom-8 left-1/2 transform -translate-x-1/2 bg-slate-900 text-white px-6 py-3 rounded-full shadow-2xl z-50 flex items-center space-x-6 animate-in slide-in-from-bottom-6">
            <button onClick={(e) => { e.stopPropagation(); handleShareSelected(); }} className="flex flex-col items-center space-y-0.5 hover:text-indigo-300 transition-colors group">
                <i className="fas fa-envelope text-lg group-hover:scale-110 transition-transform"></i>
                <span className="text-[9px] font-bold uppercase tracking-wider">E-post</span>
            </button>
            <div className="w-px h-6 bg-slate-700"></div>
            <button onClick={(e) => { e.stopPropagation(); handleDeleteSelected(); }} className="flex flex-col items-center space-y-0.5 hover:text-red-400 transition-colors group">
                <i className="fas fa-trash text-lg group-hover:scale-110 transition-transform"></i>
                <span className="text-[9px] font-bold uppercase tracking-wider">Ta bort</span>
            </button>
            <button onClick={(e) => { e.stopPropagation(); setSelectedBookIds(new Set()); }} className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-white text-slate-900 rounded-full flex items-center justify-center shadow-md hover:bg-slate-200">
                <i className="fas fa-times text-[10px]"></i>
            </button>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
