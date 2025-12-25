
import React from 'react';

interface AppLogoProps {
  className?: string;
  variant?: 'phase1' | 'phase2' | 'phase3' | 'olive' | 'default';
}

const AppLogo: React.FC<AppLogoProps> = ({ className = "w-16 h-16", variant = 'olive' }) => {
  
  // Common Definitions & Gradients
  const defs = (
    <defs>
      {/* Soft Shadow for realistic depth */}
      <filter id="softShadow" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur in="SourceAlpha" stdDeviation="2"/>
        <feOffset dx="1" dy="2" result="offsetblur"/>
        <feComponentTransfer>
           <feFuncA type="linear" slope="0.2"/>
        </feComponentTransfer>
        <feMerge>
          <feMergeNode/>
          <feMergeNode in="SourceGraphic"/>
        </feMerge>
      </filter>

      {/* Harder Shadow for objects close to surface */}
      <filter id="dropShadow" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur in="SourceAlpha" stdDeviation="1"/>
        <feOffset dx="0.5" dy="1" result="offsetblur"/>
        <feComponentTransfer>
           <feFuncA type="linear" slope="0.4"/>
        </feComponentTransfer>
        <feMerge>
          <feMergeNode/>
          <feMergeNode in="SourceGraphic"/>
        </feMerge>
      </filter>

      {/* --- Gradients --- */}

      {/* Paper / Parchment Gradient (Brownish) */}
      <linearGradient id="paperBrownDark" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#e7dcc6" />
          <stop offset="100%" stopColor="#d4c5a6" />
      </linearGradient>
      
      <linearGradient id="paperBrownLight" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#fdf6e3" />
          <stop offset="100%" stopColor="#eee8d5" />
      </linearGradient>

      {/* White Paper Gradient */}
      <linearGradient id="whitePaperGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#f1f5f9" />
      </linearGradient>

      {/* Blue Photo Background Gradient */}
      <linearGradient id="photoBlueBg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#bae6fd" />
          <stop offset="100%" stopColor="#3b82f6" />
      </linearGradient>

      {/* Skin Tone */}
      <linearGradient id="skinTone" x1="0" y1="0" x2="1" y2="1">
           <stop offset="0%" stopColor="#fde68a" />
           <stop offset="100%" stopColor="#f59e0b" />
      </linearGradient>

      {/* Pen Body Gradient (Black/Dark Blue) */}
      <linearGradient id="penBodyGrad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#334155" /> 
          <stop offset="50%" stopColor="#0f172a" />
          <stop offset="100%" stopColor="#334155" />
      </linearGradient>
      
      {/* Gold Accent Gradient */}
      <linearGradient id="goldGrad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#fcd34d" />
          <stop offset="50%" stopColor="#d97706" />
          <stop offset="100%" stopColor="#fcd34d" />
      </linearGradient>

      {/* Phase 3 Green Gradient */}
      <linearGradient id="emeraldGrad" x1="0" y1="0" x2="1" y2="1">
           <stop offset="0%" stopColor="#10b981" />
           <stop offset="100%" stopColor="#047857" />
      </linearGradient>

      {/* Olive Gradients (kept from previous) */}
      <linearGradient id="leafTop" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#4d7c0f" />
        <stop offset="100%" stopColor="#365314" />
      </linearGradient>
      <linearGradient id="leafUnder" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#a3e635" />
        <stop offset="100%" stopColor="#84cc16" />
      </linearGradient>
      <radialGradient id="blackOlive" cx="30%" cy="30%" r="70%">
        <stop offset="0%" stopColor="#4a4a4a" />
        <stop offset="30%" stopColor="#1a1a1a" />
        <stop offset="100%" stopColor="#000000" />
      </radialGradient>
    </defs>
  );

  const OliveBranch = () => (
    <svg viewBox="0 0 100 100" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
       {defs}
       <g filter="url(#softShadow)">
           <path d="M15 85 C 35 82, 55 80, 90 35" stroke="#4d4c38" strokeWidth="2.5" strokeLinecap="round"/>
           <path d="M40 78 L 40 85" stroke="#4d4c38" strokeWidth="1" />
           <path d="M62 62 L 62 68" stroke="#4d4c38" strokeWidth="1" />
           <path d="M75 48 L 78 52" stroke="#4d4c38" strokeWidth="1" />

           <path d="M25 82 Q 15 85 10 75 Q 18 78 25 82 Z" fill="url(#leafUnder)" />
           <path d="M28 80 Q 25 65 35 55 Q 35 70 28 80 Z" fill="url(#leafTop)" />
           <path d="M50 70 Q 55 85 65 88 Q 60 75 50 70 Z" fill="url(#leafUnder)" />
           <path d="M52 68 Q 50 50 65 40 Q 60 55 52 68 Z" fill="url(#leafTop)" />
           <path d="M70 50 Q 75 62 88 60 Q 80 50 70 50 Z" fill="url(#leafUnder)" />
           <path d="M72 48 Q 70 30 82 20 Q 78 35 72 48 Z" fill="url(#leafTop)" />
           <path d="M90 35 Q 98 32 98 22 Q 92 28 90 35 Z" fill="url(#leafTop)" />

           <ellipse cx="40" cy="88" rx="5" ry="6" fill="url(#blackOlive)" transform="rotate(5 40 88)" />
           <ellipse cx="38" cy="86" rx="1.5" ry="2" fill="white" opacity="0.4" transform="rotate(5 38 86)" />
           <ellipse cx="62" cy="71" rx="5.5" ry="6.5" fill="url(#blackOlive)" transform="rotate(-10 62 71)" />
           <ellipse cx="60" cy="69" rx="1.5" ry="2.5" fill="white" opacity="0.4" transform="rotate(-10 60 69)" />
           <ellipse cx="79" cy="55" rx="4.5" ry="5.5" fill="url(#blackOlive)" transform="rotate(15 79 55)" />
           <ellipse cx="78" cy="54" rx="1" ry="1.5" fill="white" opacity="0.4" transform="rotate(15 78 54)" />
       </g>
    </svg>
  );

  // Phase 1: Stack of 4 Docs/Photos, Blue Bg, Brown Docs, More Padding Top
  const Phase1 = () => (
    <svg viewBox="0 0 100 100" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      {defs}
      
      {/* Scaled down and moved down to create "padding" at top */}
      <g transform="translate(0, 5) scale(0.85) translate(10, 5)">
        
        {/* Doc 1 (Bottom) - Dark Brown, Wide Angle */}
        <g transform="rotate(-15 50 50) translate(-5, 0)" filter="url(#dropShadow)">
           <rect x="20" y="20" width="50" height="65" fill="url(#paperBrownDark)" rx="1" stroke="#a89f81" strokeWidth="0.5" />
        </g>
        
        {/* Doc 2 - Medium Brown */}
        <g transform="rotate(-8 50 50) translate(-2, 0)" filter="url(#dropShadow)">
           <rect x="22" y="18" width="48" height="65" fill="url(#paperBrownDark)" rx="1" stroke="#a89f81" strokeWidth="0.5" />
        </g>

        {/* Doc 3 - Light Brown/Paper */}
        <g transform="rotate(-2 50 50)" filter="url(#dropShadow)">
           <rect x="25" y="15" width="45" height="65" fill="url(#paperBrownLight)" rx="1" stroke="#d6d3c0" strokeWidth="0.5" />
           <line x1="30" y1="25" x2="60" y2="25" stroke="#d6d3c0" strokeWidth="1.5" strokeLinecap="round" />
           <line x1="30" y1="35" x2="50" y2="35" stroke="#d6d3c0" strokeWidth="1.5" strokeLinecap="round" />
        </g>

        {/* Doc 4 (Top) - Photo with Blue BG */}
        <g transform="rotate(6 55 55) translate(2, -2)" filter="url(#dropShadow)">
            {/* Photo Frame */}
            <rect x="30" y="25" width="50" height="55" fill="#ffffff" rx="1" stroke="#e2e8f0" strokeWidth="0.5" />
            {/* Photo Content Area - BLUE BG */}
            <rect x="34" y="29" width="42" height="40" fill="url(#photoBlueBg)" />
            
            {/* Person 1 (Left) */}
            <g transform="translate(35, 30)">
                 <path d="M5 40 L 5 35 Q 8 28 15 28 Q 22 28 25 35 L 25 40 Z" fill="#334155" />
                 <circle cx="15" cy="20" r="6.5" fill="url(#skinTone)" />
                 <path d="M9 19 Q 9 12 15 12 Q 21 12 21 19 L 21 21 L 9 21 Z" fill="#1e293b" />
            </g>

            {/* Person 2 (Right) */}
            <g transform="translate(52, 32)">
                 <path d="M-5 38 L -5 33 Q -2 26 8 26 Q 18 26 21 33 L 21 38 Z" fill="#475569" />
                 <circle cx="8" cy="18" r="6" fill="url(#skinTone)" />
                 <path d="M2 18 Q 2 10 8 10 Q 14 10 14 18 L 14 20 L 2 20 Z" fill="#3f2e18" />
            </g>

            {/* Gloss Reflection */}
            <path d="M30 25 L 80 25 L 50 80 L 30 80 Z" fill="white" opacity="0.15" />
        </g>
      </g>
    </svg>
  );

  // Phase 2: Paper on Table (Perspective) with Clear Heart, 2 Lines, Pen ON TOP
  const Phase2 = () => (
    <svg viewBox="0 0 100 100" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      {defs}
      
      <g transform="scale(0.95) translate(2, 2)">
        {/* Paper Sheet on Table - Skewed/Rotated for 'Space' */}
        <g transform="rotate(5 50 50) skewX(-5)" filter="url(#dropShadow)">
            <rect x="20" y="10" width="60" height="75" fill="url(#whitePaperGrad)" rx="1" stroke="#e2e8f0" strokeWidth="0.5" />
            
            {/* Clear, Classic Heart Shape */}
            <path 
              d="M50 35 C 40 25, 30 30, 30 45 C 30 60, 50 75, 50 75 C 50 75, 70 60, 70 45 C 70 30, 60 25, 50 35" 
              fill="none" 
              stroke="#dc2626" 
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            
            {/* Two Text Lines - Pen writes on the second one */}
            {/* Line 1 */}
            <path 
              d="M30 80 Q 50 78 70 80" 
              stroke="#334155" 
              strokeWidth="1.2" 
              strokeLinecap="round" 
              fill="none" 
              opacity="0.6"
            />
            {/* Line 2 (Pen interacts here) */}
             <path 
              d="M30 88 Q 45 86 55 88" 
              stroke="#334155" 
              strokeWidth="1.2" 
              strokeLinecap="round" 
              fill="none" 
              opacity="0.6"
            />
        </g>

        {/* Realistic Fountain Pen - Drawn LAST to be visibly ON TOP of lines */}
        {/* Positioned at the end of the second line (approx 55, 88 adjusted for transforms) */}
        <g transform="translate(55, 60) rotate(-130)" filter="url(#dropShadow)">
            {/* Pen Body */}
            <rect x="0" y="0" width="60" height="7" rx="2" fill="url(#penBodyGrad)" />
            <rect x="5" y="0" width="4" height="7" fill="url(#goldGrad)" />
            {/* Grip */}
            <path d="M0 1 L -8 2 L -8 5 L 0 6 Z" fill="#1e293b" />
            {/* Nib */}
            <path d="M-8 2 L -16 3.5 L -8 5 Z" fill="url(#goldGrad)" />
            {/* Shine */}
            <path d="M2 2 L 58 2" stroke="white" strokeWidth="1" opacity="0.2" strokeLinecap="round" />
        </g>
      </g>
    </svg>
  );

  // Phase 3: Smaller Infinity & Rotated Share (Unchanged)
  const Phase3 = () => (
    <svg viewBox="0 0 100 100" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      {defs}
      
      <g transform="scale(0.9) translate(5, 5)">
        {/* Infinity Symbol - Smaller & Green */}
        <g transform="translate(15, 20) scale(0.7)" filter="url(#softShadow)">
            <path 
            d="M50 25 C 70 5, 90 5, 90 25 C 90 45, 70 45, 50 25 C 30 45, 10 45, 10 25 C 10 5, 30 5, 50 25" 
            fill="none" 
            stroke="url(#emeraldGrad)" 
            strokeWidth="8" 
            strokeLinecap="round"
            strokeLinejoin="round"
            />
            {/* Highlight */}
            <path 
            d="M50 25 C 70 5, 90 5, 90 25 C 90 45, 70 45, 50 25 C 30 45, 10 45, 10 25 C 10 5, 30 5, 50 25" 
            fill="none" 
            stroke="white" 
            strokeWidth="2" 
            strokeLinecap="round"
            opacity="0.3"
            />
        </g>

        {/* Share Icon - Rotated 90 degrees Right */}
        <g transform="translate(0, 5)" filter="url(#dropShadow)">
            {/* Connections */}
            <line x1="35" y1="70" x2="65" y2="55" stroke="#475569" strokeWidth="2.5" strokeLinecap="round" />
            <line x1="35" y1="70" x2="65" y2="85" stroke="#475569" strokeWidth="2.5" strokeLinecap="round" />
            
            {/* Source Node (Left) */}
            <circle cx="35" cy="70" r="5" fill="#059669" />
            
            {/* Dest Node (Top Right) */}
            <circle cx="65" cy="55" r="4" fill="#059669" />
            
            {/* Dest Node (Bottom Right) */}
            <circle cx="65" cy="85" r="4" fill="#059669" />
        </g>
      </g>
    </svg>
  );

  if (variant === 'phase1') return <Phase1 />;
  if (variant === 'phase2') return <Phase2 />;
  if (variant === 'phase3') return <Phase3 />;
  
  // Default is Olive Branch
  return <OliveBranch />;
};

export default AppLogo;
