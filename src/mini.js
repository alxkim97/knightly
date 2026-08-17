const MINI_ID = 'mini-mirror';
const wrap = document.getElementById('mini-wrap');
let flipped = false;

const board = new ChessBoard(wrap, { interactive: true, onUserMove: handleMiniMove });

function handleMiniMove(from, to, promotion) {
  miniAPI.sendMove({ from, to, promotion });
}

miniAPI.onUpdate((payload) => {
  if (payload.theme) document.documentElement.setAttribute('data-theme', payload.theme);
  if (payload.boardTheme && payload.boardTheme !== 'classic') {
    document.documentElement.setAttribute('data-board-theme', payload.boardTheme);
  } else {
    document.documentElement.removeAttribute('data-board-theme');
  }
  if (payload.pieceTheme && payload.pieceTheme !== 'classic') {
    document.documentElement.setAttribute('data-piece-theme', payload.pieceTheme);
  } else {
    document.documentElement.removeAttribute('data-piece-theme');
  }
  if (!!payload.flipped !== flipped) {
    flipped = !!payload.flipped;
    board.setFlipped(flipped);
  }

  const state = window.chessEngine.reset(MINI_ID, payload.fen);
  state.history = payload.lastMove ? [payload.lastMove] : [];
  board.render(state);
});

document.getElementById('mini-close').addEventListener('click', () => miniAPI.closeWindow());

const pinBtn = document.getElementById('mini-pin');
pinBtn.addEventListener('click', async () => {
  const pinned = await miniAPI.togglePin();
  pinBtn.classList.toggle('pinned', pinned);
});
miniAPI.onPinState((pinned) => pinBtn.classList.toggle('pinned', pinned));
