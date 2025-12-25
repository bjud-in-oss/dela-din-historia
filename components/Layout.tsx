
import React, { useState } from 'react';

interface LayoutProps {
  children: React.ReactNode;
  user: any;
  onLogout: () => void;
  // Actions for the top bar
  onAddSource?: () => void;
  onCreateBook?: () => void;
  onShare?: () => void;
  showBookControls?: boolean;
  currentBookTitle?: string;
  onUpdateBookTitle?: (newTitle: string) => void;
  onBack?: () => void; // Unified Back Action
  onOpenSettings: () => void;
  activePhase?: 'phase1' | 'phase2' | 'phase3';
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
  activePhase = 'phase1'
}) => {
  const [showProfileMenu, setShowProfileMenu] = useState(false);

  return (
    <div className="flex flex-col h-screen bg-[#f8fafc] font-sans overflow-hidden">
      {/* Top Navbar */}
      <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 shrink-0 z-40 relative">
        
        {/* Left: Back Arrow & Title */}
        <div className="flex items-center space-x-4 w-1/3">
          <button 
             onClick={onBack}
             className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-800 transition-all"
             title="Gå tillbaka"
          >
             <i className="fas fa-arrow-left text-xl"></i>
          </button>
          
          <div className="flex-1">
            {currentBookTitle !== undefined ? (
               onUpdateBookTitle ? (
                  <input 
                    value={currentBookTitle}
                    onChange={(e) => onUpdateBookTitle(e.target.value)}
                    className="text-sm font-serif font-bold text-slate-900 tracking-wide bg-transparent outline-none border-b border-transparent hover:border-slate-300 focus:border-indigo-500 transition-colors w-full"
                    placeholder="Bokens titel..."
                  />
               ) : (
                  <h1 className="text-sm font-serif font-light text-slate-700 tracking-wide">{currentBookTitle}</h1>
               )
            ) : (
              <div className="flex flex-col justify-center">
                <h1 className="text-lg font-black text-slate-900 tracking-tight leading-none">Dela din historia</h1>
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest leading-none mt-0.5">Med dina närmaste för alltid</span>
              </div>
            )}
          </div>
        </div>

        {/* Center: Global Actions */}
        <div className="flex items-center justify-center space-x-2 w-1/3">
           <ActionButton icon="fa-plus" label="Skapa ny bok" onClick={onCreateBook} primary={!showBookControls} />
           
           {showBookControls && (
             <ActionButton icon="fa-share-nodes" label="Dela boken" onClick={onShare} />
           )}
        </div>

        {/* Right: User Profile */}
        <div className="w-1/3 flex justify-end relative">
          <button 
            onClick={() => setShowProfileMenu(!showProfileMenu)}
            className="w-10 h-10 rounded-full border-2 border-slate-100 p-0.5 hover:border-red-100 transition-colors focus:outline-none focus:ring-2 focus:ring-red-100 flex items-center justify-center bg-slate-50"
          >
            {user?.picture ? (
                <img src={user.picture} alt="Profil" className="w-full h-full rounded-full object-cover" />
            ) : (
                <span className="font-bold text-slate-600">{user?.name?.charAt(0) || 'U'}</span>
            )}
          </button>

          {showProfileMenu && (
            <div className="absolute right-0 top-12 w-48 bg-white rounded-xl shadow-xl border border-slate-100 py-2 animate-in fade-in zoom-in duration-200 origin-top-right z-50">
              <div className="px-4 py-2 border-b border-slate-50 mb-2">
                <p className="text-xs font-bold text-slate-900 truncate">{user.name}</p>
                <p className="text-[10px] text-slate-500 truncate">{user.email}</p>
              </div>
              <button 
                onClick={() => { setShowProfileMenu(false); onOpenSettings(); }}
                className="w-full text-left px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 transition-colors flex items-center space-x-2"
              >
                <i className="fas fa-cog"></i>
                <span>Inställningar</span>
              </button>
              <button 
                onClick={onLogout}
                className="w-full text-left px-4 py-2 text-xs font-bold text-red-600 hover:bg-red-50 transition-colors flex items-center space-x-2"
              >
                <i className="fas fa-power-off"></i>
                <span>Logga ut</span>
              </button>
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
