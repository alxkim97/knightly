import { html, esc, showToast } from '../util.js';
import * as Sync from '../sync.js';
import { App } from '../app.js';
import { Sound } from '../sound.js';
import { platform } from '../platform.js';
import { lookPicker } from '../look-picker.js';
import { pageTop } from './common.js';

function toggleRow(label, checked, onChange, id) {
  const row = html(`<label class="tog" for="${id}"><span>${label}</span><span class="switch"><input type="checkbox" id="${id}" ${checked ? 'checked' : ''}><span class="slider"></span></span></label>`);
  row.querySelector('input').addEventListener('change', (e) => onChange(e.target.checked));
  return row;
}

export async function renderSettings(container) {
  container.appendChild(pageTop('Settings', 'Look, sound and your saved progress.'));

  const look = html('<section class="card pad"></section>');
  look.appendChild(lookPicker());
  container.appendChild(look);

  const grid = html('<div class="prof-grid"></div>');

  const general = html('<section class="card pad"><div class="blk-h">General</div></section>');
  general.appendChild(toggleRow('Sound effects', App.settings.sound !== false, (on) => {
    App.settings.sound = on;
    App.saveSettings();
    if (on) Sound.play('move');
  }, 'set-sound'));
  if (platform.hasMiniBoard) {
    general.appendChild(toggleRow('Pop-out board stays on top', App.settings.miniAlwaysOnTop !== false, (on) => {
      App.settings.miniAlwaysOnTop = on;
      App.saveSettings();
      platform.setMiniAlwaysOnTop(on);
    }, 'mini-always-on-top-toggle'));
  }
  grid.appendChild(general);

  const GOALS = [[20, 'Casual · 20'], [50, 'Regular · 50'], [100, 'Serious · 100']];
  const learning = html(`<section class="card pad"><div class="blk-h">Daily goal and streak</div>
    <div class="seg wrap" role="group" aria-label="Daily XP goal">${GOALS.map(([v, n]) => `<button type="button" data-g="${v}">${n} XP</button>`).join('')}</div>
    <div class="kv"><span>Keeps the streak</span><b>1 lesson or 10 puzzles</b></div>
    <div class="kv"><span>Missed a day</span><b>1 freeze per week</b></div>
    <div class="kv"><span>Lives</span><b>None, unlimited</b></div></section>`);
  const paintGoal = () => learning.querySelectorAll('[data-g]').forEach((b) => b.classList.toggle('on', Number(b.dataset.g) === (App.settings.dailyGoal || 50)));
  learning.querySelectorAll('[data-g]').forEach((b) => b.addEventListener('click', () => {
    App.settings.dailyGoal = Number(b.dataset.g);
    App.saveSettings();
    paintGoal();
    App.refreshChrome();
  }));
  paintGoal();
  grid.appendChild(learning);

  grid.appendChild(html(`<section class="card pad"><div class="blk-h">Shortcuts</div>
    <div class="kv"><span>Undo a move vs computer</span><b>Ctrl + Z</b></div>
    <div class="kv"><span>Redo</span><b>Ctrl + Y</b></div>
    <div class="kv"><span>Draw an arrow or circle</span><b>Right-drag</b></div>
    <div class="kv"><span>Close a pop-up</span><b>Esc</b></div></section>`));

  grid.appendChild(accountCard());

  const data = html(`<section class="card pad"><div class="blk-h">Progress</div>
    <p class="small muted">Resets solved puzzles, finished lessons, XP, your record and history. Settings stay. When signed in, this resets every synced device.</p>
    <button type="button" class="btn sm danger" id="reset">Reset progress</button>
    <p class="small muted" id="ver"></p></section>`);
  const resetBtn = data.querySelector('#reset');
  let armed = false;
  resetBtn.addEventListener('click', async () => {
    if (!armed) {
      armed = true;
      resetBtn.textContent = 'Click again to reset everything';
      setTimeout(() => { armed = false; if (resetBtn.isConnected) resetBtn.textContent = 'Reset progress'; }, 4000);
      return;
    }
    armed = false;
    await App.resetProgress();
    resetBtn.textContent = 'Reset progress';
    App.refreshChrome();
    showToast('Progress reset');
  });
  platform.getVersion().then((v) => { data.querySelector('#ver').textContent = `Knightly v${v} · ${platform.hasMiniBoard ? 'desktop app' : 'web app'}`; });
  grid.appendChild(data);

  container.appendChild(grid);
}

// Sign in to sync progress, the look and the daily goal between devices.
function ago(iso) {
  if (!iso) return '';
  const s = Math.round((Date.now() - Date.parse(iso)) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  return new Date(iso).toLocaleString([], { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' });
}
function statusText(st) {
  if (!st.online || st.phase === 'offline') return [`Offline${st.pending ? ` · ${st.pending} waiting to upload` : ''}`, 'warn'];
  if (st.phase === 'error') return [`Sync problem: ${st.error}`, 'bad'];
  if (st.phase === 'syncing') return ['Syncing…', ''];
  if (st.pending) return [`${st.pending} waiting to upload`, 'warn'];
  return [`Synced${st.lastSync ? ` ${ago(st.lastSync)}` : ''}${st.live ? ' · live' : ''}`, 'good'];
}

function accountCard() {
  const card = html('<section class="card pad acct"><div class="blk-h">Sync</div><div class="acct-body"></div></section>');
  const body = card.querySelector('.acct-body');
  let busy = false;

  const draw = (st = Sync.getStatus(), err = '') => {
    if (busy) return;
    if (st.signedIn) {
      const [text, tone] = statusText(st);
      body.innerHTML = `<div class="kv"><span>Signed in</span><b>${esc(st.email)}</b></div>
        <p class="status-line small ${tone}" id="sync-status">${esc(text)}</p>
        <div class="btn-row"><button type="button" class="btn sm ghost" id="sync-now">Sync now</button><button type="button" class="btn sm ghost" id="sign-out">Sign out</button></div>`;
      body.querySelector('#sync-now').addEventListener('click', () => Sync.syncNow());
      body.querySelector('#sign-out').addEventListener('click', async () => {
        await Sync.signOut();
        showToast('Signed out. Progress stays on this device.');
      });
      return;
    }
    const other = st.lastEmail ? `<p class="small muted">Last synced here as <b>${esc(st.lastEmail)}</b>. Signing in with a different account replaces this device's progress with that account's.</p>` : '';
    body.innerHTML = `<p class="small muted">Sign in with your WorkLog account to keep progress, the look and your daily goal the same on every device. Knightly works fully without it.</p>${other}
      <form class="acct-form" autocomplete="on">
        <input class="field" type="email" name="email" placeholder="Email" autocomplete="username" required value="${esc(st.lastEmail || '')}">
        <input class="field" type="password" name="password" placeholder="Password" autocomplete="current-password" required>
        <button type="submit" class="btn sm">Sign in</button>
        ${err ? `<p class="status-line small bad">${esc(err)}</p>` : ''}
      </form>`;
    body.querySelector('form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      const btn = e.target.querySelector('button');
      btn.disabled = true; btn.textContent = 'Signing in…';
      busy = true;
      try {
        await Sync.signIn(String(f.get('email')).trim(), String(f.get('password')));
        busy = false;
        draw();
        showToast('Signed in. Syncing.');
      } catch (ex) {
        busy = false;
        draw(Sync.getStatus(), ex.message || 'Could not sign in');
      }
    });
  };

  draw();
  const off = Sync.onStatus((st) => {
    if (!card.isConnected) { off(); return; }
    const line = body.querySelector('#sync-status');
    if (st.signedIn && line) { const [text, tone] = statusText(st); line.textContent = text; line.className = `status-line small ${tone}`; }
    else if (!!line !== st.signedIn) draw(st);
  });
  return card;
}
