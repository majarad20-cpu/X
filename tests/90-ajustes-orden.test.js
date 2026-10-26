const { chromium, launchOptions } = require('./helpers');
const url = process.argv[2];
(async () => {
  const b = await chromium.launch(launchOptions);
  const errs = [];
  const check = (label, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); console.log(`${label}: ${JSON.stringify(got)}${ok ? ' ok' : ` ESPERADO ${JSON.stringify(want)}`}`); if (!ok) errs.push(label); };
  const c = await b.newContext({ viewport: { width: 1300, height: 860 } });
  await c.route(/fonts\.g/, (r) => r.abort());
  const p = await c.newPage();
  p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errs.push(m.text()));
  await p.goto(url); await p.waitForTimeout(800);
  await p.click('#open-settings'); await p.waitForTimeout(300);
  // Los ajustes van agrupados por tema, con todas las secciones de antes
  check('grupos', await p.evaluate(() => [...document.querySelectorAll('#view-settings > .set-group')].map((g) => [g.querySelector('.set-group-title').textContent, [...g.querySelectorAll(':scope > .section-title')].map((h) => h.textContent)])), [
    ['🎨 Apariencia', []],
    ['✅ Tareas y enfoque', ['Tareas hechas', 'Pomodoro']],
    ['📝 Notas', ['Notas diarias', 'Notas de voz', 'Notas en Google Drive', 'Obsidian: importar y exportar', 'Pasar diario, ideas y mapas a notas']],
    ['📅 Calendario y correo', ['Google Calendar', 'Resumen semanal por Gmail']],
    ['💾 Datos y copias', ['Copia de seguridad', 'Copia en Google Drive', 'Espacio']],
  ]);
  check('controles en su sitio', await p.evaluate(() => ['#appearance', '#set-archive-days', '#pomo-settings', '#gvault-on', '#vault-guide', '#cal-enabled', '#gweekly-on', '#backup-export', '#gdrive-now', '#storage-meter'].map((s) => document.querySelector(s)?.closest('.set-group')?.id)), ['set-g-apariencia', 'set-g-tareas', 'set-g-tareas', 'set-g-notas', 'set-g-notas', 'set-g-google', 'set-g-google', 'set-g-datos', 'set-g-datos', 'set-g-datos']);
  // El índice lleva a cada grupo y lo marca
  await p.click('[data-set-jump="set-g-datos"]'); await p.waitForTimeout(800);
  check('índice', await p.evaluate(() => {
    const g = document.getElementById('set-g-datos').getBoundingClientRect();
    const idx = document.querySelector('.set-index').getBoundingClientRect();
    return [document.querySelector('[data-set-jump].active')?.dataset.setJump, g.top >= idx.top && g.top < 400];
  }), ['set-g-datos', true]);
  console.log('errors:', JSON.stringify(errs));
  await b.close();
  process.exit(errs.length ? 1 : 0);
})();
