const { contextBridge, ipcRenderer } = require('electron');
const { Chess } = require('chess.js');

// Mirrors preload.js's chessEngine bridge so the mini board can compute its
// own legal moves locally (for click-to-select highlighting) instead of
// just displaying static piece positions. The main window's game-view
// remains authoritative; moves made here are sent up via sendMove() and
// applied through the main window's own engine, then flow back down
// through the normal mini:update sync.
const games = new Map();

function getGame(id) {
  if (!games.has(id)) games.set(id, new Chess());
  return games.get(id);
}

function serialize(game) {
  return {
    fen: game.fen(),
    turn: game.turn(),
    history: game.history({ verbose: true }),
    isCheck: game.isCheck(),
    isCheckmate: game.isCheckmate(),
    isStalemate: game.isStalemate(),
    isDraw: game.isDraw(),
    isGameOver: game.isGameOver(),
    legalMoves: game.moves({ verbose: true }),
    board: game.board(),
  };
}

contextBridge.exposeInMainWorld('chessEngine', {
  reset: (id, fen) => {
    const game = getGame(id);
    try {
      if (fen) game.load(fen); else game.reset();
    } catch {
      game.reset();
    }
    return serialize(game);
  },
});

contextBridge.exposeInMainWorld('miniAPI', {
  onUpdate: (callback) => ipcRenderer.on('mini:update', (_e, payload) => callback(payload)),
  sendMove: (payload) => ipcRenderer.send('mini:move', payload),
  closeWindow: () => ipcRenderer.send('mini:close'),
});
