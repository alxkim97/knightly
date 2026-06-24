const GAME_ID = 'main-game';
const REVIEW_ID = 'main-game-review';
const PIECE_VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const TIME_CONTROLS = [
  ['none', 'No clock'],
  ['3', '3 min'],
  ['5', '5 min'],
  ['10', '10 min'],
  ['15', '15 min'],
  ['30', '30 min'],
];

function renderPlaySetup(container) {
  container.innerHTML = '';
  container.appendChild(el('h1', null, 'Play'));
  container.appendChild(el('p', 'sub', 'Choose how you want to play.'));

  let chosenTime = 'none';
  const timeWrap = el('div', 'card');
  timeWrap.style.cursor = 'default';
  timeWrap.style.maxWidth = '480px';
  timeWrap.style.marginBottom = '16px';
  timeWrap.appendChild(el('div', 'card-title', 'Time Control'));
  const timeSelect = el('div', 'diff-select');
  timeSelect.style.marginTop = '10px';
  TIME_CONTROLS.forEach(([key, label]) => {
    const opt = el('div', 'diff-opt' + (key === chosenTime ? ' active' : ''), label);
    opt.addEventListener('click', () => {
      timeSelect.querySelectorAll('.diff-opt').forEach((o) => o.classList.remove('active'));
      opt.classList.add('active');
      chosenTime = key;
    });
    timeSelect.appendChild(opt);
  });
  timeWrap.appendChild(timeSelect);
  container.appendChild(timeWrap);

  const grid = el('div', 'card-grid');

  const pvpCard = el('div', 'card');
  pvpCard.appendChild(el('span', 'card-icon', '♞'));
  pvpCard.appendChild(el('div', 'card-title', 'Pass & Play'));
  pvpCard.appendChild(el('div', 'card-desc', 'Two players, one device. Take turns making moves on the same board.'));
  pvpCard.addEventListener('click', () => App.navigate('game', { mode: 'pvp', timeControlMin: chosenTime === 'none' ? null : Number(chosenTime) }));
  grid.appendChild(pvpCard);

  container.appendChild(grid);
  const vsComputerHeading = el('h2', null, 'vs Computer');
  vsComputerHeading.style.marginTop = '28px';
  container.appendChild(vsComputerHeading);

  const diffWrap = el('div', 'card');
  diffWrap.style.cursor = 'default';
  diffWrap.style.maxWidth = '480px';
  diffWrap.appendChild(el('div', 'card-title', 'Difficulty'));
  const diffSelect = el('div', 'diff-select');
  diffSelect.style.marginTop = '10px';
  let chosenDiff = 'beginner';
  DIFFICULTY_PRESETS.forEach((p) => {
    const opt = el('div', 'diff-opt' + (p.key === chosenDiff ? ' active' : ''), p.label);
    opt.title = p.desc;
    opt.addEventListener('click', () => {
      diffSelect.querySelectorAll('.diff-opt').forEach((o) => o.classList.remove('active'));
      opt.classList.add('active');
      chosenDiff = p.key;
    });
    diffSelect.appendChild(opt);
  });
  diffWrap.appendChild(diffSelect);

  const colorRow = el('div', 'btn-row');
  let chosenColor = 'w';
  const colors = [['w', 'Play as White'], ['b', 'Play as Black'], ['random', 'Random']];
  colors.forEach(([val, label], i) => {
    const b = el('button', 'btn secondary', label);
    if (i === 0) b.style.outline = '2px solid var(--accent)';
    b.addEventListener('click', () => {
      chosenColor = val;
      colorRow.querySelectorAll('button').forEach((x) => (x.style.outline = ''));
      b.style.outline = '2px solid var(--accent)';
    });
    colorRow.appendChild(b);
  });
  diffWrap.appendChild(colorRow);

  const startBtn = el('button', 'btn', 'Start Game vs Computer');
  startBtn.style.marginTop = '16px';
  startBtn.addEventListener('click', () => {
    const color = chosenColor === 'random' ? (Math.random() < 0.5 ? 'w' : 'b') : chosenColor;
    App.navigate('game', {
      mode: 'ai',
      difficulty: chosenDiff,
      playerColor: color,
      timeControlMin: chosenTime === 'none' ? null : Number(chosenTime),
    });
  });
  diffWrap.appendChild(startBtn);

  const wrap2 = el('div', 'card-grid');
  wrap2.style.marginTop = '14px';
  wrap2.appendChild(diffWrap);
  container.appendChild(wrap2);
}

function buildCapturedRows(history) {
  const capturedByWhite = [];
  const capturedByBlack = [];
  for (const m of history) {
    if (m.captured) {
      if (m.color === 'w') capturedByWhite.push(m.captured);
      else capturedByBlack.push(m.captured);
    }
  }
  return { capturedByWhite, capturedByBlack };
}

function materialValue(types) {
  return types.reduce((sum, t) => sum + (PIECE_VALUE[t] || 0), 0);
}

function formatClock(ms) {
  if (ms < 0) ms = 0;
  const totalSec = Math.ceil(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function renderGame(container, params) {
  container.innerHTML = '';
  const layout = el('div', 'game-layout');

  const boardWrap = el('div', 'board-wrap');
  const boardCol = el('div', null);
  boardCol.appendChild(boardWrap);
  const reviewRow = el('div', 'review-row');
  boardCol.appendChild(reviewRow);

  const sidePanel = el('div', 'side-panel');

  const backLink = el('div', 'back-link', '← Back to Play menu');
  backLink.addEventListener('click', () => App.navigate('play-setup'));

  const statusLine = el('div', 'status-line', 'White to move');
  const clockRow = el('div', 'clock-row');
  const clockWhite = el('span', 'clock-pill', '');
  const clockBlack = el('span', 'clock-pill', '');
  clockRow.append(clockWhite, clockBlack);

  const capturedTop = el('div', 'captured-row');
  const capturedBottom = el('div', 'captured-row');
  const moveList = el('div', 'move-list');

  const btnRow = el('div', 'btn-row');
  const flipBtn = el('button', 'btn secondary', 'Flip Board');
  const suggestBtn = el('button', 'btn secondary', 'Suggest a Move');
  const popoutBtn = el('button', 'btn secondary', App.miniBoardOpen ? 'Close Pop-out' : 'Pop Out Board');
  const undoBtn = el('button', 'btn secondary', 'Undo (Ctrl+Z)');
  const redoBtn = el('button', 'btn secondary', 'Redo (Ctrl+Y)');
  const newBtn = el('button', 'btn secondary', 'New Game');
  const resignBtn = el('button', 'btn danger', params.mode === 'ai' ? 'Resign' : 'End Game');
  if (params.mode === 'ai') btnRow.append(flipBtn, undoBtn, redoBtn, suggestBtn, popoutBtn, newBtn, resignBtn);
  else btnRow.append(flipBtn, suggestBtn, popoutBtn, newBtn, resignBtn);

  if (params.mode === 'ai') {
    const meta = el('div', 'sub', `vs Computer — ${DIFFICULTY_PRESETS.find((p) => p.key === params.difficulty)?.label || ''}`);
    sidePanel.appendChild(meta);
  }
  if (params.timeControlMin) sidePanel.appendChild(clockRow);
  sidePanel.append(statusLine, capturedTop, moveList, capturedBottom, btnRow);

  layout.append(boardCol, sidePanel);
  container.append(backLink, layout);

  const playerColor = params.playerColor || 'w';
  let flipped = params.mode === 'ai' && playerColor === 'b';
  let aiThinking = false;
  let ai = params.mode === 'ai' ? new StockfishAI() : null;
  let advisor = null;
  let viewIndex = null; // null = live position; otherwise number of moves shown
  let resultRecorded = false;
  let undonePairs = []; // each entry: [moveObj, moveObj?] in chronological order, for Redo

  let state = window.chessEngine.reset(GAME_ID);
  const board = new ChessBoard(boardWrap, {
    interactive: true,
    flipped,
    onUserMove: handleUserMove,
  });
  board.render(state);
  App.syncMiniBoard(state, flipped);

  if (ai) {
    ai.setDifficulty(params.difficulty).catch(() => showToast('AI engine failed to load'));
  }

  // ── Clock ──────────────────────────────────────────────
  let whiteMs = params.timeControlMin ? params.timeControlMin * 60 * 1000 : null;
  let blackMs = params.timeControlMin ? params.timeControlMin * 60 * 1000 : null;
  let clockTimer = null;
  let lastTick = Date.now();

  function renderClocks() {
    if (!params.timeControlMin) return;
    clockWhite.textContent = `White ${formatClock(whiteMs)}`;
    clockBlack.textContent = `Black ${formatClock(blackMs)}`;
    clockWhite.classList.toggle('active', state.turn === 'w' && !state.isGameOver);
    clockBlack.classList.toggle('active', state.turn === 'b' && !state.isGameOver);
  }

  function startClock() {
    if (!params.timeControlMin || clockTimer) return;
    lastTick = Date.now();
    clockTimer = setInterval(() => {
      if (state.isGameOver) return;
      const now = Date.now();
      const delta = now - lastTick;
      lastTick = now;
      if (state.turn === 'w') whiteMs -= delta; else blackMs -= delta;
      if (whiteMs <= 0 || blackMs <= 0) {
        whiteMs = Math.max(whiteMs, 0);
        blackMs = Math.max(blackMs, 0);
        const loserColor = whiteMs <= 0 ? 'w' : 'b';
        endGameByTimeout(loserColor);
      }
      renderClocks();
    }, 250);
  }

  function stopClock() {
    if (clockTimer) { clearInterval(clockTimer); clockTimer = null; }
  }

  function endGameByTimeout(loserColor) {
    stopClock();
    state.isGameOver = true;
    statusLine.textContent = `Time's up — ${loserColor === 'w' ? 'Black' : 'White'} wins on time`;
    statusLine.className = 'status-line bad';
    board.interactive = false;
    if (params.mode === 'ai') finalizeGameResult(loserColor === playerColor ? 'loss' : 'win');
    else finalizeGameResult(loserColor === 'w' ? 'black-won' : 'white-won');
  }

  // ── Result / points / history recording ────────────────
  function finalizeGameResult(playerResult) {
    if (resultRecorded) return;
    resultRecorded = true;
    if (params.mode === 'ai') {
      App.recordGameResult(playerResult);
      App.addXp(playerResult === 'win' ? 20 : playerResult === 'draw' ? 5 : 2);
      App.addHistoryEntry({ type: 'game', mode: 'ai', difficulty: params.difficulty, result: playerResult });
    } else {
      App.addHistoryEntry({ type: 'game', mode: 'pvp', result: playerResult });
    }
  }

  function checkGameEndFromState() {
    if (resultRecorded) return;
    if (state.isCheckmate) {
      const winnerColor = state.turn === 'w' ? 'b' : 'w';
      if (params.mode === 'ai') finalizeGameResult(winnerColor === playerColor ? 'win' : 'loss');
      else finalizeGameResult(winnerColor === 'w' ? 'white-won' : 'black-won');
      stopClock();
    } else if (state.isStalemate || state.isDraw) {
      finalizeGameResult('draw');
      stopClock();
    }
  }

  // ── Review (step through move history) ──────────────────
  function getPositionAt(idx) {
    if (idx === 0) {
      const s = window.chessEngine.reset(REVIEW_ID);
      s.history = [];
      return s;
    }
    const histEntry = state.history[idx - 1];
    const s = window.chessEngine.reset(REVIEW_ID, histEntry.after);
    s.history = [histEntry];
    return s;
  }

  function showView(idx) {
    const total = state.history.length;
    viewIndex = idx === null || idx >= total ? null : Math.max(0, idx);
    if (viewIndex === null) {
      board.interactive = computeInteractive();
      board.render(state);
    } else {
      board.interactive = false;
      board.render(getPositionAt(viewIndex));
    }
    renderReviewRow();
    paintMoveListActive();
  }

  function renderReviewRow() {
    reviewRow.innerHTML = '';
    const total = state.history.length;
    if (total === 0) return;
    const prevBtn = el('button', 'btn secondary', '◀');
    const nextBtn = el('button', 'btn secondary', '▶');
    const liveBtn = el('button', 'btn secondary', 'Live');
    const label = el('span', 'review-label', viewIndex === null ? 'Live position' : `Move ${viewIndex} of ${total}`);
    prevBtn.disabled = viewIndex === 0;
    nextBtn.disabled = viewIndex === null;
    liveBtn.disabled = viewIndex === null;
    prevBtn.addEventListener('click', () => showView((viewIndex === null ? total : viewIndex) - 1));
    nextBtn.addEventListener('click', () => showView((viewIndex === null ? total : viewIndex) + 1));
    liveBtn.addEventListener('click', () => showView(null));
    reviewRow.append(prevBtn, label, nextBtn, liveBtn);
  }

  function paintMoveListActive() {
    moveList.querySelectorAll('.mv-move').forEach((node) => {
      node.classList.toggle('mv-active', Number(node.dataset.idx) === viewIndex);
    });
  }

  function computeInteractive() {
    return !aiThinking && !state.isGameOver && (params.mode === 'pvp' || state.turn === playerColor);
  }

  // ── UI refresh ───────────────────────────────────────────
  function refreshUI() {
    const dim = (color) => (color === 'w' ? 'White' : 'Black');
    if (state.isCheckmate) {
      statusLine.textContent = `Checkmate — ${dim(state.turn === 'w' ? 'b' : 'w')} wins`;
      statusLine.className = 'status-line bad';
    } else if (state.isStalemate) {
      statusLine.textContent = 'Stalemate — draw';
      statusLine.className = 'status-line warn';
    } else if (state.isDraw) {
      statusLine.textContent = 'Draw';
      statusLine.className = 'status-line warn';
    } else if (state.isCheck) {
      statusLine.textContent = `${dim(state.turn)} to move — Check!`;
      statusLine.className = 'status-line bad';
    } else if (aiThinking) {
      statusLine.textContent = 'Computer is thinking…';
      statusLine.className = 'status-line';
    } else {
      statusLine.textContent = `${dim(state.turn)} to move`;
      statusLine.className = 'status-line';
    }

    const { capturedByWhite, capturedByBlack } = buildCapturedRows(state.history);
    const diff = materialValue(capturedByWhite) - materialValue(capturedByBlack);
    capturedTop.innerHTML = '';
    capturedBottom.innerHTML = '';
    capturedByWhite.forEach((t) => capturedTop.appendChild(el('span', null, PIECE_GLYPH.b[t])));
    if (diff > 0) capturedTop.appendChild(el('span', 'material-diff', `+${diff}`));
    capturedByBlack.forEach((t) => capturedBottom.appendChild(el('span', null, PIECE_GLYPH.w[t])));
    if (diff < 0) capturedBottom.appendChild(el('span', 'material-diff', `+${-diff}`));

    moveList.innerHTML = '';
    for (let i = 0; i < state.history.length; i += 2) {
      moveList.appendChild(el('span', 'mv-num', `${i / 2 + 1}.`));
      const whiteMove = el('span', 'mv-move', state.history[i]?.san || '');
      whiteMove.dataset.idx = String(i + 1);
      whiteMove.addEventListener('click', () => showView(i + 1));
      moveList.appendChild(whiteMove);
      if (state.history[i + 1]) {
        const blackMove = el('span', 'mv-move', state.history[i + 1].san);
        blackMove.dataset.idx = String(i + 2);
        blackMove.addEventListener('click', () => showView(i + 2));
        moveList.appendChild(blackMove);
      } else {
        moveList.appendChild(el('span', null, ''));
      }
    }
    moveList.scrollTop = moveList.scrollHeight;
    paintMoveListActive();

    if (viewIndex === null) board.interactive = computeInteractive();
    renderClocks();
    renderReviewRow();
    undoBtn.disabled = aiThinking || state.history.length === 0;
    redoBtn.disabled = aiThinking || undonePairs.length === 0;
  }

  function maybeTriggerAiMove() {
    if (params.mode !== 'ai' || state.isGameOver) return;
    if (state.turn === playerColor) return;
    aiThinking = true;
    refreshUI();
    ai.pickMove(state.fen, state.legalMoves).then((mv) => {
      aiThinking = false;
      if (!mv) { refreshUI(); return; }
      const result = window.chessEngine.move(GAME_ID, mv);
      if (result) {
        state = result;
        viewIndex = null;
        board.render(state);
        App.syncMiniBoard(state, flipped);
        playMoveSound(state);
      }
      refreshUI();
      checkGameEndFromState();
    }).catch(() => { aiThinking = false; refreshUI(); showToast('AI move failed'); });
  }

  function playMoveSound(s) {
    const last = s.history[s.history.length - 1];
    if (s.isCheckmate || s.isCheck) Sound.play('check');
    else if (last && last.captured) Sound.play('capture');
    else Sound.play('move');
  }

  function handleUserMove(from, to, promotion) {
    if (viewIndex !== null) return; // read-only while reviewing past moves
    const result = window.chessEngine.move(GAME_ID, { from, to, promotion });
    if (!result) { showToast('Illegal move'); return; }
    state = result;
    undonePairs = [];
    board.render(state);
    App.syncMiniBoard(state, flipped);
    playMoveSound(state);
    startClock();
    refreshUI();
    checkGameEndFromState();
    maybeTriggerAiMove();
  }

  function handleUndo() {
    if (params.mode !== 'ai' || aiThinking || viewIndex !== null) return;
    if (state.history.length === 0) return;
    const pair = [];
    let last = state.history[state.history.length - 1];
    if (last.color !== playerColor) {
      pair.unshift({ from: last.from, to: last.to, promotion: last.promotion });
      state = window.chessEngine.undo(GAME_ID);
      last = state.history[state.history.length - 1];
    }
    if (last && last.color === playerColor) {
      pair.unshift({ from: last.from, to: last.to, promotion: last.promotion });
      state = window.chessEngine.undo(GAME_ID);
    }
    if (pair.length === 0) return;
    undonePairs.push(pair);
    resultRecorded = false;
    board.render(state);
    App.syncMiniBoard(state, flipped);
    refreshUI();
  }

  function handleRedo() {
    if (params.mode !== 'ai' || aiThinking || viewIndex !== null || undonePairs.length === 0) return;
    const pair = undonePairs.pop();
    for (const mv of pair) {
      const result = window.chessEngine.move(GAME_ID, mv);
      if (result) state = result;
    }
    board.render(state);
    App.syncMiniBoard(state, flipped);
    refreshUI();
    checkGameEndFromState();
  }

  function onKeyDown(e) {
    if (!(e.ctrlKey || e.metaKey)) return;
    if (e.key.toLowerCase() === 'z') { e.preventDefault(); handleUndo(); }
    else if (e.key.toLowerCase() === 'y') { e.preventDefault(); handleRedo(); }
  }
  document.addEventListener('keydown', onKeyDown);

  undoBtn.addEventListener('click', handleUndo);
  redoBtn.addEventListener('click', handleRedo);

  flipBtn.addEventListener('click', () => {
    flipped = !flipped;
    board.setFlipped(flipped);
    App.syncMiniBoard(state, flipped);
  });

  suggestBtn.addEventListener('click', async () => {
    if (state.isGameOver) return;
    suggestBtn.disabled = true;
    suggestBtn.textContent = 'Thinking…';
    try {
      if (!advisor) {
        advisor = new StockfishAI();
        await advisor.setDifficulty('hard');
      }
      const uci = await advisor.getBestMove(viewIndex === null ? state.fen : getPositionAt(viewIndex).fen);
      if (uci) board.showSuggestion(uci.slice(0, 2), uci.slice(2, 4));
    } catch {
      showToast('Could not get a suggestion');
    }
    suggestBtn.disabled = false;
    suggestBtn.textContent = 'Suggest a Move';
  });

  popoutBtn.addEventListener('click', async () => {
    const open = await App.toggleMiniBoard();
    popoutBtn.textContent = open ? 'Close Pop-out' : 'Pop Out Board';
    if (open) App.syncMiniBoard(state, flipped);
  });

  App.setMiniMoveHandler((mv) => handleUserMove(mv.from, mv.to, mv.promotion));
  App.setMiniClosedHandler(() => { popoutBtn.textContent = 'Pop Out Board'; });

  newBtn.addEventListener('click', () => {
    stopClock();
    resultRecorded = false;
    viewIndex = null;
    undonePairs = [];
    whiteMs = params.timeControlMin ? params.timeControlMin * 60 * 1000 : null;
    blackMs = params.timeControlMin ? params.timeControlMin * 60 * 1000 : null;
    state = window.chessEngine.reset(GAME_ID);
    board.render(state);
    App.syncMiniBoard(state, flipped);
    refreshUI();
    if (params.mode === 'ai' && playerColor === 'b') maybeTriggerAiMove();
  });
  resignBtn.addEventListener('click', () => {
    if (params.mode === 'ai' && !resultRecorded && !state.isGameOver) finalizeGameResult('loss');
    stopClock();
    App.navigate('play-setup');
  });

  refreshUI();
  if (params.mode === 'ai' && playerColor === 'b') maybeTriggerAiMove();

  return () => {
    stopClock();
    document.removeEventListener('keydown', onKeyDown);
    App.setMiniMoveHandler(null);
    App.setMiniClosedHandler(null);
    if (ai) ai.terminate();
    if (advisor) advisor.terminate();
    window.chessEngine.destroy(REVIEW_ID);
  };
}
