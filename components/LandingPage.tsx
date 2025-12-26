
import React from 'react';
import AppLogo from './AppLogo';

interface LandingPageProps {
  // googleBtnRef removed as it is no longer used here
  isGoogleReady: boolean;
  googleLoadError: boolean;
  isAuthenticated: boolean;
  compact?: boolean; // New prop for dashboard sidebar mode
  onOpenPrivacy?: () => void;
}

const LandingPage: React.FC<LandingPageProps> = ({ isGoogleReady, googleLoadError, isAuthenticated, compact = false, onOpenPrivacy }) => {
  return (
    // Cleaned up layout: Remove h-full to allow content to dictate height on mobile stacks. 
    // On desktop, the parent container will handle scrolling via overflow-y-auto.
    <div className={`w-full ${compact ? 'bg-white h-auto' : 'bg-[#f8fafc] h-full'} overflow-visible lg:overflow-visible flex flex-col`}>
       {/* Reduced top padding: pt-2 md:pt-6 (was p-4 md:p-8) to bring content closer to header */}
       <div className={`${compact ? 'p-6 pb-2' : 'max-w-7xl mx-auto px-4 pt-2 pb-4 md:px-8 md:pt-6 lg:p-12 lg:pt-8'} flex-1`}>
         
         {/* Authenticated Message - Always top if visible, but hidden in compact mode */}
         {isAuthenticated && !compact && (
           <div className="mb-10 p-4 bg-emerald-50 rounded-xl border border-emerald-100 flex items-center space-x-3 max-w-2xl">
              <i className="fas fa-check-circle text-emerald-500 text-xl"></i>
              <span className="text-sm font-bold text-emerald-800">Du är inloggad! Använd menyn uppe till höger.</span>
           </div>
         )}

         {/* TOP SECTION: Steps & Intro (Preserved Layout Feel using Grid) */}
         <div className={`grid grid-cols-1 ${compact ? '' : 'md:grid-cols-2 gap-16'} mb-16`}>
           
           {/* Left Column: Steps */}
           <div className="space-y-12">
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
              
              <p className="text-lg font-serif text-indigo-900 leading-tight text-left pt-2">
                  Bevara och dela din historia mellan levande och avlidna generationer med hjälp av FamilySearch.
              </p>
           </div>

           {/* Right Column: Detailed Text */}
           <div className={`text-slate-600 text-base leading-relaxed text-left space-y-8 ${compact ? 'mt-8' : ''}`}>
               <p>
                 Samla, berätta och dela dina viktigaste dokument och bilder på ett ställe, med snabbhet och med integritet. Hantera stora mängder källdokument med både effektivitet och kvalitet. Samla och beskriv minnen med rubriker och bildtexter som visar vad dokumenten innehåller. Gör dina dokument och bilder redo för att sparas som permanenta minnen i FamilySearch och dela dem med integritet till dina nära och kära eller offentligt.
               </p>
               
               <p className="text-lg font-serif text-indigo-900 leading-tight border-l-4 border-indigo-200 pl-4 py-2 bg-indigo-50/50 rounded-r-lg">
                  FamilySearch är världens största kostnadsfria, ideella plattform för släktforskning. Den drivs av Jesu Kristi Kyrka av Sista Dagars Heliga och erbjuder samarbete med miljontals användare och tillgång till miljarder historiska dokument i ett gemensamt globalt släktträd.
               </p>
           </div>
         </div>

         {/* BOTTOM SECTION: Sharing Options & Tools (Full Width / Scrollable) */}
         <div className="border-t border-slate-200 pt-12 mb-12">
             <div className="text-center md:text-left mb-8">
                 <h3 className="text-2xl font-serif font-bold text-slate-900 mb-2">FamilySearch erbjuder följande förinställda delningsmöjligheter</h3>
                 <p className="text-sm text-slate-500 max-w-3xl">Delningsinställningarna kan även ändras på efterhand. Allt som laddas upp till FamilySearch bevaras till framtida generationer.</p>
             </div>
             
             <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
                
                {/* Column 1: Privat & Valbar */}
                <div className="space-y-8">
                    {/* FÖRVALD PRIVAT DELNING */}
                    <div>
                        <h4 className="text-sm font-black text-slate-400 uppercase tracking-widest border-b border-slate-200 pb-2 mb-4">
                            Förvald Privat Delning
                        </h4>
                        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                            <h5 className="font-bold text-slate-900 flex items-center gap-2 mb-2">
                                <i className="fas fa-users text-indigo-500"></i> Stories
                            </h5>
                            <p className="text-sm text-slate-600 mb-2">
                                <strong>På Together:</strong> Familjeanpassat för barn och unga i släktgrupper.
                            </p>
                            <p className="text-xs text-slate-500 italic">
                                Bevaras för alltid men faller ej i glömska om unga delar nutidshistoria.
                            </p>
                        </div>
                    </div>

                    {/* VÄLJ MELLAN PRIVAT ELLER OFFENTLIG DELNING */}
                    <div>
                        <h4 className="text-sm font-black text-slate-400 uppercase tracking-widest border-b border-slate-200 pb-2 mb-4">
                            Välj mellan Privat eller Offentlig Delning
                        </h4>
                        <div className="space-y-4">
                            {/* Minnen */}
                            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                                <h5 className="font-bold text-slate-900 flex items-center gap-2 mb-2">
                                    <i className="fas fa-user-lock text-indigo-500"></i> Minnen
                                </h5>
                                <p className="text-sm text-slate-600 mb-2">
                                    <strong>På Levande Person (Family Tree):</strong> För familj och släkt i släktgrupper. PDF, Ljud, Text, Bild.
                                </p>
                                <p className="text-xs text-slate-500 italic">
                                    Kan flyttas till publika trädet efter bortgång.
                                </p>
                            </div>

                            {/* Gallery */}
                            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                                <h5 className="font-bold text-slate-900 flex items-center gap-2 mb-2">
                                    <i className="fas fa-images text-emerald-600"></i> Gallery
                                </h5>
                                <p className="text-sm text-slate-600 mb-2">
                                    <strong>På Memories:</strong> För släktforskare och allmänhet.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Column 2: Offentlig & Tips */}
                <div className="space-y-8">
                    {/* FÖRVALD OFFENTLIG DELNING */}
                    <div>
                        <h4 className="text-sm font-black text-emerald-600 uppercase tracking-widest border-b border-slate-200 pb-2 mb-4">
                            Förvald Offentlig Delning
                        </h4>

                        {/* Feed */}
                        <div className="bg-emerald-50/50 p-5 rounded-xl border border-emerald-100 shadow-sm hover:shadow-md transition-shadow">
                            <h5 className="font-bold text-emerald-900 flex items-center gap-2 mb-2">
                                <i className="fas fa-rss text-emerald-600"></i> Feed
                            </h5>
                            <p className="text-sm text-slate-700 mb-2">
                                <strong>På Together:</strong> Dela bild och text om släkten i ett flöde.
                            </p>
                            <div className="bg-white/60 p-3 rounded-lg border border-emerald-100">
                                <p className="text-xs text-emerald-800/80 font-bold leading-relaxed">
                                    <i className="fas fa-lightbulb mr-1 text-emerald-500"></i> Tips: Dela offentligt för att slippa minnas vad som är privat. Bilder delas alltid offentligt som förinställning.
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* AI Tool */}
                    <div>
                        <h4 className="text-sm font-black text-purple-400 uppercase tracking-widest border-b border-slate-100 pb-2 mb-4">
                            Tips
                        </h4>
                        <div className="bg-purple-50 p-5 rounded-xl border border-purple-100 shadow-sm">
                            <h5 className="font-bold text-purple-900 mb-2 flex items-center gap-2">
                                <i className="fas fa-magic text-purple-500"></i> Förfina med NotebookLM
                            </h5>
                            <p className="text-sm text-purple-800/80 mb-3 leading-relaxed">
                                Ladda upp dina exporterade PDF-filer till Google NotebookLM för att skapa ljudfiler ("Audio Overviews") eller få hjälp att sammanfatta och ställa frågor om din släkthistoria.
                            </p>
                            <a href="https://notebooklm.google.com/" target="_blank" className="text-xs font-bold text-purple-600 hover:text-purple-800 underline inline-flex items-center">
                                Gå till NotebookLM <i className="fas fa-external-link-alt ml-1"></i>
                            </a>
                        </div>
                    </div>
                </div>

             </div>
         </div>

       </div>
      
      {/* Footer with Privacy Link */}
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
