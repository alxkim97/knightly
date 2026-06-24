// Generates a small offline puzzle bank by brute force: random legal
// positions are searched move-by-move with chess.js for a checkmate-in-one,
// so every puzzle here is verified correct by construction rather than
// hand-typed (and hand-error-prone) FEN/solution pairs. This is a fallback
// bank used only if the live Lichess fetch (scripts/fetch-puzzles.js) can't
// collect enough puzzles (e.g. while rate-limited).
const fs = require('fs');
const path = require('path');
const { Chess } = require('chess.js');

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const rnd = (n) => Math.floor(Math.random() * n);
const randSquare = () => FILES[rnd(8)] + (rnd(8) + 1);

function adjacent(a, b) {
  const fa = FILES.indexOf(a[0]), ra = parseInt(a[1], 10);
  const fb = FILES.indexOf(b[0]), rb = parseInt(b[1], 10);
  return Math.abs(fa - fb) <= 1 && Math.abs(ra - rb) <= 1;
}

function buildFen(placements) {
  const grid = Array.from({ length: 8 }, () => Array(8).fill(null));
  for (const [square, piece] of placements) {
    const file = FILES.indexOf(square[0]);
    const rank = parseInt(square[1], 10);
    grid[8 - rank][file] = piece;
  }
  const rows = grid.map((row) => {
    let out = '';
    let empties = 0;
    for (const cell of row) {
      if (!cell) { empties++; continue; }
      if (empties) { out += empties; empties = 0; }
      out += cell;
    }
    if (empties) out += empties;
    return out;
  });
  return rows.join('/') + ' w - - 0 1';
}

function findMateInOne(game) {
  const moves = game.moves({ verbose: true });
  for (const m of moves) {
    game.move(m.san);
    const mates = game.isCheckmate();
    game.undo();
    if (mates) return m;
  }
  return null;
}

function tryRandomKQK() {
  const wk = randSquare();
  let bk = randSquare();
  if (bk === wk || adjacent(bk, wk)) return null;
  let q = randSquare();
  if (q === wk || q === bk) return null;

  let fen;
  try { fen = buildFen([[wk, 'K'], [bk, 'k'], [q, 'Q']]); } catch { return null; }
  const game = new Chess();
  try { game.load(fen); } catch { return null; }
  if (game.isCheckmate() || game.isStalemate() || game.isCheck()) return null;

  const mate = findMateInOne(game);
  if (!mate) return null;
  return { fen, mate, kind: 'queen' };
}

function tryRandomKRK() {
  const wk = randSquare();
  let bk = randSquare();
  if (bk === wk || adjacent(bk, wk)) return null;
  let r = randSquare();
  if (r === wk || r === bk) return null;

  let fen;
  try { fen = buildFen([[wk, 'K'], [bk, 'k'], [r, 'R']]); } catch { return null; }
  const game = new Chess();
  try { game.load(fen); } catch { return null; }
  if (game.isCheckmate() || game.isStalemate() || game.isCheck()) return null;

  const mate = findMateInOne(game);
  if (!mate) return null;
  return { fen, mate, kind: 'rook' };
}

function tryBoxedBackRank() {
  // Black king boxed on the 8th rank behind its own pawns; White has a
  // queen or rook plus king somewhere else on the board.
  const kingFile = FILES[1 + rnd(6)]; // avoid a/h corners for pawn shield room
  const kingFileIdx = FILES.indexOf(kingFile);
  const bk = kingFile + '8';
  const pawnSquares = [kingFileIdx - 1, kingFileIdx, kingFileIdx + 1]
    .filter((i) => i >= 0 && i < 8)
    .map((i) => FILES[i] + '7');

  const usedSquares = new Set([bk, ...pawnSquares]);
  let wk = randSquare();
  while (usedSquares.has(wk) || wk[1] === '8') wk = randSquare();
  usedSquares.add(wk);
  let attacker = randSquare();
  while (usedSquares.has(attacker)) attacker = randSquare();

  const useQueen = Math.random() < 0.5;
  const placements = [[bk, 'k'], [wk, 'K'], [attacker, useQueen ? 'Q' : 'R'], ...pawnSquares.map((s) => [s, 'p'])];
  let fen;
  try { fen = buildFen(placements); } catch { return null; }
  const game = new Chess();
  try { game.load(fen); } catch { return null; }
  if (game.isCheckmate() || game.isStalemate() || game.isCheck()) return null;

  const mate = findMateInOne(game);
  if (!mate) return null;
  return { fen, mate, kind: useQueen ? 'queen-box' : 'rook-box' };
}

function collect(generator, attempts, max) {
  const out = [];
  for (let i = 0; i < attempts && out.length < max; i++) {
    const r = generator();
    if (r) out.push(r);
  }
  return out;
}

function classify(kind) {
  if (kind === 'queen') return Math.random() < 0.6 ? 'beginner' : 'easy';
  if (kind === 'queen-box') return 'easy';
  if (kind === 'rook-box') return 'intermediate';
  if (kind === 'rook') return Math.random() < 0.5 ? 'advanced' : 'hard';
  return 'intermediate';
}

function themesFor(kind) {
  if (kind === 'queen' || kind === 'rook') return ['mateIn1', 'endgame'];
  if (kind === 'queen-box' || kind === 'rook-box') return ['mateIn1', 'backRankMate'];
  return ['mateIn1'];
}

function main() {
  const found = [
    ...collect(tryRandomKQK, 4000, 16),
    ...collect(tryRandomKRK, 6000, 10),
    ...collect(tryBoxedBackRank, 4000, 16),
  ];

  const puzzles = found.map((r, i) => ({
    id: 'fallback-' + i,
    level: classify(r.kind),
    rating: { beginner: 600, easy: 900, intermediate: 1300, advanced: 1700, hard: 2100 }[classify(r.kind)],
    themes: themesFor(r.kind),
    fen: r.fen,
    solution: [r.mate.from + r.mate.to + (r.mate.promotion || '')],
  }));

  const counts = {};
  for (const p of puzzles) counts[p.level] = (counts[p.level] || 0) + 1;
  console.log('Generated', puzzles.length, 'verified mate-in-1 puzzles:', counts);

  const outPath = path.join(__dirname, '..', 'data', 'puzzles-fallback.json');
  fs.writeFileSync(outPath, JSON.stringify(puzzles, null, 2), 'utf8');
  console.log('Wrote', outPath);
}

main();
