
import React from 'react';
import AppLogo from './AppLogo';

interface LandingPageProps {
  // googleBtnRef removed as it is no longer used here
  isGoogleReady: boolean;
  googleLoadError: boolean;
  isAuthenticated: boolean;
  compact?: boolean; // New prop for dashboard sidebar mode
}

const LandingPage: React.FC<LandingPageProps> = ({ isGoogleReady, googleLoadError, isAuthenticated, compact = false }) => {
  return (
    // Cleaned up layout: Remove h-full to allow content to dictate height on mobile stacks. 
    // On desktop, the parent container will handle scrolling via overflow-y-auto.
    <div className={`w-full ${compact ? 'bg-white h-auto' : 'bg-[#f8fafc] h-full'} overflow-visible lg:overflow-visible`}>
       {/* Reduced top padding: pt-2 md:pt-6 (was p-4 md:p-8) to bring content closer to header */}
       <div className={`${compact ? 'p-6 pb-2' : 'max-w-7xl mx-auto px-4 pt-2 pb-4 md:px-8 md:pt-6 lg:p-12 lg:pt-8'}`}>
         
         {/* Authenticated Message - Always top if visible, but hidden in compact mode */}
         {isAuthenticated && !compact && (
           <div className="mb-10 p-4 bg-emerald-50 rounded-xl border border-emerald-100 flex items-center space-x-3 max-w-2xl">
              <i className="fas fa-check-circle text-emerald-500 text-xl"></i>
              <span className="text-sm font-bold text-emerald-800">Du är inloggad! Använd menyn uppe till höger.</span>
           </div>
         )}

         {/* Automatic Column Layout (Masonry-like flow) */}
         <div className={`${compact ? 'flex flex-col space-y-12' : 'columns-1 md:columns-2 gap-16 space-y-12 block'}`}>
           
           {/* Steps Block */}
           <div className="break-inside-avoid mb-12 space-y-12">
              {/* Step 1 */}
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

              {/* Step 2 */}
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

              {/* Step 3 */}
              <div className="flex items-start space-x-5 group">
                   <div className="shrink-0 group-hover:scale-105 transition-transform mt-1">
                       <AppLogo variant="phase3" className="w-20 h-20" />
                   </div>
                   <div>
                       <h3 className="font-bold text-slate-900 text-xl text-left">Dela oändligt</h3>
                       <p className="text-base text-slate-600 mt-2 leading-relaxed text-left">
                           Spara och dela kostnadsfritt din historia begränsat till dina olika släktgrupper eller till alla på FamilySearch.
                       </p>
                   </div>
              </div>
              
              {/* Extra text block placed without indentation to align with the text blocks below */}
              <p className="text-lg font-serif text-indigo-900 leading-tight text-left pt-2">
                  Bevara och dela din historia mellan levande och avlidna generationer med hjälp av FamilySearch.
              </p>
           </div>

           {/* Detailed Text Block 1 */}
           <div className="break-inside-avoid mb-12 text-slate-600 text-base leading-relaxed text-left space-y-12">
               <p>
                 Samla, berätta och dela dina viktigaste dokument och bilder på ett ställe, med snabbhet och med integritet. Hantera stora mängder källdokument med både effektivitet och kvalitet. Samla och beskriv minnen med rubriker och bildtexter som visar vad dokumenten innehåller. Gör dina dokument och bilder redo för att sparas som permanenta minnen i FamilySearch och dela dem med integritet till dina nära och kära eller offentligt.
               </p>
               
               {/* Updated padding: my-12 to ensure same space above and below */}
               <p className="text-lg font-serif text-indigo-900 leading-tight border-l-4 border-indigo-200 pl-4 py-2 bg-indigo-50/50 rounded-r-lg my-12">
                  FamilySearch är världens största kostnadsfria, ideella plattform för släktforskning. Den drivs av Jesu Kristi Kyrka av Sista Dagars Heliga och erbjuder samarbete med miljontals användare och tillgång till miljarder historiska dokument i ett gemensamt globalt släktträd.
               </p>
           </div>
           
           {/* Detailed Text Block 2 */}
           <div className="break-inside-avoid text-slate-600 text-base leading-relaxed text-left mb-12">
               <p className="mb-6">
                 Med <a href="https://www.familysearch.org/" target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline font-bold">FamilySearch</a> kan du även dela nutida upplevelser i realtid med apparna <a href="https://www.familysearch.org/en/discovery/together" target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline font-bold">Together</a> och <a href="https://www.familysearch.org/en/memories" target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline font-bold">Minnen</a> av FamilySearch för Webb, Android och Ios.
               </p>

               <p>
                  Genom strategiska samarbeten med kommersiella plattformar som Ancestry, MyHeritage och Geneanet möjliggörs integration av publika uppgifter mellan olika plattformar för att effektivisera användarnas forskning.
               </p>
           </div>

         </div>
      </div>
    </div>
  );
};

export default LandingPage;
