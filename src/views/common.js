import { html, esc, ICON } from '../util.js';
import { App } from '../app.js';

export function pageTop(title, sub, right) {
  const node = html(`<div class="page-top"><div class="pt-text"><h1>${esc(title)}</h1>${sub ? `<p>${esc(sub)}</p>` : ''}</div></div>`);
  if (right) node.appendChild(right);
  return node;
}

export function backLink(label, view, params) {
  const node = html(`<button type="button" class="back-link">${ICON.back}<span>${esc(label)}</span></button>`);
  node.addEventListener('click', () => App.navigate(view, params));
  return node;
}

export function greeting() {
  const h = new Date().getHours();
  if (h < 5) return 'Late night';
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

export function formatDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' · '
    + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

const RESULT = {
  win: ['g', 'W', 'Won'], loss: ['r', 'L', 'Lost'], draw: ['y', '½', 'Draw'],
  'white-won': ['g', '1-0', 'White won'], 'black-won': ['g', '0-1', 'Black won'],
};
const DIFF_LABEL = { beginner: 'Beginner', easy: 'Easy', intermediate: 'Intermediate', advanced: 'Advanced', hard: 'Hard', expert: 'Expert' };

// One history entry → { tone, mark, title, sub } for activity lists.
export function describeEntry(e) {
  if (e.type === 'game') {
    const [tone, mark, word] = RESULT[e.result] || ['y', '?', e.result || 'Game'];
    const who = e.mode === 'ai' ? `vs Computer · ${DIFF_LABEL[e.difficulty] || ''}` : 'Pass and play';
    return { tone, mark, title: `${word} · ${who}`, sub: formatDate(e.date) };
  }
  if (e.type === 'puzzle') return { tone: 'g', mark: '✓', title: `Puzzle solved · ${e.rating ?? '?'}`, sub: formatDate(e.date) };
  if (e.type === 'lesson') return { tone: 'g', mark: '✓', title: `Lesson · ${e.title || ''}`, sub: formatDate(e.date) };
  return { tone: '', mark: '•', title: e.type || 'Activity', sub: formatDate(e.date) };
}

export function activityList(entries) {
  if (!entries.length) return html('<p class="empty">Nothing yet. Play a game, solve a puzzle or finish a lesson and it shows up here.</p>');
  return html(`<div class="act">${entries.map((e) => {
    const d = describeEntry(e);
    return `<div class="act-row"><span class="ic ${d.tone}">${esc(d.mark)}</span><div class="tx">${esc(d.title)}<span>${esc(d.sub)}</span></div></div>`;
  }).join('')}</div>`);
}
