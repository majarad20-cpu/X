const { chromium, launchOptions } = require('./helpers');
const url = process.argv[2];
const now = new Date('2026-10-11T10:00:00').getTime();
(async () => {
  const b = await chromium.launch(launchOptions);
  const errs = [];
  const check = (label, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); console.log(`${label}: ${JSON.stringify(got)}${ok ? ' ok' : ` ESPERADO ${JSON.stringify(want)}`}`); if (!ok) errs.push(label); };
  const c = await b.newContext({ viewport: { width: 1300, height: 900 } });
  await c.addInitScript(() => { if (!localStorage.getItem('enfoque:v1')) localStorage.setItem('enfoque:v1', JSON.stringify({ tasks: [], habits: [], settings: { notesWelcome: true }, notes: [], maps: [], updatedAt: 1 })); });
  await c.route(/fonts\.g/, (r) => r.abort());
  const p = await c.newPage();
  p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errs.push(m.text()));
  await p.clock.install({ time: new Date(now) });
  await p.goto(url); await p.clock.runFor(800);
  await p.evaluate(() => { showView('ideas'); ideaView = 'maps'; renderIdeas(); }); await p.clock.runFor(50);
  // Crear con tipo
  await p.fill('#map-title', 'Por qué llego tarde');
  await p.selectOption('#map-kind', 'fishbone');
  await p.press('#map-title', 'Enter'); await p.clock.runFor(100);
  check('creado como espina de pescado', await p.evaluate(() => [currentMap().kind, document.getElementById('mm-kind').textContent]), ['fishbone', '🐟 Espina de pescado ▾']);
  // Cada plantilla se dibuja con todos sus nodos y sin solaparse con el tema central
  const res = await p.evaluate(() => DIAGRAM_TEMPLATES.map((t) => {
    createFromTemplate(t);
    const m = currentMap();
    const pos = mapLayout.pos;
    const all = m.nodes.every((n) => pos[n.id] && pos[n.id].x >= 0 && pos[n.id].y >= 0 && pos[n.id].x + pos[n.id].w <= mapLayout.width && pos[n.id].y + pos[n.id].h <= mapLayout.height);
    const r = pos.root;
    const overlap = m.nodes.filter((n) => n.parent).some((n) => { const q = pos[n.id]; return q.x < r.x + r.w && q.x + q.w > r.x && q.y < r.y + r.h && q.y + q.h > r.y; });
    return `${t.label}:${m.kind || 'mindmap'}:${all && !overlap ? 'ok' : 'MAL'}`;
  }));
  check('plantillas', res.filter((x) => !x.endsWith(':ok')), []);
  check('cantidad de plantillas', res.length >= 15, true);
  // Cambiar el tipo desde el menú conserva los nodos
  const before = await p.evaluate(() => currentMap().nodes.length);
  await p.click('#mm-kind'); await p.click('#note-menu .menu-item:has-text("Organigrama")'); await p.clock.runFor(80);
  check('cambiar a organigrama', await p.evaluate((n) => [currentMap().kind, currentMap().nodes.length === n, !!document.querySelector('#map-edges g path')], before), ['org', true, true]);
  // Estilo de líneas
  await p.click('#mm-kind'); await p.click('#note-menu .menu-item:has-text("Líneas rectas")'); await p.clock.runFor(50);
  check('líneas rectas', await p.evaluate(() => currentMap().edge), 'straight');
  await p.click('#mm-kind'); await p.click('#note-menu .menu-item:has-text("Mapa mental")'); await p.clock.runFor(50);
  check('mapa mental con líneas rectas', await p.evaluate(() => [currentMap().kind, [...document.querySelectorAll('#map-edges path')].every((x) => /^M[\d.]+,[\d.]+ L[\d.]+,[\d.]+$/.test(x.getAttribute('d')))]), [undefined, true]);
  // Matriz: columnas
  await p.evaluate(() => createFromTemplate(DIAGRAM_TEMPLATES.find((t) => t.kind === 'matrix'))); await p.clock.runFor(50);
  await p.click('#mm-kind'); await p.click('#note-menu .menu-item:has-text("1 columna")'); await p.clock.runFor(50);
  check('matriz en 1 columna', await p.evaluate(() => { const ids = childrenOf(currentMap(), 'root').map((n) => mapLayout.pos[n.id].x); return ids.every((x) => x === ids[0]); }), true);
  // La imagen se dibuja con los trazos del diagrama
  check('dibujar en lienzo', await p.evaluate(() => { const cv = document.createElement('canvas'); cv.width = 400; cv.height = 300; const v = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim() || '#000'; diagramCanvas(cv.getContext('2d'), mapLayout, v); return true; }), true);
  // Plantilla desde el botón
  await p.click('#map-back'); await p.click('#map-templates'); await p.clock.runFor(50);
  await p.click('#picker-list .pk-item:has-text("Pirámide de Maslow")'); await p.clock.runFor(80);
  check('desde el botón', await p.evaluate(() => [currentMap().kind, childrenOf(currentMap(), 'root').length]), ['pyramid', 5]);
  console.log('errors:', errs); await b.close();
})();
