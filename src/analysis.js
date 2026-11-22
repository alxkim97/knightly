// Game review: score every position with Stockfish, grade each move by how much
// of your winning chance it cost, and explain the bad ones in plain words.
//
// Two halves:
//   - buildReview(): pure. Takes the moves + one engine row per position and
//     returns grades, accuracy and explanations (tested in test/analysis.test.mjs).
//   - startAnalysis(): runs the engine in a worker over the whole game. It is a
//     module-level job, so it keeps going (and the result still gets saved)
//     if you leave the game screen while it works.
import { Chess } from 'chess.js';

export const MATE = 10000;
const VAL = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
export const NAME = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };

// Move grades (win-chance lost, in points of win%).
export const GRADES = {
  b: { label: 'Best', sym: '', tone: 'good' },
  g: { label: 'Good', sym: '', tone: 'good' },
  i: { label: 'Inaccuracy', sym: '?!', tone: 'warn' },
  m: { label: 'Mistake', sym: '?', tone: 'warn' },
  x: { label: 'Blunder', sym: '??', tone: 'bad' },
};
const gradeOf = (loss) => (loss < 2 ? 'b' : loss < 10 ? 'g' : loss < 20 ? 'i' : loss < 30 ? 'm' : 'x');

// ── Scores ──────────────────────────────────────────────
// Engine rows are { score, best, pv } with score in centipawns from WHITE's
// side (mate = +-(MATE - 10 * moves)).
export function whiteScore(info, turn) {
  const s = info.mate != null ? Math.sign(info.mate) * (MATE - Math.abs(info.mate) * 10) : (info.cp || 0);
  return turn === 'w' ? s : -s;
}
export const winPct = (cp) => 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * Math.max(-1000, Math.min(1000, cp)))) - 1);
const forMover = (score, color) => (color === 'w' ? score : -score);
export const moverWin = (score, color) => winPct(forMover(score, color));
export const moveAccuracy = (loss) => Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * loss) - 3.1669));

export function fmtEval(score, color) {
  const s = forMover(score, color);
  if (Math.abs(s) >= MATE - 500) { const n = Math.round((MATE - Math.abs(s)) / 10); return s > 0 ? `mate in ${n || 1}` : `mated in ${n || 1}`; }
  const p = s / 100;
  return `${p > 0 ? '+' : p < 0 ? '−' : ''}${Math.abs(p).toFixed(1)}`;
}

// ── Chess helpers ───────────────────────────────────────
const materialOf = (chess, color) => chess.board().flat().reduce((a, c) => a + (c && c.color === color ? VAL[c.type] : 0), 0);
const netMaterial = (chess, color) => materialOf(chess, color) - materialOf(chess, color === 'w' ? 'b' : 'w');
const opp = (c) => (c === 'w' ? 'b' : 'w');
const uciParts = (u) => ({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u.length > 4 ? u[4] : undefined });
const nonPawnMaterial = (chess) => chess.board().flat().reduce((a, c) => a + (c && c.type !== 'p' && c.type !== 'k' ? VAL[c.type] : 0), 0);

// Play a list of UCI moves from a FEN. Stops quietly at the first illegal one.
function playLine(fen, ucis) {
  const chess = new Chess(fen);
  const moves = [];
  for (const u of ucis) {
    try { moves.push(chess.move(uciParts(u))); } catch { break; }
  }
  return { chess, moves };
}
const withTurn = (fen, color) => { const f = fen.split(' '); f[1] = color; f[3] = '-'; return f.join(' '); };

// Pieces of `color` that the other side could win by capturing right now.
function threatened(fen, color) {
  const out = [];
  let chess;
  try { chess = new Chess(withTurn(fen, opp(color))); } catch { return out; }
  for (const row of chess.board()) for (const c of row) {
    if (!c || c.color !== color || c.type === 'k' || c.type === 'p') continue;
    const attackers = chess.attackers(c.square, opp(color));
    if (!attackers.length) continue;
    const defended = chess.attackers(c.square, color).length > 0;
    const cheapest = Math.min(...attackers.map((s) => VAL[chess.get(s).type] || 99));
    if (!defended || cheapest < VAL[c.type]) out.push({ square: c.square, type: c.type, attacker: chess.get(attackers[0]).type, attackerSquare: attackers[0] });
  }
  return out;
}

// Enemy pieces a piece would attack from its new square if it were your turn again.
function forkTargets(fenAfter, color, square) {
  try {
    const chess = new Chess(withTurn(fenAfter, color));
    const me = chess.get(square);
    if (!me) return [];
    const seen = new Map();
    for (const m of chess.moves({ square, verbose: true })) {
      if (!m.captured) continue;
      const t = chess.get(m.to);
      const defended = chess.attackers(m.to, opp(color)).length > 0;
      if (t.type === 'k' || !defended || VAL[t.type] > VAL[me.type]) seen.set(m.to, t.type);
    }
    // A check is a target too: the king has to answer it.
    for (const row of chess.board()) for (const c of row) {
      if (c && c.type === 'k' && c.color === opp(color) && chess.attackers(c.square, color).includes(square)) seen.set(c.square, 'k');
    }
    return [...seen].map(([sq, type]) => ({ sq, type }));
  } catch { return []; }
}

const sqPhrase = (type, sq) => `${NAME[type]} on ${sq}`;
const pts = (n) => `${n} point${n === 1 ? '' : 's'}`;

// ── Explanations ────────────────────────────────────────
// Everything the text needs is derived from the position and the engine's own
// lines; no guessing. Returns { main, better, tags }.
export function explainMove({ fenBefore, played, color, before, after, bestSan: bestSanIn }) {
  const tags = [];
  const winB = moverWin(before.score, color);
  const winA = moverWin(after.score, color);
  const sB = forMover(before.score, color);
  const sA = forMover(after.score, color);
  const bestUci = before.best;
  const bestMove = (() => { try { return bestUci ? new Chess(fenBefore).move(uciParts(bestUci)) : null; } catch { return null; } })();
  const bestSan = bestSanIn || (bestMove && bestMove.san) || '';
  const start = new Chess(fenBefore);
  const base = netMaterial(start, color);

  // Material over the next few plies, for the move played and for the best move.
  const evenPly = (arr, max) => arr.slice(0, Math.min(max, arr.length - (arr.length % 2)));
  const playedLine = playLine(fenBefore, [played.uci, ...evenPly(after.pv || [], 4)]);
  const deltaPlayed = netMaterial(playedLine.chess, color) - base;
  const bestLine = bestUci ? playLine(fenBefore, [bestUci, ...evenPly((before.pv || []).slice(1), 4)]) : null;
  const deltaBest = bestLine ? netMaterial(bestLine.chess, color) - base : 0;
  const swing = deltaBest - deltaPlayed;

  const threats = threatened(fenBefore, color);
  const afterPlayed = new Chess(fenBefore);
  afterPlayed.move(uciParts(played.uci));
  const fenAfterPlayed = afterPlayed.fen();
  const replyUci = (after.pv || [])[0];
  let reply = null;
  try { reply = replyUci ? new Chess(fenAfterPlayed).move(uciParts(replyUci)) : null; } catch { reply = null; }

  // 1. What went wrong with the move played.
  let main = '';
  if (sA <= -(MATE - 500) && sB > -(MATE - 500)) {
    tags.push('allowedMate');
    main = `This lets your opponent force checkmate${reply ? `, starting with ${reply.san}` : ''}.`;
  } else if (sB >= MATE - 500 && sA < MATE - 500) {
    tags.push('missedMate');
    main = 'You had a forced checkmate here and this move lets it slip away.';
  } else if (deltaPlayed <= -2 && swing >= 2) {
    const left = threats.find((t) => t.square !== played.from && reply && t.square === reply.to);
    if (reply && reply.captured) {
      const grabbed = reply.captured;
      const movedPieceTaken = reply.to === played.to;
      const defended = new Chess(fenAfterPlayed).attackers(reply.to, color).length > 0;
      if (left) { tags.push('hang'); main = `Your ${sqPhrase(left.type, left.square)} was under attack and this move didn't deal with it. ${reply.san} wins it.`; }
      else if (movedPieceTaken && !defended) { tags.push('hang'); main = `This leaves your ${NAME[grabbed]} on ${reply.to} with no protection: ${reply.san} simply takes it.`; }
      else if (movedPieceTaken) { tags.push('hang'); main = `Your ${NAME[grabbed]} on ${reply.to} can be taken by a cheaper piece: ${reply.san} wins ${pts(Math.abs(deltaPlayed))} of material.`; }
      else { tags.push('hang'); main = `After this, ${reply.san} wins your ${NAME[grabbed]}.`; }
    } else {
      tags.push('tactic');
      main = `This walks into a tactic: within a couple of moves your opponent wins ${pts(Math.abs(deltaPlayed))} of material.`;
    }
  } else if (winB >= 75 && winA < 62) {
    tags.push('throw');
    main = 'You were clearly better here, and this move gives much of that advantage away.';
  } else if (sB > -150 && sA <= -150) {
    tags.push('slip');
    main = 'This hands your opponent a real advantage.';
  } else if (Math.abs(sB) < 120 && sA < sB - 60) {
    tags.push('pos');
    main = 'A quieter mistake: the position was roughly level and this move lets your opponent take the initiative.';
  } else {
    tags.push('pos');
    main = 'This move gives up part of your advantage.';
  }

  // 2. What the best move did instead.
  let better = '';
  if (bestMove) {
    const after1 = new Chess(fenBefore); after1.move(uciParts(bestUci));
    const bsan = bestMove.san;
    const forks = forkTargets(after1.fen(), color, bestMove.to);
    if (after1.isCheckmate()) { tags.push('canMate'); better = `${bsan} was checkmate.`; }
    else if (sB >= MATE - 500) { tags.push('canMate'); better = `${bsan} starts a forced checkmate.`; }
    else if (bestMove.captured && deltaBest > 0 && (swing >= 2 || deltaBest >= 1)) {
      const free = chessAttackers(after1.fen(), bestMove.to, opp(color)) === 0;
      tags.push('missedWin');
      better = free
        ? `${bsan} wins a free ${NAME[bestMove.captured]} on ${bestMove.to}: nothing can take it back.`
        : `${bsan} takes the ${NAME[bestMove.captured]} on ${bestMove.to}, and after the trades you come out ${pts(deltaBest)} ahead.`;
    } else if (forks.length >= 2) {
      tags.push('missedFork');
      const [a, b] = forks;
      better = `${bsan} forks your opponent's ${sqPhrase(a.type, a.sq)} and ${sqPhrase(b.type, b.sq)}: they can only save one.`;
    } else if (deltaBest >= 2 && swing >= 2) {
      tags.push('missedWin');
      better = `${bsan} wins ${pts(deltaBest)} of material within a few moves.`;
    } else if (threats.length && (bestMove.from === threats[0].square || (bestMove.captured && bestMove.to === threats[0].attackerSquare))) {
      tags.push('save');
      const t = threats[0];
      better = bestMove.from === t.square
        ? `${bsan} moves your ${sqPhrase(t.type, t.square)} to safety. A ${NAME[t.attacker]} was attacking it.`
        : `${bsan} removes the ${NAME[t.attacker]} that was attacking your ${sqPhrase(t.type, t.square)}.`;
    } else if (bestMove.san === 'O-O' || bestMove.san === 'O-O-O') {
      better = `${bsan} tucks your king away and brings a rook into play.`;
    } else if (after1.inCheck()) {
      better = `${bsan} gives check and keeps the initiative.`;
    } else if (played.ply < 14 && 'nb'.includes(bestMove.piece) && /[18]$/.test(bestMove.from)) {
      better = `${bsan} brings out a ${NAME[bestMove.piece]}. In the opening, develop your pieces before moving anything twice.`;
    } else if (sA < sB - 30) {
      better = `${bsan} keeps the position at ${fmtEval(before.score, color)} instead of ${fmtEval(after.score, color)}.`;
    } else {
      better = `${bsan} was the strongest move here.`;
    }
  }
  return { main, better, tags, bestSan };
}

function chessAttackers(fen, square, byColor) {
  try { return new Chess(withTurn(fen, byColor)).attackers(square, byColor).length; } catch { return 0; }
}

// ── The whole review ────────────────────────────────────
export function terminalRow(fen) {
  const c = new Chess(fen);
  if (c.isCheckmate()) return { score: c.turn() === 'w' ? -MATE : MATE, best: null, pv: [] };
  if (c.isGameOver()) return { score: 0, best: null, pv: [] };
  return null;
}

const phaseOf = (ply, fen) => (ply < 20 ? 'o' : nonPawnMaterial(new Chess(fen)) <= 24 ? 'e' : 'm');

// ucis: every move of the game; rows: one engine row per position (ucis.length + 1).
export function buildReview(ucis, rows) {
  const game = new Chess();
  const fens = [game.fen()];
  const moves = [];
  for (const u of ucis) { moves.push(game.move(uciParts(u))); fens.push(game.fen()); }
  const plies = [];
  const sides = { w: { acc: [], n: { b: 0, g: 0, i: 0, m: 0, x: 0 }, phase: { o: [0, 0], m: [0, 0], e: [0, 0] }, tags: {} }, b: { acc: [], n: { b: 0, g: 0, i: 0, m: 0, x: 0 }, phase: { o: [0, 0], m: [0, 0], e: [0, 0] }, tags: {} } };
  let cls = '';
  for (let i = 0; i < moves.length; i++) {
    const m = moves[i];
    const color = m.color;
    const before = rows[i];
    const after = rows[i + 1];
    const loss = Math.max(0, moverWin(before.score, color) - moverWin(after.score, color));
    const forced = new Chess(fens[i]).moves().length === 1;
    let g = forced || before.best === ucis[i] ? 'b' : gradeOf(loss);
    cls += g;
    const entry = {
      ply: i, color, san: m.san, uci: ucis[i], grade: g, loss: Math.round(loss * 10) / 10,
      evBefore: fmtEval(before.score, color), evAfter: fmtEval(after.score, color),
      bestUci: before.best, scoreBefore: before.score, scoreAfter: after.score,
    };
    if (g === 'i' || g === 'm' || g === 'x') {
      const ex = explainMove({ fenBefore: fens[i], played: { uci: ucis[i], from: m.from, to: m.to, ply: i }, color, before, after });
      entry.bestSan = ex.bestSan; entry.text = ex.main; entry.better = ex.better; entry.tags = ex.tags;
      for (const t of ex.tags) sides[color].tags[t] = (sides[color].tags[t] || 0) + 1;
    } else if (before.best && before.best !== ucis[i]) {
      try { entry.bestSan = new Chess(fens[i]).move(uciParts(before.best)).san; } catch { /* ignore */ }
    }
    plies.push(entry);
    const s = sides[color];
    s.acc.push(moveAccuracy(loss));
    s.n[g]++;
    const ph = phaseOf(i, fens[i]);
    s.phase[ph][0]++; s.phase[ph][1] += loss;
  }
  const side = (c) => {
    const s = sides[c];
    return {
      acc: s.acc.length ? Math.round(s.acc.reduce((a, b) => a + b, 0) / s.acc.length) : null,
      n: s.n, phase: s.phase, tags: s.tags, moves: s.acc.length,
    };
  };
  return { plies, cls, w: side('w'), b: side('b'), fens };
}

// ── Engine job ──────────────────────────────────────────
const jobs = new Map();

export function getAnalysisJob(id) { return jobs.get(id) || null; }

// moveUcis: the game so far. Resolves to buildReview()'s result.
export function startAnalysis(id, ucis, { ms = 220 } = {}) {
  const old = jobs.get(id);
  if (old) return old;
  const listeners = new Set();
  const job = {
    id, progress: 0, done: false, error: null, result: null,
    onProgress(cb) { listeners.add(cb); cb(job.progress); return () => listeners.delete(cb); },
  };
  job.promise = (async () => {
    const { StockfishAI } = await import('./ai.js');
    const fens = [];
    const chess = new Chess();
    fens.push(chess.fen());
    for (const u of ucis) { chess.move(uciParts(u)); fens.push(chess.fen()); }
    const ai = new StockfishAI();
    try {
      await ai.setFullStrength();
      const rows = [];
      for (let i = 0; i < fens.length; i++) {
        rows.push(terminalRow(fens[i]) || await analyseRow(ai, fens[i], ms));
        job.progress = (i + 1) / fens.length;
        for (const cb of listeners) cb(job.progress);
      }
      job.result = buildReview(ucis, rows);
      job.done = true;
      return job.result;
    } finally { ai.terminate(); }
  })().catch((err) => { job.error = err; job.done = true; throw err; });
  jobs.set(id, job);
  job.promise.catch(() => { /* surfaced through job.error */ });
  return job;
}

async function analyseRow(ai, fen, ms) {
  const turn = fen.split(' ')[1];
  const info = await ai.analyse(fen, ms);
  return { score: whiteScore(info, turn), best: info.best || null, pv: info.pv || [] };
}

// A saved game's review from what we stored (moves + grades + texts).
export function storedReview(game) {
  const ucis = (game.moves || '').split(' ').filter(Boolean);
  const chess = new Chess();
  const fens = [chess.fen()];
  const sans = [];
  for (const u of ucis) { try { sans.push(chess.move(uciParts(u)).san); fens.push(chess.fen()); } catch { break; } }
  return { ucis, fens, sans };
}
