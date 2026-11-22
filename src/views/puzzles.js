import { html, esc, showToast, ICON } from '../util.js';
import { App } from '../app.js';
import { ChessBoard, boardThumb } from '../board.js';
import { engine, boardFromFen } from '../engine.js';
import { Sound } from '../sound.js';
import { pieceSVG } from '../pieces.js';
import { platform } from '../platform.js';
import { loadPuzzleBank, getDailyPuzzle, LEVELS, LEVEL_LABEL, sideToMove } from '../content.js';
import { pageTop, backLink } from './common.js';

const PUZZLE_ID = 'puzzle';
const PAGE = 24;

export async function renderPuzzlesHub(container, params = {}) {
  const [progress, bank] = await Promise.all([App.getProgress(), loadPuzzleBank()]);
  const solvedIds = new Set(progress.puzzles?.solvedIds || []);
  const streak = progress.puzzles?.dailyStreak || 0;

  const chips = html(`<div class="chips"><span class="chip">${ICON.check}${solvedIds.size} solved</span>${streak ? `<span class="chip streak">${ICON.flame}${streak} day streak</span>` : ''}</div>`);
  container.appendChild(pageTop('Puzzles', 'Find the best move. The daily puzzle comes from Lichess; the library works offline.', chips));

  // Daily hero
  const hero = html(`<section class="hero puzzle-hero"><div class="hb"><div class="thumb ph"></div></div><div class="hero-tx">
    <div class="eyebrow">Puzzle of the day</div><h2>Loading…</h2><p>Fetching today's puzzle.</p>
    <div class="hero-row"><button type="button" class="btn" disabled>Solve</button><span class="meta"></span></div></div>
    <div class="hero-deco" aria-hidden="true">${pieceSVG('w', 'k')}</div><div class="px" aria-hidden="true"><i></i><i></i><i></i></div></section>`);
  container.appendChild(hero);
  getDailyPuzzle().then((pz) => {
    if (!hero.isConnected) return;
    const side = sideToMove(pz.fen);
    hero.querySelector('.hb').replaceChildren(boardThumb(boardFromFen(pz.fen), { flipped: side === 'b' }));
    hero.querySelector('h2').textContent = `${side === 'w' ? 'White' : 'Black'} to play`;
    hero.querySelector('p').textContent = solvedIds.has(pz.id) ? 'Solved today. Come back tomorrow for a new one.' : 'Solve it today to keep your puzzle streak going.';
    hero.querySelector('.meta').textContent = `Rating ${pz.rating} · ${LEVEL_LABEL[pz.level] || pz.level}`;
    const b = hero.querySelector('button');
    b.disabled = false;
    b.textContent = solvedIds.has(pz.id) ? 'Solve again' : 'Solve';
    b.addEventListener('click', () => App.navigate('puzzle-solve', { puzzle: pz }));
  });

  // Library
  let level = params.level || 'all';
  let shown = PAGE;
  const head = html('<div class="lib-head"><h2 class="sec-h">Library</h2></div>');
  const filters = html(`<div class="seg" role="group" aria-label="Level">${['all', ...LEVELS].map((l) => `<button type="button" data-l="${l}">${l === 'all' ? 'All' : LEVEL_LABEL[l]}</button>`).join('')}</div>`);
  head.appendChild(filters);
  const grid = html('<div class="pz-grid"></div>');
  const more = html('<button type="button" class="btn ghost more" hidden>Show more</button>');
  container.append(head, grid, more);

  function list() { return level === 'all' ? bank : bank.filter((p) => p.level === level); }
  function paint() {
    filters.querySelectorAll('[data-l]').forEach((b) => b.classList.toggle('on', b.dataset.l === level));
    const items = list();
    grid.innerHTML = '';
    items.slice(0, shown).forEach((p) => {
      const side = sideToMove(p.fen);
      const card = html(`<button type="button" class="card pz-card ${solvedIds.has(p.id) ? 'solved' : ''}"><span class="pz-thumb"></span>
        <span class="pz-tx"><b>${side === 'w' ? 'White' : 'Black'} to play</b><span class="mono small">${p.rating} · ${esc(LEVEL_LABEL[p.level] || p.level)}</span>
        <span class="tags">${(p.themes || []).slice(0, 2).map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</span></span>
        ${solvedIds.has(p.id) ? `<span class="pz-done" title="Solved">${ICON.check}</span>` : ''}</button>`);
      card.querySelector('.pz-thumb').appendChild(boardThumb(boardFromFen(p.fen), { flipped: side === 'b' }));
      card.addEventListener('click', () => App.navigate('puzzle-solve', { puzzle: p, level }));
      grid.appendChild(card);
    });
    more.hidden = items.length <= shown;
  }
  filters.querySelectorAll('[data-l]').forEach((b) => b.addEventListener('click', () => { level = b.dataset.l; shown = PAGE; paint(); }));
  more.addEventListener('click', () => { shown += PAGE; paint(); });
  paint();
}

export function renderPuzzleSolve(container, params) {
  const puzzle = params.puzzle;
  if (!puzzle) { App.navigate('puzzles-hub'); return undefined; }

  let state = engine.reset(PUZZLE_ID, puzzle.fen);
  const solverColor = state.turn;
  const flipped = solverColor === 'b';

  container.appendChild(backLink('Puzzles', 'puzzles-hub', { level: params.level }));
  const layout = html(`<div class="split">
    <div class="board-col"><div class="board-frame"><div class="board-wrap"></div></div></div>
    <div class="panel">
      <section class="card pad">
        <span class="ex-type">${puzzle.daily ? 'Puzzle of the day' : 'Puzzle'} · ${esc(LEVEL_LABEL[puzzle.level] || puzzle.level)}</span>
        <h2>${solverColor === 'w' ? 'White' : 'Black'} to play</h2>
        <div class="stat-strip"><div><span>Rating</span><b class="mono">${puzzle.rating}</b></div><div><span>Moves</span><b class="mono" id="mv-count">0 / ${Math.ceil(puzzle.solution.length / 2)}</b></div></div>
        <div class="tags">${(puzzle.themes || []).slice(0, 4).map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</div>
        <div class="status-line" id="status">Find the best move.</div>
      </section>
      <div class="btn-row">
        <button type="button" class="btn ghost sm" id="hint">Hint</button>
        <button type="button" class="btn ghost sm" id="solution">Show solution</button>
        <button type="button" class="btn ghost sm" id="retry">Retry</button>
        ${platform.hasMiniBoard ? `<button type="button" class="btn ghost sm" id="popout">${App.miniBoardOpen ? 'Close pop-out' : 'Pop out board'}</button>` : ''}
        <button type="button" class="btn sm" id="next" hidden>Next puzzle</button>
      </div>
    </div></div>`);
  container.appendChild(layout);
  const statusLine = layout.querySelector('#status');
  const mvCount = layout.querySelector('#mv-count');
  const nextBtn = layout.querySelector('#next');
  const popoutBtn = layout.querySelector('#popout');

  let solIdx = 0;
  let solved = false;
  let locked = false;

  const board = new ChessBoard(layout.querySelector('.board-wrap'), { interactive: true, flipped, onUserMove: handleMove });
  board.render(state);
  App.syncMiniBoard(state, flipped);

  function setStatus(text, tone = '') { statusLine.textContent = text; statusLine.className = `status-line ${tone}`; }
  function paintCount() { mvCount.textContent = `${Math.ceil(solIdx / 2)} / ${Math.ceil(puzzle.solution.length / 2)}`; }

  if (popoutBtn) {
    popoutBtn.addEventListener('click', async () => {
      const open = await App.toggleMiniBoard();
      popoutBtn.textContent = open ? 'Close pop-out' : 'Pop out board';
      if (open) App.syncMiniBoard(state, flipped);
    });
    App.setMiniMoveHandler((mv) => handleMove(mv.from, mv.to, mv.promotion));
    App.setMiniClosedHandler(() => { popoutBtn.textContent = 'Pop out board'; });
  }

  function uciOf(from, to, promotion) { return from + to + (promotion || ''); }

  function applyForcedReply() {
    const uci = puzzle.solution[solIdx];
    const mv = { from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci.length > 4 ? uci.slice(4) : undefined };
    const result = engine.move(PUZZLE_ID, mv);
    if (result) { state = result; board.render(state); App.syncMiniBoard(state, flipped); }
    solIdx++;
    paintCount();
  }

  async function showNext() {
    const bank = await loadPuzzleBank();
    const progress = await App.getProgress();
    const done = new Set(progress.puzzles?.solvedIds || []);
    const pool = bank.filter((p) => (puzzle.level ? p.level === puzzle.level : true) && !done.has(p.id) && p.id !== puzzle.id);
    const pick = pool[0] || bank.find((p) => !done.has(p.id) && p.id !== puzzle.id);
    if (pick) { nextBtn.hidden = false; nextBtn.onclick = () => App.navigate('puzzle-solve', { puzzle: pick, level: params.level }); }
  }

  function finishSolved() {
    if (solved) return;
    solved = true;
    setStatus('Solved. Well done.', 'good');
    board.interactive = false;
    showNext();
    App.getProgress().then((progress) => {
      progress.puzzles = progress.puzzles || { solvedIds: [] };
      const firstTime = !progress.puzzles.solvedIds.includes(puzzle.id);
      if (firstTime) progress.puzzles.solvedIds.push(puzzle.id);
      if (puzzle.daily) {
        const today = new Date().toISOString().slice(0, 10);
        if (progress.puzzles.lastDailyDate !== today) {
          const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
          progress.puzzles.dailyStreak = progress.puzzles.lastDailyDate === yesterday ? (progress.puzzles.dailyStreak || 0) + 1 : 1;
          progress.puzzles.lastDailyDate = today;
        }
      }
      App.saveProgress(progress).then(() => {
        if (firstTime) {
          App.addXp(10);
          App.addHistoryEntry({ type: 'puzzle', level: puzzle.level, rating: puzzle.rating });
        }
      });
    });
  }

  function handleMove(from, to, promotion) {
    if (locked || solved) return;
    if (state.turn !== solverColor) return;
    if (puzzle.solution[solIdx] !== uciOf(from, to, promotion)) {
      Sound.play('error');
      setStatus('Not quite. Try again.', 'bad');
      board.clearSelection();
      return;
    }
    const result = engine.move(PUZZLE_ID, { from, to, promotion });
    if (!result) return;
    state = result;
    board.render(state);
    App.syncMiniBoard(state, flipped);
    solIdx++;
    paintCount();
    if (solIdx >= puzzle.solution.length) { Sound.play('success'); finishSolved(); return; }
    Sound.play(result.history[result.history.length - 1]?.captured ? 'capture' : 'move');
    locked = true;
    board.interactive = false;
    setStatus('Good. Opponent replies…');
    setTimeout(() => {
      if (!layout.isConnected) return;
      applyForcedReply();
      locked = false;
      board.interactive = true;
      if (solIdx >= puzzle.solution.length) { Sound.play('success'); finishSolved(); } else setStatus('Your move.');
    }, 500);
  }

  layout.querySelector('#hint').addEventListener('click', () => {
    if (solved || locked) return;
    const expected = puzzle.solution[solIdx];
    board._select(expected.slice(0, 2));
    showToast('Hint: move the piece on ' + expected.slice(0, 2));
  });

  layout.querySelector('#solution').addEventListener('click', () => {
    if (solved) return;
    locked = true;
    board.interactive = false;
    const step = () => {
      if (!layout.isConnected) return;
      if (solIdx >= puzzle.solution.length) { finishSolved(); locked = false; return; }
      applyForcedReply();
      if (solIdx < puzzle.solution.length) setTimeout(step, 500); else { finishSolved(); locked = false; }
    };
    step();
  });

  layout.querySelector('#retry').addEventListener('click', () => {
    solved = false;
    locked = false;
    solIdx = 0;
    nextBtn.hidden = true;
    state = engine.reset(PUZZLE_ID, puzzle.fen);
    board.render(state);
    App.syncMiniBoard(state, flipped);
    board.interactive = true;
    paintCount();
    setStatus('Find the best move.');
  });

  return () => {
    App.setMiniMoveHandler(null);
    App.setMiniClosedHandler(null);
  };
}
