
import React from 'react';
import AppLogo from './AppLogo';

interface PrivacyPolicyProps {
    onClose: () => void;
}

const PrivacyPolicy: React.FC<PrivacyPolicyProps> = ({ onClose }) => {
    return (
        <div className="fixed inset-0 z-[100] bg-white overflow-y-auto">
            <div className="max-w-3xl mx-auto px-6 py-12">
                <div className="flex justify-between items-center mb-10">
                    <div className="flex items-center gap-3">
                        <AppLogo variant="olive" className="w-10 h-10" />
                        <h1 className="text-2xl font-serif font-bold text-slate-900">Integritetspolicy</h1>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                        <i className="fas fa-times text-xl text-slate-500"></i>
                    </button>
                </div>

                <div className="prose prose-slate max-w-none text-sm text-slate-600 space-y-8 leading-relaxed">
                    <p className="text-lg font-medium text-slate-900">
                        Din integritet är grunden i denna tjänst. "Dela din historia" är byggd för att fungera helt lokalt i din webbläsare och direkt mot din egen Google Drive.
                    </p>

                    <section>
                        <h2 className="text-lg font-bold text-slate-900 mb-3">1. Din data tillhör dig</h2>
                        <p>
                            Vi sparar ingen information om dig, dina filer eller dina böcker på några egna servrar. 
                            All data du arbetar med (bilder, dokument, texter) hämtas direkt från din enhet eller din Google Drive och bearbetas temporärt i din webbläsares minne.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-lg font-bold text-slate-900 mb-3">2. Google Drive</h2>
                        <p>
                            När du loggar in med Google ger du appen tillåtelse att läsa och skriva filer på din Google Drive.
                            Detta används uteslutande för att:
                        </p>
                        <ul className="list-disc pl-5 space-y-1 mt-2">
                            <li>Lista bilder och dokument du vill lägga till i din bok.</li>
                            <li>Spara dina skapade böcker i mappen "Dela din historia".</li>
                            <li>Spara PDF-filer som genereras vid export.</li>
                        </ul>
                        <p className="mt-2">
                            Ingen annan än du (och de du aktivt delar filer med via Google Drive) har tillgång till detta innehåll.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-lg font-bold text-slate-900 mb-3">3. AI och Analys</h2>
                        <p>
                            Appen använder avancerade AI-modeller (Google Gemini) för att hjälpa till med sammanfattningar och textförbättring. 
                            När du använder dessa funktioner skickas den text du valt till Google för bearbetning. 
                            Ingen data sparas permanent av AI-modellen för träning via detta API.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-lg font-bold text-slate-900 mb-3">4. Cookies och Lokal lagring</h2>
                        <p>
                            Vi använder lokal lagring i din webbläsare ("LocalStorage") för att komma ihåg att du är inloggad och dina senaste inställningar. 
                            Detta gör att du slipper logga in varje gång du laddar om sidan. Du kan när som helst rensa detta genom att logga ut.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-lg font-bold text-slate-900 mb-3">5. Tillgänglighet och Kvoter</h2>
                        <p>
                            Denna tjänst tillhandahålls kostnadsfritt som ett hobbyprojekt. AI-funktionerna använder en delad kvot mot Googles tjänster. 
                            Om många användare använder tjänsten samtidigt kan AI-funktionerna tillfälligt begränsas eller pausas. 
                            Grundläggande funktioner som att skapa böcker och spara PDF-filer påverkas inte av detta.
                        </p>
                    </section>

                    <section className="bg-slate-50 p-6 rounded-xl border border-slate-200 mt-8">
                        <h2 className="text-lg font-bold text-slate-900 mb-3 flex items-center gap-2">
                            <i className="fab fa-github text-xl"></i>
                            Transparens och Öppen Källkod
                        </h2>
                        <p className="mb-4">
                            För att garantera din trygghet är källkoden till denna applikation helt öppen (Open Source). 
                            Detta innebär att vem som helst med teknisk kunskap kan granska koden för att verifiera att vi inte sparar din data, 
                            inte har några dolda bakdörrar och att appen gör exakt det vi beskriver ovan.
                        </p>
                        <a 
                            href="https://github.com/bjud-in-oss/dela-din-historia" 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 text-indigo-600 font-bold hover:underline"
                        >
                            Granska koden på GitHub
                            <i className="fas fa-external-link-alt text-xs"></i>
                        </a>
                    </section>

                    <div className="pt-8 border-t border-slate-100 flex justify-center">
                        <button onClick={onClose} className="px-8 py-3 bg-slate-900 text-white font-bold rounded-xl hover:bg-slate-800 transition-colors">
                            Jag förstår
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PrivacyPolicy;
