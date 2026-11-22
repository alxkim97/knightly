// Right-hand stats column (wide screens only; hidden on focus views).
import { html, ICON } from '../util.js';
import { App } from '../app.js';
import { loadCourse, courseState } from '../content.js';
import { pieceSVG } from '../pieces.js';
import { todayXp, weekStrip, streakDoneToday, PUZZLES_FOR_STREAK, dayKey } from '../streak.js';

// Rank ladder by total XP, pawn to king.
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
  const course = await loadCourse();
  const cs = courseState(course, progress);
  const xp = progress.xp || 0;
  const rank = rankFor(xp);
  const rec = progress.record || { wins: 0, losses: 0, draws: 0 };
  const goal = App.settings.dailyGoal || 50;
  const today = todayXp(progress);
  const C = 2 * Math.PI * 24;
  const pct = Math.min(1, today / goal);
  const streak = progress.streak || {};
  const safe = streakDoneToday(progress);
  const puzzlesToday = progress.puzzleDay?.date === dayKey() ? progress.puzzleDay.n : 0;
  const lessonsDone = cs.units.reduce((n, u) => n + u.doneCount, 0);
  const lessonsTotal = cs.units.reduce((n, u) => n + u.lessons.length, 0);
  const rankPct = rank.next ? Math.round(((xp - rank.floor) / (rank.next.xp - rank.floor)) * 100) : 100;

  side.innerHTML = '';
  side.appendChild(html(`<section class="card pad streak-card">
    <div class="streak-row"><span class="flame ${safe ? 'on' : ''}">${ICON.flame}</span><div><b class="streak-n">${streak.current || 0}</b><span class="small muted">day streak${streak.best ? ` · best ${streak.best}` : ''}</span></div></div>
    <div class="week">${weekStrip(progress).map((d) => `<div class="day ${d.hit ? 'hit' : ''} ${d.frozen ? 'frozen' : ''} ${d.today ? 'today' : ''} ${d.future ? 'future' : ''}"><i>${d.frozen ? ICON.snow : ''}</i>${d.label}</div>`).join('')}</div>
    <p class="small muted">${safe ? 'Today counts. Come back tomorrow.' : `Finish a lesson or solve ${PUZZLES_FOR_STREAK - puzzlesToday} more puzzle${PUZZLES_FOR_STREAK - puzzlesToday === 1 ? '' : 's'} today.`}</p>
  </section>`));
  side.appendChild(html(`<section class="card pad">
    <div class="goal">
      <svg class="ring" viewBox="0 0 56 56" aria-hidden="true"><circle class="track" cx="28" cy="28" r="24"/><circle class="fill" cx="28" cy="28" r="24" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - pct)}"/></svg>
      <div><b>Daily goal</b><p><span class="mono">${today}/${goal} XP</span> · ${today >= goal ? 'reached' : `${goal - today} to go`}</p></div>
    </div>
  </section>`));
  side.appendChild(html(`<section class="card pad rank">
    <div class="blk-h">Rank</div>
    <div class="rank-row"><div class="rank-pc">${pieceSVG('b', rank.piece)}</div>
      <div class="rank-tx"><h3>${rank.name}</h3><span class="trk"><i style="width:${rankPct}%"></i></span>
      <span class="mono small">${rank.next ? `${xp} / ${rank.next.xp} XP · ${rank.next.name} next` : `${xp} XP · top rank`}</span></div></div>
  </section>`));
  side.appendChild(html(`<section class="card pad">
    <div class="blk-h">Your chess</div>
    <div class="kv"><span>Lessons done</span><b>${lessonsDone}/${lessonsTotal}</b></div>
    <div class="kv"><span>Puzzles solved</span><b>${(progress.puzzles?.solvedIds || []).length}</b></div>
    <div class="kv"><span>vs Computer</span><b>${rec.wins}W ${rec.draws}D ${rec.losses}L</b></div>
    <div class="kv"><span>To review</span><b>${(progress.missed || []).length}</b></div>
  </section>`));
}

App.sideRenderer = renderSide;
