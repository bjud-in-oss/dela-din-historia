
import React, { useState } from 'react';
import AppLogo from './AppLogo';
import SharingOptionsGrid from './SharingOptionsGrid';
import NotebookLMTip from './NotebookLMTip';

interface LandingPageProps {
  isGoogleReady: boolean;
  googleLoadError: boolean;
  isAuthenticated: boolean;
  compact?: boolean;
  onOpenPrivacy?: () => void;
}

const LandingPage: React.FC<LandingPageProps> = ({ isGoogleReady, googleLoadError, isAuthenticated, compact = false, onOpenPrivacy }) => {
  const [showDetails, setShowDetails] = useState(false);

  return (
    <div className={`w-full ${compact ? 'bg-white h-auto' : 'bg-[#f8fafc] h-full'} overflow-visible lg:overflow-visible flex flex-col`}>
       <div className={`${compact ? 'p-6 pb-2' : 'max-w-7xl mx-auto px-4 pt-2 pb-4 md:px-8 md:pt-6 lg:p-12 lg:pt-8'} flex-1`}>
         
         {isAuthenticated && !compact && (
           <div className="mb-10 p-4 bg-emerald-50 rounded-xl border border-emerald-100 flex items-center space-x-3 max-w-2xl">
              <i className="fas fa-check-circle text-emerald-500 text-xl"></i>
              <span className="text-sm font-bold text-emerald-800">Du är inloggad! Använd menyn uppe till höger.</span>
           </div>
         )}

         {/* TOP SECTION */}
         <div className={`grid grid-cols-1 ${compact ? '' : 'md:grid-cols-2 gap-16'} mb-8`}>
           
           {/* Left Column: Steps */}
           <div className="space-y-12">
              <div className="flex items-start space-x-5 group">
                   <div className="shrink-0 group-hover:scale-105 transition-transform mt-1">
                      <AppLogo variant="phase1" className="w-20 h-20" />
                   </div>
                   <div>
                       <h3 className="font-bold text-slate-900 text-xl text-left">Samla minnen</h3>
                       <p className="text-base text-slate-600 mt-2 leading-relaxed text-left">
                           Hämta bilder och dokument direkt från din Drive eller lokala enhet. Samla dem i olika böcker.
                       </p>
                   </div>
              </div>

              <div className="flex items-start space-x-5 group">
                   <div className="shrink-0 group-hover:scale-105 transition-transform mt-1">
                       <AppLogo variant="phase2" className="w-20 h-20" />
                   </div>
                   <div>
                       <h3 className="font-bold text-slate-900 text-xl text-left">Berätta kortfattat</h3>
                       <p className="text-base text-slate-600 mt-2 leading-relaxed text-left">
                           Beskriv minnena med texter och rubriker för att ge dem liv. Komplettera med berättelser och sammanfattningar som skapats av artificiell intelligens.
                       </p>
                   </div>
              </div>

              <div className="flex items-start space-x-5 group">
                   <div className="shrink-0 group-hover:scale-105 transition-transform mt-1">
                       <AppLogo variant="sunWindow" className="w-20 h-20" />
                   </div>
                   <div>
                       <h3 className="font-bold text-slate-900 text-xl text-left">Dela oändligt</h3>
                       <p className="text-base text-slate-600 mt-2 leading-relaxed text-left">
                           Spara och dela kostnadsfritt din historia begränsat till dina olika släktgrupper eller till alla på FamilySearch. FamilySearch kan bli en länk mellan dig och dina efterkommande efter att du lämnat detta liv och gått vidare.
                       </p>
                   </div>
              </div>
              
              {/* Toggle Link */}
              {!showDetails && (
                  <button 
                    onClick={() => setShowDetails(true)}
                    className="flex items-center space-x-2 text-indigo-600 font-bold hover:text-indigo-800 transition-colors group mt-4"
                  >
                      <span>Läs mer om delning</span>
                      <i className="fas fa-chevron-down group-hover:translate-y-1 transition-transform"></i>
                  </button>
              )}
           </div>

           {/* Right Column: Detailed Text */}
           <div className={`text-slate-600 text-base leading-relaxed text-left space-y-8 ${compact ? 'mt-8' : ''}`}>
               <p className="text-lg font-serif text-indigo-900 leading-tight border-l-4 border-indigo-200 pl-4 py-2 bg-indigo-50/50 rounded-r-lg">
                  FamilySearch är världens största kostnadsfria, ideella plattform för släktforskning. Den drivs av Jesu Kristi Kyrka av Sista Dagars Heliga och erbjuder samarbete med miljontals användare och tillgång till miljarder historiska dokument i ett gemensamt globalt släktträd.
               </p>

               <p>
                 Samla, berätta och dela dina viktigaste dokument och bilder på ett ställe, med snabbhet och med integritet. Hantera stora mängder källdokument med både effektivitet och kvalitet. Samla och beskriv minnen med rubriker och bildtexter som visar vad dokumenten innehåller. Gör dina dokument och bilder redo för att sparas som permanenta minnen i FamilySearch och dela dem med integritet till dina nära och kära eller offentligt.
               </p>
               
               <p>
                   Med <a href="https://www.familysearch.org/" target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline font-bold">FamilySearch</a> kan du även dela nutida upplevelser i realtid med apparna <a href="https://www.familysearch.org/en/discovery/together" target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline font-bold">Together</a> och <a href="https://www.familysearch.org/en/memories" target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline font-bold">Minnen</a> av FamilySearch för Webb, Android och iOS.
               </p>

               <p>
                  Genom strategiska samarbeten med kommersiella plattformar som Ancestry, MyHeritage och Geneanet möjliggörs integration av publika uppgifter mellan olika plattformar för att effektivisera användarnas forskning.
               </p>
           </div>
         </div>

         {/* BOTTOM SECTION: Sharing Options & Tools (Hidden by default) */}
         {showDetails && (
             <div className="border-t border-slate-200 pt-8 mb-8 animate-in fade-in slide-in-from-top-4 duration-500">
                 <div className="text-center md:text-left mb-6 flex justify-between items-end">
                     <div>
                        <h3 className="text-2xl font-serif font-bold text-slate-900 mb-1">FamilySearch erbjuder följande förinställda delningsmöjligheter</h3>
                        <p className="text-sm text-slate-500 max-w-3xl">Delningsinställningarna kan även ändras på efterhand. Allt som laddas upp till FamilySearch bevaras till framtida generationer.</p>
                     </div>
                     <button onClick={() => setShowDetails(false)} className="text-slate-400 hover:text-indigo-600 font-bold text-sm hidden md:inline-block">
                         Dölj <i className="fas fa-chevron-up ml-1"></i>
                     </button>
                 </div>
                 
                 {/* Sharing Grid */}
                 <SharingOptionsGrid />

                 {/* NotebookLM Tip (Expandable - Placed below grid on Landing Page for flow) */}
                 <div className="mt-6 max-w-xl">
                    <NotebookLMTip defaultOpen={false} />
                 </div>
                 
                 <div className="text-center mt-8 md:hidden">
                     <button onClick={() => setShowDetails(false)} className="text-slate-400 hover:text-indigo-600 font-bold text-sm">
                         Dölj <i className="fas fa-chevron-up ml-1"></i>
                     </button>
                 </div>
             </div>
         )}

       </div>
      
      <div className="p-6 border-t border-slate-100 mt-auto text-center bg-white/50">
          <button 
            onClick={onOpenPrivacy}
            className="text-xs font-bold text-slate-400 hover:text-slate-600 underline decoration-slate-300 underline-offset-2 transition-colors"
          >
              Integritetspolicy & Användarvillkor
          </button>
      </div>
    </div>
  );
};

export default LandingPage;
