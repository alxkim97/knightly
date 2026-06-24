const LESSON_ID = 'lesson';
let _lessonCache = null;

async function loadLessons() {
  if (_lessonCache) return _lessonCache;
  const res = await fetch('data/lessons.json');
  _lessonCache = await res.json();
  return _lessonCache;
}

const CATEGORY_LABEL = { opening: 'Openings', midgame: 'Midgame', endgame: 'Endgame' };
const CATEGORY_DESC = {
  opening: 'Learn the ideas behind well-known openings, one move at a time.',
  midgame: 'Core principles for the phase where most games are decided.',
  endgame: 'Essential checkmating and technique patterns every player needs.',
};

async function renderLearnHub(container) {
  container.innerHTML = '';
  container.appendChild(el('h1', null, 'Learn'));
  container.appendChild(el('p', 'sub', 'Interactive lessons on openings, midgame strategy, and endgame technique.'));

  const lessons = await loadLessons();
  const progress = await App.getProgress();
  const completed = new Set(progress.lessons?.completedIds || []);

  for (const cat of ['opening', 'midgame', 'endgame']) {
    const heading = el('h2', null, CATEGORY_LABEL[cat]);
    heading.style.marginTop = '24px';
    container.appendChild(heading);
    container.appendChild(el('p', 'sub', CATEGORY_DESC[cat]));

    const grid = el('div', 'module-grid');
    lessons.filter((l) => l.category === cat).forEach((l) => {
      const row = el('div', 'module-row');
      const left = el('div', null);
      left.appendChild(el('div', null, l.title));
      left.appendChild(el('div', 'lesson-progress', `${l.steps.length} step${l.steps.length === 1 ? '' : 's'}`));
      row.appendChild(left);
      row.appendChild(el('span', 'done-check', completed.has(l.id) ? '✓ Done' : ''));
      row.addEventListener('click', () => App.navigate('lesson', { lessonId: l.id }));
      grid.appendChild(row);
    });
    container.appendChild(grid);
  }
}

async function renderLesson(container, params) {
  container.innerHTML = '';
  const lessons = await loadLessons();
  const lesson = lessons.find((l) => l.id === params.lessonId);
  if (!lesson) { App.navigate('learn-hub'); return; }

  const backLink = el('div', 'back-link', `← Back to ${CATEGORY_LABEL[lesson.category]}`);
  backLink.addEventListener('click', () => App.navigate('learn-hub'));

  const layout = el('div', 'game-layout');
  const boardWrap = el('div', 'board-wrap');
  const sidePanel = el('div', 'side-panel');

  const textBox = el('div', 'lesson-text');
  const progressLine = el('div', 'lesson-progress');
  const btnRow = el('div', 'btn-row');
  const restartBtn = el('button', 'btn secondary', 'Restart');
  btnRow.append(restartBtn);

  sidePanel.append(el('h2', null, lesson.title), textBox, progressLine, btnRow);
  layout.append(boardWrap, sidePanel);
  container.append(backLink, layout);

  let stepIdx = 0;
  let state = window.chessEngine.reset(LESSON_ID, lesson.startFen);
  const board = new ChessBoard(boardWrap, { interactive: true, onUserMove: handleMove });
  board.render(state);

  function uciOf(from, to, promotion) { return from + to + (promotion || ''); }

  function showStep() {
    if (stepIdx >= lesson.steps.length) {
      textBox.innerHTML = '';
      textBox.appendChild(el('p', null, lesson.completion));
      progressLine.textContent = 'Lesson complete!';
      board.interactive = false;
      markComplete();
      return;
    }
    textBox.innerHTML = '';
    if (stepIdx === 0) textBox.appendChild(el('p', null, lesson.intro));
    const step = lesson.steps[stepIdx];
    textBox.appendChild(el('p', null, `Play: ${step.san} — the glowing square shows which piece to move.`));
    progressLine.textContent = `Step ${stepIdx + 1} of ${lesson.steps.length}`;
    board._select(step.from);
  }

  function markComplete() {
    App.getProgress().then((progress) => {
      progress.lessons = progress.lessons || { completedIds: [] };
      const firstTime = !progress.lessons.completedIds.includes(lesson.id);
      if (firstTime) {
        progress.lessons.completedIds.push(lesson.id);
        App.saveProgress(progress).then(() => {
          App.addXp(15);
          App.addHistoryEntry({ type: 'lesson', title: lesson.title });
        });
      }
    });
  }

  function handleMove(from, to, promotion) {
    if (stepIdx >= lesson.steps.length) return;
    const step = lesson.steps[stepIdx];
    const expected = uciOf(step.from, step.to, step.promotion);
    const attempted = uciOf(from, to, promotion);
    if (expected !== attempted) {
      Sound.play('error');
      showToast(`Not quite — try ${step.san}`);
      board._select(step.from);
      return;
    }
    const result = window.chessEngine.move(LESSON_ID, { from, to, promotion });
    if (!result) return;
    state = result;
    board.render(state);
    Sound.play(stepIdx + 1 >= lesson.steps.length ? 'success' : 'move');
    textBox.appendChild(el('p', null, step.note));
    stepIdx++;
    setTimeout(showStep, 600);
  }

  restartBtn.addEventListener('click', () => {
    stepIdx = 0;
    state = window.chessEngine.reset(LESSON_ID, lesson.startFen);
    board.render(state);
    board.interactive = true;
    showStep();
  });

  showStep();
}
