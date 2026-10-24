const { chromium, launchOptions } = require('./helpers');
const url = process.argv[2];
(async () => {
  const b = await chromium.launch(launchOptions);
  const c = await b.newContext({ viewport: { width: 1366, height: 768 } });
  const cards = [
    { id: 'g', type: 'group', label: 'Grupo', x: -40, y: -40, w: 760, h: 420 },
    { id: 't1', type: 'text', text: '# Uno\nCorto', x: 0, y: 0, w: 300, h: 180 },
    { id: 't2', type: 'text', text: 'Texto largo '.repeat(60), x: 0, y: 220, w: 300, h: 100 },
    { id: 't3', type: 'text', text: 'Lejos', x: 4000, y: 3000, w: 200, h: 100 },
  ];
  await c.addInitScript((s) => { if (!localStorage.getItem('enfoque:v1')) localStorage.setItem('enfoque:v1', JSON.stringify(s)); }, { tasks: [], habits: [], settings: { notesWelcome: true }, notes: [], canvases: [{ id: 'c1', title: 'Prueba', cards, edges: [{ id: 'e1', from: 't1', fromSide: 'bottom', to: 't2', toSide: 'top', label: 'sigue' }], createdAt: 1, updatedAt: 1 }], updatedAt: 1 });
  await c.route(/fonts\.g/, (r) => r.abort());
  const p = await c.newPage(); const errs = [];
  const check = (label, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); console.log(`${label}: ${JSON.stringify(got)}${ok ? ' ok' : ` ESPERADO ${JSON.stringify(want)}`}`); if (!ok) errs.push(label); };
  p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errs.push(m.text()));
  await p.goto(url); await p.waitForFunction(() => document.documentElement.dataset.ready);
  await p.evaluate(() => openCanvas('c1')); await p.waitForTimeout(400);
  // Alto: el lienzo llega hasta la barra de estado
  check('alto completo', await p.evaluate(() => { const v = document.getElementById('cv-viewport').getBoundingClientRect(); const s = document.querySelector('.statusbar').getBoundingClientRect(); return s.top - v.bottom >= 0 && s.top - v.bottom <= 14; }), true);
  check('barras flotantes', await p.evaluate(() => [...document.querySelectorAll('#cv-viewport .cv-float')].filter((x) => !x.hidden).length >= 2), true);
  check('botón + oculto', await p.evaluate(() => getComputedStyle(document.getElementById('capture-fab')).display), 'none');
  // Etiqueta de la flecha por encima de las tarjetas
  check('etiqueta', await p.evaluate(() => { const t = document.querySelector('#cv-world > .cv-edge-label'); return t && [t.textContent, getComputedStyle(t).zIndex]; }), ['sigue', '5']);
  // Texto que no cabe: «más ↓» y al tocarlo la tarjeta crece
  check('más', await p.evaluate(() => [...document.querySelectorAll('.cv-card.cv-overflow')].map((n) => n.dataset.id)), ['t2']);
  await p.click('.cv-card[data-id="t2"] .cv-more-tag'); await p.waitForTimeout(200);
  check('creció', await p.evaluate(() => [currentCanvas().cards.find((k) => k.id === 't2').h > 100, !document.querySelector('.cv-card[data-id="t2"]').classList.contains('cv-overflow')]), [true, true]);
  // Minimapa: con una tarjeta lejos se ve; tocarlo mueve la vista
  await p.evaluate(() => { cv.z = 1; cv.x = 0; cv.y = 0; applyView(); });
  check('minimapa visible', await p.isVisible('#cv-minimap'), true);
  const mm = await (await p.$('#cv-minimap')).boundingBox();
  const before = await p.evaluate(() => [cv.x, cv.y]);
  await p.mouse.click(mm.x + mm.width - 8, mm.y + mm.height - 8); await p.waitForTimeout(100);
  check('minimapa mueve', await p.evaluate((b) => cv.x < b[0] && cv.y < b[1], before), true);
  // Ver todo: el minimapa sobra
  await p.click('#cv-fit'); await p.waitForTimeout(100);
  check('minimapa oculto con todo a la vista', await p.isHidden('#cv-minimap'), true);
  // Acercar a una tarjeta (botón 🔍 y tecla Z)
  await p.click('.cv-card[data-id="t1"]'); await p.waitForTimeout(100);
  check('botón acercar', await p.isVisible('#cv-focus'), true);
  await p.click('#cv-focus'); await p.waitForTimeout(100);
  check('acercó', await p.evaluate(() => { const r = document.querySelector('.cv-card[data-id="t1"]').getBoundingClientRect(); const v = document.getElementById('cv-viewport').getBoundingClientRect(); return [cv.z > 1, r.left > v.left + 60, r.right < v.right]; }), [true, true, true]);
  // 100 %
  await p.click('#cv-zoom'); await p.waitForTimeout(100);
  check('100 %', await p.textContent('#cv-zoom'), '100 %');
  // Pantalla completa con F y salida con Esc
  await p.focus('#cv-viewport'); await p.evaluate(() => selectCard(null));
  await p.keyboard.press('f'); await p.waitForTimeout(150);
  check('pantalla completa', await p.evaluate(() => { const v = document.getElementById('cv-viewport').getBoundingClientRect(); return [document.documentElement.classList.contains('cv-full'), v.width > 1300, v.height > 650]; }), [true, true, true]);
  await p.keyboard.press('Escape'); await p.waitForTimeout(150);
  check('salió', await p.evaluate(() => document.documentElement.classList.contains('cv-full')), false);
  // Menú «⋯»: exportar y borrar (con deshacer)
  await p.click('#cv-more'); await p.waitForTimeout(80);
  check('menú', await p.$$eval('#note-menu .menu-item', (n) => n.map((x) => x.querySelector('span').textContent)), ['⤢ Ver todo', '⛶ Pantalla completa', '⤓ Exportar como .canvas (Obsidian)', 'Borrar lienzo']);
  await p.click('#note-menu .menu-item:has-text("Borrar lienzo")'); await p.waitForTimeout(150);
  check('borrado', await p.evaluate(() => [state.canvases.length, cv.id]), [0, null]);
  console.log('errors:', JSON.stringify(errs)); await b.close();
  process.exit(errs.length ? 1 : 0);
})();
