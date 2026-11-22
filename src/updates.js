// One "app updates" surface for both builds.
//  - Desktop (Electron): main.js checks GitHub Releases in the background,
//    downloads, and reports status over IPC; install = restart into the new
//    version.
//  - Web / PWA: the service worker finds a new deploy; install = reload into it.
// Status shape: { state, version, percent, error, checkedAt }
//   state: idle | checking | current | downloading | ready | error | dev
import { platform, isDesktop } from './platform.js';
import { showToast } from './util.js';

let status = { state: 'idle', version: null, percent: 0, error: null, checkedAt: null };
const listeners = new Set();
let web = { reg: null, apply: null };
let started = false;

function set(next) {
  const was = status.state;
  status = { ...status, ...next };
  if (status.state === 'ready' && was !== 'ready') {
    showToast(isDesktop
      ? `Knightly ${status.version || ''} is ready. Restart it from Settings → App updates.`
      : 'A new version is ready. Updating on the next screen change.', 6000);
  }
  for (const cb of listeners) { try { cb(status); } catch { /* a closed view */ } }
}

export const Updates = {
  onChange(cb) { listeners.add(cb); return () => listeners.delete(cb); },
  get status() { return status; },

  // Called once at boot.
  async start() {
    if (started) return;
    started = true;
    if (isDesktop) {
      try { set(await platform.updates.getStatus()); } catch { /* old shell without the updater */ }
      platform.updates.onStatus((s) => set(s));
    }
  },

  async check() {
    if (isDesktop) {
      set({ state: 'checking', error: null });
      try { set(await platform.updates.check()); } catch (err) { set({ state: 'error', error: String(err && err.message || err) }); }
      return;
    }
    // Web: ask the service worker to look for a new deploy.
    if (!web.reg) { set({ state: 'dev' }); return; }
    set({ state: 'checking', error: null });
    try {
      await web.reg.update();
      // onNeedRefresh fires shortly after if something new was found.
      await new Promise((r) => setTimeout(r, 1500));
      if (status.state === 'checking') set({ state: 'current', checkedAt: new Date().toISOString() });
    } catch (err) { set({ state: 'error', error: 'Could not reach the server' }); }
  },

  // Desktop: restart into the downloaded version. Web: reload into the new deploy.
  install() {
    if (isDesktop) return platform.updates.install();
    if (web.apply) { showToast('Updating…'); web.apply(); }
    return Promise.resolve(false);
  },

  // Hooks from the service-worker registration in main.js.
  webRegistered(reg) { web.reg = reg; },
  webReady(apply) { web.apply = apply; set({ state: 'ready', version: null }); },
};
