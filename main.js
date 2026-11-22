const { app, BrowserWindow, nativeImage, Menu, Tray, ipcMain } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');

const userDataDir = app.getPath('userData');
const settingsPath = path.join(userDataDir, 'settings.json');
const progressPath = path.join(userDataDir, 'progress.json');

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

ipcMain.handle('settings:get', () => readJson(settingsPath, null));
ipcMain.handle('settings:set', (_e, data) => { writeJson(settingsPath, data); return true; });
ipcMain.handle('progress:get', () => readJson(progressPath, null));
ipcMain.handle('progress:set', (_e, data) => { writeJson(progressPath, data); return true; });
ipcMain.handle('app:getVersion', () => app.getVersion());

// ── Updates (GitHub Releases, same scheme as Vetted) ─────────────────────
// The app lives in the tray, so it is rarely really quit: updates download in
// the background and Settings shows "Restart to update" instead of waiting for
// the next quit. Only packaged builds check (npm start / --dev never do).
let updateStatus = { state: 'idle', version: null, percent: 0, error: null, checkedAt: null };
function setUpdate(patch) {
  updateStatus = { ...updateStatus, ...patch };
  for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed()) w.webContents.send('updater:status', updateStatus);
}
autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;
autoUpdater.on('checking-for-update', () => setUpdate({ state: 'checking', error: null }));
autoUpdater.on('update-available', (i) => setUpdate({ state: 'downloading', version: i.version, percent: 0 }));
autoUpdater.on('update-not-available', () => setUpdate({ state: 'current', version: null, checkedAt: new Date().toISOString() }));
autoUpdater.on('download-progress', (p) => setUpdate({ state: 'downloading', percent: Math.round(p.percent || 0) }));
autoUpdater.on('update-downloaded', (i) => setUpdate({ state: 'ready', version: i.version, percent: 100 }));
autoUpdater.on('error', (e) => setUpdate({ state: 'error', error: String((e && e.message) || e).split('\n')[0].slice(0, 160) }));

async function checkForUpdates() {
  if (!app.isPackaged) { setUpdate({ state: 'dev' }); return updateStatus; }
  if (updateStatus.state === 'downloading' || updateStatus.state === 'ready') return updateStatus;
  try { await autoUpdater.checkForUpdates(); } catch (e) { setUpdate({ state: 'error', error: String((e && e.message) || e).split('\n')[0].slice(0, 160) }); }
  return updateStatus;
}
ipcMain.handle('updater:status', () => updateStatus);
ipcMain.handle('updater:check', () => checkForUpdates());
ipcMain.handle('updater:install', () => {
  if (updateStatus.state !== 'ready') return false;
  isQuitting = true; // let the tray-hiding window actually close
  autoUpdater.quitAndInstall(false, true);
  return true;
});

// Renderer pages are built by Vite into dist/. With --dev they come from the
// Vite dev server instead (run `npm run dev` first) for instant reloads.
const isDev = process.argv.includes('--dev');
const DEV_URL = 'http://localhost:5173';
function loadPage(win, page) {
  if (isDev) win.loadURL(`${DEV_URL}/${page}`);
  else win.loadFile(path.join(__dirname, 'dist', page));
}

const appIcon = nativeImage.createFromPath(path.join(__dirname, 'assets', 'icon.png'));

let mainWindow = null;
let miniWindow = null;
let tray = null;
let isQuitting = false;
let lastMiniSync = null;
let miniAlwaysOnTop = readJson(settingsPath, {}).miniAlwaysOnTop !== false;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 640,
    minHeight: 560,
    title: 'Knightly',
    icon: appIcon,
    autoHideMenuBar: true,
    backgroundColor: '#000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  loadPage(mainWindow, 'index.html');
  if (isDev) mainWindow.webContents.openDevTools({ mode: 'detach' });

  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
  mainWindow.on('closed', () => { mainWindow = null; });
}

function sendToMain(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload);
}

function sendToMini(channel, payload) {
  if (miniWindow && !miniWindow.isDestroyed()) miniWindow.webContents.send(channel, payload);
}

function createMiniWindow() {
  const win = new BrowserWindow({
    width: 260,
    height: 260,
    minWidth: 160,
    minHeight: 160,
    title: 'Knightly — Mini Board',
    icon: appIcon,
    frame: false,
    resizable: true,
    useContentSize: true, // so getSize/setSize below measure the actual web content, not outer window bounds — otherwise any invisible OS chrome makes the rendered board subtly non-square
    alwaysOnTop: miniAlwaysOnTop,
    skipTaskbar: true,
    backgroundColor: '#000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload-mini.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  miniWindow = win;
  win.setAspectRatio(1);
  // setAspectRatio is advisory on some platforms/edge cases — force an exact
  // square as a backstop so the board is never letterboxed mid-resize.
  win.on('resize', () => {
    if (win.isDestroyed()) return;
    const [w, h] = win.getContentSize();
    if (w !== h) win.setContentSize(Math.max(w, h), Math.max(w, h));
  });
  loadPage(win, 'mini.html');
  // The renderer may send its first 'mini:sync' before this window's page has
  // finished loading and registered its listener — that message would be
  // silently dropped. Replay the last known state once it's actually ready.
  win.webContents.once('did-finish-load', () => {
    if (lastMiniSync) sendToMini('mini:update', lastMiniSync);
    sendToMini('mini:pin-state', miniAlwaysOnTop);
  });
  win.on('closed', () => {
    // A stale 'closed' event from a previous window instance (e.g. a fast
    // close-then-reopen) must not clobber a newer window's reference.
    if (miniWindow === win) {
      miniWindow = null;
      sendToMain('mini:closed');
    }
  });
}

ipcMain.handle('mini:toggle', () => {
  if (miniWindow) {
    miniWindow.close();
    miniWindow = null;
    return { open: false };
  }
  createMiniWindow();
  return { open: true };
});

ipcMain.on('mini:sync', (_e, payload) => {
  lastMiniSync = payload;
  sendToMini('mini:update', payload);
});

ipcMain.on('mini:move', (_e, payload) => {
  sendToMain('mini:move-incoming', payload);
});

ipcMain.on('mini:close', () => {
  if (miniWindow && !miniWindow.isDestroyed()) miniWindow.close();
});

ipcMain.on('mini:set-always-on-top', (_e, val) => {
  miniAlwaysOnTop = !!val;
  if (miniWindow && !miniWindow.isDestroyed()) miniWindow.setAlwaysOnTop(miniAlwaysOnTop);
  sendToMini('mini:pin-state', miniAlwaysOnTop);
});

// Pin toggle lives on the mini window's own toolbar (see mini.js) as a
// quicker path than opening Settings — mirrors 'mini:set-always-on-top'
// above but is initiated from the mini window itself, so it also has to
// persist the change (Settings' own toggle instead relies on the renderer
// writing its whole settings object back via settings:set) and tell the
// main window to keep its cached copy in sync.
ipcMain.handle('mini:toggle-pin', () => {
  miniAlwaysOnTop = !miniAlwaysOnTop;
  const current = readJson(settingsPath, {}) || {};
  current.miniAlwaysOnTop = miniAlwaysOnTop;
  writeJson(settingsPath, current);
  if (miniWindow && !miniWindow.isDestroyed()) miniWindow.setAlwaysOnTop(miniAlwaysOnTop);
  sendToMain('mini:pin-changed', miniAlwaysOnTop);
  return miniAlwaysOnTop;
});

function showMainWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) { mainWindow.show(); mainWindow.focus(); }
  else createWindow();
}

function createTray() {
  const trayIcon = appIcon.resize({ width: 16, height: 16 });
  tray = new Tray(trayIcon);
  tray.setToolTip('Knightly');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Show Knightly', click: showMainWindow },
    { type: 'separator' },
    { label: 'Quit', click: () => { isQuitting = true; app.quit(); } },
  ]));
  tray.on('click', showMainWindow);
}

Menu.setApplicationMenu(null);
if (process.platform === 'win32') app.setAppUserModelId('com.apm.knightly');
app.whenReady().then(() => {
  createWindow();
  createTray();
  if (app.isPackaged) {
    setTimeout(checkForUpdates, 8000);
    setInterval(checkForUpdates, 6 * 60 * 60 * 1000);
  }
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin' && isQuitting) app.quit(); });
app.on('activate', showMainWindow);
app.on('before-quit', () => { isQuitting = true; });
