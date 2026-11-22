import { html, esc, ICON } from '../util.js';
import { App } from '../app.js';
import { boardThumb } from '../board.js';
import { boardFromFen } from '../engine.js';
import { pieceSVG } from '../pieces.js';
import {
  loadLessons, firstIncomplete, CATEGORIES, CATEGORY_LABEL, CATEGORY_DESC, CATEGORY_PIECE,
  getDailyPuzzle, LEVEL_LABEL, sideToMove,
} from '../content.js';
import { pageTop, greeting, activityList } from './common.js';
import { rankFor } from './side.js';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export function unitCard(cat, idx, lessons, completed, nextId) {
  const list = lessons.filter((l) => l.category === cat);
  const done = list.filter((l) => completed.has(l.id)).length;
  const card = html(`<section class="card unit ${list.some((l) => l.id === nextId) ? 'cur' : ''}">
    <div class="unit-h"><div class="unit-n">${idx + 1}</div><div class="unit-t"><h3>${esc(CATEGORY_LABEL[cat])}</h3><span>${esc(CATEGORY_DESC[cat])}</span></div>
    <div class="pct">${done}/${list.length}<div class="bar"><i style="width:${list.length ? (done / list.length) * 100 : 0}%"></i></div></div></div>
    <div class="lessons"></div></section>`);
  const wrap = card.querySelector('.lessons');
  list.forEach((l) => {
    const st = completed.has(l.id) ? 'done' : l.id === nextId ? 'cur' : '';
    const sub = st === 'done' ? 'Done · replay' : st === 'cur' ? 'Up next' : `${l.steps.length} ${l.steps.length === 1 ? 'move' : 'moves'}`;
    const b = html(`<button type="button" class="ls ${st}"><span class="g">${st === 'done' ? ICON.check : pieceSVG(st === 'cur' ? 'b' : 'w', CATEGORY_PIECE[cat])}</span><span class="t"><b>${esc(l.title)}</b><span>${esc(sub)}</span></span></button>`);
    b.addEventListener('click', () => App.navigate('lesson', { lessonId: l.id }));
    wrap.appendChild(b);
  });
  return card;
}

export async function renderHome(container) {
  const [progress, lessons] = await Promise.all([App.getProgress(), loadLessons()]);
  const completed = new Set(progress.lessons?.completedIds || []);
  const next = firstIncomplete(lessons, completed);
  const rec = progress.record || { wins: 0, losses: 0, draws: 0 };
  const rank = rankFor(progress.xp || 0);

  container.appendChild(pageTop(greeting(), `${rank.name} rank · ${progress.xp || 0} XP · ${completed.size} of ${lessons.length} lessons done`));

  const bento = html('<div class="bento"></div>');

  // Up next lesson
  const hero = html(`<section class="hero c-hero"><div class="hb"></div><div class="hero-tx">
    <div class="eyebrow">${next ? `Up next · ${esc(CATEGORY_LABEL[next.category])}` : 'All lessons done'}</div>
    <h2>${esc(next ? next.title : 'Course complete')}</h2>
    <p>${esc(next ? next.intro : 'You have finished every lesson. Replay any of them, or sharpen up with puzzles.')}</p>
    <div class="hero-row"><button type="button" class="btn" id="go">${next ? 'Start lesson' : 'Browse lessons'}</button>${next ? `<span class="meta">${next.steps.length} moves · +15 XP</span>` : ''}</div></div>
    <div class="hero-deco" aria-hidden="true">${pieceSVG('w', 'n')}</div><div class="px" aria-hidden="true"><i></i><i></i><i></i></div></section>`);
  hero.querySelector('.hb').appendChild(boardThumb(boardFromFen(next ? next.startFen : START_FEN)));
  hero.querySelector('#go').addEventListener('click', () => (next ? App.navigate('lesson', { lessonId: next.id }) : App.navigate('learn-hub')));
  bento.appendChild(hero);

  // Daily puzzle (fills in when it arrives)
  const daily = html(`<section class="card feature c-third"><div class="fb"><div class="thumb ph"></div></div><div class="ft">
    <div class="eyebrow">Puzzle of the day</div><h3>Loading…</h3><p>Fetching today's puzzle.</p>
    <div class="row"><button type="button" class="btn sm" disabled>Solve</button></div></div></section>`);
  bento.appendChild(daily);
  getDailyPuzzle().then((pz) => {
    if (!daily.isConnected) return;
    const solved = (progress.puzzles?.solvedIds || []).includes(pz.id);
    daily.querySelector('.fb').replaceChildren(boardThumb(boardFromFen(pz.fen), { flipped: sideToMove(pz.fen) === 'b' }));
    daily.querySelector('h3').textContent = `${sideToMove(pz.fen) === 'w' ? 'White' : 'Black'} to play`;
    daily.querySelector('p').textContent = `Rating ${pz.rating} · ${LEVEL_LABEL[pz.level] || pz.level}${solved ? ' · solved' : ''}`;
    const b = daily.querySelector('button');
    b.disabled = false;
    b.textContent = solved ? 'Solve again' : 'Solve';
    b.addEventListener('click', () => App.navigate('puzzle-solve', { puzzle: pz }));
  });

  // Play
  const play = html(`<section class="card feature c-third"><div class="fb"></div><div class="ft">
    <div class="eyebrow">Play</div><h3>vs Computer</h3><p>${rec.wins}W ${rec.draws}D ${rec.losses}L so far. Six levels, from beginner to full strength.</p>
    <div class="row"><button type="button" class="btn sm ghost">New game</button></div></div></section>`);
  play.querySelector('.fb').appendChild(boardThumb(boardFromFen(START_FEN)));
  play.querySelector('button').addEventListener('click', () => App.navigate('play-setup'));
  bento.appendChild(play);

  // Units
  CATEGORIES.forEach((cat, i) => {
    const card = unitCard(cat, i, lessons, completed, next?.id);
    card.classList.add('c-4');
    bento.appendChild(card);
  });

  // Recent activity
  const act = html('<section class="card pad c-full"><div class="blk-h">Recent activity <a role="button" tabindex="0">View all</a></div></section>');
  act.appendChild(activityList((progress.history || []).slice(0, 6)));
  const all = act.querySelector('a');
  all.addEventListener('click', () => App.navigate('history'));
  all.addEventListener('keydown', (e) => { if (e.key === 'Enter') App.navigate('history'); });
  bento.appendChild(act);

  container.appendChild(bento);
}
