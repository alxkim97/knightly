// node --test test/  — row conversion, diffs, merges and a two-device offline run.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { progressToRows, rowsToProgress, diffProgress, applyWrites, mergeRemote, resetWrites, rowId, stable } from '../src/rowsShape.js';
import { computeStreak, addDays } from '../src/streak.js';

const TODAY = '2026-11-22'; // a Sunday
const clone = (v) => JSON.parse(JSON.stringify(v));

function legacy() {
  return {
    puzzles: { solvedIds: ['a1', 'b2'], dailyStreak: 2, lastDailyDate: '2026-11-21' },
    lessons: { completedIds: ['open-italian'] },
    xp: 300,
    record: { wins: 3, losses: 1, draws: 1 },
    history: [
      { date: '2026-11-21T10:00:00.000Z', type: 'lesson', title: 'Forks' },
      { date: '2026-11-20T10:00:00.000Z', type: 'game', mode: 'ai', result: 'win' },
    ],
    course: { done: { 'u1-pawns': { best: 80, plays: 2, first: '2026-11-19T00:00:00.000Z', last: '2026-11-21T00:00:00.000Z' } } },
    streak: { current: 3, best: 5, last: '2026-11-21', freezeWeek: null },
    streakDays: ['2026-11-19', '2026-11-20', '2026-11-21'],
    days: { '2026-11-20': 40, '2026-11-21': 60 },
    puzzleDay: { date: '2026-11-21', n: 4 },
    review: { 'pz:x9': { box: 1, due: '2026-11-24', misses: 1, added: '2026-11-20' } },
    reviewStats: { done: 6, learned: 1 },
  };
}

test('legacy progress survives the trip to rows and back', () => {
  const p = rowsToProgress(progressToRows(legacy(), 'devA'), TODAY);
  assert.equal(p.xp, 300);
  assert.deepEqual(p.record, { wins: 3, losses: 1, draws: 1 });
  assert.deepEqual(p.puzzles.solvedIds.sort(), ['a1', 'b2']);
  assert.equal(p.puzzles.dailyStreak, 2);
  assert.deepEqual(p.lessons.completedIds, ['open-italian']);
  assert.equal(p.course.done['u1-pawns'].best, 80);
  assert.deepEqual(p.review['pz:x9'].due, '2026-11-24');
  assert.deepEqual(p.reviewStats, { done: 6, learned: 1 });
  assert.equal(p.history.length, 2);
  assert.equal(p.history[0].title, 'Forks');
  assert.deepEqual(p.days, { '2026-11-20': 40, '2026-11-21': 60 });
  assert.equal(p.streak.current, 3); // today not done yet, streak still alive
  assert.equal(p.streak.best, 5);
  assert.equal(p.puzzleDay.n, 0); // that count was yesterday's
});

test('a save becomes row writes, counters on this device\'s row for today', () => {
  const rows = progressToRows(legacy(), 'devA');
  const prev = rowsToProgress(rows, TODAY);
  const next = clone(prev);
  next.xp += 25;
  next.days[TODAY] = 25;
  next.record.wins++;
  next.puzzles.solvedIds.push('c3');
  next.puzzleDay = { date: TODAY, n: 1 };
  delete next.review['pz:x9']; next.reviewStats.done++; next.reviewStats.learned++;
  next.streakDays.push(TODAY);
  next.history.unshift({ id: 'e1', date: '2026-11-22T09:00:00.000Z', type: 'puzzle' });
  const writes = diffProgress(prev, next, rows, { deviceId: 'devA', today: TODAY });
  const byId = Object.fromEntries(writes.map((w) => [rowId(w.kind, w.key), w]));
  assert.deepEqual(byId[`count|${TODAY}|devA`].data, { xp: 25, wins: 1, reviews: 1, learned: 1, puzzles: 1, active: true });
  assert.ok(byId['puzzle|c3']);
  assert.equal(byId['review|pz:x9'].deleted, true);
  assert.ok(byId['event|e1']);
  assert.equal(writes.length, 4);

  applyWrites(rows, writes, 100);
  const after = rowsToProgress(rows, TODAY);
  assert.equal(after.xp, 325);
  assert.equal(after.record.wins, 4);
  assert.equal(after.puzzleDay.n, 1);
  assert.equal(after.review['pz:x9'], undefined);
  assert.equal(after.streak.current, 4);
  assert.equal(after.history[0].id, 'e1');
  // Saving the same thing again writes nothing.
  assert.deepEqual(diffProgress(after, clone(after), rows, { deviceId: 'devA', today: TODAY }), []);
});

// A tiny stand-in for knightly_items + knightly_push: keeps the highest client_at.
function server() {
  const rows = {};
  return {
    push(list) { for (const r of list) { const id = rowId(r.kind, r.key); if (!rows[id] || rows[id].client_at <= r.client_at) rows[id] = clone(r); } },
    all: () => Object.values(rows).map(clone),
  };
}
function device(id, srv, startRows = {}) {
  const d = { id, rows: clone(startRows), dirty: new Set(Object.keys(startRows)), clock: 0 };
  d.view = () => rowsToProgress(d.rows, TODAY);
  d.save = (mutate) => {
    const prev = d.view(); const next = clone(prev); mutate(next);
    for (const k of applyWrites(d.rows, diffProgress(prev, next, d.rows, { deviceId: id, today: TODAY }), ++d.clock + d.base)) d.dirty.add(k);
  };
  d.flush = () => { srv.push([...d.dirty].map((k) => d.rows[k])); d.dirty.clear(); };
  d.pull = () => {
    for (const r of srv.all()) {
      const k = rowId(r.kind, r.key);
      const m = mergeRemote(d.rows[k], r, ++d.clock + d.base);
      d.rows[k] = m.row;
      if (m.dirty) d.dirty.add(k);
    }
  };
  d.base = id === 'devA' ? 1000 : 2000; // B's clock is ahead
  return d;
}

test('two devices offline on the same day: nothing is lost, both end up equal', () => {
  const srv = server();
  const A = device('devA', srv, progressToRows(legacy(), 'devA'));
  A.flush();
  const B = device('devB', srv);
  B.pull();
  assert.equal(B.view().xp, 300);

  // Both go offline and play.
  A.save((p) => { p.xp += 10; p.puzzles.solvedIds.push('pa'); p.puzzleDay = { date: TODAY, n: 1 }; p.course.done['u1-pawns'] = { ...p.course.done['u1-pawns'], best: 95, plays: 3 }; });
  B.save((p) => { p.xp += 30; p.record.losses++; p.puzzles.solvedIds.push('pb'); p.puzzleDay = { date: TODAY, n: 1 };
    p.course.done['u1-pawns'] = { ...p.course.done['u1-pawns'], plays: 3, last: '2026-11-22T08:00:00.000Z' };
    p.review['pz:x9'] = { ...p.review['pz:x9'], box: 2, due: '2026-11-29' }; });
  A.save((p) => { p.review['pz:x9'] = { ...p.review['pz:x9'], box: 0, due: '2026-11-23', misses: 2 }; });

  // Back online, in an awkward order.
  B.flush(); A.flush(); A.pull(); B.pull(); A.flush(); B.flush(); A.pull(); B.pull();

  const a = A.view(), b = B.view();
  a.puzzles.solvedIds.sort(); b.puzzles.solvedIds.sort();
  assert.equal(stable(a), stable(b));
  assert.equal(a.xp, 340);
  assert.equal(a.record.losses, 2);
  assert.equal(a.puzzleDay.n, 2);
  assert.deepEqual(a.puzzles.solvedIds.sort(), ['a1', 'b2', 'pa', 'pb']);
  assert.deepEqual(a.course.done['u1-pawns'], { best: 95, plays: 3, first: '2026-11-19T00:00:00.000Z', last: '2026-11-22T08:00:00.000Z' });
  assert.equal(a.review['pz:x9'].box, 2); // B wrote last by the clock: latest change wins
});

test('reset deletes everything except settings, on every device', () => {
  const srv = server();
  const rows = progressToRows(legacy(), 'devA');
  rows['settings|shared'] = { kind: 'settings', key: 'shared', data: { skin: 'brutal' }, deleted: false, client_at: 5 };
  const A = device('devA', srv, rows); A.flush();
  const B = device('devB', srv); B.pull();
  for (const k of applyWrites(A.rows, resetWrites(A.rows), 5000)) A.dirty.add(k);
  A.flush(); B.pull();
  const p = B.view();
  assert.equal(p.xp, 0);
  assert.equal(p.puzzles.solvedIds.length, 0);
  assert.equal(p.streak.current, 0);
  assert.equal(B.rows['settings|shared'].deleted, false);
});

test('an echo of our own write, or an older copy, is ignored', () => {
  const local = { kind: 'review', key: 'r', data: { box: 2 }, deleted: false, client_at: 10 };
  assert.equal(mergeRemote(local, { ...local }, 11).changed, false);
  assert.equal(mergeRemote(local, { ...local, data: { box: 0 }, client_at: 9 }, 11).row.data.box, 2);
  assert.equal(mergeRemote(local, { ...local, data: { box: 0 }, client_at: 12 }, 13).row.data.box, 0);
});

test('streak: one freeze per week covers a single missed day', () => {
  const d = (n) => addDays(TODAY, n);
  assert.equal(computeStreak([d(0), d(-1), d(-2)], TODAY).current, 3);
  assert.equal(computeStreak([d(-1), d(-2)], TODAY).current, 2); // today still open
  const frozen = computeStreak([d(0), d(-2), d(-3)], TODAY);
  assert.equal(frozen.current, 3);
  assert.deepEqual(frozen.frozenDays, [d(-1)]);
  assert.equal(computeStreak([d(-2), d(-3)], TODAY).current, 2); // yesterday frozen, today open
  assert.equal(computeStreak([d(-3)], TODAY).current, 0); // two missed days
  // Two misses in the same week (Mon 16 .. Sun 22): only the first is covered.
  assert.equal(computeStreak(['2026-11-22', '2026-11-20', '2026-11-18', '2026-11-17'], TODAY).current, 2);
  // A miss in each of two weeks: both covered.
  assert.equal(computeStreak(['2026-11-22', '2026-11-20', '2026-11-19', '2026-11-18', '2026-11-17', '2026-11-16', '2026-11-15', '2026-11-13'], TODAY).current, 8);
  assert.equal(computeStreak([], TODAY, 7).best, 7);
});

test('games sync as rows and an update (the review arriving later) replaces the row', () => {
  const rows = progressToRows({ ...legacy(), games: [{ id: 'g1', date: '2026-11-21T10:00:00.000Z', result: 'win', moves: 'e2e4 e7e5' }] }, 'devA');
  const prev = rowsToProgress(rows, TODAY);
  assert.equal(prev.games.length, 1);
  const next = clone(prev);
  next.games[0].summary = { acc: 88 };
  next.games.unshift({ id: 'g2', date: '2026-11-22T09:00:00.000Z', result: 'loss', moves: 'd2d4' });
  const writes = diffProgress(prev, next, rows, { deviceId: 'devA', today: TODAY });
  const games = writes.filter((w) => w.kind === 'game');
  assert.deepEqual(games.map((w) => w.key).sort(), ['g1', 'g2']);
  applyWrites(rows, writes, 50);
  const after = rowsToProgress(rows, TODAY);
  assert.equal(after.games[0].id, 'g2');
  assert.equal(after.games[1].summary.acc, 88);
  assert.deepEqual(diffProgress(after, clone(after), rows, { deviceId: 'devA', today: TODAY }), []);
});
