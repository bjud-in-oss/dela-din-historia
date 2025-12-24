
import React from 'react';

interface AppLogoProps {
  className?: string;
  variant?: 'phase1' | 'phase2' | 'phase3' | 'default';
}

const AppLogo: React.FC<AppLogoProps> = ({ className = "w-16 h-16", variant = 'default' }) => {
  
  // Common Definitions
  const defs = (
    <defs>
      <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur in="SourceAlpha" stdDeviation="2"/>
        <feOffset dx="1" dy="2" result="offsetblur"/>
        <feComponentTransfer>
          <feFuncA type="linear" slope="0.15"/>
        </feComponentTransfer>
        <feMerge>
          <feMergeNode/>
          <feMergeNode in="SourceGraphic"/>
        </feMerge>
      </filter>
      <linearGradient id="blueGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#E0E7FF" />
          <stop offset="100%" stopColor="#C7D2FE" />
      </linearGradient>
      <linearGradient id="amberGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#FEF3C7" />
          <stop offset="100%" stopColor="#FDE68A" />
      </linearGradient>
      <linearGradient id="emeraldGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#D1FAE5" />
          <stop offset="100%" stopColor="#A7F3D0" />
      </linearGradient>
    </defs>
  );

  const Phase1 = () => (
    <svg viewBox="0 0 100 100" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      {defs}
      {/* Background Circle */}
      <circle cx="50" cy="50" r="48" fill="url(#blueGrad)" />
      
      {/* Document (Bottom Right/Back) */}
      <g transform="translate(45, 45)" filter="url(#shadow)">
        <rect width="36" height="46" rx="2" fill="white" />
        <path d="M8 10h20M8 18h20M8 26h14" stroke="#4F46E5" strokeWidth="2" strokeLinecap="round" />
        <path d="M28 36l-6-6-6 6" stroke="#CBD5E1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /> {/* Subtle arrow or decoration */}
      </g>

      {/* Photo (Top Left/Front) */}
      <g transform="translate(18, 15) rotate(-5)" filter="url(#shadow)">
        <rect width="40" height="36" rx="2" fill="white" stroke="white" strokeWidth="2" />
        <rect x="2" y="2" width="36" height="26" fill="#F1F5F9" />
        {/* Mountain/Sun icon in photo */}
        <circle cx="28" cy="10" r="3" fill="#FCD34D" />
        <path d="M2 28L12 16L20 22L28 12L38 28H2Z" fill="#64748B" />
      </g>
    </svg>
  );

  const Phase2 = () => (
    <svg viewBox="0 0 100 100" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      {defs}
      <circle cx="50" cy="50" r="48" fill="url(#amberGrad)" />
      
      {/* Heart (Top Left) */}
      <g transform="translate(15, 15)" filter="url(#shadow)">
         <path 
           d="M25 5C18 5 15 12 15 15C15 25 35 40 35 40C35 40 55 25 55 15C55 12 52 5 45 5C38 5 35 12 35 12C35 12 32 5 25 5Z" 
           fill="#D97706" 
           stroke="white" 
           strokeWidth="2"
         />
      </g>

      {/* Pencil (Bottom Right) */}
      <g transform="translate(40, 40)" filter="url(#shadow)">
         <path d="M5 45 L15 45 L45 15 L35 5 L5 35 Z" fill="#FFFBEB" stroke="#78350F" strokeWidth="2"/>
         <path d="M5 45 L5 35 L12 42 Z" fill="#78350F" /> {/* Tip */}
         <path d="M35 5 L45 15" stroke="#78350F" strokeWidth="2" /> {/* Eraser line */}
         <rect x="36" y="4" width="8" height="12" transform="rotate(45 40 10)" fill="#F87171" opacity="0.8"/>
      </g>
    </svg>
  );

  const Phase3 = () => (
    <svg viewBox="0 0 100 100" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      {defs}
      <circle cx="50" cy="50" r="48" fill="url(#emeraldGrad)" />

      {/* Share Icon (Top Left) */}
      <g transform="translate(20, 20)" filter="url(#shadow)">
        <circle cx="10" cy="15" r="5" fill="#059669" />
        <circle cx="35" cy="5" r="5" fill="#059669" />
        <circle cx="35" cy="25" r="5" fill="#059669" />
        <line x1="10" y1="15" x2="35" y2="5" stroke="#059669" strokeWidth="3" />
        <line x1="10" y1="15" x2="35" y2="25" stroke="#059669" strokeWidth="3" />
      </g>

      {/* Infinity Icon (Bottom Right) */}
      <g transform="translate(35, 45)" filter="url(#shadow)">
        <path 
          d="M5 15 C 5 5, 20 5, 25 15 C 30 25, 45 25, 45 15 C 45 5, 30 5, 25 15 C 20 25, 5 25, 5 15 Z" 
          stroke="white" 
          strokeWidth="6" 
          strokeLinecap="round"
        />
        <path 
          d="M5 15 C 5 5, 20 5, 25 15 C 30 25, 45 25, 45 15 C 45 5, 30 5, 25 15 C 20 25, 5 25, 5 15 Z" 
          stroke="#059669" 
          strokeWidth="3" 
          strokeLinecap="round"
        />
      </g>
    </svg>
  );

  if (variant === 'phase1') return <Phase1 />;
  if (variant === 'phase2') return <Phase2 />;
  if (variant === 'phase3') return <Phase3 />;

  // Default / Composite for generic use (e.g. initial loading)
  return (
    <div className="flex items-center space-x-[-10px]">
       <Phase1 />
    </div>
  );
};

export default AppLogo;
