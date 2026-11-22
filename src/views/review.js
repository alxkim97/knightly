// Review tab: what's due today, what's coming up, and a button to start.
import { html, esc, ICON } from '../util.js';
import { App } from '../app.js';
import { boardThumb } from '../board.js';
import { boardFromFen } from '../engine.js';
import { pieceSVG } from '../pieces.js';
import { loadCourse } from '../content.js';
import { reviewLists, stageLabel, dueLabel, INTERVALS, SESSION_SIZE } from '../review.js';
import { pageTop } from './common.js';

export async function renderReview(container) {
  const [progress, course] = await Promise.all([App.getProgress(), loadCourse()]);
  const byRef = {};
  course.units.forEach((u) => u.lessons.forEach((l) => l.exercises.forEach((x) => { byRef[x.ref] = { x, l, u }; })));
  const { due, upcoming } = reviewLists(progress);
  const stats = progress.reviewStats || { done: 0, learned: 0 };

  const describe = (it) => {
    if (it.ref.startsWith('pz:')) {
      const pz = it.data || {};
      return { fen: pz.fen, title: `Puzzle · ${pz.rating ?? '?'}`, from: (pz.themes || []).slice(0, 2).join(', ') || 'Puzzles' };
    }
    const hit = byRef[it.ref];
    if (!hit) return null;
    return { fen: hit.x.fen, title: hit.x.title, from: `${hit.l.title} · Unit ${hit.u.n}` };
  };

  const chips = html(`<div class="chips"><span class="chip">${ICON.review}${due.length} due</span><span class="chip">${ICON.check}${stats.learned} learned</span></div>`);
  container.appendChild(pageTop('Review', `Mistakes from lessons and puzzles come back after ${INTERVALS.join(', ')} days. Right first time moves them on; after the last step they're learned.`, chips));

  // Hero: start
  const session = Math.min(due.length, SESSION_SIZE);
  const hero = html(`<section class="hero review-hero"><div class="hero-ic" aria-hidden="true">${pieceSVG('w', 'q')}</div><div class="hero-tx">
    <div class="eyebrow">${due.length ? 'Due today' : upcoming.length ? 'All caught up' : 'Nothing to review yet'}</div>
    <h2>${due.length ? `${due.length} position${due.length === 1 ? '' : 's'} to review` : upcoming.length ? 'Nothing due today' : 'No mistakes saved'}</h2>
    <p>${due.length ? `A session is up to ${SESSION_SIZE} positions, about ${Math.max(1, Math.round(session * 0.5))} min. Review counts toward your streak and XP.`
    : upcoming.length ? `Next one is ${dueLabel(upcoming[0]).toLowerCase()}. You can practise early; it won't move anything forward.`
      : 'When you get something wrong in a lesson or a puzzle, it lands here.'}</p>
    <div class="hero-row">${due.length ? '<button type="button" class="btn" id="start">Start review</button>'
      : upcoming.length ? '<button type="button" class="btn" id="early">Practise early</button>' : '<button type="button" class="btn" id="learn">Go to Learn</button>'}</div>
    </div><div class="px" aria-hidden="true"><i></i><i></i><i></i></div></section>`);
  hero.querySelector('#start')?.addEventListener('click', () => App.navigate('review-session'));
  hero.querySelector('#early')?.addEventListener('click', () => App.navigate('review-session', { early: true }));
  hero.querySelector('#learn')?.addEventListener('click', () => App.navigate('learn-hub'));
  container.appendChild(hero);

  const list = (title, items) => {
    if (!items.length) return;
    container.appendChild(html(`<div class="lib-head"><h2 class="sec-h">${esc(title)}</h2><span class="small muted">${items.length}</span></div>`));
    const grid = html('<div class="pz-grid"></div>');
    items.forEach((it) => {
      const d = describe(it);
      if (!d || !d.fen) return;
      const card = html(`<div class="card pz-card rv-card"><span class="pz-thumb"></span><span class="pz-tx"><b>${esc(d.title)}</b><span class="small">${esc(d.from)}</span>
        <span class="tags"><span class="pill ${dueLabel(it) === 'Due now' ? 'r' : 'g'}">${esc(dueLabel(it))}</span><span class="tag">${esc(stageLabel(it))}</span>${it.misses > 1 ? `<span class="tag">missed ${it.misses}×</span>` : ''}</span></span></div>`);
      card.querySelector('.pz-thumb').appendChild(boardThumb(boardFromFen(d.fen), { flipped: d.fen.split(' ')[1] === 'b' }));
      grid.appendChild(card);
    });
    container.appendChild(grid);
  };
  list('Due now', due);
  list('Coming up', upcoming);
}
