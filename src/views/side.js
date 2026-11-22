// Right-hand stats column (wide screens only; hidden on focus views).
import { html, ICON } from '../util.js';
import { App } from '../app.js';
import { loadLessons } from '../content.js';
import { pieceSVG } from '../pieces.js';

// Rank ladder by XP, pawn to king. Purely cosmetic for now; phase 3 ties XP
// to the new lesson path.
const RANKS = [
  [0, 'Pawn', 'p'], [100, 'Knight', 'n'], [300, 'Bishop', 'b'], [700, 'Rook', 'r'], [1500, 'Queen', 'q'], [3000, 'King', 'k'],
];
export function rankFor(xp) {
  let i = 0;
  while (i + 1 < RANKS.length && xp >= RANKS[i + 1][0]) i++;
  const [floor, name, piece] = RANKS[i];
  const next = RANKS[i + 1];
  return { name, piece, floor, next: next ? { xp: next[0], name: next[1] } : null };
}

export async function renderSide(side, progress) {
  const lessons = await loadLessons();
  const xp = progress.xp || 0;
  const rank = rankFor(xp);
  const rec = progress.record || { wins: 0, losses: 0, draws: 0 };
  const lessonsDone = (progress.lessons?.completedIds || []).length;
  const pct = rank.next ? Math.round(((xp - rank.floor) / (rank.next.xp - rank.floor)) * 100) : 100;
  side.innerHTML = '';
  side.appendChild(html(`<div class="chips"><span class="chip xp">${ICON.bolt}${xp} XP</span>${
    progress.puzzles?.dailyStreak ? `<span class="chip streak">${ICON.flame}${progress.puzzles.dailyStreak} day puzzle streak</span>` : ''}</div>`));
  side.appendChild(html(`<section class="card pad rank">
    <div class="blk-h">Current rank</div>
    <div class="rank-row"><div class="rank-pc">${pieceSVG('b', rank.piece)}</div>
      <div class="rank-tx"><h3>${rank.name}</h3><span class="trk"><i style="width:${pct}%"></i></span>
      <span class="mono small">${rank.next ? `${xp} / ${rank.next.xp} XP · ${rank.next.name} next` : `${xp} XP · top rank`}</span></div></div>
  </section>`));
  side.appendChild(html(`<section class="card pad">
    <div class="blk-h">Your chess</div>
    <div class="kv"><span>Lessons done</span><b>${lessonsDone}/${lessons.length}</b></div>
    <div class="kv"><span>Puzzles solved</span><b>${(progress.puzzles?.solvedIds || []).length}</b></div>
    <div class="kv"><span>vs Computer</span><b>${rec.wins}W ${rec.draws}D ${rec.losses}L</b></div>
    <div class="kv"><span>Games played</span><b>${(progress.history || []).filter((h) => h.type === 'game').length}</b></div>
  </section>`));
  const hist = html(`<section class="card pad"><div class="blk-h">Shortcuts</div>
    <div class="kv"><span>Undo / redo</span><b>Ctrl Z / Y</b></div>
    <div class="kv"><span>Arrows and circles</span><b>Right-drag</b></div></section>`);
  side.appendChild(hist);
}

App.sideRenderer = renderSide;
