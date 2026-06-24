function renderSettings(container) {
  container.innerHTML = '';
  container.appendChild(el('h1', null, 'Settings'));
  container.appendChild(el('p', 'sub', 'Appearance, sound, and your saved progress.'));

  const group = el('div', 'settings-group');

  const themeRow = el('div', 'settings-row');
  themeRow.appendChild(el('span', null, 'Dark theme'));
  const themeLabel = el('label', 'switch');
  const themeInput = el('input');
  themeInput.type = 'checkbox';
  themeInput.checked = App.settings.theme !== 'light';
  themeLabel.append(themeInput, el('span', 'slider'));
  themeRow.appendChild(themeLabel);
  themeInput.addEventListener('change', () => {
    App.settings.theme = themeInput.checked ? 'dark' : 'light';
    App.applyTheme();
    App.saveSettings();
  });
  group.appendChild(themeRow);

  const soundRow = el('div', 'settings-row');
  soundRow.appendChild(el('span', null, 'Sound effects'));
  const soundLabel = el('label', 'switch');
  const soundInput = el('input');
  soundInput.type = 'checkbox';
  soundInput.checked = App.settings.sound !== false;
  soundLabel.append(soundInput, el('span', 'slider'));
  soundRow.appendChild(soundLabel);
  soundInput.addEventListener('change', () => {
    App.settings.sound = soundInput.checked;
    App.saveSettings();
    if (soundInput.checked) Sound.play('move');
  });
  group.appendChild(soundRow);

  container.appendChild(group);

  const boardGroup = el('div', 'settings-group');
  boardGroup.appendChild(el('h2', null, 'Board Theme'));
  const swatchRow = el('div', 'theme-swatch-row');
  const themes = [
    ['classic', 'Classic', '#f0d9b5', '#b58863'],
    ['emerald', 'Emerald', '#ebecd0', '#779556'],
    ['ocean', 'Ocean', '#dce8f5', '#4e7fab'],
    ['coral', 'Coral', '#fbe2dd', '#d9806c'],
    ['midnight', 'Midnight', '#4b4f63', '#2a2d3a'],
  ];
  themes.forEach(([key, label, light, dark]) => {
    const swatch = el('div', 'theme-swatch' + (App.settings.boardTheme === key ? ' active' : ''));
    const preview = el('div', 'theme-swatch-preview');
    preview.style.background = `linear-gradient(135deg, ${light} 50%, ${dark} 50%)`;
    swatch.appendChild(preview);
    swatch.appendChild(el('span', null, label));
    swatch.addEventListener('click', () => {
      App.settings.boardTheme = key;
      App.applyBoardTheme();
      App.saveSettings();
      swatchRow.querySelectorAll('.theme-swatch').forEach((s) => s.classList.remove('active'));
      swatch.classList.add('active');
    });
    swatchRow.appendChild(swatch);
  });
  boardGroup.appendChild(swatchRow);
  container.appendChild(boardGroup);

  const dangerGroup = el('div', 'settings-group');
  dangerGroup.appendChild(el('h2', null, 'Progress'));
  const resetBtn = el('button', 'btn danger', 'Reset puzzle & lesson progress');
  resetBtn.addEventListener('click', async () => {
    await App.saveProgress({ puzzles: { solvedIds: [] }, lessons: { completedIds: [] } });
    showToast('Progress reset');
  });
  dangerGroup.appendChild(resetBtn);
  container.appendChild(dangerGroup);

  knightlyAPI.getVersion().then((v) => {
    container.appendChild(el('p', 'sub', `Knightly v${v}`));
  });
}
