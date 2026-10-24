const { chromium, launchOptions } = require('./helpers');
const url = process.argv[2];
const out = process.argv[3];
(async () => {
  const b = await chromium.launch(launchOptions);
  const errs = [];
  const check = (label, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); console.log(`${label}: ${JSON.stringify(got)}${ok ? ' ok' : ` ESPERADO ${JSON.stringify(want)}`}`); if (!ok) errs.push(label); };
  const c = await b.newContext({ viewport: { width: 1358, height: 650 } });
  // Quien tenía «Iconos y nombres» guardado pasa a automático
  await c.addInitScript(() => { if (!localStorage.getItem('enfoque:v1')) localStorage.setItem('enfoque:v1', JSON.stringify({ tasks: [], habits: [], settings: { notesWelcome: true, look: { ribbonLabels: 'on', theme: 'obsdark' } }, notes: [{ id: 'n', path: 'Cerebro Digital X/00.- ATLAS/MATRIZ DE NOTAS/CONTABILIDAD', body: 'x', createdAt: 1, updatedAt: 1 }], updatedAt: 1 })); });
  await c.route(/fonts\.g/, (r) => r.abort());
  const p = await c.newPage();
  p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errs.push(m.text()));
  await p.goto(url); await p.waitForTimeout(800);
  await p.evaluate(() => openNote(noteById('n'))); await p.waitForTimeout(200);
  const geo = () => p.evaluate(() => { const r = document.querySelector('.ribbon').getBoundingClientRect(); const l = document.querySelector('.side.left').getBoundingClientRect(); const lbl = document.querySelector('.ribbon .rib-label'); return { rib: Math.round(r.width), left: Math.round(l.left), mode: document.documentElement.dataset.riblabels, label: getComputedStyle(lbl).display !== 'none' }; });
  check('migrado a automático', await p.evaluate(() => look().ribbonLabels), 'auto');
  const g1 = await geo();
  check('panel abierto: solo iconos', [g1.mode, g1.label, g1.rib < 60], ['peek', false, true]);
  if (out) await p.screenshot({ path: `${out}/82-iconos.png`, clip: { x: 0, y: 0, width: 700, height: 650 } });
  await p.mouse.move(20, 200); await p.waitForTimeout(100);
  const g2 = await geo();
  check('al pasar el ratón: nombres encima, sin mover el panel', [g2.label, g2.rib > 150, g2.left === g1.left], [true, true, true]);
  if (out) await p.screenshot({ path: `${out}/82-desplegada.png`, clip: { x: 0, y: 0, width: 700, height: 650 } });
  await p.mouse.move(900, 300); await p.waitForTimeout(100);
  check('al salir vuelve a iconos', (await geo()).label, false);
  // Panel cerrado: con nombres
  await p.evaluate(() => { panels.left = false; applyPanels ? applyPanels() : renderPanels(); }).catch(() => {});
  await p.waitForTimeout(100);
  const closed = await p.evaluate(() => document.getElementById('app').classList.contains('left-collapsed'));
  if (closed) {
    const g3 = await geo();
    check('panel cerrado: también solo iconos', [g3.mode, g3.label, g3.rib < 60], ['peek', false, true]);
    await p.mouse.move(20, 200); await p.waitForTimeout(100);
    check('panel cerrado: nombres al pasar el ratón', (await geo()).label, true);
    await p.mouse.move(900, 300); await p.waitForTimeout(100);
  }
  // Modo concentración: sin barra ni paneles; se sale con Esc, el botón o «Salir»
  await p.evaluate(() => { panels.left = true; applyPanels(); openNoteByLink('CONTABILIDAD'); }); await p.waitForTimeout(200);
  const noteW = () => p.evaluate(() => Math.round(document.getElementById('note-pane').getBoundingClientRect().width));
  const before = await noteW();
  await p.click('#note-zen'); await p.waitForTimeout(150);
  check('concentración', await p.evaluate(() => [document.documentElement.classList.contains('zen'), document.querySelector('.ribbon').getBoundingClientRect().width <= 1, getComputedStyle(document.querySelector('.zen-exit')).display]), [true, true, 'block']);
  check('nota más ancha', (await noteW()) > before + 300, true);
  await p.keyboard.press('Escape'); await p.waitForTimeout(100);
  check('Esc sale', await p.evaluate(() => document.documentElement.classList.contains('zen')), false);
  check('paneles como estaban', await p.evaluate(() => [panels.left, document.getElementById('app').classList.contains('left-collapsed')]), [true, false]);
  await p.keyboard.press('Control+Shift+F'); await p.waitForTimeout(100);
  check('atajo', await p.evaluate(() => document.documentElement.classList.contains('zen')), true);
  await p.click('.zen-exit'); await p.waitForTimeout(100);
  check('botón salir', await p.evaluate(() => document.documentElement.classList.contains('zen')), false);
  // Opción en Apariencia
  await p.evaluate(() => { showView('settings'); renderAppearance(); });
  check('opción en Apariencia', await p.evaluate(() => [...document.querySelectorAll('#appearance .segmented[aria-label="Barra de la izquierda"] .seg')].map((x) => x.textContent)), ['Automático', 'Iconos y nombres', 'Solo iconos']);
  console.log('errors:', JSON.stringify(errs));
  await b.close();
  process.exit(errs.length ? 1 : 0);
})();
