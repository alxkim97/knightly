// "Your play": habits and tips mined from your reviewed games (src/insights.js),
// plus a list of recent games you can open for a full move-by-move review.
import { html, esc } from '../util.js';
import { App } from '../app.js';
import { buildInsights } from '../insights.js';
import { pageTop, backLink } from './common.js';

const PHASES = [['o', 'Opening'], ['m', 'Middlegame'], ['e', 'Endgame']];
const GRADE_ROWS = [['b', 'Best', 'good'], ['g', 'Good', 'good'], ['i', 'Inaccuracies', 'warn'], ['m', 'Mistakes', 'warn'], ['x', 'Blunders', 'bad']];
const RESULT = { win: ['good', 'Won'], loss: ['bad', 'Lost'], draw: ['warn', 'Draw'] };
const LEVEL = { beginner: 'Beginner', easy: 'Easy', intermediate: 'Intermediate', advanced: 'Advanced', hard: 'Hard', expert: 'Expert' };

function spark(series) {
  if (series.length < 2) return '';
  const w = 120, h = 30, max = 100, min = Math.min(40, ...series);
  const pts = series.map((v, i) => `${(i / (series.length - 1)) * w},${h - ((v - min) / (max - min)) * h}`).join(' ');
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true"><polyline points="${pts}" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
}

export async function renderInsights(container) {
  const progress = await App.getProgress();
  const games = progress.games || [];
  const ins = buildInsights(games);
  container.appendChild(backLink('Play', 'play-setup'));
  container.appendChild(pageTop('Your play', 'Habits and tips from your games against the computer.'));

  if (!ins.games) {
    container.appendChild(html('<section class="card pad"><p>No games yet. Finish a game against the computer and it is reviewed automatically. Your habits and tips will show up here.</p><button type="button" class="btn" id="go">Play a game</button></section>'));
    container.querySelector('#go').addEventListener('click', () => App.navigate('play-setup'));
    return;
  }

  const total = ins.record.w + ins.record.d + ins.record.l;
  const trend = ins.recentAcc != null ? ins.recentAcc - ins.olderAcc : null;
  container.appendChild(html(`<section class="stat-row">
    <div class="card pad stat"><span>Games</span><b>${ins.games}</b></div>
    <div class="card pad stat"><span>Win rate</span><b>${total ? Math.round((ins.record.w / total) * 100) : 0}%</b><small>${ins.record.w}W ${ins.record.d}D ${ins.record.l}L</small></div>
    <div class="card pad stat"><span>Accuracy</span><b>${ins.avgAcc != null ? ins.avgAcc + '%' : '–'}</b>${trend != null ? `<small class="${trend >= 0 ? 'good' : 'bad'}">${trend >= 0 ? '▲' : '▼'} ${Math.abs(trend)} vs before</small>` : `<small>${ins.reviewed} reviewed</small>`}${spark(ins.accSeries)}</div>
  </section>`));

  // Tips
  const tips = html('<section class="card pad"><div class="blk-h">What to work on</div><div class="tips"></div></section>');
  const tl = tips.querySelector('.tips');
  for (const s of ins.suggestions) {
    tl.appendChild(html(`<div class="tip ${s.tone}"><b>${esc(s.title)}</b><p>${esc(s.body)}</p></div>`));
  }
  container.appendChild(tips);

  const grid = html('<div class="ins-grid"></div>');

  if (ins.reviewed) {
    const rows = PHASES.map(([k, name]) => {
      const p = ins.phases[k];
      const rate = p.moves ? p.lost / p.moves : 0;
      return { name, rate, moves: p.moves };
    });
    const top = Math.max(1, ...rows.map((r) => r.rate));
    grid.appendChild(html(`<section class="card pad"><div class="blk-h">Where you lose points</div>
      ${rows.map((r) => `<div class="bar-row"><span>${r.name}</span><div class="bar"><i style="width:${Math.round((r.rate / top) * 100)}%"></i></div><b>${r.moves ? r.rate.toFixed(1) : '–'}</b></div>`).join('')}
      <p class="small muted">Average win chance lost per move. Lower is better.</p></section>`));

    const t = ins.counts;
    const all = Object.values(t).reduce((a, b) => a + b, 0) || 1;
    grid.appendChild(html(`<section class="card pad"><div class="blk-h">Your moves, graded</div>
      ${GRADE_ROWS.map(([k, name, tone]) => `<div class="kv"><span>${name}</span><b class="${tone}">${t[k]} <small>${Math.round((t[k] / all) * 100)}%</small></b></div>`).join('')}</section>`));

    if (ins.speed) {
      grid.appendChild(html(`<section class="card pad"><div class="blk-h">Thinking time</div>
        <div class="kv"><span>Average per move</span><b>${ins.speed.avg}s</b></div>
        <div class="kv"><span>Moves under 3 seconds</span><b>${ins.speed.fastShare}%</b></div>
        <div class="kv"><span>Mistakes on quick moves</span><b>${Math.round(ins.speed.fastRate * 100)}%</b></div>
        <div class="kv"><span>Mistakes on slower moves</span><b>${Math.round(ins.speed.slowRate * 100)}%</b></div></section>`));
    }
  }

  if (ins.byLevel.length) {
    grid.appendChild(html(`<section class="card pad"><div class="blk-h">By level</div>
      ${ins.byLevel.map((l) => `<div class="kv"><span>${l.name}</span><b>${l.w}W ${l.d}D ${l.l}L</b></div>`).join('')}</section>`));
  }
  if (ins.openings.length) {
    grid.appendChild(html(`<section class="card pad"><div class="blk-h">Your openings</div>
      ${ins.openings.map((o) => `<div class="kv"><span>${esc(o.name)}</span><b>${o.n} game${o.n === 1 ? '' : 's'} · ${o.w} won</b></div>`).join('')}</section>`));
  }
  container.appendChild(grid);

  // Recent games
  const recent = html('<section class="card pad"><div class="blk-h">Recent games</div><div class="games"></div></section>');
  const gl = recent.querySelector('.games');
  for (const g of [...games].filter((x) => x.mode !== 'pvp').slice(0, 12)) {
    const [tone, word] = RESULT[g.result] || ['warn', g.result];
    const row = html(`<div class="game-row"><span class="grade ${tone}">${word}</span>
      <span class="gr-main"><b>${esc(LEVEL[g.difficulty] || '')}</b><small>${new Date(g.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · ${Math.ceil((g.plies || 0) / 2)} moves${g.open ? ' · ' + esc(g.open) : ''}</small></span>
      <span class="gr-acc">${g.summary && g.summary.acc != null ? g.summary.acc + '%' : '…'}</span>
      <button type="button" class="btn ghost sm">Review</button></div>`);
    row.querySelector('button').addEventListener('click', () => App.navigate('game-review', { id: g.id }));
    gl.appendChild(row);
  }
  container.appendChild(recent);
}
