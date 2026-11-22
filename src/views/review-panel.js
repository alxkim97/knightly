// The "Game review" card: accuracy, how many moves of each grade, and a
// walk through your key moments (inaccuracies, mistakes, blunders), each with
// a plain-English explanation and the best move drawn on the board.
// Used by the live game screen and by the saved-game review screen.
import { html, esc } from '../util.js';
import { GRADES } from '../analysis.js';

const moveNo = (ply) => `${Math.floor(ply / 2) + 1}.${ply % 2 ? '..' : ''}`;

// Key moments for one side (or both, in pass and play) from a full buildReview() result.
export function momentsFrom(review, side) {
  return review.plies
    .filter((p) => p.text && (!side || p.color === side))
    .map((p) => ({ ply: p.ply, color: p.color, g: p.grade, san: p.san, bestUci: p.bestUci, bestSan: p.bestSan, text: p.text, better: p.better, ev: [p.evBefore, p.evAfter] }));
}

// opts: { goto(movesShown), arrow(uci|null), onClose?, you: 'w'|'b'|null, onInsights? }
export function reviewPanel(opts) {
  const node = html(`<section class="card pad review" aria-label="Game review">
    <div class="rv-head"><div class="blk-h">Game review</div>${opts.onClose ? '<button type="button" class="btn ghost sm" data-close>Close</button>' : ''}</div>
    <div class="rv-body"></div></section>`);
  const body = node.querySelector('.rv-body');
  if (opts.onClose) node.querySelector('[data-close]').addEventListener('click', opts.onClose);
  let moments = [];
  let idx = -1;
  let view = 'before';

  const setProgress = (p) => {
    body.innerHTML = `<p class="small muted">The engine is checking every move…</p>
      <div class="progress rv-prog"><i style="width:${Math.max(4, Math.round(p * 100))}%"></i></div>
      <p class="small muted">${Math.round(p * 100)}%. You can keep looking at the board while it works.</p>`;
  };
  const setError = (msg) => { body.innerHTML = `<p class="status-line bad small">Could not review this game: ${esc(msg || 'the engine failed to load')}.</p>`; };

  function showMoment(i, v = 'before') {
    idx = i; view = v;
    const m = moments[i];
    paintMoment();
    if (!m) { opts.arrow(null); return; }
    if (v === 'before') { opts.goto(m.ply); if (m.bestUci) opts.arrow(m.bestUci); else opts.arrow(null); }
    else { opts.goto(m.ply + 1); opts.arrow(null); }
  }

  function paintMoment() {
    const holder = body.querySelector('.rv-moment-wrap');
    if (!holder) return;
    const m = moments[idx];
    const nav = body.querySelector('.rv-nav-label');
    if (nav) nav.textContent = idx < 0 ? `${moments.length} key moment${moments.length === 1 ? '' : 's'}` : `${idx + 1} of ${moments.length}`;
    body.querySelector('[data-prev]').disabled = idx <= 0;
    body.querySelector('[data-next]').disabled = idx >= moments.length - 1;
    if (!m) { holder.innerHTML = '<p class="small muted">Step through your key moments with the arrows. The best move is drawn on the board.</p>'; return; }
    const g = GRADES[m.g];
    holder.innerHTML = `<div class="rv-moment">
      <div class="rv-title"><span class="grade ${g.tone}">${g.label}</span><span>Move ${moveNo(m.ply)} <b>${esc(m.san)}${g.sym}</b></span></div>
      <p class="rv-what">${esc(m.text)}</p>
      ${m.better ? `<p class="rv-better"><b>Better: </b>${esc(m.better)}</p>` : ''}
      <div class="rv-eval small muted">Evaluation ${esc(m.ev[0])} → ${esc(m.ev[1])} <span>(from ${m.color === 'b' ? "Black's" : opts.you ? 'your' : "White's"} side)</span></div>
      <div class="seg" role="group" aria-label="Position"><button type="button" data-v="before" class="${view === 'before' ? 'on' : ''}">Before the move</button><button type="button" data-v="after" class="${view === 'after' ? 'on' : ''}">After the move</button></div></div>`;
    holder.querySelectorAll('[data-v]').forEach((b) => b.addEventListener('click', () => showMoment(idx, b.dataset.v)));
  }

  // summary: { acc, accOpp, n, ... }; moms: key moments for the side(s) being reviewed.
  function setReview(summary, moms, labels = {}) {
    moments = moms;
    idx = -1;
    const n = summary.n || {};
    const chips = ['b', 'g', 'i', 'm', 'x'].map((k) => `<span class="rv-chip ${GRADES[k].tone}"><b>${n[k] || 0}</b>${GRADES[k].label}</span>`).join('');
    body.innerHTML = `<div class="rv-acc">
        <div><b>${summary.acc ?? '–'}${summary.acc != null ? '%' : ''}</b><span>${esc(labels.you || 'Your accuracy')}</span></div>
        ${summary.accOpp != null ? `<div><b>${summary.accOpp}%</b><span>${esc(labels.them || 'Computer')}</span></div>` : ''}
      </div>
      <div class="rv-chips">${chips}</div>
      <div class="rv-navrow"><button type="button" class="btn ghost sm" data-prev aria-label="Previous key moment">◀</button><span class="rv-nav-label"></span><button type="button" class="btn ghost sm" data-next aria-label="Next key moment">▶</button></div>
      <div class="rv-moment-wrap"></div>
      ${opts.onInsights ? '<button type="button" class="btn sm wide" data-insights>See your habits and tips</button>' : ''}`;
    body.querySelector('[data-prev]').addEventListener('click', () => showMoment(Math.max(0, idx - 1)));
    body.querySelector('[data-next]').addEventListener('click', () => showMoment(Math.min(moments.length - 1, idx + 1)));
    const ins = body.querySelector('[data-insights]');
    if (ins) ins.addEventListener('click', opts.onInsights);
    if (!moments.length) {
      body.querySelector('.rv-moment-wrap').innerHTML = '<p class="small muted">No inaccuracies or mistakes worth flagging. Nicely played.</p>';
      body.querySelector('[data-prev]').disabled = true; body.querySelector('[data-next]').disabled = true;
      body.querySelector('.rv-nav-label').textContent = 'No key moments';
    } else {
      paintMoment();
      showMoment(0);
    }
  }

  return { el: node, setProgress, setError, setReview, showMoment };
}
