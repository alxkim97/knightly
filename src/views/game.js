// Live game: vs computer or pass and play. Logic is v1's game-view.js
// unchanged in behaviour (premove, undo/redo pairs, review, clocks, pop-out
// sync); only the layout and module wiring are new.
import { html, el, esc, ICON, showToast } from '../util.js';
import { App } from '../app.js';
import { ChessBoard } from '../board.js';
import { engine } from '../engine.js';
import { Sound } from '../sound.js';
import { StockfishAI, DIFFICULTY_PRESETS, thinkDelay } from '../ai.js';
import * as Analysis from '../analysis.js';
import { summariseReview } from '../insights.js';
import { newId } from '../sync.js';
import { reviewPanel, momentsFrom } from './review-panel.js';
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
      <section class="card pad board-tools"><label class="bt-size"><span>Board size</span><input type="range" min="60" max="100" step="5" aria-label="Board size"></label><button type="button" class="btn ghost sm" id="pieces-btn">Pieces</button></section>
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
  let gameId = newId();
  let turnStartedAt = Date.now();
  let userTimes = [];          // seconds you spent on each of your moves
  let resigned = false;
  let overEmitted = false;     // result screen / recording already handled for this game
  let finalResult = null;
  let finalHow = '';
  let overlayEl = null;
  let overlayTimer = null;
  let recordedId = null;
  let reviewUI = null;
  let reviewCls = '';
  let alive = true;

  // Board size (this device only) and the pieces picker.
  const sizeInput = layout.querySelector('.bt-size input');
  const applySize = () => layout.style.setProperty('--bscale', String((App.settings.boardScale || 100) / 100));
  sizeInput.value = String(App.settings.boardScale || 100);
  applySize();
  sizeInput.addEventListener('input', () => { App.settings.boardScale = Number(sizeInput.value); applySize(); });
  sizeInput.addEventListener('change', () => App.saveSettings());
  const piecesBtn = layout.querySelector('#pieces-btn');
  piecesBtn.addEventListener('click', () => App.togglePiecePicker(piecesBtn));

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
    onGameOver('time');
  }

  // ── Result recording ──
  function finalizeGameResult(playerResult) {
    if (resultRecorded) return;
    resultRecorded = true;
    finalResult = playerResult;
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
      onGameOver('checkmate');
    } else if (state.isStalemate || state.isDraw) {
      finalizeGameResult('draw');
      stopClock();
      onGameOver(state.isStalemate ? 'stalemate' : 'draw');
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
    return !aiThinking && !resigned && !state.isGameOver && (!isAI || state.turn === playerColor);
  }

  // ── UI refresh ──
  function refreshUI() {
    const dim = (c) => (c === 'w' ? 'White' : 'Black');
    if (resigned) setStatus('You resigned.', 'bad');
    else if (state.isCheckmate) setStatus(`Checkmate. ${dim(state.turn === 'w' ? 'b' : 'w')} wins.`, 'bad');
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
      const mark = (k) => { const g = reviewCls[k]; return g === 'i' || g === 'm' || g === 'x' ? Analysis.GRADES[g].sym : ''; };
      const gcls = (k) => { const g = reviewCls[k]; return g === 'i' || g === 'm' || g === 'x' ? ` mv-g-${g}` : ''; };
      const whiteMove = el('span', 'mv-move' + gcls(i), (state.history[i]?.san || '') + mark(i));
      whiteMove.dataset.idx = String(i + 1);
      whiteMove.addEventListener('click', () => showView(i + 1));
      moveList.appendChild(whiteMove);
      if (state.history[i + 1]) {
        const blackMove = el('span', 'mv-move' + gcls(i + 1), state.history[i + 1].san + mark(i + 1));
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
    undoBtn.disabled = aiThinking || resigned || state.history.length === 0;
    redoBtn.disabled = aiThinking || resigned || undonePairs.length === 0;
  }

  function maybeTriggerAiMove() {
    if (!isAI || state.isGameOver || aiThinking || resigned) return;
    if (state.turn === playerColor) return;
    aiThinking = true;
    const epoch = moveEpoch;
    const askedAt = performance.now();
    refreshUI();
    ai.pickMove(state.fen, state.legalMoves).then(async (mv) => {
      if (epoch !== moveEpoch) return;
      // Pause like a person would: shorter when it's obvious, longer when it
      // isn't, and slower overall at the higher levels.
      if (mv) {
        const last = state.history[state.history.length - 1];
        const want = thinkDelay(params.difficulty, {
          plies: state.history.length, legalCount: state.legalMoves.length,
          recapture: !!(last && last.captured && state.legalMoves.some((m) => m.to === last.to && m.captured)),
        });
        const wait = want - (performance.now() - askedAt);
        if (wait > 0) await new Promise((r) => setTimeout(r, wait));
        if (epoch !== moveEpoch) return;
      }
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
      turnStartedAt = Date.now();
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
    userTimes.push(Math.min(600, Math.round((Date.now() - turnStartedAt) / 1000)));
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
    if (!isAI || aiThinking || viewIndex !== null || resigned) return;
    if (state.history.length === 0) return;
    if (overEmitted) discardFinishedGame();
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
    userTimes.pop();
    turnStartedAt = Date.now();
    undonePairs.push(pair);
    resultRecorded = false;
    board.render(state);
    App.syncMiniBoard(state, flipped);
    refreshUI();
  }

  function handleRedo() {
    if (!isAI || aiThinking || resigned || viewIndex !== null || undonePairs.length === 0) return;
    const pair = undonePairs.pop();
    userTimes.push(5);
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
    discardFinishedGame(true);
    stopClock();
    resultRecorded = false;
    viewIndex = null;
    undonePairs = [];
    pendingPremove = null;
    moveEpoch++;
    aiThinking = false;
    resigned = false;
    userTimes = [];
    turnStartedAt = Date.now();
    gameId = newId();
    resignBtn.textContent = isAI ? 'Resign' : 'End game';
    resignBtn.className = 'btn sm danger';
    whiteMs = params.timeControlMin ? params.timeControlMin * 60000 : null;
    blackMs = whiteMs;
    state = engine.reset(GAME_ID);
    board.render(state);
    App.syncMiniBoard(state, flipped);
    refreshUI();
    if (isAI && playerColor === 'b') maybeTriggerAiMove();
  });
  resignBtn.addEventListener('click', () => {
    if (isAI && !resultRecorded && !state.isGameOver && !resigned) {
      resigned = true;
      stopClock();
      board.interactive = false;
      finalizeGameResult('loss');
      resignBtn.textContent = 'Back to Play';
      resignBtn.className = 'btn sm ghost';
      refreshUI();
      onGameOver('resign');
      return;
    }
    stopClock();
    App.navigate('play-setup');
  });

  // ── Game over: record it, put up the result screen, start the review ──
  const ucisNow = () => state.history.map((m) => m.from + m.to + (m.promotion || ''));
  const openingLabel = () => {
    const h = state.history;
    if (!h.length) return '';
    return playerColor === 'w' ? `1. ${h[0].san}` : `vs 1. ${h[0].san}${h[1] ? ` → ${h[1].san}` : ''}`;
  };

  function onGameOver(how) {
    if (overEmitted) return;
    overEmitted = true;
    finalHow = how;
    const plies = state.history.length;
    if (isAI && plies >= 4) {
      const id = gameId;
      recordedId = id;
      const ucis = ucisNow();
      App.recordGame({ id, date: new Date().toISOString(), mode: 'ai', difficulty: params.difficulty, color: playerColor, result: finalResult, how, plies, moves: ucis.join(' '), tm: userTimes.slice(), open: openingLabel(), tc: params.timeControlMin || null });
      const job = Analysis.startAnalysis(id, ucis);
      // Save the summary even if you have left this screen by then.
      job.promise.then((res) => {
        App.updateGame(id, { summary: summariseReview(res, playerColor) });
        if (alive && gameId === id) { reviewCls = res.cls; refreshUI(); paintOverlayAccuracy(res); }
      }).catch(() => { /* engine failed to load: the game stays recorded without a review */ });
    }
    overlayTimer = setTimeout(showResultOverlay, 700);
  }

  // Undo after the game ended: that game never happened.
  function discardFinishedGame(quiet) {
    clearTimeout(overlayTimer);
    closeOverlay();
    if (reviewUI) { reviewUI.el.remove(); reviewUI = null; }
    if (recordedId) { App.removeGame(recordedId); recordedId = null; }
    overEmitted = false;
    finalResult = null;
    reviewCls = '';
    if (!quiet) gameId = newId();
  }

  function closeOverlay() { if (overlayEl) { overlayEl.remove(); overlayEl = null; } }

  function resultText() {
    if (isAI) {
      if (finalResult === 'win') return { tone: 'good', title: 'You won', eyebrow: finalHow === 'time' ? 'The computer ran out of time' : 'Checkmate' };
      if (finalResult === 'draw') return { tone: 'warn', title: 'Draw', eyebrow: finalHow === 'stalemate' ? 'Stalemate' : 'Game drawn' };
      return { tone: 'bad', title: 'You lost', eyebrow: finalHow === 'resign' ? 'You resigned' : finalHow === 'time' ? 'You ran out of time' : 'Checkmate' };
    }
    if (finalResult === 'draw') return { tone: 'warn', title: 'Draw', eyebrow: finalHow === 'stalemate' ? 'Stalemate' : 'Game drawn' };
    return { tone: 'good', title: finalResult === 'white-won' ? 'White wins' : 'Black wins', eyebrow: finalHow === 'time' ? 'On time' : 'Checkmate' };
  }

  function showResultOverlay() {
    if (!alive || !overEmitted) return;
    closeOverlay();
    const r = resultText();
    const xp = isAI ? (finalResult === 'win' ? 20 : finalResult === 'draw' ? 5 : 2) : 0;
    const plies = state.history.length;
    const reviewable = plies >= 4;
    const kingColor = isAI ? playerColor : (finalResult === 'black-won' ? 'b' : 'w');
    overlayEl = html(`<div class="result-ov" role="dialog" aria-modal="true" aria-label="Game result">
      <div class="result-card ${r.tone}">
        <button type="button" class="icon-btn rc-x" aria-label="Close">${ICON.x}</button>
        <div class="rc-mark">${pieceSVG(kingColor, 'k')}</div>
        <div class="rc-eyebrow">${esc(r.eyebrow)}</div>
        <h2 class="rc-title">${esc(r.title)}</h2>
        <div class="rc-stats">
          <div><b>${Math.ceil(plies / 2)}</b><span>moves</span></div>
          ${isAI ? `<div><b>+${xp}</b><span>XP</span></div>` : ''}
          ${isAI && reviewable ? '<div class="rc-acc"><b>…</b><span>accuracy</span></div>' : ''}
        </div>
        <div class="rc-btns">
          ${reviewable ? '<button type="button" class="btn" id="rc-review">Review game</button>' : ''}
          <button type="button" class="btn ghost" id="rc-again">${isAI ? 'Play again' : 'New game'}</button>
          <button type="button" class="btn ghost" id="rc-back">Back to Play</button>
        </div></div></div>`);
    overlayEl.addEventListener('pointerdown', (e) => { if (e.target === overlayEl) closeOverlay(); });
    overlayEl.querySelector('.rc-x').addEventListener('click', closeOverlay);
    overlayEl.querySelector('#rc-again').addEventListener('click', () => { closeOverlay(); newBtn.click(); });
    overlayEl.querySelector('#rc-back').addEventListener('click', () => { closeOverlay(); App.navigate('play-setup'); });
    const rv = overlayEl.querySelector('#rc-review');
    if (rv) rv.addEventListener('click', () => { closeOverlay(); openReview(); });
    container.appendChild(overlayEl);
    // Accuracy fills in when the review finishes.
    const job = Analysis.getAnalysisJob(gameId);
    if (job && job.done && job.result) paintOverlayAccuracy(job.result);
  }
  function paintOverlayAccuracy(res) {
    const box = overlayEl && overlayEl.querySelector('.rc-acc b');
    if (!box) return;
    const acc = isAI ? res[playerColor].acc : null;
    box.textContent = acc != null ? `${acc}%` : '–';
  }

  // ── Review card ──
  function openReview() {
    if (reviewUI) { reviewUI.el.scrollIntoView({ block: 'nearest' }); return; }
    reviewUI = reviewPanel({
      you: isAI ? playerColor : null,
      goto: (i) => showView(i >= state.history.length ? null : i),
      arrow: (uci) => { if (uci) board.showSuggestion(uci.slice(0, 2), uci.slice(2, 4)); else board.clearSuggestion(); },
      onClose: () => { reviewUI.el.remove(); reviewUI = null; showView(null); board.clearSuggestion(); },
      onInsights: isAI ? () => App.navigate('insights') : null,
    });
    playersCard.after(reviewUI.el);
    const ucis = ucisNow();
    const id = gameId;
    const job = Analysis.startAnalysis(id, ucis);
    const stop = job.onProgress((p) => { if (reviewUI && !job.done) reviewUI.setProgress(p); });
    job.promise.then((res) => {
      stop();
      if (!reviewUI || gameId !== id) return;
      reviewCls = res.cls;
      const you = isAI ? playerColor : null;
      const summary = you
        ? { acc: res[you].acc, accOpp: res[you === 'w' ? 'b' : 'w'].acc, n: res[you].n }
        : { acc: res.w.acc, accOpp: res.b.acc, n: Object.fromEntries(['b', 'g', 'i', 'm', 'x'].map((k) => [k, res.w.n[k] + res.b.n[k]])) };
      reviewUI.setReview(summary, momentsFrom(res, you), you ? {} : { you: 'White accuracy', them: 'Black accuracy' });
      refreshUI();
    }).catch((err) => { stop(); if (reviewUI) reviewUI.setError(err && err.message); });
  }

  refreshUI();
  if (isAI && playerColor === 'b') maybeTriggerAiMove();

  return () => {
    alive = false;
    clearTimeout(overlayTimer);
    closeOverlay();
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
