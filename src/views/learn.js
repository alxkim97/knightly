import { html, esc, el, showToast } from '../util.js';
import { App } from '../app.js';
import { ChessBoard } from '../board.js';
import { engine } from '../engine.js';
import { Sound } from '../sound.js';
import { loadLessons, firstIncomplete, CATEGORIES, CATEGORY_LABEL } from '../content.js';
import { pageTop, backLink } from './common.js';
import { unitCard } from './home.js';

const LESSON_ID = 'lesson';

export async function renderLearnHub(container) {
  const [progress, lessons] = await Promise.all([App.getProgress(), loadLessons()]);
  const completed = new Set(progress.lessons?.completedIds || []);
  const next = firstIncomplete(lessons, completed);
  container.appendChild(pageTop('Learn', `Interactive lessons: play each move yourself and see why it works. ${completed.size} of ${lessons.length} done.`));
  const grid = html('<div class="bento"></div>');
  CATEGORIES.forEach((cat, i) => {
    const card = unitCard(cat, i, lessons, completed, next?.id);
    card.classList.add('c-4');
    grid.appendChild(card);
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
    App.getProgress().then((progress) => {
      progress.lessons = progress.lessons || { completedIds: [] };
      if (progress.lessons.completedIds.includes(lesson.id)) return;
      progress.lessons.completedIds.push(lesson.id);
      App.saveProgress(progress).then(() => {
        App.addXp(15);
        App.addHistoryEntry({ type: 'lesson', title: lesson.title });
      });
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
