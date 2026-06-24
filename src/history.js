const HISTORY_ICON = { game: '♞', puzzle: '♟', lesson: '♛' };

function formatHistoryDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) +
    ' · ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function historyDescription(entry) {
  if (entry.type === 'game') {
    const who = entry.mode === 'ai' ? `vs Computer (${entry.difficulty || ''})` : 'Pass & Play';
    return who;
  }
  if (entry.type === 'puzzle') return `Puzzle · Rating ${entry.rating ?? '?'} · ${entry.level || ''}`;
  if (entry.type === 'lesson') return entry.title || 'Lesson';
  return entry.type || 'Activity';
}

const GAME_RESULT_LABEL = {
  win: ['good', 'Won'], loss: ['bad', 'Lost'], draw: ['warn', 'Draw'],
  'white-won': ['good', 'White won'], 'black-won': ['good', 'Black won'],
};

function historyResultBadge(entry) {
  if (entry.type === 'game' && entry.result) {
    const [cls, label] = GAME_RESULT_LABEL[entry.result] || ['warn', entry.result];
    return el('span', `status-line ${cls}`, label);
  }
  if (entry.type === 'puzzle') return el('span', 'status-line good', 'Solved');
  if (entry.type === 'lesson') return el('span', 'status-line good', 'Completed');
  return null;
}

async function renderHistory(container) {
  container.innerHTML = '';
  const backLink = el('div', 'back-link', '← Back to Home');
  backLink.addEventListener('click', () => App.navigate('home'));
  container.appendChild(backLink);

  container.appendChild(el('h1', null, 'History'));
  container.appendChild(el('p', 'sub', 'Your recent games, puzzles, and lessons.'));

  const progress = await App.getProgress();
  const entries = progress.history || [];

  if (entries.length === 0) {
    container.appendChild(el('p', 'sub', 'Nothing here yet — play a game, solve a puzzle, or finish a lesson.'));
    return;
  }

  const list = el('div', 'puzzle-list');
  entries.forEach((entry) => {
    const row = el('div', 'puzzle-row');
    row.style.cursor = 'default';
    const left = el('div', null);
    left.appendChild(el('div', null, `${HISTORY_ICON[entry.type] || '•'} ${historyDescription(entry)}`));
    left.appendChild(el('div', 'lesson-progress', formatHistoryDate(entry.date)));
    row.appendChild(left);
    const badge = historyResultBadge(entry);
    if (badge) { badge.style.fontSize = '13px'; row.appendChild(badge); }
    list.appendChild(row);
  });
  container.appendChild(list);
}
