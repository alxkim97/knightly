// Web + desktop entry. Fonts are bundled (work offline and in the installed
// PWA); the chosen look is applied from the local cache before anything else
// so there's no flash of the default theme.
import '@fontsource-variable/inter';
import '@fontsource/anton';
import '@fontsource-variable/archivo';
import '@fontsource-variable/jetbrains-mono';
import './styles.css';

import { App, buildShell } from './app.js';
import { platform } from './platform.js';
import * as Sync from './sync.js';
import { Updates } from './updates.js';
import * as Analysis from './analysis.js';
import { engine } from './engine.js';
import { ChessBoard } from './board.js';
import { applyLook, migrateLook } from './theme.js';
import { bindLookPicker } from './look-picker.js';
import { PIECE_DEFS } from './pieces.js';
import { renderHome } from './views/home.js';
import { renderInsights } from './views/insights.js';
import { renderGameReview } from './views/gamereview.js';
import { renderLearnHub, renderLesson } from './views/learn.js';
import { renderCourseLesson, renderReviewSession } from './views/course.js';
import { renderReview } from './views/review.js';
import { renderPuzzlesHub, renderPuzzleSolve } from './views/puzzles.js';
import { renderPlaySetup } from './views/play.js';
import { renderGame } from './views/game.js';
import { renderSettings } from './views/settings.js';
import { renderHistory } from './views/history.js';
import './views/side.js';

const cached = platform.cachedSettings();
if (cached) applyLook(migrateLook(cached));
else applyLook(App.settings);
document.body.insertAdjacentHTML('afterbegin', PIECE_DEFS);
bindLookPicker(App);

// focus = board view (no stats column); live = never re-rendered on a look
// change (its boards repaint in place instead, so a game isn't reset).
App.views = {
  home: { render: renderHome },
  'learn-hub': { render: renderLearnHub },
  'course-lesson': { render: renderCourseLesson, navKey: 'learn-hub', focus: true, live: true },
  review: { render: renderReview },
  'review-session': { render: renderReviewSession, navKey: 'review', focus: true, live: true },
  lesson: { render: renderLesson, navKey: 'learn-hub', focus: true, live: true },
  'puzzles-hub': { render: renderPuzzlesHub },
  'puzzle-solve': { render: renderPuzzleSolve, navKey: 'puzzles-hub', focus: true, live: true },
  'play-setup': { render: renderPlaySetup },
  game: { render: renderGame, navKey: 'play-setup', focus: true, live: true },
  insights: { render: renderInsights, navKey: 'play-setup' },
  'game-review': { render: renderGameReview, navKey: 'play-setup', focus: true, live: true },
  settings: { render: renderSettings },
  history: { render: renderHistory, navKey: 'home' },
};

// Service worker (web only). A new deploy is applied on the next screen
// change that isn't a live board, so an update never interrupts a game.
let pendingUpdate = null;
async function registerServiceWorker() {
  if (!/^https?:$/.test(location.protocol) || !('serviceWorker' in navigator)) return;
  try {
    const { registerSW } = await import('virtual:pwa-register');
    const updateSW = registerSW({
      immediate: true,
      onRegisteredSW(_url, reg) { Updates.webRegistered(reg); },
      onNeedRefresh() { pendingUpdate = () => updateSW(true); Updates.webReady(pendingUpdate); maybeApplyUpdate(); },
      onRegisteredSW(_url, reg) { if (reg) setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000); },
    });
  } catch { /* dev server without the PWA plugin */ }
}
function maybeApplyUpdate() {
  const view = App.current && App.views[App.current.name];
  if (pendingUpdate && !(view && view.live)) { const run = pendingUpdate; pendingUpdate = null; run(); }
}
const navigate = App.navigate.bind(App);
App.navigate = (...args) => { navigate(...args); maybeApplyUpdate(); };

async function init() {
  const stored = await platform.getSettings();
  const before = JSON.stringify(stored || {});
  App.settings = migrateLook({ ...App.settings, ...(stored || {}) });
  applyLook(App.settings);
  if (JSON.stringify(App.settings) !== before) platform.setSettings(App.settings); // local only: a migration isn't a change to sync

  buildShell();

  if (platform.hasMiniBoard) {
    platform.onMiniMove((payload) => { if (App._miniMoveHandler) App._miniMoveHandler(payload); });
    platform.onMiniClosed(() => {
      App.miniBoardOpen = false;
      if (App._miniClosedHandler) App._miniClosedHandler();
    });
    // The pin button on the mini board's own toolbar flips this setting too.
    platform.onMiniPinChanged((val) => {
      App.settings.miniAlwaysOnTop = val;
      const checkbox = document.getElementById('mini-always-on-top-toggle');
      if (checkbox) checkbox.checked = val;
    });
  }

  App.navigate('home');
  registerServiceWorker();
  Updates.start();

  Sync.start({
    ready: () => App.getProgress(),
    // Another device changed something: progress is already updated in place.
    onRemote({ settings }) {
      if (settings) {
        Object.assign(App.settings, settings);
        applyLook(App.settings);
        platform.setSettings(App.settings);
        App.onLookChanged(); // repaints live boards, re-renders static views
        return;
      }
      const view = App.current && App.views[App.current.name];
      if (view && !view.live) App.navigate(App.current.name, App.current.params, { keepScroll: true });
      else App.refreshChrome();
    },
  });
}

// Show a scroller's thumb while it is scrolling, then let it fade (styles.css).
document.addEventListener('scroll', (e) => {
  const t = e.target === document ? document.documentElement : e.target;
  if (!t || !t.classList) return;
  t.classList.add('sb-on');
  clearTimeout(t._sbTimer);
  t._sbTimer = setTimeout(() => t.classList.remove('sb-on'), 900);
}, true);

// iOS Safari ignores user-scalable=no; block its pinch gesture directly.
for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(ev, (e) => e.preventDefault());

// Test hook (Electron end-to-end scripts): set localStorage.knightly_debug = '1'.
try { if (localStorage.getItem('knightly_debug') === '1') window.__knightly = { App, Sync, Analysis, engine, ChessBoard }; } catch { /* storage blocked */ }

init();
