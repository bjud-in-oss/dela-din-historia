
import React, { useState } from 'react';
import AppLogo from './AppLogo';

interface LayoutProps {
  children: React.ReactNode;
  user?: any; // User is now optional
  onLogout: () => void;
  // Actions for the top bar
  onAddSource?: () => void;
  onCreateBook?: () => void;
  onShare?: () => void;
  showBookControls?: boolean;
  currentBookTitle?: string;
  onUpdateBookTitle?: (newTitle: string) => void;
  onBack?: () => void; 
  onOpenSettings: () => void;
  activePhase?: 'phase1' | 'phase2' | 'phase3';
  googleBtnDesktopRef?: React.RefObject<HTMLDivElement>; // Ref for desktop login button
  googleBtnMobileRef?: React.RefObject<HTMLDivElement>; // Ref for mobile login button
}

const Layout: React.FC<LayoutProps> = ({ 
  children, 
  user, 
  onLogout, 
  onAddSource, 
  onCreateBook, 
  onShare,
  showBookControls = false,
  currentBookTitle,
  onUpdateBookTitle,
  onBack,
  onOpenSettings,
  activePhase = 'phase1',
  googleBtnDesktopRef,
  googleBtnMobileRef
}) => {
  const [showProfileMenu, setShowProfileMenu] = useState(false);

  return (
    <div className="flex flex-col h-screen bg-[#f8fafc] font-sans overflow-hidden">
      {/* Top Navbar - Responsive Height and Stacking */}
      <header className="min-h-[5rem] h-auto py-2 bg-white border-b border-slate-200 flex items-center justify-between px-4 md:px-8 shrink-0 z-40 relative gap-2">
        
        {/* Left: Logo & Title MERGED */}
        <div className="flex items-center flex-1 min-w-0 relative group">
           
           {/* Logo - Acts as Back Button */}
           <div 
             onClick={onBack} 
             className={`relative -ml-2 md:-ml-6 z-50 transition-transform shrink-0 ${onBack ? 'cursor-pointer hover:scale-105 active:scale-95 group/back' : ''}`}
             title={onBack ? "Gå tillbaka" : "Dela din historia"}
           >
              {/* Back Arrow Overlay - Floats in the top-left white space of the logo */}
              {onBack && (
                  <div className="absolute top-[18%] left-[22%] z-20 animate-in fade-in duration-300">
                      <div className="w-5 h-5 md:w-6 md:h-6 bg-white/90 backdrop-blur-[1px] rounded-full shadow-sm border border-slate-100 flex items-center justify-center text-slate-500 group-hover/back:text-indigo-600 group-hover/back:bg-white transition-colors">
                          <i className="fas fa-arrow-left text-[10px] md:text-xs"></i>
                      </div>
                  </div>
              )}
              
              <AppLogo variant="olive" className="w-16 h-16 md:w-24 md:h-24 text-slate-900 drop-shadow-lg relative z-10" />
           </div>
           
           {/* Title - Editable Input directly next to logo */}
           <div className="flex flex-col justify-center pl-2 drop-shadow-md min-w-0 w-full z-40">
              {currentBookTitle !== undefined && onUpdateBookTitle ? (
                 <div className="flex flex-col">
                     <input 
                       value={currentBookTitle}
                       onChange={(e) => onUpdateBookTitle(e.target.value)}
                       className="font-serif font-bold text-slate-800 text-base md:text-xl leading-tight bg-transparent outline-none border-b-2 border-transparent hover:border-slate-200 focus:border-indigo-500 transition-colors w-full placeholder-slate-400 py-1"
                       placeholder="Namnge boken..."
                       title="Klicka för att ändra namn"
                     />
                 </div>
              ) : (
                <div onClick={onBack} className={`flex flex-col ${onBack ? "cursor-pointer" : ""}`}>
                  <span className="font-sans font-bold text-slate-800 text-lg md:text-2xl tracking-tight leading-[0.85]">Dela</span>
                  <span className="font-sans font-bold text-slate-800 text-lg md:text-2xl tracking-tight leading-[0.85]">Din</span>
                  <span className="font-sans font-bold text-slate-800 text-lg md:text-2xl tracking-tight leading-[0.85]">Historia</span>
                </div>
              )}
           </div>
        </div>

        {/* Center: Global Actions / Navigation - Stacked on Mobile */}
        <div className="flex flex-col md:flex-row items-end md:items-center justify-center gap-2 md:gap-3 shrink-0 px-2">
           {user && showBookControls && (
             <>
               {/* Create Book Button inside Book View */}
               <ActionButton icon="fa-plus" label="Skapa bok" onClick={onCreateBook} />
               
               {/* Share Button */}
               <ActionButton icon="fa-share-nodes" label="Dela" onClick={onShare} />
             </>
           )}
        </div>

        {/* Right: User Profile OR Login Button */}
        <div className="flex justify-end relative shrink-0">
          {user ? (
            <>
              <button 
                onClick={() => setShowProfileMenu(!showProfileMenu)}
                className="w-10 h-10 rounded-full border-2 border-slate-100 p-0.5 hover:border-emerald-200 transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-100 flex items-center justify-center bg-slate-50"
              >
                {user?.picture ? (
                    <img src={user.picture} alt="Profil" className="w-full h-full rounded-full object-cover" />
                ) : (
                    <span className="font-bold text-slate-600 text-lg">{user?.name?.charAt(0) || 'U'}</span>
                )}
              </button>

              {showProfileMenu && (
                <div className="absolute right-0 top-12 w-56 bg-white rounded-xl shadow-xl border border-slate-100 py-2 animate-in fade-in zoom-in duration-200 origin-top-right z-50">
                  <div className="px-4 py-3 border-b border-slate-50 mb-2">
                    <p className="text-sm font-bold text-slate-900 truncate">{user.name}</p>
                    <p className="text-xs text-slate-500 truncate">{user.email}</p>
                  </div>
                  <button 
                    onClick={() => { setShowProfileMenu(false); onOpenSettings(); }}
                    className="w-full text-left px-4 py-3 text-sm font-bold text-slate-600 hover:bg-slate-50 transition-colors flex items-center space-x-3"
                  >
                    <i className="fas fa-cog"></i>
                    <span>Inställningar</span>
                  </button>
                  <button 
                    onClick={onLogout}
                    className="w-full text-left px-4 py-3 text-sm font-bold text-red-600 hover:bg-red-50 transition-colors flex items-center space-x-3"
                  >
                    <i className="fas fa-power-off"></i>
                    <span>Logga ut</span>
                  </button>
                </div>
              )}
            </>
          ) : (
            /* Logged Out: Show Google Button Containers (Responsive) */
            <div className="min-h-[44px] flex items-center justify-end">
                {/* Desktop: Standard width */}
                <div ref={googleBtnDesktopRef} className="hidden md:block"></div>
                {/* Mobile: Compact/Icon */}
                <div ref={googleBtnMobileRef} className="block md:hidden"></div>
            </div>
          )}
        </div>
      </header>

      {/* Main Content - Updated to allow scrolling on mobile */}
      <main className="flex-1 relative overflow-y-auto overflow-x-hidden">
        {children}
      </main>
    </div>
  );
};

const ActionButton = ({ icon, label, onClick, primary }: any) => (
  <button 
    onClick={onClick}
    className={`px-3 py-1.5 md:px-4 md:py-2 rounded-lg text-[10px] md:text-xs font-bold transition-all flex items-center space-x-2 whitespace-nowrap w-full md:w-auto justify-center ${
      primary 
        ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200 hover:bg-indigo-700 hover:translate-y-[-1px]' 
        : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50 hover:text-slate-900'
    }`}
  >
    <i className={`fas ${icon}`}></i>
    <span>{label}</span>
  </button>
);

export default Layout;
