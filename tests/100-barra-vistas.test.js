const { chromium, launchOptions } = require('./helpers');
const url = process.argv[2];
const out = process.argv[3];
(async () => {
  const b = await chromium.launch(launchOptions);
  const errs = [];
  const check = (label, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); console.log(`${label}: ${JSON.stringify(got)}${ok ? ' ok' : ` ESPERADO ${JSON.stringify(want)}`}`); if (!ok) errs.push(label); };
  const c = await b.newContext({ viewport: { width: 1300, height: 900 } });
  await c.addInitScript(() => { if (!localStorage.getItem('enfoque:v1')) localStorage.setItem('enfoque:v1', JSON.stringify({ tasks: [], habits: [], settings: { notesWelcome: true, look: { ribbonLabels: 'on', ribAutoV1: true } }, notes: [{ id: 'n', path: 'Ley 18.045', body: '# Ley 18.045\n## Delitos\n- Art. 59\n- Art. 60\n\n---\n\n## Otra\n[[Mercado]]', createdAt: 1, updatedAt: 1 }, { id: 'm', path: 'Mercado', body: 'y', createdAt: 1, updatedAt: 1 }], updatedAt: 1 })); });
  await c.route(/fonts\.g/, (r) => r.abort());
  const p = await c.newPage();
  p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errs.push(m.text()));
  await p.goto(url); await p.waitForTimeout(800);
  const sections = () => p.evaluate(() => [...document.querySelectorAll('.ribbon .rib-group')].filter((g) => !g.hidden).map((g) => [g.querySelector('.rib-gname').textContent, g.querySelectorAll('.rib-gitems > .rib').length]));
  check('secciones de la barra', await sections(), [['Notas', 10], ['Vistas y gráficos', 9], ['Revisar y consultar', 4], ['Planificar', 6], ['Seguimiento', 4], ['Pensar', 2], ['Más', 3]]);
  check('la barra de arriba sigue igual', await p.evaluate(() => document.querySelectorAll('.prodbar .tb-menu .rib').length >= 16), true);
  // Cada vista abre y se marca en la barra
  for (const v of ['bases', 'revision', 'ideas', 'canvas', 'stoa', 'tasks']) {
    await p.click(`.ribbon .rib[data-view="${v}"]`); await p.waitForTimeout(120);
    check(`abre ${v}`, await p.evaluate((v) => [document.querySelector(`#view-${v}`)?.classList.contains('active'), document.querySelector(`.ribbon .rib[data-view="${v}"]`).classList.contains('active')], v), [true, true]);
  }
  await p.click('#rib-graph'); await p.waitForTimeout(200);
  check('grafo', await p.evaluate(() => activeTab().type), 'graph');
  // Sin nota abierta, las acciones de la nota avisan
  await p.click('#rib-present'); await p.waitForTimeout(150);
  check('aviso sin nota', await p.evaluate(() => document.body.innerText.includes('Abre una nota primero')), true);
  await p.evaluate(() => openNote(noteById('n'))); await p.waitForTimeout(150);
  await p.click('#rib-graph-local'); await p.waitForTimeout(200);
  check('grafo local', await p.evaluate(() => [panels.rpane, document.querySelector('#rp-graph').hidden]), ['graph', false]);
  const maps = await p.evaluate(() => state.maps.length);
  await p.evaluate(() => openNote(noteById('n'))); await p.click('#rib-note-map'); await p.waitForTimeout(200);
  check('mapa de la nota', await p.evaluate(() => state.maps.length), maps + 1);
  await p.evaluate(() => openNote(noteById('n'))); await p.click('#rib-lsearch'); await p.waitForTimeout(100);
  check('buscar en notas', await p.evaluate(() => [panels.lpane, document.activeElement.id]), ['search', 'note-search']);
  await p.click('#rib-tags'); await p.waitForTimeout(100);
  check('etiquetas', await p.evaluate(() => panels.lpane), 'tags');
  // Plegar una sección también con solo iconos
  await p.evaluate(() => setLook({ ribbonLabels: 'off' })); await p.waitForTimeout(100);
  await p.click('.ribbon [data-group="rib-seguir"] .rib-ghead'); await p.waitForTimeout(100);
  check('plegada con iconos', await p.evaluate(() => [...document.querySelectorAll('.ribbon [data-group="rib-seguir"] .rib')].filter((r) => r.offsetParent).length), 0);
  if (out) await p.screenshot({ path: `${out}/100-barra-iconos.png`, clip: { x: 0, y: 0, width: 300, height: 900 } });
  await p.click('.ribbon [data-group="rib-seguir"] .rib-ghead'); await p.waitForTimeout(100);
  check('desplegada', await p.evaluate(() => [...document.querySelectorAll('.ribbon [data-group="rib-seguir"] .rib')].filter((r) => r.offsetParent).length), 4);
  if (out) { await p.evaluate(() => setLook({ ribbonLabels: 'on' })); await p.waitForTimeout(150); await p.screenshot({ path: `${out}/100-barra-nombres.png`, clip: { x: 0, y: 0, width: 520, height: 900 } }); }
  console.log('errors:', JSON.stringify(errs));
  await b.close();
  process.exit(errs.length ? 1 : 0);
})();
