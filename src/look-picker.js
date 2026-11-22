// Theme / pieces / colours picker. Used full-size in Settings and compact in
// the rail's "Look" popover. Every choice goes through App.setLook, which
// saves it and repaints live boards without resetting them.
import { html, esc } from './util.js';
import { SKINS, BOARD_COLORS, PIECE_COLORS } from './theme.js';
import { PIECE_SETS, pieceSVG } from './pieces.js';

let AppRef = null;
export function bindLookPicker(App) { AppRef = App; }

function seg(label, options, current, onPick) {
  const node = html(`<div class="pc-row"><span>${esc(label)}</span><div class="seg" role="group" aria-label="${esc(label)}">${
    options.map(([k, n]) => `<button type="button" data-k="${k}" class="${k === current ? 'on' : ''}" aria-pressed="${k === current}">${esc(n)}</button>`).join('')
  }</div></div>`);
  node.querySelectorAll('[data-k]').forEach((b) => b.addEventListener('click', () => onPick(b.dataset.k)));
  return node;
}

export function lookPicker({ compact = false, onChange } = {}) {
  const App = AppRef;
  const s = App.settings;
  const done = () => { if (onChange) onChange(); };
  const wrap = html('<div class="look-picker"></div>');

  // Themes
  if (!compact) wrap.appendChild(html('<div class="blk-h">Theme</div>'));
  const skins = html('<div class="skins"></div>');
  SKINS.forEach((sk) => {
    const [l, d, bg, ac, ink] = sk.sw;
    const cells = Array.from({ length: 8 }, (_, i) => `<i style="background:${(i + Math.floor(i / 4)) % 2 ? d : l}"></i>`).join('');
    const on = (s.skin || 'auto') === sk.id;
    const b = html(`<button type="button" class="skin ${on ? 'on' : ''}" aria-pressed="${on}">
      <span class="sw"><span class="bd">${cells}</span><span class="ui" style="background:${bg}"><i style="background:${ac};box-shadow:3px 3px 0 ${ink}"></i></span></span>
      <span class="nm">${esc(sk.name)}<span>${esc(sk.note)}</span></span></button>`);
    b.addEventListener('click', () => { App.setLook({ skin: sk.id }); done(); });
    skins.appendChild(b);
  });
  wrap.appendChild(skins);

  // Pieces
  wrap.appendChild(html('<div class="blk-h" style="margin-top:14px">Pieces</div>'));
  if (!compact) {
    wrap.appendChild(html(`<div class="kn-show"><div class="square light">${pieceSVG('w', 'n')}</div><div class="square dark">${pieceSVG('b', 'n')}</div><div class="square light">${pieceSVG('b', 'n')}</div><div class="square dark">${pieceSVG('w', 'n')}</div></div>`));
  }
  const sets = html('<div class="psets"></div>');
  PIECE_SETS.forEach((ps) => {
    const prev = [['w', 'k'], ['b', 'q'], ['w', 'n'], ['b', 'p']]
      .map(([c, t], i) => `<span class="square ${i % 2 ? 'dark' : 'light'}">${pieceSVG(c, t, ps.id)}</span>`).join('');
    const on = s.pieceSet === ps.id;
    const b = html(`<button type="button" class="pset ${on ? 'on' : ''}" aria-pressed="${on}"><span class="pset-prev">${prev}</span><span class="nm">${esc(ps.name)}<span>${esc(ps.note)}</span></span></button>`);
    b.addEventListener('click', () => { App.setLook({ pieceSet: ps.id }); done(); });
    sets.appendChild(b);
  });
  wrap.appendChild(sets);
  wrap.appendChild(seg('Piece colours', PIECE_COLORS, s.pieceColor, (k) => { App.setLook({ pieceColor: k }); done(); }));
  wrap.appendChild(seg('Board colours', BOARD_COLORS, s.boardColor, (k) => { App.setLook({ boardColor: k }); done(); }));
  return wrap;
}
