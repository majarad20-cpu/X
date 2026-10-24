const { chromium, launchOptions } = require('./helpers');
const url = process.argv[2];
(async () => {
  const b = await chromium.launch(launchOptions);
  const c = await b.newContext({ viewport: { width: 1200, height: 800 }, colorScheme: 'light' });
  await c.addInitScript(() => { if (!localStorage.getItem('enfoque:v1')) localStorage.setItem('enfoque:v1', JSON.stringify({ tasks: [], habits: [], settings: { notesWelcome: true, look: { theme: 'sage' } }, notes: [{ id: 'n', path: 'Nota', body: 'Hola', createdAt: 1, updatedAt: 1 }], updatedAt: 1 })); });
  await c.route(/fonts\.g/, (r) => r.abort());
  const p = await c.newPage(); const errs = [];
  const check = (label, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); console.log(`${label}: ${JSON.stringify(got)}${ok ? ' ok' : ` ESPERADO ${JSON.stringify(want)}`}`); if (!ok) errs.push(label); };
  p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errs.push(m.text()));
  await p.goto(url); await p.waitForFunction(() => document.documentElement.dataset.ready);
  const lum = (v) => p.evaluate((name) => { const c = toneColor(name); return Math.round(toneLum(c) * 1000); }, v);
  const base = { editor: await lum('--editor'), side: await lum('--side'), text: await lum('--text') };
  check('sin cambios por defecto', await p.evaluate(() => [look().dim, look().softText, document.documentElement.style.getPropertyValue('--editor')]), [0, 'off', '']);
  await p.evaluate(() => setLook({ dim: 70 }));
  const dim = { editor: await lum('--editor'), side: await lum('--side'), surface: await lum('--surface') };
  check('nota menos blanca', dim.editor < base.editor - 20, true);
  check('paneles más oscuros que la nota', dim.side < dim.editor, true);
  check('superficies resaltan (más claras que la nota)', dim.surface > dim.editor, true);
  check('no muy oscuro', dim.editor > 800, true);
  await p.evaluate(() => setLook({ softText: 'on' }));
  check('texto gris carbón', (await lum('--text')) > base.text, true);
  // Tema oscuro: no se toca
  await p.evaluate(() => setLook({ theme: 'dark' }));
  check('oscuro sin cambios', await p.evaluate(() => [document.documentElement.style.getPropertyValue('--editor'), document.documentElement.dataset.dimmed || '']), ['', '']);
  // Vuelve a claro y se reaplica
  await p.evaluate(() => setLook({ theme: 'sage' }));
  check('reaplicado', await p.evaluate(() => document.documentElement.dataset.dimmed), 'on');
  // Controles en Apariencia
  await p.evaluate(() => { showView('settings'); renderAppearance(); });
  check('controles', await p.evaluate(() => [!!document.querySelector('#appearance input[aria-label="Brillo del fondo"]'), [...document.querySelectorAll('#appearance .segmented[aria-label="Color del texto"] .seg')].map((x) => x.textContent)]), [true, ['Negro', 'Gris carbón']]);
  console.log('errors:', JSON.stringify(errs)); await b.close();
  process.exit(errs.length ? 1 : 0);
})();
