import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildInsights } from '../src/insights.js';

const game = (i, o = {}) => ({
  id: 'g' + i, date: `2026-11-${String(10 + i).padStart(2, '0')}T10:00:00.000Z`, mode: 'ai', difficulty: 'beginner', color: 'w', result: 'win', how: 'checkmate', plies: 50, open: 'e4',
  tm: Array.from({ length: 25 }, () => 8),
  summary: { acc: 80, accOpp: 90, n: { b: 10, g: 10, i: 3, m: 1, x: 1 }, phase: { o: [10, 10], m: [10, 20], e: [5, 5] }, tags: {}, peak: 60, low: 40, moments: [] },
  ...o,
});

test('too few games: ask for more', () => {
  const r = buildInsights([game(1), game(2)]);
  assert.equal(r.suggestions[0].id, 'few');
});

test('hanging pieces, a weak middlegame and quick moves are each called out', () => {
  const games = Array.from({ length: 6 }, (_, i) => game(i + 1, {
    result: i % 2 ? 'loss' : 'win',
    tm: Array.from({ length: 25 }, (_, k) => (k % 2 ? 1.5 : 9)),
    summary: { acc: 70, accOpp: 90, n: { b: 8, g: 8, i: 4, m: 3, x: 2 }, phase: { o: [10, 8], m: [12, 80], e: [3, 6] }, tags: { hang: 2 }, peak: 60, low: 20,
      moments: Array.from({ length: 12 }, (_, k) => ({ ply: k * 4 + 2, g: 'm' })) },
  }));
  const r = buildInsights(games);
  const ids = r.suggestions.map((s) => s.id);
  assert.ok(ids.includes('hang'), ids.join());
  assert.ok(ids.includes('phase'));
  assert.equal(r.avgAcc, 70);
  assert.equal(r.record.w + r.record.l, 6);
  assert.equal(r.openings[0].n, 6);
  assert.match(r.suggestions.find((s) => s.id === 'phase').title, /middlegame/);
});

test('level advice follows your results', () => {
  const winning = Array.from({ length: 6 }, (_, i) => game(i + 1));
  assert.ok(buildInsights(winning).suggestions.some((s) => s.id === 'up' && /Easy/.test(s.title)));
  const losing = Array.from({ length: 6 }, (_, i) => game(i + 1, { difficulty: 'hard', result: 'loss' }));
  assert.ok(buildInsights(losing).suggestions.some((s) => s.id === 'down' && /Advanced/.test(s.title)));
});
