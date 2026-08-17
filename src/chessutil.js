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
