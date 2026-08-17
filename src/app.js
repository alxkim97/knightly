const App = {
  settings: { theme: 'dark', sound: true, boardTheme: 'classic', pieceTheme: 'classic', miniAlwaysOnTop: true },
  _progressCache: null,
  _viewCleanup: null,

  views: {
    'home': { render: renderHome, navKey: 'home' },
    'play-setup': { render: renderPlaySetup, navKey: 'play-setup' },
    'game': { render: renderGame, navKey: 'play-setup' },
    'puzzles-hub': { render: renderPuzzlesHub, navKey: 'puzzles-hub' },
    'puzzle-solve': { render: renderPuzzleSolve, navKey: 'puzzles-hub' },
    'learn-hub': { render: renderLearnHub, navKey: 'learn-hub' },
    'lesson': { render: renderLesson, navKey: 'learn-hub' },
    'settings': { render: renderSettings, navKey: 'settings' },
    'history': { render: renderHistory, navKey: 'home' },
  },

  defaultProgress() {
    return {
      puzzles: { solvedIds: [] },
      lessons: { completedIds: [] },
      xp: 0,
      record: { wins: 0, losses: 0, draws: 0 },
      history: [],
    };
  },

  async addXp(amount) {
    const progress = await App.getProgress();
    progress.xp = (progress.xp || 0) + amount;
    await App.saveProgress(progress);
    return progress.xp;
  },

  async addHistoryEntry(entry) {
    const progress = await App.getProgress();
    progress.history = progress.history || [];
    progress.history.unshift({ date: new Date().toISOString(), ...entry });
    progress.history = progress.history.slice(0, 50);
    await App.saveProgress(progress);
  },

  miniBoardOpen: false,
  _miniMoveHandler: null,
  _miniClosedHandler: null,

  async toggleMiniBoard() {
    const { open } = await knightlyAPI.toggleMiniBoard();
    App.miniBoardOpen = open;
    return open;
  },

  // The active game/puzzle view registers itself here so moves made on the
  // pop-out mini board get routed back through that view's own move handler
  // (keeping turn/AI/clock/recording logic in one place). Cleared when the
  // view unmounts.
  setMiniMoveHandler(fn) { App._miniMoveHandler = fn; },
  setMiniClosedHandler(fn) { App._miniClosedHandler = fn; },

  syncMiniBoard(state, flipped) {
    if (!App.miniBoardOpen) return;
    const last = state.history && state.history.length ? state.history[state.history.length - 1] : null;
    knightlyAPI.syncMiniBoard({
      fen: state.fen,
      flipped: !!flipped,
      lastMove: last ? { from: last.from, to: last.to } : null,
      theme: App.settings.theme,
      boardTheme: App.settings.boardTheme,
      pieceTheme: App.settings.pieceTheme,
    });
  },

  async recordGameResult(result) {
    const progress = await App.getProgress();
    progress.record = progress.record || { wins: 0, losses: 0, draws: 0 };
    if (result === 'win') progress.record.wins++;
    else if (result === 'loss') progress.record.losses++;
    else if (result === 'draw') progress.record.draws++;
    await App.saveProgress(progress);
  },

  applyTheme() {
    document.documentElement.setAttribute('data-theme', App.settings.theme === 'light' ? 'light' : 'dark');
  },

  applyBoardTheme() {
    const theme = App.settings.boardTheme || 'classic';
    if (theme === 'classic') document.documentElement.removeAttribute('data-board-theme');
    else document.documentElement.setAttribute('data-board-theme', theme);
  },

  applyPieceTheme() {
    const theme = App.settings.pieceTheme || 'classic';
    if (theme === 'classic') document.documentElement.removeAttribute('data-piece-theme');
    else document.documentElement.setAttribute('data-piece-theme', theme);
  },

  async saveSettings() {
    await knightlyAPI.setSettings(App.settings);
  },

  async getProgress() {
    if (App._progressCache) return App._progressCache;
    const stored = await knightlyAPI.getProgress();
    App._progressCache = { ...App.defaultProgress(), ...(stored || {}) };
    return App._progressCache;
  },

  async saveProgress(progress) {
    App._progressCache = progress;
    await knightlyAPI.setProgress(progress);
  },

  navigate(viewName, params = {}) {
    const view = App.views[viewName];
    if (!view) return;
    if (typeof App._viewCleanup === 'function') {
      try { App._viewCleanup(); } catch { /* ignore cleanup errors */ }
    }
    App._viewCleanup = null;

    document.querySelectorAll('.nav-btn').forEach((b) => {
      b.classList.toggle('active', b.dataset.view === view.navKey);
    });

    const container = document.getElementById('view');
    const result = view.render(container, params);
    if (result && typeof result.then === 'function') {
      result.then((cleanup) => { if (typeof cleanup === 'function') App._viewCleanup = cleanup; });
    } else if (typeof result === 'function') {
      App._viewCleanup = result;
    }
  },
};

async function renderHome(container) {
  container.innerHTML = '';
  container.appendChild(el('h1', null, 'Welcome to Knightly'));
  container.appendChild(el('p', 'sub', 'Play, solve puzzles, and learn chess — all in one place.'));

  const progress = await App.getProgress();
  const statRow = el('div', 'home-stats');
  statRow.appendChild(el('span', 'stat-pill', `⭐ ${progress.xp || 0} XP`));
  const rec = progress.record || { wins: 0, losses: 0, draws: 0 };
  statRow.appendChild(el('span', 'stat-pill', `vs Computer: ${rec.wins}W ${rec.losses}L ${rec.draws}D`));
  container.appendChild(statRow);

  const grid = el('div', 'card-grid');
  const items = [
    ['♞', 'Play', 'Pass-and-play with a friend, or take on the computer at your level.', 'play-setup'],
    ['♟', 'Puzzles', "Today's puzzle, plus a library of tactics to solve at your own pace.", 'puzzles-hub'],
    ['♛', 'Learn', 'Interactive lessons on openings, midgame ideas, and endgame technique.', 'learn-hub'],
    ['🕓', 'History', 'Past games, puzzles, and lessons with dates and results.', 'history'],
    ['⚙', 'Settings', 'Theme, sound, and your saved progress.', 'settings'],
  ];
  items.forEach(([icon, title, desc, view]) => {
    const card = el('div', 'card');
    card.appendChild(el('span', 'card-icon', icon));
    card.appendChild(el('div', 'card-title', title));
    card.appendChild(el('div', 'card-desc', desc));
    card.addEventListener('click', () => App.navigate(view));
    grid.appendChild(card);
  });
  container.appendChild(grid);
}

function startClockDisplay() {
  const el2 = document.getElementById('clock-display');
  if (!el2) return;
  function tick() {
    const now = new Date();
    const dateStr = now.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
    const timeStr = now.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    el2.textContent = `${dateStr} · ${timeStr}`;
  }
  tick();
  setInterval(tick, 30000);
}

async function init() {
  const stored = await knightlyAPI.getSettings();
  if (stored) App.settings = { ...App.settings, ...stored };
  App.applyTheme();
  App.applyBoardTheme();
  App.applyPieceTheme();
  startClockDisplay();

  knightlyAPI.onMiniMove((payload) => {
    if (App._miniMoveHandler) App._miniMoveHandler(payload);
  });
  knightlyAPI.onMiniClosed(() => {
    App.miniBoardOpen = false;
    if (App._miniClosedHandler) App._miniClosedHandler();
  });
  // The pin button on the mini board's own toolbar (src/mini.js) can flip
  // this setting too — keep the cached copy (and the Settings toggle, if
  // it's the currently open view) in sync so it doesn't look stale/wrong
  // next time either is shown.
  knightlyAPI.onMiniPinChanged((val) => {
    App.settings.miniAlwaysOnTop = val;
    const checkbox = document.getElementById('mini-always-on-top-toggle');
    if (checkbox) checkbox.checked = val;
  });

  document.querySelectorAll('.nav-btn').forEach((btn) => {
    btn.addEventListener('click', () => App.navigate(btn.dataset.view));
  });

  App.navigate('home');
}

init();
