
import React from 'react';

// Reusable Card Component
const ShareOptionCard = ({ icon, color, title, subtitle, link, details, footer, extra }: any) => {
    const isEmerald = color === 'emerald';
    const accentColor = isEmerald ? 'text-emerald-600' : 'text-indigo-600';
    const hoverBorder = isEmerald ? 'hover:border-emerald-300' : 'hover:border-indigo-300';
    const bgIcon = isEmerald ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-50 text-indigo-500';

    return (
        <a href={link} target="_blank" rel="noopener noreferrer" className={`block bg-white p-5 rounded-xl border border-slate-200 shadow-sm ${hoverBorder} hover:shadow-lg transition-all group flex flex-col`}>
            <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-lg ${bgIcon} flex items-center justify-center text-lg shadow-sm group-hover:scale-110 transition-transform shrink-0`}>
                        <i className={`fas ${icon}`}></i>
                    </div>
                    <div>
                        <h5 className="font-bold text-slate-900 leading-tight text-base">{title}</h5>
                        <p className="text-xs text-slate-500 font-medium">{subtitle}</p>
                    </div>
                </div>
            </div>
            
            <div className="text-xs text-slate-600 leading-relaxed mb-3 space-y-1.5">
                {details}
            </div>
            
            {footer && (
                <p className="text-[10px] text-slate-400 italic border-t border-slate-100 pt-2 mt-auto">
                    {footer}
                </p>
            )}
            
            {extra && <div className="mt-2 pt-2 border-t border-emerald-50">{extra}</div>}

            <div className={`mt-3 pt-2 flex items-center justify-end text-xs font-bold ${accentColor} group-hover:underline`}>
                <span>Öppna tjänsten</span>
                <i className="fas fa-external-link-alt ml-1.5"></i>
            </div>
        </a>
    );
};

const SharingOptionsGrid: React.FC = () => {
    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            {/* Column 1: Privat & Valbar */}
            <div className="space-y-6">
                {/* FÖRVALD PRIVAT DELNING */}
                <div>
                    <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 pl-1">Förvald Privat Delning</h4>
                    <ShareOptionCard 
                        icon="fa-users"
                        color="slate"
                        title="Stories"
                        subtitle="På Together av FamilySearch"
                        link="https://www.familysearch.org/en/discovery/together/stories"
                        details={
                            <>
                                <p><strong className="text-slate-700">Tjänst:</strong> Stories - spara privata bilder och texter via guider</p>
                                <p><strong className="text-slate-700">Målgrupp:</strong> Familjeanpassat för barn och unga i släktgrupper.</p>
                                <p><strong className="text-slate-700">Format:</strong> Text och bild</p>
                            </>
                        }
                        footer="Bevaras för alltid men faller ej i glömska om unga delar nutidshistoria."
                    />
                </div>

                {/* VÄLJ MELLAN PRIVAT ELLER OFFENTLIG DELNING */}
                <div>
                    <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 pl-1">Välj mellan Privat eller Offentlig Delning</h4>
                    <div className="space-y-3">
                        <ShareOptionCard 
                            icon="fa-user-lock"
                            color="slate"
                            title="Minnen"
                            subtitle="På Levande Person (Family Tree)"
                            link="https://www.familysearch.org/en/tree/private-people"
                            details={
                                <>
                                    <p><strong className="text-slate-700">Tjänst:</strong> Personliga minnen om levande - spara privata källdokument</p>
                                    <p><strong className="text-slate-700">Målgrupp:</strong> Familj och släkt i släktgrupper</p>
                                    <p><strong className="text-slate-700">Format:</strong> PDF, Ljud, Text, Bild</p>
                                </>
                            }
                            footer="Kan flyttas till publika trädet efter bortgång."
                        />

                        <ShareOptionCard 
                            icon="fa-images"
                            color="emerald"
                            title="Gallery"
                            subtitle="På Memories av FamilySearch"
                            link="https://www.familysearch.org/en/memories/gallery"
                            details={
                                <>
                                    <p><strong className="text-emerald-700">Tjänst:</strong> Memories Gallery</p>
                                    <p><strong className="text-emerald-700">Målgrupp:</strong> Släktforskare och allmänhet</p>
                                    <p><strong className="text-emerald-700">Format:</strong> Bild, ljud, text och PDF</p>
                                    <p className="mt-1 italic opacity-80">Använder samma delningsguide som personliga minnen men för offentligt bruk.</p>
                                </>
                            }
                        />
                    </div>
                </div>
            </div>

            {/* Column 2: Offentlig */}
            <div className="space-y-6">
                {/* FÖRVALD OFFENTLIG DELNING */}
                <div>
                    <h4 className="text-xs font-bold text-emerald-600 uppercase tracking-widest mb-2 pl-1">Förvald Offentlig Delning</h4>
                    <ShareOptionCard 
                        icon="fa-rss"
                        color="emerald"
                        title="Feed"
                        subtitle="På Together av FamilySearch"
                        link="https://www.familysearch.org/en/discovery/together/feed"
                        details={
                            <>
                                <p><strong className="text-emerald-700">Tjänst:</strong> Feed - spara bild och text om släkten i ett flöde</p>
                                <p><strong className="text-emerald-700">Målgrupp:</strong> Familj och släkt</p>
                                <p><strong className="text-emerald-700">Format:</strong> Text och bild</p>
                            </>
                        }
                        extra={(
                            <div className="bg-emerald-50/50 p-3 rounded-lg border border-emerald-100 mt-2">
                                <p className="text-[10px] text-emerald-800/80 font-bold leading-relaxed">
                                    <i className="fas fa-lightbulb mr-1 text-emerald-500"></i> Tips: Dela offentligt för att slippa minnas vad som är privat. Bilder delas alltid offentligt som förinställning.
                                </p>
                            </div>
                        )}
                    />
                </div>
            </div>
        </div>
    );
};

export default SharingOptionsGrid;
