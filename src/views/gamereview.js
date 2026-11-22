// Review of a saved game: the board, the move list with grades, and the review
// panel. Uses the summary saved with the game; if there isn't one yet (the
// engine hadn't finished, or failed), it runs the analysis now.
import { html, el, esc } from '../util.js';
import { App } from '../app.js';
import { ChessBoard } from '../board.js';
import { engine } from '../engine.js';
import * as Analysis from '../analysis.js';
import { summariseReview } from '../insights.js';
import { reviewPanel } from './review-panel.js';
import { backLink } from './common.js';

const ID = 'saved-review';

export async function renderGameReview(container, params) {
  const progress = await App.getProgress();
  const game = (progress.games || []).find((g) => g.id === params.id);
  container.appendChild(backLink('Your play', 'insights'));
  if (!game) { container.appendChild(html('<section class="card pad"><p>That game is no longer saved.</p></section>')); return null; }

  const { ucis, sans } = Analysis.storedReview(game);
  const you = game.color;
  const layout = html(`<div class="split">
    <div class="board-col"><div class="board-frame"><div class="board-wrap"></div></div><div class="review-row"></div></div>
    <div class="panel"><div class="rv-slot"></div>
      <section class="card pad"><div class="blk-h">Moves</div><div class="move-list"></div></section></div></div>`);
  container.appendChild(layout);
  layout.style.setProperty('--bscale', String((App.settings.boardScale || 100) / 100));

  const board = new ChessBoard(layout.querySelector('.board-wrap'), { interactive: false, flipped: you === 'b' });
  const nav = layout.querySelector('.review-row');
  const list = layout.querySelector('.move-list');
  let cls = (game.summary && game.summary.cls) || '';
  let shown = ucis.length;

  function stateAt(n) {
    let st = engine.reset(ID);
    for (let i = 0; i < n; i++) st = engine.move(ID, { from: ucis[i].slice(0, 2), to: ucis[i].slice(2, 4), promotion: ucis[i][4] }) || st;
    return st;
  }
  function show(n) {
    shown = Math.max(0, Math.min(ucis.length, n));
    board.render(stateAt(shown));
    paintNav();
    list.querySelectorAll('.mv-move').forEach((m) => m.classList.toggle('mv-active', Number(m.dataset.idx) === shown));
  }
  function paintNav() {
    nav.innerHTML = '';
    const prev = el('button', 'btn ghost sm', '◀'), next = el('button', 'btn ghost sm', '▶');
    prev.type = next.type = 'button';
    prev.disabled = shown === 0; next.disabled = shown === ucis.length;
    prev.addEventListener('click', () => { board.clearSuggestion(); show(shown - 1); });
    next.addEventListener('click', () => { board.clearSuggestion(); show(shown + 1); });
    nav.append(prev, el('span', 'review-label', shown === ucis.length ? 'Final position' : `Move ${shown} of ${ucis.length}`), next);
  }
  function paintList() {
    list.innerHTML = '';
    for (let i = 0; i < sans.length; i += 2) {
      list.appendChild(el('span', 'mv-num', `${i / 2 + 1}.`));
      for (const k of [i, i + 1]) {
        if (k >= sans.length) { list.appendChild(el('span', null, '')); continue; }
        const g = cls[k];
        const bad = g === 'i' || g === 'm' || g === 'x';
        const m = el('span', 'mv-move' + (bad ? ` mv-g-${g}` : ''), sans[k] + (bad ? Analysis.GRADES[g].sym : ''));
        m.dataset.idx = String(k + 1);
        m.addEventListener('click', () => { board.clearSuggestion(); show(k + 1); });
        list.appendChild(m);
      }
    }
  }

  const panel = reviewPanel({
    you,
    goto: (i) => show(i),
    arrow: (uci) => { if (uci) board.showSuggestion(uci.slice(0, 2), uci.slice(2, 4)); else board.clearSuggestion(); },
    onInsights: () => App.navigate('insights'),
  });
  layout.querySelector('.rv-slot').appendChild(panel.el);
  paintList();
  show(ucis.length);

  const present = (summary, moments) => {
    panel.setReview({ acc: summary.acc, accOpp: summary.accOpp, n: summary.n }, moments);
  };
  if (game.summary && game.summary.moments) {
    present(game.summary, game.summary.moments.map((m) => ({ ...m, color: you })));
  } else {
    const job = Analysis.startAnalysis(game.id, ucis);
    panel.setProgress(job.progress);
    const stop = job.onProgress((p) => panel.setProgress(p));
    job.promise.then((res) => {
      stop();
      const summary = summariseReview(res, you);
      App.updateGame(game.id, { summary });
      cls = res.cls;
      paintList();
      present(summary, summary.moments.map((m) => ({ ...m, color: you })));
    }).catch((err) => { stop(); panel.setError(err && err.message); });
  }
  return () => engine.destroy(ID);
}
