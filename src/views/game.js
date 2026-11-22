// Live game: vs computer or pass and play. Logic is v1's game-view.js
// unchanged in behaviour (premove, undo/redo pairs, review, clocks, pop-out
// sync); only the layout and module wiring are new.
import { html, el, showToast } from '../util.js';
import { App } from '../app.js';
import { ChessBoard } from '../board.js';
import { engine } from '../engine.js';
import { Sound } from '../sound.js';
import { StockfishAI, DIFFICULTY_PRESETS } from '../ai.js';
import { pieceSVG } from '../pieces.js';
import { platform } from '../platform.js';
import { backLink } from './common.js';

const GAME_ID = 'main-game';
const REVIEW_ID = 'main-game-review';
const PIECE_VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

function buildCapturedRows(history) {
  const capturedByWhite = [];
  const capturedByBlack = [];
  for (const m of history) {
    if (m.captured) (m.color === 'w' ? capturedByWhite : capturedByBlack).push(m.captured);
  }
  const order = 'qrbnp';
  const sort = (a) => a.sort((x, y) => order.indexOf(x) - order.indexOf(y));
  return { capturedByWhite: sort(capturedByWhite), capturedByBlack: sort(capturedByBlack) };
}
const materialValue = (types) => types.reduce((sum, t) => sum + (PIECE_VALUE[t] || 0), 0);

function formatClock(ms) {
  if (ms < 0) ms = 0;
  const totalSec = Math.ceil(ms / 1000);
  return `${Math.floor(totalSec / 60)}:${String(totalSec % 60).padStart(2, '0')}`;
}

export function renderGame(container, params) {
  const isAI = params.mode === 'ai';
  const playerColor = params.playerColor || 'w';
  const preset = DIFFICULTY_PRESETS.find((p) => p.key === params.difficulty);

  container.appendChild(backLink('Play', 'play-setup'));
  const layout = html(`<div class="split">
    <div class="board-col"><div class="board-frame"><div class="board-wrap"></div></div><div class="review-row"></div></div>
    <div class="panel">
      <section class="card pad players">
        <div class="player" data-color="b"><span class="av">${pieceSVG('b', 'k')}</span><div class="nm"><b></b><span class="cap"></span></div><span class="clock" hidden></span></div>
        <div class="status-line" id="status">White to move</div>
        <div class="player" data-color="w"><span class="av">${pieceSVG('w', 'k')}</span><div class="nm"><b></b><span class="cap"></span></div><span class="clock" hidden></span></div>
      </section>
      <section class="card pad"><div class="blk-h">Moves</div><div class="move-list"></div></section>
      <div class="btn-row game-btns"></div>
    </div></div>`);
  container.appendChild(layout);

  const boardWrap = layout.querySelector('.board-wrap');
  const reviewRow = layout.querySelector('.review-row');
  const playersCard = layout.querySelector('.players');
  const statusLine = layout.querySelector('#status');
  const moveList = layout.querySelector('.move-list');
  const rows = { w: layout.querySelector('.player[data-color="w"]'), b: layout.querySelector('.player[data-color="b"]') };
  const nameOf = (c) => {
    if (!isAI) return c === 'w' ? 'White' : 'Black';
    return c === playerColor ? 'You' : `Computer · ${preset?.label || ''}`;
  };
  rows.w.querySelector('b').textContent = nameOf('w');
  rows.b.querySelector('b').textContent = nameOf('b');
  if (params.timeControlMin) Object.values(rows).forEach((r) => { r.querySelector('.clock').hidden = false; });

  const btnRow = layout.querySelector('.game-btns');
  const mk = (label, cls = 'btn ghost sm') => el('button', cls, label);
  const flipBtn = mk('Flip');
  const undoBtn = mk('Undo');
  const redoBtn = mk('Redo');
  const suggestBtn = mk('Hint');
  const popoutBtn = platform.hasMiniBoard ? mk(App.miniBoardOpen ? 'Close pop-out' : 'Pop out board') : null;
  const newBtn = mk('New game');
  const resignBtn = mk(isAI ? 'Resign' : 'End game', 'btn sm danger');
  [flipBtn, isAI && undoBtn, isAI && redoBtn, suggestBtn, popoutBtn, newBtn, resignBtn].filter(Boolean).forEach((b) => { b.type = 'button'; btnRow.appendChild(b); });
  undoBtn.title = 'Ctrl+Z';
  redoBtn.title = 'Ctrl+Y';

  let flipped = isAI && playerColor === 'b';
  let aiThinking = false;
  const ai = isAI ? new StockfishAI() : null;
  let advisor = null;
  let viewIndex = null; // null = live position; otherwise number of moves shown
  let resultRecorded = false;
  let undonePairs = [];
  let pendingPremove = null;
  let moveEpoch = 0; // bumped on reset to invalidate in-flight AI replies

  // Top player row = the side at the top of the board.
  function placeRows() {
    const top = flipped ? 'w' : 'b';
    const bottom = top === 'w' ? 'b' : 'w';
    playersCard.prepend(rows[top]);
    playersCard.append(rows[bottom]);
  }
  placeRows();

  let state = engine.reset(GAME_ID);
  const board = new ChessBoard(boardWrap, {
    interactive: true,
    flipped,
    onUserMove: handleUserMove,
    premoveColor: isAI ? playerColor : null,
    onPremove: (from, to, promotion) => {
      pendingPremove = { from, to, promotion };
      board.showPremove(from, to);
      showToast(`Premove queued: ${from}–${to}. Right-click to cancel.`);
    },
    onPremoveClear: () => { pendingPremove = null; },
  });
  board.render(state);
  App.syncMiniBoard(state, flipped);

  if (ai) ai.setDifficulty(params.difficulty).catch(() => showToast('The engine failed to load'));

  // ── Clock ──
  let whiteMs = params.timeControlMin ? params.timeControlMin * 60000 : null;
  let blackMs = whiteMs;
  let clockTimer = null;
  let lastTick = Date.now();

  function renderClocks() {
    if (!params.timeControlMin) return;
    rows.w.querySelector('.clock').textContent = formatClock(whiteMs);
    rows.b.querySelector('.clock').textContent = formatClock(blackMs);
    rows.w.querySelector('.clock').classList.toggle('on', state.turn === 'w' && !state.isGameOver);
    rows.b.querySelector('.clock').classList.toggle('on', state.turn === 'b' && !state.isGameOver);
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
        endGameByTimeout(whiteMs <= 0 ? 'w' : 'b');
      }
      renderClocks();
    }, 250);
  }
  function stopClock() { if (clockTimer) { clearInterval(clockTimer); clockTimer = null; } }

  function setStatus(text, tone = '') { statusLine.textContent = text; statusLine.className = `status-line ${tone}`; }

  function endGameByTimeout(loserColor) {
    stopClock();
    state.isGameOver = true;
    setStatus(`Time's up. ${loserColor === 'w' ? 'Black' : 'White'} wins on time.`, 'bad');
    board.interactive = false;
    if (isAI) finalizeGameResult(loserColor === playerColor ? 'loss' : 'win');
    else finalizeGameResult(loserColor === 'w' ? 'black-won' : 'white-won');
  }

  // ── Result recording ──
  function finalizeGameResult(playerResult) {
    if (resultRecorded) return;
    resultRecorded = true;
    if (isAI) {
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
      if (isAI) finalizeGameResult(winnerColor === playerColor ? 'win' : 'loss');
      else finalizeGameResult(winnerColor === 'w' ? 'white-won' : 'black-won');
      stopClock();
    } else if (state.isStalemate || state.isDraw) {
      finalizeGameResult('draw');
      stopClock();
    }
  }

  // ── Review ──
  function getPositionAt(idx) {
    if (idx === 0) { const s = engine.reset(REVIEW_ID); s.history = []; return s; }
    const histEntry = state.history[idx - 1];
    const s = engine.reset(REVIEW_ID, histEntry.after);
    s.history = [histEntry];
    return s;
  }
  function showView(idx) {
    const total = state.history.length;
    viewIndex = idx === null || idx >= total ? null : Math.max(0, idx);
    if (viewIndex === null) { board.interactive = computeInteractive(); board.render(state); }
    else { board.interactive = false; board.render(getPositionAt(viewIndex)); }
    renderReviewRow();
    paintMoveListActive();
  }
  function renderReviewRow() {
    reviewRow.innerHTML = '';
    const total = state.history.length;
    if (total === 0) return;
    const prevBtn = mk('◀');
    const nextBtn = mk('▶');
    const liveBtn = mk('Live');
    [prevBtn, nextBtn, liveBtn].forEach((b) => { b.type = 'button'; });
    prevBtn.setAttribute('aria-label', 'Previous move');
    nextBtn.setAttribute('aria-label', 'Next move');
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
    moveList.querySelectorAll('.mv-move').forEach((node) => node.classList.toggle('mv-active', Number(node.dataset.idx) === viewIndex));
  }
  function computeInteractive() {
    return !aiThinking && !state.isGameOver && (!isAI || state.turn === playerColor);
  }

  // ── UI refresh ──
  function refreshUI() {
    const dim = (c) => (c === 'w' ? 'White' : 'Black');
    if (state.isCheckmate) setStatus(`Checkmate. ${dim(state.turn === 'w' ? 'b' : 'w')} wins.`, 'bad');
    else if (state.isStalemate) setStatus('Stalemate. Draw.', 'warn');
    else if (state.isDraw) setStatus('Draw.', 'warn');
    else if (state.isCheck) setStatus(`${dim(state.turn)} to move. Check!`, 'bad');
    else if (aiThinking) setStatus('Computer is thinking…');
    else setStatus(isAI ? (state.turn === playerColor ? 'Your move' : 'Computer to move') : `${dim(state.turn)} to move`);

    const { capturedByWhite, capturedByBlack } = buildCapturedRows(state.history);
    const diff = materialValue(capturedByWhite) - materialValue(capturedByBlack);
    const capHTML = (types, color, adv) => types.map((t) => `<span class="cp">${pieceSVG(color, t)}</span>`).join('') + (adv > 0 ? `<span class="material-diff">+${adv}</span>` : '');
    rows.w.querySelector('.cap').innerHTML = capHTML(capturedByWhite, 'b', diff);
    rows.b.querySelector('.cap').innerHTML = capHTML(capturedByBlack, 'w', -diff);

    moveList.innerHTML = '';
    if (!state.history.length) moveList.appendChild(el('span', 'empty small', 'No moves yet.'));
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
    if (!isAI || state.isGameOver || aiThinking) return;
    if (state.turn === playerColor) return;
    aiThinking = true;
    const epoch = moveEpoch;
    refreshUI();
    ai.pickMove(state.fen, state.legalMoves).then((mv) => {
      if (epoch !== moveEpoch) return;
      aiThinking = false;
      if (!mv) { refreshUI(); return; }
      const result = engine.move(GAME_ID, mv);
      if (result) {
        state = result;
        viewIndex = null;
        board.render(state);
        App.syncMiniBoard(state, flipped);
        playMoveSound(state);
      }
      refreshUI();
      checkGameEndFromState();
      if (!state.isGameOver && state.turn === playerColor && pendingPremove) {
        const pm = pendingPremove;
        pendingPremove = null;
        board.clearPremove();
        handleUserMove(pm.from, pm.to, pm.promotion);
      }
    }).catch(() => {
      if (epoch !== moveEpoch) return;
      aiThinking = false; refreshUI(); showToast('The computer could not move');
    });
  }

  function playMoveSound(s) {
    const lastMv = s.history[s.history.length - 1];
    if (s.isCheckmate || s.isCheck) Sound.play('check');
    else if (lastMv && lastMv.captured) Sound.play('capture');
    else Sound.play('move');
  }

  function handleUserMove(from, to, promotion) {
    if (viewIndex !== null) return; // read-only while reviewing
    // The pop-out board is always interactive, so this is the real gate
    // against moving the computer's pieces from there.
    if (isAI && state.turn !== playerColor) return;
    const result = engine.move(GAME_ID, { from, to, promotion });
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
    if (!isAI || aiThinking || viewIndex !== null) return;
    if (state.history.length === 0) return;
    const pair = [];
    let lastMv = state.history[state.history.length - 1];
    if (lastMv.color !== playerColor) {
      pair.unshift({ from: lastMv.from, to: lastMv.to, promotion: lastMv.promotion });
      state = engine.undo(GAME_ID);
      lastMv = state.history[state.history.length - 1];
    }
    if (lastMv && lastMv.color === playerColor) {
      pair.unshift({ from: lastMv.from, to: lastMv.to, promotion: lastMv.promotion });
      state = engine.undo(GAME_ID);
    }
    if (pair.length === 0) return;
    undonePairs.push(pair);
    resultRecorded = false;
    board.render(state);
    App.syncMiniBoard(state, flipped);
    refreshUI();
  }

  function handleRedo() {
    if (!isAI || aiThinking || viewIndex !== null || undonePairs.length === 0) return;
    const pair = undonePairs.pop();
    for (const mv of pair) {
      const result = engine.move(GAME_ID, mv);
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
    placeRows();
    App.syncMiniBoard(state, flipped);
  });

  suggestBtn.addEventListener('click', async () => {
    if (state.isGameOver) return;
    suggestBtn.disabled = true;
    suggestBtn.textContent = 'Thinking…';
    try {
      if (!advisor) {
        const candidate = new StockfishAI();
        await candidate.setDifficulty('hard');
        advisor = candidate; // cache only once init succeeded
      }
      const uci = await advisor.getBestMove(viewIndex === null ? state.fen : getPositionAt(viewIndex).fen);
      if (uci) board.showSuggestion(uci.slice(0, 2), uci.slice(2, 4));
    } catch {
      if (advisor) { advisor.terminate(); advisor = null; }
      showToast('Could not get a hint');
    }
    suggestBtn.disabled = false;
    suggestBtn.textContent = 'Hint';
  });

  if (popoutBtn) {
    popoutBtn.addEventListener('click', async () => {
      const open = await App.toggleMiniBoard();
      popoutBtn.textContent = open ? 'Close pop-out' : 'Pop out board';
      if (open) App.syncMiniBoard(state, flipped);
    });
    App.setMiniMoveHandler((mv) => handleUserMove(mv.from, mv.to, mv.promotion));
    App.setMiniClosedHandler(() => { popoutBtn.textContent = 'Pop out board'; });
  }

  newBtn.addEventListener('click', () => {
    stopClock();
    resultRecorded = false;
    viewIndex = null;
    undonePairs = [];
    pendingPremove = null;
    moveEpoch++;
    aiThinking = false;
    whiteMs = params.timeControlMin ? params.timeControlMin * 60000 : null;
    blackMs = whiteMs;
    state = engine.reset(GAME_ID);
    board.render(state);
    App.syncMiniBoard(state, flipped);
    refreshUI();
    if (isAI && playerColor === 'b') maybeTriggerAiMove();
  });
  resignBtn.addEventListener('click', () => {
    if (isAI && !resultRecorded && !state.isGameOver) finalizeGameResult('loss');
    stopClock();
    App.navigate('play-setup');
  });

  refreshUI();
  if (isAI && playerColor === 'b') maybeTriggerAiMove();

  return () => {
    stopClock();
    moveEpoch++;
    document.removeEventListener('keydown', onKeyDown);
    App.setMiniMoveHandler(null);
    App.setMiniClosedHandler(null);
    if (ai) ai.terminate();
    if (advisor) advisor.terminate();
    engine.destroy(REVIEW_ID);
  };
}
