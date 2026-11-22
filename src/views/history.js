import { html } from '../util.js';
import { App } from '../app.js';
import { pageTop, backLink, activityList } from './common.js';

const FILTERS = [['all', 'All'], ['game', 'Games'], ['puzzle', 'Puzzles'], ['lesson', 'Lessons']];

export async function renderHistory(container) {
  const progress = await App.getProgress();
  const entries = progress.history || [];
  container.appendChild(backLink('Home', 'home'));
  container.appendChild(pageTop('History', 'Your last 50 games, puzzles and lessons.'));

  let filter = 'all';
  const seg = html(`<div class="seg" role="group" aria-label="Filter">${FILTERS.map(([k, n]) => `<button type="button" data-k="${k}">${n}</button>`).join('')}</div>`);
  const card = html('<section class="card pad"></section>');
  function paint() {
    seg.querySelectorAll('[data-k]').forEach((b) => b.classList.toggle('on', b.dataset.k === filter));
    card.replaceChildren(activityList(filter === 'all' ? entries : entries.filter((e) => e.type === filter)));
  }
  seg.querySelectorAll('[data-k]').forEach((b) => b.addEventListener('click', () => { filter = b.dataset.k; paint(); }));
  container.append(seg, card);
  paint();
}
