const { contextBridge, ipcRenderer } = require('electron');
const { createGameStore } = require('./chess-engine-bridge');

// Uses the same chess.js-backed store as preload.js so the mini board can
// compute its own legal moves locally (for click-to-select highlighting)
// instead of just displaying static piece positions. The main window's
// game-view remains authoritative; moves made here are sent up via
// sendMove() and applied through the main window's own engine, then flow
// back down through the normal mini:update sync — so only reset() is
// exposed here, not move()/undo().
const store = createGameStore();

contextBridge.exposeInMainWorld('chessEngine', {
  reset: (id, fen) => store.reset(id, fen),
});

contextBridge.exposeInMainWorld('miniAPI', {
  onUpdate: (callback) => ipcRenderer.on('mini:update', (_e, payload) => callback(payload)),
  sendMove: (payload) => ipcRenderer.send('mini:move', payload),
  closeWindow: () => ipcRenderer.send('mini:close'),
  togglePin: () => ipcRenderer.invoke('mini:toggle-pin'),
  onPinState: (callback) => ipcRenderer.on('mini:pin-state', (_e, val) => callback(val)),
});
