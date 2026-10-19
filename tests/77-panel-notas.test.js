const { chromium, launchOptions } = require('./helpers');
const url = process.argv[2];
const out = process.argv[3];
(async () => {
  const b = await chromium.launch(launchOptions);
  const errs = [];
  const check = (label, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); console.log(`${label}: ${JSON.stringify(got)}${ok ? ' ok' : ` ESPERADO ${JSON.stringify(want)}`}`); if (!ok) errs.push(label); };
  const c = await b.newContext({ viewport: { width: 1300, height: 900 } });
  await c.addInitScript(() => { if (!localStorage.getItem('enfoque:v1')) localStorage.setItem('enfoque:v1', JSON.stringify({ tasks: [], habits: [], settings: { notesWelcome: true }, notes: [{ id: 'n', path: 'ESTOICISMO/📋 CONSOLIDACIÓN ESTOICISMO - 2026-06-09 con un nombre muy largo', body: 'x', createdAt: 1, updatedAt: 1 }, { id: 'm', path: 'Corta', body: 'y', createdAt: 1, updatedAt: 1 }], updatedAt: 1 })); });
  await c.route(/fonts\.g/, (r) => r.abort());
  const p = await c.newPage();
  p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errs.push(m.text()));
  await p.goto(url); await p.waitForTimeout(800);
  await p.evaluate(() => { openNote(noteById('n')); });
  await p.waitForTimeout(200);
  // Tamaño real en pantalla del texto del panel y del menú (con el «zoom» del lado izquierdo)
  const sz = () => p.evaluate(() => [document.querySelector('.tree-row.file .tree-name'), document.querySelector('.ribbon .rib-label')].map((e) => Math.round(e.getBoundingClientRect().height)));
  const small = await sz();
  await p.evaluate(() => setLook({ sideSize: 'normal' }));
  const normal = await sz();
  await p.evaluate(() => setLook({ sideSize: 'xsmall' }));
  const xs = await sz();
  check('más pequeño por defecto', [small[0] < normal[0], small[1] < normal[1], xs[0] < small[0]], [true, true, true]);
  check('la rejilla sigue al menú', await p.evaluate(() => Math.round(document.querySelector('.ribbon').getBoundingClientRect().width) === Math.round(186 * 0.8)), true);
  await p.evaluate(() => setLook({ sideSize: 'small' }));
  const h1 = await p.evaluate(() => document.querySelector('.tree-row.file.active').getBoundingClientRect().height);
  await p.evaluate(() => setLook({ treeWrap: 'on' }));
  const h2 = await p.evaluate(() => document.querySelector('.tree-row.file.active').getBoundingClientRect().height);
  check('nombres completos en varias líneas', h2 > h1 * 1.5, true);
  await p.evaluate(() => { showView('settings'); renderAppearance(); });
  check('controles en Apariencia', await p.evaluate(() => [...document.querySelectorAll('#appearance .ap-label > span')].map((x) => x.textContent).filter((t) => /panel|lado izquierdo/.test(t))), ['Tamaño del lado izquierdo', 'Nombres largos en el panel']);
  if (out) { await p.evaluate(() => openNote(noteById('n'))); await p.waitForTimeout(200); await p.screenshot({ path: `${out}/77-panel.png`, clip: { x: 0, y: 0, width: 650, height: 420 } }); }
  console.log('errors:', JSON.stringify(errs));
  await b.close();
  process.exit(errs.length ? 1 : 0);
})();
