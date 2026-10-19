const { chromium, launchOptions } = require('./helpers');
const url = process.argv[2];
const out = process.argv[3];
const now = new Date('2026-10-19T10:00:00').getTime();
(async () => {
  const b = await chromium.launch(launchOptions);
  const errs = [];
  const check = (label, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); console.log(`${label}: ${JSON.stringify(got)}${ok ? ' ok' : ` ESPERADO ${JSON.stringify(want)}`}`); if (!ok) errs.push(label); };
  const c = await b.newContext({ viewport: { width: 1300, height: 900 } });
  await c.addInitScript(() => { if (!localStorage.getItem('enfoque:v1')) localStorage.setItem('enfoque:v1', JSON.stringify({ tasks: [], habits: [], settings: { notesWelcome: true }, notes: [{ id: 'n', path: 'Prueba', body: '# Título\n## Sección\n### Sub\n\nTexto con ==resaltado== y #estoicismo\n\n- uno\n  - dos\n    - tres\n\n> [!tip] Consejo\n> Hola\n', createdAt: 1, updatedAt: 1 }], updatedAt: 1 })); });
  await c.route(/fonts\.g/, (r) => r.abort());
  const p = await c.newPage();
  p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errs.push(m.text()));
  await p.clock.install({ time: new Date(now) });
  await p.goto(url); await p.clock.runFor(800);
  await p.evaluate(() => { showView('settings'); renderAppearance(); });
  check('grupo Estilo Obsidian', await p.evaluate(() => { const g = [...document.querySelectorAll('.ap-theme-group')].find((x) => x.querySelector('h4').textContent === 'Estilo Obsidian'); return g && g.querySelectorAll('.ap-theme').length; }), 12);
  check('detalles en ajustes', await p.evaluate(() => [...document.querySelectorAll('#appearance .ap-label > span')].map((x) => x.textContent).filter((t) => Object.values(OBS_DETAILS).some(([l]) => l === t)).length), 5);
  // Tema oscuro: colores y tono
  await p.evaluate(() => chooseTheme('mocha'));
  const css = (v) => p.evaluate((v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim(), v);
  check('Catppuccin Mocha', [await css('--bg'), await p.evaluate(() => document.documentElement.dataset.tone), await p.evaluate(() => getComputedStyle(document.body).backgroundColor)], ['#1e1e2e', 'dark', 'rgb(30, 30, 46)']);
  // Estilo rápido «Obsidian»: tema y detalles
  await p.click('#appearance .ap-presets .chip:text-is("Obsidian")'); await p.clock.runFor(50);
  check('preset Obsidian', await p.evaluate(() => [look().theme, ...Object.keys(OBS_DETAILS).map((k) => document.documentElement.dataset[k])]), ['obsdark', 'on', 'on', 'on', 'on', 'on']);
  await p.evaluate(() => openNote(noteById('n'))); await p.clock.runFor(100);
  await p.evaluate(() => { const b = document.querySelector('#note-mode-read, [data-mode="read"]'); b?.click(); });
  await p.clock.runFor(100);
  const st = await p.evaluate(() => {
    const md = [...document.querySelectorAll('.md')].find((x) => x.querySelector('h1'));
    if (!md) return null;
    const cs = (sel, prop) => getComputedStyle(md.querySelector(sel))[prop];
    return [cs('h1', 'color') !== cs('p', 'color'), cs('h2', 'color') !== cs('h1', 'color'), cs('mark', 'backgroundColor'), cs('.tag-link', 'borderRadius'), cs('li > ul', 'borderLeftStyle'), cs('.callout', 'borderLeftWidth')];
  });
  check('detalles aplicados', st, [true, true, 'rgba(255, 208, 0, 0.4)', '999px', 'solid', '0px']);
  if (out) await p.screenshot({ path: `${out}/76-obsidian.png` });
  // Color propio sustituye el acento del tema
  await p.evaluate(() => setLook({ customAccent: '#ff0000' }));
  check('color propio', await css('--accent'), '#ff0000');
  console.log('errors:', JSON.stringify(errs));
  await b.close();
  process.exit(errs.length ? 1 : 0);
})();
