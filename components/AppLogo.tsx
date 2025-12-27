
import React, { useState, useEffect, useMemo } from 'react';

interface AppLogoProps {
  className?: string;
  variant?: 'phase1' | 'phase2' | 'phase3' | 'olive' | 'sunWindow' | 'default';
}

// --- COLOR PALETTES ---
const PALETTES = {
  standard: ['#6366f1', '#818cf8', '#a5b4fc', '#c7d2fe', '#e0e7ff'], // Indigo/Purple
  forest:   ['#14532d', '#15803d', '#16a34a', '#4ade80', '#86efac'], // Deep Greens
  desert:   ['#7c2d12', '#c2410c', '#ea580c', '#f59e0b', '#fcd34d'], // Amber/Orange/Red
  fireIce:  ['#b91c1c', '#ef4444', '#3b82f6', '#60a5fa', '#bfdbfe'], // Red & Blue contrast
  monochrome: ['#0f172a', '#334155', '#64748b', '#94a3b8', '#cbd5e1'], // Slates/Blacks
  white:    ['#ffffff', '#f8fafc', '#f1f5f9', '#e2e8f0', '#ffffff']  // Ethereal White (High brightness)
};

type PaletteKey = keyof typeof PALETTES;

const getRandomColorFromPalette = (paletteKey: PaletteKey) => {
  const colors = PALETTES[paletteKey];
  return colors[Math.floor(Math.random() * colors.length)];
};

const getRandomOpacity = (paletteKey: PaletteKey) => {
  // White glass needs higher opacity to be visible against the light background
  if (paletteKey === 'white') return 0.5 + Math.random() * 0.4; 
  return 0.4 + Math.random() * 0.5;
};

const getRandomStroke = (paletteKey: PaletteKey) => {
    if (paletteKey === 'white') return 0.8; // Thicker stroke for white glass
    return 0.3;
}

// --- FRACTAL ALGORITHMS ---

// 1. ROSE (Circular Layers)
const generateRose = (palette: PaletteKey) => {
  const shapes: React.JSX.Element[] = [];
  const layers = 4;
  shapes.push(<circle key="core" cx="50" cy="50" r="5" fill={getRandomColorFromPalette(palette)} fillOpacity="0.9" />);

  for (let i = 1; i <= layers; i++) {
    const radius = i * 9;
    const segments = 8 + (i * 2);
    const offsetAngle = Math.random() * 360;
    
    for (let j = 0; j < segments; j++) {
      const angle1 = (j * (360 / segments) + offsetAngle) * (Math.PI / 180);
      const angle2 = ((j + 1) * (360 / segments) + offsetAngle) * (Math.PI / 180);
      const midAngle = (angle1 + angle2) / 2;
      const rIn = radius - 5;
      const rOut = radius + 5;

      const p1 = [50 + rIn * Math.cos(angle1), 50 + rIn * Math.sin(angle1)];
      const p2 = [50 + rOut * Math.cos(midAngle), 50 + rOut * Math.sin(midAngle)];
      const p3 = [50 + rIn * Math.cos(angle2), 50 + rIn * Math.sin(angle2)];
      const p4 = [50 + (rIn - 2) * Math.cos(midAngle), 50 + (rIn - 2) * Math.sin(midAngle)];

      shapes.push(
        <path key={`rose-${i}-${j}`} d={`M${p1.join(',')} L${p2.join(',')} L${p3.join(',')} L${p4.join(',')} Z`} fill={getRandomColorFromPalette(palette)} fillOpacity={getRandomOpacity(palette)} stroke="white" strokeWidth={getRandomStroke(palette)} strokeOpacity="0.4" />
      );
    }
  }
  return shapes;
};

// 2. STAR (Radiating)
const generateStar = (palette: PaletteKey) => {
  const shapes: React.JSX.Element[] = [];
  const rays = 10 + Math.floor(Math.random() * 6);
  const maxR = 40;
  shapes.push(<circle key="core" cx="50" cy="50" r="4" fill={getRandomColorFromPalette(palette)} fillOpacity="0.9" />);

  for (let i = 0; i < rays; i++) {
    const angle = (i * (360 / rays)) * (Math.PI / 180);
    const nextAngle = ((i + 1) * (360 / rays)) * (Math.PI / 180);
    const segments = 3;
    
    for (let k = 0; k < segments; k++) {
        const rStart = 4 + (k * (maxR/segments));
        const rEnd = rStart + (maxR/segments);
        const midR = (rStart + rEnd) / 2;
        
        const x1 = 50 + rStart * Math.cos(angle + (nextAngle-angle)/2);
        const y1 = 50 + rStart * Math.sin(angle + (nextAngle-angle)/2);
        const x2 = 50 + midR * Math.cos(angle);
        const y2 = 50 + midR * Math.sin(angle);
        const x3 = 50 + rEnd * Math.cos(angle + (nextAngle-angle)/2);
        const y3 = 50 + rEnd * Math.sin(angle + (nextAngle-angle)/2);
        const x4 = 50 + midR * Math.cos(nextAngle);
        const y4 = 50 + midR * Math.sin(nextAngle);

        shapes.push(
            <path key={`star-${i}-${k}`} d={`M${x1},${y1} L${x2},${y2} L${x3},${y3} L${x4},${y4} Z`} fill={getRandomColorFromPalette(palette)} fillOpacity={getRandomOpacity(palette)} stroke="white" strokeWidth={getRandomStroke(palette)} />
        );
    }
  }
  return shapes;
};

// 3. WAVES (Water Droplet)
const generateWaves = (palette: PaletteKey) => {
    const shapes: React.JSX.Element[] = [];
    const rings = 6;
    
    for (let i = 0; i < rings; i++) {
        const r = (i + 1) * 6;
        const items = 8 + (i * 4);
        
        for (let j = 0; j < items; j++) {
            const angleStart = (j * (360/items)) * (Math.PI / 180);
            const angleEnd = ((j+1) * (360/items)) * (Math.PI / 180);
            
            // Create arcs
            const p1x = 50 + r * Math.cos(angleStart);
            const p1y = 50 + r * Math.sin(angleStart);
            const p2x = 50 + r * Math.cos(angleEnd);
            const p2y = 50 + r * Math.sin(angleEnd);
            const p3x = 50 + (r+5) * Math.cos(angleEnd);
            const p3y = 50 + (r+5) * Math.sin(angleEnd);
            const p4x = 50 + (r+5) * Math.cos(angleStart);
            const p4y = 50 + (r+5) * Math.sin(angleStart);

            shapes.push(
                <path 
                    key={`wave-${i}-${j}`} 
                    d={`M${p1x},${p1y} A${r},${r} 0 0,1 ${p2x},${p2y} L${p3x},${p3y} A${r+5},${r+5} 0 0,0 ${p4x},${p4y} Z`}
                    fill={getRandomColorFromPalette(palette)} 
                    fillOpacity={getRandomOpacity(palette)}
                    stroke="white" 
                    strokeWidth={getRandomStroke(palette)}
                />
            );
        }
    }
    return shapes;
}

// 4. BIO-ORGANIC (Nature Seeds Simulation)
const generateBioOrganic = (palette: PaletteKey) => {
    const shapes: React.JSX.Element[] = [];
    const cells = 20;
    
    // Create random voronoi-like cells using rotation offsets
    for (let i = 0; i < cells; i++) {
        const angle = (i * (360/cells)) * (Math.PI / 180);
        const r = Math.random() * 30;
        const cx = 50 + r * Math.cos(angle);
        const cy = 50 + r * Math.sin(angle);
        const size = 5 + Math.random() * 10;
        
        shapes.push(
            <circle 
                key={`bio-${i}`}
                cx={cx} cy={cy} r={size}
                fill={getRandomColorFromPalette(palette)}
                fillOpacity={getRandomOpacity(palette)}
                stroke="white"
                strokeWidth={getRandomStroke(palette)}
            />
        );
        
        // Add a core to some cells
        if (Math.random() > 0.5) {
             shapes.push(
                <circle 
                    key={`bio-core-${i}`}
                    cx={cx} cy={cy} r={size/3}
                    fill="white"
                    fillOpacity="0.6"
                />
            );
        }
    }
    return shapes;
}

// 5. VORTEX
const generateVortex = (palette: PaletteKey) => {
    const shapes: React.JSX.Element[] = [];
    const arms = 5;
    const segmentsPerArm = 12;
    for (let i = 0; i < arms; i++) {
        const startAngle = (i * (360/arms)) * (Math.PI / 180);
        for (let j = 0; j < segmentsPerArm; j++) {
            const r = 5 + (j * 3.5);
            const rotationOffset = (j * 15) * (Math.PI / 180); 
            const angle = startAngle + rotationOffset;
            const size = 3 + (j * 0.8);
            
            const x1 = 50 + r * Math.cos(angle);
            const y1 = 50 + r * Math.sin(angle);
            const x2 = 50 + (r+size) * Math.cos(angle + 0.2);
            const y2 = 50 + (r+size) * Math.sin(angle + 0.2);
            const x3 = 50 + (r+size) * Math.cos(angle - 0.2);
            const y3 = 50 + (r+size) * Math.sin(angle - 0.2);

            shapes.push(
                <path key={`vortex-${i}-${j}`} d={`M${x1},${y1} L${x2},${y2} L${x3},${y3} Z`} fill={getRandomColorFromPalette(palette)} fillOpacity={getRandomOpacity(palette)} stroke="white" strokeWidth={getRandomStroke(palette)} />
            );
        }
    }
    return shapes;
}

// --- LOGIC: Avoid Repeats & Mix Palettes ---

let lastAlgoIndex = -1;
let lastPaletteIndex = -1;

const getNextPattern = () => {
    const algos = [generateRose, generateStar, generateWaves, generateBioOrganic, generateVortex];
    const paletteKeys: PaletteKey[] = ['standard', 'forest', 'desert', 'fireIce', 'monochrome', 'white'];
    
    // Pick Algo (No repeats)
    let algoIndex;
    do {
        algoIndex = Math.floor(Math.random() * algos.length);
    } while (algoIndex === lastAlgoIndex);
    lastAlgoIndex = algoIndex;

    // Pick Palette (No repeats, prefer White 30% of time)
    let pIndex;
    do {
        // Boost white probability manually
        if (Math.random() < 0.3) {
            pIndex = paletteKeys.indexOf('white');
        } else {
            pIndex = Math.floor(Math.random() * paletteKeys.length);
        }
    } while (pIndex === lastPaletteIndex && paletteKeys.length > 1);
    lastPaletteIndex = pIndex;

    return algos[algoIndex](paletteKeys[pIndex]);
};

// --- COMPONENTS ---

const FractalGlass = () => {
  const [patternA, setPatternA] = useState<React.JSX.Element[]>([]);
  const [patternB, setPatternB] = useState<React.JSX.Element[]>([]);
  const [activeLayer, setActiveLayer] = useState<'A' | 'B'>('A');
  const [isFading, setIsFading] = useState(false);

  // Initial
  useEffect(() => {
    setPatternA(getNextPattern());
  }, []);

  // Cycle Patterns every 15s
  useEffect(() => {
    const interval = setInterval(() => {
      const newPattern = getNextPattern();
      
      if (activeLayer === 'A') {
        setPatternB(newPattern);
        setIsFading(true);
        setTimeout(() => {
           setActiveLayer('B');
           setIsFading(false);
        }, 2000); 
      } else {
        setPatternA(newPattern);
        setIsFading(true);
        setTimeout(() => {
           setActiveLayer('A');
           setIsFading(false);
        }, 2000);
      }
    }, 15000);

    return () => clearInterval(interval);
  }, [activeLayer]);

  return (
    <g clipPath="url(#windowClip)">
      <style>
        {`
          @keyframes slowSpin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
          @keyframes breathe {
            0% { transform: scale(1); }
            50% { transform: scale(1.02); }
            100% { transform: scale(1); }
          }
          .living-window {
             animation: slowSpin 120s linear infinite;
             transform-origin: 50px 50px;
          }
          .living-breathe {
             animation: breathe 10s ease-in-out infinite;
             transform-origin: 50px 50px;
          }
        `}
      </style>
      
      {/* Base Tint */}
      <circle cx="50" cy="50" r="38" fill="#f0f9ff" fillOpacity="0.2" />
      
      {/* Rotating Group for "Ultra-Slow Motion" */}
      <g className="living-window">
          {/* Breathing Group for "Depth" */}
          <g className="living-breathe">
              {/* Layer A */}
              <g style={{ transition: 'opacity 2s ease-in-out', opacity: activeLayer === 'A' ? 1 : (isFading && activeLayer === 'B' ? 0 : 0) }}>
                {patternA}
              </g>

              {/* Layer B */}
              <g style={{ transition: 'opacity 2s ease-in-out', opacity: activeLayer === 'B' ? 1 : (isFading && activeLayer === 'A' ? 0 : 0) }}>
                {patternB}
              </g>
          </g>
      </g>
    </g>
  );
};

const StoneFrame = () => (
    <g>
        <circle cx="50" cy="50" r="44" stroke="url(#stoneGrad)" strokeWidth="8" filter="url(#dropShadow)" fill="none" />
        <circle cx="50" cy="50" r="40" stroke="#000" strokeOpacity="0.15" strokeWidth="0.5" fill="none" />
        <circle cx="50" cy="50" r="47.5" stroke="#fff" strokeOpacity="0.4" strokeWidth="0.5" fill="none" />

        <g filter="url(#dropShadow)">
            <rect x="44" y="0" width="12" height="13" fill="url(#stoneGrad)" rx="1" />
            <path d="M44 0 L 56 0" stroke="#fff" strokeWidth="1" opacity="0.6" />
        </g>
        <g filter="url(#dropShadow)">
            <rect x="44" y="87" width="12" height="13" fill="url(#stoneGrad)" rx="1" />
            <path d="M44 87 L 56 87" stroke="#000" strokeWidth="1" opacity="0.2" />
        </g>
        <g filter="url(#dropShadow)">
            <rect x="0" y="44" width="13" height="12" fill="url(#stoneGrad)" rx="1" />
            <path d="M0 44 L 0 56" stroke="#fff" strokeWidth="1" opacity="0.6" />
        </g>
        <g filter="url(#dropShadow)">
            <rect x="87" y="44" width="13" height="12" fill="url(#stoneGrad)" rx="1" />
            <path d="M87 44 L 87 56" stroke="#000" strokeWidth="1" opacity="0.2" />
        </g>
        
        <circle cx="50" cy="50" r="38" stroke="#374151" strokeWidth="1" fill="none" opacity="0.1" />
    </g>
);

const AppLogo: React.FC<AppLogoProps> = ({ className = "w-16 h-16", variant = 'olive' }) => {
  const defs = (
    <defs>
      <clipPath id="windowClip">
          <circle cx="50" cy="50" r="38" />
      </clipPath>
      <filter id="softShadow" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur in="SourceAlpha" stdDeviation="2"/>
        <feOffset dx="1" dy="2" result="offsetblur"/>
        <feComponentTransfer><feFuncA type="linear" slope="0.2"/></feComponentTransfer>
        <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
      <filter id="dropShadow" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur in="SourceAlpha" stdDeviation="1"/>
        <feOffset dx="0.5" dy="1" result="offsetblur"/>
        <feComponentTransfer><feFuncA type="linear" slope="0.4"/></feComponentTransfer>
        <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
      <linearGradient id="paperBrownDark" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#e7dcc6" /><stop offset="100%" stopColor="#d4c5a6" /></linearGradient>
      <linearGradient id="paperBrownLight" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#fdf6e3" /><stop offset="100%" stopColor="#eee8d5" /></linearGradient>
      <linearGradient id="whitePaperGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#ffffff" /><stop offset="100%" stopColor="#f1f5f9" /></linearGradient>
      <linearGradient id="photoBlueBg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#bae6fd" /><stop offset="100%" stopColor="#3b82f6" /></linearGradient>
      <linearGradient id="skinTone" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#fde68a" /><stop offset="100%" stopColor="#f59e0b" /></linearGradient>
      <linearGradient id="penBodyGrad" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor="#334155" /><stop offset="50%" stopColor="#0f172a" /><stop offset="100%" stopColor="#334155" /></linearGradient>
      <linearGradient id="goldGrad" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor="#fcd34d" /><stop offset="50%" stopColor="#d97706" /><stop offset="100%" stopColor="#fcd34d" /></linearGradient>
      <linearGradient id="emeraldGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#10b981" /><stop offset="100%" stopColor="#047857" /></linearGradient>
      <linearGradient id="stoneGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#f3f4f6" /><stop offset="50%" stopColor="#d1d5db" /><stop offset="100%" stopColor="#9ca3af" /></linearGradient>
      <linearGradient id="leafTop" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#4d7c0f" /><stop offset="100%" stopColor="#365314" /></linearGradient>
      <linearGradient id="leafUnder" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#a3e635" /><stop offset="100%" stopColor="#84cc16" /></linearGradient>
      <radialGradient id="blackOlive" cx="30%" cy="30%" r="70%"><stop offset="0%" stopColor="#4a4a4a" /><stop offset="30%" stopColor="#1a1a1a" /><stop offset="100%" stopColor="#000000" /></radialGradient>
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

  const Phase1 = () => (
    <svg viewBox="0 0 100 100" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      {defs}
      <g transform="translate(0, 5) scale(0.85) translate(10, 5)">
        <g transform="rotate(-15 50 50) translate(-5, 0)" filter="url(#dropShadow)"><rect x="20" y="20" width="50" height="65" fill="url(#paperBrownDark)" rx="1" stroke="#a89f81" strokeWidth="0.5" /></g>
        <g transform="rotate(-8 50 50) translate(-2, 0)" filter="url(#dropShadow)"><rect x="22" y="18" width="48" height="65" fill="url(#paperBrownDark)" rx="1" stroke="#a89f81" strokeWidth="0.5" /></g>
        <g transform="rotate(-2 50 50)" filter="url(#dropShadow)">
           <rect x="25" y="15" width="45" height="65" fill="url(#paperBrownLight)" rx="1" stroke="#d6d3c0" strokeWidth="0.5" />
           <line x1="30" y1="25" x2="60" y2="25" stroke="#d6d3c0" strokeWidth="1.5" strokeLinecap="round" />
           <line x1="30" y1="35" x2="50" y2="35" stroke="#d6d3c0" strokeWidth="1.5" strokeLinecap="round" />
        </g>
        <g transform="rotate(6 55 55) translate(2, -2)" filter="url(#dropShadow)">
            <rect x="30" y="25" width="50" height="55" fill="#ffffff" rx="1" stroke="#e2e8f0" strokeWidth="0.5" />
            <rect x="34" y="29" width="42" height="40" fill="url(#photoBlueBg)" />
            <g transform="translate(35, 30)">
                 <path d="M5 40 L 5 35 Q 8 28 15 28 Q 22 28 25 35 L 25 40 Z" fill="#334155" />
                 <circle cx="15" cy="20" r="6.5" fill="url(#skinTone)" />
                 <path d="M9 19 Q 9 12 15 12 Q 21 12 21 19 L 21 21 L 9 21 Z" fill="#1e293b" />
            </g>
            <g transform="translate(52, 32)">
                 <path d="M-5 38 L -5 33 Q -2 26 8 26 Q 18 26 21 33 L 21 38 Z" fill="#475569" />
                 <circle cx="8" cy="18" r="6" fill="url(#skinTone)" />
                 <path d="M2 18 Q 2 10 8 10 Q 14 10 14 18 L 14 20 L 2 20 Z" fill="#3f2e18" />
            </g>
            <path d="M30 25 L 80 25 L 50 80 L 30 80 Z" fill="white" opacity="0.15" />
        </g>
      </g>
    </svg>
  );

  const Phase2 = () => (
    <svg viewBox="0 0 100 100" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      {defs}
      <g transform="scale(0.95) translate(2, 2)">
        <g transform="rotate(5 50 50) skewX(-5)" filter="url(#dropShadow)">
            <rect x="20" y="10" width="60" height="75" fill="url(#whitePaperGrad)" rx="1" stroke="#e2e8f0" strokeWidth="0.5" />
            <path d="M50 35 C 40 25, 30 30, 30 45 C 30 60, 50 75, 50 75 C 50 75, 70 60, 70 45 C 70 30, 60 25, 50 35" fill="none" stroke="#dc2626" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M30 80 Q 50 78 70 80" stroke="#334155" strokeWidth="1.2" strokeLinecap="round" fill="none" opacity="0.6"/>
             <path d="M30 88 Q 45 86 55 88" stroke="#334155" strokeWidth="1.2" strokeLinecap="round" fill="none" opacity="0.6"/>
        </g>
        <g transform="translate(55, 60) rotate(-130)" filter="url(#dropShadow)">
            <rect x="0" y="0" width="60" height="7" rx="2" fill="url(#penBodyGrad)" />
            <rect x="5" y="0" width="4" height="7" fill="url(#goldGrad)" />
            <path d="M0 1 L -8 2 L -8 5 L 0 6 Z" fill="#1e293b" />
            <path d="M-8 2 L -16 3.5 L -8 5 Z" fill="url(#goldGrad)" />
            <path d="M2 2 L 58 2" stroke="white" strokeWidth="1" opacity="0.2" strokeLinecap="round" />
        </g>
      </g>
    </svg>
  );

  const Phase3 = () => (
    <svg viewBox="0 0 100 100" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      {defs}
      <g transform="scale(0.9) translate(5, 5)">
        <g transform="translate(15, 20) scale(0.7)" filter="url(#softShadow)">
            <path d="M50 25 C 70 5, 90 5, 90 25 C 90 45, 70 45, 50 25 C 30 45, 10 45, 10 25 C 10 5, 30 5, 50 25" fill="none" stroke="url(#emeraldGrad)" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M50 25 C 70 5, 90 5, 90 25 C 90 45, 70 45, 50 25 C 30 45, 10 45, 10 25 C 10 5, 30 5, 50 25" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" opacity="0.3"/>
        </g>
        <g transform="translate(0, 5)" filter="url(#dropShadow)">
            <line x1="35" y1="70" x2="65" y2="55" stroke="#475569" strokeWidth="2.5" strokeLinecap="round" />
            <line x1="35" y1="70" x2="65" y2="85" stroke="#475569" strokeWidth="2.5" strokeLinecap="round" />
            <circle cx="35" cy="70" r="5" fill="#059669" />
            <circle cx="65" cy="55" r="4" fill="#059669" />
            <circle cx="65" cy="85" r="4" fill="#059669" />
        </g>
      </g>
    </svg>
  );

  const SunWindow = () => (
    <svg viewBox="0 0 100 100" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      {defs}
      <g filter="url(#softShadow)" transform="scale(0.9) translate(5.5, 5.5)">
        <FractalGlass />
        <StoneFrame />
      </g>
    </svg>
  );

  if (variant === 'phase1') return <Phase1 />;
  if (variant === 'phase2') return <Phase2 />;
  if (variant === 'phase3') return <Phase3 />;
  if (variant === 'sunWindow') return <SunWindow />;
  return <OliveBranch />;
};

export default AppLogo;
