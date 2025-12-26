
import React from 'react';

// Reusable Card Component
const ShareOptionCard = ({ icon, color, title, subtitle, link, details, footer, extra }: any) => {
    const isEmerald = color === 'emerald';
    const accentColor = isEmerald ? 'text-emerald-600' : 'text-indigo-600';
    const hoverBorder = isEmerald ? 'hover:border-emerald-300' : 'hover:border-indigo-300';
    const bgIcon = isEmerald ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-50 text-indigo-500';

    return (
        <a href={link} target="_blank" rel="noopener noreferrer" className={`block bg-white p-4 rounded-xl border border-slate-200 shadow-sm ${hoverBorder} hover:shadow-lg transition-all group flex flex-col`}>
            <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-lg ${bgIcon} flex items-center justify-center text-lg shadow-sm group-hover:scale-110 transition-transform`}>
                        <i className={`fas ${icon}`}></i>
                    </div>
                    <div>
                        <h5 className="font-bold text-slate-900 leading-tight">{title}</h5>
                        <p className="text-xs text-slate-500 font-medium">{subtitle}</p>
                    </div>
                </div>
                <i className={`fas fa-external-link-alt text-slate-300 group-hover:${accentColor} text-xs transition-colors`}></i>
            </div>
            
            <p className="text-sm text-slate-600 leading-relaxed mt-2 mb-2">
                {details}
            </p>
            
            {footer && (
                <p className="text-xs text-slate-400 italic border-t border-slate-100 pt-2 mt-auto">
                    {footer}
                </p>
            )}
            
            {extra && <div className="mt-3">{extra}</div>}
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
                    <h4 className="text-sm font-bold text-slate-700 mb-2 pl-1">Förvald Privat Delning</h4>
                    <ShareOptionCard 
                        icon="fa-users"
                        color="slate"
                        title="Stories"
                        subtitle="På Together: Familjeanpassat"
                        link="https://www.familysearch.org/en/discovery/together/stories"
                        details="Familjeanpassat för barn och unga i släktgrupper."
                        footer="Bevaras för alltid men faller ej i glömska om unga delar nutidshistoria."
                    />
                </div>

                {/* VÄLJ MELLAN PRIVAT ELLER OFFENTLIG DELNING */}
                <div>
                    <h4 className="text-sm font-bold text-slate-700 mb-2 pl-1">Välj mellan Privat eller Offentlig</h4>
                    <div className="space-y-3">
                        <ShareOptionCard 
                            icon="fa-user-lock"
                            color="slate"
                            title="Minnen"
                            subtitle="På Levande Person (Family Tree)"
                            link="https://www.familysearch.org/en/tree/private-people"
                            details="För familj och släkt i släktgrupper. PDF, Ljud, Text, Bild."
                            footer="Kan flyttas till publika trädet efter bortgång."
                        />

                        <ShareOptionCard 
                            icon="fa-images"
                            color="emerald"
                            title="Gallery"
                            subtitle="På Memories"
                            link="https://www.familysearch.org/en/memories/gallery"
                            details="För släktforskare och allmänhet."
                        />
                    </div>
                </div>
            </div>

            {/* Column 2: Offentlig */}
            <div className="space-y-6">
                {/* FÖRVALD OFFENTLIG DELNING */}
                <div>
                    <h4 className="text-sm font-bold text-emerald-700 mb-2 pl-1">Förvald Offentlig Delning</h4>
                    <ShareOptionCard 
                        icon="fa-rss"
                        color="emerald"
                        title="Feed"
                        subtitle="På Together"
                        link="https://www.familysearch.org/en/discovery/together/feed"
                        details="Dela bild och text om släkten i ett flöde."
                        extra={(
                            <div className="bg-emerald-50/50 p-3 rounded-lg border border-emerald-100 mt-2">
                                <p className="text-xs text-emerald-800/80 font-bold leading-relaxed">
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
