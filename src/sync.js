// Cloud sync engine. Offline first: the local copy is always the working copy,
// and the cloud is a place to swap rows with your other devices.
//
//  - Local state lives inside the saved progress (progress._sync): every row
//    (src/rowsShape.js), the ids still waiting to upload, this install's
//    device id and who it last synced as. Rows and progress are written
//    together, so they can never drift apart.
//  - A save diffs the progress the screens changed against the last synced
//    view and turns the difference into row writes (queued as "dirty").
//  - Signed in, dirty rows upload in batches (knightly_push keeps the newest
//    write per row), changes from other devices arrive live (realtime), and a
//    catch-up pull runs at start, on reconnect and when the app comes back
//    into view.
//  - The progress object the app holds is one object for the whole session;
//    remote changes are copied into it in place, so screens holding it stay
//    current.
import { platform } from './platform.js';
import { dayKey } from './streak.js';
import { ensureReview } from './review.js';
import { progressToRows, rowsToProgress, diffProgress, applyWrites, mergeRemote, resetWrites, syncedSettings, rowId, stable } from './rowsShape.js';

const AUTH_STORAGE_KEY = 'knightly-auth'; // same as src/cloud.js
const BATCH = 500;
const PAGE = 1000;
const PULL_OVERLAP_MS = 2 * 60 * 1000; // re-read a little before the last pull; applying a row twice is harmless
const RETRY_MS = 30 * 1000;
const SETTINGS_ID = rowId('settings', 'shared');

let state = null;        // { v, deviceId, uid, email, rows, dirty, lastPull, clock }
let view = null;         // the progress object handed to the app
let snapshot = null;     // view as of the last sync point, for diffs
const dirty = new Set();
let supa = null;
let session = null;
let channel = null;
let live = false;
let flushing = null;
let pulling = null;
let flushTimer = null;
let handlers = {};
let status = { phase: 'idle', error: null, lastSync: null };
const listeners = new Set();

const clone = (v) => JSON.parse(JSON.stringify(v));
const online = () => typeof navigator === 'undefined' || navigator.onLine !== false;

export function newId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  return [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
}

// A clock that never runs backwards and is always past anything we've seen,
// so this device's next change beats every write it already knows about.
function tick() {
  state.clock = Math.max(Date.now(), (state.clock || 0) + 1);
  return state.clock;
}

// ── Local ───────────────────────────────────────────────

// Turn whatever was saved on disk into the live progress object.
export function load(raw, defaults) {
  let fresh = false;
  if (raw && raw._sync && raw._sync.v === 1) {
    state = raw._sync;
  } else {
    // First run of a sync-capable version: this install's progress becomes
    // rows owned by a new device id, all waiting to upload.
    const legacy = { ...defaults, ...(raw || {}) };
    delete legacy._sync;
    ensureReview(legacy);
    const deviceId = newId();
    const rows = progressToRows(legacy, deviceId);
    state = { v: 1, deviceId, uid: null, email: null, rows, dirty: Object.keys(rows), lastPull: null, clock: 0 };
    fresh = true;
  }
  dirty.clear();
  for (const id of state.dirty || []) dirty.add(id);
  view = { ...defaults };
  rederive();
  if (fresh) persist();
  return view;
}

function rederive() {
  const fresh = rowsToProgress(state.rows, dayKey());
  for (const k of Object.keys(fresh)) view[k] = fresh[k];
  snapshot = clone(view);
}

function persist() {
  state.dirty = [...dirty];
  emit();
  return platform.setProgress({ ...view, _sync: state });
}

// Record whatever the screens changed since the last sync point. Synchronous
// up to the disk write, so a screen's read-change-save can't interleave.
function capture(progress = view) {
  const writes = diffProgress(snapshot, progress, state.rows, { deviceId: state.deviceId, today: dayKey() });
  if (!writes.length) return false;
  for (const id of applyWrites(state.rows, writes, tick())) dirty.add(id);
  return true;
}

export function commit(progress) {
  capture(progress);
  rederive();
  const done = persist();
  scheduleFlush();
  return done;
}

// Settings -> Reset progress: delete every row except settings, everywhere.
export function reset() {
  capture();
  for (const id of applyWrites(state.rows, resetWrites(state.rows), tick())) dirty.add(id);
  rederive();
  const done = persist();
  scheduleFlush();
  return done;
}

export function commitSettings(settings) {
  if (!state) return;
  const data = syncedSettings(settings);
  const row = state.rows[SETTINGS_ID];
  if (row && !row.deleted && stable(row.data) === stable(data)) return;
  for (const id of applyWrites(state.rows, [{ kind: 'settings', key: 'shared', data }], tick())) dirty.add(id);
  persist();
  scheduleFlush();
}

// Rows from the cloud (a pull page or one realtime change).
function applyRemote(list) {
  if (!list.length) return;
  capture(); // unsaved local edits first, so they aren't mistaken for deletions later
  let changed = false;
  let settings = null;
  for (const r of list) {
    if (!r || !r.kind) continue;
    const remote = { kind: r.kind, key: r.key, data: r.data || {}, deleted: !!r.deleted, client_at: Number(r.client_at) || 0 };
    const id = rowId(remote.kind, remote.key);
    state.clock = Math.max(state.clock || 0, remote.client_at);
    const m = mergeRemote(state.rows[id], remote, tick());
    if (!m.changed) continue;
    state.rows[id] = m.row;
    changed = true;
    if (m.dirty) dirty.add(id); else dirty.delete(id);
    if (remote.kind === 'settings' && !m.row.deleted) settings = m.row.data;
  }
  if (!changed) return;
  rederive();
  persist();
  if (dirty.size) scheduleFlush();
  if (handlers.onRemote) handlers.onRemote({ settings });
}

// ── Status for the Account card ─────────────────────────

export function getStatus() {
  return {
    signedIn: !!session,
    email: session?.user?.email || null,
    lastEmail: state?.email || null,
    pending: dirty.size,
    online: online(),
    live,
    ...status,
  };
}
export function onStatus(cb) { listeners.add(cb); return () => listeners.delete(cb); }
function emit() { const s = getStatus(); for (const cb of listeners) { try { cb(s); } catch { /* a closed view */ } } }
function setPhase(phase, error = null) { status = { ...status, phase, error }; emit(); }

// ── Cloud ───────────────────────────────────────────────

async function client() {
  if (!supa) supa = (await import('./cloud.js')).supa;
  return supa;
}
// For the end-to-end test scripts only (via the debug hook in main.js).
export const debugClient = () => client();

function hasStoredSession() {
  try { return !!localStorage.getItem(AUTH_STORAGE_KEY); } catch { return false; }
}

// Called once at boot, after the first screen is up. ready() must resolve to
// the loaded progress (App.getProgress) before anything here touches state.
export async function start(opts) {
  handlers = opts;
  window.addEventListener('online', () => { emit(); kick(); });
  window.addEventListener('offline', () => emit());
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') kick(); });
  setInterval(() => { if (session && (dirty.size || status.phase === 'error')) kick(); }, RETRY_MS);
  if (!hasStoredSession()) return;
  try {
    const s = (await (await client()).auth.getSession()).data.session;
    if (s) await connect(s);
  } catch (err) { setPhase('error', err.message || String(err)); }
}

export async function signIn(email, password) {
  const c = await client();
  const { data, error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw error;
  await connect(data.session);
}

export async function signOut() {
  const c = await client();
  if (channel) { c.removeChannel(channel); channel = null; }
  live = false;
  session = null;
  await c.auth.signOut();
  setPhase('idle');
}

async function connect(s) {
  await handlers.ready();
  const uid = s.user.id;
  if (state.uid && state.uid !== uid) {
    // Another account was synced here before: start from this account's cloud
    // copy rather than mixing two people's progress.
    state.rows = {};
    dirty.clear();
    state.lastPull = null;
    rederive();
    if (handlers.onRemote) handlers.onRemote({ settings: null });
  }
  if (!state.uid) for (const id of Object.keys(state.rows)) dirty.add(id); // first sign-in: everything goes up
  state.uid = uid;
  state.email = s.user.email;
  session = s;
  persist();
  subscribe(uid);
  await syncNow();
}

function subscribe(uid) {
  if (channel) supa.removeChannel(channel);
  channel = supa.channel(`knightly-${uid}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'knightly_items', filter: `user_id=eq.${uid}` },
      (payload) => { if (payload.new && payload.new.kind) applyRemote([payload.new]); })
    .subscribe((st) => {
      live = st === 'SUBSCRIBED';
      emit();
      if (live) pull(); // catch up on anything missed while disconnected
    });
}

function scheduleFlush() {
  if (!session) return;
  clearTimeout(flushTimer);
  flushTimer = setTimeout(() => flush(), 600);
}

function kick() { if (session) syncNow(); }

export async function syncNow() {
  if (!session) return;
  if (!online()) { setPhase('offline'); return; }
  setPhase('syncing');
  try {
    await flush(true);
    await pull(true);
    await flush(true); // anything a merge produced
    status.lastSync = new Date().toISOString();
    setPhase('idle');
  } catch (err) {
    setPhase(online() ? 'error' : 'offline', online() ? (err.message || String(err)) : null);
  }
}

function flush(rethrow = false) {
  if (!session || !online()) return Promise.resolve();
  if (!flushing) {
    flushing = (async () => {
      while (dirty.size) {
        const ids = [...dirty].slice(0, BATCH);
        const sent = {};
        const items = [];
        for (const id of ids) {
          const r = state.rows[id];
          if (!r) { dirty.delete(id); continue; }
          sent[id] = r.client_at;
          items.push({ kind: r.kind, key: r.key, data: r.data, deleted: r.deleted, client_at: r.client_at });
        }
        if (!items.length) continue;
        const { error } = await supa.rpc('knightly_push', { items });
        if (error) throw error;
        // Only clear rows that didn't change again while the upload ran.
        for (const id of Object.keys(sent)) if (state.rows[id]?.client_at === sent[id]) dirty.delete(id);
        persist();
      }
      if (status.phase === 'error') setPhase('idle');
    })().finally(() => { flushing = null; });
  }
  return rethrow ? flushing : flushing.catch((err) => setPhase(online() ? 'error' : 'offline', online() ? (err.message || String(err)) : null));
}

function pull(rethrow = false) {
  if (!session || !online()) return Promise.resolve();
  if (!pulling) {
    pulling = (async () => {
      const uid = session.user.id;
      const since = state.lastPull ? new Date(Date.parse(state.lastPull) - PULL_OVERLAP_MS).toISOString() : null;
      let newest = state.lastPull;
      for (let from = 0; ; from += PAGE) {
        let q = supa.from('knightly_items').select('kind,key,data,deleted,client_at,updated_at').eq('user_id', uid);
        if (since) q = q.gt('updated_at', since);
        const { data, error } = await q.order('updated_at').range(from, from + PAGE - 1);
        if (error) throw error;
        applyRemote(data);
        for (const r of data) if (!newest || Date.parse(r.updated_at) > Date.parse(newest)) newest = r.updated_at;
        if (data.length < PAGE) break;
      }
      state.lastPull = newest;
      persist();
    })().finally(() => { pulling = null; });
  }
  return rethrow ? pulling : pulling.catch((err) => setPhase(online() ? 'error' : 'offline', online() ? (err.message || String(err)) : null));
}
