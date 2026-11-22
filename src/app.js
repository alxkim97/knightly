// App core: settings + progress persistence, view routing, and the shell
// (left rail on desktop, top bar + floating tab bar on phone, stats column on
// wide screens). Views register themselves from main.js so this module has
// no import cycle with them.
import { platform } from './platform.js';
import { html, ICON } from './util.js';
import { applyLook, LOOK_DEFAULTS } from './theme.js';
import { brandKnightSVG } from './pieces.js';
import { lookPicker } from './look-picker.js';
import { liveBoards } from './board.js';

const NAV = [
  ['home', 'Home'],
  ['learn-hub', 'Learn'],
  ['puzzles-hub', 'Puzzles'],
  ['play-setup', 'Play'],
  ['settings', 'Settings'],
];
const NAV_ICON = { home: ICON.home, 'learn-hub': ICON.learn, 'puzzles-hub': ICON.puzzles, 'play-setup': ICON.play, settings: ICON.settings };

export const App = {
  settings: { ...LOOK_DEFAULTS, sound: true, miniAlwaysOnTop: true },
  views: {},
  current: null, // { name, params }
  _progressCache: null,
  _viewCleanup: null,
  sideRenderer: null,

  defaultProgress() {
    return {
      puzzles: { solvedIds: [] },
      lessons: { completedIds: [] },
      xp: 0,
      record: { wins: 0, losses: 0, draws: 0 },
      history: [],
    };
  },

  // ── Progress ──────────────────────────────────────────
  async getProgress() {
    if (App._progressCache) return App._progressCache;
    const stored = await platform.getProgress();
    App._progressCache = { ...App.defaultProgress(), ...(stored || {}) };
    return App._progressCache;
  },
  async saveProgress(progress) {
    App._progressCache = progress;
    await platform.setProgress(progress);
  },
  async addXp(amount) {
    const progress = await App.getProgress();
    progress.xp = (progress.xp || 0) + amount;
    await App.saveProgress(progress);
    App.refreshChrome();
    return progress.xp;
  },
  async addHistoryEntry(entry) {
    const progress = await App.getProgress();
    progress.history = progress.history || [];
    progress.history.unshift({ date: new Date().toISOString(), ...entry });
    progress.history = progress.history.slice(0, 50);
    await App.saveProgress(progress);
  },
  async recordGameResult(result) {
    const progress = await App.getProgress();
    progress.record = progress.record || { wins: 0, losses: 0, draws: 0 };
    if (result === 'win') progress.record.wins++;
    else if (result === 'loss') progress.record.losses++;
    else if (result === 'draw') progress.record.draws++;
    await App.saveProgress(progress);
  },

  // ── Settings / look ───────────────────────────────────
  async saveSettings() {
    await platform.setSettings(App.settings);
  },
  setLook(patch) {
    Object.assign(App.settings, patch);
    applyLook(App.settings);
    App.saveSettings();
    App.onLookChanged();
  },
  onLookChanged() {
    for (const b of liveBoards) {
      if (b.container.isConnected) b._paint(); else liveBoards.delete(b);
    }
    App.syncMiniBoardLook();
    // Static views (thumbnails, pickers) simply re-render; live boards were
    // repainted above so an in-progress game/puzzle/lesson is never reset.
    const view = App.current && App.views[App.current.name];
    if (view && !view.live) App.navigate(App.current.name, App.current.params, { keepScroll: true });
    else App.refreshChrome();
  },

  // ── Mini board (desktop) ──────────────────────────────
  miniBoardOpen: false,
  _miniMoveHandler: null,
  _miniClosedHandler: null,
  _lastMini: null,
  async toggleMiniBoard() {
    const { open } = await platform.toggleMiniBoard();
    App.miniBoardOpen = open;
    return open;
  },
  setMiniMoveHandler(fn) { App._miniMoveHandler = fn; },
  setMiniClosedHandler(fn) { App._miniClosedHandler = fn; },
  miniLook() {
    const { skin, pieceSet, pieceColor, boardColor } = App.settings;
    return { skin, pieceSet, pieceColor, boardColor };
  },
  syncMiniBoard(state, flipped) {
    if (!App.miniBoardOpen) return;
    const last = state.history && state.history.length ? state.history[state.history.length - 1] : null;
    App._lastMini = { fen: state.fen, flipped: !!flipped, lastMove: last ? { from: last.from, to: last.to } : null };
    platform.syncMiniBoard({ ...App._lastMini, look: App.miniLook() });
  },
  syncMiniBoardLook() {
    if (App.miniBoardOpen && App._lastMini) platform.syncMiniBoard({ ...App._lastMini, look: App.miniLook() });
  },

  // ── Routing ───────────────────────────────────────────
  navigate(viewName, params = {}, opts = {}) {
    const view = App.views[viewName];
    if (!view) return;
    if (typeof App._viewCleanup === 'function') {
      try { App._viewCleanup(); } catch { /* ignore cleanup errors */ }
    }
    App._viewCleanup = null;
    App.current = { name: viewName, params };
    if (!opts.keepPopover) closeLookPopover();

    const navKey = view.navKey || viewName;
    document.querySelectorAll('[data-nav]').forEach((b) => b.classList.toggle('on', b.dataset.nav === navKey));
    // Focus views (a board you're playing on) drop the stats column so the
    // board gets the width.
    document.querySelector('.shell').classList.toggle('focus', !!view.focus);

    const scroller = document.scrollingElement;
    const y = scroller.scrollTop;
    const container = document.getElementById('view');
    container.innerHTML = '';
    const result = view.render(container, params);
    const restore = () => { scroller.scrollTop = opts.keepScroll ? y : 0; };
    if (result && typeof result.then === 'function') {
      result.then((cleanup) => {
        if (typeof cleanup === 'function') App._viewCleanup = cleanup;
        if (opts.keepScroll) restore();
      });
    } else if (typeof result === 'function') {
      App._viewCleanup = result;
    }
    restore();
    App.refreshChrome();
  },

  // Top-bar chips + stats column.
  async refreshChrome() {
    const progress = await App.getProgress();
    const xpChip = document.getElementById('tb-xp');
    if (xpChip) xpChip.innerHTML = ICON.bolt + (progress.xp || 0);
    const side = document.getElementById('side');
    if (side && App.sideRenderer && !document.querySelector('.shell').classList.contains('focus')) {
      App.sideRenderer(side, progress);
    }
  },
};

// ── Shell ───────────────────────────────────────────────
export function buildShell() {
  const navHTML = NAV.map(([key, label]) => `<button class="nav-btn" data-nav="${key}">${NAV_ICON[key]}<span>${label}</span></button>`).join('');
  document.getElementById('nav-rail').innerHTML = navHTML;
  document.getElementById('nav-tab').innerHTML = navHTML;
  document.querySelectorAll('[data-nav]').forEach((b) => b.addEventListener('click', () => App.navigate(b.dataset.nav)));
  document.querySelectorAll('.brand-mark').forEach((m) => { m.innerHTML = brandKnightSVG(); });
  document.querySelectorAll('[data-lookpick]').forEach((b) => b.addEventListener('click', toggleLookPopover));
  platform.getVersion().then((v) => {
    const node = document.getElementById('rail-version');
    if (node) node.textContent = `Knightly v${v}`;
  });
}

function closeLookPopover() {
  const root = document.getElementById('pop-root');
  if (root) root.innerHTML = '';
}
function openLookPopover() {
  const root = document.getElementById('pop-root');
  const pop = html(`<div class="card popover" role="dialog" aria-label="Look">
    <div class="pop-head"><div class="blk-h">Look</div><button class="icon-btn" aria-label="Close">${ICON.x}</button></div></div>`);
  pop.querySelector('button').addEventListener('click', closeLookPopover);
  // After a change, rebuild the popover so its own swatches show the new state.
  pop.appendChild(lookPicker({ compact: true, onChange: () => { closeLookPopover(); openLookPopover(); } }));
  root.appendChild(pop);
}
function toggleLookPopover() {
  const root = document.getElementById('pop-root');
  if (root.firstChild) closeLookPopover(); else openLookPopover();
}
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeLookPopover(); });
