import { html, esc, el, showToast, ICON } from '../util.js';
import { App } from '../app.js';
import { ChessBoard } from '../board.js';
import { engine } from '../engine.js';
import { Sound } from '../sound.js';
import { pieceSVG } from '../pieces.js';
import { loadLessons, loadCourse, courseState, exerciseCount, CATEGORY_LABEL, CATEGORY_PIECE } from '../content.js';
import { todayXp } from '../streak.js';
import { pageTop, backLink } from './common.js';

const LESSON_ID = 'lesson';

// One unit of the Learn path as a card of lesson tiles.
export function courseUnitCard(u, opts = {}) {
  const card = html(`<section class="card unit ${u.lessons.some((l) => l.state === 'next') ? 'cur' : ''} ${u.unlocked ? '' : 'locked'}">
    <div class="unit-h"><div class="unit-n">${u.unlocked ? u.n : ICON.lock || u.n}</div><div class="unit-t"><h3>${esc(u.title)}</h3><span>${esc(u.unlocked ? u.sub : `Pass the Unit ${u.n - 1} checkpoint to unlock`)}</span></div>
    <div class="pct">${u.doneCount}/${u.lessons.length}<div class="bar"><i style="width:${(u.doneCount / u.lessons.length) * 100}%"></i></div></div></div>
    <div class="lessons"></div></section>`);
  if (opts.compact) card.classList.add('compact');
  const wrap = card.querySelector('.lessons');
  u.lessons.forEach((l) => {
    const sub = { done: 'Done · practise', next: 'Up next', open: `${exerciseCount(l)} exercises`, locked: 'Locked' }[l.state];
    const icon = l.state === 'done' ? ICON.check : l.state === 'locked' ? ICON.lock : pieceSVG(l.state === 'next' ? 'b' : 'w', l.piece || 'p');
    const b = html(`<button type="button" class="ls ${l.state} ${l.checkpoint ? 'ckpt' : ''}" title="${esc(l.title)}"><span class="g">${icon}</span><span class="t"><b>${esc(l.title)}</b><span>${esc(sub)}</span></span></button>`);
    b.addEventListener('click', () => {
      if (l.state === 'locked') { showToast(`Pass the Unit ${u.n - 1} checkpoint to unlock this unit.`); return; }
      App.navigate('course-lesson', { lessonId: l.id, from: opts.from || 'learn-hub' });
    });
    wrap.appendChild(b);
  });
  return card;
}

export async function renderLearnHub(container) {
  const [progress, course, classics] = await Promise.all([App.getProgress(), loadCourse(), loadLessons()]);
  const cs = courseState(course, progress);
  const total = cs.units.reduce((n, u) => n + u.lessons.length, 0);
  const done = cs.units.reduce((n, u) => n + u.doneCount, 0);
  const goal = App.settings.dailyGoal || 50;
  const chips = html(`<div class="chips"><span class="chip streak">${ICON.flame}${progress.streak?.current || 0} day streak</span><span class="chip xp">${ICON.bolt}${todayXp(progress)}/${goal} XP today</span></div>`);
  container.appendChild(pageTop('Learn', `${done} of ${total} lessons done. Short lessons, unlimited practice, no lives.`, chips));

  const path = html('<div class="path"></div>');
  cs.units.forEach((u) => path.appendChild(courseUnitCard(u)));
  container.appendChild(path);

  // The original move-by-move lessons stay available as a library.
  const completed = new Set(progress.lessons?.completedIds || []);
  container.appendChild(html('<div class="lib-head"><h2 class="sec-h">Classic lines</h2><p class="small muted">Openings and ideas played move by move, both sides.</p></div>'));
  const grid = html('<div class="classics"></div>');
  classics.forEach((l) => {
    const b = html(`<button type="button" class="ls ${completed.has(l.id) ? 'done' : ''}"><span class="g">${completed.has(l.id) ? ICON.check : pieceSVG('w', CATEGORY_PIECE[l.category])}</span><span class="t"><b>${esc(l.title)}</b><span>${esc(CATEGORY_LABEL[l.category])} · ${l.steps.length} ${l.steps.length === 1 ? 'move' : 'moves'}</span></span></button>`);
    b.addEventListener('click', () => App.navigate('lesson', { lessonId: l.id }));
    grid.appendChild(b);
  });
  container.appendChild(grid);
}

export async function renderLesson(container, params) {
  const lessons = await loadLessons();
  const idx = lessons.findIndex((l) => l.id === params.lessonId);
  const lesson = lessons[idx];
  if (!lesson) { App.navigate('learn-hub'); return; }

  container.appendChild(backLink('Learn', 'learn-hub'));
  const layout = html(`<div class="split">
    <div class="board-col"><div class="board-frame"><div class="board-wrap"></div></div></div>
    <div class="panel">
      <section class="card pad lesson-card">
        <span class="ex-type">${esc(CATEGORY_LABEL[lesson.category])} · Lesson</span>
        <h2>${esc(lesson.title)}</h2>
        <div class="lesson-text"></div>
        <div class="steps"></div>
        <div class="lesson-progress mono small"></div>
      </section>
      <div class="btn-row"><button type="button" class="btn ghost sm" id="restart">Restart</button><button type="button" class="btn sm" id="next-lesson" hidden>Next lesson</button></div>
    </div></div>`);
  container.appendChild(layout);
  const textBox = layout.querySelector('.lesson-text');
  const stepsBar = layout.querySelector('.steps');
  const progressLine = layout.querySelector('.lesson-progress');
  const nextBtn = layout.querySelector('#next-lesson');

  let stepIdx = 0;
  let state = engine.reset(LESSON_ID, lesson.startFen);
  const board = new ChessBoard(layout.querySelector('.board-wrap'), { interactive: true, onUserMove: handleMove });
  board.render(state);

  function uciOf(from, to, promotion) { return from + to + (promotion || ''); }

  function paintSteps() {
    stepsBar.innerHTML = lesson.steps.map((_, k) => `<i class="${k < stepIdx ? 'd' : k === stepIdx ? 'c' : ''}"></i>`).join('');
  }

  function showStep() {
    paintSteps();
    if (stepIdx >= lesson.steps.length) {
      textBox.appendChild(el('p', 'done-note', lesson.completion));
      progressLine.textContent = 'Lesson complete · +15 XP the first time';
      board.interactive = false;
      markComplete();
      const nextLesson = lessons[idx + 1];
      if (nextLesson) {
        nextBtn.hidden = false;
        nextBtn.textContent = `Next: ${nextLesson.title}`;
      }
      return;
    }
    if (stepIdx === 0) { textBox.innerHTML = ''; textBox.appendChild(el('p', null, lesson.intro)); }
    const step = lesson.steps[stepIdx];
    const prompt = el('p', 'prompt');
    prompt.innerHTML = `Play <b class="mono">${esc(step.san)}</b>. The highlighted square shows which piece moves.`;
    textBox.querySelectorAll('.prompt').forEach((p) => p.remove());
    textBox.appendChild(prompt);
    progressLine.textContent = `Move ${stepIdx + 1} of ${lesson.steps.length}`;
    board._select(step.from);
  }

  function markComplete() {
    App.getProgress().then(async (progress) => {
      // Any finished lesson keeps the streak alive, even a replay.
      if (await App.markStreakDay()) showToast('Streak extended');
      progress.lessons = progress.lessons || { completedIds: [] };
      if (progress.lessons.completedIds.includes(lesson.id)) return;
      progress.lessons.completedIds.push(lesson.id);
      await App.saveProgress(progress);
      App.addXp(15);
      App.addHistoryEntry({ type: 'lesson', title: lesson.title });
    });
  }

  function handleMove(from, to, promotion) {
    if (stepIdx >= lesson.steps.length) return;
    const step = lesson.steps[stepIdx];
    if (uciOf(step.from, step.to, step.promotion) !== uciOf(from, to, promotion)) {
      Sound.play('error');
      showToast(`Not quite. Try ${step.san}.`);
      board._select(step.from);
      return;
    }
    const result = engine.move(LESSON_ID, { from, to, promotion });
    if (!result) return;
    state = result;
    board.render(state);
    Sound.play(stepIdx + 1 >= lesson.steps.length ? 'success' : 'move');
    textBox.querySelectorAll('.prompt').forEach((p) => p.remove());
    const note = el('p', 'note');
    note.innerHTML = `<b class="mono">${esc(step.san)}</b> ${esc(step.note)}`;
    textBox.appendChild(note);
    stepIdx++;
    paintSteps();
    setTimeout(showStep, 600);
  }

  layout.querySelector('#restart').addEventListener('click', () => {
    stepIdx = 0;
    nextBtn.hidden = true;
    state = engine.reset(LESSON_ID, lesson.startFen);
    board.render(state);
    board.interactive = true;
    showStep();
  });
  nextBtn.addEventListener('click', () => App.navigate('lesson', { lessonId: lessons[idx + 1].id }));

  showStep();
}
