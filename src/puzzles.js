const PUZZLE_ID = 'puzzle';
let _puzzleCache = null;

async function loadPuzzleBank() {
  if (_puzzleCache) return _puzzleCache;
  const res = await fetch('data/puzzles.json');
  _puzzleCache = await res.json();
  return _puzzleCache;
}

function dateSeedIndex(dateStr, length) {
  let hash = 0;
  for (let i = 0; i < dateStr.length; i++) hash = (hash * 31 + dateStr.charCodeAt(i)) >>> 0;
  return hash % length;
}

async function getDailyPuzzle() {
  const todayStr = new Date().toISOString().slice(0, 10);
  try {
    const res = await fetch('https://lichess.org/api/puzzle/daily');
    if (res.ok) {
      const data = await res.json();
      return {
        id: 'daily-' + data.puzzle.id,
        level: ratingToLevel(data.puzzle.rating),
        rating: data.puzzle.rating,
        themes: data.puzzle.themes,
        fen: data.puzzle.fen,
        solution: data.puzzle.solution,
        date: todayStr,
      };
    }
  } catch { /* offline — fall through to local pick */ }
  const bank = await loadPuzzleBank();
  const idx = dateSeedIndex(todayStr, bank.length);
  return { ...bank[idx], date: todayStr };
}

function ratingToLevel(rating) {
  if (rating < 1100) return 'beginner';
  if (rating < 1500) return 'easy';
  if (rating < 1900) return 'intermediate';
  if (rating < 2300) return 'advanced';
  return 'hard';
}

const LEVEL_LABEL = {
  beginner: 'Beginner', easy: 'Easy', intermediate: 'Intermediate', advanced: 'Advanced', hard: 'Hard',
};

async function renderPuzzlesHub(container) {
  container.innerHTML = '';
  container.appendChild(el('h1', null, 'Puzzles'));
  container.appendChild(el('p', 'sub', 'Sharpen your tactics with the daily puzzle or browse by level.'));

  const dailyCard = el('div', 'card');
  dailyCard.style.maxWidth = '420px';
  dailyCard.appendChild(el('span', 'card-icon', '☀'));
  dailyCard.appendChild(el('div', 'card-title', "Today's Puzzle"));
  const dailyDesc = el('div', 'card-desc', 'Loading…');
  dailyCard.appendChild(dailyDesc);
  container.appendChild(dailyCard);

  getDailyPuzzle().then((puzzle) => {
    dailyDesc.textContent = `Rating ${puzzle.rating} · ${LEVEL_LABEL[puzzle.level] || puzzle.level}`;
    dailyCard.addEventListener('click', () => App.navigate('puzzle-solve', { puzzle, source: 'daily' }));
  });

  const heading = el('h2', null, 'Browse by level');
  heading.style.marginTop = '28px';
  container.appendChild(heading);

  const filterRow = el('div', 'diff-select');
  filterRow.style.marginBottom = '14px';
  const listEl = el('div', 'puzzle-list');

  const bank = await loadPuzzleBank();
  const progress = await App.getProgress();
  const solvedIds = new Set(progress.puzzles?.solvedIds || []);

  let activeLevel = 'all';
  const levels = ['all', 'beginner', 'easy', 'intermediate', 'advanced', 'hard'];
  function renderList() {
    listEl.innerHTML = '';
    const filtered = activeLevel === 'all' ? bank : bank.filter((p) => p.level === activeLevel);
    filtered.slice(0, 60).forEach((p) => {
      const row = el('div', 'puzzle-row');
      const left = el('div', null);
      left.appendChild(el('div', null, `Rating ${p.rating} ${solvedIds.has(p.id) ? '✓' : ''}`));
      const tags = el('div', null);
      (p.themes || []).slice(0, 3).forEach((t) => tags.appendChild(el('span', 'tag-pill', t)));
      left.appendChild(tags);
      row.appendChild(left);
      row.appendChild(el('span', null, LEVEL_LABEL[p.level] || p.level));
      row.addEventListener('click', () => App.navigate('puzzle-solve', { puzzle: p, source: 'browse' }));
      listEl.appendChild(row);
    });
  }
  levels.forEach((lvl) => {
    const opt = el('div', 'diff-opt' + (lvl === activeLevel ? ' active' : ''), lvl === 'all' ? 'All' : LEVEL_LABEL[lvl]);
    opt.addEventListener('click', () => {
      activeLevel = lvl;
      filterRow.querySelectorAll('.diff-opt').forEach((o) => o.classList.remove('active'));
      opt.classList.add('active');
      renderList();
    });
    filterRow.appendChild(opt);
  });
  renderList();

  container.append(filterRow, listEl);
}

function renderPuzzleSolve(container, params) {
  container.innerHTML = '';
  const puzzle = params.puzzle;
  if (!puzzle) { App.navigate('puzzles-hub'); return; }

  const backLink = el('div', 'back-link', '← Back to Puzzles');
  backLink.addEventListener('click', () => App.navigate('puzzles-hub'));

  const layout = el('div', 'game-layout');
  const boardWrap = el('div', 'board-wrap');
  const sidePanel = el('div', 'side-panel');

  const meta = el('div', 'puzzle-meta');
  meta.appendChild(el('span', null, `Rating ${puzzle.rating}`));
  meta.appendChild(el('span', null, LEVEL_LABEL[puzzle.level] || puzzle.level));
  const statusLine = el('div', 'status-line', 'Find the best move.');

  const btnRow = el('div', 'btn-row');
  const hintBtn = el('button', 'btn secondary', 'Hint');
  const solutionBtn = el('button', 'btn secondary', 'Show Solution');
  const retryBtn = el('button', 'btn secondary', 'Retry');
  const popoutBtn = el('button', 'btn secondary', App.miniBoardOpen ? 'Close Pop-out' : 'Pop Out Board');
  btnRow.append(hintBtn, solutionBtn, retryBtn, popoutBtn);

  sidePanel.append(meta, statusLine, btnRow);
  layout.append(boardWrap, sidePanel);
  container.append(backLink, layout);

  let state = window.chessEngine.reset(PUZZLE_ID, puzzle.fen);
  const solverColor = state.turn;
  const flipped = solverColor === 'b';
  let solIdx = 0;
  let solved = false;
  let locked = false;

  const board = new ChessBoard(boardWrap, {
    interactive: true,
    flipped,
    onUserMove: handleMove,
  });
  board.render(state);
  App.syncMiniBoard(state, flipped);

  popoutBtn.addEventListener('click', async () => {
    const open = await App.toggleMiniBoard();
    popoutBtn.textContent = open ? 'Close Pop-out' : 'Pop Out Board';
    if (open) App.syncMiniBoard(state, flipped);
  });

  App.setMiniMoveHandler((mv) => handleMove(mv.from, mv.to, mv.promotion));
  App.setMiniClosedHandler(() => { popoutBtn.textContent = 'Pop Out Board'; });

  function uciOf(from, to, promotion) { return from + to + (promotion || ''); }

  function applyForcedReply() {
    const uci = puzzle.solution[solIdx];
    const mv = { from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci.length > 4 ? uci.slice(4) : undefined };
    const result = window.chessEngine.move(PUZZLE_ID, mv);
    if (result) { state = result; board.render(state); App.syncMiniBoard(state, flipped); }
    solIdx++;
  }

  function finishSolved() {
    solved = true;
    statusLine.textContent = 'Solved! Well done.';
    statusLine.className = 'status-line good';
    board.interactive = false;
    App.getProgress().then((progress) => {
      progress.puzzles = progress.puzzles || { solvedIds: [] };
      const firstTimeSolved = !progress.puzzles.solvedIds.includes(puzzle.id);
      if (firstTimeSolved) progress.puzzles.solvedIds.push(puzzle.id);
      if (puzzle.source === 'daily' || puzzle.date) {
        const today = new Date().toISOString().slice(0, 10);
        if (progress.puzzles.lastDailyDate !== today) {
          const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
          progress.puzzles.dailyStreak = progress.puzzles.lastDailyDate === yesterday ? (progress.puzzles.dailyStreak || 0) + 1 : 1;
          progress.puzzles.lastDailyDate = today;
        }
      }
      App.saveProgress(progress).then(() => {
        if (firstTimeSolved) {
          App.addXp(10);
          App.addHistoryEntry({ type: 'puzzle', level: puzzle.level, rating: puzzle.rating });
        }
      });
    });
  }

  function handleMove(from, to, promotion) {
    if (locked || solved) return;
    const expected = puzzle.solution[solIdx];
    const attempted = uciOf(from, to, promotion);
    if (expected !== attempted) {
      Sound.play('error');
      showToast('Not quite — try again');
      board.clearSelection();
      return;
    }
    const result = window.chessEngine.move(PUZZLE_ID, { from, to, promotion });
    if (!result) return;
    state = result;
    board.render(state);
    App.syncMiniBoard(state, flipped);
    solIdx++;

    if (solIdx >= puzzle.solution.length) { Sound.play('success'); finishSolved(); return; }
    Sound.play(result.history[result.history.length - 1]?.captured ? 'capture' : 'move');

    locked = true;
    board.interactive = false;
    statusLine.textContent = "Opponent's move…";
    setTimeout(() => {
      applyForcedReply();
      locked = false;
      board.interactive = true;
      statusLine.textContent = solIdx >= puzzle.solution.length ? 'Solved! Well done.' : 'Your move.';
      if (solIdx >= puzzle.solution.length) { Sound.play('success'); finishSolved(); }
    }, 500);
  }

  hintBtn.addEventListener('click', () => {
    if (solved) return;
    const expected = puzzle.solution[solIdx];
    board._select(expected.slice(0, 2));
    showToast('Hint: move the piece on ' + expected.slice(0, 2));
  });

  solutionBtn.addEventListener('click', () => {
    if (solved) return;
    locked = true;
    board.interactive = false;
    const step = () => {
      if (solIdx >= puzzle.solution.length) { finishSolved(); locked = false; return; }
      applyForcedReply();
      if (solIdx < puzzle.solution.length) setTimeout(step, 500);
      else finishSolved();
    };
    step();
  });

  retryBtn.addEventListener('click', () => {
    solved = false;
    locked = false;
    solIdx = 0;
    state = window.chessEngine.reset(PUZZLE_ID, puzzle.fen);
    board.render(state);
    App.syncMiniBoard(state, flipped);
    board.interactive = true;
    statusLine.textContent = 'Find the best move.';
    statusLine.className = 'status-line';
  });

  return () => {
    App.setMiniMoveHandler(null);
    App.setMiniClosedHandler(null);
  };
}
