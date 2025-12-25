
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
      {/* Top Navbar - Slimmed down to h-20 but kept large content */}
      <header className="h-20 bg-white border-b border-slate-200 flex items-center justify-between px-8 shrink-0 z-40 relative">
        
        {/* Left: Logo & Title (Stacked 3 lines) */}
        <div className="flex items-center w-1/3 relative">
           {/* Logo - Large, breaking the bounds (-ml and large width) */}
           <div className="relative -ml-6 -mt-2 z-50">
              <AppLogo variant="olive" className="w-24 h-24 text-slate-900 drop-shadow-lg" />
           </div>
           
           {/* Title - Arial (sans), Large size, 3 lines, with shadow */}
           {/* Decreased pl-5 to pl-2 to bring text closer to the logo */}
           <div className="flex flex-col justify-center -ml-1 pl-2 drop-shadow-md">
              <span className="font-sans font-bold text-slate-800 text-2xl tracking-tight leading-[0.85]">Dela</span>
              <span className="font-sans font-bold text-slate-800 text-2xl tracking-tight leading-[0.85]">Din</span>
              <span className="font-sans font-bold text-slate-800 text-2xl tracking-tight leading-[0.85]">Historia</span>
           </div>
        </div>

        {/* Center: Global Actions / Navigation */}
        <div className="flex items-center justify-center space-x-2 w-1/3">
           {user && (
             <>
               {/* If a book is open (title exists) and we have onBack, show 'Latest Books' to return to dashboard */}
               {currentBookTitle && onBack ? (
                  <button 
                    onClick={onBack}
                    className="flex items-center space-x-2 px-6 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-full font-bold text-xs transition-all border border-slate-200"
                  >
                    <span>Senaste böckerna</span>
                    <i className="fas fa-arrow-right"></i>
                  </button>
               ) : (
                  /* Otherwise (on Dashboard), show primary actions */
                  <ActionButton icon="fa-plus" label="Skapa ny bok" onClick={onCreateBook} primary={!showBookControls} />
               )}

               {/* Only show book specific controls if requested */}
               {showBookControls && (
                 <ActionButton icon="fa-share-nodes" label="Dela boken" onClick={onShare} />
               )}
               
               {/* Show title editor if in book mode */}
               {currentBookTitle !== undefined && onUpdateBookTitle && (
                  <div className="ml-4 pl-4 border-l border-slate-200 hidden xl:block">
                     <input 
                       value={currentBookTitle}
                       onChange={(e) => onUpdateBookTitle(e.target.value)}
                       className="text-sm font-serif font-bold text-slate-500 bg-transparent outline-none hover:text-indigo-600 focus:text-indigo-600 w-48 truncate"
                       placeholder="Namnge boken..."
                     />
                  </div>
               )}
             </>
           )}
        </div>

        {/* Right: User Profile OR Login Button */}
        <div className="w-1/3 flex justify-end relative">
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

      {/* Main Content */}
      <main className="flex-1 relative overflow-hidden">
        {children}
      </main>
    </div>
  );
};

const ActionButton = ({ icon, label, onClick, primary }: any) => (
  <button 
    onClick={onClick}
    className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center space-x-2 whitespace-nowrap ${
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
