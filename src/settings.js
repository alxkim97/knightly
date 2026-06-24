function buildSwatchRow(items, currentKey, onPick) {
  const row = el('div', 'theme-swatch-row');
  items.forEach(([key, label, c1, c2]) => {
    const swatch = el('div', 'theme-swatch' + (currentKey === key ? ' active' : ''));
    const preview = el('div', 'theme-swatch-preview');
    preview.style.background = `linear-gradient(135deg, ${c1} 50%, ${c2} 50%)`;
    swatch.appendChild(preview);
    swatch.appendChild(el('span', null, label));
    swatch.addEventListener('click', () => {
      row.querySelectorAll('.theme-swatch').forEach((s) => s.classList.remove('active'));
      swatch.classList.add('active');
      onPick(key);
    });
    row.appendChild(swatch);
  });
  return row;
}

function buildToggleRow(label, checked, onChange) {
  const row = el('div', 'settings-row');
  row.appendChild(el('span', null, label));
  const wrapLabel = el('label', 'switch');
  const input = el('input');
  input.type = 'checkbox';
  input.checked = checked;
  wrapLabel.append(input, el('span', 'slider'));
  row.appendChild(wrapLabel);
  input.addEventListener('change', () => onChange(input.checked));
  return row;
}

const SHORTCUTS = [
  ['Ctrl + Z', 'Undo your last move (vs Computer)'],
  ['Ctrl + Y', 'Redo a move you undid (vs Computer)'],
];

function renderSettings(container) {
  container.innerHTML = '';
  container.appendChild(el('h1', null, 'Settings'));
  container.appendChild(el('p', 'sub', 'Appearance, sound, shortcuts, and your saved progress.'));

  const row = el('div', 'panel-row');

  const group = el('div', 'settings-group');
  group.appendChild(el('h2', null, 'Appearance'));
  group.appendChild(buildToggleRow('Dark theme', App.settings.theme !== 'light', (checked) => {
    App.settings.theme = checked ? 'dark' : 'light';
    App.applyTheme();
    App.saveSettings();
  }));
  group.appendChild(buildToggleRow('Sound effects', App.settings.sound !== false, (checked) => {
    App.settings.sound = checked;
    App.saveSettings();
    if (checked) Sound.play('move');
  }));
  row.appendChild(group);

  const previewGroup = el('div', 'settings-group');
  previewGroup.appendChild(el('h2', null, 'Preview'));
  const previewBoardWrap = el('div', 'settings-preview-board');
  previewGroup.appendChild(previewBoardWrap);
  const previewBoard = new ChessBoard(previewBoardWrap, { interactive: false });
  previewBoard.render(window.chessEngine.reset('settings-preview'));
  row.appendChild(previewGroup);

  const boardGroup = el('div', 'settings-group');
  boardGroup.appendChild(el('h2', null, 'Board Theme'));
  boardGroup.appendChild(buildSwatchRow([
    ['classic', 'Classic', '#f0d9b5', '#b58863'],
    ['emerald', 'Emerald', '#ebecd0', '#779556'],
    ['ocean', 'Ocean', '#dce8f5', '#4e7fab'],
    ['coral', 'Coral', '#fbe2dd', '#d9806c'],
    ['midnight', 'Midnight', '#4b4f63', '#2a2d3a'],
  ], App.settings.boardTheme, (key) => {
    App.settings.boardTheme = key;
    App.applyBoardTheme();
    App.saveSettings();
  }));
  row.appendChild(boardGroup);

  const pieceGroup = el('div', 'settings-group');
  pieceGroup.appendChild(el('h2', null, 'Piece Color'));
  pieceGroup.appendChild(buildSwatchRow([
    ['classic', 'Classic', '#fdfdfd', '#1a1a1a'],
    ['ivory', 'Ivory & Walnut', '#fff8ec', '#3b2412'],
    ['ocean', 'Ocean', '#eaf6ff', '#062b3f'],
    ['ruby', 'Ruby', '#fff0f0', '#3d0e14'],
    ['neon', 'Neon', '#eafffb', '#1a0a2e'],
  ], App.settings.pieceTheme, (key) => {
    App.settings.pieceTheme = key;
    App.applyPieceTheme();
    App.saveSettings();
  }));
  row.appendChild(pieceGroup);

  const miniGroup = el('div', 'settings-group');
  miniGroup.appendChild(el('h2', null, 'Pop-out Board'));
  miniGroup.appendChild(buildToggleRow('Always on top', App.settings.miniAlwaysOnTop !== false, (checked) => {
    App.settings.miniAlwaysOnTop = checked;
    App.saveSettings();
    knightlyAPI.setMiniAlwaysOnTop(checked);
  }));
  row.appendChild(miniGroup);

  const shortcutGroup = el('div', 'settings-group');
  shortcutGroup.appendChild(el('h2', null, 'Keyboard Shortcuts'));
  SHORTCUTS.forEach(([keys, desc]) => {
    const srow = el('div', 'settings-row');
    srow.appendChild(el('span', null, desc));
    srow.appendChild(el('span', 'shortcut-keys', keys));
    shortcutGroup.appendChild(srow);
  });
  row.appendChild(shortcutGroup);

  const dangerGroup = el('div', 'settings-group');
  dangerGroup.appendChild(el('h2', null, 'Progress'));
  const resetBtn = el('button', 'btn danger', 'Reset puzzle & lesson progress');
  resetBtn.addEventListener('click', async () => {
    await App.saveProgress({ puzzles: { solvedIds: [] }, lessons: { completedIds: [] } });
    showToast('Progress reset');
  });
  dangerGroup.appendChild(resetBtn);
  row.appendChild(dangerGroup);

  container.appendChild(row);

  knightlyAPI.getVersion().then((v) => {
    container.appendChild(el('p', 'sub', `Knightly v${v}`));
  });
}
