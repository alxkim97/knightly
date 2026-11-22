// Pop-out mini board (desktop only). Mirrors the main window's live board;
// moves made here are sent up and applied by the main window's own game
// logic, then flow back down through mini:update. It keeps a local chess.js
// copy only to know legal moves for click/drag highlighting.
import '@fontsource/anton';
import './styles.css';
import { ChessBoard } from './board.js';
import { engine } from './engine.js';
import { applyLook } from './theme.js';
import { PIECE_DEFS } from './pieces.js';

const MINI_ID = 'mini-mirror';
document.body.insertAdjacentHTML('afterbegin', PIECE_DEFS);
let flipped = false;

const board = new ChessBoard(document.querySelector('#mini-wrap .board-wrap'), {
  interactive: true,
  onUserMove: (from, to, promotion) => window.miniAPI.sendMove({ from, to, promotion }),
});

window.miniAPI.onUpdate((payload) => {
  if (payload.look) applyLook(payload.look);
  if (!!payload.flipped !== flipped) {
    flipped = !!payload.flipped;
    board.setFlipped(flipped);
  }
  const state = engine.reset(MINI_ID, payload.fen);
  state.history = payload.lastMove ? [payload.lastMove] : [];
  board.render(state);
});

document.getElementById('mini-close').addEventListener('click', () => window.miniAPI.closeWindow());
const pinBtn = document.getElementById('mini-pin');
pinBtn.addEventListener('click', async () => {
  const pinned = await window.miniAPI.togglePin();
  pinBtn.classList.toggle('pinned', pinned);
});
window.miniAPI.onPinState((pinned) => pinBtn.classList.toggle('pinned', pinned));
