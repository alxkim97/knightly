// App core: settings + progress persistence, view routing, and the shell
// (left rail on desktop, top bar + floating tab bar on phone, stats column on
// wide screens). Views register themselves from main.js so this module has
// no import cycle with them.
import { platform } from './platform.js';
import * as Sync from './sync.js';
import { html, ICON } from './util.js';
import { applyLook, LOOK_DEFAULTS } from './theme.js';
import { brandKnightSVG } from './pieces.js';
import { lookPicker } from './look-picker.js';
import { liveBoards } from './board.js';
import { addDayXp, markStreakDay, normalizeStreak, todayXp } from './streak.js';
import { addMiss, reviewResult, dueCount } from './review.js';

const NAV = [
  ['home', 'Home'],
  ['learn-hub', 'Learn'],
  ['review', 'Review'],
  ['puzzles-hub', 'Puzzles'],
  ['play-setup', 'Play'],
  ['settings', 'Settings'],
];
const NAV_ICON = { home: ICON.home, 'learn-hub': ICON.learn, review: ICON.review, 'puzzles-hub': ICON.puzzles, 'play-setup': ICON.play, settings: ICON.settings };

export const App = {
  settings: { ...LOOK_DEFAULTS, sound: true, miniAlwaysOnTop: true, dailyGoal: 50 },
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
      course: { done: {} },        // lessonId -> { best, plays, first, last }
      streak: { current: 0, best: 0, last: null, freezeWeek: null },
      streakDays: [],
      days: {},                    // 'YYYY-MM-DD' -> XP earned that day
      puzzleDay: { date: null, n: 0 },
      review: {},                  // ref -> spaced-review schedule (src/review.js)
      reviewStats: { done: 0, learned: 0 },
    };
  },

  // ── Progress ──────────────────────────────────────────
  // One progress object for the whole session (src/sync.js keeps it current
  // with other devices). Screens read it, change it, then saveProgress().
  async getProgress() {
    if (App._progressCache) { normalizeStreak(App._progressCache); return App._progressCache; }
    if (!App._progressLoading) {
      App._progressLoading = platform.getProgress().then((stored) => {
        App._progressCache = Sync.load(stored, App.defaultProgress());
        return App._progressCache;
      });
    }
    return App._progressLoading;
  },
  saveProgress(progress) {
    return Sync.commit(progress);
  },
  // Settings -> Reset progress: everything except settings, on every synced device.
  async resetProgress() {
    await App.getProgress();
    await Sync.reset();
  },
  async addXp(amount) {
    const progress = await App.getProgress();
    const before = todayXp(progress);
    progress.xp = (progress.xp || 0) + amount;
    addDayXp(progress, amount);
    await App.saveProgress(progress);
    App.refreshChrome();
    const goal = App.settings.dailyGoal || 50;
    return { total: progress.xp, goalReached: before < goal && todayXp(progress) >= goal };
  },
  // Count today toward the streak; true the first time each day.
  async markStreakDay() {
    const progress = await App.getProgress();
    const extended = markStreakDay(progress);
    if (extended) { await App.saveProgress(progress); App.refreshChrome(); }
    return extended;
  },
  // Something answered wrong: schedule it for Review (back in 1 day).
  async recordMiss(ref, data) {
    const progress = await App.getProgress();
    addMiss(progress, ref, data);
    await App.saveProgress(progress);
    App.refreshChrome();
  },
  // A review item answered: firstTry decides advance vs. back to day 1.
  async recordReview(ref, firstTry) {
    const progress = await App.getProgress();
    const outcome = reviewResult(progress, ref, firstTry);
    await App.saveProgress(progress);
    return outcome;
  },
  async addHistoryEntry(entry) {
    const progress = await App.getProgress();
    progress.history = progress.history || [];
    progress.history.unshift({ id: Sync.newId(), date: new Date().toISOString(), ...entry });
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
    await App.getProgress();
    Sync.commitSettings(App.settings); // look + daily goal; sound and pop-out pin stay per device
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
    if (xpChip) xpChip.innerHTML = ICON.flame + (progress.streak?.current || 0);
    const due = dueCount(progress);
    document.querySelectorAll('[data-nav="review"]').forEach((b) => {
      let badge = b.querySelector('.count');
      if (!due) { if (badge) badge.remove(); return; }
      if (!badge) { badge = document.createElement('span'); badge.className = 'count'; b.appendChild(badge); }
      badge.textContent = due;
    });
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
