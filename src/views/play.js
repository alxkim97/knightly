import { html, esc } from '../util.js';
import { App } from '../app.js';
import { DIFFICULTY_PRESETS } from '../ai.js';
import { pieceSVG } from '../pieces.js';
import { pageTop } from './common.js';

const TIME_CONTROLS = [['none', 'No clock'], ['3', '3 min'], ['5', '5 min'], ['10', '10 min'], ['15', '15 min'], ['30', '30 min']];
const COLORS = [['w', 'White'], ['b', 'Black'], ['random', 'Random']];
const LAST_KEY = 'knightly_last_setup';

function segGroup(label, options, current, onPick) {
  const node = html(`<div class="field"><div class="blk-h">${esc(label)}</div><div class="seg wrap" role="group" aria-label="${esc(label)}">${
    options.map(([k, n]) => `<button type="button" data-k="${k}">${esc(n)}</button>`).join('')}</div></div>`);
  const paint = (v) => node.querySelectorAll('[data-k]').forEach((b) => { b.classList.toggle('on', b.dataset.k === v); b.setAttribute('aria-pressed', b.dataset.k === v); });
  node.querySelectorAll('[data-k]').forEach((b) => b.addEventListener('click', () => { paint(b.dataset.k); onPick(b.dataset.k); }));
  paint(current);
  return node;
}

export async function renderPlaySetup(container) {
  let last = {};
  try { last = JSON.parse(localStorage.getItem(LAST_KEY) || '{}'); } catch { /* ignore */ }
  const choice = { time: last.time || 'none', difficulty: last.difficulty || 'beginner', color: last.color || 'w' };
  const remember = () => { try { localStorage.setItem(LAST_KEY, JSON.stringify(choice)); } catch { /* ignore */ } };
  const progress = await App.getProgress();
  const rec = progress.record || { wins: 0, losses: 0, draws: 0 };

  container.appendChild(pageTop('Play', 'Take on the computer at your level, or pass the device between two players.'));
  const grid = html('<div class="play-grid"></div>');

  // vs Computer
  const ai = html(`<section class="card pad play-ai">
    <div class="mode-h"><span class="mode-ic">${pieceSVG('w', 'k')}</span><div><h2>vs Computer</h2><p>Stockfish, tuned to six strengths. Premove and undo included.</p></div></div>
    <div class="blk-h">Difficulty</div><div class="diffs" role="radiogroup" aria-label="Difficulty"></div></section>`);
  const diffs = ai.querySelector('.diffs');
  const paintDiff = () => diffs.querySelectorAll('.diff').forEach((d) => { const on = d.dataset.k === choice.difficulty; d.classList.toggle('on', on); d.setAttribute('aria-checked', on); });
  DIFFICULTY_PRESETS.forEach((p, i) => {
    const bars = Array.from({ length: 6 }, (_, k) => `<i class="${k <= i ? 'f' : ''}"></i>`).join('');
    const d = html(`<button type="button" class="diff" role="radio" data-k="${p.key}"><span class="dn"><b>${esc(p.label)}</b><span>${esc(p.desc)}</span></span><span class="bars">${bars}</span></button>`);
    d.addEventListener('click', () => { choice.difficulty = p.key; paintDiff(); });
    diffs.appendChild(d);
  });
  paintDiff();
  ai.appendChild(segGroup('Play as', COLORS, choice.color, (v) => { choice.color = v; }));
  const start = html('<button type="button" class="btn wide">Start game</button>');
  start.addEventListener('click', () => {
    remember();
    const color = choice.color === 'random' ? (Math.random() < 0.5 ? 'w' : 'b') : choice.color;
    App.navigate('game', { mode: 'ai', difficulty: choice.difficulty, playerColor: color, timeControlMin: choice.time === 'none' ? null : Number(choice.time) });
  });
  ai.appendChild(start);
  grid.appendChild(ai);

  // Right column: clock, pass & play, record
  const col = html('<div class="play-col"></div>');
  const clock = html('<section class="card pad"></section>');
  clock.appendChild(segGroup('Time control', TIME_CONTROLS, choice.time, (v) => { choice.time = v; }));
  clock.appendChild(html('<p class="small muted">Applies to both modes. Each side gets the full time.</p>'));
  col.appendChild(clock);

  const pvp = html(`<section class="card pad">
    <div class="mode-h"><span class="mode-ic dark">${pieceSVG('b', 'n')}</span><div><h2>Pass and play</h2><p>Two players, one device. Take turns on the same board.</p></div></div>
    <button type="button" class="btn ghost wide">Start pass and play</button></section>`);
  pvp.querySelector('button').addEventListener('click', () => {
    remember();
    App.navigate('game', { mode: 'pvp', timeControlMin: choice.time === 'none' ? null : Number(choice.time) });
  });
  col.appendChild(pvp);

  const total = rec.wins + rec.losses + rec.draws;
  col.appendChild(html(`<section class="card record"><div><span>Won</span><b class="good">${rec.wins}</b></div><div><span>Drawn</span><b>${rec.draws}</b></div><div><span>Lost</span><b class="bad">${rec.losses}</b></div><div><span>Win rate</span><b>${total ? Math.round((rec.wins / total) * 100) : 0}%</b></div></section>`));
  grid.appendChild(col);
  container.appendChild(grid);
}
