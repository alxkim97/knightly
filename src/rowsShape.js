// Progress <-> cloud rows. Pure functions, no I/O (tested in test/rows.test.mjs).
//
// Every piece of progress is its own row in knightly_items, keyed by
// (kind, key), so two devices never overwrite each other's work:
//
//   puzzle   <puzzle id>          solved puzzle (add-only)
//   classic  <lesson id>          finished classic lesson (add-only)
//   lesson   <course lesson id>   { best, plays, first, last }, merged field by field
//   review   <ref>                spaced-review item, latest change wins, deleted = learned
//   event    <id>                 one history entry (never edited)
//   meta     puzzles              { dailyStreak, lastDailyDate }, latest change wins
//   settings shared               look + daily goal, latest change wins
//   count    <date>|<device>      that device's counters for that day
//   count    base|<device>        totals carried over from before sync existed
//
// Counters (XP, wins, puzzles today, reviews ...) are only ever written by the
// device that owns the row, and totals are sums over every device's rows, so
// XP earned on two offline devices on the same day is never lost.
//
// A row in memory: { kind, key, data, deleted, client_at } where client_at is
// the client's write time in ms. The server keeps the write with the highest
// client_at (knightly_push in SUPABASE-SETUP.md).
import { computeStreak } from './streak.js';

export const DEVICE_ONLY_SETTINGS = ['sound', 'miniAlwaysOnTop'];
export const HISTORY_SHOWN = 50;

export const rowId = (kind, key) => `${kind}|${key}`;
export const eventKey = (e) => String(e.id || e.date);

// JSON with sorted keys, so equal objects compare equal.
export function stable(v) {
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v).sort().filter((k) => v[k] !== undefined).map((k) => `${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}`;
  return JSON.stringify(v);
}
const clone = (v) => JSON.parse(JSON.stringify(v));

export function syncedSettings(settings) {
  const out = { ...settings };
  for (const k of DEVICE_ONLY_SETTINGS) delete out[k];
  return out;
}

const puzzleMeta = (p) => {
  const m = {};
  if (p.puzzles?.dailyStreak != null) m.dailyStreak = p.puzzles.dailyStreak;
  if (p.puzzles?.lastDailyDate != null) m.lastDailyDate = p.puzzles.lastDailyDate;
  return m;
};

// ── Local progress (pre-sync) -> rows. Run once per install. ────────────
// client_at = 1 so anything already in the cloud wins over an imported copy
// (lessons still merge, and counters belong to this device alone).
export function progressToRows(p, deviceId, at = 1) {
  const rows = {};
  const put = (kind, key, data) => { rows[rowId(kind, key)] = { kind, key: String(key), data, deleted: false, client_at: at }; };
  for (const id of p.puzzles?.solvedIds || []) put('puzzle', id, {});
  const meta = puzzleMeta(p);
  if (Object.keys(meta).length) put('meta', 'puzzles', meta);
  for (const id of p.lessons?.completedIds || []) put('classic', id, {});
  for (const [id, v] of Object.entries(p.course?.done || {})) put('lesson', id, clone(v));
  for (const [ref, v] of Object.entries(p.review || {})) put('review', ref, clone(v));
  for (const e of p.history || []) put('event', eventKey(e), clone(e));

  const counts = {};
  const bump = (day, field, n) => {
    if (!n) return;
    const c = (counts[day] = counts[day] || {});
    c[field] = field === 'active' ? true : (c[field] || 0) + n;
  };
  let dayXp = 0;
  for (const [day, xp] of Object.entries(p.days || {})) { bump(day, 'xp', xp); dayXp += xp || 0; }
  for (const day of p.streakDays || []) bump(day, 'active', 1);
  if (p.puzzleDay?.date) bump(p.puzzleDay.date, 'puzzles', p.puzzleDay.n || 0);
  bump('base', 'xp', Math.max(0, (p.xp || 0) - dayXp));
  bump('base', 'wins', p.record?.wins || 0);
  bump('base', 'losses', p.record?.losses || 0);
  bump('base', 'draws', p.record?.draws || 0);
  bump('base', 'reviews', p.reviewStats?.done || 0);
  bump('base', 'learned', p.reviewStats?.learned || 0);
  bump('base', 'best', p.streak?.best || 0);
  for (const [day, data] of Object.entries(counts)) put('count', `${day}|${deviceId}`, data);
  return rows;
}

// ── Rows -> the progress object the views use. ──────────────────────────
export function rowsToProgress(rows, today) {
  const p = {
    puzzles: { solvedIds: [] },
    lessons: { completedIds: [] },
    xp: 0,
    record: { wins: 0, losses: 0, draws: 0 },
    history: [],
    course: { done: {} },
    streak: null,
    streakDays: [],
    days: {},
    puzzleDay: { date: today, n: 0 },
    review: {},
    reviewStats: { done: 0, learned: 0 },
  };
  const active = new Set();
  let bestBase = 0;
  for (const r of Object.values(rows)) {
    if (r.deleted) continue;
    const d = r.data || {};
    switch (r.kind) {
      case 'puzzle': p.puzzles.solvedIds.push(r.key); break;
      case 'meta': if (r.key === 'puzzles') Object.assign(p.puzzles, d); break;
      case 'classic': p.lessons.completedIds.push(r.key); break;
      case 'lesson': p.course.done[r.key] = clone(d); break;
      case 'review': p.review[r.key] = clone(d); break;
      case 'event': p.history.push(clone(d)); break;
      case 'count': {
        const day = r.key.split('|')[0];
        p.xp += d.xp || 0;
        p.record.wins += d.wins || 0;
        p.record.losses += d.losses || 0;
        p.record.draws += d.draws || 0;
        p.reviewStats.done += d.reviews || 0;
        p.reviewStats.learned += d.learned || 0;
        bestBase = Math.max(bestBase, d.best || 0);
        if (day !== 'base') {
          if (d.xp) p.days[day] = (p.days[day] || 0) + d.xp;
          if (d.active) active.add(day);
          if (day === today) p.puzzleDay.n += d.puzzles || 0;
        }
        break;
      }
      default: break;
    }
  }
  p.history.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  p.history = p.history.slice(0, HISTORY_SHOWN);
  p.streakDays = [...active].sort();
  p.streak = computeStreak(p.streakDays, today, bestBase);
  return p;
}

// ── What changed between two progress objects, as row writes. ───────────
// prev is the last synced view, next is what a screen just saved. Counters
// become increments on this device's own row for today.
export function diffProgress(prev, next, rows, { deviceId, today }) {
  const writes = new Map();
  const set = (kind, key, data, deleted = false) => writes.set(rowId(kind, String(key)), { kind, key: String(key), data, deleted });

  const prevSolved = new Set((prev.puzzles?.solvedIds || []).map(String));
  for (const id of next.puzzles?.solvedIds || []) if (!prevSolved.has(String(id))) set('puzzle', id, {});
  const meta = puzzleMeta(next);
  if (stable(meta) !== stable(puzzleMeta(prev)) && Object.keys(meta).length) set('meta', 'puzzles', meta);

  const prevClassic = new Set(prev.lessons?.completedIds || []);
  for (const id of next.lessons?.completedIds || []) if (!prevClassic.has(id)) set('classic', id, {});

  const prevDone = prev.course?.done || {};
  for (const [id, v] of Object.entries(next.course?.done || {})) if (stable(v) !== stable(prevDone[id])) set('lesson', id, clone(v));

  const prevReview = prev.review || {};
  const nextReview = next.review || {};
  for (const [ref, v] of Object.entries(nextReview)) if (stable(v) !== stable(prevReview[ref])) set('review', ref, clone(v));
  for (const ref of Object.keys(prevReview)) if (!(ref in nextReview)) set('review', ref, {}, true);

  const prevEvents = new Set((prev.history || []).map(eventKey));
  for (const e of next.history || []) {
    const k = eventKey(e);
    if (!prevEvents.has(k) && !rows[rowId('event', k)]) set('event', k, clone(e));
  }

  // Counters. Only increases count: a screen never takes XP away, and a
  // reset goes through resetWrites() instead.
  const inc = (a, b) => Math.max(0, (a || 0) - (b || 0));
  const bumps = {};
  const bump = (day, field, n) => {
    if (!n) return;
    const b = (bumps[day] = bumps[day] || {});
    b[field] = field === 'active' ? true : (b[field] || 0) + n;
  };
  bump(today, 'xp', inc(next.xp, prev.xp));
  bump(today, 'wins', inc(next.record?.wins, prev.record?.wins));
  bump(today, 'losses', inc(next.record?.losses, prev.record?.losses));
  bump(today, 'draws', inc(next.record?.draws, prev.record?.draws));
  bump(today, 'reviews', inc(next.reviewStats?.done, prev.reviewStats?.done));
  bump(today, 'learned', inc(next.reviewStats?.learned, prev.reviewStats?.learned));
  const nToday = (p) => (p.puzzleDay?.date === today ? p.puzzleDay.n || 0 : 0);
  bump(today, 'puzzles', inc(nToday(next), nToday(prev)));
  const prevDays = new Set(prev.streakDays || []);
  for (const day of next.streakDays || []) if (!prevDays.has(day)) bump(day, 'active', 1);
  for (const [day, b] of Object.entries(bumps)) {
    const key = `${day}|${deviceId}`;
    const own = rows[rowId('count', key)];
    const data = own && !own.deleted ? clone(own.data) : {};
    for (const [f, n] of Object.entries(b)) data[f] = f === 'active' ? true : (data[f] || 0) + n;
    set('count', key, data);
  }
  return [...writes.values()];
}

// Put writes into the local row map; returns the ids now needing a push.
export function applyWrites(rows, writes, now) {
  return writes.map((w) => {
    const id = rowId(w.kind, w.key);
    rows[id] = { kind: w.kind, key: w.key, data: w.data, deleted: !!w.deleted, client_at: now };
    return id;
  });
}

// Delete everything except settings (Settings -> Reset progress).
export function resetWrites(rows) {
  return Object.values(rows)
    .filter((r) => !r.deleted && r.kind !== 'settings')
    .map((r) => ({ kind: r.kind, key: r.key, data: {}, deleted: true }));
}

// ── Merging a row that arrived from the cloud. ──────────────────────────
// Returns { row, changed, dirty }: the row to keep, whether local state
// changed, and whether the kept row must be pushed back (a lesson merge that
// produced something neither side had).
export function mergeLesson(a = {}, b = {}) {
  const pick = (x, y, fn) => (x == null ? y : y == null ? x : fn(x, y));
  return {
    best: pick(a.best, b.best, Math.max),
    plays: pick(a.plays, b.plays, Math.max),
    first: pick(a.first, b.first, (x, y) => (x < y ? x : y)),
    last: pick(a.last, b.last, (x, y) => (x > y ? x : y)),
  };
}

export function mergeRemote(local, remote, now) {
  if (!local) return { row: remote, changed: true, dirty: false };
  if ((remote.client_at || 0) <= (local.client_at || 0)) return { row: local, changed: false, dirty: false };
  if (remote.kind === 'lesson' && !remote.deleted && !local.deleted) {
    const merged = mergeLesson(local.data, remote.data);
    if (stable(merged) !== stable(remote.data)) // Stamp it after the remote write, even if this device's clock is behind,
    // so the server keeps the merged copy.
    return { row: { ...remote, data: merged, client_at: Math.max(now, (remote.client_at || 0) + 1) }, changed: true, dirty: true };
  }
  return { row: remote, changed: true, dirty: false };
}
