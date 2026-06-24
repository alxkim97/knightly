// Both colors use the "black" Unicode chess codepoints (♟♞♝♜♛♚) and are
// tinted via CSS instead. The "white" codepoints (♙♘♗♖♕♔) are defined as
// hollow outline glyphs in most fonts — recoloring them can't make them
// solid, which is why white pieces used to look thin/outlined next to
// the solid black ones.
const PIECE_GLYPH = {
  w: { p: '♟', n: '♞', b: '♝', r: '♜', q: '♛', k: '♚' },
  b: { p: '♟', n: '♞', b: '♝', r: '♜', q: '♛', k: '♚' },
};

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

function squareToRowCol(square) {
  const file = FILES.indexOf(square[0]);
  const rank = parseInt(square[1], 10);
  return { row: 8 - rank, col: file };
}

function showToast(msg, ms = 2200) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => el.classList.add('hidden'), ms);
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function pieceName(type) {
  return { p: 'Pawn', n: 'Knight', b: 'Bishop', r: 'Rook', q: 'Queen', k: 'King' }[type] || type;
}

// Lightweight FEN piece-placement parser, used by the mini pop-out board
// (which only needs to display a position, not compute legal moves, so it
// doesn't need a full chess.js instance).
function parseFenBoard(fen) {
  const placement = fen.split(' ')[0];
  const ranks = ['8', '7', '6', '5', '4', '3', '2', '1'];
  return placement.split('/').map((rowStr, r) => {
    const row = [];
    for (const ch of rowStr) {
      if (/[1-8]/.test(ch)) {
        for (let i = 0; i < Number(ch); i++) row.push(null);
      } else {
        const color = ch === ch.toUpperCase() ? 'w' : 'b';
        row.push({ type: ch.toLowerCase(), color, square: FILES[row.length] + ranks[r] });
      }
    }
    return row;
  });
}
