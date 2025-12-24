
import React from 'react';
import AppLogo from './AppLogo';

interface LandingPageProps {
  googleBtnRef: React.RefObject<HTMLDivElement>;
  isGoogleReady: boolean;
  googleLoadError: boolean;
}

const LandingPage: React.FC<LandingPageProps> = ({ googleBtnRef, isGoogleReady, googleLoadError }) => {
  return (
    <div className="min-h-screen bg-[#f8fafc] flex flex-col items-center justify-center p-6 font-sans">
       <div className="max-w-7xl w-full bg-white rounded-[2.5rem] p-8 md:p-12 shadow-2xl border border-slate-100 flex flex-col md:flex-row gap-16 items-stretch">
         
         {/* LEFT COLUMN: Header, Login, Steps */}
         <div className="w-full md:w-1/2 flex flex-col">
           
           <div className="mb-8">
              <h1 className="text-4xl font-black text-slate-900 tracking-tight mb-4">Dela din historia</h1>
              <p className="text-lg font-serif text-indigo-900 leading-tight">
                  Dela din historia med nästkommande generationer kostnadsfritt på FamilySearch.
              </p>
           </div>
           
           {/* Login Button */}
           <div className="mb-10 flex flex-col items-center md:items-start">
               <div ref={googleBtnRef} className="min-h-[44px]"></div>
               {!isGoogleReady && !googleLoadError && (
                 <div className="text-[10px] text-slate-400 font-bold uppercase animate-pulse mt-2">Laddar säker inloggning...</div>
               )}
           </div>

           {/* Process Steps */}
           <div className="space-y-10 mt-4">
              {/* Step 1 */}
              <div className="flex items-center space-x-5 group">
                   <div className="shrink-0 group-hover:scale-105 transition-transform">
                      <AppLogo variant="phase1" className="w-20 h-20" />
                   </div>
                   <div>
                       <h3 className="font-bold text-slate-900 text-lg">1. Samla minnen</h3>
                       <p className="text-sm text-slate-500 mt-1 leading-relaxed">
                           Hämta bilder och dokument direkt från din Drive eller lokala enhet.
                       </p>
                   </div>
              </div>

              {/* Step 2 */}
              <div className="flex items-center space-x-5 group">
                   <div className="shrink-0 group-hover:scale-105 transition-transform">
                       <AppLogo variant="phase2" className="w-20 h-20" />
                   </div>
                   <div>
                       <h3 className="font-bold text-slate-900 text-lg">2. Berätta kortfattat</h3>
                       <p className="text-sm text-slate-500 mt-1 leading-relaxed">
                           Beskriv minnena med texter och rubriker för att ge dem liv. Komplettera med berättelser, biografier och sammanfattningar som skapats av artificiell intelligens.
                       </p>
                   </div>
              </div>

              {/* Step 3 */}
              <div className="flex items-center space-x-5 group">
                   <div className="shrink-0 group-hover:scale-105 transition-transform">
                       <AppLogo variant="phase3" className="w-20 h-20" />
                   </div>
                   <div>
                       <h3 className="font-bold text-slate-900 text-lg">3. Dela för alltid</h3>
                       <p className="text-sm text-slate-500 mt-1 leading-relaxed">
                           Spara och dela din historia med framtida generationer på FamilySearch.
                       </p>
                   </div>
              </div>
           </div>
         </div>
         
         {/* RIGHT COLUMN: Text Content */}
          <div className="w-full md:w-1/2 flex flex-col">
            
               <p className="text-xl font-serif text-indigo-900 mb-6 leading-tight font-bold">
                  Bevara och dela din historia mellan levande och avlidna generationer med hjälp av FamilySearch kostnadsfritt.
               </p>

               <div className="text-slate-600 space-y-6 text-sm leading-relaxed text-justify flex-1">
                 <p>
                   Samla, berätta och dela dina viktigaste dokument och bilder på ett ställe, med snabbhet och med integritet. Hantera stora mängder källdokument med både effektivitet och kvalitet. Samla och beskriv minnen med rubriker och bildtexter som visar vad dokumenten innehåller. Gör dina dokument och bilder redo för att sparas som permanenta minnen i FamilySearch och dela dem med integritet till dina nära och kära eller offentligt.
                 </p>
                 
                 <p className="text-lg font-serif text-indigo-900 leading-tight border-l-4 border-indigo-200 pl-4 py-2 bg-indigo-50/50 rounded-r-lg">
                    FamilySearch är världens största kostnadsfria, ideella plattform för släktforskning. Den drivs av Jesu Kristi Kyrka av Sista Dagars Heliga och erbjuder samarbete med miljontals användare och tillgång till miljarder historiska dokument i ett gemensamt globalt släktträd.
                 </p>
                 
                 <p>
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
