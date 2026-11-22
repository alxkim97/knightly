// Exercise player shared by Learn lessons and Review sessions: a full-screen
// run through a list of exercises.
// Types: explain · tap · choice · move · line (scripts/build-course.js) and
// puzzle (multi-move, from Review).
// No lives: wrong answers cost nothing; they're scheduled for Review.
import { html, esc, ICON, showToast } from '../util.js';
import { App } from '../app.js';
import { ChessBoard } from '../board.js';
import { engine } from '../engine.js';
import { Sound } from '../sound.js';
import { pieceSVG } from '../pieces.js';
import { loadCourse, findCourseLesson } from '../content.js';
import { reviewLists, puzzleExercise, SESSION_SIZE } from '../review.js';

const EX_ID = 'course-ex';
const KIND = { explain: 'Learn', tap: 'Tap the square', choice: 'Pick one', move: 'Make the move', line: 'Play the line', puzzle: 'Puzzle' };
const sideOf = (fen) => (fen.split(' ')[1] === 'b' ? 'b' : 'w');
const uciOf = (from, to, promotion) => from + to + (promotion || '');

// cfg: { exercises, footer, quit(), onAnswer(ex, firstTry) → Promise, finish(stats) → { piece, eyebrow, title, note, xp, again() } }
function mountPlayer(container, cfg) {
  const { exercises } = cfg;
  const ov = html(`<div class="lesson-ov" role="dialog" aria-label="${esc(cfg.label)}">
    <div class="lo-top">
      <button type="button" class="icon-btn" id="lo-quit" aria-label="Quit">${ICON.x}</button>
      <div class="progress" aria-hidden="true"><i></i></div>
      <span class="chip streak" id="lo-streak"></span>
    </div>
    <div class="lo-body"><div class="split lo-split">
      <div class="board-col"><div class="board-frame"><div class="board-wrap"></div></div></div>
      <div class="panel" id="lo-panel"></div>
    </div></div>
    <div class="sheet" id="lo-sheet"></div>
  </div>`);
  container.appendChild(ov);
  const bar = ov.querySelector('.progress i');
  const panel = ov.querySelector('#lo-panel');
  const sheet = ov.querySelector('#lo-sheet');
  const boardWrap = ov.querySelector('.board-wrap');
  ov.querySelector('#lo-quit').addEventListener('click', cfg.quit);
  App.getProgress().then((p) => { ov.querySelector('#lo-streak').innerHTML = ICON.flame + (p.streak?.current || 0); });

  let idx = 0;
  let firstTry = 0;
  let scored = 0;
  let board = null;
  let ex = null;
  let st = null;
  let timer = null;

  const setProgress = (extra = 0) => { bar.style.width = `${Math.max(3, ((idx + extra) / exercises.length) * 100)}%`; };

  // ── Sheet ──
  let onPrimary = () => {};
  function sheetIdle(text, ready, label = 'Check') {
    sheet.className = 'sheet';
    sheet.innerHTML = `<div class="sheet-in"><div class="sheet-msg">${text || ''}</div><button type="button" class="btn" id="lo-primary" ${ready ? '' : 'disabled'}>${label}</button></div>`;
    sheet.querySelector('#lo-primary').addEventListener('click', () => onPrimary());
  }
  function sheetResult(ok, title, text, label) {
    sheet.className = `sheet ${ok ? 'ok' : 'bad'}`;
    sheet.innerHTML = `<div class="sheet-in"><div class="sheet-msg"><b>${esc(title)}</b>${esc(text || '')}</div><button type="button" class="btn ${ok ? 'ok' : 'bad'}" id="lo-primary">${label}</button></div>`;
    sheet.querySelector('#lo-primary').addEventListener('click', () => (ok ? next() : retry()));
    sheet.querySelector('#lo-primary').focus({ preventScroll: true });
  }

  // ── Results ──
  function settle() {
    if (ex.type === 'explain' || st.settled) return;
    st.settled = true;
    scored++;
    if (!st.missed) firstTry++;
    if (cfg.onAnswer) cfg.onAnswer(ex, !st.missed);
  }
  function correct(text) {
    settle();
    Sound.play('success');
    setProgress(1);
    sheetResult(true, st.missed ? 'Got it' : 'Correct', text || ex.good, 'Continue');
  }
  function markMissed() {
    if (st.missed) return;
    st.missed = true;
    if (cfg.onMiss) cfg.onMiss(ex);
  }
  function wrong(text) {
    markMissed();
    Sound.play('error');
    sheetResult(false, 'Not quite', text || ex.bad, 'Try again');
  }
  function next() { idx++; show(); }
  function retry() { show(true); }

  function makeBoard(fen, opts = {}) {
    clearTimeout(timer);
    const state = engine.reset(EX_ID, fen);
    board = new ChessBoard(boardWrap, { flipped: sideOf(fen) === 'b', ...opts });
    board.render(state);
    return state;
  }

  function show(isRetry = false) {
    if (idx >= exercises.length) { finish(); return; }
    ex = exercises[idx];
    if (!isRetry) st = { missed: false };
    st.pick = null;
    st.done = false;
    setProgress();
    panel.innerHTML = '';
    const card = html(`<section class="card pad ex-card"><span class="ex-type">${KIND[ex.type]} · ${idx + 1}/${exercises.length}</span><h2>${esc(ex.title)}</h2>${
      ex.type === 'explain' ? `<p class="ex-text">${esc(ex.text)}</p>` : ex.prompt ? `<p class="ex-text">${esc(ex.prompt)}</p>` : ''}<div class="ex-ans"></div></section>`);
    panel.appendChild(card);
    const foot = typeof cfg.footer === 'function' ? cfg.footer(ex) : cfg.footer;
    if (foot) panel.appendChild(html(`<p class="ex-foot small muted">${esc(foot)}</p>`));
    const ans = card.querySelector('.ex-ans');
    ({ explain: showExplain, tap: showTap, choice: showChoice, move: showMove, line: showLine, puzzle: showPuzzle })[ex.type](ans);
  }

  function showExplain() {
    makeBoard(ex.fen, { interactive: false });
    board.setMarks(ex.marks);
    if (ex.arrows) board.setArrows(ex.arrows);
    onPrimary = next;
    sheetIdle('', true, 'Continue');
  }

  function showTap(ans) {
    makeBoard(ex.fen, {
      interactive: false,
      onSquareClick: (sq) => {
        if (st.done) return;
        st.pick = sq;
        board.setMarks({ ...(ex.from ? { [ex.from]: 'hl' } : {}), [sq]: 'pick' });
        sheetIdle(`Selected <b class="mono">${sq}</b>`, true);
      },
    });
    board.setMarks(ex.from ? { [ex.from]: 'hl' } : {});
    ans.appendChild(html('<p class="hint small">Tap a square on the board, then Check.</p>'));
    onPrimary = () => {
      const ok = ex.answer.includes(st.pick);
      const marks = {};
      if (ex.from) marks[ex.from] = 'hl';
      if (ok && ex.answer.length > 1) ex.answer.forEach((s) => { marks[s] = 'dot'; });
      marks[st.pick] = ok ? 'good' : 'bad';
      board.setMarks(marks);
      if (ok) { st.done = true; correct(); } else wrong();
    };
    sheetIdle('', false);
  }

  function showChoice(ans) {
    makeBoard(ex.fen, { interactive: false });
    const opts = html('<div class="opts"></div>');
    ex.options.forEach((o, k) => {
      const b = html(`<button type="button" class="opt" data-k="${k}"><kbd>${k + 1}</kbd><span>${esc(o)}</span></button>`);
      b.addEventListener('click', () => pick(k));
      opts.appendChild(b);
    });
    ans.appendChild(opts);
    function pick(k) {
      if (st.done) return;
      st.pick = k;
      opts.querySelectorAll('.opt').forEach((b) => b.classList.toggle('sel', Number(b.dataset.k) === k));
      sheetIdle('', true);
    }
    st.pickFn = pick;
    onPrimary = () => {
      const ok = st.pick === ex.answer;
      const btn = opts.querySelector(`.opt[data-k="${st.pick}"]`);
      btn.classList.remove('sel');
      btn.classList.add(ok ? 'right' : 'wrong');
      if (ok) {
        st.done = true;
        const mv = ex.optionMoves && ex.optionMoves[ex.answer];
        if (mv) {
          const s = engine.move(EX_ID, { from: mv.slice(0, 2), to: mv.slice(2, 4), promotion: mv[4] });
          if (s) board.render(s);
        }
        correct();
      } else wrong();
    };
    sheetIdle('', false);
  }

  function moveHint(ans) {
    ans.appendChild(html(`<p class="hint small">${sideOf(ex.fen) === 'w' ? 'White' : 'Black'} to move. Drag a piece, or tap it and then tap a square.</p>`));
  }

  function showMove(ans) {
    makeBoard(ex.fen, {
      interactive: true,
      onUserMove: (from, to, promotion) => {
        if (st.done) return;
        const u = uciOf(from, to, promotion);
        const s = engine.move(EX_ID, { from, to, promotion });
        if (!s) return;
        board.render(s);
        board.interactive = false;
        st.done = true;
        const ok = ex.accept.includes(u) || (promotion && ex.accept.includes(uciOf(from, to)));
        board.setMarks({ [to]: ok ? 'good' : 'bad' });
        if (ok) correct(ex.goal === 'mate' && s.isCheckmate ? `Checkmate! ${ex.good}` : ex.good);
        else wrong(s.isStalemate ? 'That is stalemate: a draw. Look for a check that leaves no escape.' : ex.bad);
      },
    });
    moveHint(ans);
    onPrimary = () => {};
    sheetIdle(st.missed ? 'Have another go.' : '', false, 'Your move');
  }

  // Multi-move puzzle: you play the even moves of the solution, the
  // opponent's replies are played for you.
  function showPuzzle(ans) {
    let sol = 0;
    const total = Math.ceil(ex.solution.length / 2);
    const count = html(`<p class="hint small mono">Move 1 of ${total}</p>`);
    makeBoard(ex.fen, {
      interactive: true,
      onUserMove: (from, to, promotion) => {
        if (st.done) return;
        const u = uciOf(from, to, promotion);
        const expected = ex.solution[sol];
        const s = engine.move(EX_ID, { from, to, promotion });
        if (!s) return;
        board.render(s);
        // The board always promotes to a queen; accept the square match for an under-promotion.
        const ok = u === expected || (promotion && expected.length === 5 && u.slice(0, 4) === expected.slice(0, 4));
        if (!ok) {
          board.interactive = false;
          st.done = true;
          board.setMarks({ [to]: 'bad' });
          wrong();
          return;
        }
        sol++;
        if (sol >= ex.solution.length) { st.done = true; board.interactive = false; board.setMarks({ [to]: 'good' }); correct(); return; }
        board.interactive = false;
        sheetIdle('Good. Opponent replies…', false, 'Your move');
        timer = setTimeout(() => {
          if (!ov.isConnected) return;
          const r = ex.solution[sol];
          const s2 = engine.move(EX_ID, { from: r.slice(0, 2), to: r.slice(2, 4), promotion: r[4] });
          if (s2) board.render(s2);
          sol++;
          if (sol >= ex.solution.length) { st.done = true; correct(); return; }
          count.textContent = `Move ${Math.floor(sol / 2) + 1} of ${total}`;
          board.interactive = true;
          sheetIdle('Your move.', false, 'Your move');
        }, 500);
      },
    });
    moveHint(ans);
    ans.appendChild(count);
    onPrimary = () => {};
    sheetIdle(st.missed ? 'Have another go.' : '', false, 'Your move');
  }

  function showLine(ans) {
    let step = 0;
    const text = html(`<div class="lesson-text"><p>${esc(ex.intro)}</p></div>`);
    const steps = html('<div class="steps"></div>');
    ans.append(text, steps);
    const paint = () => { steps.innerHTML = ex.steps.map((_, k) => `<i class="${k < step ? 'd' : k === step ? 'c' : ''}"></i>`).join(''); };
    const prompt = () => {
      paint();
      text.querySelectorAll('.prompt').forEach((p) => p.remove());
      if (step >= ex.steps.length) {
        text.appendChild(html(`<p class="done-note">${esc(ex.completion)}</p>`));
        board.interactive = false;
        settle();
        Sound.play('success');
        setProgress(1);
        sheetResult(true, 'Line complete', '', 'Continue');
        return;
      }
      const s = ex.steps[step];
      text.appendChild(html(`<p class="prompt">Play <b class="mono">${esc(s.san)}</b> for ${engine.state(EX_ID).turn === 'w' ? 'White' : 'Black'}. The highlighted piece moves.</p>`));
      board._select(s.from);
      sheetIdle(`Move ${step + 1} of ${ex.steps.length}`, false, 'Your move');
    };
    makeBoard(ex.fen, {
      interactive: true,
      flipped: false, // lines are always shown from White's side
      onUserMove: (from, to, promotion) => {
        const s = ex.steps[step];
        if (!s) return;
        if (uciOf(s.from, s.to, s.promotion) !== uciOf(from, to, promotion)) {
          markMissed();
          Sound.play('error');
          showToast(`Not quite. Play ${s.san}.`);
          board._select(s.from);
          return;
        }
        const res = engine.move(EX_ID, { from, to, promotion });
        if (!res) return;
        board.render(res);
        Sound.play('move');
        text.querySelectorAll('.prompt').forEach((p) => p.remove());
        text.appendChild(html(`<p class="note"><b class="mono">${esc(s.san)}</b> ${esc(s.note)}</p>`));
        text.scrollTop = text.scrollHeight;
        step++;
        timer = setTimeout(() => { if (ov.isConnected) prompt(); }, 450);
      },
    });
    onPrimary = () => {};
    prompt();
  }

  async function finish() {
    bar.style.width = '100%';
    sheet.className = 'sheet';
    sheet.innerHTML = '';
    const pct = scored ? Math.round((firstTry / scored) * 100) : 100;
    const info = await cfg.finish({ firstTry, scored, pct });
    const after = await App.getProgress();
    const body = ov.querySelector('.lo-body');
    body.innerHTML = '';
    const fin = html(`<div class="finish">
      <div class="trophy" aria-hidden="true">${pieceSVG('w', info.piece || 'n')}</div>
      <div><div class="eyebrow">${esc(info.eyebrow)}</div><h2>${esc(info.title)}</h2></div>
      <p>${esc(info.note || '')}</p>
      <div class="tiles">
        <div class="card tile a"><span class="eyebrow">XP</span><b>+${info.xp}</b></div>
        <div class="card tile b"><span class="eyebrow">First try</span><b>${pct}%</b></div>
        <div class="card tile c"><span class="eyebrow">Streak</span><b>${after.streak?.current || 0}</b></div>
      </div>
      <div class="fin-btns">${info.again ? '<button type="button" class="btn ghost" id="again">Practice again</button>' : ''}<button type="button" class="btn" id="done">Continue</button></div>
    </div>`);
    body.appendChild(fin);
    if (info.again) fin.querySelector('#again').addEventListener('click', info.again);
    fin.querySelector('#done').addEventListener('click', cfg.quit);
    fin.querySelector('#done').focus({ preventScroll: true });
  }

  function onKey(e) {
    if (e.key === 'Escape') { cfg.quit(); return; }
    if (e.key === 'Enter' && !e.target.closest('.square')) {
      const b = sheet.querySelector('#lo-primary:not([disabled])') || ov.querySelector('#done');
      if (b && document.activeElement !== b) { e.preventDefault(); b.click(); }
      return;
    }
    if (ex && ex.type === 'choice' && st && !st.done && /^[1-9]$/.test(e.key) && Number(e.key) <= ex.options.length) st.pickFn(Number(e.key) - 1);
  }
  document.addEventListener('keydown', onKey);

  show();
  return () => { clearTimeout(timer); document.removeEventListener('keydown', onKey); engine.destroy(EX_ID); };
}

// Shared closing bookkeeping: streak + XP, and a friendly note.
async function award(xp) {
  const extended = await App.markStreakDay();
  const { goalReached } = await App.addXp(xp);
  const p = await App.getProgress();
  const parts = [];
  if (extended) parts.push(`Streak: ${p.streak.current} day${p.streak.current === 1 ? '' : 's'}.`);
  if (goalReached) parts.push('Daily goal reached.');
  return parts.join(' ');
}

// ── Learn lesson ─────────────────────────────────────────
export async function renderCourseLesson(container, params) {
  const course = await loadCourse();
  const found = findCourseLesson(course, params.lessonId);
  if (!found) { App.navigate('learn-hub'); return undefined; }
  const { unit, lesson } = found;
  return mountPlayer(container, {
    label: `Lesson: ${lesson.title}`,
    exercises: lesson.exercises,
    footer: `${unit.title} · ${lesson.title}. No lives: mistakes go to Review.`,
    quit: () => App.navigate(params.from || 'learn-hub'),
    onMiss: (ex) => App.recordMiss(ex.ref),
    async finish({ firstTry, pct }) {
      const progress = await App.getProgress();
      progress.course = progress.course || { done: {} };
      const prev = progress.course.done[lesson.id];
      const firstTime = !prev;
      const xp = firstTime ? 10 + firstTry * 2 + (lesson.checkpoint ? 10 : 0) : 5;
      progress.course.done[lesson.id] = {
        best: Math.max(pct, prev?.best || 0),
        plays: (prev?.plays || 0) + 1,
        first: prev?.first || new Date().toISOString(),
        last: new Date().toISOString(),
      };
      await App.saveProgress(progress);
      if (firstTime) App.addHistoryEntry({ type: 'lesson', title: lesson.title });
      let note = await award(xp);
      if (lesson.checkpoint && firstTime) note += ' The next unit is open.';
      if (!note) note = 'Practice counts for XP.';
      return {
        piece: lesson.piece, eyebrow: `Unit ${unit.n} · ${lesson.title}`,
        title: lesson.checkpoint ? 'Checkpoint passed' : 'Lesson complete',
        note, xp, again: () => App.navigate('course-lesson', params),
      };
    },
  });
}

// ── Review session ───────────────────────────────────────
export async function buildReviewExercises(progress, { early = false } = {}) {
  const course = await loadCourse();
  const byRef = {};
  course.units.forEach((u) => u.lessons.forEach((l) => l.exercises.forEach((x) => { byRef[x.ref] = { ex: x, lesson: l, unit: u }; })));
  const { due, upcoming } = reviewLists(progress);
  const pool = (early && !due.length ? upcoming : due).slice(0, SESSION_SIZE);
  const items = [];
  for (const it of pool) {
    if (it.ref.startsWith('pz:')) {
      if (it.data && it.data.fen) items.push({ ex: puzzleExercise(it.ref, it.data), source: 'Puzzle' });
    } else if (byRef[it.ref]) {
      items.push({ ex: byRef[it.ref].ex, source: `${byRef[it.ref].lesson.title}` });
    }
  }
  return items;
}

export async function renderReviewSession(container, params = {}) {
  const progress = await App.getProgress();
  const items = await buildReviewExercises(progress, { early: !!params.early });
  if (!items.length) { App.navigate('review'); return undefined; }
  const sources = new Map(items.map((i) => [i.ex.ref, i.source]));
  const outcomes = { learned: 0, next: 0, reset: 0 };
  // Practising early never pushes an item forward, only back if missed.
  return mountPlayer(container, {
    label: 'Review',
    exercises: items.map((i) => i.ex),
    footer: (ex) => `Review · from ${sources.get(ex.ref)}. Right first time moves it to a longer gap.`,
    quit: () => App.navigate('review'),
    // A miss counts the moment it happens (even if you quit afterwards);
    // a first-try answer moves the item on, except when practising early.
    onMiss: async (ex) => {
      const o = await App.recordReview(ex.ref, false);
      if (o) outcomes[o]++;
    },
    onAnswer: async (ex, firstTry) => {
      if (!firstTry || params.early) return;
      const o = await App.recordReview(ex.ref, true);
      if (o) outcomes[o]++;
    },
    async finish({ firstTry, scored }) {
      const xp = Math.max(5, firstTry * 3);
      App.addHistoryEntry({ type: 'review', count: scored, correct: firstTry });
      const parts = [await award(xp)];
      if (outcomes.next) parts.push(`${outcomes.next} moved to a longer gap.`);
      if (outcomes.learned) parts.push(`${outcomes.learned} learned for good.`);
      if (outcomes.reset) parts.push(`${outcomes.reset} back to tomorrow.`);
      if (params.early && !outcomes.reset) parts.push('Early practice keeps the schedule as it was.');
      return { piece: 'q', eyebrow: `${scored} position${scored === 1 ? '' : 's'}`, title: 'Review done', note: parts.filter(Boolean).join(' '), xp };
    },
  });
}
