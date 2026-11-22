import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildReview, explainMove, terminalRow, winPct, fmtEval, moveAccuracy, whiteScore, MATE } from '../src/analysis.js';

test('win chance, accuracy and eval text', () => {
  assert.equal(Math.round(winPct(0)), 50);
  assert.ok(winPct(300) > 70 && winPct(300) < 80);
  assert.ok(Math.abs(winPct(200) + winPct(-200) - 100) < 1e-9);
  assert.ok(moveAccuracy(0) > 99 && moveAccuracy(30) < 30);
  assert.equal(fmtEval(150, 'w'), '+1.5');
  assert.equal(fmtEval(150, 'b'), '−1.5');
  assert.equal(fmtEval(MATE - 30, 'w'), 'mate in 3');
  assert.equal(fmtEval(MATE - 30, 'b'), 'mated in 3');
  assert.equal(whiteScore({ mate: 2 }, 'b'), -(MATE - 20)); // black to move has mate in 2
  assert.equal(whiteScore({ cp: 40 }, 'w'), 40);
});

test('explains a hanging queen and what the best move won', () => {
  const fenBefore = '4k3/8/8/3p4/8/3Q4/8/4K3 w - - 0 1';
  const ex = explainMove({
    fenBefore, color: 'w', played: { uci: 'd3e4', from: 'd3', to: 'e4', ply: 20 },
    before: { score: 150, best: 'd3d5', pv: ['d3d5', 'e8e7'] },
    after: { score: -700, best: 'd5e4', pv: ['d5e4', 'e1e2'] },
  });
  assert.ok(ex.tags.includes('hang'));
  assert.match(ex.main, /queen on e4/);
  assert.match(ex.main, /dxe4/);
  assert.ok(ex.tags.includes('missedWin'));
  assert.match(ex.better, /Qxd5/);
  assert.match(ex.better, /free pawn/);
});

test('explains a missed knight fork', () => {
  const ex = explainMove({
    fenBefore: 'r3k3/8/8/3N4/8/8/8/4K3 w - - 0 1', color: 'w', played: { uci: 'e1e2', from: 'e1', to: 'e2', ply: 30 },
    before: { score: 500, best: 'd5c7', pv: ['d5c7', 'e8d7', 'c7a8'] },
    after: { score: 150, best: 'a8a2', pv: ['a8a2', 'e2d3'] },
  });
  assert.ok(ex.tags.includes('missedFork') || ex.tags.includes('missedWin'), ex.tags.join());
  assert.match(ex.better, /Nc7\+/);
  assert.match(ex.better, /fork|wins/);
});

test('fool\'s mate: the blunder is graded and explained, accuracy follows', () => {
  const ucis = ['f2f3', 'e7e5', 'g2g4', 'd8h4'];
  const fens = [];
  const rows = [
    { score: 20, best: 'e2e4', pv: ['e2e4'] },
    { score: -30, best: 'e7e5', pv: ['e7e5'] },
    { score: -60, best: 'e2e4', pv: ['e2e4'] },
    { score: -(MATE - 10), best: 'd8h4', pv: ['d8h4'] },
  ];
  rows.push(terminalRow('rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3'));
  assert.equal(rows[4].score, -MATE);
  const r = buildReview(ucis, rows);
  assert.equal(r.cls.length, 4);
  assert.equal(r.plies[2].grade, 'x');
  assert.ok(r.plies[2].tags.includes('allowedMate'));
  assert.match(r.plies[2].text, /checkmate/);
  assert.match(r.plies[2].text, /Qh4#/);
  assert.equal(r.plies[2].bestSan, 'e4');
  assert.ok(r.w.acc < r.b.acc);
  assert.equal(r.w.n.x, 1);
  assert.equal(r.w.moves, 2);
  assert.ok(r.w.phase.o[1] > 30); // all of white's lost points came in the opening
});
