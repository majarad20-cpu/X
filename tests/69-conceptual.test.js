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
  // Todas las plantillas nuevas se dibujan con todos sus nodos dentro del lienzo
  const res = await p.evaluate(() => DIAGRAM_TEMPLATES.filter((t) => ['concept', 'flow', 'venn', 'cycle', 'funnel', 'radar'].includes(t.kind)).map((t) => {
    createFromTemplate(t);
    const m = currentMap();
    const ok = m.nodes.every((n) => { const q = mapLayout.pos[n.id]; return q && q.x >= 0 && q.y >= 0 && q.x + q.w <= mapLayout.width + 1 && q.y + q.h <= mapLayout.height + 1; });
    return `${t.label}:${ok ? 'ok' : 'MAL'}`;
  }));
  check('plantillas nuevas', res.filter((x) => !x.endsWith(':ok')), []);
  check('tipos nuevos en el selector', await p.$$eval('#map-kind option', (o) => ['concept', 'flow', 'venn', 'cycle', 'funnel', 'radar'].every((k) => o.some((x) => x.value === k))), true);
  // Mapa conceptual: conexión libre con palabra de enlace desde el menú
  await p.evaluate(() => createFromTemplate(DIAGRAM_TEMPLATES.find((t) => t.label === 'Mapa conceptual'))); await p.clock.runFor(80);
  const id = (t) => p.evaluate((x) => currentMap().nodes.find((n) => n.text === x).id, t);
  const ej = await id('Ejemplo');
  await p.click(`#map-nodes [data-id="${ej}"]`, { button: 'right' }); await p.clock.runFor(50);
  await p.click('#note-menu .menu-item:has-text("Conectar con otra idea")'); await p.clock.runFor(50);
  await p.click('#picker-list .pk-item:has-text("Idea C")'); await p.clock.runFor(50);
  await p.click('#picker-list .pk-item:has-text("produce")'); await p.clock.runFor(80);
  check('conexión creada', await p.evaluate(() => currentMap().links.map((l) => l.label)), ['produce']);
  check('etiqueta en pantalla', await p.$$eval('.mm-elabel', (n) => n.map((x) => x.textContent)).then((t) => t.includes('produce')), true);
  // Palabra de enlace en la línea con su idea madre
  const ia = await id('Idea A');
  await p.click(`#map-nodes [data-id="${ia}"]`, { button: 'right' }); await p.clock.runFor(50);
  await p.click('#note-menu .menu-item:has-text("Palabra de enlace")'); await p.clock.runFor(50);
  await p.click('#picker-list .pk-item:has-text("incluye")'); await p.clock.runFor(80);
  check('palabra en la línea', await p.evaluate((x) => currentMap().nodes.find((n) => n.id === x).edgeLabel, ia), 'incluye');
  // Deshacer quita la palabra; rehacer la vuelve a poner
  await p.focus('#map-canvas'); await p.keyboard.press('Control+z'); await p.clock.runFor(50);
  check('deshacer palabra', await p.evaluate((x) => currentMap().nodes.find((n) => n.id === x).edgeLabel || null, ia), null);
  await p.keyboard.press('Control+y'); await p.clock.runFor(50);
  // Conectar arrastrando el punto ➜
  await p.evaluate((x) => { selectedNode = x; renderMap(); }, ia); await p.clock.runFor(50);
  const h = await (await p.$(`#map-nodes [data-id="${ia}"] .mm-handle`)).boundingBox();
  const tgt = await (await p.$(`#map-nodes [data-id="${await id('Idea B')}"]`)).boundingBox();
  await p.mouse.move(h.x + h.width / 2, h.y + h.height / 2); await p.mouse.down();
  await p.mouse.move(tgt.x + 10, tgt.y + 10, { steps: 8 }); await p.mouse.up(); await p.clock.runFor(80);
  await p.keyboard.press('Escape');
  check('conexión arrastrando', await p.evaluate(() => currentMap().links.length), 2);
  // La línea de la conexión sigue a una idea movida
  const before = await p.evaluate(() => [...document.querySelectorAll('#map-edges path')].map((x) => x.getAttribute('d')).join('|'));
  await p.evaluate((x) => { currentMap().nodes.find((n) => n.id === x).dx = 160; renderMap(); }, ej);
  const after = await p.evaluate(() => [...document.querySelectorAll('#map-edges path')].map((x) => x.getAttribute('d')).join('|'));
  check('la conexión sigue a la idea', before !== after, true);
  // Forma
  await p.click(`#map-nodes [data-id="${ia}"]`, { button: 'right' }); await p.clock.runFor(50);
  await p.click('#note-menu .menu-item:has-text("Forma")'); await p.click('#picker-list .pk-item:has-text("Rombo")'); await p.clock.runFor(50);
  check('forma rombo', await p.evaluate((x) => [currentMap().nodes.find((n) => n.id === x).shape, document.querySelector(`#map-nodes [data-id="${x}"]`).classList.contains('shape-diamond')], ia), ['diamond', true]);
  // Borrar la conexión desde su etiqueta
  await p.click('.mm-elabel:has-text("produce")'); await p.click('#note-menu .menu-item:has-text("Borrar la conexión")'); await p.clock.runFor(50);
  check('conexión borrada', await p.evaluate(() => currentMap().links.length), 1);
  // Diagrama de flujo de la plantilla: formas y Sí / No
  await p.evaluate(() => createFromTemplate(DIAGRAM_TEMPLATES.find((t) => t.label === 'Diagrama de flujo'))); await p.clock.runFor(80);
  check('flujo', await p.evaluate(() => [currentMap().nodes.find((n) => n.text === '¿Está completa?').shape, [...document.querySelectorAll('.mm-elabel')].map((x) => x.textContent).sort()]), ['diamond', ['No', 'Sí']]);
  // Radar: puntuación desde el texto y desde el menú
  await p.evaluate(() => createFromTemplate(DIAGRAM_TEMPLATES.find((t) => t.label === 'Mis habilidades (radar)'))); await p.clock.runFor(80);
  check('puntuaciones del texto', await p.evaluate(() => childrenOf(currentMap(), 'root').map(dgScore)), [6, 7, 8, 5, 6]);
  const ax = await id('Técnica 5');
  await p.click(`#map-nodes [data-id="${ax}"]`, { button: 'right' }); await p.clock.runFor(50);
  await p.click('#note-menu .menu-item:has-text("Puntuación")'); await p.click('#picker-list .pk-item >> text="9"'); await p.clock.runFor(50);
  check('puntuación del menú', await p.evaluate((x) => { const n = currentMap().nodes.find((y) => y.id === x); return [n.score, n.text]; }, ax), [9, 'Técnica']);
  // Imagen: se dibuja sin errores con conexiones y formas
  check('exportar dibuja', await p.evaluate(() => { const cv = document.createElement('canvas'); const ctx = cv.getContext('2d'); const v = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim() || '#000'; diagramCanvas(ctx, mapLayout, v); ctx.beginPath(); dgShapePath(ctx, 'diamond', { x: 0, y: 0, w: 50, h: 30 }); dgShapePath(ctx, 'hex', { x: 0, y: 0, w: 50, h: 30 }); return true; }), true);
  console.log('errors:', errs); await b.close();
})();
