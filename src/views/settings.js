import { html, showToast } from '../util.js';
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

  grid.appendChild(html(`<section class="card pad"><div class="blk-h">Shortcuts</div>
    <div class="kv"><span>Undo a move vs computer</span><b>Ctrl + Z</b></div>
    <div class="kv"><span>Redo</span><b>Ctrl + Y</b></div>
    <div class="kv"><span>Draw an arrow or circle</span><b>Right-drag</b></div>
    <div class="kv"><span>Close a pop-up</span><b>Esc</b></div></section>`));

  const data = html(`<section class="card pad"><div class="blk-h">Progress</div>
    <p class="small muted">Resets solved puzzles, finished lessons, XP, your record and history. Settings stay.</p>
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
    await App.saveProgress(App.defaultProgress());
    resetBtn.textContent = 'Reset progress';
    App.refreshChrome();
    showToast('Progress reset');
  });
  platform.getVersion().then((v) => { data.querySelector('#ver').textContent = `Knightly v${v} · ${platform.hasMiniBoard ? 'desktop app' : 'web app'}`; });
  grid.appendChild(data);

  container.appendChild(grid);
}
