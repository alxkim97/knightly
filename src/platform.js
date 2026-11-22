// One storage + host layer for both builds.
//  - Desktop (Electron): preload.js exposes window.knightlyAPI, which reads
//    and writes settings.json / progress.json in the user-data folder and
//    drives the pop-out mini board.
//  - Web / PWA: no knightlyAPI; everything lives in localStorage.
// Settings are also mirrored to localStorage on desktop so boot can apply the
// chosen theme synchronously, before the async IPC read returns (no flash).
// Cloud sync (phase 5) will hook in here, behind the same four calls.

const desktop = typeof window !== 'undefined' && window.knightlyAPI ? window.knightlyAPI : null;
const SETTINGS_KEY = 'knightly_settings';
const PROGRESS_KEY = 'knightly_progress';

function readLocal(key) {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : null; } catch { return null; }
}
function writeLocal(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage full or blocked */ }
}

export const isDesktop = !!desktop;

export const platform = {
  // Synchronous best guess for first paint.
  cachedSettings() { return readLocal(SETTINGS_KEY); },

  async getSettings() {
    if (desktop) return (await desktop.getSettings()) || readLocal(SETTINGS_KEY);
    return readLocal(SETTINGS_KEY);
  },
  async setSettings(data) {
    writeLocal(SETTINGS_KEY, data);
    if (desktop) await desktop.setSettings(data);
  },
  async getProgress() {
    if (desktop) return desktop.getProgress();
    return readLocal(PROGRESS_KEY);
  },
  async setProgress(data) {
    if (desktop) await desktop.setProgress(data);
    else writeLocal(PROGRESS_KEY, data);
  },
  async getVersion() {
    if (desktop) return desktop.getVersion();
    return __APP_VERSION__; // injected by vite.config.mjs
  },

  // ── App updates (desktop only; the web build updates through the service worker) ──
  updates: desktop ? {
    getStatus: () => desktop.getUpdateStatus(),
    check: () => desktop.checkForUpdates(),
    install: () => desktop.installUpdate(),
    onStatus: (cb) => desktop.onUpdateStatus(cb),
  } : null,

  // ── Pop-out mini board (desktop only) ──
  hasMiniBoard: !!desktop,
  toggleMiniBoard: () => desktop.toggleMiniBoard(),
  syncMiniBoard: (payload) => desktop && desktop.syncMiniBoard(payload),
  onMiniMove: (cb) => desktop && desktop.onMiniMove(cb),
  onMiniClosed: (cb) => desktop && desktop.onMiniClosed(cb),
  setMiniAlwaysOnTop: (val) => desktop && desktop.setMiniAlwaysOnTop(val),
  onMiniPinChanged: (cb) => desktop && desktop.onMiniPinChanged(cb),
};
