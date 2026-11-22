// SVG Icons & Procedural Vector Artwork Generator for FEYORA Launcher

const ICONS = {
  logo: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="6"/><circle cx="9.5" cy="12" r="1.6" fill="currentColor"/><circle cx="14.5" cy="12" r="1.6" fill="currentColor"/></svg>`,
  play: `<svg width="22" height="22" viewBox="0 0 24 24"><path d="M8 5.5v13l11-6.5z" fill="currentColor"/></svg>`,
  heart: `<svg viewBox="0 0 24 24" stroke-width="2" stroke-linejoin="round" fill="none" stroke="currentColor"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.4A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/></svg>`,
  heartFill: `<svg viewBox="0 0 24 24" stroke-width="2" stroke-linejoin="round" fill="currentColor" stroke="currentColor"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.4A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/></svg>`,
  sliders: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/></svg>`,
  back: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>`,
  info: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>`,
  refresh: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>`,
  gamepad: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="2" y="6" width="20" height="12" rx="6"/><path d="M6 12h4M8 10v4M15 11h.01M18 13h.01"/></svg>`,
  steam: `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M11.979 0C5.678 0 .511 4.86.022 11.037l6.432 2.658c.545-.371 1.203-.59 1.912-.59.063 0 .125.004.188.006l2.861-4.142V8.91c0-2.495 2.028-4.524 4.524-4.524 2.495 0 4.524 2.029 4.524 4.524s-2.029 4.524-4.524 4.524a4.54 4.54 0 0 1-1.393-.217l-4.093 2.916c0 .054.004.107.004.162 0 1.93-1.57 3.5-3.5 3.5a3.504 3.504 0 0 1-3.473-3.082L.548 18.42A12.002 12.002 0 1 0 11.979 0z"/></svg>`,
  epic: `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M4.887 0C4.307 0 3.84.469 3.84 1.05v15.938c0 .248.087.491.246.683l7.24 8.736c.394.475 1.13.475 1.524 0l7.24-8.736a1.077 1.077 0 0 0 .246-.683V1.05c0-.581-.467-1.05-1.047-1.05H4.887zm7.094 3.535c3.551 0 4.909.845 5.253 2.502h-3.013c-.156-.474-.823-.746-2.24-.746-1.564 0-2.408.438-2.408 1.488 0 2.295 7.662 1.482 7.662 6.516 0 2.946-2.046 4.63-5.32 4.63-3.791 0-5.118-.946-5.46-2.613h3.048c.159.507.892.833 2.412.833 1.635 0 2.302-.55 2.302-1.516 0-2.583-7.662-1.637-7.662-6.526 0-2.883 2.012-4.568 5.426-4.568z"/></svg>`,
  check: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>`,
  folder: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>`,
  power: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18.36 6.64a9 9 0 1 1-12.73 0M12 2v10"/></svg>`,
  image: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>`,
  maximize: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>`
};

function generateProceduralArt(style, palette) {
  const [a, b, c, d] = palette || ['#0d2b45', '#1b6f8a', '#7fe0d0', '#f2c46d'];
  let s = '', i, r, x, t = '';
  
  switch(style) {
    case 'waves':
      s = `<circle cx="210" cy="120" r="58" fill="${d}"/>
           <path d="M0 230Q50 190 100 230T200 230T300 230V400H0Z" fill="${b}"/>
           <path d="M0 270Q60 230 120 270T240 270T360 270V400H0Z" fill="${c}" opacity=".85"/>
           <path d="M0 325Q70 288 140 325T280 325T420 325V400H0Z" fill="${a}" opacity=".85"/>`;
      break;
    case 'city':
      s = `<circle cx="95" cy="115" r="48" fill="${d}"/>`;
      [[0,52,150],[44,40,220],[80,62,120],[132,46,190],[172,56,150],[222,40,240],[256,48,140]].forEach((q, j) => {
        s += `<rect x="${q[0]}" y="${400-q[2]}" width="${q[1]}" height="${q[2]}" fill="${j%2 ? c : b}"/>`;
      });
      break;
    case 'rings':
      [130, 100, 70, 40].forEach((q, j) => {
        s += `<circle cx="150" cy="190" r="${q}" fill="none" stroke="${j%2 ? c : d}" stroke-width="14"/>`;
      });
      s += `<circle cx="150" cy="190" r="16" fill="${d}"/>`;
      break;
    case 'sun':
      s = `<circle cx="150" cy="190" r="96" fill="${d}"/>`;
      for(i = 0; i < 5; i++) s += `<rect x="40" y="${200+i*16}" width="220" height="${3+i*2}" fill="${a}"/>`;
      s += `<rect y="290" width="300" height="110" fill="${b}"/>`;
      for(i = 0; i < 5; i++) s += `<rect y="${305+i*20}" width="300" height="3" fill="${c}"/>`;
      break;
    case 'forest':
      s = `<circle cx="220" cy="90" r="32" fill="${d}"/>`;
      for(r = 2; r >= 0; r--) {
        for(x = -30 + (r%2)*25; x < 330; x += 64) {
          const base = 400 - r*52;
          t += `<polygon points="${x},${base} ${x+32},${base-130+r*20} ${x+64},${base}" fill="${[b, c, a][r]}"/>`;
        }
      }
      s += t + `<rect y="360" width="300" height="40" fill="${a}"/>`;
      break;
    case 'mountains':
      s = `<circle cx="210" cy="72" r="30" fill="${d}"/>
           <path d="M0 300L90 150L150 230L220 110L300 280V400H0Z" fill="${b}"/>
           <path d="M0 345L70 255L140 330L230 235L300 335V400H0Z" fill="${c}" opacity=".9"/>
           <rect y="370" width="300" height="30" fill="${a}"/>`;
      break;
    case 'bubbles':
      [[80,110,60,c],[200,90,38,d],[230,200,70,b],[70,260,46,d],[160,330,64,c],[250,330,26,d]].forEach((q, j) => {
        s += `<circle cx="${q[0]}" cy="${q[1]}" r="${q[2]}" fill="${q[3]}" opacity="${j%2 ? .9 : .7}"/>`;
      });
      break;
    case 'stripes':
    default:
      for(i = -4; i < 10; i++) {
        s += `<rect x="${i*50}" y="-100" width="26" height="600" fill="${[b, c, d][((i%3)+3)%3]}" transform="rotate(-24 150 200)"/>`;
      }
      s += `<circle cx="150" cy="200" r="52" fill="${a}" stroke="${d}" stroke-width="6"/>`;
      break;
  }
  
  return `<svg viewBox="0 0 300 400" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <rect width="300" height="400" fill="${a}"/>
    ${s}
  </svg>`;
}
