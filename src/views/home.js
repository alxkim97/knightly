import { html, esc } from '../util.js';
import { App } from '../app.js';
import { boardThumb } from '../board.js';
import { boardFromFen } from '../engine.js';
import { pieceSVG } from '../pieces.js';
import { loadCourse, courseState, exerciseCount, getDailyPuzzle, LEVEL_LABEL, sideToMove } from '../content.js';
import { todayXp, streakDoneToday } from '../streak.js';
import { pageTop, greeting, activityList } from './common.js';
import { courseUnitCard } from './learn.js';
import { rankFor } from './side.js';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export async function renderHome(container) {
  const [progress, course] = await Promise.all([App.getProgress(), loadCourse()]);
  const cs = courseState(course, progress);
  const next = cs.next;
  const rec = progress.record || { wins: 0, losses: 0, draws: 0 };
  const rank = rankFor(progress.xp || 0);
  const goal = App.settings.dailyGoal || 50;
  const xpToday = todayXp(progress);
  const streak = progress.streak?.current || 0;

  const sub = streak
    ? `${streak} day streak · ${xpToday}/${goal} XP today${streakDoneToday(progress) ? ' · streak safe' : ' · one lesson keeps it going'}`
    : `${rank.name} rank · ${xpToday}/${goal} XP today · finish a lesson to start a streak`;
  container.appendChild(pageTop(greeting(), sub));

  const bento = html('<div class="bento"></div>');

  // Up next
  const nextUnit = next ? cs.units.find((u) => u.lessons.some((l) => l.id === next.id)) : null;
  const firstBoard = next ? (next.exercises.find((x) => x.type !== 'explain') || next.exercises[0]).fen : START_FEN;
  const hero = html(`<section class="hero c-hero"><div class="hb"></div><div class="hero-tx">
    <div class="eyebrow">${next ? `Up next · Unit ${nextUnit.n} · ${esc(nextUnit.title)}` : 'Course complete'}</div>
    <h2>${esc(next ? next.title : 'Every lesson done')}</h2>
    <p>${esc(next ? (next.exercises[0].text || next.exercises[0].prompt || '') : 'Replay any lesson for XP, or keep sharp with puzzles.')}</p>
    <div class="hero-row"><button type="button" class="btn" id="go">${next ? (progress.course?.done && Object.keys(progress.course.done).length ? 'Continue' : 'Start learning') : 'Open Learn'}</button>${
      next ? `<span class="meta">${exerciseCount(next)} exercises · ~${Math.max(2, Math.round(next.exercises.length * 0.6))} min</span>` : ''}</div></div>
    <div class="hero-deco" aria-hidden="true">${pieceSVG('w', next?.piece || 'n')}</div><div class="px" aria-hidden="true"><i></i><i></i><i></i></div></section>`);
  hero.querySelector('.hb').appendChild(boardThumb(boardFromFen(firstBoard), { flipped: sideToMove(firstBoard) === 'b' }));
  hero.querySelector('#go').addEventListener('click', () => (next ? App.navigate('course-lesson', { lessonId: next.id, from: 'home' }) : App.navigate('learn-hub')));
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

  // Current unit in full, then the whole path at a glance
  const cur = cs.current;
  const unitCard = courseUnitCard(cur, { from: 'home' });
  unitCard.classList.add('c-full');
  bento.appendChild(unitCard);

  const pathCard = html('<section class="card pad c-full"><div class="blk-h">Your path <a role="button" tabindex="0">Open Learn</a></div><div class="path-strip"></div></section>');
  const strip = pathCard.querySelector('.path-strip');
  cs.units.forEach((u) => {
    const s = html(`<button type="button" class="pstep ${u === cur ? 'cur' : ''} ${u.complete ? 'done' : ''} ${u.unlocked ? '' : 'locked'}">
      <span class="pn">${u.n}</span><span class="pt"><b>${esc(u.title)}</b><span class="mono">${u.doneCount}/${u.lessons.length}</span></span>
      <span class="bar"><i style="width:${(u.doneCount / u.lessons.length) * 100}%"></i></span></button>`);
    s.addEventListener('click', () => App.navigate('learn-hub'));
    strip.appendChild(s);
  });
  const open = pathCard.querySelector('a');
  open.addEventListener('click', () => App.navigate('learn-hub'));
  open.addEventListener('keydown', (e) => { if (e.key === 'Enter') App.navigate('learn-hub'); });
  bento.appendChild(pathCard);

  // Recent activity
  const act = html('<section class="card pad c-full"><div class="blk-h">Recent activity <a role="button" tabindex="0">View all</a></div></section>');
  act.appendChild(activityList((progress.history || []).slice(0, 6)));
  const all = act.querySelector('a');
  all.addEventListener('click', () => App.navigate('history'));
  all.addEventListener('keydown', (e) => { if (e.key === 'Enter') App.navigate('history'); });
  bento.appendChild(act);

  container.appendChild(bento);
}
