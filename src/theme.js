// Look-and-feel settings: skin (whole-app palette + shape), piece set,
// piece colours and board colours. Each is independent and lives in
// App.settings; apply() mirrors them onto <html> data attributes that
// styles.css keys off. Also used by the pop-out mini board.
import { setPieceSet } from './pieces.js';

// sw = swatch: [board light, board dark, ui background, ui accent, ui edge]
export const SKINS = [
  { id: 'strategy-night', name: 'Strategy Night', note: 'default', sw: ['#f2f2f2', '#1c1c1c', '#000000', '#ffffff', '#2e2e2e'] },
  { id: 'brutal', name: 'Brutal', note: 'light', sw: ['#ffffff', '#f0bf2c', '#f4f4f0', '#ffd60a', '#111111'] },
  { id: 'midnight', name: 'Midnight', note: 'dark violet', sw: ['#d3ccf3', '#6a5bc4', '#0f0e17', '#9b85ff', '#f2f0fb'] },
  { id: 'strategy', name: 'Strategy', note: 'light mono', sw: ['#ffffff', '#111111', '#f3f3f3', '#0a0a0a', '#d4d4d4'] },
  { id: 'brutal-night', name: 'Brutal Night', note: 'dark', sw: ['#ecece4', '#c9a227', '#121212', '#ffd60a', '#f4f4f0'] },
  { id: 'violet', name: 'Violet', note: 'like Vetted', sw: ['#efeafd', '#9a85f0', '#f7f6fc', '#6d4aff', '#ff4f9a'] },
  { id: 'coin', name: 'Ledger Blue', note: 'like Coin', sw: ['#e6edf8', '#6f93d3', '#f5f6f8', '#2563eb', '#14161a'] },
  { id: 'tournament', name: 'Tournament', note: 'club green', sw: ['#ebecd0', '#779556', '#eef1ec', '#2f7d4f', '#1f3b2b'] },
  { id: 'auto', name: 'Auto', note: 'follows system', sw: ['#ffffff', '#111111', '#000000', '#ffffff', '#2e2e2e'] },
];

export const BOARD_COLORS = [
  ['theme', 'Theme'], ['green', 'Green'], ['brown', 'Brown'], ['blue', 'Blue'], ['gray', 'Gray'], ['light', 'Light'],
];

export const PIECE_COLORS = [['mono', 'Black and white'], ['wood', 'Classic wood']];

export const LOOK_DEFAULTS = { skin: 'strategy-night', pieceSet: 'flat', pieceColor: 'mono', boardColor: 'green' };

// v1 stored { theme: 'dark'|'light', boardTheme: 'classic'|'emerald'|... }.
// Carry the board choice over once; the old dark/light flag maps to the
// matching Strategy skin so a light-mode user doesn't wake up in dark mode.
export function migrateLook(settings) {
  const s = { ...settings };
  if (!s.skin) s.skin = s.theme === 'light' ? 'strategy' : LOOK_DEFAULTS.skin;
  if (!s.boardColor) {
    const old = { classic: 'brown', emerald: 'green', ocean: 'blue', midnight: 'gray', coral: 'brown' };
    s.boardColor = (s.boardTheme && old[s.boardTheme]) || LOOK_DEFAULTS.boardColor;
  }
  if (!s.pieceSet) s.pieceSet = LOOK_DEFAULTS.pieceSet;
  if (!s.pieceColor) s.pieceColor = LOOK_DEFAULTS.pieceColor;
  delete s.theme; delete s.boardTheme; delete s.pieceTheme;
  return s;
}

// "auto" resolves to Strategy / Strategy Night from the system setting and
// follows it live, so CSS only ever sees concrete skins.
const darkQuery = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
let currentLook = null;
if (darkQuery) darkQuery.addEventListener('change', () => { if (currentLook && currentLook.skin === 'auto') applyLook(currentLook); });

export function applyLook(look) {
  currentLook = look;
  const root = document.documentElement;
  const set = (attr, val, def) => { if (!val || val === def) root.removeAttribute(attr); else root.setAttribute(attr, val); };
  const skin = !look.skin || look.skin === 'auto'
    ? (darkQuery && !darkQuery.matches ? 'strategy' : 'strategy-night')
    : look.skin;
  root.setAttribute('data-skin', skin);
  set('data-board', look.boardColor, 'theme');
  set('data-pcol', look.pieceColor, 'mono');
  setPieceSet(look.pieceSet);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', getComputedStyle(root).getPropertyValue('--bg').trim() || '#000000');
}
