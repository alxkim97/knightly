// Learn 2.0 lesson player: a full-screen run through one lesson's exercises.
// Types: explain · tap · choice · move · line (see scripts/build-course.js).
// No lives: wrong answers cost nothing but are remembered for Review, and a
// lesson can be replayed as often as you like.
import { html, esc, ICON, showToast } from '../util.js';
import { App } from '../app.js';
import { ChessBoard } from '../board.js';
import { engine } from '../engine.js';
import { Sound } from '../sound.js';
import { pieceSVG } from '../pieces.js';
import { loadCourse, findCourseLesson, exerciseCount } from '../content.js';

const EX_ID = 'course-ex';
const KIND = { explain: 'Learn', tap: 'Tap the square', choice: 'Pick one', move: 'Make the move', line: 'Play the line' };
const sideOf = (fen) => (fen.split(' ')[1] === 'b' ? 'b' : 'w');
const uciOf = (from, to, promotion) => from + to + (promotion || '');

export async function renderCourseLesson(container, params) {
  const course = await loadCourse();
  const found = findCourseLesson(course, params.lessonId);
  if (!found) { App.navigate('learn-hub'); return undefined; }
  const { unit, lesson } = found;
  const exercises = lesson.exercises;
  const scored = exerciseCount(lesson);

  const ov = html(`<div class="lesson-ov" role="dialog" aria-label="Lesson: ${esc(lesson.title)}">
    <div class="lo-top">
      <button type="button" class="icon-btn" id="lo-quit" aria-label="Quit lesson">${ICON.x}</button>
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
  const quit = () => App.navigate(params.from || 'learn-hub');
  ov.querySelector('#lo-quit').addEventListener('click', quit);
  App.getProgress().then((p) => { ov.querySelector('#lo-streak').innerHTML = ICON.flame + (p.streak?.current || 0); });

  let idx = 0;
  let firstTry = 0;
  let board = null;
  let ex = null;
  let st = null; // per-exercise state

  function setProgress(extra = 0) {
    bar.style.width = `${Math.max(3, ((idx + extra) / exercises.length) * 100)}%`;
  }

  // ── Sheet (bottom bar) ──
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
  let onPrimary = () => {};

  // ── Result handling ──
  function correct(text) {
    if (!st.missed) firstTry++;
    Sound.play('success');
    setProgress(1);
    sheetResult(true, st.missed ? 'Got it' : 'Correct', text || ex.good, 'Continue');
  }
  function wrong(text) {
    if (!st.missed) { st.missed = true; App.recordMiss(ex.ref); }
    Sound.play('error');
    sheetResult(false, 'Not quite', text || ex.bad, 'Try again');
  }
  function next() { idx++; show(); }
  function retry() { show(true); }

  // ── Board ──
  function makeBoard(fen, opts = {}) {
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
    panel.appendChild(html(`<p class="ex-foot small muted">${esc(unit.title)} · ${esc(lesson.title)}. No lives: mistakes go to Review.</p>`));
    const ans = card.querySelector('.ex-ans');
    ({ explain: showExplain, tap: showTap, choice: showChoice, move: showMove, line: showLine })[ex.type](ans);
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
    ans.appendChild(html(`<p class="hint small">Tap a square on the board, then Check.</p>`));
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
    ans.appendChild(html(`<p class="hint small">${sideOf(ex.fen) === 'w' ? 'White' : 'Black'} to move. Drag a piece, or tap it and then tap a square.</p>`));
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
        if (!st.missed) firstTry++;
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
      onUserMove: (from, to, promotion) => {
        const s = ex.steps[step];
        if (!s) return;
        if (uciOf(s.from, s.to, s.promotion) !== uciOf(from, to, promotion)) {
          if (!st.missed) { st.missed = true; App.recordMiss(ex.ref); }
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
        setTimeout(() => { if (ov.isConnected) prompt(); }, 450);
      },
    });
    board.flipped = false; board.setFlipped(false); // lines are always shown from White's side
    board.render(engine.state(EX_ID));
    onPrimary = () => {};
    prompt();
  }

  // ── Finish ──
  async function finish() {
    setProgress();
    bar.style.width = '100%';
    const progress = await App.getProgress();
    progress.course = progress.course || { done: {} };
    const prev = progress.course.done[lesson.id];
    const pct = scored ? Math.round((firstTry / scored) * 100) : 100;
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
    const extended = await App.markStreakDay();
    const { goalReached } = await App.addXp(xp);
    const after = await App.getProgress();

    sheet.className = 'sheet';
    sheet.innerHTML = '';
    const body = ov.querySelector('.lo-body');
    body.innerHTML = '';
    const fin = html(`<div class="finish">
      <div class="trophy" aria-hidden="true">${pieceSVG('w', lesson.piece || 'n')}</div>
      <div><div class="eyebrow">Unit ${unit.n} · ${esc(lesson.title)}</div><h2>${lesson.checkpoint ? 'Checkpoint passed' : 'Lesson complete'}</h2></div>
      <p>${extended ? `Streak: ${after.streak.current} day${after.streak.current === 1 ? '' : 's'}.` : `Practice counts for XP.`}${goalReached ? ' Daily goal reached.' : ''}${lesson.checkpoint && firstTime ? ' The next unit is open.' : ''}</p>
      <div class="tiles">
        <div class="card tile a"><span class="eyebrow">XP</span><b>+${xp}</b></div>
        <div class="card tile b"><span class="eyebrow">First try</span><b>${pct}%</b></div>
        <div class="card tile c"><span class="eyebrow">Streak</span><b>${after.streak?.current || 0}</b></div>
      </div>
      <div class="fin-btns"><button type="button" class="btn ghost" id="again">Practice again</button><button type="button" class="btn" id="done">Continue</button></div>
    </div>`);
    body.appendChild(fin);
    fin.querySelector('#again').addEventListener('click', () => App.navigate('course-lesson', params));
    fin.querySelector('#done').addEventListener('click', quit);
    fin.querySelector('#done').focus({ preventScroll: true });
  }

  function onKey(e) {
    if (e.key === 'Escape') { quit(); return; }
    if (e.key === 'Enter' && !e.target.closest('.square')) {
      const b = sheet.querySelector('#lo-primary:not([disabled])') || ov.querySelector('#done');
      if (b && document.activeElement !== b) { e.preventDefault(); b.click(); }
      return;
    }
    if (ex && ex.type === 'choice' && st && !st.done && /^[1-9]$/.test(e.key) && Number(e.key) <= ex.options.length) st.pickFn(Number(e.key) - 1);
  }
  document.addEventListener('keydown', onKey);

  show();
  return () => { document.removeEventListener('keydown', onKey); engine.destroy(EX_ID); };
}
