const fs = require('fs');
const path = require('path');

const iconsDir = path.join(__dirname, 'public', 'icons');
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

// 1. High Quality SVG Icon
const svgIcon = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="512" height="512" viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bgGrad" x1="0" y1="0" x2="512" y2="512" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#0f172a"/>
      <stop offset="50%" stop-color="#1e1b4b"/>
      <stop offset="100%" stop-color="#090d16"/>
    </linearGradient>
    <linearGradient id="lensGrad" x1="160" y1="160" x2="352" y2="352" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#38bdf8"/>
      <stop offset="50%" stop-color="#6366f1"/>
      <stop offset="100%" stop-color="#a855f7"/>
    </linearGradient>
    <linearGradient id="rimGrad" x1="140" y1="140" x2="372" y2="372" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#38bdf8" stop-opacity="0.8"/>
      <stop offset="100%" stop-color="#ec4899" stop-opacity="0.8"/>
    </linearGradient>
    <filter id="glow" x="50" y="50" width="412" height="412" filterUnits="userSpaceOnUse">
      <feGaussianBlur stdDeviation="24" result="blur"/>
      <feComposite in="SourceGraphic" in2="blur" operator="over"/>
    </filter>
  </defs>

  <!-- Background rounded rect -->
  <rect width="512" height="512" rx="112" fill="url(#bgGrad)"/>
  
  <!-- Subtle inner border -->
  <rect x="6" y="6" width="500" height="500" rx="106" stroke="rgba(255,255,255,0.12)" stroke-width="4"/>

  <!-- Glowing Camera Body -->
  <g filter="url(#glow)">
    <!-- Camera Outline Shape -->
    <path d="M140 160 C140 148, 150 138, 162 138 H200 L216 112 C222 102, 232 96, 244 96 H268 C280 96, 290 102, 296 112 L312 138 H350 C362 138, 372 148, 372 160 V354 C372 366, 362 376, 350 376 H162 C150 376, 140 366, 140 354 Z" fill="#1e293b" stroke="url(#rimGrad)" stroke-width="10"/>
    
    <!-- Outer Lens Ring -->
    <circle cx="256" cy="256" r="82" fill="#0f172a" stroke="url(#lensGrad)" stroke-width="12"/>
    
    <!-- Inner Lens Aperture -->
    <circle cx="256" cy="256" r="54" fill="url(#lensGrad)"/>
    <circle cx="256" cy="256" r="32" fill="#090d16"/>
    
    <!-- Lens reflection -->
    <circle cx="242" cy="242" r="12" fill="#ffffff" fill-opacity="0.8"/>
    <circle cx="266" cy="266" r="6" fill="#ffffff" fill-opacity="0.5"/>

    <!-- Recording Indicator Dot -->
    <circle cx="338" cy="176" r="10" fill="#ef4444"/>
    <circle cx="338" cy="176" r="16" fill="#ef4444" fill-opacity="0.3"/>
  </g>
</svg>
`;

fs.writeFileSync(path.join(iconsDir, 'icon-512.svg'), svgIcon);
fs.writeFileSync(path.join(iconsDir, 'icon-192.svg'), svgIcon);
fs.writeFileSync(path.join(iconsDir, 'icon-512-maskable.svg'), svgIcon);

console.log('SVG icons written successfully');
