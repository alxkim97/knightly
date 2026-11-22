// Piece sets. Every set is inline SVG in a 0..100 viewBox, so pieces scale
// to any square size and recolour through CSS (see styles.css "Pieces").
// Shared conventions: plain shapes take the piece fill + outline, `.dt`
// paths are inner detail strokes, `.eye` is a small solid detail, `.ball`
// (Staunton) takes a radial gradient, `.shine`/`.hole`/`.shd` belong to Soft.
// Gradients referenced here live once in index.html / mini.html (#pc-defs).

const FLAT_BASE = '<rect x="22" y="80" width="56" height="10" rx="2"/>';

// Knight head, facing left: chest, throat, jaw, muzzle, nose, forehead, ear,
// crest, back of neck. `y` is where the neck meets the collar. Kept to an eye
// and a mane line on purpose (nostril/mouth/cheek details read as clutter).
function knight(y) {
  return `<path d="M30 ${y} C29 70 33 62 41 56 C35 58 28 59 23 56 C18.5 53 18 47.5 21 44 L31 32 C35 27 39 22.5 43 19.5 L45.5 9 L51.5 17 C63 18 74 28 76 44 C77 56 75.5 ${y - 12} 74.5 ${y} Z"/>`
    + '<path class="dt" d="M53 21 C63 25 69.5 34 70 47 C70.5 57 69.5 66 68.5 72"/>'
    + '<ellipse class="eye" cx="40" cy="30" rx="3.2" ry="2" transform="rotate(-28 40 30)"/>';
}

const FLAT = {
  p: '<circle cx="50" cy="31" r="12"/><path d="M38 80 L43 53 H57 L62 80 Z"/><rect x="36" y="45" width="28" height="8" rx="2"/>',
  r: '<rect x="33" y="40" width="34" height="40"/><path d="M27 18 H37 V26 H45 V18 H55 V26 H63 V18 H73 V40 H27 Z"/><path class="dt" d="M38 50 H62"/>',
  b: '<path d="M40 80 L44 58 H56 L60 80 Z"/><path d="M50 17 C64 28 66 42 58 52 H42 C34 42 36 28 50 17 Z"/><rect x="36" y="51" width="28" height="7" rx="2"/><circle cx="50" cy="11" r="5"/><path class="dt" d="M55 29 L46 39"/>',
  n: knight(80) + '<rect x="27" y="73" width="46" height="7" rx="2"/>',
  q: '<rect x="30" y="66" width="40" height="14"/><path d="M24 66 L19 30 L36 47 L50 20 L64 47 L81 30 L76 66 Z"/><circle cx="19" cy="27" r="5"/><circle cx="50" cy="15" r="5"/><circle cx="81" cy="27" r="5"/><path class="dt" d="M34 73 H66"/>',
  k: '<rect x="32" y="66" width="36" height="14"/><path d="M28 46 C26 30 74 30 72 46 L64 66 H36 Z"/><path d="M46 5 H54 V11 H61 V19 H54 V31 H46 V19 H39 V11 H46 Z"/><path class="dt" d="M37 73 H63"/>',
};

const ST_BASE = '<path d="M23 92 H77 Q79 92 79 89 V86.5 Q79 83 75 82.5 H25 Q21 83 21 86.5 V89 Q21 92 23 92 Z"/><path d="M27 82.5 Q29 76.5 35 75.5 H65 Q71 76.5 73 82.5 Z"/>';
const STAUNTON = {
  p: '<path d="M38 76 Q40 63 45 55 H55 Q60 63 62 76 Z"/><ellipse cx="50" cy="54.5" rx="12.5" ry="3.4"/><path d="M45 54 Q46.5 49 47 47 H53 Q53.5 49 55 54 Z"/><circle class="ball" cx="50" cy="36" r="11.5"/>',
  r: '<path d="M33.5 76 Q35.5 62 37 45 H63 Q64.5 62 66.5 76 Z"/><path d="M31 41 V22 H38.5 V28 H45.5 V22 H54.5 V28 H61.5 V22 H69 V41 Z"/><rect x="32" y="40" width="36" height="6" rx="1.5"/><path class="dt" d="M38 54 H62"/>',
  b: '<path d="M38 76 Q41 63 44 53 H56 Q59 63 62 76 Z"/><ellipse cx="50" cy="52.5" rx="13.5" ry="3.6"/><path d="M44 52 Q45 50 46 47 H54 Q55 50 56 52 Z"/><path d="M50 16 C61 24 64.5 36 58 46.5 H42 C35.5 36 39 24 50 16 Z"/><ellipse cx="50" cy="47.5" rx="9.5" ry="2.6"/><path class="dt" d="M56.5 26 L47 37.5"/><circle class="ball" cx="50" cy="12.5" r="4.2"/>',
  q: '<path d="M36 76 Q39 59 43.5 42 H56.5 Q61 59 64 76 Z"/><ellipse cx="50" cy="59" rx="13.5" ry="3.2"/><path d="M36.5 41 L31 23 L40 32 L43 21 L50 31 L57 21 L60 32 L69 23 L63.5 41 Z"/><path d="M42 34 Q50 16 58 34 Z"/><ellipse cx="50" cy="41.5" rx="14.5" ry="3.4"/><circle class="ball" cx="31" cy="21" r="3"/><circle class="ball" cx="43" cy="19" r="3"/><circle class="ball" cx="57" cy="19" r="3"/><circle class="ball" cx="69" cy="21" r="3"/><circle class="ball" cx="50" cy="14" r="4"/>',
  k: '<path d="M37 76 Q40 59 43.5 43 H56.5 Q60 59 63 76 Z"/><ellipse cx="50" cy="59" rx="13.5" ry="3.2"/><path d="M37.5 43 Q35 31 42 27 H58 Q65 31 62.5 43 Z"/><ellipse cx="50" cy="43" rx="14" ry="3.4"/><ellipse cx="50" cy="27" rx="9" ry="2.6"/><path d="M47.5 5 H52.5 V10.5 H57.5 V15 H52.5 V25 H47.5 V15 H42.5 V10.5 H47.5 Z"/>',
  n: knight(76) + '<ellipse cx="51" cy="75.5" rx="22" ry="3.6"/>',
};

const SOFT_SHADOW = '<ellipse class="shd" cx="50" cy="88" rx="27" ry="5.5"/>';
function softBody(top, hw = 21) {
  const l = 50 - hw, r = 50 + hw;
  return `<path d="M${l + 3} 84 Q${l - 0.5} 84 ${l + 0.5} 79.5 C${l + 3} ${top + 8} ${50 - hw * 0.5} ${top} 50 ${top} C${50 + hw * 0.5} ${top} ${r - 3} ${top + 8} ${r - 0.5} 79.5 Q${r + 0.5} 84 ${r - 3} 84 Z"/>`;
}
const SOFT = {
  p: softBody(51, 18.5) + '<ellipse cx="50" cy="51.5" rx="10.5" ry="3.2"/><circle cx="50" cy="34" r="11.5"/><circle class="shine" cx="45.5" cy="29.5" r="3.2"/>',
  r: '<path d="M33 84 Q29.5 84 30.5 80 L35 53 L33.5 38 H66.5 L65 53 L69.5 80 Q70.5 84 67 84 Z"/><ellipse cx="50" cy="31" rx="19.5" ry="11"/><ellipse class="hole" cx="50" cy="29.5" rx="11" ry="5"/><path class="dt" d="M38.5 21.5 V25.5 M61.5 21.5 V25.5 M50 19.5 V24"/><path class="dt" d="M35 53 H65"/>',
  b: softBody(64, 19.5) + '<path d="M50 18 C63 27 67 42 59.5 55 Q50 63 40.5 55 C33 42 37 27 50 18 Z"/><path class="dt" d="M56 31 L47.5 41.5"/><circle cx="50" cy="13" r="5.5"/><circle class="shine" cx="44.5" cy="33" r="2.6"/>',
  q: softBody(61, 20) + '<path d="M32 59 L25.5 27 L39 41 L50 20 L61 41 L74.5 27 L68 59 Q50 66 32 59 Z"/><circle class="shine" cx="40" cy="50" r="2.4"/>',
  k: softBody(61, 20) + '<path d="M34 61 C23.5 46 32 31.5 42.5 37 Q50 30.5 57.5 37 C68 31.5 76.5 46 66 61 Q50 68 34 61 Z"/><path d="M46.5 7 H53.5 V13.5 H60 V20.5 H53.5 V29 H46.5 V20.5 H40 V13.5 H46.5 Z"/><circle class="shine" cx="38.5" cy="45" r="2.4"/>',
  n: '<path d="M34 84 Q30 84 30 79 L30 66 C30 60.5 32.5 57.5 36 55.5 C29.5 55.5 23.5 53 21.5 47 C19.5 41 23.5 36 29.5 31 L37.5 25 L35.5 11.5 L46 19.5 C52 18 58 17 64 18 C72 19.5 74 26 74 34 L74 79 Q74 84 70 84 Z"/><ellipse class="eye" cx="47" cy="34" rx="3" ry="4.6"/><path class="dt" d="M36.5 55.5 Q42 52 47.5 56 Q57.5 62.5 66.5 56"/>',
};

export const PIECE_SETS = [
  { id: 'flat', name: 'Flat', note: 'default' },
  { id: 'soft', name: 'Soft', note: 'rounded' },
  { id: 'staunton', name: 'Staunton', note: '3D' },
  { id: 'modern', name: 'Modern', note: 'two-tone' },
  { id: 'letter', name: 'Letter', note: 'scoresheet' },
];

let currentSet = 'flat';
export function setPieceSet(id) {
  currentSet = PIECE_SETS.some((s) => s.id === id) ? id : 'flat';
}
export function getPieceSet() { return currentSet; }

const svg = (cls, body) => `<svg class="pc ${cls}" viewBox="0 0 100 100" aria-hidden="true" focusable="false">${body}</svg>`;

// color: 'w' | 'b'; type: chess.js piece letter (p n b r q k).
export function pieceSVG(color, type, set = currentSet) {
  const t = type.toLowerCase();
  switch (set) {
    case 'staunton': return svg(`st ${color}`, ST_BASE + STAUNTON[t]);
    case 'modern': return svg(`md ${color}`, ST_BASE + STAUNTON[t]);
    case 'soft': return svg(`sf ${color}`, SOFT_SHADOW + SOFT[t]);
    case 'letter': return svg(`lt ${color}`, `<text x="50" y="82" text-anchor="middle">${t === 'n' ? 'N' : t.toUpperCase()}</text>`);
    default: return svg(color, FLAT_BASE + FLAT[t]);
  }
}

// Brand mark: the flat knight drawn in the accent colours (no piece classes).
export function brandKnightSVG() {
  const body = (FLAT_BASE + FLAT.n)
    .replaceAll('class="eye"', 'style="fill:var(--accent);stroke:none"')
    .replaceAll('class="dt"', 'style="fill:none;stroke:var(--accent)"');
  return `<svg viewBox="0 0 100 100" aria-hidden="true" style="fill:var(--on-accent);stroke:var(--on-accent);stroke-width:4;stroke-linejoin:round">${body}</svg>`;
}

// Gradients used by Staunton / Modern / Soft. Injected once per document.
export const PIECE_DEFS = `<svg id="pc-defs" width="0" height="0" style="position:absolute" aria-hidden="true"><defs>
  <linearGradient id="stW" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="#a6a6a6"/><stop offset=".3" stop-color="#ffffff"/><stop offset=".62" stop-color="#e4e4e4"/><stop offset="1" stop-color="#8c8c8c"/></linearGradient>
  <linearGradient id="stB" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="#000"/><stop offset=".28" stop-color="#5e5e5e"/><stop offset=".46" stop-color="#262626"/><stop offset="1" stop-color="#000"/></linearGradient>
  <radialGradient id="stWr" cx=".38" cy=".34" r=".72"><stop offset="0" stop-color="#ffffff"/><stop offset=".55" stop-color="#e6e6e6"/><stop offset="1" stop-color="#959595"/></radialGradient>
  <radialGradient id="stBr" cx=".36" cy=".32" r=".75"><stop offset="0" stop-color="#7a7a7a"/><stop offset=".35" stop-color="#2a2a2a"/><stop offset="1" stop-color="#000"/></radialGradient>
  <linearGradient id="mdW" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="#ffffff"/><stop offset=".58" stop-color="#ffffff"/><stop offset=".58" stop-color="#d9d9d9"/><stop offset="1" stop-color="#cdcdcd"/></linearGradient>
  <linearGradient id="mdB" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="#6b6b6b"/><stop offset=".55" stop-color="#5a5a5a"/><stop offset=".55" stop-color="#444444"/><stop offset="1" stop-color="#3a3a3a"/></linearGradient>
  <linearGradient id="sfW" x1="0" y1="0" x2=".75" y2="1"><stop offset="0" stop-color="#f6f9fb"/><stop offset=".26" stop-color="#f6f9fb"/><stop offset=".26" stop-color="#d8e1e8"/><stop offset="1" stop-color="#d1dbe3"/></linearGradient>
  <linearGradient id="sfB" x1="0" y1="0" x2=".75" y2="1"><stop offset="0" stop-color="#72787f"/><stop offset=".26" stop-color="#72787f"/><stop offset=".26" stop-color="#4c5157"/><stop offset="1" stop-color="#44494e"/></linearGradient>
  <linearGradient id="stIv" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="#b89a6a"/><stop offset=".3" stop-color="#fff3dc"/><stop offset=".62" stop-color="#ecd6ad"/><stop offset="1" stop-color="#9c7c4c"/></linearGradient>
  <linearGradient id="stWd" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="#1e0f05"/><stop offset=".3" stop-color="#7a4a22"/><stop offset=".5" stop-color="#4a2810"/><stop offset="1" stop-color="#1a0b03"/></linearGradient>
</defs></svg>`;
