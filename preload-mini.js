const { contextBridge, ipcRenderer } = require('electron');

// The mini board's page bundles its own chess.js copy (src/mini.js) for
// legal-move highlighting; the main window's game stays authoritative and
// moves made here are only sent up via sendMove().
contextBridge.exposeInMainWorld('miniAPI', {
  onUpdate: (callback) => ipcRenderer.on('mini:update', (_e, payload) => callback(payload)),
  sendMove: (payload) => ipcRenderer.send('mini:move', payload),
  closeWindow: () => ipcRenderer.send('mini:close'),
  togglePin: () => ipcRenderer.invoke('mini:toggle-pin'),
  onPinState: (callback) => ipcRenderer.on('mini:pin-state', (_e, val) => callback(val)),
});
