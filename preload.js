const { contextBridge, ipcRenderer } = require('electron');
const { Chess } = require('chess.js');

const games = new Map();

function getGame(id) {
  if (!games.has(id)) games.set(id, new Chess());
  return games.get(id);
}

function serialize(game) {
  return {
    fen: game.fen(),
    pgn: game.pgn(),
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
  state: (id) => serialize(getGame(id)),
  move: (id, moveObj) => {
    const game = getGame(id);
    try {
      const result = game.move(moveObj);
      return result ? serialize(game) : null;
    } catch {
      return null;
    }
  },
  undo: (id) => {
    const game = getGame(id);
    game.undo();
    return serialize(game);
  },
  legalMovesFrom: (id, square) => getGame(id).moves({ square, verbose: true }),
  loadPgn: (id, pgn) => {
    const game = getGame(id);
    try {
      game.loadPgn(pgn);
      return serialize(game);
    } catch {
      return null;
    }
  },
  destroy: (id) => { games.delete(id); },
});

contextBridge.exposeInMainWorld('knightlyAPI', {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (data) => ipcRenderer.invoke('settings:set', data),
  getProgress: () => ipcRenderer.invoke('progress:get'),
  setProgress: (data) => ipcRenderer.invoke('progress:set', data),
  getVersion: () => ipcRenderer.invoke('app:getVersion'),
  toggleMiniBoard: () => ipcRenderer.invoke('mini:toggle'),
  syncMiniBoard: (payload) => ipcRenderer.send('mini:sync', payload),
  onMiniMove: (callback) => ipcRenderer.on('mini:move-incoming', (_e, payload) => callback(payload)),
  onMiniClosed: (callback) => ipcRenderer.on('mini:closed', () => callback()),
  setMiniAlwaysOnTop: (val) => ipcRenderer.send('mini:set-always-on-top', val),
});
