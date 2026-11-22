const { contextBridge, ipcRenderer } = require('electron');

// Storage + pop-out board bridge. The chess engine now lives in the page
// bundle (src/engine.js), so this preload only needs Electron IPC and the
// window can run sandboxed.
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
  onMiniPinChanged: (callback) => ipcRenderer.on('mini:pin-changed', (_e, val) => callback(val)),
});
